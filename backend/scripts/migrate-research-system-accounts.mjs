import 'dotenv/config';
import pg from 'pg';
import { pathToFileURL } from 'node:url';

export async function markResearchSystemAccounts(client) {
  return client.query(`
    UPDATE "User" AS account
    SET "isSystemAccount" = true
    FROM "Person" AS person
    WHERE person."userId" = account."id"
      AND person."slug" = 'amirlab-administrator'
      AND account."role" = 'ADMIN'
      AND account."isSystemAccount" = false
  `);
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required');
  const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  try {
    const { rowCount } = await markResearchSystemAccounts(client);
    console.log(
      `Marked ${rowCount ?? 0} generic research operating account(s).`,
    );
  } finally {
    await client.end();
  }
}
