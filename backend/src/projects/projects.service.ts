import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import {
  AccountStatus,
  ConversationKind,
  Prisma,
  MessageKind,
  NotificationType,
  PlatformRole,
  ProjectAccess,
  ProjectChangeKind,
  ProjectChangeStatus,
  ProjectInvitationStatus,
  ProjectMemberRole,
  ProjectMembershipStatus,
  ProjectMilestoneStatus,
  ProjectUpdateStatus,
  ResearchItemType,
  ReviewStatus,
  ProjectStatus,
} from '../../generated/prisma/client';
import type { AuthenticatedUser } from '../auth/auth.types';
import { CollaborationGateway } from '../collaboration/collaboration.gateway';
import type { Environment } from '../config/environment';
import { PrismaService } from '../database/prisma.service';
import { MailService } from '../mail/mail.service';
import { NotificationsService } from '../notifications/notifications.service';
import { reviewBadRequest, reviewConflict } from '../common/review-problem';
import { SettingsService } from '../settings/settings.service';
import type {
  BulkReviewProjectChangesDto,
  CreateProjectDto,
  CreateProjectTaskDto,
  ProjectInvitationDto,
  ProjectOutputDto,
  ProjectResourceDto,
  ProjectUpdateDto,
  ReplaceMilestonesDto,
  ReviewProjectChangeDto,
  UpdateProjectDto,
  UpdateProjectTaskDto,
} from './dto/project.dto';
import { accessibleProjectWhere } from './project-access';

const PROJECT_INCLUDE = {
  researchItem: {
    include: {
      departments: { include: { department: true } },
      contributors: {
        orderBy: { sortOrder: 'asc' as const },
        include: { person: true },
      },
      projectOutputs: {
        include: {
          output: { include: { paper: true, dataset: true, project: true } },
        },
      },
    },
  },
  objectives: { orderBy: { sortOrder: 'asc' as const } },
  milestones: {
    orderBy: { sortOrder: 'asc' as const },
    include: { owner: true },
  },
  tasks: {
    orderBy: { sortOrder: 'asc' as const },
    include: { owner: true },
  },
  updates: {
    orderBy: { createdAt: 'desc' as const },
    include: { author: { include: { person: true } } },
  },
  memberships: {
    orderBy: { createdAt: 'asc' as const },
    include: { person: { include: { avatar: true, user: true } } },
  },
  invitations: { orderBy: { createdAt: 'desc' as const } },
  resources: { orderBy: { sortOrder: 'asc' as const } },
  changeRequests: {
    where: { status: ProjectChangeStatus.NEEDS_REVIEW },
    orderBy: { submittedAt: 'desc' as const },
  },
} as const;

const PROJECT_ACCOUNT_STATUSES: AccountStatus[] = [
  AccountStatus.ACTIVE,
  AccountStatus.PENDING_SETUP,
];

type BulkProjectChangeRequest = Prisma.ProjectChangeRequestGetPayload<{
  include: {
    project: { include: { researchItem: true } };
    submittedBy: { include: { person: true } };
  };
}>;

@Injectable()
export class ProjectsService {
  constructor(
    private readonly collaboration: CollaborationGateway,
    private readonly config: ConfigService<Environment, true>,
    private readonly mail: MailService,
    private readonly notifications: NotificationsService,
    private readonly prisma: PrismaService,
    private readonly settings: SettingsService,
  ) {}

  async options() {
    const [people, departments] = await Promise.all([
      this.prisma.person.findMany({
        where: {
          user: { is: { status: { in: PROJECT_ACCOUNT_STATUSES } } },
        },
        select: {
          id: true,
          fullName: true,
          headline: true,
          roleTitle: true,
          departments: {
            select: { departmentId: true, isPrimary: true },
          },
        },
        orderBy: { fullName: 'asc' },
      }),
      this.prisma.department.findMany({
        select: { id: true, name: true, abbreviation: true },
        orderBy: { name: 'asc' },
      }),
    ]);
    return { departments, people };
  }

  async create(dto: CreateProjectDto, user: AuthenticatedUser) {
    const staff = user.role !== PlatformRole.MEMBER;
    let ownerPersonId: string;
    if (staff) {
      if (!dto.ownerPersonId) {
        throw new BadRequestException(
          'Staff must select the registered person this project is being created for',
        );
      }
      ownerPersonId = dto.ownerPersonId;
    } else {
      if (!user.person) {
        throw new ForbiddenException('A registered person account is required');
      }
      if (dto.ownerPersonId && dto.ownerPersonId !== user.person.id) {
        throw new ForbiddenException(
          'Members can only create projects for themselves',
        );
      }
      ownerPersonId = user.person.id;
    }
    if (dto.startsAt && dto.endsAt && dto.endsAt < dto.startsAt) {
      throw new BadRequestException(
        'Project end date must follow its start date',
      );
    }

    const contributorPersonIds = [
      ownerPersonId,
      ...dto.contributorPersonIds.filter((id) => id !== ownerPersonId),
    ];
    if (new Set(contributorPersonIds).size !== contributorPersonIds.length) {
      throw new BadRequestException('A contributor can only be selected once');
    }
    const [department, people] = await Promise.all([
      this.prisma.department.findUnique({
        where: { id: dto.departmentId },
        select: { id: true },
      }),
      this.prisma.person.findMany({
        where: {
          id: { in: contributorPersonIds },
          user: { is: { status: { in: PROJECT_ACCOUNT_STATUSES } } },
        },
        select: { id: true, fullName: true, userId: true },
      }),
    ]);
    if (!department) throw new BadRequestException('Department not found');
    if (
      people.length !== contributorPersonIds.length ||
      people.some((person) => !person.userId)
    ) {
      throw new BadRequestException(
        'Every project contributor must have an available registered account',
      );
    }
    const peopleById = new Map(people.map((person) => [person.id, person]));
    const orderedPeople = contributorPersonIds.map((id) => {
      const person = peopleById.get(id);
      if (!person?.userId) {
        throw new BadRequestException(
          'Every project contributor must have an available registered account',
        );
      }
      return { ...person, userId: person.userId };
    });
    const ownerPerson = orderedPeople.find(({ id }) => id === ownerPersonId);
    if (!ownerPerson) {
      throw new BadRequestException('Project owner is unavailable');
    }
    const created = await this.prisma.$transaction(async (transaction) => {
      const item = await transaction.researchItem.create({
        data: {
          contributors: {
            create: orderedPeople.map((person, sortOrder) => ({
              displayName: person.fullName,
              personId: person.id,
              sortOrder,
            })),
          },
          departments: { create: { departmentId: dto.departmentId } },
          reviewStatus: ReviewStatus.DRAFT,
          slug: projectSlug(dto.title),
          submittedById: ownerPerson.userId,
          summary: dto.summary?.trim() || null,
          title: dto.title.trim(),
          type: ResearchItemType.PROJECT,
        },
      });
      await transaction.project.create({
        data: {
          conversations: {
            create: {
              kind: ConversationKind.PROJECT,
              title: dto.title.trim(),
              members: {
                create: orderedPeople.map((person) => ({
                  userId: person.userId,
                })),
              },
              messages: {
                create: {
                  body: staff
                    ? `${user.email ?? 'Staff'} created the project on behalf of ${ownerPerson.fullName}.`
                    : `${ownerPerson.fullName} created the project.`,
                  kind: MessageKind.SYSTEM,
                  senderId: user.id,
                },
              },
            },
          },
          endsAt: dto.endsAt ? new Date(dto.endsAt) : null,
          memberships: {
            create: orderedPeople.map((person) => {
              const owner = person.id === ownerPersonId;
              return {
                access: owner
                  ? ProjectAccess.MANAGE
                  : ProjectAccess.POST_UPDATES,
                personId: person.id,
                role: owner
                  ? ProjectMemberRole.OWNER
                  : ProjectMemberRole.CONTRIBUTOR,
                status: ProjectMembershipStatus.ACTIVE,
              };
            }),
          },
          objective: dto.objective.trim(),
          publicPageEnabled: false,
          researchItemId: item.id,
          startsAt: dto.startsAt ? new Date(dto.startsAt) : null,
          status: dto.status ?? ProjectStatus.PLANNED,
        },
      });
      await transaction.auditRecord.create({
        data: {
          action: staff ? 'project.created-on-behalf' : 'project.created',
          actorId: user.id,
          entityId: item.id,
          entityType: 'Project',
          details: {
            contributorPersonIds,
            departmentId: dto.departmentId,
            ownerPersonId,
          },
        },
      });
      return item.id;
    });
    const notificationRecipientIds = orderedPeople
      .map((person) => person.userId)
      .filter(
        (userId): userId is string => Boolean(userId) && userId !== user.id,
      );
    await Promise.all(
      notificationRecipientIds.map((recipientId) =>
        this.notifications.create(recipientId, {
          type: NotificationType.PROJECT_CHANGED,
          title: 'Added to a project',
          body: dto.title.trim(),
          actionUrl: `/workspace/projects/${created}`,
        }),
      ),
    );
    await this.broadcastLatestActivity(created);
    return withProgress(await this.project(created));
  }

