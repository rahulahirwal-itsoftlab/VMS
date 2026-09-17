import 'dotenv/config';
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const { Client } = pg;
const here = dirname(fileURLToPath(import.meta.url));
const migrationPath = resolve(here, '../prisma/migrations/20260720007000_delivery_challan_grn_complete_modules/migration.sql');

const client = new Client({ connectionString: process.env.DATABASE_URL });

try {
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL is not configured.');
  }

  const sql = await readFile(migrationPath, 'utf8');
  await client.connect();
  await client.query(sql);
  console.log('Delivery Challan and GRN complete module migration applied.');
} finally {
  await client.end().catch(() => {});
}
