import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const root = path.resolve(process.cwd(), '..');
const read = (...parts) => fs.readFileSync(path.join(root, ...parts), 'utf8');
const backend = (...parts) => read('backend', ...parts);
const frontend = (...parts) => read('frontend', ...parts);

test('notification schema stores role and reference metadata without replacing existing table', () => {
  const schema = backend('prisma', 'schema.prisma');
  const migration = backend('prisma', 'migrations', '20260717003000_add_notification_role_reference', 'migration.sql');

  assert.match(schema, /model Notification/);
  assert.match(schema, /role\s+String\?/);
  assert.match(schema, /reference_id\s+String\?/);
  assert.match(migration, /ALTER TABLE "notifications"/);
  assert.match(migration, /ADD COLUMN IF NOT EXISTS "role"/);
  assert.match(migration, /ADD COLUMN IF NOT EXISTS "reference_id"/);
});

test('central notification service supports role fan-out, super admin copies, and workflow events', () => {
  const service = backend('src', 'modules', 'notifications', 'notification.service.js');

  assert.match(service, /createNotificationsForRole/);
  assert.match(service, /notifySuperAdmins/);
  assert.match(service, /notifyApprovalRole/);
  assert.match(service, /notifyVendorApprovalRequested/);
  assert.match(service, /notifyPurchaseOrderApprovalRequested/);
  assert.match(service, /notifyPaymentApprovalRequested/);
  assert.match(service, /notifyInvoiceNextLevel/);
  assert.match(service, /role:/);
  assert.match(service, /reference_id:/);
});

test('purchase order and payment approval actions stamp approval metadata and history', () => {
  const schema = backend('prisma', 'schema.prisma');
  const poService = backend('src', 'modules', 'purchase-orders', 'po.service.js');
  const paymentService = backend('src', 'modules', 'payments', 'payment.service.js');

  assert.match(schema, /approved_by_id\s+String\?/);
  assert.match(schema, /approved_at\s+DateTime\?/);
  assert.match(schema, /approval_remarks\s+String\?/);
  assert.match(poService, /approvalLog\.create/);
  assert.match(poService, /auditLog\.create/);
  assert.match(poService, /notifyPurchaseOrderApprovalRequested/);
  assert.match(poService, /notifyPurchaseOrderStatusChange/);
  assert.match(paymentService, /notifyPaymentApprovalRequested/);
  assert.match(paymentService, /approved_at: new Date\(\)/);
});

test('frontend notification dropdown and filtering use real notification APIs', () => {
  const navbar = frontend('src', 'components', 'layout', 'Navbar.jsx');
  const page = frontend('src', 'pages', 'Notifications', 'NotificationsList.jsx');
  const service = frontend('src', 'services', 'notificationService.js');

  assert.match(navbar, /getNotifications\(\{ page: 1, limit: 5 \}\)/);
  assert.match(navbar, /Latest notifications/);
  assert.match(navbar, /markRead/);
  assert.match(page, /entityTypeFilter/);
  assert.match(page, /params\.entityType/);
  assert.match(service, /role: n\.role/);
  assert.match(service, /referenceId: n\.reference_id/);
  assert.doesNotMatch(navbar, /Math\.random|mock|fake/i);
});
