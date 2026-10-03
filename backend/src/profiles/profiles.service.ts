import { randomUUID } from 'node:crypto';
import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  NotificationType,
  PlatformRole,
  Prisma,
  ProfileReviewStatus,
} from '../../generated/prisma/client';
import { AssetsService } from '../assets/assets.service';
import type { AuthenticatedUser } from '../auth/auth.types';
import { PrismaService } from '../database/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { ResearchProfileSyncService } from '../research/research-profile-sync.service';
import {
  reviewBadRequest,
  reviewConflict,
  type ReviewIssue,
} from '../common/review-problem';
import { SettingsService } from '../settings/settings.service';
import type {
  BulkReviewProfileEditsDto,
  ReviewProfileEditDto,
  SubmitProfileEditDto,
} from './dto/profile.dto';
import {
  type ProfileReviewQueryDto,
  ProfileReviewSort,
} from './dto/profile-review-query.dto';
import {
  parseProfilePayload,
  profilePayloadToJson,
  type ProfileEditScope,
} from './profile-payload';

const PROFILE_INCLUDE = {
  avatar: true,
  links: { orderBy: { sortOrder: 'asc' as const } },
  profileSections: {
    orderBy: { sortOrder: 'asc' as const },
    include: {
      subsections: {
        orderBy: { sortOrder: 'asc' as const },
        include: { entries: { orderBy: { sortOrder: 'asc' as const } } },
      },
    },
  },
} as const;

@Injectable()
export class ProfilesService {
  constructor(
    private readonly assets: AssetsService,
    private readonly notifications: NotificationsService,
    private readonly prisma: PrismaService,
    private readonly profileSync: ResearchProfileSyncService,
    private readonly settings: SettingsService,
  ) {}

  async mine(user: AuthenticatedUser) {
    if (!user.person) throw new NotFoundException('Profile not found');
    return this.fetchProfileByPersonId(user.person.id);
  }

  async submit(
    dto: SubmitProfileEditDto,
    user: AuthenticatedUser,
    avatar?: Express.Multer.File,
  ) {
    if (!user.person) throw new NotFoundException('Profile not found');
    return this.submitProfile(user.person.id, dto, user, avatar);
  }

  async getUserProfile(userId: string) {
    const person = await this.prisma.person.findFirst({ where: { userId } });
    if (!person) throw new NotFoundException('Profile not found');
    return this.fetchProfileByPersonId(person.id);
  }

  async adminSubmit(
    userId: string,
    dto: SubmitProfileEditDto,
    actor: AuthenticatedUser,
    avatar?: Express.Multer.File,
  ) {
    const person = await this.prisma.person.findFirst({
      where: { userId },
      include: { user: { select: { role: true } } },
    });
    if (!person) throw new NotFoundException('Profile not found');
    const scope = profileEditScope(person.user?.role);
    return this.publishProfile(person.id, dto, actor, avatar, {
      scope,
    });
  }

  private async fetchProfileByPersonId(personId: string) {
    const person = await this.prisma.person.findUnique({
      where: { id: personId },
      include: {
        ...PROFILE_INCLUDE,
        profileEditRequest: { include: { avatarAsset: true } },
        user: { select: { email: true, role: true } },
      },
    });
    if (!person) throw new NotFoundException('Profile not found');
    const { profileEditRequest, user, ...profile } = person;
    return {
      accountRole: user?.role ?? PlatformRole.MEMBER,
      profile: { ...profile, email: user?.email ?? null },
      draft: profileEditRequest,
    };
  }

