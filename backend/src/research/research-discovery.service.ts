import { Injectable, OnModuleInit } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { PDFParse } from 'pdf-parse';
import {
  ContributorMatchSource,
  ContributorMatchStatus,
  NotificationType,
  PlatformRole,
  PersonLinkType,
  Prisma,
  ResearchAutomationState,
  ReviewStatus,
  SourceFetchStatus,
} from '../../generated/prisma/client';
import { PrismaService } from '../database/prisma.service';
import { JobsService } from '../jobs/jobs.service';
import { NotificationsService } from '../notifications/notifications.service';
import { RankingsService } from './rankings.service';
import {
  normalizeIdentityText,
  ResearchProfileSyncService,
} from './research-profile-sync.service';
import { SettingsService } from '../settings/settings.service';
import {
  normalizeOrcid,
  parseHtmlMetadata,
  parseJsonMetadata,
  parsePdfMetadata,
  personNameMatchEvidence,
  personNameTokenKey,
  type SourceAuthor,
  type SourceMetadata,
} from './source-metadata';
import { publicationCategory } from './publication-category';
import {
  SafeSourceFetcher,
  SourceUnavailableError,
  type SourceResponse,
} from './safe-source-fetcher';

export const DISCOVERY_JOB = 'DISCOVER_RESEARCH_SOURCE';

@Injectable()
export class ResearchDiscoveryService implements OnModuleInit {
  private readonly workerId = `research-discovery:${randomUUID()}`;

  constructor(
    private readonly fetcher: SafeSourceFetcher,
    private readonly jobs: JobsService,
    private readonly notifications: NotificationsService,
    private readonly prisma: PrismaService,
    private readonly profileSync: ResearchProfileSyncService,
    private readonly rankings: RankingsService,
    private readonly settings: SettingsService,
  ) {}

  onModuleInit(): void {
    this.jobs.register(DISCOVERY_JOB, async (payload) => {
      if (!payload || Array.isArray(payload) || typeof payload !== 'object') {
        throw new Error('Research discovery payload must be an object');
      }
      const researchItemId = payload.researchItemId;
      if (typeof researchItemId !== 'string') {
        throw new Error('Research discovery payload needs researchItemId');
      }
      await this.discover(researchItemId);
    });
  }

  async enqueue(
    researchItemId: string,
    canonicalUrl: string,
    uniqueKey?: string,
  ): Promise<string> {
    await this.prisma.$transaction(async (transaction) => {
      const item = await transaction.researchItem.findUnique({
        where: { id: researchItemId },
        select: { automationState: true },
      });
      if (!item) return;

      if (item.automationState !== ResearchAutomationState.RUNNING) {
        await transaction.researchItem.update({
          where: { id: researchItemId },
          data: {
            automationClaimedAt: null,
            automationOwner: null,
            automationState: ResearchAutomationState.QUEUED,
            automationVersion: { increment: 1 },
          },
        });
        await transaction.researchSourceSnapshot.upsert({
          where: { researchItemId },
          create: {
            researchItemId,
            status: SourceFetchStatus.PENDING,
            url: canonicalUrl,
          },
          update: {
            failureReason: null,
            status: SourceFetchStatus.PENDING,
            url: canonicalUrl,
          },
        });
      }
    });

    const jobId = await this.jobs.enqueueWhileActive(
      DISCOVERY_JOB,
      { researchItemId },
      uniqueKey ?? `research-source:${researchItemId}`,
    );
    this.notifications.publishResearchEvent({
      kind: 'source',
      scope: 'research',
      researchItemId,
      sourceStatus: SourceFetchStatus.PENDING,
    });
    return jobId;
  }

  activeJobId(researchItemId: string): Promise<string | null> {
    return this.jobs.activeJobId(`research-source:${researchItemId}`);
  }

