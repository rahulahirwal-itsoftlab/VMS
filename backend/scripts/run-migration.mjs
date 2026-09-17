/**
 * run-migration.mjs
 * 
 * Runs the payment_approvals SQL migration against the live PostgreSQL database.
 * Uses the same DATABASE_URL loaded by the backend server.
 * 
 * Usage: node scripts/run-migration.mjs
 */

import 'dotenv/config';
import pg from 'pg';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const DATABASE_URL = process.env.DATABASE_URL || process.env.DIRECT_URL;

if (!DATABASE_URL) {
  console.error('❌ DATABASE_URL is not set. Cannot run migration.');
  process.exit(1);
}

const sqlFile = join(__dirname, 'add_payment_approvals_migration.sql');
const sql = readFileSync(sqlFile, 'utf-8');

const { Pool } = pg;
const pool = new Pool({ connectionString: DATABASE_URL });

console.log('🚀 Running payment_approvals migration...');

try {
  await pool.query('BEGIN');
  await pool.query(sql);
  await pool.query('COMMIT');
  console.log('Migration completed successfully!');
  console.log('   Tables created: payment_approvals, payment_approval_history');
  console.log('   Columns added: payments.three_way_match_id, payments.approval_status');
} catch (err) {
  await pool.query('ROLLBACK').catch(() => {});
  console.error('❌ Migration failed:', err.message);
  console.error(err);
  process.exit(1);
} finally {
  await pool.end();
}
