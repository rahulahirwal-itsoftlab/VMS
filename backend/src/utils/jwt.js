import crypto from 'node:crypto';
import jwt from 'jsonwebtoken';
import { UserEntity } from '../zodSchema/index.js';
import { getPermissionsForRole } from '../modules/auth/role-permissions.js';

// These would typically be loaded from process.env in a production environment
const ACCESS_TOKEN_SECRET = process.env.ACCESS_TOKEN_SECRET || 'vms_access_secret_key_2024';
const REFRESH_TOKEN_SECRET = process.env.REFRESH_TOKEN_SECRET || 'vms_refresh_secret_key_2024';
const ACCESS_TOKEN_EXPIRY = process.env.ACCESS_TOKEN_EXPIRY || '15m';
const REFRESH_TOKEN_EXPIRY = process.env.REFRESH_TOKEN_EXPIRY || '7d';
const PASSWORD_CHANGE_TOKEN_EXPIRY = process.env.PASSWORD_CHANGE_TOKEN_EXPIRY || '15m';
const PASSWORD_CHANGE_PURPOSE = 'PASSWORD_CHANGE_REQUIRED';

/**
 * Computes SHA-256 hash of a raw token for secure database storage.
 * @param {string} token
 * @returns {string} hex digest hash
 */
export const hashToken = (token) => {
  if (!token || typeof token !== 'string') return '';
  return crypto.createHash('sha256').update(token).digest('hex');
};


/**
 * Generates both Access and Refresh tokens for a user.
 * @param {string} userId - Unique identifier for the user.
 * @param {string} role - User role for RBAC.
 * @returns {object} Object containing accessToken and refreshToken.
 */
export const generateAuthTokens = (userId, role) => {
  const idField = UserEntity.columns.ID;
  const roleField = UserEntity.columns.ROLE;
  const permissions = getPermissionsForRole(role);

  const accessToken = jwt.sign(
    { [idField]: userId, [roleField]: role, permissions },
    ACCESS_TOKEN_SECRET,
    { expiresIn: ACCESS_TOKEN_EXPIRY },
  );

  const refreshToken = jwt.sign({ [idField]: userId }, REFRESH_TOKEN_SECRET, {
    expiresIn: REFRESH_TOKEN_EXPIRY,
  });

  return { accessToken, refreshToken };
};

/**
 * Verifies an access token.
 * @param {string} token - JWT access token.
 * @returns {object|null} Decoded payload or null if invalid.
 */
export const verifyAccessToken = (token) => {
  try {
    return jwt.verify(token, ACCESS_TOKEN_SECRET);
  } catch (error) {
    return null;
  }
};

/**
 * Verifies a refresh token.
 * @param {string} token - JWT refresh token.
 * @returns {object|null} Decoded payload or null if invalid.
 */
export const verifyRefreshToken = (token) => {
  try {
    return jwt.verify(token, REFRESH_TOKEN_SECRET);
  } catch (error) {
    return null;
  }
};

export const generatePasswordChangeToken = (userId) => {
  const idField = UserEntity.columns.ID;
  return jwt.sign(
    { [idField]: userId, purpose: PASSWORD_CHANGE_PURPOSE },
    ACCESS_TOKEN_SECRET,
    { expiresIn: PASSWORD_CHANGE_TOKEN_EXPIRY },
  );
};

export const verifyPasswordChangeToken = (token) => {
  try {
    const decoded = jwt.verify(token, ACCESS_TOKEN_SECRET);
    return decoded?.purpose === PASSWORD_CHANGE_PURPOSE ? decoded : null;
  } catch {
    return null;
  }
};
