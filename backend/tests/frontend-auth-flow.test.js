import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const root = path.resolve(process.cwd(), '..');
const frontend = (...parts) => fs.readFileSync(path.join(root, 'frontend', ...parts), 'utf8');

test('axios interceptor redirects missing protected access token before API call', () => {
  const source = frontend('src', 'api', 'axios.js');

  assert.match(source, /class AuthRequiredError extends Error/);
  assert.match(source, /isSkippedAuthPath\(requestUrl\)/);
  assert.match(source, /if \(!token\)/);
  assert.match(source, /clearAuthSession\(\)/);
  assert.match(source, /redirectToLogin\(\)/);
  assert.match(source, /Promise\.reject\(new AuthRequiredError/);
  assert.match(source, /Authorization = `Bearer \$\{token\}`/);
  assert.match(source, /refreshAccessToken/);
  assert.match(source, /originalRequest\.__isRetryRequest = true/);
  assert.match(source, /login\?redirect=/);
  assert.doesNotMatch(source, /login\?from=/);
});

test('protected routes and login preserve intended destination with redirect query', () => {
  const protectedRoute = frontend('src', 'components', 'auth', 'ProtectedRoute.jsx');
  const login = frontend('src', 'pages', 'Auth', 'Login.jsx');

  assert.match(protectedRoute, /bootstrapping/);
  assert.match(protectedRoute, /login\?redirect=/);
  assert.match(protectedRoute, /encodeURIComponent\(redirectPath\)/);
  assert.match(login, /get\("redirect"\)/);
  assert.match(login, /preservedRoute/);
  assert.match(login, /getDashboardPathForRole/);
});

test('auth session treats blank tokens as missing and clears cached auth state', () => {
  const session = frontend('src', 'services', 'authSession.js');
  const context = frontend('src', 'context', 'AuthContext.jsx');

  assert.match(session, /normalizeToken/);
  assert.match(session, /token\.trim\(\)/);
  assert.match(session, /vms_profile/);
  assert.match(session, /hasAuthTokens = \(\) => Boolean\(getAccessToken\(\)\)/);
  assert.match(context, /clearAuthSession\(\{ notify: false \}\)/);
  assert.match(context, /AUTH_SESSION_CLEARED_EVENT/);
});

test('frontend error handling differentiates auth, permission, missing resource, server, and network failures', () => {
  const feedback = frontend('src', 'utils', 'feedback.js');
  const authService = frontend('src', 'services', 'authService.js');

  assert.match(feedback, /AUTH_REQUIRED/);
  assert.match(feedback, /status === 401/);
  assert.match(feedback, /status === 403/);
  assert.match(feedback, /status === 404/);
  assert.match(feedback, /status >= 500/);
  assert.match(feedback, /Unable to connect to the server/);
  assert.match(authService, /NETWORK_ERROR_MESSAGE/);
  assert.match(authService, /INTERNAL_SERVER_ERROR_MESSAGE/);
  assert.match(authService, /status === 401/);
});
