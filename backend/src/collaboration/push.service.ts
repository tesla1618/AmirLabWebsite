import {
  BadRequestException,
  ConflictException,
  Injectable,
  OnModuleInit,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import webPush, { type PushSubscription } from 'web-push';
import type { Prisma } from '../../generated/prisma/client';
import type { Environment } from '../config/environment';
import { PrismaService } from '../database/prisma.service';
import { JobsService } from '../jobs/jobs.service';

const JOB_TYPE = 'WEB_PUSH';

// Provider hosts are intentionally bounded: an authenticated endpoint must not turn
// the backend into an arbitrary HTTP client, including via redirects.
export function isPushEndpoint(value: string): boolean {
  try {
    const url = new URL(value);
    return (
      url.protocol === 'https:' &&
      !url.username &&
      !url.password &&
      !url.port &&
      !url.hash &&
      (url.hostname === 'fcm.googleapis.com' ||
        url.hostname === 'updates.push.services.mozilla.com' ||
        url.hostname === 'web.push.apple.com' ||
        /^[a-z0-9-]+\.notify\.windows\.com$/.test(url.hostname))
    );
  } catch {
    return false;
  }
}

function workspaceUrl(value: string): string {
  const base = 'https://amirlab.invalid';
  try {
    const url = new URL(value, base);
    if (
      url.origin === base &&
      (url.pathname === '/workspace' || url.pathname.startsWith('/workspace/'))
    ) {
      return url.pathname + url.search;
    }
  } catch {
    /* Invalid destinations use the inbox. */
  }
  return '/workspace/notifications';
}

@Injectable()
export class PushService implements OnModuleInit {
  private readonly enabled: boolean;

  constructor(
    private readonly config: ConfigService<Environment, true>,
    private readonly prisma: PrismaService,
    private readonly jobs: JobsService,
  ) {
    const subject = config.get('vapidSubject', { infer: true });
    const publicKey = config.get('vapidPublicKey', { infer: true });
    const privateKey = config.get('vapidPrivateKey', { infer: true });
    this.enabled = !!(subject && publicKey && privateKey);
    if (subject && publicKey && privateKey)
      webPush.setVapidDetails(subject, publicKey, privateKey);
  }

  onModuleInit(): void {
    this.jobs.register(JOB_TYPE, (payload) => this.deliver(payload));
  }

  publicKey(): string | null {
    return this.enabled
      ? (this.config.get('vapidPublicKey', { infer: true }) ?? null)
      : null;
  }

  async subscribe(
    userId: string,
    sessionId: string,
    subscription: PushSubscription,
    userAgent?: string,
  ) {
    if (!this.enabled)
      throw new BadRequestException('Push notifications are unavailable.');
    if (
      !isPushEndpoint(subscription.endpoint) ||
      !/^[A-Za-z0-9_-]{87}$/.test(subscription.keys.p256dh) ||
      !/^[A-Za-z0-9_-]{22}$/.test(subscription.keys.auth) ||
      Buffer.from(subscription.keys.p256dh, 'base64url')[0] !== 4
    ) {
      throw new BadRequestException('Invalid push subscription.');
    }
    const session = await this.prisma.session.findFirst({
      where: {
        id: sessionId,
        userId,
        revokedAt: null,
        expiresAt: { gt: new Date() },
        user: { status: 'ACTIVE', isDeleted: false },
      },
      select: { id: true },
    });
    if (!session)
      throw new UnauthorizedException({
        code: 'SESSION_INVALID',
        message: 'Your session has ended. Please sign in again.',
      });
    const existing = await this.prisma.pushSubscription.findFirst({
      where: { endpoint: subscription.endpoint },
      select: { userId: true },
    });
    if (existing && existing.userId !== userId)
      throw new ConflictException(
        'This browser subscription belongs to another account.',
      );
    try {
      return await this.prisma.pushSubscription.upsert({
        where: { endpoint: subscription.endpoint, userId },
        create: {
          userId,
          sessionId,
          endpoint: subscription.endpoint,
          p256dh: subscription.keys.p256dh,
          auth: subscription.keys.auth,
          userAgent,
        },
        update: {
          userId,
          sessionId,
          p256dh: subscription.keys.p256dh,
          auth: subscription.keys.auth,
          userAgent,
        },
        select: { id: true },
      });
    } catch (error: unknown) {
      if (
        typeof error === 'object' &&
        error !== null &&
        'code' in error &&
        error.code === 'P2002'
      ) {
        throw new ConflictException(
          'This browser subscription belongs to another account.',
        );
      }
      throw error;
    }
  }

  async unsubscribe(userId: string, sessionId: string, endpoint: string) {
    await this.prisma.pushSubscription.deleteMany({
      where: { userId, sessionId, endpoint },
    });
    return { unsubscribed: true };
  }

  private eligibility(userId: string): Prisma.PushSubscriptionWhereInput {
    return {
      userId,
      session: {
        is: {
          userId,
          revokedAt: null,
          expiresAt: { gt: new Date() },
          user: { status: 'ACTIVE', isDeleted: false },
        },
      },
    };
  }

  // Persist the inbox event and its fan-out on the same transaction so a worker
  // crash cannot leave an inbox notification without a durable delivery job.
  async enqueueNotification(
    tx: Prisma.TransactionClient,
    notificationId: string,
    userId: string,
  ): Promise<void> {
    if (!this.enabled) return;
    const subscriptions = await tx.pushSubscription.findMany({
      where: this.eligibility(userId),
      select: { id: true },
    });
    for (const subscription of subscriptions) {
      const uniqueKey = `push:${notificationId}:${subscription.id}`;
      await tx.job.upsert({
        where: { uniqueKey },
        update: {},
        create: {
          type: JOB_TYPE,
          uniqueKey,
          payload: { notificationId, subscriptionId: subscription.id, userId },
        },
      });
    }
  }

  async notifyUsers(
    userIds: string[],
    payload: { title: string; body: string; url: string },
  ): Promise<void> {
    if (!this.enabled) return;
    for (const userId of new Set(userIds)) {
      const subscriptions = await this.prisma.pushSubscription.findMany({
        where: this.eligibility(userId),
        select: { id: true },
      });
      for (const subscription of subscriptions) {
        await this.jobs.enqueue(JOB_TYPE, {
          subscriptionId: subscription.id,
          userId,
          url: workspaceUrl(payload.url),
        });
      }
    }
  }

  async test(userId: string, sessionId: string): Promise<{ queued: number }> {
    if (!this.enabled)
      throw new BadRequestException('Push notifications are unavailable.');
    const subscriptions = await this.prisma.pushSubscription.findMany({
      where: { ...this.eligibility(userId), sessionId },
      select: { id: true },
    });
    for (const subscription of subscriptions) {
      await this.jobs.enqueue(JOB_TYPE, {
        subscriptionId: subscription.id,
        userId,
        url: '/workspace/settings/account',
      });
    }
    return { queued: subscriptions.length };
  }

  private async deliver(payload: Prisma.JsonValue): Promise<void> {
    if (
      !this.enabled ||
      !payload ||
      typeof payload !== 'object' ||
      Array.isArray(payload) ||
      typeof payload.subscriptionId !== 'string' ||
      typeof payload.userId !== 'string'
    )
      return;
    const subscription = await this.prisma.pushSubscription.findFirst({
      where: {
        id: payload.subscriptionId,
        ...this.eligibility(payload.userId),
      },
    });
    if (!subscription || !isPushEndpoint(subscription.endpoint)) return;
    let url =
      typeof payload.url === 'string'
        ? payload.url
        : '/workspace/notifications';
    if (typeof payload.notificationId === 'string') {
      const notification = await this.prisma.notification.findFirst({
        where: { id: payload.notificationId, recipientId: payload.userId },
        select: { actionUrl: true },
      });
      if (!notification) return;
      url = notification.actionUrl ?? url;
    }
    try {
      await webPush.sendNotification(
        {
          endpoint: subscription.endpoint,
          keys: { p256dh: subscription.p256dh, auth: subscription.auth },
        },
        JSON.stringify({
          title: 'AMIRLab',
          body: 'You have a new workspace update.',
          url: workspaceUrl(url),
          tag:
            typeof payload.notificationId === 'string'
              ? payload.notificationId
              : undefined,
        }),
        { timeout: 10_000, TTL: 60 * 60 },
      );
    } catch (error: unknown) {
      const statusCode =
        typeof error === 'object' && error !== null && 'statusCode' in error
          ? error.statusCode
          : undefined;
      if (statusCode === 404 || statusCode === 410) {
        await this.prisma.pushSubscription.deleteMany({
          where: { id: subscription.id },
        });
        return;
      }
      const status =
        typeof statusCode === 'number' &&
        Number.isInteger(statusCode) &&
        statusCode >= 100 &&
        statusCode <= 599
          ? statusCode
          : 'UNKNOWN';
      const code =
        typeof error === 'object' &&
        error !== null &&
        'code' in error &&
        typeof error.code === 'string' &&
        [
          'ETIMEDOUT',
          'ECONNRESET',
          'ECONNREFUSED',
          'ENOTFOUND',
          'EAI_AGAIN',
          'EPIPE',
        ].includes(error.code)
          ? error.code
          : 'UNKNOWN';
      // The worker persists this message. Keep provider bodies, endpoints and keys out.
      throw new Error(
        `Push provider delivery failed. status=${status} code=${code} subscription=${subscription.id}`,
        { cause: error },
      );
    }
  }
}