  async mine(user: AuthenticatedUser) {
    const projects = await this.prisma.project.findMany({
      where: accessibleProjectWhere(user),
      include: PROJECT_INCLUDE,
      orderBy: { researchItem: { updatedAt: 'desc' } },
    });
    return projects.map(withProgress);
  }

  async workspace(id: string, user: AuthenticatedUser) {
    await this.authorize(id, user, ProjectAccess.VIEW, true);
    return withProgress(await this.project(id));
  }

  async update(id: string, dto: UpdateProjectDto, user: AuthenticatedUser) {
    await this.authorize(id, user, ProjectAccess.MANAGE);
    return this.applyOrQueue(id, ProjectChangeKind.DETAILS, dto, user);
  }

  async replaceMilestones(
    id: string,
    dto: ReplaceMilestonesDto,
    user: AuthenticatedUser,
  ) {
    await this.authorize(id, user, ProjectAccess.MANAGE);
    const total = dto.milestones.reduce(
      (sum, milestone) => sum + milestone.weight,
      0,
    );
    const project = await this.project(id);
    if (project.publicPageEnabled && total !== 100) {
      throw new BadRequestException(
        'Public projects must allocate exactly 100% milestone weight',
      );
    }
    return this.applyOrQueue(id, ProjectChangeKind.MILESTONES, dto, user);
  }

  async createTask(
    id: string,
    dto: CreateProjectTaskDto,
    user: AuthenticatedUser,
  ) {
    await this.authorize(id, user, ProjectAccess.POST_UPDATES);
    await this.assertTaskOwner(id, dto.ownerId);
    const sortOrder = await this.prisma.projectTask.count({
      where: { projectId: id },
    });
    const task = await this.prisma.projectTask.create({
      data: {
        createdById: user.id,
        description: dto.description?.trim() || null,
        dueAt: dto.dueAt ? new Date(dto.dueAt) : null,
        ownerId: dto.ownerId || null,
        priority: dto.priority,
        projectId: id,
        sortOrder,
        status: dto.status ?? 'TODO',
        title: dto.title.trim(),
      },
      include: { owner: { include: { user: true } } },
    });
    await this.recordActivityText(id, user.id, `created task “${task.title}”`);
    const policy = await this.settings.notificationPolicy();
    if (
      policy.taskAssigned &&
      task.owner?.user &&
      task.owner.user.id !== user.id
    ) {
      await this.notifyTaskOwner(task.owner.user, task, 'assigned');
    }
    return task;
  }

  async updateTask(
    id: string,
    taskId: string,
    dto: UpdateProjectTaskDto,
    user: AuthenticatedUser,
  ) {
    await this.authorize(id, user, ProjectAccess.POST_UPDATES);
    const previous = await this.assertTask(id, taskId);
    await this.assertTaskOwner(id, dto.ownerId);
    const task = await this.prisma.projectTask.update({
      where: { id: taskId },
      data: {
        completedAt: dto.status === 'DONE' ? new Date() : null,
        description: dto.description?.trim() || null,
        dueAt: dto.dueAt ? new Date(dto.dueAt) : null,
        ownerId: dto.ownerId || null,
        priority: dto.priority,
        status: dto.status,
        title: dto.title.trim(),
      },
      include: { owner: { include: { user: true } } },
    });
    await this.recordActivityText(id, user.id, `updated task “${task.title}”`);
    const policy = await this.settings.notificationPolicy();
    if (task.owner?.user && task.owner.user.id !== user.id) {
      const assigned = previous.ownerId !== task.ownerId;
      if (assigned && policy.taskAssigned) {
        await this.notifyTaskOwner(task.owner.user, task, 'assigned');
      } else if (policy.taskChanged) {
        await this.notifyTaskOwner(task.owner.user, task, 'changed');
      }
    }
    return task;
  }

  async deleteTask(id: string, taskId: string, user: AuthenticatedUser) {
    await this.authorize(id, user, ProjectAccess.POST_UPDATES);
    const task = await this.assertTask(id, taskId);
    await this.prisma.projectTask.delete({ where: { id: taskId } });
    await this.recordActivityText(id, user.id, `removed task “${task.title}”`);
    return { deleted: true };
  }

  async updatePost(id: string, dto: ProjectUpdateDto, user: AuthenticatedUser) {
    await this.authorize(id, user, ProjectAccess.POST_UPDATES);
    if (dto.status === ProjectUpdateStatus.DRAFT) {
      return this.applyChange(id, ProjectChangeKind.UPDATE, dto, user.id);
    }
    return this.applyOrQueue(id, ProjectChangeKind.UPDATE, dto, user);
  }

  async invite(id: string, dto: ProjectInvitationDto, user: AuthenticatedUser) {
    await this.authorize(id, user, ProjectAccess.MANAGE);
    if (
      (dto.role === ProjectMemberRole.OWNER ||
        dto.role === ProjectMemberRole.MANAGER) &&
      dto.access !== ProjectAccess.MANAGE
    ) {
      throw new BadRequestException(
        'Project owners and managers must have manage access',
      );
    }
    return this.applyOrQueue(id, ProjectChangeKind.TEAM, dto, user);
  }

  async acceptInvitation(token: string, user: AuthenticatedUser) {
    if (!user.email || !user.person) {
      throw new ForbiddenException('A verified person account is required');
    }
    const personId = user.person.id;
    const invitation = await this.prisma.projectInvitation.findUnique({
      where: { tokenHash: createHash('sha256').update(token).digest('hex') },
    });
    if (
      !invitation ||
      invitation.status !== ProjectInvitationStatus.PENDING ||
      invitation.expiresAt <= new Date() ||
      invitation.email !== user.email.toLowerCase()
    ) {
      throw new ForbiddenException('Project invitation is invalid or expired');
    }
    await this.prisma.$transaction(async (transaction) => {
      await transaction.projectMembership.upsert({
        where: {
          projectId_personId: {
            projectId: invitation.projectId,
            personId,
          },
        },
        create: {
          access: invitation.access,
          personId,
          projectId: invitation.projectId,
          role: invitation.role,
          status: ProjectMembershipStatus.ACTIVE,
        },
        update: {
          access: invitation.access,
          role: invitation.role,
          status: ProjectMembershipStatus.ACTIVE,
        },
      });
      await transaction.projectInvitation.update({
        where: { id: invitation.id },
        data: {
          acceptedAt: new Date(),
          status: ProjectInvitationStatus.ACCEPTED,
        },
      });
    });
    return { accepted: true, projectId: invitation.projectId };
  }

