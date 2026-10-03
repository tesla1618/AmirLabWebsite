import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
} from '@nestjs/common';
import { CurrentUser } from '../auth/auth.decorators';
import type { AuthenticatedUser } from '../auth/auth.types';
import { CollaborationService } from './collaboration.service';

@Controller('collaboration')
export class CollaborationController {
  constructor(private readonly collaboration: CollaborationService) {}

  @Get('conversations')
  list(@CurrentUser() user: AuthenticatedUser) {
    return this.collaboration.conversations(user.id);
  }

  @Get('presence')
  presence(@CurrentUser() user: AuthenticatedUser) {
    return this.collaboration.presence(user.id);
  }

  @Post('conversations/lab')
  lab(@CurrentUser() user: AuthenticatedUser) {
    return this.collaboration.ensureLabConversation(user);
  }

  @Get('conversations/:id/messages')
  messages(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.collaboration.messages(user.id, id);
  }

  @Patch('conversations/:id/read')
  read(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.collaboration.markRead(user.id, id);
  }
}
