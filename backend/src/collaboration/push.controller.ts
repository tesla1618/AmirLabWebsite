import { Body, Controller, Delete, Get, Headers, Post } from '@nestjs/common';
import { CurrentSession, CurrentUser } from '../auth/auth.decorators';
import type { AuthenticatedUser } from '../auth/auth.types';
import {
  PushEndpointDto,
  PushSubscriptionDto,
} from './dto/push-subscription.dto';
import { PushService } from './push.service';

@Controller('collaboration/push')
export class PushController {
  constructor(private readonly push: PushService) {}

  @Get('public-key')
  publicKey() {
    return { publicKey: this.push.publicKey() };
  }

  @Post('subscription')
  subscribe(
    @CurrentUser() user: AuthenticatedUser,
    @CurrentSession() sessionId: string,
    @Body() subscription: PushSubscriptionDto,
    @Headers('user-agent') userAgent?: string,
  ) {
    return this.push.subscribe(user.id, sessionId, subscription, userAgent);
  }

  @Delete('subscription')
  unsubscribe(
    @CurrentUser() user: AuthenticatedUser,
    @CurrentSession() sessionId: string,
    @Body() body: PushEndpointDto,
  ) {
    return this.push.unsubscribe(user.id, sessionId, body.endpoint);
  }

  @Post('test')
  test(
    @CurrentUser() user: AuthenticatedUser,
    @CurrentSession() sessionId: string,
  ) {
    return this.push.test(user.id, sessionId);
  }
}
