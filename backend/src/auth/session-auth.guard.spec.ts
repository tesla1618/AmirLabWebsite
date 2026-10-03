jest.mock('../../generated/prisma/client', () => ({
  AccountStatus: { ACTIVE: 'ACTIVE' },
  PlatformRole: { ADMIN: 'ADMIN' },
  PrismaClient: class PrismaClient {},
}));

import type { ExecutionContext } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ExecutionContextHost } from '@nestjs/core/helpers/execution-context-host';
import { Reflector } from '@nestjs/core';
import { PrismaService } from '../database/prisma.service';
import { resolveService } from '../../test/resolve-service';
import { AccountStatus, PlatformRole } from '../../generated/prisma/client';
import type { AuthenticatedUser } from './auth.types';
import { csrfTokenForSession } from './csrf';
import { SessionAuthGuard } from './session-auth.guard';

const sessionToken = 'persistent-session-token';
const user: AuthenticatedUser = {
  email: 'admin@amirl.local',
  id: 'user-id',
  person: null,
  role: PlatformRole.ADMIN,
  status: AccountStatus.ACTIVE,
};

function context(method: string, csrfToken?: string) {
  const request = {
    cookies: { amirl_session: sessionToken },
    header: (name: string) => (name === 'x-csrf-token' ? csrfToken : undefined),
    method,
  };
  return {
    executionContext: {
      getClass: () => class TestController {},
      getHandler: () => function handler() {},
      switchToHttp: () => ({ getRequest: () => request }),
    },
    request,
  };
}

async function guard(
  sessionState: { revokedAt?: Date; expiresAt?: Date } = {},
) {
  return resolveService(SessionAuthGuard, [
    { provide: Reflector, useValue: { getAllAndOverride: () => false } },
    { provide: ConfigService, useValue: { get: () => 'amirl_session' } },
    {
      provide: PrismaService,
      useValue: {
        session: {
          findUnique: jest.fn().mockResolvedValue({
            id: 'current-session',
            lastSeenAt: new Date(),
            csrfTokenHash: 'token-created-before-recovery-was-supported',
            expiresAt: new Date(Date.now() + 60_000),
            revokedAt: null,
            user,
            ...sessionState,
          }),
        },
      },
    },
  ]);
}

describe('SessionAuthGuard CSRF recovery', () => {
  it.each([{ revokedAt: new Date() }, { expiresAt: new Date(0) }])(
    'identifies an ended session with a stable API code',
    async (state) => {
      const { request } = context('GET');
      const response: unknown = expect.objectContaining({
        code: 'SESSION_INVALID',
      });
      await expect(
        (await guard(state)).canActivate(new ExecutionContextHost([request])),
      ).rejects.toMatchObject({
        response,
      });
    },
  );
  it('accepts the recoverable token for an existing session', async () => {
    const { executionContext, request } = context(
      'POST',
      csrfTokenForSession(sessionToken),
    );

    await expect(
      (await guard()).canActivate(
        executionContext as unknown as ExecutionContext,
      ),
    ).resolves.toBe(true);
    expect(request).toHaveProperty('user', user);
    expect(request).toHaveProperty('currentSessionId', 'current-session');
  });

  it('still rejects a mutation without a CSRF token', async () => {
    const { executionContext } = context('PATCH');

    await expect(
      (await guard()).canActivate(
        executionContext as unknown as ExecutionContext,
      ),
    ).rejects.toThrow('CSRF token required');
  });

  it('still rejects a mutation with the wrong token', async () => {
    const { executionContext } = context('POST', 'wrong-token');

    await expect(
      (await guard()).canActivate(
        executionContext as unknown as ExecutionContext,
      ),
    ).rejects.toThrow('CSRF token is invalid');
  });
});