  async linkOutput(id: string, dto: ProjectOutputDto, user: AuthenticatedUser) {
    await this.authorize(id, user, ProjectAccess.MANAGE);
    const output = await this.prisma.researchItem.findFirst({
      where: {
        id: dto.outputId,
        reviewStatus: ReviewStatus.PUBLISHED,
        type: { not: ResearchItemType.PROJECT },
      },
    });
    if (!output)
      throw new BadRequestException(
        'Only published papers or datasets can be linked',
      );
    return this.applyOrQueue(id, ProjectChangeKind.OUTPUT, dto, user);
  }

  async addResource(
    id: string,
    dto: ProjectResourceDto,
    user: AuthenticatedUser,
  ) {
    await this.authorize(id, user, ProjectAccess.MANAGE);
    return this.applyOrQueue(id, ProjectChangeKind.RESOURCE, dto, user);
  }

  async archive(
    id: string,
    input: { publishNow?: boolean; overrideReason?: string },
    user: AuthenticatedUser,
  ) {
    await this.authorize(id, user, ProjectAccess.MANAGE);
    return this.applyOrQueue(id, ProjectChangeKind.ARCHIVE, input, user);
  }

  async unarchive(id: string, user: AuthenticatedUser) {
    await this.authorize(id, user, ProjectAccess.MANAGE, false, true);
    const project = await this.project(id);
    if (project.researchItem.reviewStatus !== ReviewStatus.ARCHIVED) {
      throw new BadRequestException('Project is not archived');
    }
    const result = await this.prisma.$transaction(async (transaction) => {
      const item = await transaction.researchItem.update({
        where: { id },
        data: {
          publishedAt: null,
          reviewNote: null,
          reviewStatus: ReviewStatus.VERIFIED,
        },
      });
      const workspace = await transaction.project.update({
        where: { researchItemId: id },
        data: { publicPageEnabled: false, version: { increment: 1 } },
      });
      return { item, project: workspace };
    });
    await this.prisma.auditRecord.create({
      data: {
        action: 'project.unarchived',
        actorId: user.id,
        entityId: id,
        entityType: 'Project',
        details: { restoredReviewStatus: ReviewStatus.VERIFIED },
      },
    });
    return { outcome: 'APPLIED' as const, direct: true, result };
  }

  async reviewQueue() {
    const requests = await this.prisma.projectChangeRequest.findMany({
      where: { status: ProjectChangeStatus.NEEDS_REVIEW },
      include: {
        project: { include: { researchItem: true } },
        submittedBy: { include: { person: true } },
      },
      orderBy: { submittedAt: 'asc' },
    });
    return requests.map((request) => ({
      ...request,
      reviewIssues:
        request.project.version !== request.baseVersion
          ? [
              {
                code: 'STALE_PROJECT_CHANGE',
                itemId: request.id,
                message:
                  'The project changed after this request was submitted.',
                tone: 'warning' as const,
              },
            ]
          : [],
    }));
  }

  async bulkReview(
    dto: BulkReviewProjectChangesDto,
    reviewer: AuthenticatedUser,
  ) {
    if (
      dto.status !== ProjectChangeStatus.APPROVED &&
      dto.status !== ProjectChangeStatus.REJECTED
    ) {
      throw new BadRequestException('Decision must be approved or rejected');
    }
    const ids = [...new Set(dto.ids)];
    if (ids.length !== dto.ids.length) {
      throw new BadRequestException(
        'Duplicate project review IDs are not allowed',
      );
    }
    const reviewNote =
      dto.status === ProjectChangeStatus.REJECTED
        ? dto.note?.trim()
        : undefined;
    if (dto.status === ProjectChangeStatus.REJECTED && !reviewNote) {
      throw new BadRequestException('A reviewer note is required');
    }

    const requests = await this.prisma.projectChangeRequest.findMany({
      where: { id: { in: ids } },
      include: {
        project: { include: { researchItem: true } },
        submittedBy: { include: { person: true } },
      },
    });
    if (requests.length !== ids.length) {
      throw new NotFoundException('One or more project changes were not found');
    }
    const unavailableRequests = requests.filter(
      ({ status }) => status !== ProjectChangeStatus.NEEDS_REVIEW,
    );
    if (unavailableRequests.length) {
      throw reviewConflict(
        'Some selected project changes are no longer awaiting review. Reload the queue.',
        unavailableRequests.map(({ id }) => ({
          code: 'PROJECT_REVIEW_CHANGED',
          itemId: id,
          message: 'This project change is no longer awaiting review.',
          tone: 'warning',
        })),
      );
    }
    const selfReviewRequests = requests.filter(
      (request) => request.submittedById === reviewer.id,
    );
    if (selfReviewRequests.length) {
      throw reviewBadRequest(
        'You cannot review your own project change.',
        selfReviewRequests.map(({ id }) => ({
          code: 'PROJECT_SELF_REVIEW',
          itemId: id,
          message: 'You cannot review your own project change.',
          tone: 'error' as const,
        })),
      );
    }

    const reviewedAt = new Date();
    if (dto.status === ProjectChangeStatus.REJECTED) {
      if (!reviewNote) {
        throw new BadRequestException('A reviewer note is required');
      }
      await this.prisma.$transaction(async (transaction) => {
        const updated = await transaction.projectChangeRequest.updateMany({
          where: { id: { in: ids }, status: ProjectChangeStatus.NEEDS_REVIEW },
          data: {
            note: reviewNote,
            reviewedAt,
            reviewedById: reviewer.id,
            status: ProjectChangeStatus.REJECTED,
          },
        });
        if (updated.count !== requests.length) {
          throw reviewConflict(
            'Some project changes changed while the bulk review was being saved. Reload and retry.',
            requests.map(({ id }) => ({
              code: 'PROJECT_REVIEW_CHANGED',
              itemId: id,
              message:
                'This project change may have changed while the decision was being saved.',
              tone: 'warning',
            })),
          );
        }
      });
      await this.notifications.createMany(
        requests.map((request) => ({
          actionUrl: `/workspace/projects/${request.projectId}`,
          body: reviewNote,
          payload: { projectChangeRequestId: request.id },
          recipientId: request.submittedById,
          title: 'Project change rejected',
          type: NotificationType.PROJECT_CHANGED,
        })),
      );
      return { count: requests.length, ids, status: dto.status };
    }

    const projectIds = requests.map(({ projectId }) => projectId);
    if (new Set(projectIds).size !== projectIds.length) {
      const counts = new Map<string, number>();
      for (const projectId of projectIds) {
        counts.set(projectId, (counts.get(projectId) ?? 0) + 1);
      }
      throw reviewBadRequest(
        'Select only one pending change per project when approving in bulk.',
        requests
          .filter(({ projectId }) => (counts.get(projectId) ?? 0) > 1)
          .map(({ id }) => ({
            code: 'MULTIPLE_CHANGES_FOR_PROJECT',
            itemId: id,
            message: 'Another selected change belongs to the same project.',
            tone: 'warning',
          })),
      );
    }
    const stale = requests.filter(
      (request) => request.project.version !== request.baseVersion,
    );
    if (stale.length) {
      await this.prisma.projectChangeRequest.updateMany({
        where: {
          id: { in: stale.map(({ id }) => id) },
          status: ProjectChangeStatus.NEEDS_REVIEW,
        },
        data: {
          note: 'Project changed after this request was submitted',
          reviewedAt,
          reviewedById: reviewer.id,
          status: ProjectChangeStatus.STALE,
        },
      });
      throw reviewConflict(
        'Some selected project changes became stale because the project changed after submission.',
        stale.map(({ id }) => ({
          code: 'STALE_PROJECT_CHANGE',
          itemId: id,
          message: 'The project changed after this request was submitted.',
          tone: 'warning',
        })),
      );
    }

    let activityMessageIds: string[] = [];
    await this.prisma.$transaction(async (transaction) => {
      const lockedProjects = await transaction.$queryRaw<
        Array<{ projectId: string; version: number }>
      >(
        Prisma.sql`
          SELECT
            project."researchItemId" AS "projectId",
            project."version"
          FROM "Project" AS project
          WHERE project."researchItemId" IN (${Prisma.join(projectIds)})
          FOR UPDATE
        `,
      );
      const versions = new Map(
        lockedProjects.map(({ projectId, version }) => [projectId, version]),
      );
      if (
        lockedProjects.length !== requests.length ||
        requests.some(
          (request) => versions.get(request.projectId) !== request.baseVersion,
        )
      ) {
        throw reviewConflict(
          'Some projects changed while the bulk review was being saved. Reload and retry.',
          requests
            .filter(
              (request) =>
                versions.get(request.projectId) !== request.baseVersion,
            )
            .map(({ id }) => ({
              code: 'PROJECT_REVIEW_CHANGED',
              itemId: id,
              message: 'This project changed while the review was being saved.',
              tone: 'warning',
            })),
        );
      }

      const claimed = await transaction.projectChangeRequest.updateMany({
        where: { id: { in: ids }, status: ProjectChangeStatus.NEEDS_REVIEW },
        data: {
          note: null,
          reviewedAt,
          reviewedById: reviewer.id,
          status: ProjectChangeStatus.APPROVED,
        },
      });
      if (claimed.count !== requests.length) {
        throw reviewConflict(
          'Some project changes changed while the bulk review was being saved. Reload and retry.',
          requests.map(({ id }) => ({
            code: 'PROJECT_REVIEW_CHANGED',
            itemId: id,
            message:
              'This project change may have changed while the decision was being saved.',
            tone: 'warning',
          })),
        );
      }

      activityMessageIds = await this.applyBulkChanges(
        transaction,
        requests,
        reviewedAt,
      );
    });

    if (activityMessageIds.length) {
      const messages = await this.prisma.message.findMany({
        where: { id: { in: activityMessageIds } },
        include: {
          sender: {
            select: {
              id: true,
              person: {
                select: { fullName: true, avatar: { select: { id: true } } },
              },
            },
          },
        },
      });
      await this.collaboration.broadcastMessages(messages);
    }
    await this.notifications.createMany(
      requests.map((request) => ({
        actionUrl: `/workspace/projects/${request.projectId}`,
        body: `Your ${request.kind.toLowerCase()} change was reviewed.`,
        payload: { projectChangeRequestId: request.id },
        recipientId: request.submittedById,
        title: 'Project change approved',
        type: NotificationType.PROJECT_CHANGED,
      })),
    );
    return { count: requests.length, ids, status: dto.status };
  }

