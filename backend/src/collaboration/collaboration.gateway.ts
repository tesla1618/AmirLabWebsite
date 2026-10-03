import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  ConnectedSocket,
  MessageBody,
} from '@nestjs/websockets';
import { createHash } from 'node:crypto';
import type { Server, Socket } from 'socket.io';
import type { Subscription } from 'rxjs';
import { SessionManagementService } from '../auth/session-management.service';

type AuthenticatedSocket = Pick<
  Socket,
  'id' | 'emit' | 'join' | 'disconnect'
> & {
  data: { userId?: string; sessionId?: string };
  handshake: Pick<Socket['handshake'], 'headers'>;
};
import { AccountStatus } from '../../generated/prisma/client';
import type { Environment } from '../config/environment';
import { PrismaService } from '../database/prisma.service';
import { CollaborationService } from './collaboration.service';
import { RedisService } from './redis.service';
import { PushService } from './push.service';

@Injectable()
@WebSocketGateway({ namespace: '/realtime', transports: ['websocket'] })
export class CollaborationGateway {
  @WebSocketServer() server!: Server;
  private readonly logger = new Logger(CollaborationGateway.name);
  private readonly sessionWatches = new Map<string, Subscription>();
  private readonly connections = new Map<string, number>();

  constructor(
    private readonly config: ConfigService<Environment, true>,
    private readonly prisma: PrismaService,
    private readonly collaboration: CollaborationService,
    private readonly redis: RedisService,
    private readonly push: PushService,
    private readonly sessions: SessionManagementService,
  ) {}

  async handleConnection(socket: AuthenticatedSocket) {
    const authenticated = await this.userForCookie(
      socket.handshake.headers.cookie,
    );
    if (!authenticated) return socket.disconnect(true);
    const { user, sessionId } = authenticated;
    socket.data.userId = user.id;
    socket.data.sessionId = sessionId;
    this.sessionWatches.set(
      socket.id,
      this.sessions.invalidations(user.id, sessionId).subscribe(() => {
        socket.emit('session.revoked');
        socket.disconnect(true);
      }),
    );
    void socket.join(`user:${user.id}`);
    this.connections.set(user.id, (this.connections.get(user.id) ?? 0) + 1);
    await this.redis.setPresence(user.id);
    this.server.emit('presence.updated', { userId: user.id, status: 'ONLINE' });
  }

  async handleDisconnect(socket: AuthenticatedSocket) {
    this.sessionWatches.get(socket.id)?.unsubscribe();
    this.sessionWatches.delete(socket.id);
    const userId = socket.data.userId;
    if (!userId) return;
    const count = Math.max(0, (this.connections.get(userId) ?? 1) - 1);
    if (count) this.connections.set(userId, count);
    else {
      this.connections.delete(userId);
      await this.redis.clearPresence(userId);
      this.server.emit('presence.updated', { userId, status: 'OFFLINE' });
    }
  }

  async broadcastMessage(message: { conversationId: string }) {
    const members = await this.prisma.conversationMember.findMany({
      where: { conversationId: message.conversationId },
      select: { userId: true },
    });
    for (const { userId } of members) {
      await this.emitForUser(userId, 'message.created', message);
    }
  }

  async broadcastMessages<T extends { conversationId: string }>(
    messages: readonly T[],
  ): Promise<void> {
    if (!messages.length) return;
    const conversationIds = [
      ...new Set(messages.map(({ conversationId }) => conversationId)),
    ];
    const members = await this.prisma.conversationMember.findMany({
      where: { conversationId: { in: conversationIds } },
      select: { conversationId: true, userId: true },
    });
    const recipients = new Map<string, string[]>();
    for (const member of members) {
      const current = recipients.get(member.conversationId) ?? [];
      current.push(member.userId);
      recipients.set(member.conversationId, current);
    }
    for (const message of messages) {
      for (const userId of recipients.get(message.conversationId) ?? []) {
        await this.emitForUser(userId, 'message.created', message);
      }
    }
  }

  @SubscribeMessage('presence.heartbeat')
  async heartbeat(@ConnectedSocket() socket: AuthenticatedSocket) {
    if (await this.activeSocket(socket))
      await this.redis.setPresence(socket.data.userId ?? '');
  }

