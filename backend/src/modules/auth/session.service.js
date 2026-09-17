import prisma from "../../config/prisma.js";
import ApiError from "../../utils/ApiError.js";
import { generateAuthTokens, hashToken, verifyRefreshToken } from "../../utils/jwt.js";
import { AUTH_MESSAGES } from "./auth.constants.js";
import { USER_ACCOUNT_STATUS } from "../users/user-status.constants.js";

const REFRESH_TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

class SessionService {
  /**
   * Creates a new user session and stores the hashed refresh token in the database.
   */
  async createSession({ userId, refreshToken, userAgent = null, ipAddress = null }) {
    const tokenHash = hashToken(refreshToken);
    const expiresAt = new Date(Date.now() + REFRESH_TOKEN_TTL_MS);

    const session = await prisma.userSession.create({
      data: {
        user_id: userId,
        token_hash: tokenHash,
        expires_at: expiresAt,
        user_agent: userAgent,
        ip_address: ipAddress,
      },
    });
    console.log("[AUTH] Login session created");
    return session;
  }

  /**
   * Validates the browser refresh session and issues a new access token.
   */
  async rotateSession({ oldRefreshToken, userAgent = null, ipAddress = null }) {
    if (!oldRefreshToken) {
      console.log("[AUTH] Refresh request missing session token");
      throw new ApiError(401, AUTH_MESSAGES.UNAUTHORIZED);
    }

    const decoded = verifyRefreshToken(oldRefreshToken);
    if (!decoded || !decoded.id) {
      console.log("[AUTH] Refresh session expired");
      throw new ApiError(401, AUTH_MESSAGES.UNAUTHORIZED);
    }

    const oldHash = hashToken(oldRefreshToken);
    const session = await prisma.userSession.findUnique({
      where: { token_hash: oldHash },
      include: { user: true },
    });

    if (!session || !session.user) {
      console.log("[AUTH] Refresh session revoked");
      throw new ApiError(401, AUTH_MESSAGES.UNAUTHORIZED);
    }

    const user = session.user;
    if (user.status !== USER_ACCOUNT_STATUS.ACTIVE || user.deleted_at !== null) {
      console.log("[AUTH] Refresh session rejected for inactive account");
      throw new ApiError(401, AUTH_MESSAGES.UNAUTHORIZED);
    }

    const now = new Date();

    if (session.revoked_at) {
      console.log("[AUTH] Session revoked");
      throw new ApiError(401, 'Session expired or invalidated. Please log in again.');
    }

    console.log("[AUTH] Refresh session validated");

    if (session.expires_at < now) {
      console.log("[AUTH] Session expired");
      throw new ApiError(401, 'Session expired. Please log in again.');
    }

    const { accessToken } = generateAuthTokens(user.id, user.role);

    await prisma.userSession.update({
      where: { id: session.id },
      data: {
        user_agent: userAgent || session.user_agent,
        ip_address: ipAddress || session.ip_address,
        updated_at: now,
      },
    });

    console.log("[AUTH] Access token issued");
    return { accessToken, refreshToken: null, user };
  }

  /**
   * Revokes a specific session by refresh token (used on logout).
   */
  async revokeSessionByToken(refreshToken) {
    if (!refreshToken) return;
    const tokenHash = hashToken(refreshToken);

    await prisma.userSession.updateMany({
      where: {
        token_hash: tokenHash,
        revoked_at: null,
      },
      data: {
        revoked_at: new Date(),
      },
    }).catch(() => {});
    console.log("[AUTH] Session revoked");
  }

  /**
   * Revokes all active sessions for a given user (used on password change / account lock).
   */
  async revokeAllUserSessions(userId) {
    if (!userId) return;
    await prisma.userSession.updateMany({
      where: {
        user_id: userId,
        revoked_at: null,
      },
      data: {
        revoked_at: new Date(),
      },
    }).catch(() => {});
  }
}

export default new SessionService();
