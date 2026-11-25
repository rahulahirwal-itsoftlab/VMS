import { verifyAccessToken } from '../utils/jwt.js';
import ApiError from '../utils/ApiError.js';
import { AUTH_MESSAGES } from '../modules/auth/auth.constants.js';
import { UserEntity } from '../zodSchema/index.js';
import prisma from '../config/prisma.js';
import { getPermissionsForRole } from '../modules/auth/role-permissions.js';
import { withDatabaseRetry } from '../utils/dbRetry.js';

const authError = (statusCode, message, code) => {
  const error = new ApiError(statusCode, message);
  error.code = code;
  return error;
};

/**
 * Middleware to protect routes by verifying a JWT access token.
 *
 * - Reads the Bearer token from the Authorization header.
 * - Verifies the JWT signature and expiry.
 * - Fetches the user record from the database to attach a rich `req.user` object.
 * - Rejects requests where the user is deleted or inactive.
 *
 * req.user shape:
 * {
 *   id: string,
 *   email: string,

/**
 * Middleware to protect routes by verifying a JWT access token.
 *
 * - Reads the Bearer token from the Authorization header.
 * - Verifies the JWT signature and expiry.
 * - Fetches the user record from the database to attach a rich `req.user` object.
 * - Rejects requests where the user is deleted or inactive.
 *
 * req.user shape:
 * {
 *   id: string,
 *   email: string,
 *   role: string,
 *   first_name: string | null,
 *   last_name: string | null,
 *   is_active: boolean,
 * }
 */
export const protect = async (req, res, next) => {
  try {
    let token = null;
    const authHeader = req.headers.authorization;

    if (authHeader && authHeader.startsWith('Bearer ')) {
      token = authHeader.split(' ')[1];
    } else if (req.cookies && req.cookies.vms_access_token) {
      token = req.cookies.vms_access_token;
    }

    if (!token) {
      throw authError(401, AUTH_MESSAGES.UNAUTHORIZED, 'UNAUTHENTICATED');
    }

    const decoded = verifyAccessToken(token);

    if (!decoded) {
      throw authError(401, AUTH_MESSAGES.TOKEN_EXPIRED, 'TOKEN_EXPIRED');
    }
    const userId = decoded[UserEntity.columns.ID];

    // Fetch fresh user data from DB on every request for security and completeness.
    const user = await withDatabaseRetry('auth user lookup', () => prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        role: true,
        first_name: true,
        last_name: true,
        status: true,
        deleted_at: true,
        must_change_password: true,
        org_id: true,
        org: {
          select: {
            id: true,
            name: true,
            code: true,
            is_active: true,
            deleted_at: true,
          },
        },
      },
    }), { attempts: 5, baseDelayMs: 500, maxDelayMs: 3000 });

    if (!user || user.deleted_at !== null) { 
      throw authError(401, AUTH_MESSAGES.UNAUTHORIZED, 'UNAUTHENTICATED');
    }

    if (user.status !== 'ACTIVE') {
      const statusText = user.status ? user.status.toLowerCase() : 'inactive';
      throw new ApiError(403, `Your account is ${statusText}. Please contact an administrator.`);
    }

    if (user.must_change_password) {
      throw new ApiError(403, 'Password change is required before accessing VMS.');
    }

    if (user.org && (!user.org.is_active || user.org.deleted_at !== null)) {
      throw new ApiError(403, 'Your organization account is inactive or disabled. Contact system administration.');
    }

    const defaultOrgId = 'e0a1b2c3-d4e5-4f6a-8b9c-0d1e2f3a4b5c';
    const baseOrgId = user.org_id || decoded?.org_id || decoded?.OrgID || defaultOrgId;
    const requestedOrgId = req.headers['x-org-id'] || req.headers['x-organization-id'];

    // Only SUPER_ADMIN can switch organization via header
    const effectiveOrgId = (user.role === 'SUPER_ADMIN' && requestedOrgId) ? requestedOrgId : baseOrgId;

    // Attach full user and organization context to the request object.
    req.user = {
      id: user.id,
      email: user.email,
      role: user.role,
      permissions: getPermissionsForRole(user.role),
      first_name: user.first_name,
      last_name: user.last_name,
      status: user.status || 'ACTIVE',
      must_change_password: user.must_change_password,
      org_id: effectiveOrgId,
      OrgID: effectiveOrgId,
      org: user.org || { id: effectiveOrgId, name: 'ACRE India Pvt Ltd', code: 'ACRE_INDIA' },
    };

    req.orgId = effectiveOrgId;
    req.OrgID = effectiveOrgId;

    next();
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      next(authError(401, AUTH_MESSAGES.TOKEN_EXPIRED, 'TOKEN_EXPIRED'));
    } else {
      next(error);
    }
  }
};