  async review(
    id: string,
    dto: ReviewProjectChangeDto,
    reviewer: AuthenticatedUser,
  ) {
    await this.bulkReview({ ...dto, ids: [id] }, reviewer);
    return { status: dto.status };
  }

  private async applyOrQueue(
    projectId: string,
    kind: ProjectChangeKind,
    input: { publishNow?: boolean; overrideReason?: string },
    user: AuthenticatedUser,
  ) {
    const policy = await this.settings.verification();
    if (input.publishNow && user.role !== PlatformRole.ADMIN) {
      throw new ForbiddenException('Only administrators can override review');
    }
    if (input.publishNow && !input.overrideReason?.trim()) {
      throw new BadRequestException('A publish-now override requires a reason');
    }
    const payload = stripOverride(input);
    const reviewMode =
      kind === ProjectChangeKind.ARCHIVE
        ? policy.archiveProject
        : policy.updateProject;
    const appliesDirectly =
      user.role === PlatformRole.ADMIN ||
      reviewMode === 'AUTOMATIC' ||
      input.publishNow;
    if (appliesDirectly) {
      const result = await this.applyChange(projectId, kind, payload, user.id);
      if (input.publishNow) {
        await this.prisma.auditRecord.create({
          data: {
            action: 'project.change-admin-override',
            actorId: user.id,
            entityId: projectId,
            entityType: 'Project',
            details: { kind, reason: input.overrideReason?.trim() },
          },
        });
      }
      return { outcome: 'APPLIED' as const, direct: true, result };
    }
    const project = await this.project(projectId);
    const request = await this.prisma.projectChangeRequest.create({
      data: {
        baseVersion: project.version,
        kind,
        payload,
        projectId,
        submittedById: user.id,
      },
    });
    await this.notifications.notifyReviewers({
      type: NotificationType.PROJECT_REVIEW_NEEDED,
      title: 'Project change needs review',
      body: `${project.researchItem.title ?? 'Project'}: ${kind.toLowerCase()}`,
      actionUrl: '/workspace/project-reviews',
      payload: { projectChangeRequestId: request.id },
    });
    return { outcome: 'QUEUED_FOR_REVIEW' as const, direct: false, request };
  }

