import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { disconnectDatabase, pool } from '../src/config/prisma.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const migrationPath = path.resolve(
  __dirname,
  '../prisma/migrations/20260719002000_invoice_upload_ocr_metadata/migration.sql',
);

const verifyInvoiceOcrSchema = async () => {
  const { rows } = await pool.query(`
    SELECT table_name, column_name
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND (
        (table_name = 'invoices' AND column_name IN ('invoice_creation_method', 'ocr_status'))
        OR
        (table_name = 'invoice_attachments' AND column_name IN ('invoice_creation_method', 'ocr_status'))
      )
    ORDER BY table_name, column_name
  `);

  const found = new Set(rows.map((row) => `${row.table_name}.${row.column_name}`));
  const required = [
    'invoices.invoice_creation_method',
    'invoices.ocr_status',
    'invoice_attachments.invoice_creation_method',
    'invoice_attachments.ocr_status',
  ];
  const missing = required.filter((column) => !found.has(column));

  if (missing.length > 0) {
    throw new Error(`Invoice OCR schema repair incomplete. Missing: ${missing.join(', ')}`);
  }
};

const run = async () => {
  const sql = await fs.readFile(migrationPath, 'utf8');
  await pool.query(sql);
  await verifyInvoiceOcrSchema();
  console.log('[repair-invoice-ocr-schema] Invoice OCR schema is present.');
};

run()
  .catch((error) => {
    console.error('[repair-invoice-ocr-schema] Failed:', {
      name: error?.name,
      code: error?.code,
      message: error?.message,
    });
    process.exitCode = 1;
  })
  .finally(async () => {
    await disconnectDatabase();
  });
