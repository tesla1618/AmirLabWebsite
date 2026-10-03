-- Research discovery leases prevent stale workers from overwriting human review changes.
CREATE TYPE "ResearchAutomationState" AS ENUM ('IDLE', 'QUEUED', 'RUNNING', 'SUCCEEDED', 'FAILED');

ALTER TABLE "ResearchItem"
  ADD COLUMN "automationState" "ResearchAutomationState" NOT NULL DEFAULT 'IDLE',
  ADD COLUMN "automationVersion" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "automationOwner" TEXT,
  ADD COLUMN "automationClaimedAt" TIMESTAMP(3);

CREATE INDEX "ResearchItem_automationState_automationClaimedAt_idx"
  ON "ResearchItem"("automationState", "automationClaimedAt");
