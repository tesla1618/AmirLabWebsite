jest.mock('../../generated/prisma/client', () => ({
  AccountStatus: { ACTIVE: 'ACTIVE' },
  PrismaClient: class PrismaClient {},
}));
import { Subject } from 'rxjs';
import { NotificationsController } from './notifications.controller';
import { NotificationsService } from './notifications.service';
import { SessionManagementService } from '../auth/session-management.service';
import { resolveService } from '../../test/resolve-service';
import type { AuthenticatedUser } from '../auth/auth.types';

describe('Notification session revocation', () => {
  it('drops queued events after revocation and closes the stream', async () => {
    const events = new Subject<{ data: string }>();
    const invalidated = new Subject<void>();
    const sessions = {
      isActive: jest.fn().mockResolvedValue(false),
      invalidations: jest.fn(() => invalidated),
    };
    const controller = await resolveService(NotificationsController, [
      { provide: NotificationsService, useValue: { stream: () => events } },
      { provide: SessionManagementService, useValue: sessions },
    ]);
    const received = jest.fn();
    const completed = jest.fn();
    const user = { id: 'owner', role: 'ADMIN' } as AuthenticatedUser;
    controller
      .events(user, 'session')
      .subscribe({ next: received, complete: completed });
    events.next({ data: 'private update' });
    await new Promise<void>((resolve) => setImmediate(resolve));
    expect(received).not.toHaveBeenCalled();
    expect(completed).toHaveBeenCalledTimes(1);
  });
  it('closes an idle stream immediately when its session is invalidated', async () => {
    const events = new Subject<{ data: string }>();
    const invalidated = new Subject<void>();
    const controller = await resolveService(NotificationsController, [
      { provide: NotificationsService, useValue: { stream: () => events } },
      {
        provide: SessionManagementService,
        useValue: {
          isActive: () => Promise.resolve(true),
          invalidations: () => invalidated,
        },
      },
    ]);
    const completed = jest.fn();
    controller
      .events({ id: 'owner', role: 'ADMIN' } as AuthenticatedUser, 'session')
      .subscribe({ complete: completed });
    invalidated.next();
    expect(completed).toHaveBeenCalledTimes(1);
    expect(events.observed).toBe(false);
  });
});