  private async applyBulkChanges(
    transaction: Prisma.TransactionClient,
    requests: BulkProjectChangeRequest[],
    now: Date,
  ): Promise<string[]> {
    const byKind = <T extends ProjectChangeKind>(kind: T) =>
      requests.filter((request) => request.kind === kind);

    const details = byKind(ProjectChangeKind.DETAILS);
    if (details.length) {
      const detailRows = details.map((request) => {
        const payload = asRecord(request.payload);
        return Prisma.sql`(
          ${request.projectId}::uuid,
          ${requiredString(payload.title)},
          ${optionalString(payload.summary)},
          ${optionalString(payload.objective)},
          ${requiredString(payload.status)}::"ProjectStatus",
          ${optionalDate(payload.startsAt)},
          ${optionalDate(payload.endsAt)},
          ${Boolean(payload.publicPageEnabled)}::boolean
        )`;
      });
      await transaction.$executeRaw(
        Prisma.sql`
          UPDATE "ResearchItem" AS item
          SET
            "publishedAt" = CASE
              WHEN selected.public_page_enabled THEN ${now}
              ELSE item."publishedAt"
            END,
            "reviewStatus" = CASE
              WHEN selected.public_page_enabled THEN 'PUBLISHED'::"ReviewStatus"
              ELSE item."reviewStatus"
            END,
            "summary" = selected.summary,
            "title" = selected.title,
            "updatedAt" = NOW()
          FROM (VALUES ${Prisma.join(detailRows)}) AS selected(
            project_id,
            title,
            summary,
            objective,
            status,
            starts_at,
            ends_at,
            public_page_enabled
          )
          WHERE item."id" = selected.project_id
        `,
      );
      await transaction.$executeRaw(
        Prisma.sql`
          UPDATE "Project" AS project
          SET
            "endsAt" = selected.ends_at,
            "objective" = selected.objective,
            "publicPageEnabled" = selected.public_page_enabled,
            "startsAt" = selected.starts_at,
            "status" = selected.status,
            "version" = project."version" + 1
          FROM (VALUES ${Prisma.join(detailRows)}) AS selected(
            project_id,
            title,
            summary,
            objective,
            status,
            starts_at,
            ends_at,
            public_page_enabled
          )
          WHERE project."researchItemId" = selected.project_id
        `,
      );
      const detailIds = details.map(({ projectId }) => projectId);
      await transaction.projectObjective.deleteMany({
        where: { projectId: { in: detailIds } },
      });
      const objectives = details.flatMap((request) => {
        const payload = asRecord(request.payload);
        return (
          Array.isArray(payload.objectives) ? payload.objectives : []
        ).map((value, sortOrder) => {
          const objective = asRecord(value);
          return {
            description: optionalString(objective.description),
            projectId: request.projectId,
            sortOrder,
            title: requiredString(objective.title),
          };
        });
      });
      if (objectives.length) {
        await transaction.projectObjective.createMany({ data: objectives });
      }
      const titleRows = details.map((request) => {
        const payload = asRecord(request.payload);
        return Prisma.sql`(${request.projectId}::uuid, ${requiredString(payload.title)})`;
      });
      await transaction.$executeRaw(
        Prisma.sql`
          UPDATE "Conversation" AS conversation
          SET "title" = selected.title, "updatedAt" = NOW()
          FROM (VALUES ${Prisma.join(titleRows)}) AS selected(project_id, title)
          WHERE conversation."kind" = 'PROJECT'::"ConversationKind"
            AND conversation."projectId" = selected.project_id
        `,
      );
    }

    const milestoneRequests = byKind(ProjectChangeKind.MILESTONES);
    if (milestoneRequests.length) {
      const projectIds = milestoneRequests.map(({ projectId }) => projectId);
      await transaction.projectMilestone.deleteMany({
        where: { projectId: { in: projectIds } },
      });
      const milestones = milestoneRequests.flatMap((request) => {
        const payload = asRecord(request.payload);
        return (
          Array.isArray(payload.milestones) ? payload.milestones : []
        ).map((value, sortOrder) => {
          const milestone = asRecord(value);
          const status = requiredEnumValue<ProjectMilestoneStatus>(
            milestone.status,
            Object.values(ProjectMilestoneStatus),
          );
          return {
            completedAt:
              status === ProjectMilestoneStatus.COMPLETE ? now : null,
            description: optionalString(milestone.description),
            dueAt: optionalDate(milestone.dueAt),
            ownerId: optionalString(milestone.ownerId),
            progress:
              status === ProjectMilestoneStatus.COMPLETE
                ? 100
                : status === ProjectMilestoneStatus.PLANNED ||
                    status === ProjectMilestoneStatus.BLOCKED
                  ? 0
                  : Number(milestone.progress),
            projectId: request.projectId,
            sortOrder,
            status,
            title: requiredString(milestone.title),
            weight: Number(milestone.weight),
          };
        });
      });
      if (milestones.length) {
        await transaction.projectMilestone.createMany({ data: milestones });
      }
      await transaction.project.updateMany({
        where: { researchItemId: { in: projectIds } },
        data: { version: { increment: 1 } },
      });
    }

    const updateRequests = byKind(ProjectChangeKind.UPDATE);
    if (updateRequests.length) {
      const updates = updateRequests.map((request) => {
        const payload = asRecord(request.payload);
        const status = requiredEnumValue<ProjectUpdateStatus>(
          payload.status,
          Object.values(ProjectUpdateStatus),
        );
        return {
          authorId: request.submittedById,
          body: requiredString(payload.body),
          linkedOutputId: optionalString(payload.linkedOutputId),
          milestoneId: optionalString(payload.milestoneId),
          projectId: request.projectId,
          publishedAt: status === ProjectUpdateStatus.PUBLISHED ? now : null,
          status,
          title: requiredString(payload.title),
        };
      });
      await transaction.projectUpdate.createMany({ data: updates });
      const publishedProjectIds = updates
        .filter(({ status }) => status === ProjectUpdateStatus.PUBLISHED)
        .map(({ projectId }) => projectId);
      if (publishedProjectIds.length) {
        await transaction.project.updateMany({
          where: { researchItemId: { in: publishedProjectIds } },
          data: { version: { increment: 1 } },
        });
      }
    }

    const teamRequests = byKind(ProjectChangeKind.TEAM);
    if (teamRequests.length) {
      const memberRequests = teamRequests.flatMap((request) => {
        const payload = asRecord(request.payload);
        const personId = optionalString(payload.personId);
        if (!personId) return [];
        return [
          {
            access: requiredEnumValue<ProjectAccess>(
              payload.access,
              Object.values(ProjectAccess),
            ),
            personId,
            request,
            role: requiredEnumValue<ProjectMemberRole>(
              payload.role,
              Object.values(ProjectMemberRole),
            ),
          },
        ];
      });
      if (memberRequests.length) {
        const people = await transaction.person.findMany({
          where: {
            id: { in: memberRequests.map(({ personId }) => personId) },
          },
          include: { user: true },
        });
        const userIdByPersonId = new Map<string, string>();
        for (const { personId } of memberRequests) {
          const user = people.find(({ id }) => id === personId)?.user;
          if (!user || !PROJECT_ACCOUNT_STATUSES.includes(user.status)) {
            throw new BadRequestException(
              'Project members must have available registered accounts',
            );
          }
          userIdByPersonId.set(personId, user.id);
        }
        const membershipRows = memberRequests.map(
          ({ access, personId, request, role }) =>
            Prisma.sql`(
              ${randomUUID()}::uuid,
              ${request.projectId}::uuid,
              ${personId}::uuid,
              ${role}::"ProjectMemberRole",
              ${access}::"ProjectAccess",
              'ACTIVE'::"ProjectMembershipStatus",
              NOW(),
              NOW()
            )`,
        );
        await transaction.$executeRaw(
          Prisma.sql`
            INSERT INTO "ProjectMembership" (
              "id",
              "projectId",
              "personId",
              "role",
              "access",
              "status",
              "createdAt",
              "updatedAt"
            )
            VALUES ${Prisma.join(membershipRows)}
            ON CONFLICT ("projectId", "personId") DO UPDATE
            SET
              "role" = EXCLUDED."role",
              "access" = EXCLUDED."access",
              "status" = 'ACTIVE'::"ProjectMembershipStatus",
              "updatedAt" = NOW()
          `,
        );
        const conversations = await transaction.conversation.findMany({
          where: {
            kind: ConversationKind.PROJECT,
            projectId: {
              in: memberRequests.map(({ request }) => request.projectId),
            },
          },
          select: { id: true, projectId: true },
        });
        const conversationByProject = new Map(
          conversations.flatMap((conversation) =>
            conversation.projectId
              ? [[conversation.projectId, conversation.id] as const]
              : [],
          ),
        );
        const memberRows = memberRequests.flatMap(({ personId, request }) => {
          const conversationId = conversationByProject.get(request.projectId);
          const userId = userIdByPersonId.get(personId);
          return conversationId && userId
            ? [Prisma.sql`(${conversationId}::uuid, ${userId}::uuid, NOW())`]
            : [];
        });
        if (memberRows.length) {
          await transaction.$executeRaw(
            Prisma.sql`
              INSERT INTO "ConversationMember" (
                "conversationId",
                "userId",
                "joinedAt"
              )
              VALUES ${Prisma.join(memberRows)}
              ON CONFLICT ("conversationId", "userId") DO NOTHING
            `,
          );
        }
        await transaction.notification.createMany({
          data: memberRequests.map(({ personId, request }) => {
            const recipientId = userIdByPersonId.get(personId);
            if (!recipientId) {
              throw new BadRequestException(
                'Project members must have available registered accounts',
              );
            }
            return {
              actionUrl: `/workspace/projects/${request.projectId}`,
              body: 'You now have access to an AMIR Lab project workspace.',
              payload: { projectId: request.projectId },
              recipientId,
              title: 'Added to a project',
              type: NotificationType.PROJECT_CHANGED,
            };
          }),
        });
      }

      const emailRequests = teamRequests.flatMap((request) => {
        const payload = asRecord(request.payload);
        if (optionalString(payload.personId)) return [];
        const email = requiredString(payload.email).trim().toLowerCase();
        const token = randomBytes(32).toString('base64url');
        return [
          {
            access: requiredEnumValue<ProjectAccess>(
              payload.access,
              Object.values(ProjectAccess),
            ),
            email,
            id: randomUUID(),
            request,
            role: requiredEnumValue<ProjectMemberRole>(
              payload.role,
              Object.values(ProjectMemberRole),
            ),
            token,
            tokenHash: createHash('sha256').update(token).digest('hex'),
          },
        ];
      });
      if (emailRequests.length) {
        const expiresAt = new Date(now.getTime() + 14 * DAY);
        await transaction.projectInvitation.createMany({
          data: emailRequests.map(
            ({ access, email, id, request, role, tokenHash }) => ({
              access,
              email,
              expiresAt,
              id,
              invitedById: request.submittedById,
              projectId: request.projectId,
              role,
              tokenHash,
            }),
          ),
        });
        const accounts = await transaction.user.findMany({
          where: { email: { in: emailRequests.map(({ email }) => email) } },
          select: { email: true, id: true },
        });
        const accountByEmail = new Map(
          accounts.flatMap((account) =>
            account.email
              ? [[account.email.toLowerCase(), account.id] as const]
              : [],
          ),
        );
        const frontend = this.config.get('frontendOrigins', { infer: true })[0];
        await transaction.job.createMany({
          data: emailRequests.map(({ email, id, request, token }) => {
            const link = `${frontend}/workspace/project-invitations?token=${encodeURIComponent(token)}`;
            return {
              payload: {
                subject: `Invitation to ${request.project.researchItem.title ?? 'an AMIR Lab project'}`,
                text: `You were invited to an AMIR Lab project. Sign in with this email and accept within 14 days:\n\n${link}\n\nExternal invitees receive no project access until their AMIR Lab account and identity are verified.`,
                to: email,
              },
              type: 'SEND_EMAIL',
              uniqueKey: `project-invitation:${id}`,
            };
          }),
        });
        const inviteNotifications = emailRequests.flatMap(
          ({ email, request, token }) => {
            const recipientId = accountByEmail.get(email);
            if (!recipientId) return [];
            const link = `/workspace/project-invitations?token=${encodeURIComponent(token)}`;
            return [
              {
                actionUrl: link,
                body: request.project.researchItem.title ?? 'AMIR Lab project',
                payload: { projectId: request.projectId },
                recipientId,
                title: 'Project invitation',
                type: NotificationType.PROJECT_INVITED,
              },
            ];
          },
        );
        if (inviteNotifications.length) {
          await transaction.notification.createMany({
            data: inviteNotifications,
          });
        }
      }

      await transaction.project.updateMany({
        where: {
          researchItemId: {
            in: teamRequests.map(({ projectId }) => projectId),
          },
        },
        data: { version: { increment: 1 } },
      });
    }

    const outputRequests = byKind(ProjectChangeKind.OUTPUT);
    if (outputRequests.length) {
      await transaction.projectOutput.createMany({
        data: outputRequests.map((request) => ({
          outputId: requiredString(asRecord(request.payload).outputId),
          projectId: request.projectId,
        })),
        skipDuplicates: true,
      });
      await transaction.project.updateMany({
        where: {
          researchItemId: {
            in: outputRequests.map(({ projectId }) => projectId),
          },
        },
        data: { version: { increment: 1 } },
      });
    }

    const resourceRequests = byKind(ProjectChangeKind.RESOURCE);
    if (resourceRequests.length) {
      const projectIds = resourceRequests.map(({ projectId }) => projectId);
      const counts = await transaction.projectResource.groupBy({
        by: ['projectId'],
        where: { projectId: { in: projectIds } },
        _count: { _all: true },
      });
      const countByProject = new Map(
        counts.map(({ _count, projectId }) => [projectId, _count._all]),
      );
      await transaction.projectResource.createMany({
        data: resourceRequests.map((request) => {
          const payload = asRecord(request.payload);
          return {
            kind: requiredString(payload.kind),
            label: requiredString(payload.label),
            projectId: request.projectId,
            sortOrder: countByProject.get(request.projectId) ?? 0,
            url: requiredString(payload.url),
          };
        }),
      });
      await transaction.project.updateMany({
        where: { researchItemId: { in: projectIds } },
        data: { version: { increment: 1 } },
      });
    }

    const archiveRequests = byKind(ProjectChangeKind.ARCHIVE);
    if (archiveRequests.length) {
      const projectIds = archiveRequests.map(({ projectId }) => projectId);
      await transaction.researchItem.updateMany({
        where: { id: { in: projectIds } },
        data: { reviewStatus: ReviewStatus.ARCHIVED },
      });
      await transaction.project.updateMany({
        where: { researchItemId: { in: projectIds } },
        data: { publicPageEnabled: false, version: { increment: 1 } },
      });
    }

    const supportedKinds = new Set<ProjectChangeKind>([
      ProjectChangeKind.ARCHIVE,
      ProjectChangeKind.DETAILS,
      ProjectChangeKind.MILESTONES,
      ProjectChangeKind.OUTPUT,
      ProjectChangeKind.RESOURCE,
      ProjectChangeKind.TEAM,
      ProjectChangeKind.UPDATE,
    ]);
    const unsupported = requests.filter(
      ({ kind }) => !supportedKinds.has(kind),
    );
    if (unsupported.length) {
      throw new BadRequestException(
        `Unsupported project change: ${unsupported[0].kind}`,
      );
    }

    await transaction.auditRecord.createMany({
      data: requests.map((request) => ({
        action: 'project.change-applied',
        actorId: request.submittedById,
        entityId: request.projectId,
        entityType: 'Project',
        details: { bulk: true, kind: request.kind },
      })),
    });

    const conversations = await transaction.conversation.findMany({
      where: {
        kind: ConversationKind.PROJECT,
        projectId: { in: requests.map(({ projectId }) => projectId) },
      },
      select: { id: true, projectId: true },
    });
    const conversationByProject = new Map(
      conversations.flatMap((conversation) =>
        conversation.projectId
          ? [[conversation.projectId, conversation.id] as const]
          : [],
      ),
    );
    const messages = requests.flatMap((request) => {
      const conversationId = conversationByProject.get(request.projectId);
      if (!conversationId) return [];
      return [
        {
          body: `${request.submittedBy.person?.fullName ?? 'A project member'} ${activityLabel(request.kind)}.`,
          conversationId,
          id: randomUUID(),
          kind: MessageKind.SYSTEM,
          senderId: request.submittedById,
        },
      ];
    });
    if (messages.length) {
      await transaction.message.createMany({ data: messages });
      await transaction.conversation.updateMany({
        where: {
          id: { in: messages.map(({ conversationId }) => conversationId) },
        },
        data: { updatedAt: now },
      });
    }
    return messages.map(({ id }) => id);
  }

