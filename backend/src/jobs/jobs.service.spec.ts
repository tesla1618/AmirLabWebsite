import { JobStatus } from '../../generated/prisma/client';
import { PrismaService } from '../database/prisma.service';
import { resolveService } from '../../test/resolve-service';
import { JobsService } from './jobs.service';

describe('JobsService active deduplication', () => {
  it('returns the existing job while the same work is active', async () => {
    const prisma = {
      job: {
        create: jest.fn().mockRejectedValue({ code: 'P2002' }),
        findUnique: jest.fn().mockResolvedValue({
          id: 'active-job',
          status: JobStatus.RUNNING,
        }),
        updateMany: jest.fn(),
      },
    };
    const service = await resolveService(JobsService, [
      { provide: PrismaService, useValue: prisma },
    ]);

    await expect(
      service.enqueueWhileActive('DISCOVER', { researchItemId: 'item' }, 'key'),
    ).resolves.toBe('active-job');
    expect(prisma.job.create).toHaveBeenCalledTimes(1);
    expect(prisma.job.updateMany).not.toHaveBeenCalled();
  });

  it('releases a completed key before queuing fresh work', async () => {
    const prisma = {
      job: {
        create: jest
          .fn()
          .mockRejectedValueOnce({ code: 'P2002' })
          .mockResolvedValueOnce({ id: 'fresh-job' }),
        findUnique: jest.fn().mockResolvedValue({
          id: 'completed-job',
          status: JobStatus.SUCCEEDED,
        }),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
    };
    const service = await resolveService(JobsService, [
      { provide: PrismaService, useValue: prisma },
    ]);

    await expect(
      service.enqueueWhileActive('DISCOVER', { researchItemId: 'item' }, 'key'),
    ).resolves.toBe('fresh-job');
    expect(prisma.job.updateMany).toHaveBeenCalledWith({
      where: { id: 'completed-job', uniqueKey: 'key' },
      data: { uniqueKey: null },
    });
    expect(prisma.job.create).toHaveBeenCalledTimes(2);
  });

  it('keeps retrying when another enqueue wins key release race', async () => {
    const prisma = {
      job: {
        create: jest
          .fn()
          .mockRejectedValueOnce({ code: 'P2002' })
          .mockRejectedValueOnce({ code: 'P2002' })
          .mockResolvedValueOnce({ id: 'fresh-job' }),
        findUnique: jest.fn().mockResolvedValue({
          id: 'completed-job',
          status: JobStatus.SUCCEEDED,
        }),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
    };
    const service = await resolveService(JobsService, [
      { provide: PrismaService, useValue: prisma },
    ]);

    await expect(
      service.enqueueWhileActive('DISCOVER', { researchItemId: 'item' }, 'key'),
    ).resolves.toBe('fresh-job');
    expect(prisma.job.create).toHaveBeenCalledTimes(3);
    expect(prisma.job.updateMany).toHaveBeenCalledTimes(2);
  });
});
