import { Test } from '@nestjs/testing';
import {
  AccountStatus,
  PlatformRole,
  ProfileReviewStatus,
} from '../../generated/prisma/client';
import { AssetsService } from '../assets/assets.service';
import { PrismaService } from '../database/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { ResearchProfileSyncService } from '../research/research-profile-sync.service';
import { SettingsService } from '../settings/settings.service';
import { ProfilesService } from './profiles.service';

async function createProfilesService({
  assets = {},
  notifications = {},
  prisma = {},
  profileSync = {},
  settings = {},
}: {
  assets?: object;
  notifications?: object;
  prisma?: object;
  profileSync?: object;
  settings?: object;
} = {}) {
  const module = await Test.createTestingModule({
    providers: [
      ProfilesService,
      { provide: AssetsService, useValue: assets },
      { provide: NotificationsService, useValue: notifications },
      { provide: PrismaService, useValue: prisma },
      { provide: ResearchProfileSyncService, useValue: profileSync },
      { provide: SettingsService, useValue: settings },
    ],
  }).compile();
  return module.get(ProfilesService);
}

describe('ProfilesService review', () => {
  it('publishes administrator profile edits immediately under manual policy', async () => {
    const transaction = {
      auditRecord: { create: jest.fn().mockResolvedValue({}) },
      person: { update: jest.fn().mockResolvedValue({}) },
      profileEditRequest: {
        deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
      },
    };
    const prisma = {
      $transaction: jest.fn(
        (callback: (client: typeof transaction) => Promise<void>) =>
          callback(transaction),
      ),
      person: {
        findUnique: jest.fn().mockResolvedValue({
          avatarId: null,
          id: 'admin-person-id',
          profileEditRequest: null,
          userId: 'admin-id',
        }),
      },
    };
    const service = await createProfilesService({
      assets: { remove: jest.fn() },
      notifications: { notifyReviewers: jest.fn() },
      prisma,
      profileSync: { normalizePublishedOutputsForPeople: jest.fn() },
      settings: {
        verification: jest.fn().mockResolvedValue({ profileEdit: 'MANUAL' }),
      },
    });

    const result = await service.submit(
      { profile: JSON.stringify({ fullName: 'Updated Admin' }) },
      {
        email: 'admin@example.org',
        id: 'admin-id',
        person: {
          avatar: null,
          fullName: 'Admin User',
          id: 'admin-person-id',
          isPublished: false,
          rank: null,
          slug: 'admin-user',
        },
        role: PlatformRole.ADMIN,
        status: AccountStatus.ACTIVE,
      },
    );

    expect(result).toEqual({ outcome: 'APPLIED', direct: true });
    expect(transaction.person.update).toHaveBeenCalledTimes(1);
    expect(transaction.profileEditRequest.deleteMany).toHaveBeenCalledWith({
      where: { personId: 'admin-person-id' },
    });
  });

  it('queues moderator shared fields and avatar removal under manual policy', async () => {
    const request = {
      avatarAsset: null,
      id: 'moderator-request-id',
      payload: {
        contactAddress: 'Lab office',
        fullName: 'Lab Moderator',
        phone: '+880 1000 000000',
        removeAvatar: true,
        roleTitle: 'Operations Moderator',
      },
      revision: 1,
      status: ProfileReviewStatus.NEEDS_REVIEW,
    };
    const prisma = {
      person: {
        findUnique: jest.fn().mockResolvedValue({
          avatarId: 'existing-avatar',
          id: 'moderator-person-id',
          profileEditRequest: null,
        }),
      },
      profileEditRequest: {
        upsert: jest.fn().mockResolvedValue(request),
      },
    };
    const service = await createProfilesService({
      assets: { remove: jest.fn() },
      notifications: {
        notifyReviewers: jest.fn().mockResolvedValue(undefined),
      },
      prisma,
      profileSync: {},
      settings: {
        verification: jest.fn().mockResolvedValue({ profileEdit: 'MANUAL' }),
      },
    });

    const result = await service.submit(
      {
        profile: JSON.stringify({
          contactAddress: 'Lab office',
          fullName: 'Lab Moderator',
          phone: '+880 1000 000000',
          roleTitle: 'Operations Moderator',
        }),
        removeAvatar: 'true',
      },
      {
        email: 'moderator@example.org',
        id: 'moderator-id',
        person: {
          avatar: null,
          fullName: 'Lab Moderator',
          id: 'moderator-person-id',
          isPublished: true,
          rank: null,
          slug: 'lab-moderator',
        },
        role: PlatformRole.MODERATOR,
        status: AccountStatus.ACTIVE,
      },
    );

    expect(result).toEqual({ ...request, outcome: 'QUEUED_FOR_REVIEW' });
    expect(prisma.profileEditRequest.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        create: expect.objectContaining({
          avatarAssetId: null,
          // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
          payload: expect.objectContaining({
            contactAddress: 'Lab office',
            fullName: 'Lab Moderator',
            phone: '+880 1000 000000',
            removeAvatar: true,
            roleTitle: 'Operations Moderator',
          }),
        }),
      }),
    );
  });

  it('applies moderator shared fields without overwriting research data', async () => {
    let personUpdateData: Record<string, unknown> | undefined;
    const transaction = {
      auditRecord: { create: jest.fn().mockResolvedValue({}) },
      person: {
        update: jest.fn((input: { data: Record<string, unknown> }) => {
          personUpdateData = input.data;
          return Promise.resolve({});
        }),
      },
      profileEditRequest: {
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
    };
    const prisma = {
      $transaction: jest.fn(
        (callback: (client: typeof transaction) => Promise<void>) =>
          callback(transaction),
      ),
      profileEditRequest: {
        findUnique: jest.fn().mockResolvedValue({
          avatarAssetId: null,
          id: 'moderator-request-id',
          payload: {
            biography: null,
            contactAddress: 'Lab office',
            expertise: [],
            fullName: 'Lab Moderator',
            headline: null,
            links: [],
            phone: '+880 1000 000000',
            removeAvatar: false,
            roleTitle: 'Operations Moderator',
            sections: [],
          },
          person: {
            avatarId: 'existing-avatar',
            user: { role: PlatformRole.MODERATOR },
            userId: 'moderator-id',
          },
          personId: 'moderator-person-id',
          revision: 1,
          status: ProfileReviewStatus.NEEDS_REVIEW,
        }),
      },
    };
    const service = await createProfilesService({
      assets: { remove: jest.fn() },
      notifications: { create: jest.fn().mockResolvedValue(undefined) },
      prisma,
      profileSync: {
        normalizePublishedOutputsForPeople: jest
          .fn()
          .mockResolvedValue(undefined),
      },
      settings: {},
    });

    await service.review(
      'moderator-request-id',
      { revision: 1, status: ProfileReviewStatus.APPROVED },
      {
        email: 'admin@example.org',
        id: 'admin-id',
        person: null,
        role: PlatformRole.ADMIN,
        status: AccountStatus.ACTIVE,
      },
    );

    expect(personUpdateData).toEqual({
      avatarId: 'existing-avatar',
      contactAddress: 'Lab office',
      fullName: 'Lab Moderator',
      isPublished: true,
      phone: '+880 1000 000000',
      roleTitle: 'Operations Moderator',
    });
    expect(personUpdateData).not.toHaveProperty('biography');
    expect(personUpdateData).not.toHaveProperty('expertise');
    expect(personUpdateData).not.toHaveProperty('headline');
    expect(personUpdateData).not.toHaveProperty('links');
    expect(personUpdateData).not.toHaveProperty('profileSections');
  });

  it('returns an explicit queued outcome for member profile edits under manual policy', async () => {
    const request = {
      avatarAsset: null,
      id: 'profile-request-id',
      payload: { fullName: 'Member User' },
      revision: 1,
      status: ProfileReviewStatus.NEEDS_REVIEW,
    };
    const service = await createProfilesService({
      assets: { remove: jest.fn() },
      notifications: {
        notifyReviewers: jest.fn().mockResolvedValue(undefined),
      },
      prisma: {
        person: {
          findUnique: jest.fn().mockResolvedValue({
            avatarId: null,
            fullName: 'Member User',
            id: 'member-person-id',
            profileEditRequest: null,
          }),
        },
        profileEditRequest: {
          upsert: jest.fn().mockResolvedValue(request),
        },
      },
      profileSync: {},
      settings: {
        verification: jest.fn().mockResolvedValue({ profileEdit: 'MANUAL' }),
      },
    });

    const result = await service.submit(
      { profile: JSON.stringify({ fullName: 'Member User' }) },
      {
        email: 'member@example.org',
        id: 'member-id',
        person: {
          avatar: null,
          fullName: 'Member User',
          id: 'member-person-id',
          isPublished: true,
          rank: null,
          slug: 'member-user',
        },
        role: PlatformRole.MEMBER,
        status: AccountStatus.ACTIVE,
      },
    );

    expect(result).toEqual({ ...request, outcome: 'QUEUED_FOR_REVIEW' });
  });

  it('preserves the published avatar when a text-only edit is approved', async () => {
    const assets = { remove: jest.fn() };
    const notifications = { create: jest.fn().mockResolvedValue(undefined) };
    let personUpdateInput: { data: { avatarId?: string | null } } | undefined;
    const transaction = {
      auditRecord: { create: jest.fn().mockResolvedValue({}) },
      person: {
        update: jest.fn(
          (input: NonNullable<typeof personUpdateInput>): Promise<object> => {
            personUpdateInput = input;
            return Promise.resolve({});
          },
        ),
      },
      profileEditRequest: {
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
    };
    const prisma = {
      $transaction: jest.fn(
        (callback: (client: typeof transaction) => Promise<void>) =>
          callback(transaction),
      ),
      profileEditRequest: {
        findUnique: jest.fn().mockResolvedValue({
          avatarAssetId: null,
          id: 'request-id',
          payload: {
            biography: 'Updated biography',
            contactAddress: null,
            expertise: [],
            fullName: 'Jane Researcher',
            headline: null,
            links: [],
            phone: null,
            removeAvatar: false,
            sections: [],
          },
          person: {
            avatarId: 'existing-avatar',
            userId: 'member-id',
          },
          personId: 'person-id',
          revision: 2,
          status: ProfileReviewStatus.NEEDS_REVIEW,
        }),
      },
    };
    const settings = {
      verification: jest.fn().mockResolvedValue({ profileEdit: 'MANUAL' }),
    };
    const service = await createProfilesService({
      assets,
      notifications,
      prisma,
      profileSync: {
        normalizePublishedOutputsForPeople: jest
          .fn()
          .mockResolvedValue(undefined),
      },
      settings,
    });

    await service.review(
      'request-id',
      {
        note: 'do not store this',
        revision: 2,
        status: ProfileReviewStatus.APPROVED,
      },
      {
        email: 'admin@example.org',
        id: 'admin-id',
        person: null,
        role: PlatformRole.ADMIN,
        status: AccountStatus.ACTIVE,
      },
    );

    expect(personUpdateInput?.data.avatarId).toBe('existing-avatar');
    expect(transaction.profileEditRequest.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        data: expect.objectContaining({ note: null }),
      }),
    );
    expect(notifications.create).toHaveBeenCalledWith(
      'member-id',
      expect.objectContaining({
        body: 'Your latest profile changes were reviewed.',
      }),
    );
    expect(assets.remove).not.toHaveBeenCalled();
  });

  it('rejects self-review for both profile decisions before opening a transaction', async () => {
    const prisma = {
      $transaction: jest.fn(),
      profileEditRequest: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'request-id',
          payload: {},
          person: {
            userId: 'reviewer-id',
            user: { role: PlatformRole.MEMBER },
          },
          revision: 2,
          status: ProfileReviewStatus.NEEDS_REVIEW,
        }),
      },
    };
    const service = await createProfilesService({
      assets: { remove: jest.fn() },
      notifications: { create: jest.fn() },
      prisma,
      profileSync: { normalizePublishedOutputsForPeople: jest.fn() },
      settings: { verification: jest.fn() },
    });
    const reviewer = {
      email: 'reviewer@example.org',
      id: 'reviewer-id',
      person: null,
      role: PlatformRole.ADMIN,
      status: AccountStatus.ACTIVE,
    };

    for (const status of [
      ProfileReviewStatus.APPROVED,
      ProfileReviewStatus.REJECTED,
    ]) {
      await expect(
        service.review(
          'request-id',
          {
            revision: 2,
            status,
            ...(status === ProfileReviewStatus.REJECTED
              ? { note: 'Not allowed' }
              : {}),
          },
          reviewer,
        ),
      ).rejects.toThrow('You cannot review your own profile edit.');
    }
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('rejects mixed self-review profile bulk decisions atomically', async () => {
    const prisma = {
      $transaction: jest.fn(),
      profileEditRequest: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'self-request-id',
            person: { userId: 'reviewer-id' },
            personId: 'self-person-id',
            revision: 1,
            status: ProfileReviewStatus.NEEDS_REVIEW,
          },
          {
            id: 'other-request-id',
            person: { userId: 'other-id' },
            personId: 'other-person-id',
            revision: 1,
            status: ProfileReviewStatus.NEEDS_REVIEW,
          },
        ]),
      },
    };
    const service = await createProfilesService({
      assets: { removeMany: jest.fn() },
      notifications: { createMany: jest.fn() },
      prisma,
      profileSync: {},
      settings: {},
    });
    const reviewer = {
      email: 'reviewer@example.org',
      id: 'reviewer-id',
      person: null,
      role: PlatformRole.ADMIN,
      status: AccountStatus.ACTIVE,
    };

    for (const status of [
      ProfileReviewStatus.APPROVED,
      ProfileReviewStatus.REJECTED,
    ]) {
      await expect(
        service.bulkReview(
          {
            items: [
              { id: 'self-request-id', revision: 1 },
              { id: 'other-request-id', revision: 1 },
            ],
            status,
            ...(status === ProfileReviewStatus.REJECTED
              ? { note: 'Not allowed' }
              : {}),
          },
          reviewer,
        ),
      ).rejects.toThrow('You cannot review your own profile edit.');
    }
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('requires a reviewer note when rejecting profile changes', async () => {
    const service = await createProfilesService({
      assets: { remove: jest.fn() },
      notifications: { create: jest.fn() },
      prisma: {
        profileEditRequest: {
          findUnique: jest.fn().mockResolvedValue({
            id: 'request-id',
            payload: {
              biography: null,
              contactAddress: null,
              expertise: [],
              fullName: 'Jane Researcher',
              headline: null,
              links: [],
              phone: null,
              removeAvatar: false,
              sections: [],
            },
            person: { avatarId: null, userId: 'member-id' },
            revision: 2,
            status: ProfileReviewStatus.NEEDS_REVIEW,
          }),
        },
      },
      profileSync: { normalizePublishedOutputsForPeople: jest.fn() },
      settings: { verification: jest.fn() },
    });

    await expect(
      service.review(
        'request-id',
        { revision: 2, status: ProfileReviewStatus.REJECTED },
        {
          email: 'admin@example.org',
          id: 'admin-id',
          person: null,
          role: PlatformRole.ADMIN,
          status: AccountStatus.ACTIVE,
        },
      ),
    ).rejects.toThrow('A reviewer note is required');
  });
});
