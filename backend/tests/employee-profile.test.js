import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import prisma from '../src/config/prisma.js';
import userRepository from '../src/modules/users/user.repository.js';
import userService from '../src/modules/users/user.service.js';
import { createUserSchema, updateUserSchema } from '../src/zodSchema/index.js';

const migrationPath = path.resolve(
  'prisma',
  'migrations',
  '20260715001000_add_employee_id_and_user_profile_fields',
  'migration.sql',
);

const originalTransaction = prisma.$transaction;
const originalAuditCreate = prisma.auditLog.create;
const originalFindById = userRepository.findById;
const originalFindByEmail = userRepository.findByEmail;
const originalUpdateUser = userRepository.updateUser;

const restoreAll = () => {
  prisma.$transaction = originalTransaction;
  prisma.auditLog.create = originalAuditCreate;
  userRepository.findById = originalFindById;
  userRepository.findByEmail = originalFindByEmail;
  userRepository.updateUser = originalUpdateUser;
};

test('Employee ID migration uses a database sequence and unique index', () => {
  const migration = fs.readFileSync(migrationPath, 'utf8');

  assert.match(migration, /CREATE SEQUENCE IF NOT EXISTS employee_id_seq/);
  assert.match(migration, /nextval\('employee_id_seq'\)/);
  assert.match(migration, /CREATE UNIQUE INDEX IF NOT EXISTS users_employee_id_key/);
  assert.doesNotMatch(migration, /count\s*\(\s*\*\s*\)\s*\+\s*1/i);
});

test('Employee ID migration backfills existing users deterministically and advances sequence', () => {
  const migration = fs.readFileSync(migrationPath, 'utf8');

  assert.match(migration, /row_number\(\) OVER \(ORDER BY created_at ASC, id ASC\)/);
  assert.match(migration, /WHERE employee_id IS NULL OR employee_id = ''/);
  assert.match(migration, /SELECT setval/);
});

test('Create user returns database-generated employee ID and normalized profile fields', async () => {
  restoreAll();
  prisma.$transaction = async (callback) => {
    const tx = {
      user: {
        findFirst: async () => null,
        create: async (args) => ({
          id: 'user_1',
          employee_id: 'EMP000001',
          ...args.data,
        }),
      },
      auditLog: {
        create: async () => ({}),
      },
    };
    return callback(tx);
  };

  const created = await userService.createUser(
    {
      email: 'case@vms.com',
      password: 'Password@123',
      firstName: 'Case',
      lastName: 'Manager',
      role: 'CASE_MANAGER',
      phone: '9876543210',
      alternatePhone: '9876543211',
      designation: 'Case Analyst',
      branch: 'Mumbai',
      region: 'West',
    },
    { id: 'admin_1', role: 'SUPER_ADMIN', email: 'admin@vms.com' },
  );

  assert.equal(created.employee_id, 'EMP000001');
  assert.equal(created.phone, '9876543210');
  assert.equal(created.alternate_phone, '9876543211');
  assert.equal(created.designation, 'Case Analyst');
  assert.equal(created.branch, 'Mumbai');
  assert.equal(created.region, 'West');

  restoreAll();
});

test('User validation accepts 10-digit phones and rejects invalid profile fields', () => {
  const valid = createUserSchema.safeParse({
    body: {
      email: 'valid@vms.com',
      password: 'Password@123',
      confirmPassword: 'Password@123',
      firstName: 'Valid',
      lastName: 'User',
      role: 'CASE_MANAGER',
      phone: '9876543210',
      alternatePhone: '9876543211',
      designation: 'A'.repeat(100),
      branch: 'Mumbai',
      region: 'West',
    },
  });
  assert.equal(valid.success, true);

  assert.equal(createUserSchema.safeParse({
    body: {
      email: 'bad@vms.com',
      password: 'Password@123',
      firstName: 'Bad',
      lastName: 'Phone',
      role: 'CASE_MANAGER',
      phone: '123',
    },
  }).success, false);

  assert.equal(createUserSchema.safeParse({
    body: {
      email: 'same@vms.com',
      password: 'Password@123',
      firstName: 'Same',
      lastName: 'Phone',
      role: 'CASE_MANAGER',
      phone: '9876543210',
      alternatePhone: '9876543210',
    },
  }).success, false);

  assert.equal(updateUserSchema.safeParse({
    params: { id: '11111111-1111-4111-8111-111111111111' },
    body: { branch: 'B'.repeat(101) },
  }).success, false);
});

test('Update user maps profile fields and rejects alternate phone matching existing phone', async () => {
  restoreAll();
  userRepository.findById = async () => ({
    id: 'user_1',
    email: 'user@vms.com',
    role: 'CASE_MANAGER',
    status: 'ACTIVE',
    phone: '9876543210',
    alternate_phone: null,
  });

  await assert.rejects(
    userService.updateUser(
      'user_1',
      { alternatePhone: '9876543210' },
      { id: 'admin_1', role: 'SUPER_ADMIN', email: 'admin@vms.com' },
    ),
    /Alternate phone must be different from phone/,
  );

  let updateData;
  userRepository.updateUser = async (_id, data) => {
    updateData = data;
    return {
      id: 'user_1',
      email: 'user@vms.com',
      role: 'CASE_MANAGER',
      status: 'ACTIVE',
      ...data,
    };
  };
  prisma.auditLog.create = async () => ({});

  const updated = await userService.updateUser(
    'user_1',
    {
      phone: '9876543212',
      alternatePhone: '',
      designation: 'Senior Analyst',
      branch: 'Delhi',
      region: 'North',
    },
    { id: 'admin_1', role: 'SUPER_ADMIN', email: 'admin@vms.com' },
  );

  assert.equal(updateData.phone, '9876543212');
  assert.equal(updateData.alternate_phone, null);
  assert.equal(updated.designation, 'Senior Analyst');
  assert.equal(updated.branch, 'Delhi');
  assert.equal(updated.region, 'North');

  restoreAll();
});

test('Frontend user screens map and display employee/profile fields', () => {
  const userServiceSource = fs.readFileSync(path.resolve('..', 'frontend', 'src', 'services', 'userService.js'), 'utf8');
  const createSource = fs.readFileSync(path.resolve('..', 'frontend', 'src', 'pages', 'Users', 'UserCreate.jsx'), 'utf8');
  const listSource = fs.readFileSync(path.resolve('..', 'frontend', 'src', 'pages', 'Users', 'UsersList.jsx'), 'utf8');

  assert.match(userServiceSource, /employeeId: user\.employee_id/);
  assert.match(userServiceSource, /phone: user\.phone/);
  assert.match(createSource, /phone: formData\.phone\.trim\(\)/);
  assert.match(createSource, /getBranchesLookup/);
  assert.match(listSource, /Employee ID/);
  assert.match(listSource, /selectedUser\.employeeId/);
  assert.match(listSource, /designation: editForm\.designation\.trim\(\)/);
});