  private async submitProfile(
    personId: string,
    dto: SubmitProfileEditDto,
    user: AuthenticatedUser,
    avatar?: Express.Multer.File,
  ) {
    const person = await this.prisma.person.findUnique({
      where: { id: personId },
      include: { profileEditRequest: true },
    });
    if (!person) throw new NotFoundException('Profile not found');

    const scope = profileEditScope(user.role);
    const removeAvatar = dto.removeAvatar === 'true';
    const payload = parseProfilePayload(dto.profile, removeAvatar, { scope });

    const verification = await this.settings.verification();
    const publishNow = dto.publishNow === 'true';
    if (publishNow && user.role !== PlatformRole.ADMIN) {
      throw new BadRequestException('Only administrators can override review');
    }
    if (publishNow && !dto.overrideReason?.trim()) {
      throw new BadRequestException('A publish-now override requires a reason');
    }

    if (
      user.role === PlatformRole.ADMIN ||
      verification.profileEdit === 'AUTOMATIC' ||
      publishNow
    ) {
      return this.publishProfile(personId, dto, user, avatar, {
        scope,
        skipAuth: !publishNow,
      });
    }

    const uploaded = avatar
      ? await this.assets.storeAvatar(avatar, user.id)
      : null;
    const oldDraftAvatarId = person.profileEditRequest?.avatarAssetId ?? null;
    const avatarAssetId = uploaded
      ? uploaded.id
      : removeAvatar
        ? null
        : oldDraftAvatarId;

    let request;
    try {
      request = await this.prisma.profileEditRequest.upsert({
        where: { personId: person.id },
        create: {
          avatarAssetId,
          payload: profilePayloadToJson(payload),
          personId: person.id,
        },
        update: {
          avatarAssetId,
          note: null,
          payload: profilePayloadToJson(payload),
          revision: { increment: 1 },
          reviewedAt: null,
          reviewedById: null,
          status: ProfileReviewStatus.NEEDS_REVIEW,
          submittedAt: new Date(),
        },
        include: { avatarAsset: true },
      });
    } catch (error) {
      if (uploaded) await this.assets.remove(uploaded.id);
      throw error;
    }

    if (
      oldDraftAvatarId &&
      oldDraftAvatarId !== avatarAssetId &&
      oldDraftAvatarId !== person.avatarId
    ) {
      await this.assets.remove(oldDraftAvatarId);
    }
    await this.notifications.notifyReviewers({
      type: NotificationType.PROFILE_SUBMITTED,
      title: person.profileEditRequest
        ? 'Profile edit updated'
        : 'Profile edit needs review',
      body: `${person.fullName} submitted updated profile information.`,
      actionUrl: `/workspace/profile-reviews/${request.id}`,
      payload: { profileEditRequestId: request.id },
    });
    return { ...request, outcome: 'QUEUED_FOR_REVIEW' as const };
  }

  private async publishProfile(
    personId: string,
    dto: SubmitProfileEditDto,
    actor: AuthenticatedUser,
    avatar?: Express.Multer.File,
    opts?: { scope?: ProfileEditScope; skipAuth?: boolean },
  ) {
    const isAdminOverride = !opts?.skipAuth;

    const person = await this.prisma.person.findUnique({
      where: { id: personId },
      include: { profileEditRequest: true },
    });
    if (!person) throw new NotFoundException('Profile not found');

    const scope = opts?.scope ?? profileEditScope(actor.role);
    const removeAvatar = dto.removeAvatar === 'true';
    const payload = parseProfilePayload(dto.profile, removeAvatar, {
      adminFields: isAdminOverride && scope === 'RESEARCH',
      scope,
    });

    const uploaded = avatar
      ? await this.assets.storeAvatar(avatar, actor.id)
      : null;
    const oldDraftAvatarId = person.profileEditRequest?.avatarAssetId ?? null;
    const avatarAssetId = uploaded
      ? uploaded.id
      : removeAvatar
        ? null
        : oldDraftAvatarId;

    const publishedAvatarId = avatarAssetId
      ? avatarAssetId
      : removeAvatar
        ? null
        : person.avatarId;

    try {
      await this.prisma.$transaction(async (transaction) => {
        await transaction.person.update({
          where: { id: person.id },
          data: profileUpdateData(payload, publishedAvatarId, scope),
        });
        await transaction.profileEditRequest.deleteMany({
          where: { personId: person.id },
        });
        await transaction.auditRecord.create({
          data: {
            action: isAdminOverride
              ? 'profile.edit-published-admin-override'
              : 'profile.edit-published-directly',
            actorId: actor.id,
            entityId: person.id,
            entityType: 'Person',
          },
        });
      });
    } catch (error) {
      if (uploaded) await this.assets.remove(uploaded.id);
      throw error;
    }

    for (const assetId of new Set([person.avatarId, oldDraftAvatarId])) {
      if (assetId && assetId !== publishedAvatarId) {
        await this.assets.remove(assetId);
      }
    }
    return { outcome: 'APPLIED' as const, direct: true };
  }

