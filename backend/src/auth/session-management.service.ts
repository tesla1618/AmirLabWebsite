import { Injectable, Logger } from '@nestjs/common';
import { EventEmitter } from 'node:events';
import { Observable } from 'rxjs';
import { AccountStatus } from '../../generated/prisma/client';
import { PrismaService } from '../database/prisma.service';

@Injectable()
export class SessionManagementService {
  private readonly revoked = new EventEmitter();
  private readonly logger = new Logger(SessionManagementService.name);

  constructor(private readonly prisma: PrismaService) {
    this.revoked.setMaxListeners(0);
  }

  async list(userId: string, currentSessionId: string) {
    const sessions = await this.prisma.session.findMany({
      where: { userId, revokedAt: null, expiresAt: { gt: new Date() } },
      select: {
        id: true,
        userAgent: true,
        ipAddress: true,
        createdAt: true,
        lastSeenAt: true,
        expiresAt: true,
      },
      orderBy: { lastSeenAt: 'desc' },
    });
    return sessions.map((session) => ({
      ...session,
      current: session.id === currentSessionId,
    }));
  }

  async revoke(userId: string, sessionId: string) {
    const revoked = await this.prisma.$transaction(async (transaction) => {
      const result = await transaction.session.updateMany({
        where: { id: sessionId, userId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      if (result.count)
        await transaction.auditRecord.create({
          data: {
            action: 'auth.session-revoked',
            actorId: userId,
            entityId: sessionId,
            entityType: 'Session',
          },
        });
      return result.count > 0;
    });
    if (revoked) this.revoked.emit(userId, sessionId);
    return { revoked };
  }

  async revokeOthers(userId: string, currentSessionId: string) {
    const count = await this.prisma.$transaction(async (transaction) => {
      const result = await transaction.session.updateMany({
        where: { userId, id: { not: currentSessionId }, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      if (result.count)
        await transaction.auditRecord.create({
          data: {
            action: 'auth.other-sessions-revoked',
            actorId: userId,
            entityId: userId,
            entityType: 'User',
            details: { count: result.count },
          },
        });
      return result.count;
    });
    if (count) this.revoked.emit(userId, undefined, currentSessionId);
    return { revoked: count };
  }

  async isActive(userId: string, sessionId: string): Promise<boolean> {
    return (
      (await this.prisma.session.count({
        where: {
          id: sessionId,
          userId,
          revokedAt: null,
          expiresAt: { gt: new Date() },
          user: { status: AccountStatus.ACTIVE, isDeleted: false },
        },
      })) > 0
    );
  }

  /** Local revocation is immediate; polling also covers password changes and other machines. */
  invalidations(userId: string, sessionId: string): Observable<void> {
    return new Observable((subscriber) => {
      const invalidate = () => {
        subscriber.next();
        subscriber.complete();
      };
      const listener = (revokedId?: string, retainedId?: string) => {
        if (revokedId === sessionId || (!revokedId && retainedId !== sessionId))
          invalidate();
      };
      let checking = false;
      const timer = setInterval(() => {
        if (checking || subscriber.closed) return;
        checking = true;
        void this.isActive(userId, sessionId)
          .then((active) => {
            if (!active) invalidate();
          })
          .catch(() => {
            this.logger.warn(
              'Session validation unavailable; closing live connection',
            );
            invalidate();
          })
          .finally(() => {
            checking = false;
          });
      }, 5_000);
      this.revoked.on(userId, listener);
      return () => {
        clearInterval(timer);
        this.revoked.off(userId, listener);
      };
    });
  }
}
