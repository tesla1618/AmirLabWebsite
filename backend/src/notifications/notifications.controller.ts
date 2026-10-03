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
import { Observable } from 'rxjs';
import { CurrentUser } from '../auth/auth.decorators';
import type { AuthenticatedUser } from '../auth/auth.types';
import { NotificationQueryDto } from './dto/notification-query.dto';
import { NotificationsService } from './notifications.service';

@Controller('notifications')
export class NotificationsController {
  constructor(private readonly notifications: NotificationsService) {}

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
  events(@CurrentUser() user: AuthenticatedUser): Observable<MessageEvent> {
    return this.notifications.stream(user.id, user.role !== 'MEMBER');
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
