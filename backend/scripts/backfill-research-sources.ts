import {
  JobStatus,
  ReviewStatus,
  SourceFetchStatus,
} from '../generated/prisma/client';
import { DISCOVERY_JOB } from '../src/research/research-discovery.service';
import { createCliPrisma } from './prisma';

const prisma = createCliPrisma();

async function main(): Promise<void> {
  const papers = await prisma.researchItem.findMany({
    where: {
      canonicalUrl: { not: null },
      reviewStatus: ReviewStatus.NEEDS_REVIEW,
      type: 'PAPER',
      OR: [
        { sourceSnapshot: null },
        { sourceSnapshot: { status: { not: SourceFetchStatus.PENDING } } },
      ],
    },
    select: { canonicalUrl: true, id: true },
    orderBy: { createdAt: 'asc' },
  });
  let queued = 0;
  for (const [index, paper] of papers.entries()) {
    const canonicalUrl = paper.canonicalUrl;
    if (!canonicalUrl) continue;
    const uniqueKey = `research-source:${paper.id}`;
    const existing = await prisma.job.findUnique({ where: { uniqueKey } });
    if (
      existing?.status === JobStatus.PENDING ||
      existing?.status === JobStatus.RUNNING
    ) {
      continue;
    }
    if (existing) {
      await prisma.job.update({
        where: { id: existing.id },
        data: { uniqueKey: null },
      });
    }
    await prisma.$transaction(async (transaction) => {
      await transaction.researchItem.update({
        where: { id: paper.id },
        data: {
          automationClaimedAt: null,
          automationOwner: null,
          automationState: 'QUEUED',
          automationVersion: { increment: 1 },
        },
      });
      await transaction.researchSourceSnapshot.upsert({
        where: { researchItemId: paper.id },
        create: {
          researchItemId: paper.id,
          status: SourceFetchStatus.PENDING,
          url: canonicalUrl,
        },
        update: {
          failureReason: null,
          status: SourceFetchStatus.PENDING,
          url: canonicalUrl,
        },
      });
      await transaction.job.create({
        data: {
          payload: { researchItemId: paper.id },
          runAt: new Date(Date.now() + index * 5_000),
          type: DISCOVERY_JOB,
          uniqueKey,
        },
      });
    });
    queued += 1;
  }
  console.log(
    `Queued ${queued} of ${papers.length} review papers for metadata recovery.`,
  );
}

void main()
  .catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
