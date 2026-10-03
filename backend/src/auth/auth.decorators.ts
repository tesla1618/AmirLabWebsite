import {
  createParamDecorator,
  ExecutionContext,
  SetMetadata,
} from '@nestjs/common';
import type { Request } from 'express';
import type { PlatformRole } from '../../generated/prisma/client';
import type { AuthenticatedUser } from './auth.types';

export const PUBLIC_ROUTE = 'publicRoute';
export const REQUIRED_ROLE = 'requiredRole';

export const Public = () => SetMetadata(PUBLIC_ROUTE, true);
export const RequireRole = (role: PlatformRole) =>
  SetMetadata(REQUIRED_ROLE, role);

export const CurrentUser = createParamDecorator(
  (_data: unknown, context: ExecutionContext): AuthenticatedUser => {
    const request = context
      .switchToHttp()
      .getRequest<Request & { user: AuthenticatedUser }>();
    return request.user;
  },
);

export const CurrentSession = createParamDecorator(
  (_data: unknown, context: ExecutionContext): string => {
    return context
      .switchToHttp()
      .getRequest<Request & { currentSessionId: string }>().currentSessionId;
  },
);
