import 'dotenv/config';
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const { Client } = pg;
const here = dirname(fileURLToPath(import.meta.url));
const migrationPath = resolve(here, '../prisma/migrations/20260717001000_add_vendor_code_sequence/migration.sql');

const client = new Client({ connectionString: process.env.DATABASE_URL });

try {
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL is not configured.');
  }

  const sql = await readFile(migrationPath, 'utf8');
  await client.connect();
  await client.query(sql);

  const result = await client.query("SELECT nextval('vendor_code_seq')::bigint AS next_value");
  const nextValue = Number(result.rows?.[0]?.next_value || 0);
  await client.query("SELECT setval('vendor_code_seq', $1, false)", [nextValue]);

  console.log(`vendor_code_seq is ready. Next vendor code will use VND-${String(nextValue).padStart(6, '0')}.`);
} finally {
  await client.end().catch(() => {});
}
