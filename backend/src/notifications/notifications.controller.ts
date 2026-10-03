import {
  Controller,
  Get,
  MessageEvent,
  Patch,
  Param,
  ParseUUIDPipe,
  Query,
  Sse,
} from '@nestjs/common';
import { Observable, concatMap, takeUntil, takeWhile } from 'rxjs';
import { SessionManagementService } from '../auth/session-management.service';
import { CurrentUser, CurrentSession } from '../auth/auth.decorators';
import type { AuthenticatedUser } from '../auth/auth.types';
import { NotificationQueryDto } from './dto/notification-query.dto';
import { NotificationsService } from './notifications.service';

@Controller('notifications')
export class NotificationsController {
  constructor(
    private readonly notifications: NotificationsService,
    private readonly sessions: SessionManagementService,
  ) {}

  @Get()
  list(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: NotificationQueryDto,
  ) {
    return this.notifications.list(user.id, query);
  }

  @Get('count')
  count(@CurrentUser() user: AuthenticatedUser) {
    return this.notifications.workspaceCounts(user);
  }

  @Sse('events')
  events(
    @CurrentUser() user: AuthenticatedUser,
    @CurrentSession() sessionId: string,
  ): Observable<MessageEvent> {
    return this.notifications.stream(user.id, user.role !== 'MEMBER').pipe(
      concatMap(async (event) =>
        (await this.sessions.isActive(user.id, sessionId)) ? event : null,
      ),
      takeWhile((event): event is NonNullable<typeof event> => event !== null),
      takeUntil(this.sessions.invalidations(user.id, sessionId)),
    );
  }

  @Patch(':id/read')
  async markRead(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<{ updated: boolean }> {
    return this.notifications.markRead(user.id, id);
  }

  @Patch(':id/unread')
  async markUnread(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<{ updated: boolean }> {
    return this.notifications.markUnread(user.id, id);
  }
}
