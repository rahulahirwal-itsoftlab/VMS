import test from 'node:test';
import assert from 'node:assert/strict';
import userService from '../src/modules/users/user.service.js';
import userRepository from '../src/modules/users/user.repository.js';
import prisma from '../src/config/prisma.js';

// Save original methods
const originalCount = prisma.user.count;
const originalAuditCreate = prisma.auditLog.create;
const originalTransaction = prisma.$transaction;
const originalFindById = userRepository.findById;
const originalFindByEmail = userRepository.findByEmail;
const originalCreateUser = userRepository.createUser;
const originalUpdateUser = userRepository.updateUser;
const originalSoftDeleteUser = userRepository.softDeleteUser;
const originalUpdateUserStatus = userRepository.updateUserStatus;

const restoreAll = () => {
  prisma.user.count = originalCount;
  prisma.auditLog.create = originalAuditCreate;
  prisma.$transaction = originalTransaction;
  userRepository.findById = originalFindById;
  userRepository.findByEmail = originalFindByEmail;
  userRepository.createUser = originalCreateUser;
  userRepository.updateUser = originalUpdateUser;
  userRepository.softDeleteUser = originalSoftDeleteUser;
  userRepository.updateUserStatus = originalUpdateUserStatus;
};

const buildDeleteTransaction = ({ failAudit = false } = {}) => {
  const calls = {
    softDeleted: null,
    auditCreated: false,
  };

  prisma.$transaction = async (callback) => {
    const tx = {
      user: {
        findFirst: async () => ({
          id: 'target_user',
          email: 'target@vms.com',
          role: 'CASE_MANAGER',
          status: 'ACTIVE',
          deleted_at: null,
        }),
        findUnique: async () => ({
          id: 'target_user',
          email: 'target@vms.com',
          role: 'CASE_MANAGER',
          status: 'ACTIVE',
          deleted_at: null,
        }),
        update: async ({ data }) => {
          calls.softDeleted = data;
          return {
            id: 'target_user',
            email: data.email,
            role: 'CASE_MANAGER',
            status: data.status,
            deleted_at: data.deleted_at,
            deleted_by_id: data.deleted_by_id,
            refresh_token: data.refresh_token,
          };
        },
      },
      auditLog: {
        create: async () => {
          if (failAudit) {
            throw new Error('audit failed');
          }
          calls.auditCreated = true;
          return {};
        },
      },
    };
    return callback(tx);
  };

  return calls;
};

test('UserService Authorization - non-Super Admin cannot create SUPER_ADMIN accounts', async () => {
  restoreAll();
  
  const requester = { id: 'user_1', role: 'FINANCE_HEAD', email: 'finance@vms.com' };
  const targetData = {
    email: 'newadmin@vms.com',
    password: 'Password@123',
    firstName: 'New',
    lastName: 'Admin',
    role: 'SUPER_ADMIN',
  };

  await assert.rejects(
    async () => {
      await userService.createUser(targetData, requester);
    },
    (err) => {
      assert.equal(err.statusCode, 403);
      assert.match(err.message, /Forbidden: You do not have privilege to/);
      return true;
    }
  );
});

test('UserService Authorization - requester cannot assign a role higher or equal to their own', async () => {
  restoreAll();

  const requester = { id: 'user_1', role: 'MANAGER', email: 'manager@vms.com' };
  const targetData = {
    email: 'newmanager@vms.com',
    password: 'Password@123',
    firstName: 'New',
    lastName: 'Manager',
    role: 'MANAGER', // Equal to requester (forbidden)
  };

  await assert.rejects(
    async () => {
      await userService.createUser(targetData, requester);
    },
    (err) => {
      assert.equal(err.statusCode, 403);
      assert.match(err.message, /Forbidden: You do not have privilege to/);
      return true;
    }
  );
});

test('UserService Authorization - Super Admin can create any target role', async () => {
  restoreAll();

  // Mock transaction block execution to bypass database connections
  prisma.$transaction = async (callback) => {
    const mockTx = {
      user: {
        findFirst: async () => null,
        create: async (args) => ({ id: 'new_id_123', ...args.data }),
      },
      auditLog: {
        create: async () => ({}),
      },
    };
    return await callback(mockTx);
  };

  const requester = { id: 'admin_id', role: 'SUPER_ADMIN', email: 'admin@vms.com' };
  const targetData = {
    email: 'manager@vms.com',
    password: 'Password@123',
    firstName: 'New',
    lastName: 'Manager',
    role: 'MANAGER',
  };

  const created = await userService.createUser(targetData, requester);
  assert.equal(created.role, 'MANAGER');
  assert.equal(created.email, 'manager@vms.com');

  restoreAll();
});

