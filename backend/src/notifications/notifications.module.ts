import { Global, Module } from '@nestjs/common';
import { NotificationsController } from './notifications.controller';
import { NotificationsService } from './notifications.service';
import { DeadlineNotificationsService } from './deadline-notifications.service';
import { PushModule } from '../collaboration/push.module';
import { AuthModule } from '../auth/auth.module';
import { SettingsModule } from '../settings/settings.module';

@Global()
@Module({
  imports: [SettingsModule, PushModule, AuthModule],
  controllers: [NotificationsController],
  providers: [DeadlineNotificationsService, NotificationsService],
  exports: [NotificationsService],
})
export class NotificationsModule {}
