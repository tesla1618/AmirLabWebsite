import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import {
  catchError,
  concatMap,
  from,
  mergeMap,
  Observable,
  throwError,
} from 'rxjs';
import { PublicCacheService } from './public-cache.service';

const PUBLIC_WRITERS = new Set([
  'SiteContentController',
  'ProfilesController',
  'ResearchController',
  'ProjectsController',
  'AdminDepartmentsController',
  'AdminUniversitiesController',
  'UsersController',
  'SettingsController',
  'ApplicationsController',
]);

@Injectable()
export class PublicCacheInterceptor implements NestInterceptor {
  constructor(private readonly cache: PublicCacheService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest<{ method: string }>();
    const controller = context.getClass().name;
    const publicWriter =
      PUBLIC_WRITERS.has(controller) ||
      (controller === 'AuthController' &&
        ['verifyEmailChange', 'revertEmailChange'].includes(
          context.getHandler().name,
        ));
    if (
      !publicWriter ||
      !['POST', 'PUT', 'PATCH', 'DELETE'].includes(request.method)
    ) {
      return next.handle();
    }
    return next.handle().pipe(
      concatMap(async (value: unknown) => {
        await this.cache.invalidate();
        return value;
      }),
      // Preserve the original error while expiring any partially committed changes.
      catchError((error: unknown) =>
        from(this.cache.invalidate()).pipe(
          mergeMap(() => throwError(() => error)),
        ),
      ),
    );
  }
}
