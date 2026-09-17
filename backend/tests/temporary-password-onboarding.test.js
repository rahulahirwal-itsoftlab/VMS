import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const backend = (...segments) => fs.readFileSync(path.resolve('src', ...segments), 'utf8');
const frontend = (...segments) => fs.readFileSync(path.resolve('..', 'frontend', 'src', ...segments), 'utf8');
const prismaSchema = () => fs.readFileSync(path.resolve('prisma', 'schema.prisma'), 'utf8');

test('database schema supports temporary password onboarding state', () => {
  const schema = prismaSchema();

  assert.match(schema, /must_change_password\s+Boolean\s+@default\(false\)/);
  assert.match(schema, /temporary_password_expires_at\s+DateTime\?/);
  assert.match(schema, /password_changed_at\s+DateTime\?/);
  assert.match(schema, /credentials_email_status\s+String\?/);
  assert.match(schema, /credentials_email_sent_at\s+DateTime\?/);
});

test('create-user backend requires password confirmation and stores only hashed password', () => {
  const userSchema = backend('zodSchema', 'user.schema.js');
  const userService = backend('modules', 'users', 'user.service.js');

  assert.match(userSchema, /password:\s*passwordSchema/);
  assert.match(userSchema, /confirmPassword/);
  assert.match(userSchema, /Passwords do not match/);
  assert.match(userService, /bcrypt\.hash\(password,\s*10\)/);
  assert.match(userService, /MUST_CHANGE_PASSWORD\]: true/);
  assert.match(userService, /TEMPORARY_PASSWORD_EXPIRES_AT/);
  assert.match(userService, /sendTemporaryPasswordEmail/);
  assert.doesNotMatch(userService, /PASSWORD\]: password[,}]/);
});

test('temporary credential email contains required login fields but no tokens or hashes', () => {
  const userService = backend('modules', 'users', 'user.service.js');

  assert.match(userService, /Employee ID:/);
  assert.match(userService, /Role:/);
  assert.match(userService, /Login email:/);
  assert.match(userService, /Temporary password:/);
  assert.match(userService, /Login URL:/);
  assert.match(userService, /must change this temporary password/i);
  assert.doesNotMatch(userService, /accessToken/);
  assert.doesNotMatch(userService, /refreshToken/);
  assert.doesNotMatch(userService, /password hash/i);
});

test('login returns restricted password-change token and blocks normal access until changed', () => {
  const authService = backend('modules', 'auth', 'auth.service.js');
  const authMiddleware = backend('middleware', 'auth.middleware.js');
  const authRoutes = backend('modules', 'auth', 'auth.routes.js');

  assert.match(authService, /requiresPasswordChange:\s*true/);
  assert.match(authService, /generatePasswordChangeToken/);
  assert.match(authService, /completeTemporaryPasswordChange/);
  assert.match(authService, /New password must be different from the temporary password/);
  assert.match(authMiddleware, /must_change_password/);
  assert.match(authMiddleware, /Password change is required before accessing VMS/);
  assert.match(authRoutes, /\/complete-temporary-password/);
});

test('resend credentials requires a new password and does not expose the temporary password in responses', () => {
  const userRoutes = backend('modules', 'users', 'user.routes.js');
  const userController = backend('modules', 'users', 'user.controller.js');
  const userService = backend('modules', 'users', 'user.service.js');

  assert.match(userRoutes, /\/:id\/resend-credentials/);
  assert.match(userRoutes, /resendCredentialsSchema/);
  assert.match(userController, /resendCredentials/);
  assert.match(userService, /async resendCredentials/);
  assert.match(userService, /bcrypt\.hash\(password,\s*10\)/);
  assert.doesNotMatch(userController, /temporaryPassword/);
});

test('frontend create form has temporary password section and never persists passwords', () => {
  const userCreate = frontend('pages', 'Users', 'UserCreate.jsx');
  const userService = frontend('services', 'userService.js');

  assert.match(userCreate, /Login Credentials/);
  assert.match(userCreate, /Temporary Password/);
  assert.match(userCreate, /Confirm Temporary Password/);
  assert.match(userCreate, /passwordRules/);
  assert.match(userCreate, /password:\s*formData\.password/);
  assert.match(userCreate, /confirmPassword:\s*formData\.confirmPassword/);
  assert.match(userCreate, /password:\s*""/);
  assert.match(userService, /resendCredentials/);
  assert.doesNotMatch(userCreate, /localStorage|sessionStorage/);
});

test('frontend mandatory change-password flow is wired without normal app access', () => {
  const authService = frontend('services', 'authService.js');
  const authContext = frontend('context', 'AuthContext.jsx');
  const login = frontend('pages', 'Auth', 'Login.jsx');
  const routes = frontend('routes', 'AppRoutes.jsx');
  const changePage = frontend('pages', 'Auth', 'ChangeTemporaryPassword.jsx');

  assert.match(authService, /PASSWORD_CHANGE_TOKEN_KEY/);
  assert.match(authService, /completeTemporaryPasswordChange/);
  assert.match(authContext, /!result\.requiresPasswordChange/);
  assert.match(login, /\/change-temporary-password/);
  assert.match(routes, /ChangeTemporaryPassword/);
  assert.match(changePage, /Temporary password cannot be reused|temporary password cannot be reused/i);
  assert.doesNotMatch(changePage, /alert\(/);
});

test('log sanitizer redacts temporary password and password-change token fields', () => {
  const sanitizer = backend('utils', 'logSanitizer.js');

  assert.match(sanitizer, /temporarypassword/);
  assert.match(sanitizer, /passwordchangetoken/);
  assert.match(sanitizer, /confirmpassword/);
  assert.match(sanitizer, /newpassword/);
});
