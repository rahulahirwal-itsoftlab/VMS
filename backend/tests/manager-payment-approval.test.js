import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = (...parts) => fs.readFileSync(path.join(root, ...parts), 'utf8');
const backend = (...parts) => read('backend', ...parts);
const frontend = (...parts) => read('frontend', ...parts);

test('manager has payment approval permissions without create permissions', () => {
  const permissions = backend('src', 'modules', 'auth', 'role-permissions.js');
  const managerBlock = permissions.match(/\[ROLES\.MANAGER\]: \[([\s\S]*?)\],/)?.[1] || '';

  assert.match(managerBlock, /VIEW_PAYMENTS/);
  assert.match(managerBlock, /EXECUTE_PAYMENT/);
  assert.doesNotMatch(managerBlock, /CREATE_PAYMENT_REQUEST/);
  assert.doesNotMatch(managerBlock, /MANAGE_VENDORS/);
  assert.doesNotMatch(managerBlock, /MANAGE_PURCHASE_ORDERS/);
  assert.doesNotMatch(managerBlock, /MANAGE_INVOICES/);
});

test('payment service routes approval by dynamic amount thresholds and supports manager actions', () => {
  const service = backend('src', 'modules', 'payments', 'payment.service.js');
  const routes = backend('src', 'modules', 'payments', 'payment.routes.js');
  const controller = backend('src', 'modules', 'payments', 'payment.controller.js');
  const notification = backend('src', 'modules', 'notifications', 'notification.service.js');

  assert.match(service, /TEAM_LEAD_PAYMENT_APPROVAL_MAX/);
  assert.match(service, /FINANCE_HEAD_PAYMENT_APPROVAL_THRESHOLD/);
  assert.match(service, /getRequiredPaymentApprovalRole/);
  assert.match(service, /ROLES\.MANAGER/);
  assert.match(service, /assertPaymentAssignedToRole/);
  assert.match(service, /assertRemarks\(remarks, 'approve'\)/);
  assert.match(service, /Remarks are required to \$\{action\}/);
  assert.match(service, /returnPaymentForCorrection/);
  assert.match(service, /PAYMENT_STATUS\.RETURNED/);
  assert.match(routes, /\/:id\/return/);
  assert.match(controller, /returnPayment/);
  assert.match(notification, /payment\.required_approval_role/);
  assert.match(notification, /requires \$\{roleLabel\} approval/);
});

test('manager dashboard and sidebar use live manager approval data', () => {
  const dashboardRepository = backend('src', 'modules', 'dashboard', 'dashboard.repository.js');
  const dashboardService = backend('src', 'modules', 'dashboard', 'dashboard.service.js');
  const managerDashboard = frontend('src', 'components', 'dashboard', 'roleDashboards', 'ManagerDashboard.jsx');
  const dashboardPage = frontend('src', 'pages', 'Dashboard', 'Dashboard.jsx');
  const navigation = frontend('src', 'constants', 'navigation.js');
  const paymentList = frontend('src', 'pages', 'Payments', 'PaymentsList.jsx');
  const paymentService = frontend('src', 'services', 'paymentService.js');

  assert.match(dashboardRepository, /getManagerDashboard/);
  assert.match(dashboardRepository, /managerPaymentApprovalWhere/);
  assert.match(dashboardRepository, /prisma\.payment\.findMany/);
  assert.match(dashboardService, /user\.role === 'MANAGER'/);
  assert.match(managerDashboard, /getMyDashboard/);
  assert.match(managerDashboard, /Pending Payment Approvals/);
  assert.match(managerDashboard, /Approval History/);
  assert.match(managerDashboard, /Notifications/);
  assert.match(dashboardPage, /ManagerDashboard/);

  assert.match(navigation, /Payment Approvals/);
  assert.match(navigation, /excludedRoles: \[ROLES\.FINANCE_HEAD, ROLES\.MANAGER\]/);
  assert.match(paymentList, /getPendingPayments/);
  assert.match(paymentList, /returnPayment/);
  assert.match(paymentService, /requiredApprovalRole/);
  assert.match(paymentService, /vendorCode/);
});