  @SubscribeMessage('message.send')
  async message(
    @ConnectedSocket() socket: AuthenticatedSocket,
    @MessageBody()
    body: { conversationId?: string; body?: string; replyToId?: string },
  ) {
    if (
      !(await this.activeSocket(socket)) ||
      !socket.data.userId ||
      !body?.conversationId
    )
      return;
    const message = await this.collaboration.sendMessage(
      socket.data.userId,
      body.conversationId,
      body.body ?? '',
      body.replyToId,
    );
    try {
      const members = await this.prisma.conversationMember.findMany({
        where: { conversationId: body.conversationId },
        select: { userId: true },
      });
      await this.broadcastMessage(message);
      await this.push.notifyUsers(
        members.map(({ userId }) => userId),
        {
          title: message.sender.person?.fullName ?? 'AMIR Lab member',
          body: message.body,
          url: '/workspace/chat',
        },
      );
    } catch (error) {
      // The message is committed; do not leave the sender retrying a saved draft.
      this.logger.error(
        `Chat delivery failed for message ${message.id}`,
        error instanceof Error ? error.stack : 'Unknown delivery failure',
      );
    }
    return message;
  }

  @SubscribeMessage('typing')
  async typing(
    @ConnectedSocket() socket: AuthenticatedSocket,
    @MessageBody() body: { conversationId?: string; active?: boolean },
  ) {
    if (
      !(await this.activeSocket(socket)) ||
      !socket.data.userId ||
      !body?.conversationId
    )
      return;
    await this.collaboration.assertMember(
      socket.data.userId,
      body.conversationId,
    );
    const members = await this.prisma.conversationMember.findMany({
      where: {
        conversationId: body.conversationId,
        userId: { not: socket.data.userId },
      },
      select: { userId: true },
    });
    for (const { userId } of members)
      await this.emitForUser(userId, 'typing', {
        userId: socket.data.userId,
        active: Boolean(body.active),
      });
  }

  @SubscribeMessage('message.react')
  async reaction(
    @ConnectedSocket() socket: AuthenticatedSocket,
    @MessageBody() body: { messageId?: string; emoji?: string },
  ) {
    if (
      !(await this.activeSocket(socket)) ||
      !socket.data.userId ||
      !body?.messageId ||
      !body.emoji
    )
      return;
    const result = await this.collaboration.toggleReaction(
      socket.data.userId,
      body.messageId,
      body.emoji,
    );
    const members = await this.prisma.conversationMember.findMany({
      where: { conversationId: result.conversationId },
      select: { userId: true },
    });
    for (const { userId } of members)
      await this.emitForUser(userId, 'message.reaction.changed', result);
    return result;
  }

  private async emitForUser(
    userId: string,
    event: string,
    payload: unknown,
  ): Promise<void> {
    const sockets = await this.server.in(`user:${userId}`).fetchSockets();
    for (const socket of sockets) {
      const data: unknown = socket.data;
      const sessionId =
        data && typeof data === 'object' && 'sessionId' in data
          ? data.sessionId
          : undefined;
      if (
        typeof sessionId === 'string' &&
        (await this.sessions.isActive(userId, sessionId))
      ) {
        socket.emit(event, payload);
      } else socket.disconnect(true);
    }
  }

  private async activeSocket(socket: AuthenticatedSocket): Promise<boolean> {
    const { userId, sessionId } = socket.data;
    if (
      !userId ||
      !sessionId ||
      !(await this.sessions.isActive(userId, sessionId))
    ) {
      socket.disconnect(true);
      return false;
    }
    return true;
  }

  private async userForCookie(cookieHeader?: string) {
    const cookieName = this.config.get('sessionCookieName', { infer: true });
    const rawToken = cookieHeader
      ?.split(';')
      .map((part) => part.trim())
      .find((part) => part.startsWith(`${cookieName}=`))
      ?.slice(cookieName.length + 1);
    if (!rawToken) return null;
    let decodedToken: string;
    try {
      decodedToken = decodeURIComponent(rawToken);
    } catch {
      return null;
    }
    const session = await this.prisma.session.findUnique({
      where: {
        tokenHash: createHash('sha256').update(decodedToken).digest('hex'),
      },
      select: {
        id: true,
        user: { select: { id: true, status: true, isDeleted: true } },
        expiresAt: true,
        revokedAt: true,
      },
    });
    if (
      !session ||
      session.revokedAt ||
      session.expiresAt <= new Date() ||
      session.user.isDeleted ||
      session.user.status !== AccountStatus.ACTIVE
    )
      return null;
    return { user: session.user, sessionId: session.id };
  }
}
