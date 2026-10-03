import {
  AccountStatus,
  ContributorMatchSource,
  ContributorMatchStatus,
  PersonLinkType,
  PlatformRole,
  ResearchItemType,
  ResearchAutomationState,
  ReviewStatus,
  SourceFetchStatus,
} from '../../generated/prisma/client';
import { NotificationsService } from '../notifications/notifications.service';
import { PrismaService } from '../database/prisma.service';
import { RankingsService } from './rankings.service';
import { SettingsService } from '../settings/settings.service';
import { JobsService } from '../jobs/jobs.service';
import { SafeSourceFetcher } from './safe-source-fetcher';
import { ResearchDiscoveryService } from './research-discovery.service';
import { ResearchProfileSyncService } from './research-profile-sync.service';
import { ResearchService } from './research.service';

type MatchRow = {
  confidence?: number | null;
  id?: string;
  personId: string;
  source: ContributorMatchSource;
  status: ContributorMatchStatus;
  [key: string]: unknown;
};

function objectMock<T extends object>(prototype: object, value: object): T {
  const mock = Object.create(prototype) as T;
  Object.assign(mock, value);
  return mock;
}

function createResearchService({
  discovery = {},
  prisma = {},
  profileSync = {
    normalizePublishedOutputs: jest.fn().mockResolvedValue(undefined),
  },
  settings = {},
}: {
  discovery?: object;
  prisma?: object;
  profileSync?: object;
  settings?: object;
}) {
  const prismaValue = Object.assign(
    {
      $transaction: (callback: (transaction: object) => unknown) =>
        Promise.resolve(callback(prisma)),
    },
    prisma,
  );
  return Promise.resolve(
    new ResearchService(
      discovery as ResearchDiscoveryService,
      objectMock(NotificationsService.prototype, {
        create: jest.fn().mockResolvedValue(undefined),
        publishResearchEvent: jest.fn(),
      }),
      prismaValue as PrismaService,
      profileSync as ResearchProfileSyncService,
      {} as RankingsService,
      settings as SettingsService,
    ),
  );
}

function createDiscoveryService({
  fetcher = {},
  jobs = {},
  notifications = { publishResearchEvent: jest.fn() },
  profileSync = { normalizePublishedOutputs: jest.fn() },
  prisma = {},
  rankings = { recalculateMany: jest.fn() },
  settings = {
    verification: jest.fn().mockResolvedValue({
      newDataset: 'MANUAL',
      newPaper: 'AUTOMATIC',
    }),
  },
}: {
  fetcher?: object;
  jobs?: object;
  notifications?: object;
  profileSync?: object;
  prisma?: object;
  rankings?: object;
  settings?: object;
}) {
  const prismaValue = Object.assign(
    {
      $transaction: (callback: (transaction: object) => unknown) =>
        Promise.resolve(callback(prisma)),
    },
    prisma,
  );
  return Promise.resolve(
    new ResearchDiscoveryService(
      fetcher as SafeSourceFetcher,
      jobs as JobsService,
      objectMock(NotificationsService.prototype, notifications),
      prismaValue as PrismaService,
      objectMock(ResearchProfileSyncService.prototype, profileSync),
      objectMock(RankingsService.prototype, rankings),
      objectMock(SettingsService.prototype, settings),
    ),
  );
}

