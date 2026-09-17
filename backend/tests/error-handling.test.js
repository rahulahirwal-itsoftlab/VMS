import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import ApiError from '../src/utils/ApiError.js';
import { errorHandler } from '../src/middleware/error.middleware.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..', '..');

const invokeErrorHandler = (error) => {
  const req = {
    method: 'POST',
    originalUrl: '/api/v1/auth/login',
    headers: { 'x-request-id': 'test-request-id' },
  };
  const res = {
    statusCode: null,
    payload: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.payload = payload;
      return this;
    },
  };

  errorHandler(error, req, res, () => {});
  return res;
};

test('error middleware maps Prisma missing-column failures to a safe service-unavailable response', () => {
  const error = new Error('Invalid `prisma.user.findFirst()` invocation: The column `users.deleted_by_id` does not exist.');
  error.name = 'PrismaClientKnownRequestError';
  error.code = 'P2022';
  error.meta = { column: 'users.deleted_by_id' };

  const res = invokeErrorHandler(error);
  const body = JSON.stringify(res.payload);

  assert.equal(res.statusCode, 503);
  assert.equal(res.payload.code, 'SERVICE_TEMPORARILY_UNAVAILABLE');
  assert.equal(res.payload.message, 'The service is temporarily unavailable. Please try again later.');
  assert.equal(res.payload.requestId, 'test-request-id');
  assert.doesNotMatch(body, /prisma\.user\.findFirst|users\.deleted_by_id|P2022|stack/i);
});

test('error middleware does not print raw Prisma schema details for mapped database errors', () => {
  const error = new Error('Invalid `prisma.invoice.create()` invocation: The column `invoice_creation_method of relation invoices` does not exist.');
  error.name = 'PrismaClientKnownRequestError';
  error.code = 'P2022';

  const originalError = console.error;
  const logs = [];
  console.error = (...args) => {
    logs.push(args.join(' '));
  };

  try {
    invokeErrorHandler(error);
  } finally {
    console.error = originalError;
  }

  const body = logs.join('\n');
  assert.match(body, /The service is temporarily unavailable/);
  assert.doesNotMatch(body, /prisma\.invoice\.create|invoice_creation_method|relation invoices|P2022|Stack/i);
});

test('error middleware preserves safe operational authentication errors', () => {
  const res = invokeErrorHandler(new ApiError(401, 'Invalid email or password.'));

  assert.equal(res.statusCode, 401);
  assert.equal(res.payload.message, 'Invalid email or password.');
  assert.equal(res.payload.code, 'INTERNAL_ERROR');
  assert.equal(res.payload.requestId, 'test-request-id');
});

test('frontend login service filters raw Prisma/database messages and disables duplicate submission', () => {
  const authService = fs.readFileSync(path.join(repoRoot, 'frontend', 'src', 'services', 'authService.js'), 'utf8');
  const loginPage = fs.readFileSync(path.join(repoRoot, 'frontend', 'src', 'pages', 'Auth', 'Login.jsx'), 'utf8');

  assert.match(authService, /INTERNAL_ERROR_PATTERNS/);
  assert.match(authService, /SERVICE_TEMPORARILY_UNAVAILABLE/);
  assert.doesNotMatch(authService, /err\?\.\w*message \|\| "Login failed"/);
  assert.match(loginPage, /isSubmitting/);
  assert.match(loginPage, /toast\.error/);
  assert.match(loginPage, /disabled=\{isSubmitting\}/);
});

test('user repository does not log update payloads or tokens during auth updates', () => {
  const repository = fs.readFileSync(path.join(repoRoot, 'backend', 'src', 'modules', 'users', 'user.repository.js'), 'utf8');

  assert.doesNotMatch(repository, /console\.(debug|log)\(['"`]Update Data/);
  assert.doesNotMatch(repository, /console\.(debug|log)\(['"`]UserEntity\.columns/);
  assert.doesNotMatch(repository, /console\.(debug|log)\(['"`]Keys/);
});
