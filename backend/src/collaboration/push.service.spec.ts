import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import webPush from 'web-push';
import { PrismaService } from '../database/prisma.service';
import { JobsService } from '../jobs/jobs.service';
import { resolveService } from '../../test/resolve-service';
import { PushService } from './push.service';

jest.mock('web-push', () => ({
  __esModule: true,
  default: { setVapidDetails: jest.fn(), sendNotification: jest.fn() },
}));

describe('PushService delivery', () => {
  const prisma = {
    pushSubscription: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
      deleteMany: jest.fn(),
      upsert: jest.fn(),
    },
    session: { findFirst: jest.fn() },
    notification: { findFirst: jest.fn() },
    job: { upsert: jest.fn() },
  };
  let handler: (payload: {
    subscriptionId: string;
    userId: string;
    url: string;
  }) => Promise<void>;
  const jobs = {
    register: jest.fn((_type: string, callback: typeof handler) => {
      handler = callback;
    }),
    enqueue: jest.fn(),
  };
  const send = jest.mocked(webPush.sendNotification);
  const config = { get: jest.fn(() => 'configured') };
  const subscription = {
    id: 'sub',
    userId: 'user',
    endpoint: 'https://fcm.googleapis.com/fcm/send/example',
    p256dh: 'key',
    auth: 'auth',
  };

  beforeEach(() => {
    jest.clearAllMocks();
    prisma.pushSubscription.findFirst.mockResolvedValue(subscription);
    prisma.session.findFirst.mockResolvedValue({ id: 'session' });
    prisma.pushSubscription.findMany.mockResolvedValue([subscription]);
  });

  async function service() {
    return resolveService(PushService, [
      { provide: PrismaService, useValue: prisma },
      { provide: ConfigService, useValue: config },
      { provide: JobsService, useValue: jobs },
    ]);
  }

  it('queues chat delivery instead of sending private message content inline', async () => {
    await (
      await service()
    ).notifyUsers(['user'], {
      title: 'Private sender',
      body: 'Secret message',
      url: '/workspace/chat',
    });
    expect(webPush.sendNotification).not.toHaveBeenCalled();
    expect(jobs.enqueue).toHaveBeenCalledWith('WEB_PUSH', {
      subscriptionId: 'sub',
      userId: 'user',
      url: '/workspace/chat',
    });
  });

  it('requires active owned session eligibility when selecting devices', async () => {
    await (
      await service()
    ).notifyUsers(['user'], {
      title: 'title',
      body: 'body',
      url: '/workspace',
    });
    const future: unknown = expect.any(Date);
    const activeSession: unknown = expect.objectContaining({
      revokedAt: null,
      expiresAt: { gt: future },
    });
    const owned: unknown = expect.objectContaining({
      session: { is: activeSession },
    });
    expect(prisma.pushSubscription.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: owned }),
    );
  });

  it('rechecks eligibility on every retry and never sends after revocation', async () => {
    const push = await service();
    push.onModuleInit();
    send.mockRejectedValueOnce(new Error('temporary provider error'));
    const payload = {
      subscriptionId: 'sub',
      userId: 'user',
      url: '/workspace',
    };
    await expect(handler(payload)).rejects.toThrow(
      'Push provider delivery failed.',
    );
    prisma.pushSubscription.findFirst.mockResolvedValueOnce(null);
    await expect(handler(payload)).resolves.toBeUndefined();
    expect(send).toHaveBeenCalledTimes(1);
    const session: unknown = expect.any(Object);
    const owned: unknown = expect.objectContaining({ userId: 'user', session });
    expect(prisma.pushSubscription.findFirst).toHaveBeenLastCalledWith(
      expect.objectContaining({ where: owned }),
    );
  });

  it('retains safe provider diagnostics without exposing subscription secrets', async () => {
    const push = await service();
    push.onModuleInit();
    send.mockRejectedValueOnce({
      statusCode: 429,
      message: 'private provider message',
      body: 'private provider body',
      endpoint: subscription.endpoint,
    });
    const error: unknown = await handler({
      subscriptionId: 'sub',
      userId: 'user',
      url: '/workspace',
    }).catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(Error);
    if (!(error instanceof Error))
      throw new Error('Expected a delivery failure');
    expect(error.message).toContain('status=429');
    expect(error.message).toContain('subscription=sub');
    expect(error.message).not.toContain('private');
    expect(error.message).not.toContain(subscription.endpoint);
  });

  it.each([404, 410])(
    'discards an expired endpoint (%i) without retrying',
    async (statusCode) => {
      const push = await service();
      push.onModuleInit();
      send.mockRejectedValueOnce({ statusCode });
      await expect(
        handler({ subscriptionId: 'sub', userId: 'user', url: '/workspace' }),
      ).resolves.toBeUndefined();
      expect(prisma.pushSubscription.deleteMany).toHaveBeenCalledWith({
        where: { id: 'sub' },
      });
    },
  );

  it('sends generic lock-screen content and confines destinations to workspace', async () => {
    const push = await service();
    push.onModuleInit();
    send.mockResolvedValueOnce({ statusCode: 201, body: '', headers: {} });
    await handler({
      subscriptionId: 'sub',
      userId: 'user',
      url: '//evil.example/workspace',
    });
    const serialized = send.mock.calls[0][1];
    expect(typeof serialized).toBe('string');
    if (typeof serialized !== 'string')
      throw new Error('Expected JSON push payload');
    const payload: unknown = JSON.parse(serialized);
    expect(payload).toEqual({
      title: 'AMIRLab',
      body: 'You have a new workspace update.',
      url: '/workspace/notifications',
    });
  });

  it('refuses an endpoint owned by another account', async () => {
    prisma.pushSubscription.findFirst.mockResolvedValue({
      ...subscription,
      userId: 'other-user',
    });
    const p256dh = Buffer.concat([Buffer.from([4]), Buffer.alloc(64)]).toString(
      'base64url',
    );
    await expect(
      (await service()).subscribe('user', 'session', {
        endpoint: subscription.endpoint,
        keys: { p256dh, auth: Buffer.alloc(16).toString('base64url') },
      }),
    ).rejects.toThrow();
    expect(prisma.pushSubscription.upsert).not.toHaveBeenCalled();
  });

  it('refuses private-network and arbitrary public subscription endpoints', async () => {
    const p256dh = Buffer.concat([Buffer.from([4]), Buffer.alloc(64)]).toString(
      'base64url',
    );
    for (const endpoint of [
      'https://127.0.0.1/send',
      'https://example.org/send',
      'http://fcm.googleapis.com/send',
      'https://fcm.googleapis.com.evil.example/send',
    ]) {
      await expect(
        (await service()).subscribe('user', 'session', {
          endpoint,
          keys: { p256dh, auth: Buffer.alloc(16).toString('base64url') },
        }),
      ).rejects.toThrow('Invalid push subscription.');
    }
    expect(prisma.pushSubscription.upsert).not.toHaveBeenCalled();
  });

  it('deduplicates inbox fanout permanently per notification and device', async () => {
    const module = await Test.createTestingModule({
      providers: [{ provide: PrismaService, useValue: prisma }],
    }).compile();
    const tx = module.get(PrismaService);
    const storedKeys = new Set<string>();
    prisma.job.upsert.mockImplementation(
      (input: { where: { uniqueKey: string } }) => {
        storedKeys.add(input.where.uniqueKey);
        return Promise.resolve({ id: input.where.uniqueKey });
      },
    );
    const push = await service();
    await push.enqueueNotification(tx, 'notification', 'user');
    await push.enqueueNotification(tx, 'notification', 'user');
    expect([...storedKeys]).toEqual(['push:notification:sub']);
    await module.close();
  });

  it('refuses registration after the current session expires or is revoked', async () => {
    prisma.session.findFirst.mockResolvedValueOnce(null);
    const p256dh = Buffer.concat([Buffer.from([4]), Buffer.alloc(64)]).toString(
      'base64url',
    );
    await expect(
      (await service()).subscribe('user', 'session', {
        endpoint: subscription.endpoint,
        keys: { p256dh, auth: Buffer.alloc(16).toString('base64url') },
      }),
    ).rejects.toThrow('Your session has ended.');
    expect(prisma.pushSubscription.upsert).not.toHaveBeenCalled();
  });

  it('unsubscribes only the current account and session device', async () => {
    await (
      await service()
    ).unsubscribe('user', 'session', subscription.endpoint);
    expect(prisma.pushSubscription.deleteMany).toHaveBeenCalledWith({
      where: {
        userId: 'user',
        sessionId: 'session',
        endpoint: subscription.endpoint,
      },
    });
  });

  it('queues test delivery only for the current session', async () => {
    const push = await service();
    await expect(push.test('user', 'session')).resolves.toEqual({ queued: 1 });
    const owned: unknown = expect.objectContaining({
      userId: 'user',
      sessionId: 'session',
    });
    expect(prisma.pushSubscription.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: owned }),
    );
    expect(jobs.enqueue).toHaveBeenCalledWith('WEB_PUSH', {
      userId: 'user',
      subscriptionId: 'sub',
      url: '/workspace/settings/account',
    });
  });
});
