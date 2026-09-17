import test from 'node:test';
import assert from 'node:assert/strict';
import bcrypt from 'bcryptjs';
import authService from '../src/modules/auth/auth.service.js';
import userRepository from '../src/modules/users/user.repository.js';
import prisma from '../src/config/prisma.js';
import {
  buildActivationEmail,
  generateActivationToken,
  hashActivationToken,
} from '../src/modules/auth/onboarding.service.js';

const originalFindByEmail = userRepository.findByEmail;
const originalFindByActivationTokenHash = userRepository.findByActivationTokenHash;
const originalUpdateUser = userRepository.updateUser;
const originalAuditCreate = prisma.auditLog.create;

const restoreAll = () => {
  userRepository.findByEmail = originalFindByEmail;
  userRepository.findByActivationTokenHash = originalFindByActivationTokenHash;
  userRepository.updateUser = originalUpdateUser;
  prisma.auditLog.create = originalAuditCreate;
};

const activeUser = (overrides = {}) => ({
  id: 'user_1',
  employee_id: 'EMP000001',
  email: 'case@vms.com',
  first_name: 'Case',
  last_name: 'Manager',
  role: 'CASE_MANAGER',
  status: 'ACTIVE',
  deleted_at: null,
  activation_token_hash: hashActivationToken('valid-token'),
  activation_token_expires_at: new Date(Date.now() + 15 * 60 * 1000),
  activation_token_used_at: null,
  activated_at: null,
  password_set_at: null,
  failed_login_attempts: 0,
  locked_until: null,
  ...overrides,
});

test('Activation tokens are secure random values and stored as hashes', () => {
  const tokenA = generateActivationToken();
  const tokenB = generateActivationToken();
  assert.notEqual(tokenA, tokenB);
  assert.ok(tokenA.length >= 32);
  assert.equal(hashActivationToken(tokenA).length, 64);
  assert.notEqual(hashActivationToken(tokenA), tokenA);
});

test('Activation email contains safe onboarding data but no plaintext password', () => {
  const email = buildActivationEmail({
    user: activeUser(),
    creator: { first_name: 'Admin', last_name: 'User', email: 'admin@vms.com' },
    token: 'valid-token',
  });

  assert.match(email.html, /EMP000001/);
  assert.match(email.html, /CASE_MANAGER/);
  assert.match(email.text, /valid-token/);
  assert.doesNotMatch(email.html, /Password@123/);
  assert.doesNotMatch(email.text, /Password@123/);
});

test('AuthService validates a valid activation token without leaking token hash', async () => {
  restoreAll();
  userRepository.findByActivationTokenHash = async () => activeUser();

  const result = await authService.validateActivationToken('valid-token');

  assert.equal(result.valid, true);
  assert.equal(result.user.employeeId, 'EMP000001');
  assert.equal(result.user.email, 'case@vms.com');
  assert.equal(result.user.activation_token_hash, undefined);

  restoreAll();
});

test('AuthService rejects expired, used, and invalid activation tokens', async () => {
  restoreAll();

  userRepository.findByActivationTokenHash = async () => activeUser({
    activation_token_expires_at: new Date(Date.now() - 1000),
  });
  await assert.rejects(authService.validateActivationToken('expired-token'), /expired/);

  userRepository.findByActivationTokenHash = async () => activeUser({
    activation_token_used_at: new Date(),
  });
  await assert.rejects(authService.validateActivationToken('used-token'), /used/);

  userRepository.findByActivationTokenHash = async () => null;
  await assert.rejects(authService.validateActivationToken('invalid-token'), /invalid/);

  restoreAll();
});

test('AuthService setPassword marks activation token used and enables login password', async () => {
  restoreAll();
  let updateData;
  userRepository.findByActivationTokenHash = async () => activeUser();
  userRepository.updateUser = async (_id, data) => {
    updateData = data;
    return { ...activeUser(), ...data };
  };
  prisma.auditLog.create = async () => ({});

  const result = await authService.setPassword('valid-token', 'Password@123');

  assert.equal(updateData.activation_token_hash, null);
  assert.equal(updateData.activation_token_expires_at, null);
  assert.ok(updateData.activation_token_used_at instanceof Date);
  assert.ok(updateData.activated_at instanceof Date);
  assert.ok(updateData.password_set_at instanceof Date);
  assert.equal(result.password, undefined);

  restoreAll();
});

