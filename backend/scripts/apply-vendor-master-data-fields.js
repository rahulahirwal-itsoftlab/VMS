import 'dotenv/config';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import pg from 'pg';

const { Client } = pg;
const here = dirname(fileURLToPath(import.meta.url));
const migrationPath = resolve(here, '../prisma/migrations/20260720006000_vendor_master_data_fields/migration.sql');

const client = new Client({ connectionString: process.env.DATABASE_URL });

try {
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is not configured.');
  const sql = await readFile(migrationPath, 'utf8');
  await client.connect();
  await client.query(sql);
  console.log('Vendor master data fields migration applied.');
} finally {
  await client.end().catch(() => {});
}
