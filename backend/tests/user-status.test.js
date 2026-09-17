import test from 'node:test';
import assert from 'node:assert/strict';
import prisma from '../src/config/prisma.js';
import userRepository from '../src/modules/users/user.repository.js';
import userService from '../src/modules/users/user.service.js';
import notificationService from '../src/modules/notifications/notification.service.js';
import { searchUsersSchema, updateUserStatusSchema } from '../src/zodSchema/index.js';

const originalFindMany = prisma.user.findMany;
const originalCount = prisma.user.count;
const originalFindById = userRepository.findById;
const originalUpdateUserStatus = userRepository.updateUserStatus;
const originalNotificationCreate = notificationService.createNotification;

const restoreAll = () => {
  prisma.user.findMany = originalFindMany;
  prisma.user.count = originalCount;
  userRepository.findById = originalFindById;
  userRepository.updateUserStatus = originalUpdateUserStatus;
  notificationService.createNotification = originalNotificationCreate;
};

const mockRepositoryQuery = ({ rows = [], countByStatus = {} } = {}) => {
  const calls = {
    findMany: [],
    count: [],
  };

  prisma.user.findMany = async (args) => {
    calls.findMany.push(args);
    return rows;
  };

  prisma.user.count = async (args = {}) => {
    calls.count.push(args);
    const status = args.where?.status;
    if (status && Object.prototype.hasOwnProperty.call(countByStatus, status)) {
      return countByStatus[status];
    }
    return rows.length;
  };

  return calls;
};

test('UserRepository status query returns only active accounts from database', async () => {
  restoreAll();
  const calls = mockRepositoryQuery({
    rows: [{ id: 'u1', status: 'ACTIVE' }],
    countByStatus: { ACTIVE: 3, INACTIVE: 2 },
  });

  const result = await userRepository.findAll({ status: 'ACTIVE', page: 1, limit: 10 });

  assert.equal(calls.findMany[0].where.status, 'ACTIVE');
  assert.equal(calls.findMany[0].where.deleted_at, null);
  assert.equal(calls.count[0].where.status, 'ACTIVE');
  assert.equal(result.users.length, 1);
  assert.equal(result.pagination.totalRecords, 3);
  assert.equal(result.summary.activeAccounts, 3);
  assert.equal(result.summary.deactivatedAccounts, 2);

  restoreAll();
});

test('UserRepository status query returns only deactivated accounts from database', async () => {
  restoreAll();
  const calls = mockRepositoryQuery({
    rows: [{ id: 'u2', status: 'INACTIVE' }],
    countByStatus: { ACTIVE: 4, INACTIVE: 7 },
  });

  const result = await userRepository.findAll({ status: 'INACTIVE', page: 1, limit: 10 });

  assert.equal(calls.findMany[0].where.status, 'INACTIVE');
  assert.equal(calls.findMany[0].where.deleted_at, null);
  assert.equal(calls.count[0].where.status, 'INACTIVE');
  assert.equal(result.users.length, 1);
  assert.equal(result.pagination.totalRecords, 7);
  assert.equal(result.summary.deactivatedAccounts, 7);

  restoreAll();
});

test('UserRepository summary counts come from database aggregates, not current page rows', async () => {
  restoreAll();
  mockRepositoryQuery({
    rows: [{ id: 'u1', status: 'ACTIVE' }],
    countByStatus: { ACTIVE: 42, INACTIVE: 9 },
  });

  const result = await userRepository.findAll({ page: 1, limit: 1 });

  assert.equal(result.users.length, 1);
  assert.equal(result.summary.activeAccounts, 42);
  assert.equal(result.summary.deactivatedAccounts, 9);
  assert.equal(result.summary.totalAccounts, 51);

  restoreAll();
});

test('UserRepository returns empty results without fake fallback data', async () => {
  restoreAll();
  mockRepositoryQuery({
    rows: [],
    countByStatus: { ACTIVE: 0, INACTIVE: 0 },
  });

  const result = await userRepository.findAll({ status: 'ACTIVE', page: 1, limit: 10 });

  assert.deepEqual(result.users, []);
  assert.equal(result.pagination.totalRecords, 0);
  assert.equal(result.summary.totalAccounts, 0);

  restoreAll();
});

