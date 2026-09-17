import test from 'node:test';
import assert from 'node:assert/strict';
import { z } from 'zod';
import validate from '../src/middleware/validate.middleware.js';
import { searchVendorsSchema } from '../src/modules/vendors/vendor.validation.js';

// Setup mock request, response, and next
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

test('validate middleware - passes validation successfully', () => {
  const testSchema = z.object({
    body: z.object({
      email: z.string().email(),
    }),
  });

  const req = {
    body: { email: 'test@example.com' },
    query: {},
    params: {},
    headers: {},
  };

  let nextCalled = false;
  let nextError = null;
  const next = (err) => {
    nextCalled = true;
    nextError = err;
  };

  validate(testSchema)(req, mockRes(), next);

  assert.ok(nextCalled);
  assert.equal(nextError, undefined);
  assert.equal(req.body.email, 'test@example.com');
});

test('validate middleware - groups multiple validation errors and removes standard prefixes', () => {
  const passwordSchema = z
    .string()
    .min(8, 'Password must be at least 8 characters')
    .regex(/[A-Z]/, 'Password must contain at least one uppercase letter')
    .regex(/[^A-Za-z0-9]/, 'Password must contain at least one special character');

  const testSchema = z.object({
    body: z.object({
      email: z.string().email('Invalid email address'),
      password: passwordSchema,
      firstName: z.string().min(1, 'First name is required'),
    }),
  });

  // Invalid payload: invalid email, simple password, empty first name (triggers min length)
  const req = {
    body: {
      email: 'invalid-email',
      password: 'meekha123',
      firstName: '',
    },
    query: {},
    params: {},
    headers: {},
  };

  let nextCalled = false;
  let nextError = null;
  const next = (err) => {
    nextCalled = true;
    nextError = err;
  };

  validate(testSchema)(req, mockRes(), next);

  assert.ok(nextCalled);
  assert.ok(nextError);
  assert.equal(nextError.statusCode, 400);
  assert.equal(nextError.code, 'VALIDATION_ERROR');

  const errors = nextError.errors;

  // Confirm standard prefix removal ("body.password" -> "password")
  assert.ok(errors.email);
  assert.ok(errors.password);
  assert.ok(errors.firstName);

  // Assert messages list
  assert.deepEqual(errors.email, ['Invalid email address']);
  assert.deepEqual(errors.firstName, ['First name is required']);
  assert.deepEqual(errors.password, [
    'Password must contain at least one uppercase letter',
    'Password must contain at least one special character',
  ]);
});

test('vendor search validation treats empty optional filters as absent', () => {
  const req = {
    body: {},
    query: {
      search: '',
      status: '',
      page: '1',
      limit: '10',
      sortField: 'created_at',
      sortOrder: 'desc',
    },
    params: {},
    headers: {},
  };

  let nextCalled = false;
  let nextError = null;
  const next = (err) => {
    nextCalled = true;
    nextError = err;
  };

  validate(searchVendorsSchema)(req, mockRes(), next);

  assert.ok(nextCalled);
  assert.equal(nextError, undefined);
  assert.equal(req.query.status, undefined);
  assert.equal(req.query.search, undefined);
  assert.equal(req.query.page, 1);
  assert.equal(req.query.limit, 10);
});
