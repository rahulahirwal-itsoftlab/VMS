import ApiError from '../utils/ApiError.js';
import { AUTH_MESSAGES } from '../modules/auth/auth.constants.js';

/**
 * Middleware to authorize requests based on user roles or permission keys.
 * @param {Array<string>|string} allowedAccess - Roles or permissions that are permitted to access the route.
 */
const authorize = (allowedAccess) => (req, res, next) => {
  try {
    if (!req.user || !req.user.role) {
      const error = new ApiError(401, AUTH_MESSAGES.UNAUTHORIZED);
      error.code = 'UNAUTHENTICATED';
      throw error;
    }

    const userRole = req.user.role;
    const userPermissions = req.user.permissions || [];
    const allowed = Array.isArray(allowedAccess) ? allowedAccess : [allowedAccess];

    const isAllowed =
      allowed.includes(userRole) ||
      allowed.some((permission) => userPermissions.includes(permission));

    if (!isAllowed) {
      const error = new ApiError(403, AUTH_MESSAGES.FORBIDDEN);
      error.code = 'FORBIDDEN';
      throw error;
    }

    next();
  } catch (error) {
    next(error);
  }
};

export default authorize;
