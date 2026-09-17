import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const usersListSource = () =>
  fs.readFileSync(path.resolve('..', 'frontend', 'src', 'pages', 'Users', 'UsersList.jsx'), 'utf8');

test('Frontend user delete uses destructive confirmation modal and real API call', () => {
  const source = usersListSource();

  assert.match(source, /<ConfirmationModal/);
  assert.match(source, /type:\s*"delete"/);
  assert.match(source, /Delete user account\?/);
  assert.match(source, /await deleteUser\(id\)/);
  assert.doesNotMatch(source, /window\.confirm/);
  assert.doesNotMatch(source, /confirm\(/);
});

test('Frontend user delete refetches backend data and does not fake-remove local rows', () => {
  const source = usersListSource();

  assert.match(source, /await loadUsers\(filters\)/);
  assert.match(source, /setFilters\(\(prev\) => \(\{ \.\.\.prev, page: Math\.max\(prev\.page - 1, 1\) \}\)\)/);
  assert.doesNotMatch(source, /setUsers\(\s*users\.filter/);
  assert.doesNotMatch(source, /setUsers\(\s*\(prev\).*filter/s);
});

test('Frontend user delete button is permission-gated', () => {
  const source = usersListSource();

  assert.match(source, /PERMISSIONS\.DELETE_USERS/);
  assert.match(source, /canDeleteUsers &&/);
});
