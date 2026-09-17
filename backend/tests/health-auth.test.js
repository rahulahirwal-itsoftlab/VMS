import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';

import app from '../src/app.js';

const frontendSource = (...segments) =>
  fs.readFileSync(path.resolve('..', 'frontend', 'src', ...segments), 'utf8');

const backendSource = (...segments) =>
  fs.readFileSync(path.resolve('src', ...segments), 'utf8');

const request = async (pathname) => {
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, resolve));
  const { port } = server.address();

  try {
    const response = await fetch(`http://127.0.0.1:${port}${pathname}`, {
      headers: { 'x-request-id': 'test-request-id' },
    });
    const body = await response.json();
    return { response, body };
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
};

test('/health returns safe database-aware payload without authentication', async () => {
  const { response, body } = await request('/health');

  assert.equal(response.status, 200);
  assert.equal(body.success, true);
  assert.match(body.status, /^(ok|degraded)$/);
  assert.match(body.database, /^(connected|unavailable)$/);
  assert.equal(body.service, 'vms-backend');
  assert.equal(body.requestId, 'test-request-id');
  assert.equal(typeof body.uptimeSeconds, 'number');
  assert.doesNotMatch(JSON.stringify(body), /postgres|password|DATABASE_URL|accessToken|refreshToken/i);
});

test('/health/ready uses shared Prisma Client and safe response structures', () => {
  const appSource = backendSource('app.js');

  assert.match(appSource, /import prisma from '\.\/config\/prisma\.js'/);
  assert.match(appSource, /const checkDatabaseHealth = async \(\) =>/);
  assert.match(appSource, /prisma\.\$connect\(\)/);
  assert.match(appSource, /prisma\.\$queryRawUnsafe\('SELECT 1::int AS ok'\)/);
  assert.match(appSource, /HEALTH_QUERY_TIMEOUT_MS/);
  assert.match(appSource, /status: 'ok'/);
  assert.match(appSource, /status: 'degraded'/);
  assert.match(appSource, /database: 'connected'/);
  assert.match(appSource, /database: 'unavailable'/);
  assert.match(appSource, /status: 'ready'/);
  assert.match(appSource, /status: 'not_ready'/);
  assert.match(appSource, /database: 'up'/);
  assert.match(appSource, /database: 'down'/);
  assert.doesNotMatch(appSource, /\$disconnect\(\)|pool\.end\(\)|DATABASE_URL|sanitizeDatabaseUrl/);
  assert.doesNotMatch(appSource, /classifyDatabaseError\(error\)|category:/);
});

test('backend auth middleware returns safe authentication and authorization codes', () => {
  const authMiddleware = backendSource('middleware', 'auth.middleware.js');
  const authenticateMiddleware = backendSource('middleware', 'authenticate.middleware.js');
  const authorizeMiddleware = backendSource('middleware', 'authorize.middleware.js');
  const constants = backendSource('modules', 'auth', 'auth.constants.js');

  assert.match(constants, /Please log in to continue\./);
  assert.match(constants, /Your session has expired\. Please log in again\./);
  assert.match(constants, /You do not have permission to access this resource\./);
  assert.match(authMiddleware, /UNAUTHENTICATED/);
  assert.match(authMiddleware, /TOKEN_EXPIRED/);
  assert.match(authenticateMiddleware, /UNAUTHENTICATED/);
  assert.match(authenticateMiddleware, /TOKEN_EXPIRED/);
  assert.match(authorizeMiddleware, /FORBIDDEN/);
});

test('frontend API client centralizes 401 refresh and login redirect behavior', () => {
  const apiClient = frontendSource('api', 'axios.js');
  const authSession = frontendSource('services', 'authSession.js');
  const authService = frontendSource('services', 'authService.js');

  assert.match(apiClient, /api\.interceptors\.response\.use/);
  assert.match(apiClient, /refreshPromise \|\|=/);
  assert.match(apiClient, /__isRetryRequest/);
  assert.match(apiClient, /\/v1\/auth\/refresh-token/);
  assert.match(apiClient, /clearAuthSession\(\)/);
  assert.match(apiClient, /redirectToLogin\(\)/);
  assert.match(apiClient, /status !== 401/);
  assert.doesNotMatch(apiClient, /status === 403.*redirectToLogin/s);
  assert.match(authSession, /AUTH_SESSION_CLEARED_EVENT/);
  assert.match(authSession, /clearAuthSession/);
  assert.match(authService, /api\.get\("\/v1\/auth\/profile"\)/);
  assert.doesNotMatch(authService, /if \(Array\.isArray\(cached\?\.permissions\)\) return cached/);
});

test('frontend protected routes and login use central auth state and role dashboard mapping', () => {
  const protectedRoute = frontendSource('components', 'auth', 'ProtectedRoute.jsx');
  const login = frontendSource('pages', 'Auth', 'Login.jsx');
  const routes = frontendSource('routes', 'AppRoutes.jsx');
  const mapping = frontendSource('config', 'roleDashboard.js');

  assert.match(protectedRoute, /bootstrapping/);
  assert.match(protectedRoute, /to="\/login"/);
  assert.match(protectedRoute, /to="\/403"/);
  assert.match(login, /getDashboardPathForRole/);
  assert.match(login, /isAuthenticated/);
  assert.match(routes, /RootRedirect/);
  assert.match(routes, /getDashboardPathForRole/);
  assert.match(mapping, /ROLE_DASHBOARD_PATHS/);
});
