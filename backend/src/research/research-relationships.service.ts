import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  ContributorMatchSource,
  ContributorMatchStatus,
  NotificationType,
  Prisma,
  ResearchAutomationState,
  ResearchItemType,
  ReviewStatus,
} from '../../generated/prisma/client';
import type { AuthenticatedUser } from '../auth/auth.types';
import { PrismaService } from '../database/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import type {
  ClaimContributorDto,
  LinkContributorDto,
  ReviewContributorMatchDto,
} from './dto/contributor-match.dto';
import { ResearchProfileSyncService } from './research-profile-sync.service';
import { ResearchService } from './research.service';

const MATCH_INCLUDE = {
  contributor: { include: { researchItem: true } },
  person: { select: { id: true, fullName: true, slug: true } },
  requestedBy: { select: { id: true, email: true } },
} as const;

@Injectable()
export class ResearchRelationshipsService {
  constructor(
    private readonly notifications: NotificationsService,
    private readonly prisma: PrismaService,
    private readonly profileSync: ResearchProfileSyncService,
    private readonly research: ResearchService,
  ) {}

  async mine(user: AuthenticatedUser) {
    if (!user.person) throw new NotFoundException('Profile not found');
    const [connections, requests] = await Promise.all([
      this.prisma.researchContributor.findMany({
        where: { personId: user.person.id },
        include: {
          researchItem: {
            include: { paper: true, dataset: true, project: true },
          },
        },
        orderBy: { researchItem: { createdAt: 'desc' } },
      }),
      this.prisma.contributorMatch.findMany({
        where: { personId: user.person.id },
        include: MATCH_INCLUDE,
        orderBy: { updatedAt: 'desc' },
      }),
    ]);
    return { connections, requests };
  }

  async search(query: string) {
    const term = query.trim();
    if (term.length < 2) {
      throw new BadRequestException('Search needs at least two characters');
    }
    return this.prisma.researchItem.findMany({
      where: {
        reviewStatus: ReviewStatus.PUBLISHED,
        OR: [
          { title: { contains: term, mode: 'insensitive' } },
          { canonicalUrl: { contains: term, mode: 'insensitive' } },
          {
            contributors: {
              some: { displayName: { contains: term, mode: 'insensitive' } },
            },
          },
        ],
      },
      select: {
        id: true,
        title: true,
        type: true,
        canonicalUrl: true,
        automationVersion: true,
        automationState: true,
        contributors: {
          orderBy: { sortOrder: 'asc' },
          select: { displayName: true, personId: true, sortOrder: true },
        },
      },
      orderBy: { publishedAt: 'desc' },
      take: 20,
    });
  }

  people(query = '') {
    const term = query.trim();
    return this.prisma.person.findMany({
      where: {
        userId: { not: null },
        ...(term
          ? { fullName: { contains: term, mode: 'insensitive' as const } }
          : {}),
      },
      select: { id: true, fullName: true, slug: true },
      orderBy: { fullName: 'asc' },
      take: 250,
    });
  }

  async claim(
    researchItemId: string,
    sortOrder: number,
    dto: ClaimContributorDto,
    user: AuthenticatedUser,
  ) {
    if (!user.person) throw new NotFoundException('Profile not found');
    const claimant = user.person;
    const contributor = await this.contributor(researchItemId, sortOrder);
    if (contributor.personId && contributor.personId !== claimant.id) {
      throw new ConflictException('This contributor is already verified');
    }
    const match = await this.prisma.$transaction(async (transaction) => {
      await this.bumpResearchVersion(
        transaction,
        researchItemId,
        dto.expectedAutomationVersion,
      );
      const result = await transaction.contributorMatch.upsert({
        where: {
          researchItemId_contributorSortOrder_personId: {
            contributorSortOrder: sortOrder,
            personId: claimant.id,
            researchItemId,
          },
        },
        create: {
          contributorSortOrder: sortOrder,
          evidence: {
            claimedName: contributor.displayName,
            ...(dto.evidenceUrl ? { evidenceUrl: dto.evidenceUrl } : {}),
            ...(dto.note ? { note: dto.note } : {}),
          },
          personId: claimant.id,
          requestedById: user.id,
          researchItemId,
          source: ContributorMatchSource.USER_CLAIM,
        },
        update: {
          evidence: {
            claimedName: contributor.displayName,
            ...(dto.evidenceUrl ? { evidenceUrl: dto.evidenceUrl } : {}),
            ...(dto.note ? { note: dto.note } : {}),
          },
          requestedById: user.id,
          reviewedAt: null,
          reviewedById: null,
          source: ContributorMatchSource.USER_CLAIM,
          status: ContributorMatchStatus.PROPOSED,
        },
        include: MATCH_INCLUDE,
      });
      await transaction.auditRecord.create({
        data: {
          action: 'research.contributor-claimed',
          actorId: user.id,
          entityId: result.id,
          entityType: 'ContributorMatch',
          details: { researchItemId, sortOrder },
        },
      });
      return result;
    });
    await this.notifications.notifyReviewers({
      type: NotificationType.RELATION_REVIEW_NEEDED,
      title: 'Authorship claim needs verification',
      body: `${claimant.fullName} claimed ${contributor.displayName} on ${
        contributor.researchItem.title ?? 'a research output'
      }.`,
      actionUrl: `/workspace/research/${researchItemId}`,
      payload: { contributorMatchId: match.id, researchItemId },
    });
    return match;
  }

