import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { Observable, Subscriber } from 'rxjs';
import {
  ApplicationStatus,
  NotificationType,
  PlatformRole,
  Prisma,
  ProfileReviewStatus,
  ReviewStatus,
  SourceFetchStatus,
  WeeklyReportStatus,
} from '../../generated/prisma/client';
import type { AuthenticatedUser } from '../auth/auth.types';
import { PrismaService } from '../database/prisma.service';
import {
  NotificationQueryDto,
  NotificationReadFilter,
} from './dto/notification-query.dto';

export interface NotificationEvent {
  id: string;
  type: NotificationType;
  title: string;
  body: string;
  actionUrl: string | null;
  createdAt: Date;
}

export interface NotificationCreateInput {
  recipientId: string;
  type: NotificationType;
  title: string;
  body: string;
  actionUrl?: string;
  payload?: Prisma.InputJsonValue;
  uniqueKey?: string;
}

export interface ResearchLiveEvent {
  scope: 'research';
  kind: 'source' | 'status';
  researchItemId: string;
  reviewStatus?: ReviewStatus;
  sourceStatus?: SourceFetchStatus;
}

type NotificationStreamEvent =
  { data: NotificationEvent } | { type: 'research'; data: ResearchLiveEvent };

type NotificationSubscriber = Subscriber<NotificationStreamEvent>;

@Injectable()
export class NotificationsService {
  private readonly subscribers = new Map<string, Set<NotificationSubscriber>>();
  private readonly researchSubscribers = new Set<NotificationSubscriber>();

  constructor(private readonly prisma: PrismaService) {}

  async list(recipientId: string, query: NotificationQueryDto) {
    const createdAt: Prisma.DateTimeFilter = {};
    if (query.from) createdAt.gte = new Date(query.from);
    if (query.to) {
      const end = new Date(query.to);
      end.setUTCHours(23, 59, 59, 999);
      createdAt.lte = end;
    }
    const where: Prisma.NotificationWhereInput = {
      recipientId,
      ...(query.read === NotificationReadFilter.READ
        ? { readAt: { not: null } }
        : query.read === NotificationReadFilter.UNREAD
          ? { readAt: null }
          : {}),
      ...(query.from || query.to ? { createdAt } : {}),
    };
    const [items, total, unreadCount] = await Promise.all([
      this.prisma.notification.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.prisma.notification.count({ where }),
      this.prisma.notification.count({
        where: { recipientId, readAt: null },
      }),
    ]);
    return {
      items,
      page: query.page,
      pageSize: query.pageSize,
      total,
      totalPages: Math.ceil(total / query.pageSize),
      unreadCount,
    };
  }

  unreadCount(recipientId: string): Promise<number> {
    return this.prisma.notification.count({
      where: { recipientId, readAt: null },
    });
  }

  async workspaceCounts(user: AuthenticatedUser) {
    const canReview = user.role !== PlatformRole.MEMBER;
    const isAdmin = user.role === PlatformRole.ADMIN;
    const [
      unreadCount,
      profileReviews,
      researchReviews,
      projectReviews,
      weeklyReportReviews,
      applications,
    ] = await Promise.all([
      this.prisma.notification.count({
        where: { recipientId: user.id, readAt: null },
      }),
      canReview
        ? this.prisma.profileEditRequest.count({
            where: { status: ProfileReviewStatus.NEEDS_REVIEW },
          })
        : Promise.resolve(0),
      canReview
        ? this.prisma.researchItem.count({
            where: {
              reviewStatus: {
                in: [ReviewStatus.NEEDS_REVIEW, ReviewStatus.CHANGES_REQUESTED],
              },
            },
          })
        : Promise.resolve(0),
      canReview
        ? this.prisma.projectChangeRequest.count({
            where: { status: 'NEEDS_REVIEW' },
          })
        : Promise.resolve(0),
      canReview
        ? this.prisma.weeklyReport.count({
            where: { status: WeeklyReportStatus.SUBMITTED },
          })
        : Promise.resolve(0),
      isAdmin
        ? this.prisma.application.count({
            where: { status: ApplicationStatus.NEEDS_REVIEW },
          })
        : Promise.resolve(0),
    ]);
    return {
      applications,
      profileReviews,
      projectReviews,
      researchReviews,
      unreadCount,
      weeklyReportReviews,
    };
  }

