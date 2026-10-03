import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import pg from 'pg';
import { markResearchSystemAccounts } from '../scripts/migrate-research-system-accounts.mjs';

const databaseUrl = process.env.TEST_DATABASE_URL;
if (
  !databaseUrl ||
  !['localhost', '127.0.0.1', '[::1]'].includes(new URL(databaseUrl).hostname)
) {
  throw new Error(
    'TEST_DATABASE_URL must explicitly select a local PostgreSQL database',
  );
}

test('db:push includes the data backfill after applying the schema', async () => {
  const pkg = JSON.parse(
    await readFile(new URL('../package.json', import.meta.url), 'utf8'),
  );
  assert.match(
    pkg.scripts['db:push'],
    /prisma db push.*&& node scripts\/migrate-research-system-accounts\.mjs/,
  );
});

test('marks only the seeded generic administrator and is safe to repeat', async () => {
  const client = new pg.Client({ connectionString: databaseUrl });
  await client.connect();
  try {
    await client.query('BEGIN');
    // Temporary tables shadow production table names on this connection only.
    await client.query(
      `CREATE TEMP TABLE "User" (id TEXT PRIMARY KEY, role TEXT, "isSystemAccount" BOOLEAN DEFAULT false) ON COMMIT DROP`,
    );
    await client.query(
      `CREATE TEMP TABLE "Person" ("userId" TEXT, slug TEXT) ON COMMIT DROP`,
    );
    await client.query(
      `INSERT INTO "User" (id, role) VALUES ('generic', 'ADMIN'), ('human', 'ADMIN'), ('member', 'MEMBER')`,
    );
    await client.query(
      `INSERT INTO "Person" VALUES ('generic', 'amirlab-administrator'), ('human', 'real-person'), ('member', 'amirlab-administrator')`,
    );
    await markResearchSystemAccounts(client);
    const { rows } = await client.query(
      `SELECT id, "isSystemAccount" FROM "User" ORDER BY id`,
    );
    assert.deepEqual(rows, [
      { id: 'generic', isSystemAccount: true },
      { id: 'human', isSystemAccount: false },
      { id: 'member', isSystemAccount: false },
    ]);
    const second = await markResearchSystemAccounts(client);
    assert.equal(second.rowCount, 0);
  } finally {
    await client.query('ROLLBACK');
    await client.end();
  }
});