  private async discover(researchItemId: string): Promise<void> {
    const claimed = await this.claim(researchItemId);
    if (!claimed) return;

    try {
      const item = await this.prisma.researchItem.findUnique({
        where: { id: researchItemId },
        include: {
          contributors: {
            include: { matches: true },
            orderBy: { sortOrder: 'asc' },
          },
          paper: true,
          submittedBy: {
            select: {
              role: true,
              isSystemAccount: true,
              isDeleted: true,
              status: true,
              person: { select: { id: true } },
            },
          },
        },
      });
      if (!item?.canonicalUrl) {
        await this.finish(
          researchItemId,
          claimed,
          SourceFetchStatus.FAILED,
          'Canonical source URL is missing',
        );
        return;
      }

      let response: SourceResponse | undefined;
      let metadata: SourceMetadata | undefined;
      let provider = 'SOURCE_PAGE';
      const doi = item.paper?.doi ?? doiFromUrl(item.canonicalUrl);
      if (doi) {
        try {
          const doiResponse = await this.fetcher.fetch(
            `https://doi.org/${doi}`,
            'application/vnd.citationstyles.csl+json',
          );
          const parsed = await this.parse(doiResponse);
          if (parsed.authors.length) {
            response = doiResponse;
            metadata = parsed;
            provider = 'DOI_CSL';
          }
        } catch {
          // Publisher metadata remains a useful fallback for incomplete DOI records.
        }
      }
      response ??= await this.fetcher.fetch(item.canonicalUrl);
      metadata ??= await this.parse(response);

      const evidence = {
        ...serializableMetadata(metadata, response.finalUrl),
        provider,
      };
      const verification = await this.settings.verification();
      const applied = await this.prisma.$transaction(async (transaction) => {
        // Descriptive edits may advance the revision without invalidating this
        // lease. Source edits/manual decisions clear it. Lock the exact lease
        // before reading current ownership and publishing against its revision.
        const lease = await transaction.researchItem.updateMany({
          where: {
            automationOwner: this.workerId,
            automationState: ResearchAutomationState.RUNNING,
            automationVersion: { gte: claimed.version },
            automationClaimedAt: claimed.claimedAt,
            id: researchItemId,
          },
          data: {
            automationClaimedAt: null,
            automationOwner: null,
            automationState: ResearchAutomationState.SUCCEEDED,
            automationVersion: { increment: 1 },
          },
        });
        if (lease.count !== 1) return { proposed: 0, stale: true };
        const item = await transaction.researchItem.findUniqueOrThrow({
          where: { id: researchItemId },
          include: {
            contributors: {
              include: { matches: true },
              orderBy: { sortOrder: 'asc' },
            },
            paper: true,
            submittedBy: {
              select: {
                role: true,
                isSystemAccount: true,
                isDeleted: true,
                status: true,
                person: { select: { id: true } },
              },
            },
          },
        });
        const memberAutomatic =
          item.submittedBy?.role === PlatformRole.MEMBER &&
          verification[item.type === 'PAPER' ? 'newPaper' : 'newDataset'] ===
            'AUTOMATIC';

        if (item.paper) {
          await transaction.paper.update({
            where: { researchItemId },
            data: {
              publicationType: publicationCategory(
                item.paper.publicationType,
                item.paper.citation,
                item.paper.venue,
              ),
            },
          });
        }
        if (metadata.authors.length) {
          await this.syncContributorsFromMetadata(
            transaction,
            researchItemId,
            item.contributors,
            metadata.authors,
          );
        }

        const contributors = await transaction.researchContributor.findMany({
          where: { researchItemId },
          include: { matches: true },
          orderBy: { sortOrder: 'asc' },
        });
        const people = await transaction.person.findMany({
          where: { userId: { not: null } },
          select: {
            id: true,
            fullName: true,
            links: {
              where: { type: PersonLinkType.ORCID },
              select: { url: true },
            },
          },
        });
        const orcids = new Map<string, Array<(typeof people)[number]>>();
        for (const person of people) {
          for (const link of person.links) {
            const orcid = normalizeOrcid(link.url);
            if (orcid) {
              orcids.set(orcid, [...(orcids.get(orcid) ?? []), person]);
            }
          }
        }

        for (const contributor of contributors) {
          // Synchronization puts source authors first, in source order. Keep
          // that association: two same-name authors can have different ORCIDs.
          const author = metadata.authors[contributor.sortOrder];
          if (!author) continue;
          const identifierMatches = author.orcid
            ? (orcids.get(author.orcid) ?? [])
            : [];
          const candidates = (
            identifierMatches.length
              ? identifierMatches.map((person) => ({
                  confidence: 1,
                  person,
                  reason: 'ORCID',
                }))
              : people.flatMap((person) => {
                  const match = personNameMatchEvidence(
                    author.name,
                    person.fullName,
                  );
                  return match ? [{ ...match, person }] : [];
                })
          ).sort((left, right) => right.confidence - left.confidence);
          const best = candidates[0];
          if (!best) continue;

          const ambiguous =
            candidates[1]?.confidence === best.confidence ||
            (identifierMatches.length !== 1 &&
              metadata.authors.filter(
                ({ name }) =>
                  personNameTokenKey(name) === personNameTokenKey(author.name),
              ).length > 1);
          const existingDecision = contributor.matches.find(
            (match) => match.personId === best.person.id,
          );
          const autoBind =
            !ambiguous &&
            best.confidence >= 0.8 &&
            (!contributor.personId ||
              contributor.personId === best.person.id) &&
            (!existingDecision ||
              existingDecision.source ===
                ContributorMatchSource.SOURCE_METADATA);
          const matchesToPersist = autoBind
            ? [best]
            : candidates.filter(
                (candidate) => candidate.confidence === best.confidence,
              );

          for (const candidate of matchesToPersist) {
            const decision = contributor.matches.find(
              (match) => match.personId === candidate.person.id,
            );
            if (
              decision?.status === ContributorMatchStatus.VERIFIED ||
              decision?.status === ContributorMatchStatus.REJECTED ||
              (decision?.status === ContributorMatchStatus.PROPOSED &&
                decision.source === ContributorMatchSource.USER_CLAIM)
            ) {
              continue;
            }

            const evidence = {
              authorName: author.name,
              canonicalUrl: response.finalUrl,
              matchReason: candidate.reason,
              orcid: author.orcid,
            };
            const match = await transaction.contributorMatch.upsert({
              where: {
                researchItemId_contributorSortOrder_personId: {
                  contributorSortOrder: contributor.sortOrder,
                  personId: candidate.person.id,
                  researchItemId,
                },
              },
              create: {
                confidence: candidate.confidence,
                contributorSortOrder: contributor.sortOrder,
                evidence,
                personId: candidate.person.id,
                researchItemId,
                reviewedAt: autoBind ? new Date() : undefined,
                source: ContributorMatchSource.SOURCE_METADATA,
                status: autoBind
                  ? ContributorMatchStatus.VERIFIED
                  : ContributorMatchStatus.PROPOSED,
              },
              update: {
                confidence: candidate.confidence,
                evidence,
                ...(autoBind
                  ? {
                      reviewedAt: new Date(),
                      reviewedById: null,
                      status: ContributorMatchStatus.VERIFIED,
                    }
                  : {
                      source: ContributorMatchSource.SOURCE_METADATA,
                      status: ContributorMatchStatus.PROPOSED,
                    }),
              },
            });
            if (autoBind) {
              await transaction.researchContributor.update({
                where: {
                  researchItemId_sortOrder: {
                    researchItemId,
                    sortOrder: contributor.sortOrder,
                  },
                },
                data: { personId: candidate.person.id },
              });
              await transaction.auditRecord.create({
                data: {
                  action: 'research.contributor-match-auto-verified',
                  actorId: null,
                  entityId: match.id,
                  entityType: 'ContributorMatch',
                  details: {
                    confidence: candidate.confidence,
                    researchItemId,
                    sortOrder: contributor.sortOrder,
                  },
                },
              });
            }
          }
        }

        const authorDiscrepancies = contributors
          .filter(({ sortOrder }) => sortOrder >= metadata.authors.length)
          .map(({ displayName }) => displayName);
        await transaction.researchSourceSnapshot.update({
          where: { researchItemId },
          data: {
            contentType: response.contentType,
            failureReason: null,
            fetchedAt: new Date(),
            metadata: { ...evidence, authorDiscrepancies },
            status: SourceFetchStatus.FETCHED,
            url: response.finalUrl,
          },
        });
        const proposedMatches = await transaction.contributorMatch.findMany({
          where: {
            researchItemId,
            status: ContributorMatchStatus.PROPOSED,
          },
          select: { id: true },
        });
        const sourceVerified = sourceMetadataMatchesItem(item, metadata);
        const onBehalf = item.submittedById
          ? await transaction.auditRecord.findFirst({
              where: {
                action: 'research.submitted-on-behalf',
                entityId: researchItemId,
                entityType: 'ResearchItem',
              },
              orderBy: { createdAt: 'desc' },
              select: {
                actor: { select: { role: true } },
                actorId: true,
              },
            })
          : null;
        const eligibleForAutoPublish =
          item.submittedBy?.person &&
          !item.submittedBy.isSystemAccount &&
          !item.submittedBy.isDeleted &&
          ['ACTIVE', 'PENDING_SETUP'].includes(item.submittedBy.status) &&
          ((onBehalf?.actor?.role !== PlatformRole.MEMBER &&
            onBehalf?.actorId !== null &&
            onBehalf?.actorId !== undefined &&
            onBehalf.actorId !== item.submittedById) ||
            (memberAutomatic && !onBehalf));
        let published = false;
        if (
          sourceVerified &&
          contributors.length > 0 &&
          authorDiscrepancies.length === 0 &&
          proposedMatches.length === 0 &&
          eligibleForAutoPublish &&
          item.reviewStatus === ReviewStatus.NEEDS_REVIEW
        ) {
          const publishedAt = new Date();
          const updated = await transaction.researchItem.updateMany({
            where: {
              automationVersion: item.automationVersion,
              id: researchItemId,
              reviewStatus: item.reviewStatus,
            },
            data: {
              publishedAt,
              reviewNote: null,
              reviewedById: null,
              reviewStatus: ReviewStatus.PUBLISHED,
            },
          });
          if (updated.count === 1) {
            await this.profileSync.normalizePublishedOutputs(
              [researchItemId],
              null,
              transaction,
            );
            await transaction.auditRecord.create({
              data: {
                action: 'research.published-automatically',
                actorId: null,
                entityId: researchItemId,
                entityType: 'ResearchItem',
              },
            });
            published = true;
          }
        }
        const personIds = published
          ? [
              ...new Set(
                (
                  await transaction.researchContributor.findMany({
                    where: { researchItemId, personId: { not: null } },
                    select: { personId: true },
                  })
                ).flatMap(({ personId }) => (personId ? [personId] : [])),
              ),
            ]
          : [];
        return {
          submittedById: item.submittedById,
          personIds,
          proposed: proposedMatches.length,
          published,
          stale: false,
        };
      });
      if (applied.stale) return;

      if (applied.proposed) {
        await this.notifications.notifyReviewers({
          type: NotificationType.RELATION_REVIEW_NEEDED,
          title: 'Contributor matches need verification',
          body: `${applied.proposed} possible account connection${applied.proposed === 1 ? '' : 's'} found for ${item.title ?? 'a research output'}.`,
          actionUrl: `/workspace/research/${item.id}`,
          payload: { researchItemId: item.id },
        });
      }
      if (applied.published) {
        await this.rankings.recalculateMany(applied.personIds);
        this.notifications.publishResearchEvent({
          kind: 'status',
          scope: 'research',
          researchItemId,
          reviewStatus: ReviewStatus.PUBLISHED,
        });
        if (applied.submittedById) {
          await this.notifications.create(applied.submittedById, {
            type: NotificationType.RESEARCH_REVIEWED,
            title: 'Research submission automatically published',
            body: `${item.title ?? 'Untitled research item'}: ${ReviewStatus.PUBLISHED}`,
            actionUrl: `/workspace/research/${item.id}`,
          });
        }
      }
      this.notifications.publishResearchEvent({
        kind: 'source',
        scope: 'research',
        researchItemId,
        sourceStatus: SourceFetchStatus.FETCHED,
      });
    } catch (error) {
      const unavailable = error instanceof SourceUnavailableError;
      const sourceStatus = unavailable
        ? SourceFetchStatus.UNAVAILABLE
        : SourceFetchStatus.FAILED;
      const finished = await this.finish(
        researchItemId,
        claimed,
        sourceStatus,
        error instanceof Error ? error.message : String(error),
      );
      if (finished) {
        this.notifications.publishResearchEvent({
          kind: 'source',
          scope: 'research',
          researchItemId,
          sourceStatus,
        });
      }
      if (!unavailable) throw error;
    }
  }

