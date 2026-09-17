import test from 'node:test';
import assert from 'node:assert/strict';
import userService from '../src/modules/users/user.service.js';
import userRepository from '../src/modules/users/user.repository.js';
import prisma from '../src/config/prisma.js';

// Save original methods
const originalFindById = userRepository.findById;
const originalFindByEmail = userRepository.findByEmail;
const originalUpdateUser = userRepository.updateUser;
const originalCount = prisma.user.count;
const originalAuditFindMany = prisma.auditLog.findMany;
const originalAuditCreate = prisma.auditLog.create;

const restoreAll = () => {
  userRepository.findById = originalFindById;
  userRepository.findByEmail = originalFindByEmail;
  userRepository.updateUser = originalUpdateUser;
  prisma.user.count = originalCount;
  prisma.auditLog.findMany = originalAuditFindMany;
  prisma.auditLog.create = originalAuditCreate;
};

test('UserService Details - getUserById returns profile with audit history and permissions', async () => {
  restoreAll();

  // Mock repository/Prisma calls
  userRepository.findById = async () => ({
    id: 'user_123',
    first_name: 'John',
    last_name: 'Doe',
    email: 'john@vms.com',
    role: 'CASE_MANAGER',
    status: 'ACTIVE',
  });

  prisma.auditLog.findMany = async () => [
    { id: 'log_1', action: 'user_created', remarks: 'Created', created_at: new Date() },
  ];

  const details = await userService.getUserById('user_123');

  assert.equal(details.id, 'user_123');
  assert.equal(details.role, 'CASE_MANAGER');
  
  // Excluded passwords/hashes
  assert.equal(details.password, undefined);
  assert.equal(details.passwordHash, undefined);

  // Mapped permissions and audit log presence
  assert.ok(Array.isArray(details.permissions));
  assert.equal(details.auditHistory.length, 1);
  assert.equal(details.auditHistory[0].action, 'user_created');

  restoreAll();
});

test('UserService Update - rejects duplicate email updates', async () => {
  restoreAll();

  userRepository.findById = async () => ({
    id: 'user_123',
    email: 'john@vms.com',
    role: 'CASE_MANAGER',
    status: 'ACTIVE',
  });

  // Mock existing email conflict finder
  userRepository.findByEmail = async () => ({
    id: 'user_999',
    email: 'conflict@vms.com',
  });

  const requester = { id: 'admin_id', role: 'SUPER_ADMIN', email: 'admin@vms.com' };

  await assert.rejects(
    async () => {
      await userService.updateUser('user_123', { email: 'conflict@vms.com' }, requester);
    },
    (err) => {
      assert.equal(err.statusCode, 409);
      assert.match(err.message, /already exists/);
      return true;
    }
  );

  restoreAll();
});

test('UserService Update - prevents demoting final active Super Admin role', async () => {
  restoreAll();

  userRepository.findById = async (id) => ({
    id: id || 'admin_2',
    role: 'SUPER_ADMIN',
    status: 'ACTIVE',
  });

  // Only 1 Super Admin in db
  prisma.user.count = async () => 1;

  const requester = { id: 'admin_1', role: 'SUPER_ADMIN', email: 'admin@vms.com' };

  await assert.rejects(
    async () => {
      await userService.updateUser('admin_2', { role: 'CASE_MANAGER' }, requester);
    },
    (err) => {
      assert.equal(err.statusCode, 400);
      assert.match(err.message, /Lockout prevention/);
      return true;
    }
  );

  restoreAll();
});
