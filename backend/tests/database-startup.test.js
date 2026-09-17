import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { sanitizeDatabaseUrl, validateDatabaseUrl } from '../src/config/databaseEnv.js';
import { classifyDatabaseError, isTransientDatabaseError, withDatabaseRetry } from '../src/utils/dbRetry.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const backendRoot = path.resolve(__dirname, '..');
const read = (...segments) => fs.readFileSync(path.join(backendRoot, ...segments), 'utf8');

test('database URL normalization preserves secrets while enforcing supported ssl mode', () => {
  const prismaConfig = read('src', 'config', 'prisma.js');

  assert.match(prismaConfig, /const normalizeDatabaseUrl = \(url\) =>/);
  assert.match(prismaConfig, /parsed\.searchParams\.set\('sslmode', 'verify-full'\)/);
  assert.doesNotMatch(prismaConfig, /console\.log\(process\.env\.DATABASE_URL/);
});

test('database environment validation rejects missing, invalid, whitespace, and insecure URLs', () => {
  assert.throws(() => validateDatabaseUrl(''), /DATABASE_URL is required/);
  assert.throws(() => validateDatabaseUrl('not-a-url'), /valid URL/);
  assert.throws(() => validateDatabaseUrl(' postgresql://user:pass@example.com/db?sslmode=require'), /whitespace/);
  assert.throws(() => validateDatabaseUrl('postgresql://user:pass@db.internal/db?sslmode=disable'), /unsupported sslmode/);
  assert.throws(() => validateDatabaseUrl('postgresql://user:pass@db.internal/db'), /include sslmode/);

  const valid = validateDatabaseUrl('postgresql://user:p%40ss@example.neon.tech:5432/neondb?sslmode=verify-full');
  assert.equal(valid.host, 'example.neon.tech');
  assert.equal(valid.port, '5432');
  assert.equal(valid.database, 'neondb');
  assert.equal(valid.sslmode, 'verify-full');
  assert.equal(valid.sanitizedUrl.includes('p%40ss'), false);
});

test('database URL sanitizer never exposes password material', () => {
  const sanitized = sanitizeDatabaseUrl('postgresql://user:p%40ss%3Aword@example.neon.tech/neondb?sslmode=require');

  assert.equal(sanitized, 'postgresql://<user>:***@example.neon.tech:5432/neondb?sslmode=require');
  assert.equal(sanitized.includes('p%40ss'), false);
  assert.equal(sanitized.includes('word'), false);
});

test('database pool configuration is centralized and environment configurable', () => {
  const prismaConfig = read('src', 'config', 'prisma.js');
  const prismaCliConfig = read('prisma.config.ts');

  assert.match(prismaConfig, /new Pool\(poolConfig\)/);
  assert.match(prismaConfig, /DB_POOL_MAX/);
  assert.match(prismaConfig, /DB_CONNECTION_TIMEOUT_MS/);
  assert.match(prismaConfig, /export \{[\s\S]*pool,[\s\S]*prisma,[\s\S]*testDatabaseConnection/);
  assert.match(prismaConfig, /const dbConfig = \{/);
  assert.match(prismaCliConfig, /process\.env\.DIRECT_URL \|\| process\.env\.DATABASE_URL/);
});

test('development seeding is explicit and does not run by default during startup', () => {
  const server = read('src', 'server.js');
  const seedDevUsers = read('src', 'utils', 'seedDevUsers.js');

  assert.match(server, /ENABLE_DEV_SEED === 'true'/);
  assert.match(server, /SEED_DEV_USERS === 'true'/);
  assert.match(server, /Skipped\. Set ENABLE_DEV_SEED=true/);
  assert.match(seedDevUsers, /findSeedUserByEmail/);
  assert.match(seedDevUsers, /withDatabaseRetry/);
  assert.doesNotMatch(seedDevUsers, /findByEmail\(u\.email\)/);
});

test('development startup can run in degraded mode only when explicitly enabled', () => {
  const server = read('src', 'server.js');

  assert.match(server, /STARTUP_DATABASE_ERROR_CATEGORIES = new Set/);
  assert.match(server, /DATABASE_HOST_UNREACHABLE/);
  assert.match(server, /process\.env\.NODE_ENV !== 'production'/);
  assert.match(server, /process\.env\.ALLOW_DEGRADED_STARTUP === 'true'/);
  assert.match(server, /listen\('degraded'\)/);
  assert.match(server, /Database-backed routes will return service-unavailable responses/);
  assert.match(server, /Degraded startup was explicitly enabled/);
});

test('startup still fails fast for production and invalid database configuration', () => {
  const server = read('src', 'server.js');
  const categoryList = server.slice(
    server.indexOf('const STARTUP_DATABASE_ERROR_CATEGORIES'),
    server.indexOf(']);', server.indexOf('const STARTUP_DATABASE_ERROR_CATEGORIES'))
  );

  assert.match(server, /DATABASE_URL_MISSING/);
  assert.match(server, /DATABASE_URL_INVALID/);
  assert.match(server, /DATABASE_AUTH_FAILED/);
  assert.match(server, /DATABASE_SSL_ERROR/);
  assert.equal(categoryList.includes('DATABASE_URL_MISSING'), false);
  assert.equal(categoryList.includes('DATABASE_URL_INVALID'), false);
  assert.equal(categoryList.includes('DATABASE_AUTH_FAILED'), false);
  assert.equal(categoryList.includes('DATABASE_SSL_ERROR'), false);
  assert.match(server, /process\.env\.NODE_ENV !== 'production'/);
  assert.match(server, /process\.exit\(1\)/);
});

test('database retry helper retries transient failures only', async () => {
  assert.equal(isTransientDatabaseError({ code: 'P1002', message: 'timeout' }), true);
  assert.equal(isTransientDatabaseError(new Error('Query read timeout')), true);
  assert.equal(isTransientDatabaseError({ code: 'P1000', message: 'Authentication failed' }), false);
  assert.equal(isTransientDatabaseError({ code: '28P01' }), false);
  assert.equal(isTransientDatabaseError({ code: 'DATABASE_URL_MISSING' }), false);
  assert.equal(isTransientDatabaseError({ code: 'DATABASE_SSL_ERROR' }), false);
  assert.equal(isTransientDatabaseError({ code: 'P2002', message: 'unique constraint' }), false);

  let attempts = 0;
  const result = await withDatabaseRetry('test transient operation', async () => {
    attempts += 1;
    if (attempts < 2) {
      const error = new Error('Connection terminated unexpectedly');
      error.code = '08006';
      throw error;
    }
    return 'ok';
  }, {
    attempts: 2,
    baseDelayMs: 1,
    maxDelayMs: 1,
  });

  assert.equal(result, 'ok');
  assert.equal(attempts, 2);

  await assert.rejects(
    () => withDatabaseRetry('test permanent operation', async () => {
      const error = new Error('Unique constraint failed');
      error.code = 'P2002';
      throw error;
    }, {
      attempts: 3,
      baseDelayMs: 1,
      maxDelayMs: 1,
    }),
    /Unique constraint failed/
  );
});

test('database error classifier distinguishes common Neon connection failures', () => {
  assert.equal(classifyDatabaseError({ code: 'DATABASE_URL_MISSING' }), 'DATABASE_URL_MISSING');
  assert.equal(classifyDatabaseError({ code: 'DATABASE_URL_INVALID' }), 'DATABASE_URL_INVALID');
  assert.equal(classifyDatabaseError({ code: 'DATABASE_ENV_INVALID' }), 'DATABASE_URL_INVALID');
  assert.equal(classifyDatabaseError({ code: 'ENOTFOUND' }), 'DATABASE_DNS_FAILURE');
  assert.equal(classifyDatabaseError({ code: 'ECONNREFUSED' }), 'DATABASE_CONNECTION_REFUSED');
  assert.equal(classifyDatabaseError({ code: 'EHOSTUNREACH' }), 'DATABASE_HOST_UNREACHABLE');
  assert.equal(classifyDatabaseError({ code: 'EACCES' }), 'DATABASE_HOST_UNREACHABLE');
  assert.equal(classifyDatabaseError({ code: 'ETIMEDOUT' }), 'DATABASE_CONNECTION_TIMEOUT');
  assert.equal(classifyDatabaseError(new Error('Query read timeout')), 'DATABASE_CONNECTION_TIMEOUT');
  assert.equal(classifyDatabaseError({ code: '28P01' }), 'DATABASE_AUTH_FAILED');
  assert.equal(classifyDatabaseError({ code: 'P1000', message: 'Authentication failed' }), 'DATABASE_AUTH_FAILED');
  assert.equal(classifyDatabaseError({ message: 'self signed certificate in certificate chain' }), 'DATABASE_SSL_ERROR');
  assert.equal(classifyDatabaseError({ code: '3D000' }), 'DATABASE_NOT_FOUND');
  assert.equal(classifyDatabaseError({ code: 'P2022' }), 'DATABASE_SCHEMA_MISMATCH');
  assert.equal(classifyDatabaseError({ code: 'P2010', message: "Can't reach database server at host" }), 'DATABASE_HOST_UNREACHABLE');
  assert.equal(classifyDatabaseError({ code: 'P9999', message: 'Unexpected database failure' }), 'DATABASE_UNKNOWN_ERROR');
});

test('auth middleware retries transient database lookup failures', () => {
  const authMiddleware = read('src', 'middleware', 'auth.middleware.js');

  assert.match(authMiddleware, /withDatabaseRetry/);
  assert.match(authMiddleware, /auth user lookup/);
  assert.match(authMiddleware, /prisma\.user\.findUnique/);
});

test('readiness endpoint is mounted separately from liveness endpoint', () => {
  const app = read('src', 'app.js');

  assert.match(app, /app\.get\('\/health'/);
  assert.match(app, /app\.get\('\/health\/ready'/);
  assert.match(app, /SELECT 1::int AS ok/);
  assert.match(app, /status\(503\)/);
});
