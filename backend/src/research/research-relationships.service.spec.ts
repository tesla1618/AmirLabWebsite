import { ConflictException } from '@nestjs/common';
import {
  AccountStatus,
  ContributorMatchSource,
  ContributorMatchStatus,
  PlatformRole,
  ResearchAutomationState,
} from '../../generated/prisma/client';
import { PrismaService } from '../database/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { resolveService } from '../../test/resolve-service';
import { ResearchProfileSyncService } from './research-profile-sync.service';
import { ResearchRelationshipsService } from './research-relationships.service';
import { ResearchService } from './research.service';

describe('ResearchRelationshipsService authorized review and revisions', () => {
  const reviewer = {
    email: 'reviewer@example.org',
    id: 'reviewer-id',
    person: {
      avatar: null,
      fullName: 'Reviewer',
      id: 'reviewer-person-id',
      isPublished: true,
      rank: null,
      slug: 'reviewer',
    },
    role: PlatformRole.MODERATOR,
    status: AccountStatus.ACTIVE,
  };
  const prisma = {
    $transaction: jest.fn(),
    contributorMatch: {
      findUnique: jest.fn(),
      upsert: jest.fn(),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    person: { findFirst: jest.fn() },
    researchContributor: { findUnique: jest.fn(), update: jest.fn() },
    researchItem: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
    auditRecord: { create: jest.fn() },
  };
  const notifications = {
    create: jest.fn(),
    notifyReviewers: jest.fn(),
  };
  const profileSync = {
    normalizePublishedOutputs: jest.fn(),
  };
  const research = { recalculateRank: jest.fn() };

  beforeEach(() => {
    jest.clearAllMocks();
    prisma.$transaction.mockImplementation((work: (value: object) => unknown) =>
      work(prisma),
    );
  });

  async function service() {
    return resolveService(ResearchRelationshipsService, [
      { provide: NotificationsService, useValue: notifications },
      { provide: PrismaService, useValue: prisma },
      { provide: ResearchProfileSyncService, useValue: profileSync },
      { provide: ResearchService, useValue: research },
    ]);
  }

  it('allows an authorized moderator to review their own USER_CLAIM', async () => {
    prisma.contributorMatch.findUnique.mockResolvedValue({
      contributor: { researchItem: { title: 'Research output' } },
      id: 'match-id',
      person: { id: 'another-person-id' },
      requestedById: reviewer.id,
      source: ContributorMatchSource.USER_CLAIM,
      status: ContributorMatchStatus.PROPOSED,
    });
    const relationships = await service();

    await expect(
      relationships.review(
        'match-id',
        {
          expectedAutomationVersion: 0,
          status: ContributorMatchStatus.VERIFIED,
        },
        reviewer,
      ),
    ).resolves.toMatchObject({ status: ContributorMatchStatus.VERIFIED });
    expect(prisma.auditRecord.create).toHaveBeenCalled();
  });

  it('allows a moderator to reject a match targeting their own profile', async () => {
    prisma.contributorMatch.findUnique.mockResolvedValue({
      contributor: { researchItem: { title: 'Research output' } },
      id: 'match-id',
      person: { id: reviewer.person.id },
      requestedById: 'another-user-id',
      source: ContributorMatchSource.ADMIN_MANUAL,
      status: ContributorMatchStatus.PROPOSED,
    });
    const relationships = await service();

    await expect(
      relationships.review(
        'match-id',
        {
          expectedAutomationVersion: 0,
          note: 'Not verified',
          status: ContributorMatchStatus.REJECTED,
        },
        reviewer,
      ),
    ).resolves.toMatchObject({ status: ContributorMatchStatus.REJECTED });
    expect(prisma.auditRecord.create).toHaveBeenCalled();
  });

  it('allows direct links targeting the authorized reviewer person', async () => {
    prisma.researchContributor.findUnique.mockResolvedValue({
      displayName: 'Reviewer',
      researchItem: { reviewStatus: 'NEEDS_REVIEW' },
    });
    prisma.person.findFirst.mockResolvedValue({ id: reviewer.person.id });
    prisma.contributorMatch.upsert.mockResolvedValue({ id: 'match-id' });
    const relationships = await service();

    await expect(
      relationships.link(
        'research-item-id',
        0,
        { expectedAutomationVersion: 0, personId: reviewer.person.id },
        reviewer,
      ),
    ).resolves.toMatchObject({ id: 'match-id' });
    expect(prisma.researchContributor.update).toHaveBeenCalled();
  });

  it('rejects contributor links from a stale research revision', async () => {
    prisma.researchContributor.findUnique.mockResolvedValue({
      displayName: 'Contributor',
      researchItem: { reviewStatus: 'NEEDS_REVIEW', type: 'PAPER' },
    });
    prisma.person.findFirst.mockResolvedValue({
      id: 'target-person-id',
    });
    prisma.researchItem.updateMany.mockResolvedValue({ count: 0 });
    const relationships = await service();

    await expect(
      relationships.link(
        'research-item-id',
        0,
        { expectedAutomationVersion: 3, personId: 'target-person-id' },
        reviewer,
      ),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(prisma.contributorMatch.upsert).not.toHaveBeenCalled();
  });

  it.each([ResearchAutomationState.QUEUED, ResearchAutomationState.RUNNING])(
    'blocks claims, links and match reviews while discovery is %s',
    async (state) => {
      const contributor = {
        displayName: 'Source Author',
        personId: null,
        researchItem: { automationVersion: 7, automationState: state },
      };
      prisma.researchContributor.findUnique.mockResolvedValue(contributor);
      prisma.person.findFirst.mockResolvedValue({ id: 'target-person' });
      prisma.contributorMatch.findUnique.mockResolvedValue({
        id: 'match-id',
        researchItemId: 'research-id',
        person: { id: 'target-person' },
        contributor,
        source: ContributorMatchSource.SOURCE_METADATA,
        status: ContributorMatchStatus.PROPOSED,
      });
      prisma.researchItem.updateMany.mockImplementation(
        ({ where }: { where: { automationState: { notIn: string[] } } }) =>
          Promise.resolve({
            count: where.automationState?.notIn.includes(state) ? 0 : 1,
          }),
      );
      const relationships = await service();
      await expect(
        relationships.claim(
          'research-id',
          0,
          {
            expectedAutomationVersion: 7,
          },
          reviewer,
        ),
      ).rejects.toBeInstanceOf(ConflictException);
      await expect(
        relationships.link(
          'research-id',
          0,
          {
            expectedAutomationVersion: 7,
            personId: 'target-person',
          },
          reviewer,
        ),
      ).rejects.toBeInstanceOf(ConflictException);
      await expect(
        relationships.review(
          'match-id',
          {
            expectedAutomationVersion: 7,
            status: ContributorMatchStatus.VERIFIED,
          },
          reviewer,
        ),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(prisma.contributorMatch.upsert).not.toHaveBeenCalled();
    },
  );
});
