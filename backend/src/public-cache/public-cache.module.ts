import { Module } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { JobsModule } from '../jobs/jobs.module';
import { PublicCacheService } from './public-cache.service';
import { PublicCacheInterceptor } from './public-cache.interceptor';

@Module({
  imports: [JobsModule],
  providers: [
    PublicCacheService,
    { provide: APP_INTERCEPTOR, useClass: PublicCacheInterceptor },
  ],
})
export class PublicCacheModule {}
