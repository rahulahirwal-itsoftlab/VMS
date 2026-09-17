import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const frontend = (...parts) => fs.readFileSync(path.join(root, 'frontend', 'src', ...parts), 'utf8');

test('frontend required field matrix covers ERP form modules and downstream usage', () => {
  const matrix = frontend('utils', 'validationMatrix.js');

  for (const moduleKey of ['vendor', 'purchaseOrder', 'invoice', 'receiptDocument', 'payment', 'approvalReject', 'paymentApprove']) {
    assert.match(matrix, new RegExp(`${moduleKey}: \\[`));
  }

  for (const field of ['Vendor GST Number', 'Contact Person', 'Vendor Email', 'State', 'Tax Type', 'Purchase Order Date', 'Invoice Date', 'Transaction Reference Number / UTR']) {
    assert.match(matrix, new RegExp(field.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  }

  assert.match(matrix, /dbColumn/);
  assert.match(matrix, /usedIn/);
  assert.match(matrix, /validateRequiredFields/);
  assert.match(matrix, /focusValidationField/);
});

test('major ERP forms use centralized validation summary and matrix helpers', () => {
  const files = [
    frontend('pages', 'Vendors', 'AddVendor.jsx'),
    frontend('pages', 'PurchaseOrders', 'PurchaseOrderCreate.jsx'),
    frontend('pages', 'Invoices', 'InvoiceCreate.jsx'),
    frontend('pages', 'Payments', 'PaymentCreate.jsx'),
    frontend('pages', 'Payments', 'PaymentsList.jsx'),
    frontend('pages', 'ThreeWayMatching', 'MatchingList.jsx'),
    frontend('pages', 'ThreeWayMatching', 'MatchingDetail.jsx'),
  ];

  for (const source of files) {
    assert.match(source, /validateRequiredFields|ValidationSummary/);
  }

  assert.match(files[0], /Cannot save Vendor/);
  assert.match(files[1], /Cannot save Purchase Order/);
  assert.match(files[2], /Cannot create Invoice/);
  assert.match(files[3], /Cannot save Payment/);
  assert.match(files[5], /Cannot save GRN|Cannot save Delivery Challan/);
});
