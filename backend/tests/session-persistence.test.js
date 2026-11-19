import assert from 'node:assert/strict';
import test from 'node:test';
import {
  generateAuthTokens,
  verifyAccessToken,
  verifyRefreshToken,
  hashToken,
  ACCESS_TOKEN_EXPIRY,
  REFRESH_TOKEN_EXPIRY,
} from '../src/utils/jwt.js';

test('jwt utils - generateAuthTokens produces valid access and refresh tokens with configured expiries', () => {
  const userId = 'user-test-uuid-1234';
  const role = 'SUPER_ADMIN';

  const { accessToken, refreshToken } = generateAuthTokens(userId, role);

  assert.ok(accessToken, 'accessToken should be generated');
  assert.ok(refreshToken, 'refreshToken should be generated');

  const decodedAccess = verifyAccessToken(accessToken);
  assert.ok(decodedAccess, 'accessToken should be verifiable');
  assert.equal(decodedAccess.id, userId);
  assert.equal(decodedAccess.role, role);
  assert.ok(Array.isArray(decodedAccess.permissions), 'permissions should be attached');

  const decodedRefresh = verifyRefreshToken(refreshToken);
  assert.ok(decodedRefresh, 'refreshToken should be verifiable');
  assert.equal(decodedRefresh.id, userId);

  assert.ok(ACCESS_TOKEN_EXPIRY, 'ACCESS_TOKEN_EXPIRY should be defined');
  assert.ok(REFRESH_TOKEN_EXPIRY, 'REFRESH_TOKEN_EXPIRY should be defined');
});

test('jwt utils - hashToken consistently hashes refresh tokens using SHA-256', () => {
  const token = 'sample.refresh.token';
  const hash1 = hashToken(token);
  const hash2 = hashToken(token);

  assert.equal(hash1, hash2, 'Hash must be deterministic');
  assert.equal(hash1.length, 64, 'SHA-256 hex digest length must be 64 characters');
  assert.equal(hashToken(''), '');
  assert.equal(hashToken(null), '');
});

test('jwt utils - verifyAccessToken and verifyRefreshToken reject tampered or invalid tokens', () => {
  assert.equal(verifyAccessToken('invalid.token.here'), null);
  assert.equal(verifyRefreshToken('invalid.token.here'), null);
  assert.equal(verifyAccessToken(''), null);
  assert.equal(verifyRefreshToken(null), null);
});

