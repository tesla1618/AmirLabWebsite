import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Environment } from '../config/environment';
import { JobsService } from '../jobs/jobs.service';

export const PUBLIC_CACHE_JOB = 'REVALIDATE_PUBLIC_CACHE';
const PUBLIC_JOBS = new Set([
  'DISCOVER_RESEARCH_SOURCE',
  'SYNC_SCHOLAR_PROFILE',
  'RECALCULATE_ALL_RANKS',
  'PURGE_DELETED_USERS',
]);

@Injectable()
export class PublicCacheService implements OnModuleInit {
  private readonly logger = new Logger(PublicCacheService.name);

  constructor(
    private readonly config: ConfigService<Environment, true>,
    private readonly jobs: JobsService,
  ) {}

  onModuleInit(): void {
    this.jobs.register(PUBLIC_CACHE_JOB, () => this.deliver());
    this.jobs.onSettled(async (type) => {
      if (PUBLIC_JOBS.has(type)) await this.invalidate();
    });
  }

  private async deliver(): Promise<void> {
    const url = this.config.get('publicCacheRevalidationUrl', { infer: true });
    const secret = this.config.get('publicCacheRevalidationSecret', {
      infer: true,
    });
    if (!url || !secret) return;
    const response = await fetch(url, {
      method: 'POST',
      headers: { authorization: `Bearer ${secret}` },
      signal: AbortSignal.timeout(3000),
      redirect: 'error',
    });
    if (!response.ok)
      throw new Error(`Public cache revalidation returned ${response.status}`);
  }

  async invalidate(): Promise<void> {
    if (!this.config.get('publicCacheRevalidationUrl', { infer: true })) return;
    try {
      // Try immediately even when discovery jobs occupy the durable worker.
      await this.deliver();
    } catch (error) {
      this.logger.warn(
        `Public cache delivery deferred: ${error instanceof Error ? error.message : String(error)}`,
      );
      try {
        await this.jobs.enqueue(PUBLIC_CACHE_JOB, {});
      } catch (queueError) {
        // Delivery failure cannot turn an already committed editor save into a failure.
        this.logger.error(
          `Unable to enqueue public cache revalidation: ${queueError instanceof Error ? queueError.message : String(queueError)}`,
        );
      }
    }
  }
}
