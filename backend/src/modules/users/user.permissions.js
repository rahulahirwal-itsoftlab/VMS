import { PERMISSION_KEYS } from '../auth/role-permissions.js';

/**
 * Permission mapping for the User Management module.
 */
export const USER_PERMISSIONS = {
  MANAGE: [PERMISSION_KEYS.MANAGE_USERS],
  DELETE: [PERMISSION_KEYS.DELETE_USERS],
  DEACTIVATE: [PERMISSION_KEYS.DEACTIVATE_USERS],
  RESTORE: [PERMISSION_KEYS.RESTORE_USERS],
};
