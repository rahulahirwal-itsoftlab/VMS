import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const root = path.resolve(process.cwd(), '..');
const read = (...parts) => fs.readFileSync(path.join(root, ...parts), 'utf8');
const backend = (...parts) => read('backend', ...parts);
const frontend = (...parts) => read('frontend', ...parts);

test('vendor review schema stores pending approved-vendor changes without overwriting active data', () => {
  const schema = backend('prisma', 'schema.prisma');
  const migration = backend('prisma', 'migrations', '20260717007000_vendor_review_and_po_tax_fields', 'migration.sql');
  const service = backend('src', 'modules', 'vendors', 'vendor.service.js');
  const constants = backend('src', 'modules', 'vendors', 'vendor.constants.js');

  assert.match(schema, /pending_changes\s+Json\?/);
  assert.match(schema, /pending_change_status\s+String\?/);
  assert.match(migration, /ADD COLUMN IF NOT EXISTS "pending_changes" JSONB/);
  assert.match(constants, /PENDING_INFORMATION/);
  assert.match(constants, /CHANGES_REQUESTED/);
  assert.match(service, /vendor_change_submitted/);
  assert.match(service, /pending_change_status: VENDOR_PENDING_CHANGE_STATUS\.PENDING_APPROVAL/);
  assert.match(service, /pending_changes: pendingChanges/);
});

test('vendor approval readiness reports concrete missing document and validation reasons', () => {
  const service = backend('src', 'modules', 'vendors', 'vendor.service.js');
  const constants = backend('src', 'modules', 'vendors', 'vendor.constants.js');

  assert.match(constants, /VENDOR_REQUIRED_DOCUMENT_TYPES/);
  assert.match(constants, /GST_CERTIFICATE/);
  assert.match(constants, /PAN_CARD/);
  assert.match(constants, /VENDOR_AGREEMENT/);
  assert.match(service, /Missing \$\{document\}/);
  assert.match(service, /GST Number Invalid/);
  assert.match(service, /PAN Number Invalid/);
  assert.match(service, /IFSC Invalid/);
  assert.match(service, /PENDING_INFORMATION/);
});

test('purchase order backend owns GST calculation and persists tax summary', () => {
  const schema = backend('prisma', 'schema.prisma');
  const migration = backend('prisma', 'migrations', '20260717007000_vendor_review_and_po_tax_fields', 'migration.sql');
  const service = backend('src', 'modules', 'purchase-orders', 'po.service.js');
  const validation = backend('src', 'modules', 'purchase-orders', 'po.validation.js');

  assert.match(schema, /tax_summary\s+Json\?/);
  assert.match(migration, /ADD COLUMN IF NOT EXISTS "tax_summary" JSONB/);
  assert.match(service, /calculatePurchaseOrderTax/);
  assert.match(service, /taxType: isIntraState \? 'CGST_SGST' : 'IGST'/);
  assert.match(service, /amount: taxCalculation\.summary\.grandTotal/);
  assert.match(service, /line_items: taxCalculation\.items/);
  assert.match(service, /tax_summary: taxCalculation\.summary/);
  assert.match(service, /totalGst/);
  assert.doesNotMatch(service, /discount/);
  assert.match(validation, /poItemSchema/);
  assert.match(validation, /otherCharges/);
  assert.match(validation, /calculatePurchaseOrderTaxSchema/);
  assert.doesNotMatch(validation, /discount/);
});

test('purchase order frontend uses backend vendor lookup and avoids fake/manual production behavior', () => {
  const page = frontend('src', 'pages', 'PurchaseOrders', 'PurchaseOrderCreate.jsx');
  const service = frontend('src', 'services', 'purchaseOrderServices.js');

  assert.match(page, /getVendorsLookup/);
  assert.match(page, /calculatePurchaseOrderTax/);
  assert.match(page, /vendor code, vendor name, or GST/i);
  assert.doesNotMatch(page, /Math\.random/);
  assert.doesNotMatch(page, /\balert\s*\(/);
  assert.doesNotMatch(page, /getVendors\(/);
  assert.doesNotMatch(page, /calculatePreview/);
  assert.doesNotMatch(page, /discount/);
  assert.match(service, /unitPrice/);
  assert.match(service, /\/v1\/purchase-orders\/calculate-tax/);
  assert.doesNotMatch(service, /amount: Number\(data\.total\)/);
  assert.doesNotMatch(service, /discount/);
});