async function runDiscovery({
  authors,
  item,
  onBehalfActorId,
  people,
  sourceTitle = item.title,
}: {
  authors: Array<{ name: string; orcid?: string }>;
  item: {
    automationVersion: number;
    canonicalUrl: string;
    contributors: Array<{
      displayName: string;
      matches: Array<{
        personId: string;
        source: ContributorMatchSource;
        status: ContributorMatchStatus;
      }>;
      personId: string | null;
      sortOrder: number;
    }>;
    id: string;
    paper: null;
    reviewStatus: ReviewStatus;
    submittedById: string | null;
    submittedBy?: {
      role?: PlatformRole;
      isSystemAccount: boolean;
      isDeleted: boolean;
      status: AccountStatus;
      person: { id: string } | null;
    } | null;
    title: string;
    type?: ResearchItemType;
  };
  onBehalfActorId?: string | null;
  people: Array<{ fullName: string; id: string; orcid?: string }>;
  sourceTitle?: string;
}) {
  let jobHandler: ((payload: unknown) => Promise<void>) | undefined;
  let contributorRows = item.contributors;
  const effectiveSubmittedById = item.submittedById;
  const matchRows: MatchRow[] = [
    ...item.contributors.flatMap(({ matches }) => matches),
  ];
  const events: object[] = [];
  const fetcher = {
    fetch: jest.fn().mockResolvedValue({
      body: Buffer.from(
        `<meta name="citation_title" content="${sourceTitle}">${authors
          .map(
            (author) =>
              `<meta name="citation_author" content="${author.name}">${
                author.orcid
                  ? `<meta name="citation_author_orcid" content="${author.orcid}">`
                  : ''
              }`,
          )
          .join('')}`,
      ),
      contentType: 'text/html; charset=utf-8',
      finalUrl: item.canonicalUrl,
    }),
  };
  const jobs = {
    register: jest.fn(
      (_type: string, handler: (payload: unknown) => Promise<void>) => {
        jobHandler = handler;
      },
    ),
  };
  const researchItemFindUnique = jest.fn<
    Promise<Record<string, unknown>>,
    [{ select?: unknown; [key: string]: unknown }]
  >();
  const contributorMatchUpsert = jest
    .fn()
    .mockImplementation(
      (input: { create: MatchRow; update: Partial<MatchRow> }) => {
        const row: MatchRow = {
          id: `match-${matchRows.length + 1}`,
          ...input.create,
          ...input.update,
        };
        matchRows.push(row);
        return Promise.resolve(row);
      },
    );
  const prisma = {
    auditRecord: {
      create: jest.fn().mockResolvedValue({}),
      findFirst: jest
        .fn()
        .mockResolvedValue(
          onBehalfActorId === undefined ? null : { actorId: onBehalfActorId },
        ),
    },
    contributorMatch: {
      createMany: jest.fn().mockResolvedValue({ count: 0 }),
      deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
      findMany: jest
        .fn()
        .mockImplementation(
          ({ where }: { where: { status: ContributorMatchStatus } }) =>
            Promise.resolve(
              matchRows
                .filter((match) => match.status === where.status)
                .map(({ id }) => ({ id })),
            ),
        ),
      upsert: contributorMatchUpsert,
    },
    person: {
      findMany: jest.fn().mockResolvedValue(
        people.map((person) => ({
          id: person.id,
          fullName: person.fullName,
          links: person.orcid
            ? [{ type: PersonLinkType.ORCID, url: person.orcid }]
            : [],
        })),
      ),
    },
    researchContributor: {
      createMany: jest
        .fn()
        .mockImplementation(
          ({ data }: { data: Array<(typeof item.contributors)[number]> }) => {
            contributorRows = data.map(
              (row: (typeof item.contributors)[number]) => ({
                ...row,
                matches: [],
              }),
            );
            return Promise.resolve({ count: data.length });
          },
        ),
      deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
      findMany: jest
        .fn()
        .mockImplementation(() =>
          Promise.resolve(
            contributorRows.map((row) => ({ ...row, matches: row.matches })),
          ),
        ),
      update: jest
        .fn()
        .mockImplementation(
          ({
            data,
            where,
          }: {
            data: { personId: string };
            where: { researchItemId_sortOrder: { sortOrder: number } };
          }) => {
            const row = contributorRows.find(
              (candidate) =>
                candidate.sortOrder ===
                where.researchItemId_sortOrder.sortOrder,
            );
            if (row) row.personId = data.personId;
            return Promise.resolve(row);
          },
        ),
    },
    researchItem: {
      findUnique: researchItemFindUnique,
      findUniqueOrThrow: researchItemFindUnique,
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    researchSourceSnapshot: {
      update: jest.fn().mockResolvedValue({}),
    },
  };
  const notifications = {
    create: jest.fn().mockResolvedValue(undefined),
    notifyReviewers: jest.fn().mockResolvedValue(undefined),
    publishResearchEvent: jest.fn((event: object) => events.push(event)),
  };
  const profileSync = {
    normalizePublishedOutputs: jest.fn().mockResolvedValue(undefined),
  };
  const rankings = { recalculateMany: jest.fn().mockResolvedValue(undefined) };
  const service = await createDiscoveryService({
    fetcher,
    jobs,
    notifications,
    profileSync,
    prisma,
    rankings,
  });
  const workerIdValue: unknown = Reflect.get(service, 'workerId') as unknown;
  if (typeof workerIdValue !== 'string') {
    throw new Error('Worker ID unavailable');
  }
  const workerId = workerIdValue;
  researchItemFindUnique.mockImplementation(({ select }) =>
    Promise.resolve(
      select
        ? {
            automationOwner: workerId,
            automationVersion: item.automationVersion,
          }
        : {
            ...item,
            submittedBy: item.submittedBy
              ? { role: PlatformRole.MEMBER, ...item.submittedBy }
              : effectiveSubmittedById === null
                ? null
                : {
                    role: PlatformRole.MEMBER,
                    isSystemAccount: false,
                    isDeleted: false,
                    status: AccountStatus.ACTIVE,
                    person: { id: effectiveSubmittedById },
                  },
            submittedById: effectiveSubmittedById,
            type: item.type ?? ResearchItemType.PAPER,
          },
    ),
  );
  service.onModuleInit();
  if (!jobHandler) throw new Error('Discovery job was not registered');
  await jobHandler({ researchItemId: item.id });
  return { events, matchRows, notifications, prisma, profileSync, rankings };
}

describe('research source discovery queue', () => {
  it.each([false, true])(
    'retries transient failures unless a manual decision supersedes the lease (override=%s)',
    async (overridden) => {
      let state: ResearchAutomationState = ResearchAutomationState.QUEUED;
      let owner: string | null = null;
      let version = 1;
      let handler: ((payload: unknown) => Promise<void>) | undefined;
      const fetch = jest
        .fn()
        .mockRejectedValue(new Error('Temporary upstream failure'));
      const prisma = {
        researchItem: {
          updateMany: jest.fn().mockImplementation(
            ({
              where,
              data,
            }: {
              where: {
                OR?: Array<{
                  automationState:
                    ResearchAutomationState | { in: ResearchAutomationState[] };
                }>;
                automationState?: ResearchAutomationState;
                automationOwner?: string;
              };
              data: {
                automationState: ResearchAutomationState;
                automationOwner: string | null;
                automationVersion?: { increment: number };
              };
            }) => {
              if (
                where.OR &&
                !where.OR.some((condition) =>
                  typeof condition.automationState === 'string'
                    ? condition.automationState === state
                    : condition.automationState.in.includes(state),
                )
              )
                return Promise.resolve({ count: 0 });
              if (where.automationOwner && where.automationOwner !== owner)
                return Promise.resolve({ count: 0 });
              state = data.automationState;
              owner = data.automationOwner;
              version += data.automationVersion?.increment ?? 0;
              return Promise.resolve({ count: 1 });
            },
          ),
          findUnique: jest
            .fn()
            .mockImplementation(({ select }: { select?: unknown }) =>
              Promise.resolve(
                select
                  ? { automationOwner: owner, automationVersion: version }
                  : {
                      id: 'retry-item',
                      canonicalUrl: 'https://example.org/paper',
                      paper: null,
                    },
              ),
            ),
        },
        researchSourceSnapshot: { update: jest.fn().mockResolvedValue({}) },
      };
      const service = await createDiscoveryService({
        fetcher: { fetch },
        jobs: {
          register: (_type: string, callback: typeof handler) => {
            handler = callback;
          },
        },
        prisma,
      });
      service.onModuleInit();
      if (!handler) throw new Error('Discovery handler missing');
      await expect(handler({ researchItemId: 'retry-item' })).rejects.toThrow(
        'Temporary upstream failure',
      );
      expect(state).toBe(ResearchAutomationState.FAILED);
      if (overridden) {
        state = ResearchAutomationState.IDLE;
        version++;
        await handler({ researchItemId: 'retry-item' });
      } else {
        await expect(handler({ researchItemId: 'retry-item' })).rejects.toThrow(
          'Temporary upstream failure',
        );
      }
      expect(fetch).toHaveBeenCalledTimes(overridden ? 1 : 2);
    },
  );

  it('rejects stale edit, single-review and bulk-review client revisions before writing', async () => {
    const item = {
      id: 'research-item',
      automationVersion: 5,
      type: ResearchItemType.PAPER,
      reviewStatus: ReviewStatus.NEEDS_REVIEW,
      submittedById: 'member-id',
      contributors: [],
      paper: null,
      dataset: null,
    };
    const transaction = jest.fn();
    const prisma = {
      $transaction: transaction,
      researchItem: {
        findUnique: jest.fn().mockResolvedValue(item),
        findMany: jest
          .fn()
          .mockResolvedValue([
            item,
            { ...item, id: 'current-item', automationVersion: 4 },
          ]),
      },
    };
    const service = await createResearchService({ prisma });
    const reviewer = {
      id: 'reviewer',
      email: 'reviewer@example.org',
      person: null,
      role: PlatformRole.MODERATOR,
      status: AccountStatus.ACTIVE,
    };
    await expect(
      service.updateReviewRecord(
        item.id,
        {
          type: ResearchItemType.PAPER,
          title: 'Stale title',
          canonicalUrl: 'https://example.org/paper',
          contributors: ['Author'],
          expectedAutomationVersion: 4,
        },
        reviewer,
      ),
    ).rejects.toThrow('changed');
    await expect(
      service.review(
        item.id,
        {
          status: ReviewStatus.PUBLISHED,
          expectedAutomationVersion: 4,
        },
        reviewer,
      ),
    ).rejects.toThrow('changed');
    await expect(
      service.bulkReview(
        {
          ids: [item.id, 'current-item'],
          expectedAutomationVersions: [4, 4],
          status: ReviewStatus.PUBLISHED,
        },
        reviewer,
      ),
    ).rejects.toThrow('changed');
    expect(transaction).not.toHaveBeenCalled();
  });

  it('retains unsupported submitted authors for review without auto-publishing', async () => {
    const result = await runDiscovery({
      authors: [{ name: 'Bob Jones' }],
      item: {
        automationVersion: 0,
        canonicalUrl: 'https://example.org/discrepancy',
        contributors: [
          {
            displayName: 'Alice Smith',
            personId: null,
            matches: [],
            sortOrder: 0,
          },
        ],
        id: 'discrepancy',
        paper: null,
        title: 'Research with disputed authors',
        reviewStatus: ReviewStatus.NEEDS_REVIEW,
        submittedById: null,
      },
      people: [],
    });
    expect(result.prisma.researchSourceSnapshot.update).toHaveBeenCalledWith({
      where: { researchItemId: 'discrepancy' },
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      data: expect.objectContaining({
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        metadata: expect.objectContaining({
          authorDiscrepancies: ['Alice Smith'],
        }),
      }),
    });
    expect(result.profileSync.normalizePublishedOutputs).not.toHaveBeenCalled();
    expect(result.events).not.toContainEqual(
      expect.objectContaining({ reviewStatus: ReviewStatus.PUBLISHED }),
    );
  });

  it('binds same-name source authors to their distinct ORCID accounts', async () => {
    const authors = [
      { name: 'Alex Lee', orcid: '0000-0002-1825-0097' },
      { name: 'Alex Lee', orcid: '0000-0001-5109-3700' },
    ];
    const result = await runDiscovery({
      authors,
      item: {
        automationVersion: 0,
        canonicalUrl: 'https://example.org/names',
        contributors: authors.map(({ name }, sortOrder) => ({
          displayName: name,
          sortOrder,
          personId: null,
          matches: [],
        })),
        id: 'same-names',
        paper: null,
        title: 'Same name research',
        reviewStatus: ReviewStatus.NEEDS_REVIEW,
        submittedById: 'owner-user-id',
        submittedBy: {
          isSystemAccount: false,
          isDeleted: false,
          status: AccountStatus.ACTIVE,
          person: { id: 'owner-person-id' },
        },
      },
      people: authors.map(({ name, orcid }, index) => ({
        fullName: name,
        orcid,
        id: `person-${index}`,
      })),
    });
    expect(result.matchRows).toEqual([
      expect.objectContaining({
        contributorSortOrder: 0,
        personId: 'person-0',
        status: ContributorMatchStatus.VERIFIED,
      }),
      expect.objectContaining({
        contributorSortOrder: 1,
        personId: 'person-1',
        status: ContributorMatchStatus.VERIFIED,
      }),
    ]);
    expect(result.profileSync.normalizePublishedOutputs).toHaveBeenCalled();
  });

  it('does not auto-bind repeated source names without identifying evidence', async () => {
    const result = await runDiscovery({
      authors: [{ name: 'Alex Lee' }, { name: 'Alex Lee' }],
      item: {
        automationVersion: 0,
        canonicalUrl: 'https://example.org/ambiguous-source',
        contributors: [0, 1].map((sortOrder) => ({
          displayName: 'Alex Lee',
          sortOrder,
          personId: null,
          matches: [],
        })),
        id: 'ambiguous-source',
        paper: null,
        title: 'Ambiguous source authors',
        reviewStatus: ReviewStatus.NEEDS_REVIEW,
        submittedById: null,
      },
      people: [{ fullName: 'Alex Lee', id: 'person-0' }],
    });
    expect(result.matchRows).toHaveLength(2);
    expect(
      result.matchRows.every(
        ({ status }) => status === ContributorMatchStatus.PROPOSED,
      ),
    ).toBe(true);
    expect(result.prisma.researchContributor.update).not.toHaveBeenCalled();
    expect(result.profileSync.normalizePublishedOutputs).not.toHaveBeenCalled();
  });

  it('auto-verifies strong matches, preserves source names, and publishes imported records', async () => {
    const result = await runDiscovery({
      authors: [
        {
          name: 'Dr. Jane Doe',
          orcid: 'https://orcid.org/0000-0002-1825-0097',
        },
        { name: 'M. F. Mridha' },
      ],
      item: {
        automationVersion: 0,
        canonicalUrl: 'https://example.org/paper',
        contributors: [
          {
            displayName: 'Jane Doe',
            matches: [],
            personId: null,
            sortOrder: 0,
          },
          {
            displayName: 'M. F. Mridha',
            matches: [],
            personId: null,
            sortOrder: 1,
          },
        ],
        id: 'research-item-id',
        paper: null,
        reviewStatus: ReviewStatus.NEEDS_REVIEW,
        submittedById: 'jane-user-id',
        submittedBy: {
          isSystemAccount: false,
          isDeleted: false,
          status: AccountStatus.ACTIVE,
          person: { id: 'jane-person-id' },
        },
        title: 'Imported paper',
      },
      people: [
        {
          fullName: 'Jane Doe',
          id: 'jane-person-id',
          orcid: 'https://orcid.org/0000-0002-1825-0097',
        },
        { fullName: 'Mohammad Firoz Mridha', id: 'mridha-person-id' },
      ],
    });

    expect(result.prisma.researchContributor.createMany).toHaveBeenCalledWith({
      data: [
        expect.objectContaining({ displayName: 'Dr. Jane Doe' }),
        expect.objectContaining({ displayName: 'M. F. Mridha' }),
      ],
    });
    expect(result.matchRows).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          confidence: 1,
          personId: 'jane-person-id',
          status: ContributorMatchStatus.VERIFIED,
        }),
        expect.objectContaining({
          confidence: 0.82,
          personId: 'mridha-person-id',
          status: ContributorMatchStatus.VERIFIED,
        }),
      ]),
    );
    expect(result.prisma.researchContributor.update).toHaveBeenCalledTimes(2);
    expect(result.prisma.researchItem.updateMany).toHaveBeenCalledTimes(3);
    expect(result.profileSync.normalizePublishedOutputs).toHaveBeenCalledWith(
      ['research-item-id'],
      null,
      expect.anything(),
    );
    expect(result.rankings.recalculateMany).toHaveBeenCalledWith([
      'jane-person-id',
      'mridha-person-id',
    ]);
    expect(result.prisma.auditRecord.create).toHaveBeenCalledWith({
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      data: expect.objectContaining({
        action: 'research.published-automatically',
        entityId: 'research-item-id',
      }),
    });
    expect(result.notifications.notifyReviewers).not.toHaveBeenCalled();
    expect(result.notifications.create).toHaveBeenCalled();
    expect(result.events).toEqual(
      expect.arrayContaining([
        {
          kind: 'status',
          reviewStatus: ReviewStatus.PUBLISHED,
          scope: 'research',
          researchItemId: 'research-item-id',
        },
        {
          kind: 'source',
          scope: 'research',
          researchItemId: 'research-item-id',
          sourceStatus: SourceFetchStatus.FETCHED,
        },
      ]),
    );
  });

  it('keeps ambiguous registered matches proposed and blocks publication', async () => {
    const result = await runDiscovery({
      authors: [{ name: 'Alex Lee' }],
      item: {
        automationVersion: 0,
        canonicalUrl: 'https://example.org/ambiguous',
        contributors: [
          {
            displayName: 'Alex Lee',
            matches: [],
            personId: null,
            sortOrder: 0,
          },
        ],
        id: 'ambiguous-item-id',
        paper: null,
        reviewStatus: ReviewStatus.NEEDS_REVIEW,
        submittedById: null,
        title: 'Ambiguous paper',
      },
      people: [
        { fullName: 'Alex Lee', id: 'alex-one-id' },
        { fullName: 'Alex Lee', id: 'alex-two-id' },
      ],
    });

    expect(result.matchRows).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          personId: 'alex-one-id',
          status: ContributorMatchStatus.PROPOSED,
        }),
        expect.objectContaining({
          personId: 'alex-two-id',
          status: ContributorMatchStatus.PROPOSED,
        }),
      ]),
    );
    expect(result.prisma.researchItem.updateMany).toHaveBeenCalledTimes(2);
    expect(result.prisma.auditRecord.create).not.toHaveBeenCalled();
    expect(result.notifications.notifyReviewers).toHaveBeenCalledTimes(1);
    expect(result.notifications.create).not.toHaveBeenCalled();
  });

  it('keeps a fetched record in review when source identity does not match', async () => {
    const result = await runDiscovery({
      authors: [{ name: 'Jane Doe' }],
      item: {
        automationVersion: 0,
        canonicalUrl: 'https://example.org/mismatch',
        contributors: [
          {
            displayName: 'Jane Doe',
            matches: [],
            personId: null,
            sortOrder: 0,
          },
        ],
        id: 'mismatch-item-id',
        paper: null,
        reviewStatus: ReviewStatus.NEEDS_REVIEW,
        submittedById: null,
        title: 'Expected paper title',
      },
      people: [],
      sourceTitle: 'Different paper title',
    });

    expect(result.prisma.researchItem.updateMany).toHaveBeenCalledTimes(2);
    expect(result.prisma.auditRecord.create).not.toHaveBeenCalled();
    expect(result.profileSync.normalizePublishedOutputs).not.toHaveBeenCalled();
    expect(result.rankings.recalculateMany).not.toHaveBeenCalled();
  });

  it('auto-publishes staff on-behalf records but not staff self-submissions', async () => {
    const onBehalf = await runDiscovery({
      authors: [{ name: 'Source Author' }],
      item: {
        automationVersion: 0,
        canonicalUrl: 'https://example.org/on-behalf',
        contributors: [
          {
            displayName: 'Source Author',
            sortOrder: 0,
            personId: null,
            matches: [],
          },
        ],
        id: 'on-behalf-item-id',
        paper: null,
        reviewStatus: ReviewStatus.NEEDS_REVIEW,
        submittedById: 'member-id',
        title: 'Staff submission',
      },
      onBehalfActorId: 'staff-id',
      people: [],
    });
    expect(onBehalf.prisma.auditRecord.create).toHaveBeenCalledWith({
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      data: expect.objectContaining({
        action: 'research.published-automatically',
        entityId: 'on-behalf-item-id',
      }),
    });
    expect(onBehalf.notifications.create).toHaveBeenCalledWith('member-id', {
      actionUrl: '/workspace/research/on-behalf-item-id',
      body: `Staff submission: ${ReviewStatus.PUBLISHED}`,
      title: 'Research submission automatically published',
      type: 'RESEARCH_REVIEWED',
    });

    const selfSubmission = await runDiscovery({
      authors: [],
      item: {
        automationVersion: 0,
        canonicalUrl: 'https://example.org/self-submission',
        contributors: [],
        id: 'self-submission-item-id',
        paper: null,
        reviewStatus: ReviewStatus.NEEDS_REVIEW,
        submittedById: 'staff-id',
        title: 'Staff self submission',
      },
      onBehalfActorId: 'staff-id',
      people: [],
    });
    expect(selfSubmission.prisma.researchItem.updateMany).toHaveBeenCalledTimes(
      2,
    );
    expect(selfSubmission.prisma.auditRecord.create).not.toHaveBeenCalled();
    expect(selfSubmission.notifications.create).not.toHaveBeenCalled();
  });

  it('records pending evidence as soon as a job is queued', async () => {
    const jobs = { enqueueWhileActive: jest.fn().mockResolvedValue('job-id') };
    let upsertInput:
      | {
          create: { status: SourceFetchStatus };
          update: { status: SourceFetchStatus };
        }
      | undefined;
    const upsert = jest.fn(
      (input: NonNullable<typeof upsertInput>): Promise<object> => {
        upsertInput = input;
        return Promise.resolve({});
      },
    );
    const prisma = {
      researchItem: {
        findUnique: jest.fn().mockResolvedValue({
          automationState: ResearchAutomationState.IDLE,
        }),
        update: jest.fn(),
      },
      researchSourceSnapshot: { upsert },
    };
    const service = await createDiscoveryService({ jobs, prisma });

    await expect(
      service.enqueue(
        '0f52c8f1-1bd0-40c6-9724-6b14c2f6fe58',
        'https://example.org/paper',
      ),
    ).resolves.toBe('job-id');
    expect(upsertInput?.create.status).toBe(SourceFetchStatus.PENDING);
    expect(upsertInput?.update.status).toBe(SourceFetchStatus.PENDING);
    expect(prisma.researchItem.update).toHaveBeenCalledWith({
      where: { id: '0f52c8f1-1bd0-40c6-9724-6b14c2f6fe58' },
      data: {
        automationClaimedAt: null,
        automationOwner: null,
        automationState: ResearchAutomationState.QUEUED,
        automationVersion: { increment: 1 },
      },
    });
  });

  it('does not queue another job while source discovery is pending', async () => {
    const discovery = {
      activeJobId: jest.fn().mockResolvedValue('active-job'),
      enqueue: jest.fn(),
    };
    const prisma = {
      researchItem: {
        findUnique: jest.fn().mockResolvedValue({
          canonicalUrl: 'https://example.org/paper',
          id: '0f52c8f1-1bd0-40c6-9724-6b14c2f6fe58',
          sourceSnapshot: { status: SourceFetchStatus.PENDING },
        }),
      },
    };
    const service = await createResearchService({ discovery, prisma });

    await expect(
      service.rediscover('0f52c8f1-1bd0-40c6-9724-6b14c2f6fe58'),
    ).resolves.toEqual({
      deduplicated: true,
      jobId: 'active-job',
      status: SourceFetchStatus.PENDING,
    });
    expect(discovery.enqueue).not.toHaveBeenCalled();
  });

  it('requeues a stale pending snapshot without an active job', async () => {
    const discovery = {
      activeJobId: jest.fn().mockResolvedValue(null),
      enqueue: jest.fn().mockResolvedValue('fresh-job'),
    };
    const prisma = {
      researchItem: {
        findUnique: jest.fn().mockResolvedValue({
          canonicalUrl: 'https://example.org/paper',
          id: '0f52c8f1-1bd0-40c6-9724-6b14c2f6fe58',
          sourceSnapshot: { status: SourceFetchStatus.PENDING },
        }),
      },
    };
    const service = await createResearchService({ discovery, prisma });

    await expect(
      service.rediscover('0f52c8f1-1bd0-40c6-9724-6b14c2f6fe58'),
    ).resolves.toEqual({
      deduplicated: false,
      jobId: 'fresh-job',
      status: SourceFetchStatus.PENDING,
    });
    expect(discovery.enqueue).toHaveBeenCalledTimes(1);
  });

  it('does not publish while canonical source discovery is active', async () => {
    const prisma = {
      researchItem: {
        findUnique: jest.fn().mockResolvedValue({
          automationVersion: 0,
          contributors: [{ personId: null, matches: [] }],
          id: '0f52c8f1-1bd0-40c6-9724-6b14c2f6fe58',
          type: 'PAPER',
          reviewStatus: ReviewStatus.NEEDS_REVIEW,
          sourceSnapshot: { status: SourceFetchStatus.PENDING },
        }),
        update: jest.fn(),
      },
    };
    const service = await createResearchService({ prisma });

    await expect(
      service.review(
        '0f52c8f1-1bd0-40c6-9724-6b14c2f6fe58',
        { status: ReviewStatus.PUBLISHED, expectedAutomationVersion: 0 },
        {
          email: 'admin@example.org',
          id: 'admin-id',
          person: null,
          role: PlatformRole.ADMIN,
          status: AccountStatus.ACTIVE,
        },
      ),
    ).rejects.toThrow('Canonical source discovery is still in progress');
    expect(prisma.researchItem.update).not.toHaveBeenCalled();
  });

  it('does not store a review note when publishing research', async () => {
    let updateInput: { data: { reviewNote?: string | null } } | undefined;
    const prisma = {
      researchItem: {
        findUnique: jest.fn().mockResolvedValue({
          contributors: [{ personId: null, matches: [] }],
          id: '0f52c8f1-1bd0-40c6-9724-6b14c2f6fe58',
          automationVersion: 0,
          reviewStatus: ReviewStatus.NEEDS_REVIEW,
          sourceSnapshot: { status: SourceFetchStatus.FETCHED },
          submittedById: 'owner-user-id',
          submittedBy: {
            isSystemAccount: false,
            isDeleted: false,
            status: AccountStatus.ACTIVE,
            person: { id: 'owner-person-id' },
          },
          type: 'PAPER',
        }),
        updateMany: jest.fn((input: NonNullable<typeof updateInput>) => {
          updateInput = input;
          return Promise.resolve({ count: 1 });
        }),
        findUniqueOrThrow: jest.fn().mockResolvedValue({}),
      },
      researchSourceSnapshot: {
        findUnique: jest.fn().mockResolvedValue({
          status: SourceFetchStatus.FETCHED,
        }),
      },
      contributorMatch: { findFirst: jest.fn().mockResolvedValue(null) },
      reviewRecord: { create: jest.fn() },
    };
    const service = await createResearchService({ prisma });

    await service.review(
      '0f52c8f1-1bd0-40c6-9724-6b14c2f6fe58',
      {
        note: 'do not store this',
        status: ReviewStatus.PUBLISHED,
        expectedAutomationVersion: 0,
      },
      {
        email: 'admin@example.org',
        id: 'admin-id',
        person: null,
        role: PlatformRole.ADMIN,
        status: AccountStatus.ACTIVE,
      },
    );

    expect(updateInput?.data.reviewNote).toBeNull();
  });

  it('rejects a human review when worker already won the generation race', async () => {
    const prisma = {
      researchItem: {
        findUnique: jest.fn().mockResolvedValue({
          automationVersion: 4,
          contributors: [],
          id: '0f52c8f1-1bd0-40c6-9724-6b14c2f6fe58',
          reviewStatus: ReviewStatus.NEEDS_REVIEW,
          sourceSnapshot: { status: SourceFetchStatus.FETCHED },
          type: 'PAPER',
        }),
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
      },
    };
    const service = await createResearchService({ prisma });

    await expect(
      service.review(
        '0f52c8f1-1bd0-40c6-9724-6b14c2f6fe58',
        {
          status: ReviewStatus.REJECTED,
          note: 'Not verified',
          expectedAutomationVersion: 4,
        },
        {
          email: 'admin@example.org',
          id: 'admin-id',
          person: null,
          role: PlatformRole.ADMIN,
          status: AccountStatus.ACTIVE,
        },
      ),
    ).rejects.toThrow('changed or no longer passes');
  });

  it('requires a reviewer note for negative research decisions', async () => {
    const prisma = {
      researchItem: {
        findUnique: jest.fn().mockResolvedValue({
          automationVersion: 0,
          contributors: [],
          id: '0f52c8f1-1bd0-40c6-9724-6b14c2f6fe58',
          reviewStatus: ReviewStatus.NEEDS_REVIEW,
          sourceSnapshot: { status: SourceFetchStatus.FETCHED },
          type: 'PAPER',
        }),
        update: jest.fn(),
      },
    };
    const service = await createResearchService({ prisma });

    await expect(
      service.review(
        '0f52c8f1-1bd0-40c6-9724-6b14c2f6fe58',
        { status: ReviewStatus.REJECTED, expectedAutomationVersion: 0 },
        {
          email: 'admin@example.org',
          id: 'admin-id',
          person: null,
          role: PlatformRole.ADMIN,
          status: AccountStatus.ACTIVE,
        },
      ),
    ).rejects.toThrow('A reviewer note is required');
    expect(prisma.researchItem.update).not.toHaveBeenCalled();
  });
});
