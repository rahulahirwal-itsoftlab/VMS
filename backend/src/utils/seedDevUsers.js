import 'dotenv/config';
import bcrypt from 'bcryptjs';
import userRepository from '../modules/users/user.repository.js';
import { USER_ACCOUNT_STATUS } from '../modules/users/user-status.constants.js';
import { toSafeErrorLog, withDatabaseRetry } from './dbRetry.js';

import { ROLES, UserEntity } from '../zodSchema/index.js';

/**
 * Seed development users for all roles.
 *
 * Requirements:
 * - Uses backend role constants (ROLES.*)
 * - Does NOT hardcode DB ids.
 * - Uses bcrypt hashing.
 * - Seed accounts if they do not already exist.
 * - Password is read from DEV_SEED_PASSWORD or SUPER_ADMIN_PASSWORD.
 */

const DEV_USERS = [
  {
    email: process.env.SUPER_ADMIN_EMAIL || 'admin@vms.com',
    role: ROLES.SUPER_ADMIN,
    first_name: 'System',
    last_name: 'Admin',
  },
  {
    email: 'finance@vms.com',
    role: ROLES.FINANCE_HEAD,
    first_name: 'Finance',
    last_name: 'Head',
  },
  {
    email: 'l1@vms.com',
    role: ROLES.TEAM_LEAD,
    first_name: 'L1',
    last_name: 'Team Lead',
  },
  {
    email: 'teamlead@vms.com',
    role: ROLES.TEAM_LEAD,
    first_name: 'Team',
    last_name: 'Lead',
  },
  {
    email: 'l2@vms.com',
    role: ROLES.MANAGER,
    first_name: 'L2',
    last_name: 'Account Manager',
  },
  {
    email: 'manager@vms.com',
    role: ROLES.MANAGER,
    first_name: 'Account',
    last_name: 'Manager',
  },
  {
    // Backend workflow uses FINANCE_HEAD as the final approval.
    // Your requested "L3 Senior Approver" maps to FINANCE_HEAD.
    email: 'l3@vms.com',
    role: ROLES.FINANCE_HEAD,
    first_name: 'L3',
    last_name: 'Senior Approver',
  },
  {
    email: 'casemanager@vms.com',
    role: ROLES.CASE_MANAGER,
    first_name: 'Case',
    last_name: 'Manager',
  },
];

const seedDevUsers = async () => {
  const isDev = (process.env.NODE_ENV || 'development') !== 'production';
  if (!isDev) return;

  const isEnabled = process.env.ENABLE_DEV_SEED === 'true' || process.env.SEED_DEV_USERS === 'true';
  if (!isEnabled) return;

  const seedPassword = process.env.DEV_SEED_PASSWORD || process.env.SUPER_ADMIN_PASSWORD;
  if (!seedPassword) {
    console.warn('[seedDevUsers] Skipping development user seed: DEV_SEED_PASSWORD or SUPER_ADMIN_PASSWORD is required.');
    return;
  }

  const hashedPassword = await bcrypt.hash(seedPassword, 10);

  for (const u of DEV_USERS) {
    try {
      console.log('[seedDevUsers] checking existing user for', u.email);
      const existing = await withDatabaseRetry(
        `seedDevUsers.findSeedUserByEmail(${u.email})`,
        () => userRepository.findSeedUserByEmail(u.email)
      );

      if (existing) {
        // Keep existing user data stable.
        continue;
      }

      const now = new Date();

      await withDatabaseRetry(
        `seedDevUsers.createUser(${u.email})`,
        () => userRepository.createUser({
          [UserEntity.columns.EMAIL]: u.email,
          [UserEntity.columns.PASSWORD]: hashedPassword,
          [UserEntity.columns.ROLE]: u.role,
          [UserEntity.columns.FIRST_NAME]: u.first_name,
          [UserEntity.columns.LAST_NAME]: u.last_name,
          [UserEntity.columns.STATUS]: USER_ACCOUNT_STATUS.ACTIVE,
          [UserEntity.columns.ACTIVATED_AT]: now,
          [UserEntity.columns.PASSWORD_SET_AT]: now,
        })
      );

      console.log(`[seedDevUsers] Created dev user ${u.email} (${u.role})`);
    } catch (e) {
      console.error('[seedDevUsers] Failed for', u.email, toSafeErrorLog(e));
      throw e;
    }
  }
};

export default seedDevUsers;

