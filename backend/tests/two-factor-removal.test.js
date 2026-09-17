import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const read = (...segments) => fs.readFileSync(path.resolve(...segments), 'utf8');

test('Two-factor authentication columns and constants are removed from active backend schema', () => {
  const schema = read('prisma', 'schema.prisma');
  const authModel = read('src', 'zodSchema', 'auth.model.js');
  const authSchema = read('src', 'zodSchema', 'auth.schema.js');

  assert.doesNotMatch(schema, /two_factor|TwoFactor|\bTOTP\b|recoveryCode|challengeToken/i);
  assert.doesNotMatch(authModel, /TWO_FACTOR|two_factor/i);
  assert.doesNotMatch(authSchema, /twoFactor|2FA|\bTOTP\b|challengeToken|recoveryCode/i);
});

test('Two-factor authentication routes and services are removed from active backend code', () => {
  const authRoutes = read('src', 'modules', 'auth', 'auth.routes.js');
  const authController = read('src', 'modules', 'auth', 'auth.controller.js');
  const authService = read('src', 'modules', 'auth', 'auth.service.js');
  const userRoutes = read('src', 'modules', 'users', 'user.routes.js');
  const userController = read('src', 'modules', 'users', 'user.controller.js');
  const userRepository = read('src', 'modules', 'users', 'user.repository.js');

  const removed = /twoFactor|two_factor|TWO_FACTOR|2FA|\bTOTP\b|challengeToken|recoveryCode|authenticator/i;
  assert.doesNotMatch(authRoutes, removed);
  assert.doesNotMatch(authController, removed);
  assert.doesNotMatch(authService, removed);
  assert.doesNotMatch(userRoutes, removed);
  assert.doesNotMatch(userController, removed);
  assert.doesNotMatch(userRepository, removed);
});

test('Two-factor authentication UI and API calls are removed from active frontend code', () => {
  const authService = read('..', 'frontend', 'src', 'services', 'authService.js');
  const userService = read('..', 'frontend', 'src', 'services', 'userService.js');
  const login = read('..', 'frontend', 'src', 'pages', 'Auth', 'Login.jsx');
  const usersList = read('..', 'frontend', 'src', 'pages', 'Users', 'UsersList.jsx');

  const removed = /twoFactor|two_factor|TWO_FACTOR|2FA|\bTOTP\b|challengeToken|recoveryCode|authenticator/i;
  assert.doesNotMatch(authService, removed);
  assert.doesNotMatch(userService, removed);
  assert.doesNotMatch(login, removed);
  assert.doesNotMatch(usersList, removed);
});
