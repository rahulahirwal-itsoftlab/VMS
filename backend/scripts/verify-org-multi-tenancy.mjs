import assert from 'node:assert/strict';
import { UserEntity, VendorEntity, OrgEntity } from '../src/zodSchema/index.js';
import { generateAuthTokens, verifyAccessToken } from '../src/utils/jwt.js';
import { sanitizeUser } from '../src/utils/sanitizeUser.js';

async function runVerification() {
  console.log('=== VERIFYING ORGANIZATION & MULTI-TENANCY IMPLEMENTATION ===\n');

  // 1. Verify Entity schemas and columns
  console.log('1. Checking Entity schemas...');
  assert.equal(OrgEntity.table, 'orgs', 'OrgEntity table should be orgs');
  assert.equal(OrgEntity.columns.ID, 'id');
  assert.equal(OrgEntity.columns.NAME, 'name');
  assert.equal(OrgEntity.columns.CODE, 'code');
  assert.equal(UserEntity.columns.ORG_ID, 'org_id', 'UserEntity must include ORG_ID column');
  assert.equal(UserEntity.columns.OrgID, 'org_id', 'UserEntity must include OrgID column');
  assert.equal(VendorEntity.columns.ORG_ID, 'org_id', 'VendorEntity must include ORG_ID column');
  assert.equal(VendorEntity.columns.OrgID, 'org_id', 'VendorEntity must include OrgID column');
  console.log('✔ Entity schemas verified successfully.');

  // 2. Verify JWT token generation and verification with OrgID
  console.log('\n2. Checking JWT Auth Tokens with OrgID...');
  const testUserId = 'test-user-uuid-123';
  const testOrgId = 'e0a1b2c3-d4e5-4f6a-8b9c-0d1e2f3a4b5c';
  const { accessToken, refreshToken } = generateAuthTokens(testUserId, 'CASE_MANAGER', { org_id: testOrgId });
  
  const decoded = verifyAccessToken(accessToken);
  assert.ok(decoded, 'Access token should verify');
  assert.equal(decoded.id, testUserId);
  assert.equal(decoded.org_id, testOrgId, 'Decoded token must contain org_id');
  assert.equal(decoded.OrgID, testOrgId, 'Decoded token must contain OrgID');
  console.log('✔ JWT Token carries OrgID and org_id payload.');

  // 3. Verify user sanitization retains OrgID
  console.log('\n3. Checking user sanitization...');
  const rawUser = {
    id: 'user-1',
    email: 'user1@example.com',
    password: 'hashed-password-secret',
    org_id: testOrgId,
  };
  const sanitized = sanitizeUser(rawUser);
  assert.equal(sanitized.password, undefined, 'Password must be stripped');
  assert.equal(sanitized.org_id, testOrgId);
  assert.equal(sanitized.OrgID, testOrgId, 'Sanitized user must expose OrgID');
  console.log('✔ User sanitization exposes OrgID and org_id.');

  // 4. Verify Org Service and Isolation Logic
  console.log('\n4. Checking Org Service permissions & isolation logic...');
  const { default: orgService } = await import('../src/modules/orgs/org.service.js');
  
  // Non-SuperAdmin trying to create Org should fail
  await assert.rejects(
    async () => {
      await orgService.createOrg({ name: 'Rival Corp' }, { role: 'CASE_MANAGER', org_id: testOrgId });
    },
    (err) => {
      assert.equal(err.statusCode, 403);
      return true;
    },
    'Non-SuperAdmin must be rejected from creating orgs'
  );

  // Non-SuperAdmin trying to view another Org should fail
  await assert.rejects(
    async () => {
      await orgService.getOrgById('other-org-id', { role: 'FINANCE_HEAD', org_id: testOrgId });
    },
    (err) => {
      assert.equal(err.statusCode, 403);
      return true;
    },
    'Cross-org access must be blocked with 403'
  );
  console.log('✔ Org Service data isolation and role boundaries verified.');

  console.log('\n======================================================');
  console.log('ALL ORGANIZATION AND MULTI-TENANCY CHECKS PASSED! ✔');
  console.log('======================================================');
}

runVerification().catch((err) => {
  console.error('Verification failed:', err);
  process.exit(1);
});