  private async applyChange(
    projectId: string,
    kind: ProjectChangeKind,
    raw: unknown,
    actorId: string,
  ): Promise<unknown> {
    const payload = asRecord(raw);
    let result: unknown;
    let shouldIncrementVersion = false;
    if (kind === ProjectChangeKind.DETAILS) {
      const objectives = Array.isArray(payload.objectives)
        ? payload.objectives.map(asRecord)
        : [];
      const publicPageEnabled = Boolean(payload.publicPageEnabled);
      result = await this.prisma.$transaction(async (transaction) => {
        await transaction.researchItem.update({
          where: { id: projectId },
          data: {
            publishedAt: publicPageEnabled ? new Date() : undefined,
            reviewStatus: publicPageEnabled
              ? ReviewStatus.PUBLISHED
              : undefined,
            summary: optionalString(payload.summary),
            title: requiredString(payload.title),
          },
        });
        const project = await transaction.project.update({
          where: { researchItemId: projectId },
          data: {
            endsAt: optionalDate(payload.endsAt),
            objective: optionalString(payload.objective),
            publicPageEnabled,
            startsAt: optionalDate(payload.startsAt),
            status: requiredEnumValue<ProjectStatus>(
              payload.status,
              Object.values(ProjectStatus),
            ),
            version: { increment: 1 },
            objectives: {
              deleteMany: {},
              create: objectives.map((objective, sortOrder) => ({
                description: optionalString(objective.description),
                sortOrder,
                title: requiredString(objective.title),
              })),
            },
          },
        });
        await transaction.conversation.updateMany({
          where: { kind: ConversationKind.PROJECT, projectId },
          data: { title: requiredString(payload.title) },
        });
        return project;
      });
    } else if (kind === ProjectChangeKind.MILESTONES) {
      const milestones = Array.isArray(payload.milestones)
        ? payload.milestones.map(asRecord)
        : [];
      result = await this.prisma.project.update({
        where: { researchItemId: projectId },
        data: {
          version: { increment: 1 },
          milestones: {
            deleteMany: {},
            create: milestones.map((milestone, sortOrder) => ({
              completedAt:
                milestone.status === ProjectMilestoneStatus.COMPLETE
                  ? new Date()
                  : null,
              description: optionalString(milestone.description),
              dueAt: optionalDate(milestone.dueAt),
              ownerId: optionalString(milestone.ownerId),
              progress:
                milestone.status === ProjectMilestoneStatus.COMPLETE
                  ? 100
                  : milestone.status === ProjectMilestoneStatus.PLANNED ||
                      milestone.status === ProjectMilestoneStatus.BLOCKED
                    ? 0
                    : Number(milestone.progress),
              sortOrder,
              status: requiredEnumValue<ProjectMilestoneStatus>(
                milestone.status,
                Object.values(ProjectMilestoneStatus),
              ),
              title: requiredString(milestone.title),
              weight: Number(milestone.weight),
            })),
          },
        },
      });
    } else if (kind === ProjectChangeKind.UPDATE) {
      const status = requiredEnumValue<ProjectUpdateStatus>(
        payload.status,
        Object.values(ProjectUpdateStatus),
      );
      result = await this.prisma.projectUpdate.create({
        data: {
          authorId: actorId,
          body: requiredString(payload.body),
          linkedOutputId: optionalString(payload.linkedOutputId),
          milestoneId: optionalString(payload.milestoneId),
          projectId,
          publishedAt:
            status === ProjectUpdateStatus.PUBLISHED ? new Date() : null,
          status,
          title: requiredString(payload.title),
        },
      });
      shouldIncrementVersion = status === ProjectUpdateStatus.PUBLISHED;
    } else if (kind === ProjectChangeKind.TEAM) {
      result = await this.createInvitation(projectId, payload, actorId);
      shouldIncrementVersion = true;
    } else if (kind === ProjectChangeKind.OUTPUT) {
      result = await this.prisma.projectOutput.upsert({
        where: {
          projectId_outputId: {
            projectId,
            outputId: requiredString(payload.outputId),
          },
        },
        create: { projectId, outputId: requiredString(payload.outputId) },
        update: {},
      });
      shouldIncrementVersion = true;
    } else if (kind === ProjectChangeKind.RESOURCE) {
      const sortOrder = await this.prisma.projectResource.count({
        where: { projectId },
      });
      result = await this.prisma.projectResource.create({
        data: {
          kind: requiredString(payload.kind),
          label: requiredString(payload.label),
          projectId,
          sortOrder,
          url: requiredString(payload.url),
        },
      });
      shouldIncrementVersion = true;
    } else if (kind === ProjectChangeKind.ARCHIVE) {
      result = await this.prisma.$transaction(async (transaction) => {
        const item = await transaction.researchItem.update({
          where: { id: projectId },
          data: { reviewStatus: ReviewStatus.ARCHIVED },
        });
        const project = await transaction.project.update({
          where: { researchItemId: projectId },
          data: { publicPageEnabled: false, version: { increment: 1 } },
        });
        return [item, project];
      });
    } else {
      throw new BadRequestException(`Unsupported project change: ${kind}`);
    }
    if (shouldIncrementVersion) {
      await this.prisma.project.update({
        where: { researchItemId: projectId },
        data: { version: { increment: 1 } },
      });
    }
    await this.prisma.auditRecord.create({
      data: {
        action: 'project.change-applied',
        actorId,
        entityId: projectId,
        entityType: 'Project',
        details: { kind },
      },
    });
    await this.recordActivity(projectId, actorId, kind);
    if (kind === ProjectChangeKind.MILESTONES) {
      await this.notifyMilestoneProgress(projectId, actorId);
    }
    return result;
  }