test('UserService Lockout Prevention - blocks status deactivation of final active Super Admin', async () => {
  restoreAll();

  // Mock repository/database calls
  userRepository.findById = async (id) => ({
    id: id || 'admin_id_2',
    role: 'SUPER_ADMIN',
    status: 'ACTIVE',
  });
  
  // Only 1 active Super Admin remains in database
  prisma.user.count = async () => 1;

  const requester = { id: 'admin_id_1', role: 'SUPER_ADMIN', email: 'admin@vms.com' };

  await assert.rejects(
    async () => {
      await userService.updateUserStatus('admin_id_2', 'INACTIVE', requester);
    },
    (err) => {
      assert.equal(err.statusCode, 400);
      assert.match(err.message, /Lockout prevention: Cannot deactivate, delete, or demote the final active Super Admin account/);
      return true;
    }
  );

  restoreAll();
});

test('UserService Lockout Prevention - blocks deletion of final active Super Admin', async () => {
  restoreAll();

  // Mock repository/database calls
  userRepository.findById = async (id) => ({
    id: id || 'admin_id_2',
    role: 'SUPER_ADMIN',
    status: 'ACTIVE',
  });
  
  // Only 1 active Super Admin remains in database
  prisma.user.count = async () => 1;

  const requester = { id: 'admin_id_1', role: 'SUPER_ADMIN', email: 'admin@vms.com' };

  await assert.rejects(
    async () => {
      await userService.deleteUser('admin_id_2', requester);
    },
    (err) => {
      assert.equal(err.statusCode, 409);
      assert.match(err.message, /Lockout prevention: Cannot deactivate, delete, or demote the final active Super Admin account/);
      return true;
    }
  );

  restoreAll();
});

test('UserService Delete - Super Admin deletes an allowed user with soft-delete fields, session revocation, and audit', async () => {
  restoreAll();

  userRepository.findById = async () => ({
    id: 'target_user',
    email: 'target@vms.com',
    role: 'CASE_MANAGER',
    status: 'ACTIVE',
    deleted_at: null,
    refresh_token: 'refresh-token',
  });
  const calls = buildDeleteTransaction();

  const result = await userService.deleteUser(
    'target_user',
    { id: 'admin_user', role: 'SUPER_ADMIN', email: 'admin@vms.com' },
  );

  assert.equal(result.message, 'User deleted successfully.');
  assert.equal(result.user.status, 'INACTIVE');
  assert.ok(result.user.deleted_at instanceof Date);
  assert.equal(result.user.deleted_by_id, 'admin_user');
  assert.equal(result.user.refresh_token, undefined);
  assert.equal(calls.softDeleted.status, 'INACTIVE');
  assert.equal(calls.softDeleted.deleted_by_id, 'admin_user');
  assert.equal(calls.softDeleted.refresh_token, null);
  assert.equal(calls.auditCreated, true);

  restoreAll();
});

test('UserService Delete - Finance Head deletes an allowed lower-level user', async () => {
  restoreAll();

  userRepository.findById = async () => ({
    id: 'target_user',
    email: 'manager@vms.com',
    role: 'MANAGER',
    status: 'ACTIVE',
    deleted_at: null,
  });
  buildDeleteTransaction();

  const result = await userService.deleteUser(
    'target_user',
    { id: 'finance_user', role: 'FINANCE_HEAD', email: 'finance@vms.com' },
  );

  assert.equal(result.user.status, 'INACTIVE');
  assert.equal(result.user.deleted_by_id, 'finance_user');

  restoreAll();
});

test('UserService Delete - Finance Head cannot delete Super Admin or another Finance Head', async () => {
  restoreAll();

  const requester = { id: 'finance_user', role: 'FINANCE_HEAD', email: 'finance@vms.com' };

  userRepository.findById = async () => ({
    id: 'admin_user',
    email: 'admin@vms.com',
    role: 'SUPER_ADMIN',
    status: 'ACTIVE',
    deleted_at: null,
  });
  await assert.rejects(() => userService.deleteUser('admin_user', requester), { statusCode: 403 });

  userRepository.findById = async () => ({
    id: 'finance_target',
    email: 'finance2@vms.com',
    role: 'FINANCE_HEAD',
    status: 'ACTIVE',
    deleted_at: null,
  });
  await assert.rejects(() => userService.deleteUser('finance_target', requester), { statusCode: 403 });

  restoreAll();
});

test('UserService Delete - unauthorized lower role cannot delete users', async () => {
  restoreAll();

  userRepository.findById = async () => ({
    id: 'target_user',
    email: 'case@vms.com',
    role: 'CASE_MANAGER',
    status: 'ACTIVE',
    deleted_at: null,
  });

  await assert.rejects(
    () => userService.deleteUser(
      'target_user',
      { id: 'manager_user', role: 'MANAGER', email: 'manager@vms.com' },
    ),
    { statusCode: 403 },
  );

  restoreAll();
});

