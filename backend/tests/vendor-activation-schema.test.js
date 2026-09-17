import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const root = path.resolve(process.cwd(), '..');
const read = (...parts) => fs.readFileSync(path.join(root, ...parts), 'utf8');
const backend = (...parts) => read('backend', ...parts);

test('vendor schema and repair migration include activation and missing production columns', () => {
  const schema = backend('prisma', 'schema.prisma');
  const migration = backend(
    'prisma',
    'migrations',
    '20260717005000_repair_vendor_activation_schema',
    'migration.sql',
  );

  assert.match(schema, /pan_number\s+String\?\s+@unique/);
  assert.match(schema, /bank_name\s+String\?/);
  assert.match(schema, /approval_status\s+String\s+@default\("PENDING"\)/);
  assert.match(schema, /approval_remarks\s+String\?/);
  assert.match(schema, /activated_at\s+DateTime\?/);
  assert.match(migration, /ADD COLUMN IF NOT EXISTS "pan_number"/);
  assert.match(migration, /ADD COLUMN IF NOT EXISTS "bank_name"/);
  assert.match(migration, /ADD COLUMN IF NOT EXISTS "approval_status"/);
  assert.match(migration, /CREATE UNIQUE INDEX IF NOT EXISTS "vendors_pan_number_key"/);
});

test('vendor approval persists ACTIVE status with APPROVED approval state', () => {
  const constants = backend('src', 'modules', 'vendors', 'vendor.constants.js');
  const service = backend('src', 'modules', 'vendors', 'vendor.service.js');

  assert.match(constants, /VENDOR_APPROVAL_STATUS/);
  assert.match(constants, /ACTIVE: 'ACTIVE'/);
  assert.match(constants, /APPROVED: 'APPROVED'/);
  assert.match(constants, /isVendorApprovedAndActive/);
  assert.match(service, /buildVendorStatusData/);
  assert.match(service, /status: canonicalStatus/);
  assert.match(service, /approval_status: isApproved\s*\?\s*VENDOR_APPROVAL_STATUS\.APPROVED/);
  assert.match(service, /is_active: isApproved/);
  assert.match(service, /approved_by_id: isApproved \? userId : null/);
  assert.match(service, /activated_at: isApproved \? now : null/);
  assert.match(service, /approval_remarks: remarks \|\| null/);
});

test('approved vendor consumers use database-backed active approval helper', () => {
  const poService = backend('src', 'modules', 'purchase-orders', 'po.service.js');
  const invoiceService = backend('src', 'modules', 'invoices', 'invoice.service.js');
  const lookupController = backend('src', 'modules', 'lookups', 'lookup.controller.js');
  const dashboardRepository = backend('src', 'modules', 'dashboard', 'dashboard.repository.js');
  const reportService = backend('src', 'modules', 'reports', 'report.service.js');

  assert.match(poService, /isVendorApprovedAndActive/);
  assert.doesNotMatch(poService, /vendor\.status !== VENDOR_STATUS\.APPROVED/);
  assert.match(invoiceService, /isVendorApprovedAndActive\(invoice\.vendor\)/);
  assert.match(lookupController, /approval_status: VENDOR_APPROVAL_STATUS\.APPROVED/);
  assert.match(lookupController, /status: VENDOR_STATUS\.ACTIVE/);
  assert.match(dashboardRepository, /approvedActiveVendorWhere/);
  assert.match(reportService, /approvedActiveVendorWhere/);
});

test('vendor approval notifications fan out after Finance Head approval', () => {
  const notifications = backend('src', 'modules', 'notifications', 'notification.service.js');

  assert.match(notifications, /notifyVendorStatusChange/);
  assert.match(notifications, /normalizedStatus === 'ACTIVE'/);
  assert.match(notifications, /createNotificationsForRole\(ROLES\.TEAM_LEAD/);
  assert.match(notifications, /createNotificationsForRole\(ROLES\.MANAGER/);
  assert.match(notifications, /notifySuperAdmins/);
});