  async reviewQueue(query: ProfileReviewQueryDto) {
    const search = query.search?.trim();
    const where: Prisma.ProfileEditRequestWhereInput = {
      status: ProfileReviewStatus.NEEDS_REVIEW,
      ...(search
        ? {
            OR: [
              {
                person: {
                  fullName: { contains: search, mode: 'insensitive' },
                },
              },
            ],
          }
        : {}),
    };
    const orderBy: Prisma.ProfileEditRequestOrderByWithRelationInput =
      query.sort === ProfileReviewSort.NAME
        ? { person: { fullName: 'asc' } }
        : {
            submittedAt:
              query.sort === ProfileReviewSort.NEWEST ? 'desc' : 'asc',
          };
    const [items, total] = await Promise.all([
      this.prisma.profileEditRequest.findMany({
        where,
        include: {
          avatarAsset: true,
          person: {
            include: {
              ...PROFILE_INCLUDE,
              user: { select: { role: true } },
            },
          },
        },
        orderBy,
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.prisma.profileEditRequest.count({ where }),
    ]);
    return {
      items: items.map((request) => profileReviewView(request)),
      page: query.page,
      pageSize: query.pageSize,
      total,
      totalPages: Math.ceil(total / query.pageSize),
    };
  }

  async reviewRequest(id: string) {
    const request = await this.prisma.profileEditRequest.findUnique({
      where: { id },
      include: {
        avatarAsset: true,
        person: {
          include: {
            ...PROFILE_INCLUDE,
            user: { select: { role: true } },
          },
        },
      },
    });
    if (!request) throw new NotFoundException('Profile edit not found');
    return profileReviewView(request);
  }

  async bulkReview(
    dto: BulkReviewProfileEditsDto,
    reviewer: AuthenticatedUser,
  ) {
    if (
      dto.status !== ProfileReviewStatus.APPROVED &&
      dto.status !== ProfileReviewStatus.REJECTED
    ) {
      throw new BadRequestException('Decision must be APPROVED or REJECTED');
    }
    const ids = dto.items.map(({ id }) => id);
    if (new Set(ids).size !== ids.length) {
      throw new BadRequestException(
        'Duplicate profile review IDs are not allowed',
      );
    }
    const reviewNote =
      dto.status === ProfileReviewStatus.REJECTED
        ? dto.note?.trim()
        : undefined;
    if (dto.status === ProfileReviewStatus.REJECTED && !reviewNote) {
      throw new BadRequestException('A reviewer note is required');
    }

    const requests = await this.prisma.profileEditRequest.findMany({
      where: { id: { in: ids } },
      include: {
        person: {
          select: {
            avatarId: true,
            biography: true,
            contactAddress: true,
            expertise: true,
            fullName: true,
            headline: true,
            id: true,
            phone: true,
            roleTitle: true,
            user: { select: { id: true, role: true } },
            userId: true,
          },
        },
      },
    });
    if (requests.length !== ids.length) {
      throw new NotFoundException('One or more profile edits were not found');
    }
    const selfReviewRequests = requests.filter(
      (request) => request.person.userId === reviewer.id,
    );
    if (selfReviewRequests.length) {
      throw reviewBadRequest(
        'You cannot review your own profile edit.',
        selfReviewRequests.map((request) => ({
          code: 'PROFILE_SELF_REVIEW',
          itemId: request.id,
          message: 'You cannot review your own profile edit.',
          tone: 'error' as const,
        })),
      );
    }
    const expectedRevision = new Map(
      dto.items.map(({ id, revision }) => [id, revision]),
    );
    const changedRequests = requests.filter(
      (request) =>
        request.status !== ProfileReviewStatus.NEEDS_REVIEW ||
        request.revision !== expectedRevision.get(request.id),
    );
    if (changedRequests.length) {
      throw reviewConflict(
        'Some selected profiles changed after selection. Reload the queue before reviewing them.',
        changedRequests.map((request) => ({
          code: 'PROFILE_REVIEW_CHANGED',
          itemId: request.id,
          message: 'This profile review changed after it was selected.',
          tone: 'warning',
        })),
      );
    }

    const payloadIssues =
      dto.status === ProfileReviewStatus.APPROVED
        ? requests.flatMap((request) => profilePayloadIssues(request))
        : [];
    if (payloadIssues.length) {
      throw reviewBadRequest(
        'Some selected profiles contain submitted data that needs attention before approval.',
        payloadIssues,
      );
    }

    const approved =
      dto.status === ProfileReviewStatus.APPROVED
        ? requests.map((request) => {
            const scope = profileEditScope(
              request.person.user?.role ?? PlatformRole.MEMBER,
            );
            const payload = parseProfilePayload(request.payload, false, {
              scope,
            });
            const approvedAvatarId = request.avatarAssetId
              ? request.avatarAssetId
              : payload.removeAvatar
                ? null
                : request.person.avatarId;
            const current = request.person;
            return {
              approvedAvatarId,
              oldAvatarId: current.avatarId,
              payload,
              request,
              scope,
              target: {
                avatarId: approvedAvatarId,
                biography:
                  scope === 'RESEARCH' ? payload.biography : current.biography,
                contactAddress: payload.contactAddress,
                expertise:
                  scope === 'RESEARCH' ? payload.expertise : current.expertise,
                fullName: payload.fullName,
                headline:
                  scope === 'RESEARCH' ? payload.headline : current.headline,
                phone: payload.phone,
                roleTitle:
                  payload.roleTitle !== undefined
                    ? payload.roleTitle
                    : current.roleTitle,
              },
            };
          })
        : [];

    const reviewedAt = new Date();
    await this.prisma.$transaction(async (transaction) => {
      const claimRows = dto.items.map(
        ({ id, revision }) => Prisma.sql`(${id}::uuid, ${revision}::integer)`,
      );
      const claimed = await transaction.$queryRaw<Array<{ id: string }>>(
        Prisma.sql`
          UPDATE "ProfileEditRequest" AS request
          SET
            "note" = ${reviewNote ?? null},
            "reviewedAt" = ${reviewedAt},
            "reviewedById" = ${reviewer.id}::uuid,
            "status" = ${dto.status}::"ProfileReviewStatus"
          FROM (VALUES ${Prisma.join(claimRows)}) AS selected(id, revision)
          WHERE request."id" = selected.id
            AND request."revision" = selected.revision
            AND request."status" = 'NEEDS_REVIEW'::"ProfileReviewStatus"
          RETURNING request."id"
        `,
      );
      if (claimed.length !== requests.length) {
        const claimedIds = new Set(claimed.map(({ id }) => id));
        throw reviewConflict(
          'Some selected profiles changed while the review was being saved. Reload the queue and retry.',
          requests
            .filter(({ id }) => !claimedIds.has(id))
            .map(({ id }) => ({
              code: 'PROFILE_REVIEW_CHANGED',
              itemId: id,
              message:
                'This profile review changed while the decision was being saved.',
              tone: 'warning',
            })),
        );
      }

      if (dto.status === ProfileReviewStatus.APPROVED) {
        const personRows = approved.map(
          ({ request, target }) =>
            Prisma.sql`(
            ${request.personId}::uuid,
            ${target.avatarId}::uuid,
            ${target.biography},
            ${target.contactAddress},
            ${sqlTextArray(target.expertise)},
            ${target.fullName},
            ${target.headline},
            ${target.phone},
            ${target.roleTitle}
          )`,
        );
        await transaction.$executeRaw(
          Prisma.sql`
            UPDATE "Person" AS person
            SET
              "avatarId" = selected.avatar_id,
              "biography" = selected.biography,
              "contactAddress" = selected.contact_address,
              "expertise" = selected.expertise,
              "fullName" = selected.full_name,
              "headline" = selected.headline,
              "isPublished" = true,
              "phone" = selected.phone,
              "roleTitle" = selected.role_title,
              "updatedAt" = NOW()
            FROM (VALUES ${Prisma.join(personRows)}) AS selected(
              person_id,
              avatar_id,
              biography,
              contact_address,
              expertise,
              full_name,
              headline,
              phone,
              role_title
            )
            WHERE person."id" = selected.person_id
          `,
        );

        const researchProfiles = approved.filter(
          ({ scope }) => scope === 'RESEARCH',
        );
        const researchPersonIds = researchProfiles.map(
          ({ request }) => request.personId,
        );
        if (researchPersonIds.length) {
          await transaction.personLink.deleteMany({
            where: { personId: { in: researchPersonIds } },
          });
          await transaction.personProfileSection.deleteMany({
            where: { personId: { in: researchPersonIds } },
          });

          const links = researchProfiles.flatMap(({ payload, request }) =>
            payload.links.map((link, sortOrder) => ({
              ...link,
              personId: request.personId,
              sortOrder,
            })),
          );
          if (links.length) {
            await transaction.personLink.createMany({ data: links });
          }

          const sections = researchProfiles.flatMap(({ payload, request }) =>
            payload.sections.map((section, sortOrder) => ({
              id: randomUUID(),
              personId: request.personId,
              sortOrder,
              title: section.title,
              type: section.type,
              subsections: section.subsections,
            })),
          );
          if (sections.length) {
            await transaction.personProfileSection.createMany({
              data: sections.map(
                // eslint-disable-next-line @typescript-eslint/no-unused-vars
                ({ subsections: _subsections, ...section }) => section,
              ),
            });
            const subsections = sections.flatMap((section) =>
              section.subsections.map((subsection, sortOrder) => ({
                id: randomUUID(),
                heading: subsection.heading,
                entries: subsection.entries,
                sectionId: section.id,
                sortOrder,
              })),
            );
            if (subsections.length) {
              await transaction.personProfileSubsection.createMany({
                data: subsections.map(
                  // eslint-disable-next-line @typescript-eslint/no-unused-vars
                  ({ entries: _entries, ...subsection }) => subsection,
                ),
              });
              const entries = subsections.flatMap((subsection) =>
                subsection.entries.map((entry, sortOrder) => ({
                  ...entry,
                  id: randomUUID(),
                  subsectionId: subsection.id,
                  sortOrder,
                })),
              );
              if (entries.length) {
                await transaction.personProfileEntry.createMany({
                  data: entries,
                });
              }
            }
          }
        }
      }

      if (dto.status === ProfileReviewStatus.APPROVED) {
        await this.profileSync.normalizePublishedOutputsForPeople(
          approved.map(({ request }) => request.personId),
          reviewer.id,
          transaction,
        );
      }

      await transaction.auditRecord.createMany({
        data: requests.map((request) => ({
          action:
            dto.status === ProfileReviewStatus.APPROVED
              ? 'profile.edit-approved'
              : 'profile.edit-rejected',
          actorId: reviewer.id,
          entityId: request.personId,
          entityType: 'Person',
          details: {
            bulk: true,
            requestId: request.id,
            revision: request.revision,
          },
        })),
      });
    });

    if (dto.status === ProfileReviewStatus.APPROVED) {
      const obsoleteAvatarIds = approved.flatMap(
        ({ approvedAvatarId, oldAvatarId }) =>
          oldAvatarId && oldAvatarId !== approvedAvatarId ? [oldAvatarId] : [],
      );
      await this.assets.removeMany(obsoleteAvatarIds);
    }
    await this.notifications.createMany(
      requests.flatMap((request) =>
        request.person.userId
          ? [
              {
                actionUrl: '/workspace/profile',
                body:
                  reviewNote ?? 'Your latest profile changes were reviewed.',
                payload: { profileEditRequestId: request.id },
                recipientId: request.person.userId,
                title: `Profile edit ${dto.status.toLowerCase()}`,
                type: NotificationType.PROFILE_REVIEWED,
              },
            ]
          : [],
      ),
    );
    return { count: requests.length, ids, status: dto.status };
  }

  async review(
    id: string,
    dto: ReviewProfileEditDto,
    reviewer: AuthenticatedUser,
  ) {
    if (
      dto.status !== ProfileReviewStatus.APPROVED &&
      dto.status !== ProfileReviewStatus.REJECTED
    ) {
      throw new BadRequestException('Decision must be APPROVED or REJECTED');
    }
    const request = await this.prisma.profileEditRequest.findUnique({
      where: { id },
      include: { person: { include: { user: { select: { role: true } } } } },
    });
    if (!request) throw new NotFoundException('Profile edit not found');
    if (request.person.userId === reviewer.id) {
      throw reviewBadRequest('You cannot review your own profile edit.', [
        {
          code: 'PROFILE_SELF_REVIEW',
          itemId: request.id,
          message: 'You cannot review your own profile edit.',
          tone: 'error',
        },
      ]);
    }
    if (
      request.status !== ProfileReviewStatus.NEEDS_REVIEW ||
      request.revision !== dto.revision
    ) {
      throw reviewConflict(
        'This profile review changed after it was opened. Reload the latest revision.',
        [
          {
            code: 'PROFILE_REVIEW_CHANGED',
            itemId: request.id,
            message: 'This profile review changed after it was opened.',
            tone: 'warning',
          },
        ],
      );
    }

    const scope = profileEditScope(
      request.person.user?.role ?? PlatformRole.MEMBER,
    );
    const validationIssues =
      dto.status === ProfileReviewStatus.APPROVED
        ? profilePayloadIssues(request)
        : [];
    if (validationIssues.length) {
      throw reviewBadRequest(
        'This profile contains submitted data that needs attention before approval.',
        validationIssues,
      );
    }
    const payload =
      dto.status === ProfileReviewStatus.APPROVED
        ? parseProfilePayload(request.payload, false, { scope })
        : undefined;
    const oldAvatarId = request.person.avatarId;
    const approvedAvatarId = payload
      ? request.avatarAssetId
        ? request.avatarAssetId
        : payload.removeAvatar
          ? null
          : oldAvatarId
      : oldAvatarId;
    const reviewNote =
      dto.status === ProfileReviewStatus.REJECTED
        ? dto.note?.trim()
        : undefined;
    if (dto.status === ProfileReviewStatus.REJECTED && !reviewNote) {
      throw new BadRequestException('A reviewer note is required');
    }
    await this.prisma.$transaction(async (transaction) => {
      const claimed = await transaction.profileEditRequest.updateMany({
        where: {
          id,
          revision: dto.revision,
          status: ProfileReviewStatus.NEEDS_REVIEW,
        },
        data: {
          note: reviewNote ?? null,
          reviewedAt: new Date(),
          reviewedById: reviewer.id,
          status: dto.status,
        },
      });
      if (claimed.count !== 1) {
        throw reviewConflict(
          'This profile review changed while the decision was being saved. Reload and try again.',
          [
            {
              code: 'PROFILE_REVIEW_CHANGED',
              itemId: request.id,
              message:
                'This profile review changed while the decision was being saved.',
              tone: 'warning',
            },
          ],
        );
      }

      if (dto.status === ProfileReviewStatus.APPROVED && payload) {
        await transaction.person.update({
          where: { id: request.personId },
          data: {
            ...profileUpdateData(payload, approvedAvatarId, scope),
            isPublished: true,
          },
        });
        await this.profileSync.normalizePublishedOutputsForPeople(
          [request.personId],
          reviewer.id,
          transaction,
        );
      }
      await transaction.auditRecord.create({
        data: {
          action:
            dto.status === ProfileReviewStatus.APPROVED
              ? 'profile.edit-approved'
              : 'profile.edit-rejected',
          actorId: reviewer.id,
          entityId: request.personId,
          entityType: 'Person',
          details: { requestId: request.id, revision: request.revision },
        },
      });
    });

    if (
      dto.status === ProfileReviewStatus.APPROVED &&
      oldAvatarId &&
      oldAvatarId !== approvedAvatarId
    ) {
      await this.assets.remove(oldAvatarId);
    }
    if (request.person.userId) {
      await this.notifications.create(request.person.userId, {
        type: NotificationType.PROFILE_REVIEWED,
        title: `Profile edit ${dto.status.toLowerCase()}`,
        body: reviewNote ?? 'Your latest profile changes were reviewed.',
        actionUrl: '/workspace/profile',
      });
    }
    return { status: dto.status };
  }
}

function sqlTextArray(values: readonly string[]): Prisma.Sql {
  return values.length
    ? Prisma.sql`ARRAY[${Prisma.join(values)}]::text[]`
    : Prisma.sql`ARRAY[]::text[]`;
}

function profileUpdateData(
  payload: ReturnType<typeof parseProfilePayload>,
  avatarId: string | null | undefined,
  scope: ProfileEditScope,
): Prisma.PersonUncheckedUpdateInput {
  if (scope === 'MODERATOR' || scope === 'ADMIN') {
    return {
      avatarId,
      contactAddress: payload.contactAddress,
      fullName: payload.fullName,
      phone: payload.phone,
      roleTitle: payload.roleTitle,
    };
  }
  return {
    avatarId,
    biography: payload.biography,
    contactAddress: payload.contactAddress,
    expertise: payload.expertise,
    fullName: payload.fullName,
    headline: payload.headline,
    links: {
      deleteMany: {},
      create: payload.links.map((link, sortOrder) => ({ ...link, sortOrder })),
    },
    phone: payload.phone,
    profileSections: {
      deleteMany: {},
      create: payload.sections.map((section, sortOrder) => ({
        type: section.type,
        title: section.title,
        sortOrder,
        subsections: {
          create: section.subsections.map(
            (subsection, subsectionSortOrder) => ({
              heading: subsection.heading,
              sortOrder: subsectionSortOrder,
              entries: {
                create: subsection.entries.map((entry, entrySortOrder) => ({
                  ...entry,
                  sortOrder: entrySortOrder,
                })),
              },
            }),
          ),
        },
      })),
    },
    ...(payload.roleTitle !== undefined
      ? { roleTitle: payload.roleTitle }
      : {}),
  };
}

function profileReviewView<
  T extends {
    id: string;
    payload: Prisma.JsonValue;
    person: { user?: { role: PlatformRole } | null } & Record<string, unknown>;
  },
>(request: T) {
  const { user, ...person } = request.person;
  return {
    ...request,
    person,
    reviewIssues: profilePayloadIssues({
      id: request.id,
      payload: request.payload,
      person: { user },
    }),
  };
}

function profilePayloadIssues(request: {
  id: string;
  payload: Prisma.JsonValue;
  person: { user?: { role: PlatformRole } | null };
}): ReviewIssue[] {
  const scope = profileEditScope(
    request.person.user?.role ?? PlatformRole.MEMBER,
  );
  try {
    parseProfilePayload(request.payload, false, { scope });
    return [];
  } catch (error) {
    return [profilePayloadIssue(request.id, error)];
  }
}

function profilePayloadIssue(itemId: string, error: unknown): ReviewIssue {
  const detail =
    error instanceof BadRequestException
      ? error.getResponse()
      : error instanceof Error
        ? error.message
        : '';
  const raw =
    typeof detail === 'string'
      ? detail
      : detail && typeof detail === 'object' && 'message' in detail
        ? String((detail as { message?: string }).message ?? '')
        : '';
  if (raw.includes('links')) {
    return {
      code: 'INVALID_PROFILE_LINKS',
      field: 'links',
      itemId,
      message: 'One or more submitted profile links are invalid.',
      tone: 'error',
    };
  }
  if (raw.includes('sections')) {
    return {
      code: 'INVALID_PROFILE_SECTIONS',
      field: 'sections',
      itemId,
      message: 'The submitted profile section data is invalid.',
      tone: 'error',
    };
  }
  return {
    code: 'INVALID_PROFILE_DATA',
    itemId,
    message: 'The submitted profile data needs attention before approval.',
    tone: 'error',
  };
}

function profileEditScope(role: PlatformRole | undefined): ProfileEditScope {
  if (role === PlatformRole.ADMIN) return 'ADMIN';
  return role === PlatformRole.MODERATOR ? 'MODERATOR' : 'RESEARCH';
}
