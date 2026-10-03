jest.mock('../../generated/prisma/client', () => ({
  AccountStatus: { ACTIVE: 'ACTIVE' },
  PrismaClient: class PrismaClient {},
}));
jest.mock('./collaboration.service', () => ({
  CollaborationService: class CollaborationService {},
}));
jest.mock('./redis.service', () => ({ RedisService: class RedisService {} }));
import { ConfigService } from '@nestjs/config';
import { Logger } from '@nestjs/common';
import { Server } from 'socket.io';
import { Subject } from 'rxjs';
import { resolveService } from '../../test/resolve-service';
import { PrismaService } from '../database/prisma.service';
import { SessionManagementService } from '../auth/session-management.service';
import { CollaborationGateway } from './collaboration.gateway';
import { CollaborationService } from './collaboration.service';
import { RedisService } from './redis.service';
import { PushService } from './push.service';

async function fixture() {
  const invalidated = new Subject<void>();
  const sessions = {
    isActive: jest.fn().mockResolvedValue(false),
    invalidations: () => invalidated,
  };
  const collaboration = { sendMessage: jest.fn() };
  const push = { notifyUsers: jest.fn() };
  const members = {
    findMany: jest.fn().mockResolvedValue([{ userId: 'owner' }]),
  };
  const gateway = await resolveService(CollaborationGateway, [
    { provide: ConfigService, useValue: { get: () => 'amirl_session' } },
    {
      provide: PrismaService,
      useValue: {
        conversationMember: members,
        session: {
          findUnique: () =>
            Promise.resolve({
              id: 'session',
              user: { id: 'owner', status: 'ACTIVE', isDeleted: false },
              revokedAt: null,
              expiresAt: new Date(Date.now() + 60000),
            }),
        },
      },
    },
    { provide: SessionManagementService, useValue: sessions },
    { provide: CollaborationService, useValue: collaboration },
    {
      provide: RedisService,
      useValue: { setPresence: () => Promise.resolve() },
    },
    { provide: PushService, useValue: push },
  ]);
  gateway.server = new Server();
  const socket: Parameters<CollaborationGateway['message']>[0] = {
    id: 'socket',
    data: { userId: 'owner', sessionId: 'session' },
    handshake: { headers: { cookie: 'amirl_session=token' } },
    emit: jest.fn(),
    join: jest.fn(),
    disconnect: jest.fn(),
  };
  return {
    gateway,
    sessions,
    collaboration,
    socket,
    invalidated,
    push,
    members,
  };
}

describe('Chat session revocation', () => {
  afterEach(() => jest.restoreAllMocks());

  it.each(['push', 'broadcast', 'recipient lookup'])(
    'acknowledges a saved message when %s fails',
    async (failure) => {
      const { gateway, sessions, collaboration, socket, push, members } =
        await fixture();
      const logged = jest
        .spyOn(Logger.prototype, 'error')
        .mockImplementation(() => undefined);
      sessions.isActive.mockResolvedValue(true);
      const message = {
        id: 'message',
        conversationId: 'conversation',
        body: 'hello',
        sender: { person: null },
      };
      collaboration.sendMessage.mockResolvedValue(message);
      const error = new Error('Delivery failed');
      if (failure === 'push') push.notifyUsers.mockRejectedValue(error);
      if (failure === 'broadcast')
        jest.spyOn(gateway, 'broadcastMessage').mockRejectedValue(error);
      if (failure === 'recipient lookup')
        members.findMany.mockRejectedValue(error);
      await expect(
        gateway.message(socket, {
          conversationId: 'conversation',
          body: 'hello',
        }),
      ).resolves.toEqual(message);
      expect(logged).toHaveBeenCalledWith(
        expect.stringContaining('message'),
        expect.stringContaining('Delivery failed'),
      );
    },
  );
  it('rejects messages from an already-connected revoked session', async () => {
    const { gateway, collaboration, socket } = await fixture();
    await gateway.message(socket, {
      conversationId: 'conversation',
      body: 'private message',
    });
    expect(socket.disconnect).toHaveBeenCalledWith(true);
    expect(collaboration.sendMessage).not.toHaveBeenCalled();
  });
  it('disconnects a connected session immediately when revoked', async () => {
    const { gateway, socket, invalidated } = await fixture();
    await gateway.handleConnection(socket);
    invalidated.next();
    expect(socket.emit).toHaveBeenCalledWith('session.revoked');
    expect(socket.disconnect).toHaveBeenCalledWith(true);
    invalidated.complete();
  });
});
