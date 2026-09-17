import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const read = (...segments) => fs.readFileSync(path.resolve(...segments), 'utf8');

test('Reporting Manager fields and self-relations are removed from active user schema', () => {
  const schema = read('prisma', 'schema.prisma');
  const authModel = read('src', 'zodSchema', 'auth.model.js');
  const userSchema = read('src', 'zodSchema', 'user.schema.js');

  assert.doesNotMatch(schema, /\breporting_manager_id\b/);
  assert.doesNotMatch(schema, /\bUserReportingManager\b/);
  assert.doesNotMatch(schema, /\bdirect_reports\b/);
  assert.doesNotMatch(authModel, /\bREPORTING_MANAGER_ID\b/);
  assert.doesNotMatch(userSchema, /\breportingManagerId\b/);
});

test('Reporting Manager assignment logic is removed from backend user and lookup modules', () => {
  const userService = read('src', 'modules', 'users', 'user.service.js');
  const userRepository = read('src', 'modules', 'users', 'user.repository.js');
  const lookupController = read('src', 'modules', 'lookups', 'lookup.controller.js');

  assert.doesNotMatch(userService, /reportingManagerId|reporting_manager_id|Circular reporting|reporting manager/i);
  assert.doesNotMatch(userRepository, /findActiveReportingManagers|clearReportingManagerForReports|reporting_manager/i);
  assert.doesNotMatch(lookupController, /getEligibleReportingManagerRoles|eligible reporting|reporting manager/i);
});

test('Reporting Manager fields are removed from frontend user-management contracts', () => {
  const userService = read('..', 'frontend', 'src', 'services', 'userService.js');
  const lookupService = read('..', 'frontend', 'src', 'services', 'lookupService.js');
  const userCreate = read('..', 'frontend', 'src', 'pages', 'Users', 'UserCreate.jsx');
  const usersList = read('..', 'frontend', 'src', 'pages', 'Users', 'UsersList.jsx');

  const removedIdentifiers = /reportingManagerId|reportingManager|getReportingManagersLookup|roleSupportsReportingManager|Reporting Manager/i;

  assert.doesNotMatch(userService, removedIdentifiers);
  assert.doesNotMatch(lookupService, /getReportingManagersLookup|reporting manager/i);
  assert.doesNotMatch(userCreate, removedIdentifiers);
  assert.doesNotMatch(usersList, removedIdentifiers);
});