test('UserRepository applies server-side pagination, sorting, search, and role filters', async () => {
  restoreAll();
  const calls = mockRepositoryQuery({
    rows: [],
    countByStatus: { ACTIVE: 0, INACTIVE: 0 },
  });

  await userRepository.findAll({
    search: 'finance',
    role: 'FINANCE_HEAD',
    status: 'ACTIVE',
    page: 3,
    limit: 5,
    sortField: 'email',
    sortOrder: 'asc',
  });

  const query = calls.findMany[0];
  assert.equal(query.skip, 10);
  assert.equal(query.take, 5);
  assert.deepEqual(query.orderBy, { email: 'asc' });
  assert.equal(query.where.role, 'FINANCE_HEAD');
  assert.equal(query.where.status, 'ACTIVE');
  assert.equal(query.where.OR.length, 8);
  assert.equal(query.where.OR[0].employee_id.contains, 'finance');
  assert.equal(query.where.OR[3].email.contains, 'finance');

  restoreAll();
});

test('User status validation accepts only Active and Deactivated filter values', () => {
  assert.equal(searchUsersSchema.safeParse({ query: { status: 'ACTIVE' } }).success, true);
  assert.equal(searchUsersSchema.safeParse({ query: { status: 'INACTIVE' } }).success, true);
  assert.equal(searchUsersSchema.safeParse({ query: { status: 'SUSPENDED' } }).success, false);
  assert.equal(searchUsersSchema.safeParse({ query: { status: 'DISABLED' } }).success, false);
});

test('User status update validation rejects unsupported transitions', () => {
  assert.equal(updateUserStatusSchema.safeParse({
    params: { id: '11111111-1111-4111-8111-111111111111' },
    body: { status: 'ACTIVE' },
  }).success, true);

  assert.equal(updateUserStatusSchema.safeParse({
    params: { id: '11111111-1111-4111-8111-111111111111' },
    body: { status: 'INACTIVE' },
  }).success, true);

  assert.equal(updateUserStatusSchema.safeParse({
    params: { id: '11111111-1111-4111-8111-111111111111' },
    body: { status: 'SUSPENDED' },
  }).success, false);
});

test('UserService status transition deactivates an active account using verified project status', async () => {
  restoreAll();
  userRepository.findById = async () => ({
    id: 'user_1',
    role: 'CASE_MANAGER',
    email: 'case@vms.com',
    status: 'ACTIVE',
    deleted_at: null,
  });
  userRepository.updateUserStatus = async (_id, statusData) => ({
    id: 'user_1',
    email: 'case@vms.com',
    role: 'CASE_MANAGER',
    status: statusData.status,
    deleted_at: null,
  });
  notificationService.createNotification = async () => ({});

  const updated = await userService.updateUserStatus(
    'user_1',
    'INACTIVE',
    { id: 'admin_1', role: 'SUPER_ADMIN', email: 'admin@vms.com' },
  );

  assert.equal(updated.status, 'INACTIVE');

  restoreAll();
});

test('UserService status transition activates a deactivated account', async () => {
  restoreAll();
  userRepository.findById = async () => ({
    id: 'user_2',
    role: 'CASE_MANAGER',
    email: 'case2@vms.com',
    status: 'INACTIVE',
    deleted_at: null,
  });
  userRepository.updateUserStatus = async (_id, statusData) => ({
    id: 'user_2',
    email: 'case2@vms.com',
    role: 'CASE_MANAGER',
    status: statusData.status,
    deleted_at: null,
  });
  notificationService.createNotification = async () => ({});

  const updated = await userService.updateUserStatus(
    'user_2',
    'ACTIVE',
    { id: 'admin_1', role: 'SUPER_ADMIN', email: 'admin@vms.com' },
  );

  assert.equal(updated.status, 'ACTIVE');

  restoreAll();
});