  private async claim(
    researchItemId: string,
  ): Promise<{ version: number; claimedAt: Date } | null> {
    const now = new Date();
    const claimed = await this.prisma.researchItem.updateMany({
      where: {
        id: researchItemId,
        OR: [
          {
            automationOwner: null,
            automationState: {
              in: [
                ResearchAutomationState.QUEUED,
                ResearchAutomationState.FAILED,
              ],
            },
          },
          {
            automationState: ResearchAutomationState.RUNNING,
            automationClaimedAt: { lt: new Date(now.getTime() - 5 * 60_000) },
          },
        ],
      },
      data: {
        automationClaimedAt: now,
        automationOwner: this.workerId,
        automationState: ResearchAutomationState.RUNNING,
      },
    });
    if (claimed.count !== 1) return null;
    const item = await this.prisma.researchItem.findUnique({
      where: { id: researchItemId },
      select: { automationOwner: true, automationVersion: true },
    });
    return item?.automationOwner === this.workerId
      ? { version: item.automationVersion, claimedAt: now }
      : null;
  }

  private async finish(
    researchItemId: string,
    claimed: { version: number; claimedAt: Date },
    sourceStatus: SourceFetchStatus,
    failureReason: string,
  ): Promise<boolean> {
    return this.prisma.$transaction(async (transaction) => {
      const updated = await transaction.researchItem.updateMany({
        where: {
          automationOwner: this.workerId,
          automationState: ResearchAutomationState.RUNNING,
          automationVersion: { gte: claimed.version },
          automationClaimedAt: claimed.claimedAt,
          id: researchItemId,
        },
        data: {
          automationClaimedAt: null,
          automationOwner: null,
          automationState:
            sourceStatus === SourceFetchStatus.UNAVAILABLE
              ? ResearchAutomationState.SUCCEEDED
              : ResearchAutomationState.FAILED,
          automationVersion: { increment: 1 },
        },
      });
      if (updated.count !== 1) return false;
      await transaction.researchSourceSnapshot.update({
        where: { researchItemId },
        data: {
          failureReason,
          fetchedAt: new Date(),
          status: sourceStatus,
        },
      });
      return true;
    });
  }

