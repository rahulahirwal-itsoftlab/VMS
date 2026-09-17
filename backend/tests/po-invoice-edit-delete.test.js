import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const backend = (...segments) => fs.readFileSync(path.resolve('src', ...segments), 'utf8');
const frontend = (...segments) => fs.readFileSync(path.resolve('..', 'frontend', 'src', ...segments), 'utf8');
const prismaSchema = () => fs.readFileSync(path.resolve('prisma', 'schema.prisma'), 'utf8');

test('purchase order edit and delete are routed through backend service rules', () => {
  const routes = backend('modules', 'purchase-orders', 'po.routes.js');
  const controller = backend('modules', 'purchase-orders', 'po.controller.js');
  const service = backend('modules', 'purchase-orders', 'po.service.js');
  const validation = backend('modules', 'purchase-orders', 'po.validation.js');
  const client = frontend('services', 'purchaseOrderServices.js');
  const schema = prismaSchema();

  assert.match(routes, /\.put\(authorize\(CREATE_ACCESS\), validate\(updatePurchaseOrderSchema\)/);
  assert.match(routes, /\.delete\(authorize\(CREATE_ACCESS\), validate\(deletePurchaseOrderSchema\)/);
  assert.match(controller, /updatePurchaseOrder/);
  assert.match(controller, /deletePurchaseOrder/);
  assert.match(validation, /deleteReason/);
  assert.match(service, /getPurchaseOrderReferenceBlocker/);
  assert.match(service, /Goods Receipt Note/);
  assert.match(service, /linked to an Invoice/);
  assert.match(service, /linked to Three-Way Matching/);
  assert.match(service, /linked to a Payment/);
  assert.match(service, /old_value: existing/);
  assert.match(service, /new_value: updated/);
  assert.match(service, /notifyDocumentEdited/);
  assert.match(service, /notifyPurchaseOrderDeleted/);
  assert.match(schema, /deleted_at\s+DateTime\?/);
  assert.match(schema, /updated_by_id\s+String\?/);
  assert.match(client, /export const updatePurchaseOrder/);
  assert.match(client, /export const deletePurchaseOrder/);
});

test('invoice edit and delete enforce pre-finance and payment/finalization rules', () => {
  const routes = backend('modules', 'invoices', 'invoice.routes.js');
  const controller = backend('modules', 'invoices', 'invoice.controller.js');
  const service = backend('modules', 'invoices', 'invoice.service.js');
  const validation = backend('modules', 'invoices', 'invoice.validation.js');
  const client = frontend('services', 'invoiceService.js');

  assert.match(routes, /router\.put\('\/:id'/);
  assert.match(routes, /validate\(updateInvoiceSchema\)/);
  assert.match(controller, /updateInvoice/);
  assert.match(validation, /updateInvoiceSchema/);
  assert.match(service, /assertCanEditInvoice/);
  assert.match(service, /pending Finance approval/);
  assert.match(service, /already linked to a Payment/);
  assert.match(service, /Invoice cannot be deleted because it is already approved/);
  assert.match(service, /Invoice cannot be deleted because payment processing has started/);
  assert.match(service, /old_value: invoice/);
  assert.match(service, /new_value: updated/);
  assert.match(service, /notifyDocumentEdited/);
  assert.match(client, /export const updateInvoice/);
});
