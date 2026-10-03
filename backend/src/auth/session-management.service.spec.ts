jest.mock('../../generated/prisma/client', () => ({
  AccountStatus: { ACTIVE: 'ACTIVE' },
  PrismaClient: class PrismaClient {},
}));
import type { Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../database/prisma.service';
import { resolveService } from '../../test/resolve-service';
import { SessionManagementService } from './session-management.service';

async function fixture() {
  const session = {
    findMany: jest
      .fn<
        Promise<
          Array<{
            id: string;
            userAgent: string;
            createdAt: Date;
            lastSeenAt: Date;
            expiresAt: Date;
            ipAddress: null;
          }>
        >,
        [Prisma.SessionFindManyArgs]
      >()
      .mockResolvedValue([
        {
          id: 'current',
          userAgent: 'browser',
          createdAt: new Date(),
          lastSeenAt: new Date(),
          expiresAt: new Date(),
          ipAddress: null,
        },
      ]),
    updateMany: jest
      .fn<Promise<{ count: number }>, [Prisma.SessionUpdateManyArgs]>()
      .mockResolvedValue({ count: 1 }),
    count: jest.fn().mockResolvedValue(1),
  };
  const auditRecord = { create: jest.fn() };
  const prisma = {
    session,
    auditRecord,
    $transaction: jest.fn(
      async (
        fn: (tx: {
          session: typeof session;
          auditRecord: typeof auditRecord;
        }) => Promise<unknown>,
      ) => fn({ session, auditRecord }),
    ),
  };
  const service = await resolveService(SessionManagementService, [
    { provide: PrismaService, useValue: prisma },
  ]);
  return { service, session, auditRecord };
}

describe('Session management', () => {
  it('lists only active owned sessions and selects no authentication secrets', async () => {
    const { service, session } = await fixture();
    expect(await service.list('owner', 'current')).toEqual([
      expect.objectContaining({ id: 'current', current: true }),
    ]);
    expect(session.findMany.mock.calls[0]?.[0]).toMatchObject({
      where: { userId: 'owner', revokedAt: null },
      select: { id: true, userAgent: true, lastSeenAt: true },
    });
    expect(session.findMany.mock.calls[0]?.[0]).toHaveProperty(
      'where.expiresAt.gt',
      expect.any(Date),
    );
    expect(session.findMany.mock.calls[0]?.[0].select).not.toHaveProperty(
      'tokenHash',
    );
  });
  it('revokes only an owned active session and audits the result', async () => {
    const { service, session, auditRecord } = await fixture();
    expect(await service.revoke('owner', 'other')).toEqual({ revoked: true });
    expect(session.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'other', userId: 'owner', revokedAt: null },
      }),
    );
    expect(auditRecord.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: {
          actorId: 'owner',
          action: 'auth.session-revoked',
          entityId: 'other',
          entityType: 'Session',
        },
      }),
    );
  });
  it('preserves the current session when revoking all others', async () => {
    const { service, session } = await fixture();
    await service.revokeOthers('owner', 'current');
    expect(session.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId: 'owner', id: { not: 'current' }, revokedAt: null },
      }),
    );
  });
  it('closes a revoked live session immediately while preserving the current connection', async () => {
    const { service } = await fixture();
    const currentInvalidated = jest.fn();
    const otherInvalidated = jest.fn();
    const current = service
      .invalidations('owner', 'current')
      .subscribe(currentInvalidated);
    const other = service
      .invalidations('owner', 'other')
      .subscribe(otherInvalidated);
    await service.revokeOthers('owner', 'current');
    expect(otherInvalidated).toHaveBeenCalledTimes(1);
    expect(currentInvalidated).not.toHaveBeenCalled();
    expect(other.closed).toBe(true);
    current.unsubscribe();
  });
  it('closes connections when cross-machine revocation is observed', async () => {
    jest.useFakeTimers();
    try {
      const { service, session } = await fixture();
      session.count.mockResolvedValue(0);
      const invalidated = jest.fn();
      const connection = service
        .invalidations('owner', 'current')
        .subscribe(invalidated);
      await jest.advanceTimersByTimeAsync(5000);
      expect(invalidated).toHaveBeenCalledTimes(1);
      expect(connection.closed).toBe(true);
    } finally {
      jest.useRealTimers();
    }
  });
  it('does not create an audit event when a session is not owned or already revoked', async () => {
    const { service, session, auditRecord } = await fixture();
    session.updateMany.mockResolvedValue({ count: 0 });
    expect(await service.revoke('owner', 'foreign')).toEqual({
      revoked: false,
    });
    expect(auditRecord.create).not.toHaveBeenCalled();
  });
});