  private async parse(response: SourceResponse): Promise<SourceMetadata> {
    if (response.contentType.includes('pdf')) {
      const parser = new PDFParse({ data: response.body });
      try {
        return parsePdfMetadata((await parser.getInfo()).info);
      } finally {
        await parser.destroy();
      }
    }
    const text = response.body.toString('utf8');
    if (response.contentType.includes('json')) {
      try {
        return parseJsonMetadata(JSON.parse(text));
      } catch {
        return { authors: [] };
      }
    }
    return parseHtmlMetadata(text);
  }

  private async syncContributorsFromMetadata(
    transaction: Prisma.TransactionClient,
    researchItemId: string,
    contributors: ExistingContributor[],
    authors: SourceAuthor[],
  ): Promise<void> {
    const currentKeys = contributors.map((contributor) =>
      personNameTokenKey(contributor.displayName),
    );
    const authorKeys = authors.map((author) => personNameTokenKey(author.name));
    if (
      currentKeys.length === authorKeys.length &&
      currentKeys.every(
        (key, index) =>
          key === authorKeys[index] &&
          contributors[index]?.displayName === authors[index]?.name,
      )
    ) {
      return;
    }

    const used = new Set<ExistingContributor>();
    const nextContributors = authors.map((author, sortOrder) => {
      const existing = bestExistingContributorMatch(
        author.name,
        contributors,
        used,
      );
      if (existing) used.add(existing);
      return {
        displayName: author.name,
        existing,
        personId: existing?.personId ?? null,
        researchItemId,
        sortOrder,
      };
    });
    for (const contributor of contributors) {
      if (used.has(contributor)) continue;
      nextContributors.push({
        displayName: contributor.displayName,
        existing: contributor,
        personId: contributor.personId,
        researchItemId,
        sortOrder: nextContributors.length,
      });
    }

    const preservedMatches = nextContributors.flatMap(
      ({ existing, sortOrder }) =>
        (existing?.matches ?? []).map((match) => ({
          id: match.id,
          confidence: match.confidence,
          createdAt: match.createdAt,
          contributorSortOrder: sortOrder,
          evidence: requiredEvidenceObject(match.evidence),
          personId: match.personId,
          researchItemId,
          requestedById: match.requestedById,
          reviewedAt: match.reviewedAt,
          reviewedById: match.reviewedById,
          source: match.source,
          status: match.status,
        })),
    );

    await transaction.contributorMatch.deleteMany({
      where: { researchItemId },
    });
    await transaction.researchContributor.deleteMany({
      where: { researchItemId },
    });
    await transaction.researchContributor.createMany({
      data: nextContributors.map((contributor) => ({
        displayName: contributor.displayName,
        personId: contributor.personId,
        researchItemId: contributor.researchItemId,
        sortOrder: contributor.sortOrder,
      })),
    });
    if (preservedMatches.length) {
      await transaction.contributorMatch.createMany({
        data: preservedMatches,
        skipDuplicates: true,
      });
    }
  }
}

