jest.mock('../../generated/prisma/client', () => ({
  ApplicationStatus: { NEEDS_REVIEW: 'NEEDS_REVIEW' },
  NotificationType: {},
  PlatformRole: { ADMIN: 'ADMIN', MEMBER: 'MEMBER', MODERATOR: 'MODERATOR' },
  PrismaClient: class PrismaClient {},
  Prisma: {
    PrismaClientKnownRequestError: class extends Error {
      code = 'P2002';
    },
  },
  ProfileReviewStatus: { NEEDS_REVIEW: 'NEEDS_REVIEW' },
  ReviewStatus: {
    CHANGES_REQUESTED: 'CHANGES_REQUESTED',
    NEEDS_REVIEW: 'NEEDS_REVIEW',
  },
}));

import { PushService } from '../collaboration/push.service';
import { NotificationType, Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../database/prisma.service';
import { resolveService } from '../../test/resolve-service';
import { NotificationsService } from './notifications.service';

describe('NotificationsService read state', () => {
  const prisma = {
    notification: {
      updateMany: jest.fn(),
    },
  };

  beforeEach(() => {
    prisma.notification.updateMany.mockReset();
  });

  it('marks only recipient-owned notifications unread', async () => {
    prisma.notification.updateMany.mockResolvedValue({ count: 1 });
    const service = await resolveService(NotificationsService, [
      { provide: PrismaService, useValue: prisma },
      { provide: PushService, useValue: {} },
    ]);

    await expect(
      service.markUnread('recipient-id', 'notification-id'),
    ).resolves.toEqual({ updated: true });
    expect(prisma.notification.updateMany).toHaveBeenCalledWith({
      data: { readAt: null },
      where: { id: 'notification-id', recipientId: 'recipient-id' },
    });
  });

  it('reports no update when the notification does not belong to the recipient', async () => {
    prisma.notification.updateMany.mockResolvedValue({ count: 0 });
    const service = await resolveService(NotificationsService, [
      { provide: PrismaService, useValue: prisma },
      { provide: PushService, useValue: {} },
    ]);

    await expect(
      service.markUnread('recipient-id', 'other-id'),
    ).resolves.toEqual({ updated: false });
  });
});

describe('NotificationsService durable push', () => {
  const notification = {
    id: 'inbox-id',
    type: 'REVIEW',
    title: 'Secret title',
    body: 'Secret body',
    actionUrl: '/workspace',
    createdAt: new Date(),
  };
  const tx = { notification: { create: jest.fn() } };
  const prisma = {
    notification: tx.notification,
    $transaction: jest.fn(
      async (callback: (client: typeof tx) => Promise<unknown>) => callback(tx),
    ),
  };
  const push = { enqueueNotification: jest.fn() };
  beforeEach(() => {
    jest.clearAllMocks();
    tx.notification.create.mockResolvedValue(notification);
  });
  async function service() {
    return resolveService(NotificationsService, [
      { provide: PrismaService, useValue: prisma },
      { provide: PushService, useValue: push },
    ]);
  }
  it('persists the notification and delivery fanout in one transaction', async () => {
    await (
      await service()
    ).create('recipient', {
      type: NotificationType.SYSTEM,
      title: 'Secret title',
      body: 'Secret body',
    });
    expect(prisma.$transaction).toHaveBeenCalled();
    expect(push.enqueueNotification).toHaveBeenCalledWith(
      tx,
      'inbox-id',
      'recipient',
    );
  });
  it('does not enqueue again for a duplicate inbox unique key', async () => {
    const serviceInstance = await service();
    const input = {
      type: NotificationType.SYSTEM,
      title: 'title',
      body: 'body',
    };
    await expect(
      serviceInstance.createOnce('recipient', 'event-key', input),
    ).resolves.toBe(true);
    tx.notification.create.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('duplicate', {
        code: 'P2002',
        clientVersion: 'test',
      }),
    );
    await expect(
      serviceInstance.createOnce('recipient', 'event-key', input),
    ).resolves.toBe(false);
    expect(push.enqueueNotification).toHaveBeenCalledTimes(1);
  });
});
