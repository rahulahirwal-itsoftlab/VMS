import test from 'node:test';
import assert from 'node:assert/strict';
import { UserEntity } from '../src/zodSchema/index.js';
import {
  INVOICE_STATUS,
  getCurrentApprovalLevel,
  getNextApprovalStatus,
  getRequiredInvoiceApprovalRole,
  getPendingQueueStatuses,
} from '../src/utils/approval-helper.js';

test('UserEntity exposes Prisma-compatible password reset columns', () => {
  assert.equal(UserEntity.columns.PASSWORD_RESET_OTP, 'password_reset_otp');
  assert.equal(UserEntity.columns.PASSWORD_RESET_OTP_EXPIRES, 'password_reset_otp_expires');
  assert.ok(Object.values(UserEntity.columns).includes('password_reset_otp'));
  assert.ok(Object.values(UserEntity.columns).includes('password_reset_otp_expires'));
});

test('invoice approval helper exposes the role-based workflow states', () => {
  assert.equal(getCurrentApprovalLevel(INVOICE_STATUS.PENDING_TEAM_LEAD), 'TEAM_LEAD');
  assert.equal(getCurrentApprovalLevel(INVOICE_STATUS.PENDING_MANAGER), 'MANAGER');
  assert.equal(getCurrentApprovalLevel(INVOICE_STATUS.PENDING_FINANCE_HEAD), 'FINANCE_HEAD');
});

test('invoice approval routing follows the amount-based workflow', () => {
  assert.equal(getRequiredInvoiceApprovalRole(8000), 'TEAM_LEAD');
  assert.equal(getRequiredInvoiceApprovalRole(50000), 'MANAGER');
  assert.equal(getRequiredInvoiceApprovalRole(250000), 'FINANCE_HEAD');
  assert.equal(getNextApprovalStatus(8000, INVOICE_STATUS.PENDING_TEAM_LEAD), INVOICE_STATUS.APPROVED);
  assert.equal(getNextApprovalStatus(50000, INVOICE_STATUS.PENDING_MANAGER), INVOICE_STATUS.APPROVED);
  assert.equal(getNextApprovalStatus(250000, INVOICE_STATUS.PENDING_FINANCE_HEAD), INVOICE_STATUS.APPROVED);
});

test('pending approval queues include the role-specific statuses used by approvers', () => {
  assert.deepEqual(getPendingQueueStatuses('TEAM_LEAD'), [INVOICE_STATUS.PENDING_TEAM_LEAD, 'PENDING_L1', 'PENDING', 'pending']);
  assert.deepEqual(getPendingQueueStatuses('MANAGER'), [INVOICE_STATUS.PENDING_MANAGER, 'PENDING_L2']);
  assert.deepEqual(getPendingQueueStatuses('FINANCE_HEAD'), [INVOICE_STATUS.PENDING_FINANCE_HEAD, 'PENDING_L3']);
});