  async link(
    researchItemId: string,
    sortOrder: number,
    dto: LinkContributorDto,
    reviewer: AuthenticatedUser,
  ) {
    const [contributor, person] = await Promise.all([
      this.contributor(researchItemId, sortOrder),
      this.prisma.person.findFirst({
        where: { id: dto.personId, userId: { not: null } },
      }),
    ]);
    if (!person) throw new NotFoundException('Person not found');
    const match = await this.prisma.$transaction(async (transaction) => {
      await this.bumpResearchVersion(
        transaction,
        researchItemId,
        dto.expectedAutomationVersion,
      );
      const currentContributor =
        await transaction.researchContributor.findUnique({
          where: {
            researchItemId_sortOrder: { researchItemId, sortOrder },
          },
          include: { researchItem: true },
        });
      if (!currentContributor)
        throw new NotFoundException('Contributor not found');
      await transaction.contributorMatch.updateMany({
        where: { contributorSortOrder: sortOrder, researchItemId },
        data: {
          reviewedAt: new Date(),
          reviewedById: reviewer.id,
          status: ContributorMatchStatus.REJECTED,
        },
      });
      const result = await transaction.contributorMatch.upsert({
        where: {
          researchItemId_contributorSortOrder_personId: {
            contributorSortOrder: sortOrder,
            personId: person.id,
            researchItemId,
          },
        },
        create: {
          contributorSortOrder: sortOrder,
          evidence: {
            linkedName: currentContributor.displayName,
          },
          personId: person.id,
          requestedById: reviewer.id,
          researchItemId,
          reviewedAt: new Date(),
          reviewedById: reviewer.id,
          source: ContributorMatchSource.ADMIN_MANUAL,
          status: ContributorMatchStatus.VERIFIED,
        },
        update: {
          evidence: {
            linkedName: currentContributor.displayName,
          },
          reviewedAt: new Date(),
          reviewedById: reviewer.id,
          source: ContributorMatchSource.ADMIN_MANUAL,
          status: ContributorMatchStatus.VERIFIED,
        },
        include: MATCH_INCLUDE,
      });
      await transaction.researchContributor.update({
        where: {
          researchItemId_sortOrder: { researchItemId, sortOrder },
        },
        data: { personId: person.id },
      });
      await transaction.auditRecord.create({
        data: {
          action: 'research.contributor-linked',
          actorId: reviewer.id,
          entityId: result.id,
          entityType: 'ContributorMatch',
          details: { personId: person.id, researchItemId, sortOrder },
        },
      });
      await this.profileSync.normalizePublishedOutputs(
        [researchItemId],
        reviewer.id,
        transaction,
      );
      return result;
    });
    await this.recalculateIfPublished(contributor, person.id, reviewer.id);
    return match;
  }