  private async notifyTaskOwner(
    recipient: { id: string; email: string | null },
    task: { id: string; projectId: string; title: string },
    event: 'assigned' | 'changed',
  ): Promise<void> {
    const title = event === 'assigned' ? 'Task assigned' : 'Task updated';
    const body = `“${task.title}” ${event === 'assigned' ? 'was assigned to you' : 'has changed'}.`;
    await this.notifications.create(recipient.id, {
      actionUrl: `/workspace/projects/${task.projectId}`,
      body,
      payload: { projectId: task.projectId, taskId: task.id },
      title,
      type:
        event === 'assigned'
          ? NotificationType.TASK_ASSIGNED
          : NotificationType.TASK_CHANGED,
    });
    if (recipient.email) {
      await this.mail.queue({
        to: recipient.email,
        subject: title,
        text: body,
      });
    }
  }

  private async notifyMilestoneProgress(
    projectId: string,
    actorId: string,
  ): Promise<void> {
    const policy = await this.settings.notificationPolicy();
    if (!policy.milestoneProgress) return;
    const project = await this.prisma.project.findUnique({
      where: { researchItemId: projectId },
      include: {
        researchItem: { select: { title: true } },
        memberships: {
          where: { status: ProjectMembershipStatus.ACTIVE },
          include: { person: { include: { user: true } } },
        },
      },
    });
    if (!project) return;
    const title = 'Milestone progress updated';
    const body = `Milestone progress changed in ${project.researchItem.title ?? 'a project'}.`;
    await Promise.all(
      project.memberships.flatMap(({ person }) => {
        if (!person.user || person.user.id === actorId) return [];
        return [
          this.notifications
            .create(person.user.id, {
              actionUrl: `/workspace/projects/${projectId}`,
              body,
              payload: { projectId },
              title,
              type: NotificationType.MILESTONE_PROGRESS_CHANGED,
            })
            .then(() =>
              person.user?.email
                ? this.mail.queue({
                    to: person.user.email,
                    subject: title,
                    text: body,
                  })
                : undefined,
            ),
        ];
      }),
    );
  }

  private async recordActivity(
    projectId: string,
    actorId: string,
    kind: ProjectChangeKind,
  ) {
    return this.recordActivityText(projectId, actorId, activityLabel(kind));
  }

  private async recordActivityText(
    projectId: string,
    actorId: string,
    activity: string,
  ) {
    const conversation = await this.prisma.conversation.findFirst({
      where: { kind: ConversationKind.PROJECT, projectId },
      select: { id: true },
    });
    if (!conversation) return;
    const actor = await this.prisma.user.findUnique({
      where: { id: actorId },
      select: { person: { select: { fullName: true } } },
    });
    const message = await this.prisma.message.create({
      data: {
        body: `${actor?.person?.fullName ?? 'A project member'} ${activity}.`,
        conversationId: conversation.id,
        kind: MessageKind.SYSTEM,
        senderId: actorId,
      },
      include: {
        sender: {
          select: {
            id: true,
            person: {
              select: { fullName: true, avatar: { select: { id: true } } },
            },
          },
        },
      },
    });
    await this.prisma.conversation.update({
      where: { id: conversation.id },
      data: { updatedAt: new Date() },
    });
    await this.collaboration.broadcastMessage(message);
  }

  private async assertTask(projectId: string, taskId: string) {
    const task = await this.prisma.projectTask.findFirst({
      where: { id: taskId, projectId },
    });
    if (!task) throw new NotFoundException('Project task not found');
    return task;
  }

  private async assertTaskOwner(projectId: string, ownerId?: string | null) {
    if (!ownerId) return;
    const membership = await this.prisma.projectMembership.findUnique({
      where: { projectId_personId: { projectId, personId: ownerId } },
    });
    if (membership?.status !== ProjectMembershipStatus.ACTIVE) {
      throw new BadRequestException(
        'Task owner must be an active project member',
      );
    }
  }

  private async broadcastLatestActivity(projectId: string) {
    const message = await this.prisma.message.findFirst({
      where: {
        kind: MessageKind.SYSTEM,
        conversation: { projectId },
      },
      orderBy: { createdAt: 'desc' },
      include: {
        sender: {
          select: {
            id: true,
            person: {
              select: { fullName: true, avatar: { select: { id: true } } },
            },
          },
        },
      },
    });
    if (message) await this.collaboration.broadcastMessage(message);
  }