test('AuthService login blocks unactivated, deactivated, deleted, and locked accounts', async () => {
  restoreAll();

  userRepository.findByEmail = async () => activeUser();
  await assert.rejects(authService.login('case@vms.com', 'Password@123'), /activation is required/);

  userRepository.findByEmail = async () => activeUser({ status: 'INACTIVE' });
  await assert.rejects(authService.login('case@vms.com', 'Password@123'), /Invalid email or password/);

  userRepository.findByEmail = async () => activeUser({ deleted_at: new Date() });
  await assert.rejects(authService.login('case@vms.com', 'Password@123'), /Invalid email or password/);

  userRepository.findByEmail = async () => activeUser({
    activated_at: new Date(),
    password_set_at: new Date(),
    password: await bcrypt.hash('Password@123', 10),
    locked_until: new Date(Date.now() + 60 * 1000),
  });
  await assert.rejects(authService.login('case@vms.com', 'Password@123'), /temporarily locked/);

  restoreAll();
});

test('AuthService login succeeds with email/password after activation and updates session data', async () => {
  restoreAll();
  const hash = await bcrypt.hash('Password@123', 10);
  let updateData;

  userRepository.findByEmail = async (email) => activeUser({
    email,
    password: hash,
    activated_at: new Date(),
    password_set_at: new Date(),
  });
  userRepository.updateUser = async (_id, data) => {
    updateData = data;
    return { ...activeUser(), ...data };
  };
  prisma.auditLog.create = async () => ({});

  const result = await authService.login('CASE@VMS.COM', 'Password@123');

  assert.ok(result.accessToken);
  assert.ok(result.refreshToken);
  assert.equal(result.user.password, undefined);
  assert.ok(updateData.refresh_token);
  assert.ok(updateData.last_login_at instanceof Date);
  assert.equal(updateData.failed_login_attempts, 0);

  restoreAll();
});

test('AuthService login increments failures and locks after repeated invalid passwords', async () => {
  restoreAll();
  const hash = await bcrypt.hash('Password@123', 10);
  let updateData;

  userRepository.findByEmail = async () => activeUser({
    password: hash,
    activated_at: new Date(),
    password_set_at: new Date(),
    failed_login_attempts: 4,
  });
  userRepository.updateUser = async (_id, data) => {
    updateData = data;
    return { ...activeUser(), ...data };
  };

  await assert.rejects(authService.login('case@vms.com', 'Wrong@123'), /Invalid email or password/);
  assert.equal(updateData.failed_login_attempts, 5);
  assert.ok(updateData.locked_until instanceof Date);

  restoreAll();
});

test('AuthService login issues tokens directly without a 2FA challenge', async () => {
  restoreAll();
  const hash = await bcrypt.hash('Password@123', 10);
  let updateData;

  userRepository.findByEmail = async () => activeUser({
    password: hash,
    activated_at: new Date(),
    password_set_at: new Date(),
  });
  userRepository.updateUser = async (_id, data) => {
    updateData = data;
    return { ...activeUser(), ...data };
  };
  prisma.auditLog.create = async () => ({});

  const result = await authService.login('case@vms.com', 'Password@123');
  assert.ok(result.accessToken);
  assert.ok(result.refreshToken);
  assert.equal(result.twoFactorRequired, undefined);
  assert.equal(result.challengeToken, undefined);
  assert.ok(updateData.refresh_token);
  assert.ok(updateData.last_login_at instanceof Date);

  restoreAll();
});

test('AuthService resend activation is generic and rate limited', async () => {
  restoreAll();
  userRepository.findByEmail = async () => activeUser({
    activation_last_sent_at: new Date(),
  });

  const message = await authService.resendActivation('case@vms.com');
  assert.match(message, /If the account is eligible/);

  userRepository.findByEmail = async () => null;
  const unknownMessage = await authService.resendActivation('unknown@vms.com');
  assert.equal(unknownMessage, message);

  restoreAll();
});
