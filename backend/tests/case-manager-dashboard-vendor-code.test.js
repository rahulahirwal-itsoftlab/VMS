import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const backendSource = (...segments) =>
  fs.readFileSync(path.resolve('src', ...segments), 'utf8');

const frontendSource = (...segments) =>
  fs.readFileSync(path.resolve('..', 'frontend', 'src', ...segments), 'utf8');

test('case manager dashboard uses real backend dashboard data and no fake arrays', () => {
  const dashboardPage = frontendSource('pages', 'Dashboard', 'Dashboard.jsx');
  const caseDashboard = frontendSource('components', 'dashboard', 'roleDashboards', 'CaseManagerDashboard.jsx');
  const dashboardService = frontendSource('services', 'dashboardService.js');
  const controller = backendSource('modules', 'dashboard', 'dashboard.controller.js');
  const service = backendSource('modules', 'dashboard', 'dashboard.service.js');
  const repository = backendSource('modules', 'dashboard', 'dashboard.repository.js');

  assert.match(dashboardPage, /case ROLES\.CASE_MANAGER:[\s\S]*<CaseManagerDashboard \/>/);
  assert.match(dashboardService, /api\.get\("\/v1\/dashboard\/me"/);
  assert.match(controller, /dashboardService\.getRoleDashboard\(req\.user, req\.query\)/);
  assert.match(service, /user\.role === 'CASE_MANAGER'/);
  assert.match(repository, /getCaseManagerDashboard/);
  assert.match(repository, /prisma\.vendor\.count/);
  assert.match(repository, /prisma\.purchaseOrder\.count/);
  assert.match(repository, /prisma\.invoice\.count/);
  assert.match(repository, /prisma\.payment\.count/);
  assert.match(repository, /prisma\.notification\.findMany/);
  assert.doesNotMatch(caseDashboard, /mock|fake|dummy|sample|placeholder|Math\.random|staticData|fallbackData/i);
});

test('case manager dashboard exposes required live card keys, charts, activity, notifications, and tables', () => {
  const repository = backendSource('modules', 'dashboard', 'dashboard.repository.js');
  const caseDashboard = frontendSource('components', 'dashboard', 'roleDashboards', 'CaseManagerDashboard.jsx');

  for (const key of [
    'totalVendors',
    'activeVendors',
    'inactiveVendors',
    'pendingVendors',
    'totalPurchaseOrders',
    'pendingPurchaseOrders',
    'approvedPurchaseOrders',
    'totalInvoices',
    'pendingInvoices',
    'approvedInvoices',
    'rejectedInvoices',
    'totalPayments',
    'pendingPayments',
    'completedPayments',
  ]) {
    assert.match(repository, new RegExp(key));
    assert.match(caseDashboard, new RegExp(key));
  }

  for (const key of [
    'vendorStatus',
    'invoiceStatus',
    'paymentStatus',
    'monthlyVendorRegistration',
    'monthlyInvoiceCount',
    'monthlyPaymentCount',
    'topVendors',
    'recentActivity',
    'recentNotifications',
    'latestVendors',
    'latestPurchaseOrders',
    'latestInvoices',
    'latestPayments',
  ]) {
    assert.match(repository, new RegExp(key));
    assert.match(caseDashboard, new RegExp(key));
  }
});

test('vendor code is generated only in backend from PostgreSQL sequence', () => {
  const migration = fs.readFileSync(path.resolve('prisma', 'migrations', '20260717001000_add_vendor_code_sequence', 'migration.sql'), 'utf8');
  const vendorService = backendSource('modules', 'vendors', 'vendor.service.js');
  const validation = backendSource('modules', 'vendors', 'vendor.validation.js');
  const client = frontendSource('services', 'vendorService.js');
  const addVendor = frontendSource('pages', 'Vendors', 'AddVendor.jsx');

  assert.match(migration, /CREATE SEQUENCE IF NOT EXISTS vendor_code_seq/);
  assert.match(vendorService, /nextval\('vendor_code_seq'\)/);
  assert.match(vendorService, /VND-\$\{String\(nextValue\)\.padStart\(6, '0'\)\}/);
  assert.doesNotMatch(vendorService, /Date\.now\(\)/);
  assert.doesNotMatch(validation, /vendorCode/);
  const createVendorBody = client.slice(client.indexOf('export const createVendor'), client.indexOf('export const updateVendor'));
  assert.doesNotMatch(createVendorBody, /vendorCode:/);
  assert.match(addVendor, /Generated automatically after creation/);
  assert.match(addVendor, /readOnly/);
  assert.match(addVendor, /setGeneratedVendorCode/);
});
