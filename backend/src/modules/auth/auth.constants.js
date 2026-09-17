export { ROLES } from '../../zodSchema/index.js';

/**
 * Authentication and Authorization Constants
 */

export const AUTH_MESSAGES = {
  LOGIN_SUCCESS: 'Login successful.',
  LOGOUT_SUCCESS: 'Logged out successfully.',
  INVALID_CREDENTIALS: 'Invalid email or password.',
  UNAUTHORIZED: 'Please log in to continue.',
  FORBIDDEN: 'You do not have permission to access this resource.',
  PASSWORD_CHANGED: 'Password changed successfully.',
  TOKEN_EXPIRED: 'Your session has expired. Please log in again.',
  USER_NOT_FOUND: 'User not found.',
  REFRESH_SUCCESS: 'Token refreshed successfully.',
  FORGOT_PASSWORD_SENT: 'If an account exists with that email, a password reset OTP has been sent.',
  PASSWORD_RESET_SUCCESS: 'Password has been reset successfully.',
  INVALID_RESET_OTP: 'Password reset OTP is invalid or has expired.',
};
