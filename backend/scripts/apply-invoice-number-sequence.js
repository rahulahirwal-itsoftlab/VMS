import 'dotenv/config';
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const { Pool } = pg;

const __dirname = dirname(fileURLToPath(import.meta.url));
const migrationPath = resolve(__dirname, '../prisma/migrations/20260719004000_invoice_number_sequence/migration.sql');

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error('DATABASE_URL is not configured.');
  process.exit(1);
}

const pool = new Pool({
  connectionString: databaseUrl,
  ssl: databaseUrl.includes('sslmode=require') ? { rejectUnauthorized: false } : undefined,
});

try {
  const sql = await readFile(migrationPath, 'utf8');
  await pool.query(sql);
  const { rows } = await pool.query("SELECT last_value, is_called FROM invoice_number_seq");
  console.table(rows);
} finally {
  await pool.end();
}