  private async createInvitation(
    projectId: string,
    payload: Record<string, unknown>,
    actorId: string,
  ) {
    const personId =
      typeof payload.personId === 'string' ? payload.personId.trim() : '';
    const invitedPerson = personId
      ? await this.prisma.person.findUnique({
          where: { id: personId },
          include: { user: true },
        })
      : null;
    if (personId) {
      if (
        !invitedPerson?.user ||
        !PROJECT_ACCOUNT_STATUSES.includes(invitedPerson.user.status)
      ) {
        throw new BadRequestException(
          'Project members must have available registered accounts',
        );
      }
      const invitedUser = invitedPerson.user;
      const conversation = await this.prisma.conversation.findFirst({
        where: { kind: ConversationKind.PROJECT, projectId },
        select: { id: true },
      });
      const membership = await this.prisma.$transaction(async (transaction) => {
        const saved = await transaction.projectMembership.upsert({
          where: { projectId_personId: { projectId, personId } },
          create: {
            access: requiredEnumValue<ProjectAccess>(
              payload.access,
              Object.values(ProjectAccess),
            ),
            personId,
            projectId,
            role: requiredEnumValue<ProjectMemberRole>(
              payload.role,
              Object.values(ProjectMemberRole),
            ),
            status: ProjectMembershipStatus.ACTIVE,
          },
          update: {
            access: requiredEnumValue<ProjectAccess>(
              payload.access,
              Object.values(ProjectAccess),
            ),
            role: requiredEnumValue<ProjectMemberRole>(
              payload.role,
              Object.values(ProjectMemberRole),
            ),
            status: ProjectMembershipStatus.ACTIVE,
          },
        });
        if (conversation) {
          await transaction.conversationMember.upsert({
            where: {
              conversationId_userId: {
                conversationId: conversation.id,
                userId: invitedUser.id,
              },
            },
            create: {
              conversationId: conversation.id,
              userId: invitedUser.id,
            },
            update: {},
          });
        }
        return saved;
      });
      await this.notifications.create(invitedUser.id, {
        type: NotificationType.PROJECT_CHANGED,
        title: 'Added to a project',
        body: 'You now have access to an AMIR Lab project workspace.',
        actionUrl: `/workspace/projects/${projectId}`,
      });
      return membership;
    }
    const email = (invitedPerson?.user?.email ?? requiredString(payload.email))
      .trim()
      .toLowerCase();
    const token = randomBytes(32).toString('base64url');
    const invitation = await this.prisma.projectInvitation.create({
      data: {
        access: requiredEnumValue<ProjectAccess>(
          payload.access,
          Object.values(ProjectAccess),
        ),
        email,
        expiresAt: new Date(Date.now() + 14 * DAY),
        invitedById: actorId,
        projectId,
        role: requiredEnumValue<ProjectMemberRole>(
          payload.role,
          Object.values(ProjectMemberRole),
        ),
        tokenHash: createHash('sha256').update(token).digest('hex'),
      },
      include: { project: { include: { researchItem: true } } },
    });
    const account = await this.prisma.user.findUnique({ where: { email } });
    const frontend = this.config.get('frontendOrigins', { infer: true })[0];
    const link = `${frontend}/workspace/project-invitations?token=${encodeURIComponent(token)}`;
    await this.mail.queue(
      {
        to: email,
        subject: `Invitation to ${invitation.project.researchItem.title ?? 'an AMIR Lab project'}`,
        text: `You were invited to an AMIR Lab project. Sign in with this email and accept within 14 days:\n\n${link}\n\nExternal invitees receive no project access until their AMIR Lab account and identity are verified.`,
      },
      `project-invitation:${invitation.id}`,
    );
    if (account) {
      await this.notifications.create(account.id, {
        type: NotificationType.PROJECT_INVITED,
        title: 'Project invitation',
        body: invitation.project.researchItem.title ?? 'AMIR Lab project',
        actionUrl: `/workspace/project-invitations?token=${encodeURIComponent(token)}`,
      });
    }
    return { id: invitation.id, expiresAt: invitation.expiresAt };
  }

  private async authorize(
    projectId: string,
    user: AuthenticatedUser,
    required: ProjectAccess,
    reviewersMayView = false,
    allowArchived = false,
  ): Promise<void> {
    if (user.role === PlatformRole.ADMIN) {
      if (required !== ProjectAccess.VIEW && !allowArchived) {
        await this.ensureNotArchived(projectId);
      }
      return;
    }
    if (reviewersMayView && user.role === PlatformRole.MODERATOR) return;
    if (!user.person) throw new ForbiddenException('Project access required');
    const membership = await this.prisma.projectMembership.findUnique({
      where: { projectId_personId: { projectId, personId: user.person.id } },
    });
    if (!membership || membership.status !== ProjectMembershipStatus.ACTIVE) {
      throw new ForbiddenException('Project access required');
    }
    const level = { VIEW: 0, POST_UPDATES: 1, MANAGE: 2 };
    if (level[membership.access] < level[required]) {
      throw new ForbiddenException('Project access is insufficient');
    }
    if (required !== ProjectAccess.VIEW && !allowArchived) {
      await this.ensureNotArchived(projectId);
    }
  }

  private async ensureNotArchived(projectId: string): Promise<void> {
    const project = await this.prisma.project.findUnique({
      where: { researchItemId: projectId },
      select: { researchItem: { select: { reviewStatus: true } } },
    });
    if (!project) throw new NotFoundException('Project not found');
    if (project.researchItem.reviewStatus === ReviewStatus.ARCHIVED) {
      throw new ConflictException(
        'This project is archived and read-only. Unarchive it before editing.',
      );
    }
  }

  private async project(id: string) {
    const project = await this.prisma.project.findUnique({
      where: { researchItemId: id },
      include: PROJECT_INCLUDE,
    });
    if (!project) throw new NotFoundException('Project not found');
    return project;
  }
}

const DAY = 86_400_000;

function withProgress<
  T extends { milestones: Array<{ progress: number; weight: number }> },
>(project: T) {
  const progress = Math.round(
    project.milestones.reduce(
      (total, milestone) =>
        total + (milestone.weight * milestone.progress) / 100,
      0,
    ),
  );
  return { ...project, progress };
}

function stripOverride<
  T extends { publishNow?: boolean; overrideReason?: string },
>(value: T) {
  const payload = { ...value };
  delete payload.publishNow;
  delete payload.overrideReason;
  return payload;
}

function asRecord(value: unknown): Record<string, unknown> {
  if (!value || Array.isArray(value) || typeof value !== 'object') {
    throw new BadRequestException('Project change payload must be an object');
  }
  return value as Record<string, unknown>;
}

function requiredString(value: unknown): string {
  if (typeof value !== 'string' || !value.trim()) {
    throw new BadRequestException('Project change is missing a required value');
  }
  return value.trim();
}

function optionalString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function requiredEnumValue<T extends string>(
  value: unknown,
  allowed: readonly T[],
): T {
  const candidate = requiredString(value);
  const match = allowed.find((item) => item === candidate);
  if (!match) {
    throw new BadRequestException('Project change contains an invalid value');
  }
  return match;
}

function optionalDate(value: unknown): Date | null {
  if (typeof value !== 'string' || !value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new BadRequestException('Project change contains an invalid date');
  }
  return date;
}

function projectSlug(title: string): string {
  const base = title
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
  return `${base || 'project'}-${randomBytes(4).toString('hex')}`;
}

function activityLabel(kind: ProjectChangeKind): string {
  const labels: Record<ProjectChangeKind, string> = {
    ARCHIVE: 'archived the project',
    DETAILS: 'updated the project details',
    MILESTONES: 'updated the project milestones',
    OUTPUT: 'linked a research output',
    RESOURCE: 'added a project resource',
    SETTINGS: 'updated the project settings',
    TEAM: 'updated the project team',
    UPDATE: 'posted a project update',
  };
  return labels[kind];
}