  async markRead(
    recipientId: string,
    id: string,
  ): Promise<{ updated: boolean }> {
    const result = await this.prisma.notification.updateMany({
      where: { id, recipientId },
      data: { readAt: new Date() },
    });
    return { updated: result.count === 1 };
  }

  async markUnread(
    recipientId: string,
    id: string,
  ): Promise<{ updated: boolean }> {
    const result = await this.prisma.notification.updateMany({
      where: { id, recipientId },
      data: { readAt: null },
    });
    return { updated: result.count === 1 };
  }

  stream(
    userId: string,
    receiveResearchEvents = false,
  ): Observable<NotificationStreamEvent> {
    return new Observable((subscriber) => {
      const userSubscribers = this.subscribers.get(userId) ?? new Set();
      userSubscribers.add(subscriber);
      this.subscribers.set(userId, userSubscribers);
      if (receiveResearchEvents) this.researchSubscribers.add(subscriber);

      return () => {
        userSubscribers.delete(subscriber);
        this.researchSubscribers.delete(subscriber);
        if (userSubscribers.size === 0) {
          this.subscribers.delete(userId);
        }
      };
    });
  }

  publishResearchEvent(event: ResearchLiveEvent): void {
    for (const subscriber of this.researchSubscribers) {
      subscriber.next({ data: event, type: 'research' });
    }
  }

  async notifyReviewers(input: {
    type: NotificationType;
    title: string;
    body: string;
    actionUrl?: string;
    payload?: Prisma.InputJsonValue;
  }): Promise<void> {
    const reviewers = await this.prisma.user.findMany({
      where: {
        role: { in: [PlatformRole.MODERATOR, PlatformRole.ADMIN] },
        status: 'ACTIVE',
      },
      select: { id: true },
    });
    await Promise.all(reviewers.map(({ id }) => this.create(id, input)));
  }

  async createMany(inputs: readonly NotificationCreateInput[]): Promise<void> {
    if (!inputs.length) return;
    const createdAt = new Date();
    const rows = inputs.map((input) => ({
      ...input,
      actionUrl: input.actionUrl ?? null,
      createdAt,
      id: randomUUID(),
    }));
    await this.prisma.notification.createMany({ data: rows });
    for (const notification of rows) {
      const event: NotificationEvent = {
        actionUrl: notification.actionUrl,
        body: notification.body,
        createdAt: notification.createdAt,
        id: notification.id,
        title: notification.title,
        type: notification.type,
      };
      for (const subscriber of this.subscribers.get(notification.recipientId) ??
        []) {
        subscriber.next({ data: event });
      }
    }
  }

  async create(
    recipientId: string,
    input: {
      type: NotificationType;
      title: string;
      body: string;
      actionUrl?: string;
      payload?: Prisma.InputJsonValue;
    },
  ): Promise<void> {
    const notification = await this.prisma.notification.create({
      data: { recipientId, ...input },
      select: {
        id: true,
        type: true,
        title: true,
        body: true,
        actionUrl: true,
        createdAt: true,
      },
    });
    for (const subscriber of this.subscribers.get(recipientId) ?? []) {
      subscriber.next({ data: notification });
    }
  }

  async createOnce(
    recipientId: string,
    uniqueKey: string,
    input: {
      type: NotificationType;
      title: string;
      body: string;
      actionUrl?: string;
      payload?: Prisma.InputJsonValue;
    },
  ): Promise<boolean> {
    try {
      const notification = await this.prisma.notification.create({
        data: { recipientId, uniqueKey, ...input },
        select: {
          id: true,
          type: true,
          title: true,
          body: true,
          actionUrl: true,
          createdAt: true,
        },
      });
      for (const subscriber of this.subscribers.get(recipientId) ?? []) {
        subscriber.next({ data: notification });
      }
      return true;
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        return false;
      }
      throw error;
    }
  }
}
