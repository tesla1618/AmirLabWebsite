import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import { createHash, timingSafeEqual } from 'node:crypto';
import type { Request } from 'express';
import { AccountStatus } from '../../generated/prisma/client';
import type { Environment } from '../config/environment';
import { PrismaService } from '../database/prisma.service';
import { PUBLIC_ROUTE } from './auth.decorators';
import type { AuthenticatedUser } from './auth.types';
import { effectiveRank } from '../settings/settings.service';
import { csrfTokenForSession } from './csrf';

@Injectable()
export class SessionAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly config: ConfigService<Environment, true>,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    if (
      this.reflector.getAllAndOverride<boolean>(PUBLIC_ROUTE, [
        context.getHandler(),
        context.getClass(),
      ])
    ) {
      return true;
    }

    const request = context
      .switchToHttp()
      .getRequest<
        Request & { user?: AuthenticatedUser; currentSessionId?: string }
      >();
    const cookieName = this.config.get('sessionCookieName', { infer: true });
    const rawToken = request.cookies?.[cookieName] as string | undefined;
    if (!rawToken) {
      throw new UnauthorizedException({
        code: 'SESSION_INVALID',
        message: 'Authentication required',
      });
    }

    const session = await this.prisma.session.findUnique({
      where: { tokenHash: createHash('sha256').update(rawToken).digest('hex') },
      include: {
        user: {
          include: {
            person: {
              select: {
                id: true,
                fullName: true,
                isPublished: true,
                appointedRank: true,
                earnedRank: true,
                slug: true,
                avatar: { select: { id: true } },
              },
            },
          },
        },
      },
    });

    if (
      !session ||
      session.revokedAt ||
      session.expiresAt <= new Date() ||
      session.user.isDeleted ||
      session.user.status !== AccountStatus.ACTIVE
    ) {
      throw new UnauthorizedException({
        code: 'SESSION_INVALID',
        message: 'Session is invalid or expired',
      });
    }

    if (!['GET', 'HEAD', 'OPTIONS'].includes(request.method)) {
      const csrfToken = request.header('x-csrf-token');
      if (!csrfToken) {
        throw new UnauthorizedException('CSRF token required');
      }
      const actual = Buffer.from(
        createHash('sha256').update(csrfToken).digest('hex'),
      );
      const expected = Buffer.from(
        createHash('sha256')
          .update(csrfTokenForSession(rawToken))
          .digest('hex'),
      );
      if (
        actual.length !== expected.length ||
        !timingSafeEqual(actual, expected)
      ) {
        throw new UnauthorizedException('CSRF token is invalid');
      }
    }

    request.currentSessionId = session.id;
    const now = new Date();
    if (session.lastSeenAt < new Date(now.getTime() - 5 * 60_000)) {
      await this.prisma.session.updateMany({
        where: {
          id: session.id,
          revokedAt: null,
          lastSeenAt: { lt: new Date(now.getTime() - 5 * 60_000) },
        },
        data: { lastSeenAt: now },
      });
    }
    const person = session.user.person;
    request.user = {
      ...session.user,
      person: person
        ? {
            id: person.id,
            fullName: person.fullName,
            isPublished: person.isPublished,
            rank: effectiveRank(person.appointedRank, person.earnedRank),
            slug: person.slug,
            avatar: person.avatar,
          }
        : null,
    };
    return true;
  }
}
