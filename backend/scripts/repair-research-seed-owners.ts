import { createCliPrisma } from './prisma';
import {
  firstKnownContributorSourceIdForSeed,
  readSeedData,
} from './seed-data';

// Dry-run by default. Repairs only canonical imports still assigned to a
// generic operating account (or nobody); preserves explicit human corrections.
async function main() {
  const apply = process.argv.includes('--apply');
  const seed = await readSeedData();
  const prisma = createCliPrisma();
  try {
    const people = await prisma.person.findMany({
      where: {
        legacySourceId: { in: seed.people.map(({ sourceId }) => sourceId) },
        user: { is: { isSystemAccount: false, isDeleted: false } },
      },
      select: { legacySourceId: true, userId: true },
    });
    const users = new Map(
      people.flatMap(({ legacySourceId, userId }) =>
        legacySourceId && userId ? [[legacySourceId, userId] as const] : [],
      ),
    );
    const known = new Set(users.keys());
    let repaired = 0;
    let cleared = 0;
    for (const paper of seed.papers) {
      const item = await prisma.researchItem.findUnique({
        where: { legacySourceId: paper.sourceId },
        include: { submittedBy: { select: { isSystemAccount: true } } },
      });
      if (!item || (item.submittedBy && !item.submittedBy.isSystemAccount))
        continue;
      const ownerSourceId = firstKnownContributorSourceIdForSeed(
        paper.contributorSourceIds,
        known,
      );
      const ownerId = ownerSourceId ? users.get(ownerSourceId) : undefined;
      if (apply) {
        await prisma.$transaction(async (tx) => {
          const changed = await tx.researchItem.updateMany({
            where: {
              id: item.id,
              automationVersion: item.automationVersion,
              submittedById: item.submittedById,
              automationState: { not: 'RUNNING' },
            },
            data: {
              submittedById: ownerId ?? null,
              automationState: 'IDLE',
              automationOwner: null,
              automationClaimedAt: null,
              automationVersion: { increment: 1 },
            },
          });
          await tx.job.updateMany({
            where: { uniqueKey: `research-source:${item.id}` },
            data: { uniqueKey: null },
          });
          if (changed.count !== 1)
            throw new Error(
              `Import ${paper.sourceId} changed or has active discovery; retry after it finishes.`,
            );
          await tx.auditRecord.create({
            data: {
              action: 'research.seed-owner-corrected',
              entityId: item.id,
              entityType: 'ResearchItem',
              details: {
                sourceId: paper.sourceId,
                previousSubmittedById: item.submittedById,
                submittedById: ownerId ?? null,
              },
            },
          });
        });
      }
      if (ownerId) repaired++;
      else cleared++;
    }
    console.log(
      JSON.stringify({
        mode: apply ? 'applied' : 'dry-run',
        mappedOwners: repaired,
        clearedGenericOwners: cleared,
      }),
    );
  } finally {
    await prisma.$disconnect();
  }
}

void main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
