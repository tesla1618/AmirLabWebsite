import { Module } from '@nestjs/common';
import { JobsModule } from '../jobs/jobs.module';
import { PushController } from './push.controller';
import { PushService } from './push.service';

@Module({
  imports: [JobsModule],
  controllers: [PushController],
  providers: [PushService],
  exports: [PushService],
})
export class PushModule {}
