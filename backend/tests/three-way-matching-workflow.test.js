import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { compareThreeWayDocuments } from '../src/modules/three-way-matching/matching.utils.js';

const basePo = {
  id: 'po-1',
  po_number: 'PO-2026-000001',
  vendor_id: 'vendor-1',
  amount: 1180,
  vendor: { name: 'ACRE Supplies', vendor_code: 'VEN-001' },
  line_items: [
    { itemCode: 'STAND-001', itemName: 'Laptop Stand', hsnCode: '8473', quantity: 10, unitPrice: 100, taxableAmount: 1000, gstAmount: 180, lineTotal: 1180 },
  ],
};

const baseGrn = {
  id: 'grn-1',
  grn_number: 'GRN-2026-000001',
  vendor_id: 'vendor-1',
  total_amount: 1180,
  gst_amount: 180,
  line_items: [
    { itemCode: 'STAND-001', itemName: 'Laptop Stand', hsnCode: '8473', receivedQuantity: 10, unitPrice: 100, taxableAmount: 1000, gstAmount: 180, lineTotal: 1180 },
  ],
};

const baseDeliveryChallan = {
  id: 'dc-1',
  delivery_challan_number: 'DC-2026-000001',
  vendor_id: 'vendor-1',
  total_amount: 1180,
  gst_amount: 180,
  line_items: [
    { itemCode: 'STAND-001', itemName: 'Laptop Stand', deliveredQuantity: 10, unitPrice: 100, taxableAmount: 1000, gstAmount: 180, lineTotal: 1180 },
  ],
};

const baseInvoice = {
  id: 'invoice-1',
  invoice_number: 'INV-001',
  vendor_id: 'vendor-1',
  amount: 1180,
  invoice_total: 1180,
  vendor: { name: 'ACRE Supplies', vendor_code: 'VEN-001' },
  purchase_order_id: 'po-1',
  line_items: [
    { itemCode: 'STAND-001', itemName: 'Laptop Stand', hsnCode: '8473', quantity: 10, unitPrice: 100, taxableAmount: 1000, gstAmount: 180, lineTotal: 1180 },
  ],
};

test('three-way matching returns MATCHED when PO, GRN, and invoice agree', () => {
  const result = compareThreeWayDocuments({
    invoice: baseInvoice,
    purchaseOrder: basePo,
    grn: baseGrn,
    deliveryChallan: baseDeliveryChallan,
  });

  assert.equal(result.status, 'MATCHED');
  assert.equal(result.unmatched_fields.length, 0);
  assert.equal(result.approval_recommendation, 'APPROVE');
});

test('three-way matching blocks approval with exact mismatch reasons', () => {
  const result = compareThreeWayDocuments({
    invoice: {
      ...baseInvoice,
      invoice_total: 1300,
      amount: 1300,
      line_items: [{ ...baseInvoice.line_items[0], quantity: 12, lineTotal: 1300 }],
    },
    purchaseOrder: basePo,
    grn: baseGrn,
    deliveryChallan: baseDeliveryChallan,
  });

  assert.equal(result.status, 'PARTIAL_MATCH');
  assert.equal(result.matching.quantityMatch.status, 'MISMATCH');
  assert.equal(result.matching.totalMatch.status, 'MISMATCH');
  assert.match(result.unmatched_fields.map((field) => field.reason).join(' '), /Invoice quantity does not match/);
  assert.match(result.unmatched_fields.map((field) => field.reason).join(' '), /Invoice amount exceeds/);
  assert.equal(result.approval_recommendation, 'REVIEW');
});

test('three-way matching blocks approval when Delivery Challan is missing', () => {
  const result = compareThreeWayDocuments({
    invoice: baseInvoice,
    purchaseOrder: basePo,
    grn: baseGrn,
  });

  assert.equal(result.status, 'PARTIAL_MATCH');
  assert.match(result.unmatched_fields.map((field) => field.reason).join(' '), /Delivery Challan is required/);
  assert.equal(result.matching.deliveryChallanMatch.status, 'PENDING');
});

