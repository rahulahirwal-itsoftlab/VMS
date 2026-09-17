import test from 'node:test';
import assert from 'node:assert/strict';
import lookupController from '../src/modules/lookups/lookup.controller.js';
import prisma from '../src/config/prisma.js';

// Save original methods
const originalVendorFindMany = prisma.vendor.findMany;
const originalUserFindMany = prisma.user.findMany;

const restoreAll = () => {
  prisma.vendor.findMany = originalVendorFindMany;
  prisma.user.findMany = originalUserFindMany;
};

// Setup mock request, response
const mockRes = () => {
  const res = {};
  res.status = (code) => {
    res.statusCode = code;
    return res;
  };
  res.json = (data) => {
    res.body = data;
    return res;
  };
  return res;
};

test('LookupController - getRoles returns system roles', async () => {
  restoreAll();
  const req = {};
  const res = mockRes();

  let nextCalled = false;
  const next = () => { nextCalled = true; };

  await lookupController.getRoles(req, res, next);

  assert.equal(res.statusCode, 200);
  assert.ok(res.body.success);
  assert.ok(res.body.data.length > 0);
  
  const roles = res.body.data.map(r => r.value);
  assert.ok(roles.includes('SUPER_ADMIN'));
  assert.ok(roles.includes('CASE_MANAGER'));
});

test('LookupController - getVendors returns database-mapped active vendors', async () => {
  restoreAll();

  // Mock Prisma vendor findMany
  prisma.vendor.findMany = async () => [
    { id: 'v1', name: 'ACRE Corp', vendor_code: 'VND001' },
    { id: 'v2', name: 'Global Industries', vendor_code: 'VND002' },
  ];

  const req = { query: {} };
  const res = mockRes();

  await lookupController.getVendors(req, res, () => {});

  assert.equal(res.statusCode, 200);
  assert.ok(res.body.success);
  assert.equal(res.body.data.length, 2);
  assert.equal(res.body.data[0].name, 'ACRE Corp (VND001)');
  assert.equal(res.body.data[0].value, 'v1');

  restoreAll();
});

test('LookupController - getManagers returns database-mapped manager users', async () => {
  restoreAll();

  // Mock Prisma user findMany
  prisma.user.findMany = async () => [
    { id: 'u1', employee_id: 'EMP000001', first_name: 'John', last_name: 'Doe', email: 'john@vms.com', role: 'MANAGER', status: 'ACTIVE' },
    { id: 'u2', employee_id: 'EMP000002', first_name: 'Finance', last_name: 'Lead', email: 'fin@vms.com', role: 'FINANCE_HEAD', status: 'ACTIVE' },
  ];

  const req = { query: {} };
  const res = mockRes();

  await lookupController.getManagers(req, res, () => {});

  assert.equal(res.statusCode, 200);
  assert.ok(res.body.success);
  assert.equal(res.body.data.length, 2);
  assert.equal(res.body.data[0].name, 'John Doe (MANAGER)');
  assert.equal(res.body.data[1].name, 'Finance Lead (FINANCE_HEAD)');
  assert.equal(res.body.data[0].employeeId, 'EMP000001');

  restoreAll();
});

test('LookupController - getManagers uses generic active manager role query', async () => {
  restoreAll();

  let capturedArgs;
  prisma.user.findMany = async (args) => {
    capturedArgs = args;
    return [
      {
        id: 'lead_1',
        first_name: 'Team',
        last_name: 'Lead',
        email: 'lead@vms.com',
        role: 'TEAM_LEAD',
        status: 'ACTIVE',
      },
    ];
  };

  const req = {
    query: { search: 'lead' },
    user: { id: 'admin_1', role: 'SUPER_ADMIN' },
  };
  const res = mockRes();

  await lookupController.getManagers(req, res, () => {});

  assert.equal(res.statusCode, 200);
  assert.deepEqual(capturedArgs.where.role.in, ['MANAGER', 'FINANCE_HEAD']);
  assert.equal(capturedArgs.where.status, 'ACTIVE');
  assert.equal(capturedArgs.where.deleted_at, null);
  assert.equal(capturedArgs.where.id, undefined);
  assert.equal(res.body.data[0].value, 'lead_1');

  restoreAll();
});
