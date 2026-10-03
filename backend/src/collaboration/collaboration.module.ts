import { Module } from '@nestjs/common';
import { CollaborationController } from './collaboration.controller';
import { CollaborationGateway } from './collaboration.gateway';
import { CollaborationService } from './collaboration.service';
import { RedisService } from './redis.service';
import { PushModule } from './push.module';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [PushModule, AuthModule],
  controllers: [CollaborationController],
  providers: [CollaborationGateway, CollaborationService, RedisService],
  exports: [CollaborationGateway],
})
export class CollaborationModule {}
