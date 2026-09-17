import { UserEntity } from '../zodSchema/index.js';

/**
 * Removes sensitive fields (password, refresh token, etc.) from a user object.
 * @param {object} user - The user object from the database.
 * @returns {object} A new user object without sensitive fields.
 */
export const sanitizeUser = (user) => {
  if (!user) return null;
  const {
    [UserEntity.columns.PASSWORD]: _,
    [UserEntity.columns.REFRESH_TOKEN]: __,
    [UserEntity.columns.PASSWORD_RESET_OTP]: ___,
    [UserEntity.columns.PASSWORD_RESET_OTP_EXPIRES]: ____,
    [UserEntity.columns.ACTIVATION_TOKEN_HASH]: _____,
    ...sanitized
  } = user;
  return sanitized;
};
