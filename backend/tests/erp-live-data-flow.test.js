import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = (...parts) => fs.readFileSync(path.join(root, ...parts), 'utf8');
const backend = (...parts) => read('backend', ...parts);
const frontend = (...parts) => read('frontend', ...parts);

test('vendor master fields are returned through lookup and mapped into downstream forms', () => {
  const lookup = backend('src', 'modules', 'lookups', 'lookup.controller.js');
  const poCreate = frontend('src', 'pages', 'PurchaseOrders', 'PurchaseOrderCreate.jsx');
  const invoiceService = frontend('src', 'services', 'invoiceService.js');
  const invoiceCreate = frontend('src', 'pages', 'Invoices', 'InvoiceCreate.jsx');

  for (const field of ['tax_type', 'contact_designation', 'bank_name', 'account_holder', 'bank_account_no', 'ifsc_code', 'bank_branch']) {
    assert.match(lookup, new RegExp(field));
  }

  for (const prop of ['taxType', 'bankName', 'accountHolder', 'bankAccountNo', 'ifscCode', 'bankBranch']) {
    assert.match(lookup, new RegExp(prop));
  }

  assert.match(poCreate, /Vendor Master before creating a Purchase Order/);
  assert.match(poCreate, /selectedVendor\.taxType/);
  assert.match(poCreate, /selectedVendor\.bankName/);
  assert.match(poCreate, /selectedVendor\.bankAccountNo/);

  assert.match(invoiceService, /vendorTaxType/);
  assert.match(invoiceService, /vendorBankName/);
  assert.match(invoiceService, /vendorIfscCode/);
  assert.match(invoiceCreate, /Vendor GST Number missing\. Complete it in Vendor Master\./);
  assert.match(invoiceCreate, /Vendor Bank Details missing\. Complete bank details in Vendor Master\./);
});

test('backend services enforce required live-data prerequisites before downstream records are created', () => {
  const poValidation = backend('src', 'modules', 'purchase-orders', 'po.validation.js');
  const poService = backend('src', 'modules', 'purchase-orders', 'po.service.js');
  const matchingService = backend('src', 'modules', 'three-way-matching', 'matching.service.js');
  const matchingValidation = backend('src', 'modules', 'three-way-matching', 'matching.validation.js');
  const paymentService = backend('src', 'modules', 'payments', 'payment.service.js');

  assert.match(poValidation, /requiredDate\('Purchase Order Date'\)/);
  assert.match(poValidation, /Delivery address is required/);
  assert.match(poValidation, /Payment Terms is required/);
  assert.match(poService, /assertVendorMasterReadyForPO/);
  assert.match(poService, /Vendor Master data is incomplete/);

  assert.match(matchingValidation, /requiredDate\('GRN Receipt Date'\)/);
  assert.match(matchingValidation, /Receiver Name is required/);
  assert.match(matchingValidation, /requiredDate\('Delivery Challan Date'\)/);
  assert.match(matchingService, /resolvePurchaseOrderLineItems/);
  assert.match(matchingService, /Purchase Order items missing/);
  assert.match(matchingService, /line_items:\s+lineItems/);

  assert.match(paymentService, /assertVendorBankReadyForPayment/);
  assert.match(paymentService, /Vendor bank details are incomplete/);
  assert.match(paymentService, /Complete these fields in Vendor Master before creating a Payment/);
});

test('payment creation page displays exact missing vendor bank fields from selected invoice data', () => {
  const paymentCreate = frontend('src', 'pages', 'Payments', 'PaymentCreate.jsx');

  for (const label of ['Bank Name', 'Account Holder', 'Account Number', 'IFSC Code', 'Bank Branch']) {
    assert.match(paymentCreate, new RegExp(`${label} missing`));
  }

  assert.match(paymentCreate, /selectedInvoice/);
  assert.match(paymentCreate, /Complete vendor bank details in Vendor Master before creating a Payment/);
});