interface ExistingContributor {
  displayName: string;
  matches: Array<{
    id: string;
    confidence: number | null;
    createdAt: Date;
    evidence: Prisma.JsonValue;
    personId: string;
    requestedById: string | null;
    reviewedAt: Date | null;
    reviewedById: string | null;
    source: ContributorMatchSource;
    status: ContributorMatchStatus;
  }>;
  personId: string | null;
}

function bestExistingContributorMatch(
  authorName: string,
  contributors: ExistingContributor[],
  used: Set<ExistingContributor>,
): ExistingContributor | undefined {
  const authorKey = personNameTokenKey(authorName);
  const exact = contributors.find(
    (contributor) =>
      !used.has(contributor) &&
      personNameTokenKey(contributor.displayName) === authorKey,
  );
  if (exact) return exact;

  const matches = contributors
    .filter((contributor) => !used.has(contributor))
    .flatMap((contributor) => {
      const evidence = personNameMatchEvidence(
        authorName,
        contributor.displayName,
      );
      return evidence ? [{ confidence: evidence.confidence, contributor }] : [];
    })
    .sort((left, right) => right.confidence - left.confidence);
  const best = matches[0];
  if (!best || matches[1]?.confidence === best.confidence) return undefined;
  return best.contributor;
}

function doiFromUrl(value: string): string | undefined {
  return value.match(/(?:doi\.org\/)?(10\.\d{4,9}\/[-._;()/:A-Z0-9]+)/i)?.[1];
}

