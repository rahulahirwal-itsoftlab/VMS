import { ROLES } from '../../zodSchema/index.js';
import { USER_PERMISSIONS } from '../users/user.permissions.js';

/**
 * RBAC Permissions for the Authentication module.
 * All roles that are active in the system have access to profile & auth routes.
 */
const ALL_ACTIVE_ROLES = Object.values(ROLES);

export const PERMISSIONS = {
  AUTH: {
    GET_PROFILE:     ALL_ACTIVE_ROLES,
    CHANGE_PASSWORD: ALL_ACTIVE_ROLES,
    LOGOUT:          ALL_ACTIVE_ROLES,
  },
  USER: USER_PERMISSIONS,
  ADMIN: {
    ALL: [ROLES.SUPER_ADMIN],
  },
};

export default PERMISSIONS;