import {
  AccountStatus,
  PlatformRole,
  ResearchItemType,
  ReviewStatus,
} from '../../generated/prisma/client';
import type { AuthenticatedUser } from '../auth/auth.types';
import type { NotificationsService } from '../notifications/notifications.service';
import type { PrismaService } from '../database/prisma.service';
import type { RankingsService } from './rankings.service';
import type { SettingsService } from '../settings/settings.service';
import type { ResearchDiscoveryService } from './research-discovery.service';
import type { ResearchProfileSyncService } from './research-profile-sync.service';
import { ResearchService } from './research.service';
import type { SubmitResearchDto } from './dto/research.dto';

function createResearchService({
  discovery,
  notifications,
  prisma,
  settings,
}: {
  discovery: object;
  notifications: object;
  prisma: object;
  settings: object;
}): ResearchService {
  const prismaValue = Object.assign(
    {
      $transaction: (callback: (transaction: object) => unknown) =>
        Promise.resolve(callback(prisma)),
    },
    prisma,
  );
  return new ResearchService(
    discovery as ResearchDiscoveryService,
    notifications as NotificationsService,
    prismaValue as PrismaService,
    {} as ResearchProfileSyncService,
    {} as RankingsService,
    settings as SettingsService,
  );
}

function submission(overrides: Partial<SubmitResearchDto> = {}) {
  return {
    canonicalUrl: 'https://example.org/paper',
    contributors: ['Asha Rahman'],
    title: 'A useful paper',
    type: ResearchItemType.PAPER,
    ...overrides,
  } satisfies SubmitResearchDto;
}

function user(overrides: Partial<AuthenticatedUser> = {}): AuthenticatedUser {
  return {
    email: 'admin@example.org',
    id: 'admin-id',
    person: null,
    role: PlatformRole.ADMIN,
    status: AccountStatus.ACTIVE,
    ...overrides,
  };
}

describe('ResearchService.submit provenance and verification', () => {
  it('queues administrator on-behalf submissions before source verification', async () => {
    const create = jest.fn().mockResolvedValue({
      id: 'research-item-id',
      reviewStatus: ReviewStatus.NEEDS_REVIEW,
      submittedById: 'submitter-user-id',
      title: 'A useful paper',
    });
    const auditCreate = jest.fn().mockResolvedValue({});
    const notifyReviewers = jest.fn().mockResolvedValue(undefined);
    const enqueue = jest.fn().mockResolvedValue('job-id');
    const prisma = {
      auditRecord: { create: auditCreate },
      paper: { create: jest.fn().mockResolvedValue({}) },
      person: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'submitter-person-id',
          userId: 'submitter-user-id',
        }),
      },
      researchItem: {
        create,
        findUnique: jest.fn().mockResolvedValue(null),
      },
    };
    const service = createResearchService({
      discovery: { enqueue },
      notifications: {
        notifyReviewers,
        publishResearchEvent: jest.fn(),
      },
      prisma,
      settings: {
        verification: jest.fn().mockResolvedValue({
          newDataset: 'MANUAL',
          newPaper: 'AUTOMATIC',
        }),
      },
    });

    const result = await service.submit(
      submission({
        overrideReason: 'Operator requested expedited handling',
        publishNow: true,
        submitterPersonId: 'submitter-person-id',
      }),
      user(),
    );

    expect(result).toMatchObject({
      outcome: 'QUEUED_FOR_REVIEW',
      submittedById: 'submitter-user-id',
    });
    expect(create).toHaveBeenCalledWith({
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      data: expect.objectContaining({
        publishedAt: undefined,
        reviewStatus: ReviewStatus.NEEDS_REVIEW,
        reviewedById: undefined,
        submittedById: 'submitter-user-id',
      }),
    });
    expect(auditCreate).toHaveBeenCalledTimes(1);
    expect(auditCreate).toHaveBeenCalledWith({
      data: {
        action: 'research.submitted-on-behalf',
        actorId: 'admin-id',
        details: { submittedForPersonId: 'submitter-person-id' },
        entityId: 'research-item-id',
        entityType: 'ResearchItem',
      },
    });
    expect(notifyReviewers).toHaveBeenCalledTimes(1);
    expect(enqueue).toHaveBeenCalledWith(
      'research-item-id',
      'https://example.org/paper',
    );
  });

  it('queues member automatic submissions for source verification', async () => {
    const create = jest.fn().mockResolvedValue({
      id: 'research-item-id',
      reviewStatus: ReviewStatus.NEEDS_REVIEW,
      submittedById: 'member-id',
      title: 'A useful paper',
    });
    const auditCreate = jest.fn().mockResolvedValue({});
    const notifyReviewers = jest.fn().mockResolvedValue(undefined);
    const prisma = {
      auditRecord: { create: auditCreate },
      paper: { create: jest.fn().mockResolvedValue({}) },
      person: { findFirst: jest.fn() },
      researchItem: {
        create,
        findUnique: jest.fn().mockResolvedValue(null),
      },
    };
    const service = createResearchService({
      discovery: { enqueue: jest.fn().mockResolvedValue('job-id') },
      notifications: {
        notifyReviewers,
        publishResearchEvent: jest.fn(),
      },
      prisma,
      settings: {
        verification: jest.fn().mockResolvedValue({
          newDataset: 'MANUAL',
          newPaper: 'AUTOMATIC',
        }),
      },
    });

    const result = await service.submit(
      submission(),
      user({
        id: 'member-id',
        person: {
          avatar: null,
          fullName: 'Member Person',
          id: 'member-person-id',
          isPublished: true,
          rank: null,
          slug: 'member-person',
        },
        role: PlatformRole.MEMBER,
      }),
    );

    expect(result).toMatchObject({
      outcome: 'QUEUED_FOR_REVIEW',
      submittedById: 'member-id',
    });
    expect(create).toHaveBeenCalledWith({
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      data: expect.objectContaining({
        reviewStatus: ReviewStatus.NEEDS_REVIEW,
        submittedById: 'member-id',
      }),
    });
    expect(auditCreate).not.toHaveBeenCalled();
    expect(notifyReviewers).toHaveBeenCalledTimes(1);
    expect(prisma.person.findFirst).not.toHaveBeenCalled();
  });

  it('includes published submissions in the accountable person profile outputs', async () => {
    const findFirst = jest.fn().mockResolvedValue({
      id: 'accountable-person',
      appointedRank: null,
      contributions: [],
      earnedRank: null,
      fullName: 'Member Person',
      user: null,
    });
    const outputs = ['PAPER', 'DATASET', 'PROJECT'].map((type) => ({
      id: type,
      type,
      contributors: [{ personId: 'another-person' }],
    }));
    const findMany = jest.fn().mockResolvedValue(outputs);
    const service = createResearchService({
      discovery: {},
      notifications: {},
      prisma: { person: { findFirst }, researchItem: { findMany } },
      settings: {},
    });

    const profile = await service.personBySlug('member-person');
    expect(profile.contributions).toEqual(
      outputs.map((researchItem) => ({ researchItem })),
    );
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
          AND: expect.arrayContaining([
            expect.objectContaining({ reviewStatus: 'PUBLISHED' }),
            {
              OR: [
                { contributors: { some: { personId: 'accountable-person' } } },
                {
                  submittedBy: {
                    is: { person: { is: { id: 'accountable-person' } } },
                  },
                },
              ],
            },
          ]),
        },
      }),
    );
  });
});