function serializableMetadata(
  metadata: SourceMetadata,
  canonicalUrl: string,
): Record<string, Prisma.InputJsonValue> {
  return {
    authors: metadata.authors.map((author) => ({
      name: author.name,
      ...(author.orcid ? { orcid: author.orcid } : {}),
    })),
    canonicalUrl,
    ...(metadata.doi ? { doi: metadata.doi } : {}),
    ...(metadata.title ? { title: metadata.title } : {}),
  };
}

function requiredEvidenceObject(
  value: Prisma.JsonValue,
): Prisma.InputJsonObject {
  if (!value || Array.isArray(value) || typeof value !== 'object') {
    throw new Error('Contributor match evidence must be a JSON object');
  }
  return value;
}

function sourceMetadataMatchesItem(
  item: {
    contributors: readonly unknown[];
    paper: { doi: string | null } | null;
    title: string | null;
  },
  metadata: SourceMetadata,
): boolean {
  const itemTitle = normalizeIdentityText(item.title);
  const sourceTitle = normalizeIdentityText(metadata.title);
  if (!itemTitle || !sourceTitle || !titlesMatch(itemTitle, sourceTitle)) {
    return false;
  }
  if (item.paper?.doi) {
    const itemDoi = normalizeDoi(item.paper.doi);
    const sourceDoi = normalizeDoi(metadata.doi);
    if (!itemDoi || itemDoi !== sourceDoi) return false;
  }
  return metadata.authors.length > 0 || item.contributors.length === 0;
}

function titlesMatch(left: string, right: string): boolean {
  if (left === right) return true;
  if (left.length < 8 || right.length < 8) return false;
  return left.includes(right) || right.includes(left);
}

function normalizeDoi(value: string | undefined): string | undefined {
  const normalized = value
    ?.trim()
    .toLowerCase()
    .replace(/^https?:\/\/(?:dx\.)?doi\.org\//, '')
    .replace(/^doi\s*:\s*/, '');
  return normalized
    ?.match(/10\.\d{4,9}\/[-._;()/:a-z0-9]+/i)?.[0]
    .replace(/[.,;)]$/, '');
}
