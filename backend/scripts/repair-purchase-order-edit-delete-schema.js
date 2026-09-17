import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { disconnectDatabase, pool } from '../src/config/prisma.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const migrationPath = path.resolve(
  __dirname,
  '../prisma/migrations/20260719003000_purchase_order_edit_delete_metadata/migration.sql',
);

const verifySchema = async () => {
  const { rows } = await pool.query(`
    SELECT column_name
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'purchase_orders'
      AND column_name IN ('updated_by_id', 'deleted_at', 'deleted_by_id', 'delete_reason')
  `);

  const found = new Set(rows.map((row) => row.column_name));
  const required = ['updated_by_id', 'deleted_at', 'deleted_by_id', 'delete_reason'];
  const missing = required.filter((column) => !found.has(column));

  if (missing.length > 0) {
    throw new Error(`Purchase Order edit/delete schema repair incomplete. Missing: ${missing.join(', ')}`);
  }
};

const run = async () => {
  const sql = await fs.readFile(migrationPath, 'utf8');
  await pool.query(sql);
  await verifySchema();
  console.log('[repair-purchase-order-edit-delete-schema] Purchase Order edit/delete schema is present.');
};

run()
  .catch((error) => {
    console.error('[repair-purchase-order-edit-delete-schema] Failed:', {
      name: error?.name,
      code: error?.code,
      message: error?.message,
    });
    process.exitCode = 1;
  })
  .finally(async () => {
    await disconnectDatabase();
  });