test('UserService Delete - returns 404 when target user does not exist', async () => {
  restoreAll();

  userRepository.findById = async () => null;

  await assert.rejects(
    () => userService.deleteUser(
      'missing_user',
      { id: 'admin_user', role: 'SUPER_ADMIN', email: 'admin@vms.com' },
    ),
    { statusCode: 404 },
  );

  restoreAll();
});

test('UserService Delete - rolls back when audit creation fails', async () => {
  restoreAll();

  userRepository.findById = async () => ({
    id: 'target_user',
    email: 'target@vms.com',
    role: 'CASE_MANAGER',
    status: 'ACTIVE',
    deleted_at: null,
  });
  const calls = buildDeleteTransaction({ failAudit: true });

  await assert.rejects(
    () => userService.deleteUser(
      'target_user',
      { id: 'admin_user', role: 'SUPER_ADMIN', email: 'admin@vms.com' },
    ),
    /audit failed/,
  );

  assert.ok(calls.softDeleted);
  assert.equal(calls.auditCreated, false);

  restoreAll();
});

test('UserService Self-Modification - blocks self role changes', async () => {
  restoreAll();

  userRepository.findById = async () => ({
    id: 'user_self',
    role: 'SUPER_ADMIN',
    email: 'admin@vms.com',
  });

  const requester = { id: 'user_self', role: 'SUPER_ADMIN', email: 'admin@vms.com' };
  const updateData = { role: 'TEAM_LEAD' };

  await assert.rejects(
    async () => {
      await userService.updateUser('user_self', updateData, requester);
    },
    (err) => {
      assert.equal(err.statusCode, 400);
      assert.match(err.message, /You cannot change your own role/);
      return true;
    }
  );

  restoreAll();
});

test('UserService Self-Modification - blocks self deactivation', async () => {
  restoreAll();

  userRepository.findById = async () => ({
    id: 'user_self',
    role: 'SUPER_ADMIN',
    email: 'admin@vms.com',
    status: 'ACTIVE',
  });

  const requester = { id: 'user_self', role: 'SUPER_ADMIN', email: 'admin@vms.com' };

  await assert.rejects(
    async () => {
      await userService.updateUserStatus('user_self', 'INACTIVE', requester);
    },
    (err) => {
      assert.equal(err.statusCode, 400);
      assert.match(err.message, /Self-deactivation is forbidden/);
      return true;
    }
  );

  restoreAll();
});

test('UserService Self-Modification - blocks self deletion', async () => {
  restoreAll();

  userRepository.findById = async () => ({
    id: 'user_self',
    role: 'SUPER_ADMIN',
    email: 'admin@vms.com',
  });

  const requester = { id: 'user_self', role: 'SUPER_ADMIN', email: 'admin@vms.com' };

  await assert.rejects(
    async () => {
      await userService.deleteUser('user_self', requester);
    },
    (err) => {
      assert.equal(err.statusCode, 409);
      assert.match(err.message, /Self-deletion is forbidden/);
      return true;
    }
  );

  restoreAll();
});

test('UserService Restoration - restores deleted user successfully', async () => {
  restoreAll();

  const mockUser = {
    id: 'deleted_user_123',
    email: 'test@example.com_deleted_1720000000000',
    role: 'CASE_MANAGER',
    deleted_at: new Date(),
    status: 'INACTIVE',
  };

  userRepository.findAnyById = async () => mockUser;
  userRepository.findByEmail = async () => null; // Original email 'test@example.com' is free
  userRepository.restoreUser = async (id, email) => ({
    ...mockUser,
    email,
    deleted_at: null,
    status: 'ACTIVE',
  });

  prisma.auditLog.create = async () => ({});

  const requester = { id: 'admin_id', role: 'SUPER_ADMIN', email: 'admin@vms.com' };
  const restored = await userService.restoreUser('deleted_user_123', requester);

  assert.equal(restored.status, 'ACTIVE');
  assert.equal(restored.email, 'test@example.com');
  assert.equal(restored.deleted_at, null);

  restoreAll();
});

test('UserService Restoration - rejects if email is already taken by an active account', async () => {
  restoreAll();

  const mockUser = {
    id: 'deleted_user_123',
    email: 'test@example.com_deleted_1720000000000',
    role: 'CASE_MANAGER',
    deleted_at: new Date(),
    status: 'INACTIVE',
  };

  userRepository.findAnyById = async () => mockUser;
  userRepository.findByEmail = async () => ({ id: 'another_user', email: 'test@example.com' }); // Already taken!

  const requester = { id: 'admin_id', role: 'SUPER_ADMIN', email: 'admin@vms.com' };

  await assert.rejects(
    async () => {
      await userService.restoreUser('deleted_user_123', requester);
    },
    (err) => {
      assert.equal(err.statusCode, 409);
      assert.match(err.message, /The email address is already in use by another active account/);
      return true;
    }
  );

  restoreAll();
});
