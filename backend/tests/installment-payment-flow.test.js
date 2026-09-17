import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const root = path.resolve(__dirname, '..', '..');
const backend = (...parts) => path.join(root, 'backend', ...parts);
const frontend = (...parts) => path.join(root, 'frontend', ...parts);

const read = (file) => fs.readFileSync(file, 'utf8');

test('PO service can generate and persist installment schedules from backend duration', () => {
  const service = read(backend('src', 'modules', 'purchase-orders', 'po.service.js'));
  const validation = read(backend('src', 'modules', 'purchase-orders', 'po.validation.js'));

  assert.match(service, /generateInstallmentsFromDuration/);
  assert.match(service, /const baseCents = Math\.floor\(totalCents \/ months\)/);
  assert.match(service, /const amountCents = isLast \? totalCents - allocatedCents : baseCents/);
  assert.match(service, /remaining_amount: amount/);
  assert.match(service, /installments:\s*preparedInstallments\.length > 0 \?/);
  assert.match(validation, /installmentDurationMonths/);
  assert.doesNotMatch(validation, /At least one installment details row is required for Installment Payment/);
});

test('payment creation validates the current payable installment inside one database transaction', () => {
  const service = read(backend('src', 'modules', 'payments', 'payment.service.js'));
  const repository = read(backend('src', 'modules', 'payments', 'payment.repository.js'));

  assert.match(repository, /async transaction\(callback, options = \{\}\)/);
  assert.match(service, /isolationLevel: 'Serializable'/);
  assert.match(service, /SELECT id FROM invoices WHERE id = \$1 FOR UPDATE/);
  assert.match(service, /SELECT id FROM installments WHERE purchase_order_id = \$1 ORDER BY installment_number ASC FOR UPDATE/);
  assert.match(service, /summarizeInstallmentPlan\(lockedInstallments, invoice\)\.currentInstallment/);
  assert.match(service, /Only the current payable installment can be paid/);
  assert.match(service, /Payment amount cannot exceed the installment remaining amount/);
  assert.match(service, /installment_id: targetInstallment \? targetInstallment\.id : null/);
  assert.match(service, /payment_status: finalPaymentStatus/);
  assert.doesNotMatch(service, /status: INVOICE_STATUS\.APPROVED,\s*last_payment_date/s);
});

test('Payment Store consumes backend current installment and preserves zero remaining amounts', () => {
  const page = read(frontend('src', 'pages', 'Payments', 'PaymentCreate.jsx'));
  const paymentService = read(frontend('src', 'services', 'paymentService.js'));
  const routes = read(backend('src', 'modules', 'payments', 'payment.routes.js'));
  const controller = read(backend('src', 'modules', 'payments', 'payment.controller.js'));
  const service = read(backend('src', 'modules', 'payments', 'payment.service.js'));

  assert.match(page, /const getCurrentInstallment = \(invoice\) =>/);
  assert.match(page, /invoice\.currentInstallment\?\.id/);
  assert.match(page, /const isStoreContinuation = Boolean\(preselectedInvoiceId\)/);
  assert.match(page, /getPaymentStoreData\(preselectedInvoiceId\)/);
  assert.match(page, /Current Payment/);
  assert.match(page, /Current installment is selected by backend/);
  assert.match(page, /await loadInvoices\(\);/);
  assert.match(paymentService, /getPaymentStoreData/);
  assert.match(routes, /\/payment-store\/:invoiceId/);
  assert.match(controller, /getPaymentStoreData/);
  assert.match(service, /async getPaymentStoreData\(invoiceId, user\)/);
  assert.match(paymentService, /remainingAmount: Number\(i\.remainingAmount \?\? i\.remaining_amount \?\? i\.amount \?\? 0\)/);
});
