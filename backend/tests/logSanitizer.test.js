import test from 'node:test';
import assert from 'node:assert/strict';
import { sanitizeObject } from '../src/utils/logSanitizer.js';

test('logSanitizer - redacts flat sensitive keys', () => {
  const originalObj = {
    username: 'john_doe',
    password: 'SuperSecretPassword123!',
    email: 'john@example.com',
    token: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9',
  };

  const sanitized = sanitizeObject(originalObj);

  // Check original is not mutated
  assert.equal(originalObj.password, 'SuperSecretPassword123!');
  assert.equal(originalObj.token, 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9');

  // Check redacts exist
  assert.equal(sanitized.username, 'john_doe');
  assert.equal(sanitized.email, 'john@example.com');
  assert.equal(sanitized.password, '***');
  assert.equal(sanitized.token, '***');
});

test('logSanitizer - handles Authorization header with Bearer token prefix retention', () => {
  const originalHeaders = {
    host: 'localhost:5000',
    authorization: 'Bearer mySuperSecretJWTAccessTokenHere',
    cookie: 'session_id=abc123xyz; secure; httpOnly',
  };

  const sanitized = sanitizeObject(originalHeaders);

  assert.equal(sanitized.host, 'localhost:5000');
  assert.equal(sanitized.authorization, 'Bearer ***');
  assert.equal(sanitized.cookie, '***');
});

test('logSanitizer - redacts nested properties recursively and handles arrays', () => {
  const complexObj = {
    id: 'user_1',
    profile: {
      firstName: 'Jane',
      lastName: 'Smith',
      confirmPassword: 'JanePassword!@#1',
    },
    history: [
      {
        action: 'login',
        token: 'token_val',
      },
      {
        action: 'update',
        otp: '123456',
      }
    ],
    permissions: ['VIEW_DASHBOARD', 'MANAGE_USERS'],
  };

  const sanitized = sanitizeObject(complexObj);

  // Assert recursive redacts
  assert.equal(sanitized.profile.firstName, 'Jane');
  assert.equal(sanitized.profile.confirmPassword, '***');

  // Assert array handling
  assert.equal(sanitized.history[0].action, 'login');
  assert.equal(sanitized.history[0].token, '***');
  assert.equal(sanitized.history[1].action, 'update');
  assert.equal(sanitized.history[1].otp, '***');

  // Assert permissions array length metadata is printed instead of full list (as per our sanitizer rules)
  assert.equal(sanitized.permissions, '[Array(2)]');
});

test('logSanitizer - prevents circular dependency infinite loops', () => {
  const circularObj = {
    name: 'Circular',
    password: 'secret_pass',
  };
  circularObj.self = circularObj;

  const sanitized = sanitizeObject(circularObj);

  assert.equal(sanitized.name, 'Circular');
  assert.equal(sanitized.password, '***');
  assert.equal(sanitized.self, '[Circular Reference]');
});
