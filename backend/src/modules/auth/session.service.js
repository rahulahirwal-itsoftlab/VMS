import prisma from "../../config/prisma.js";
import ApiError from "../../utils/ApiError.js";
import { generateAuthTokens, hashToken, verifyRefreshToken } from "../../utils/jwt.js";
import { AUTH_MESSAGES } from "./auth.constants.js";
import { USER_ACCOUNT_STATUS } from "../users/user-status.constants.js";

const REFRESH_TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

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
   * Validates the browser refresh session and issues a new access token and refresh token (sliding expiration).
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
    const now = new Date();

    let session = await prisma.userSession.findUnique({
      where: { token_hash: oldHash },
      include: { user: true },
    });

    // Multi-tab grace period: if another tab refreshed the token within the last 45 seconds
    if (!session) {
      const recentSession = await prisma.userSession.findFirst({
        where: {
          user_id: decoded.id,
          revoked_at: null,
          updated_at: { gte: new Date(now.getTime() - 45 * 1000) },
        },
        include: { user: true },
        orderBy: { updated_at: 'desc' },
      });

      if (
        recentSession &&
        recentSession.user &&
        recentSession.user.status === USER_ACCOUNT_STATUS.ACTIVE &&
        !recentSession.user.deleted_at &&
        recentSession.expires_at > now
      ) {
        console.log("[AUTH] Refresh request matched recent active session within grace period");
        const { accessToken, refreshToken: newRefreshToken } = generateAuthTokens(
          recentSession.user.id,
          recentSession.user.role,
        );
        return { accessToken, refreshToken: newRefreshToken, user: recentSession.user };
      }

      console.log("[AUTH] Refresh session revoked or not found");
      throw new ApiError(401, AUTH_MESSAGES.UNAUTHORIZED);
    }

    const user = session.user;
    if (user.status !== USER_ACCOUNT_STATUS.ACTIVE || user.deleted_at !== null) {
      console.log("[AUTH] Refresh session rejected for inactive account");
      throw new ApiError(401, AUTH_MESSAGES.UNAUTHORIZED);
    }

    if (session.revoked_at) {
      console.log("[AUTH] Session revoked");
      throw new ApiError(401, 'Session expired or invalidated. Please log in again.');
    }

    if (session.expires_at < now) {
      console.log("[AUTH] Session expired");
      throw new ApiError(401, 'Session expired. Please log in again.');
    }

    const { accessToken, refreshToken: newRefreshToken } = generateAuthTokens(user.id, user.role);
    const newHash = hashToken(newRefreshToken);
    const newExpiresAt = new Date(now.getTime() + REFRESH_TOKEN_TTL_MS);

    await prisma.userSession.update({
      where: { id: session.id },
      data: {
        token_hash: newHash,
        expires_at: newExpiresAt,
        user_agent: userAgent || session.user_agent,
        ip_address: ipAddress || session.ip_address,
        updated_at: now,
      },
    });

    await prisma.user.update({
      where: { id: user.id },
      data: { refresh_token: newRefreshToken },
    }).catch(() => {});

    console.log("[AUTH] Sliding session window extended & tokens renewed");
    return { accessToken, refreshToken: newRefreshToken, user };
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
