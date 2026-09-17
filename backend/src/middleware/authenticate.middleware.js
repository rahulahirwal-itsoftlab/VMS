import { verifyAccessToken } from '../utils/jwt.js';
import ApiError from '../utils/ApiError.js';
import { AUTH_MESSAGES } from '../modules/auth/auth.constants.js';
import { UserEntity } from '../zodSchema/index.js';

const authError = (statusCode, message, code) => {
  const error = new ApiError(statusCode, message);
  error.code = code;
  return error;
};

/**
 * Middleware to authenticate requests using JWT Access Tokens.
 */
const authenticate = (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw authError(401, AUTH_MESSAGES.UNAUTHORIZED, 'UNAUTHENTICATED');
    }

    const token = authHeader.split(' ')[1];
    const decoded = verifyAccessToken(token);

    if (!decoded) {
      throw authError(401, AUTH_MESSAGES.TOKEN_EXPIRED, 'TOKEN_EXPIRED');
    }

    // Map the dynamic database column keys from the token payload back to a standard req.user structure
    req.user = {
      id: decoded[UserEntity.columns.ID],
      role: decoded[UserEntity.columns.ROLE],
      permissions: decoded.permissions || [],
    };

    next();
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      next(authError(401, AUTH_MESSAGES.TOKEN_EXPIRED, 'TOKEN_EXPIRED'));
      return;
    }
    next(error);
  }
};

export default authenticate;
