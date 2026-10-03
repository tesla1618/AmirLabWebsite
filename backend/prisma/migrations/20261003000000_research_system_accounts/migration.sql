-- Generic operating accounts can review research but cannot own it.
ALTER TABLE "User" ADD COLUMN "isSystemAccount" BOOLEAN NOT NULL DEFAULT false;

-- This slug is created by the canonical seed for its generic administrator.
UPDATE "User" AS account
SET "isSystemAccount" = true
FROM "Person" AS person
WHERE person."userId" = account."id"
  AND person."slug" = 'amirlab-administrator'
  AND account."role" = 'ADMIN';
