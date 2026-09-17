import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import dashboardRepository from '../src/modules/dashboard/dashboard.repository.js';
import dashboardService from '../src/modules/dashboard/dashboard.service.js';

const frontendSource = (...segments) =>
  fs.readFileSync(path.resolve('..', 'frontend', 'src', ...segments), 'utf8');

const backendSource = (...segments) =>
  fs.readFileSync(path.resolve('src', ...segments), 'utf8');

const originalRepository = {
  getUserAnalytics: dashboardRepository.getUserAnalytics,
  getVendorAnalytics: dashboardRepository.getVendorAnalytics,
  getPurchaseOrderAnalytics: dashboardRepository.getPurchaseOrderAnalytics,
  getInvoiceAnalytics: dashboardRepository.getInvoiceAnalytics,
  getPaymentAnalytics: dashboardRepository.getPaymentAnalytics,
  getThreeWayMatchStats: dashboardRepository.getThreeWayMatchStats,
  getRevenueTrend: dashboardRepository.getRevenueTrend,
  getVendorGrowthTrend: dashboardRepository.getVendorGrowthTrend,
  getPurchaseOrderTrend: dashboardRepository.getPurchaseOrderTrend,
  getTopVendorsByRevenue: dashboardRepository.getTopVendorsByRevenue,
  getRecentActivityInRange: dashboardRepository.getRecentActivityInRange,
};

test.afterEach(() => {
  Object.assign(dashboardRepository, originalRepository);
});

test('dashboard removes quick actions and pending tasks fake sections', () => {
  const dashboard = frontendSource('components', 'dashboard', 'roleDashboards', 'DashboardOverview.jsx');

  assert.doesNotMatch(dashboard, /Quick Actions|Create, review and manage key workflow items/i);
  assert.doesNotMatch(dashboard, /Create Vendor|Create PO|Create Invoice|View Reports|Manage Users/);
  assert.doesNotMatch(dashboard, /Pending Tasks|Approval required items for your work queue/i);
  assert.doesNotMatch(dashboard, /Approval Required|Pending Invoice|Vendor Verification|Payment Pending/);
  assert.doesNotMatch(dashboard, /quickActions|pendingTaskRows|PendingTaskRow/);
});

test('dashboard frontend uses analytics API, filters, refresh, and empty states without fake fallback data', () => {
  const dashboard = frontendSource('components', 'dashboard', 'roleDashboards', 'DashboardOverview.jsx');
  const service = frontendSource('services', 'dashboardService.js');

  assert.match(service, /\/v1\/dashboard\/analytics/);
  assert.match(service, /DATE_PRESETS/);
  assert.match(service, /GROUP_OPTIONS/);
  assert.match(dashboard, /getDashboardAnalytics\(filters\)/);
  assert.match(dashboard, /Refresh/);
  assert.match(dashboard, /No data available\./);
  assert.match(dashboard, /Dashboard data could not be loaded\. Please try again\./);
  assert.match(dashboard, /Recognized Revenue/);
  assert.match(dashboard, /Top Vendors by Revenue/);
  assert.doesNotMatch(dashboard, /dummy|fake|sample|placeholder|fallbackData|hardcoded|Math\.random/i);
  assert.doesNotMatch(dashboard, /window\.location|location\.href/);
});

test('dashboard charts render only API-provided series and distributions', () => {
  const dashboard = frontendSource('components', 'dashboard', 'roleDashboards', 'DashboardOverview.jsx');

  assert.match(dashboard, /normalizeSeries\(data\?\.trends\?\.revenue\)/);
  assert.match(dashboard, /normalizeSeries\(data\?\.trends\?\.vendorGrowth\)/);
  assert.match(dashboard, /normalizeSeries\(data\?\.trends\?\.purchaseOrders\)/);
  assert.match(dashboard, /hasData=\{revenueTrend\.length > 0\}/);
  assert.match(dashboard, /hasData=\{vendorGrowth\.length > 0\}/);
  assert.match(dashboard, /hasData=\{purchaseOrderTrend\.length > 0\}/);
  assert.doesNotMatch(dashboard, /40 \+|idx % 3|deterministic/);
});

test('dashboard backend exposes secured analytics route and safe date filters', () => {
  const routes = backendSource('modules', 'dashboard', 'dashboard.routes.js');
  const service = backendSource('modules', 'dashboard', 'dashboard.service.js');
  const repository = backendSource('modules', 'dashboard', 'dashboard.repository.js');

  assert.match(routes, /'\/analytics'/);
  assert.match(routes, /PERMISSION_KEYS\.VIEW_DASHBOARD/);
  assert.match(service, /Unsupported dashboard date preset/);
  assert.match(service, /Custom dashboard range requires startDate and endDate/);
  assert.match(service, /Dates must use YYYY-MM-DD format/);
  assert.match(repository, /status IN \('SUCCESS', 'success'\)/);
  assert.match(repository, /date_trunc/);
  assert.match(repository, /GROUP BY/);
  assert.doesNotMatch(repository, /SELECT \*/);
});

test('dashboard analytics service combines repository metrics without inventing revenue', async () => {
  dashboardRepository.getUserAnalytics = async () => ({ total: 2, active: 1, deactivated: 1, deleted: 0, newInPeriod: 1 });
  dashboardRepository.getVendorAnalytics = async () => ({ total: 1, approved: 1, active: 1, pending: 0, rejected: 0, blocked: 0, newInPeriod: 1 });
  dashboardRepository.getPurchaseOrderAnalytics = async () => ({ total: 1, totalValue: 200, pending: 0, open: 1, closed: 0, completed: 0, cancelled: 0, newInPeriod: 1 });
  dashboardRepository.getInvoiceAnalytics = async () => ({ total: 1, totalValue: 200, approved: 1, rejected: 0, cancelled: 0, pending: 0, paid: 1, outstandingAmount: 0, overdueAmount: 0, statusDistribution: [{ name: 'Approved', value: 1 }] });
  dashboardRepository.getPaymentAnalytics = async () => ({ total: 3, success: 1, pending: 1, failed: 1, successfulAmount: 100, pendingAmount: 50, failedAmount: 75, recognizedRevenue: 100, statusDistribution: [{ name: 'Successful', value: 1 }] });
  dashboardRepository.getThreeWayMatchStats = async () => ({ total: 1, matched: 1, unmatched: 0, pending: 0, adminPending: 0 });
  dashboardRepository.getRevenueTrend = async () => [{ label: '2026-07-16', value: 100, count: 1 }];
  dashboardRepository.getVendorGrowthTrend = async () => [];
  dashboardRepository.getPurchaseOrderTrend = async () => [];
  dashboardRepository.getTopVendorsByRevenue = async () => [{ id: 'vendor_1', name: 'Vendor', vendorCode: 'V001', revenue: 100, paymentCount: 1 }];
  dashboardRepository.getRecentActivityInRange = async () => [];

  const result = await dashboardService.getAnalyticsDashboard({ preset: 'today', groupBy: 'day' });

  assert.equal(result.summary.revenue.recognized, 100);
  assert.equal(result.summary.revenue.pendingAmount, 50);
  assert.equal(result.summary.revenue.failedAmount, 75);
  assert.equal(result.summary.payments.recognizedRevenue, 100);
  assert.equal(result.topVendors[0].revenue, 100);
  assert.equal(result.trends.revenue[0].value, 100);
});