test('three-way matching uses stable item identifiers instead of array index', () => {
  const purchaseOrder = {
    ...basePo,
    amount: 354,
    line_items: [
      { itemCode: 'A-100', itemName: 'Alpha', quantity: 10, unitPrice: 10, taxableAmount: 100, gstAmount: 18, lineTotal: 118 },
      { itemCode: 'B-200', itemName: 'Beta', quantity: 5, unitPrice: 20, taxableAmount: 100, gstAmount: 18, lineTotal: 118 },
    ],
  };
  const invoice = {
    ...baseInvoice,
    amount: 295,
    invoice_total: 295,
    line_items: [
      { itemCode: 'B-200', itemName: 'Beta', quantity: 10, unitPrice: 20, taxableAmount: 200, gstAmount: 36, lineTotal: 236 },
      { itemCode: 'A-100', itemName: 'Alpha', quantity: 5, unitPrice: 10, taxableAmount: 50, gstAmount: 9, lineTotal: 59 },
    ],
  };

  const result = compareThreeWayDocuments({
    invoice,
    purchaseOrder,
    grn: null,
    deliveryChallan: null,
  });

  assert.equal(result.matching.itemMatch.status, 'MATCHED');
  assert.equal(result.matching.quantityMatch.status, 'MISMATCH');
  assert.equal(result.matching.taxMatch.status, 'MISMATCH');
  assert.equal(result.matching.totalMatch.status, 'MISMATCH');
  assert.ok(result.unmatched_fields.some((field) => field.field === 'quantity'));
  assert.ok(result.unmatched_fields.some((field) => field.field === 'taxable_amount'));
});

test('three-way matching reports requested result buckets as MATCHED, MISMATCH, or PENDING', () => {
  const result = compareThreeWayDocuments({
    invoice: {
      ...baseInvoice,
      line_items: [{ ...baseInvoice.line_items[0], quantity: 8 }],
    },
    purchaseOrder: basePo,
    grn: baseGrn,
    deliveryChallan: baseDeliveryChallan,
  });

  const statuses = [
    result.matching.vendorMatch.status,
    result.matching.poMatch.status,
    result.matching.grnMatch.status,
    result.matching.deliveryChallanMatch.status,
    result.matching.itemMatch.status,
    result.matching.quantityMatch.status,
    result.matching.unitPriceMatch.status,
    result.matching.taxMatch.status,
    result.matching.totalMatch.status,
  ];

  assert.deepEqual(new Set(statuses), new Set(['MATCHED', 'MISMATCH']));
  assert.equal(result.matching.quantityMatch.status, 'MISMATCH');
});

test('matching routes allow Finance Head review and expose return for correction', () => {
  const routes = readFileSync(new URL('../src/modules/three-way-matching/matching.routes.js', import.meta.url), 'utf8');

  assert.match(routes, /ROLES\.FINANCE_HEAD/);
  assert.match(routes, /\/:id\/return/);
  assert.match(routes, /\/delivery-challan/);
  assert.match(routes, /router\.delete\('\/grn\/:id'/);
  assert.doesNotMatch(routes, /authorize\(\[ROLES\.SUPER_ADMIN\]\)/);
});

test('matched invoices use dynamic amount-based approval routing and notify the next approver', () => {
  const service = readFileSync(new URL('../src/modules/three-way-matching/matching.service.js', import.meta.url), 'utf8');
  const notifications = readFileSync(new URL('../src/modules/notifications/notification.service.js', import.meta.url), 'utf8');

  assert.match(service, /getRequiredInvoiceApprovalRole/);
  assert.match(service, /getNextApprovalStatus\(invoiceAmount, INVOICE_STATUS\.PENDING_THREE_WAY_MATCH\)/);
  assert.match(service, /current_approval_level:\s+nextApprovalLevel/);
  assert.match(service, /notifyInvoiceNextLevel\(updatedInvoice, nextApprovalLevel/);
  assert.doesNotMatch(service, /current_approval_level:\s+comparison\.status === THREE_WAY_MATCH_STATUS\.MATCHED \? 'FINANCE_HEAD'/);
  assert.doesNotMatch(notifications, /if \(nextLevel === 'FINANCE_HEAD' \|\| nextLevel === 'L3'\) return/);
  assert.match(notifications, /Purchase Order Number/);
  assert.match(notifications, /Matching Result/);
  assert.match(notifications, /Priority/);
});