  async review(
    id: string,
    dto: ReviewContributorMatchDto,
    reviewer: AuthenticatedUser,
  ) {
    if (
      dto.status !== ContributorMatchStatus.VERIFIED &&
      dto.status !== ContributorMatchStatus.REJECTED
    ) {
      throw new BadRequestException('Decision must be VERIFIED or REJECTED');
    }
    const match = await this.prisma.contributorMatch.findUnique({
      where: { id },
      include: MATCH_INCLUDE,
    });
    if (!match) throw new NotFoundException('Contributor match not found');
    if (match.status !== ContributorMatchStatus.PROPOSED) {
      throw new ConflictException(
        'Contributor match is no longer awaiting review',
      );
    }
    const reviewNote =
      dto.status === ContributorMatchStatus.REJECTED
        ? dto.note?.trim()
        : undefined;
    if (
      dto.status === ContributorMatchStatus.REJECTED &&
      match.source === ContributorMatchSource.USER_CLAIM &&
      !reviewNote
    ) {
      throw new BadRequestException(
        'A reviewer note is required for a member claim',
      );
    }

    await this.prisma.$transaction(async (transaction) => {
      await this.bumpResearchVersion(
        transaction,
        match.researchItemId,
        dto.expectedAutomationVersion,
      );
      const claimed = await transaction.contributorMatch.updateMany({
        where: { id, status: ContributorMatchStatus.PROPOSED },
        data: {
          ...(dto.status === ContributorMatchStatus.REJECTED
            ? { evidence: mergeEvidence(match.evidence, reviewNote) }
            : {}),
          reviewedAt: new Date(),
          reviewedById: reviewer.id,
          status: dto.status,
        },
      });
      if (claimed.count !== 1) {
        throw new ConflictException('Contributor match changed; reload it');
      }
      if (dto.status === ContributorMatchStatus.VERIFIED) {
        await transaction.contributorMatch.updateMany({
          where: {
            contributorSortOrder: match.contributorSortOrder,
            id: { not: id },
            researchItemId: match.researchItemId,
            status: ContributorMatchStatus.PROPOSED,
          },
          data: {
            reviewedAt: new Date(),
            reviewedById: reviewer.id,
            status: ContributorMatchStatus.REJECTED,
          },
        });
        await transaction.researchContributor.update({
          where: {
            researchItemId_sortOrder: {
              researchItemId: match.researchItemId,
              sortOrder: match.contributorSortOrder,
            },
          },
          data: { personId: match.personId },
        });
        await this.profileSync.normalizePublishedOutputs(
          [match.researchItemId],
          reviewer.id,
          transaction,
        );
      }
      await transaction.auditRecord.create({
        data: {
          action: 'research.contributor-match-reviewed',
          actorId: reviewer.id,
          entityId: match.id,
          entityType: 'ContributorMatch',
          details: {
            ...(reviewNote ? { note: reviewNote } : {}),
            status: dto.status,
          },
        },
      });
    });

    if (match.requestedById && match.requestedById !== reviewer.id) {
      await this.notifications.create(match.requestedById, {
        type: NotificationType.RELATION_REVIEWED,
        title: 'Research connection reviewed',
        body: `${match.contributor.researchItem.title ?? 'Research output'}: ${dto.status.toLowerCase()}.`,
        actionUrl: '/workspace/submissions',
      });
    }
    if (dto.status === ContributorMatchStatus.VERIFIED) {
      await this.recalculateIfPublished(
        match.contributor,
        match.personId,
        reviewer.id,
      );
    }
    return { id, status: dto.status };
  }

  private async contributor(researchItemId: string, sortOrder: number) {
    const contributor = await this.prisma.researchContributor.findUnique({
      where: { researchItemId_sortOrder: { researchItemId, sortOrder } },
      include: { researchItem: true },
    });
    if (!contributor) throw new NotFoundException('Contributor not found');
    return contributor;
  }

  private async bumpResearchVersion(
    transaction: Prisma.TransactionClient,
    researchItemId: string,
    expectedAutomationVersion: number,
  ): Promise<void> {
    // Lock the parent before relationship writes. Active discovery owns the
    // contributor snapshot; changing its revision would strand its lease.
    const updated = await transaction.researchItem.updateMany({
      where: {
        automationVersion: expectedAutomationVersion,
        automationState: {
          notIn: [
            ResearchAutomationState.QUEUED,
            ResearchAutomationState.RUNNING,
          ],
        },
        id: researchItemId,
      },
      data: { automationVersion: { increment: 1 } },
    });
    if (updated.count !== 1) {
      throw new ConflictException(
        'This research record changed or source verification is in progress. Refresh after verification finishes and retry.',
      );
    }
  }

  private async recalculateIfPublished(
    contributor: {
      researchItem: { reviewStatus: ReviewStatus; type: ResearchItemType };
    },
    personId: string,
    actorId: string,
  ): Promise<void> {
    if (
      contributor.researchItem.reviewStatus === ReviewStatus.PUBLISHED &&
      contributor.researchItem.type === ResearchItemType.PAPER
    ) {
      await this.research.recalculateRank(personId, actorId);
    }
  }
}

function mergeEvidence(
  evidence: Prisma.JsonValue,
  note?: string,
): Prisma.InputJsonValue {
  const base =
    evidence && !Array.isArray(evidence) && typeof evidence === 'object'
      ? evidence
      : { originalEvidence: evidence };
  return {
    ...base,
    ...(note ? { reviewerNote: note } : {}),
  };
}
