import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const read = (relativePath) => fs.readFileSync(path.resolve(relativePath), 'utf8');

test('User Management frontend no longer imports, stores, renders, or submits department scoping', () => {
  const createSource = read('../frontend/src/pages/Users/UserCreate.jsx');
  const listSource = read('../frontend/src/pages/Users/UsersList.jsx');
  const lookupSource = read('../frontend/src/services/lookupService.js');

  assert.doesNotMatch(createSource, /getDepartmentsLookup/);
  assert.doesNotMatch(createSource, /departments/);
  assert.doesNotMatch(createSource, /department:/);
  assert.doesNotMatch(createSource, /name="department"/);
  assert.doesNotMatch(createSource, /Department Scoping/);

  assert.doesNotMatch(listSource, /department:/);
  assert.doesNotMatch(listSource, /name="department"/);
  assert.doesNotMatch(listSource, /Department Scoping/);

  assert.doesNotMatch(lookupSource, /getDepartmentsLookup/);
  assert.doesNotMatch(lookupSource, /\/v1\/lookups\/departments/);
});

test('Backend lookup API no longer exposes user department scoping options', () => {
  const routesSource = read('src/modules/lookups/lookup.routes.js');
  const controllerSource = read('src/modules/lookups/lookup.controller.js');
  const schemaSource = read('prisma/schema.prisma');
  const userSchemaSource = read('src/zodSchema/user.schema.js');

  assert.doesNotMatch(routesSource, /departments/);
  assert.doesNotMatch(controllerSource, /getDepartments/);
  assert.doesNotMatch(controllerSource, /Department/);
  assert.doesNotMatch(schemaSource, /department/i);
  assert.doesNotMatch(userSchemaSource, /department/i);
});
