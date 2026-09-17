import crypto from "node:crypto";
import bcrypt from "bcryptjs";
import userRepository from "../users/user.repository.js";
import {
  generateAuthTokens,
  generatePasswordChangeToken,
  verifyPasswordChangeToken,
  verifyRefreshToken,
} from "../../utils/jwt.js";
import { AUTH_MESSAGES } from "./auth.constants.js";
import ApiError from "../../utils/ApiError.js";
import { UserEntity } from "../../zodSchema/index.js";
import sendEmail from "../../utils/email.js";
import { sanitizeUser } from "../../utils/sanitizeUser.js";
import { attachPermissions } from "./role-permissions.js";
import prisma from "../../config/prisma.js";
import { USER_ACCOUNT_STATUS } from "../users/user-status.constants.js";
import {
  ACTIVATION_RESEND_COOLDOWN_MINUTES,
  ACTIVATION_TOKEN_TTL_MINUTES,
  generateActivationToken,
  hashActivationToken,
  sendActivationEmail,
} from "./onboarding.service.js";
import notificationService from "../notifications/notification.service.js";
import sessionService from "./session.service.js";

const GENERIC_ACTIVATION_MESSAGE = 'If the account is eligible, an activation email has been sent.';
const MAX_FAILED_LOGIN_ATTEMPTS = Number(process.env.MAX_FAILED_LOGIN_ATTEMPTS || 5);
const LOGIN_LOCK_MINUTES = Number(process.env.LOGIN_LOCK_MINUTES || 15);

const isActiveAccount = (user) =>
  user?.status === USER_ACCOUNT_STATUS.ACTIVE && !user.deleted_at;

const isActivationValid = (user) => {
  if (!user) return { valid: false, reason: 'invalid' };
  if (user.activation_token_used_at || user.password_set_at || user.activated_at) {
    return { valid: false, reason: 'used' };
  }
  if (!user.activation_token_hash) return { valid: false, reason: 'invalid' };
  if (!user.activation_token_expires_at || user.activation_token_expires_at < new Date()) {
    return { valid: false, reason: 'expired' };
  }
  if (!isActiveAccount(user)) return { valid: false, reason: 'inactive' };
  return { valid: true, reason: 'valid' };
};

class AuthService {
  /**
   * LOGIN
   */
  async login(email, password, meta = {}) {
    const normalizedEmail = email.toLowerCase().trim();
    const user = await userRepository.findByEmail(normalizedEmail);

    if (!user) {
      throw new ApiError(401, AUTH_MESSAGES.INVALID_CREDENTIALS);
    }

    if (!isActiveAccount(user)) {
      throw new ApiError(401, AUTH_MESSAGES.INVALID_CREDENTIALS);
    }

    if (user.locked_until && user.locked_until > new Date()) {
      throw new ApiError(423, 'Account is temporarily locked. Try again later.');
    }

    if (!user.activated_at && !user.must_change_password) {
      throw new ApiError(403, 'Account activation is required before login.');
    }

    if (!user[UserEntity.columns.PASSWORD]) {
      throw new ApiError(403, 'Account activation is required before login.');
    }

    const passwordField = UserEntity.columns.PASSWORD;

    const isMatch = await bcrypt.compare(password, user[passwordField]);

    if (!isMatch) {
      const failedAttempts = (user.failed_login_attempts || 0) + 1;
      const lockData = failedAttempts >= MAX_FAILED_LOGIN_ATTEMPTS
        ? { [UserEntity.columns.LOCKED_UNTIL]: new Date(Date.now() + LOGIN_LOCK_MINUTES * 60 * 1000) }
        : {};
      await userRepository.updateUser(user[UserEntity.columns.ID], {
        [UserEntity.columns.FAILED_LOGIN_ATTEMPTS]: failedAttempts,
        ...lockData,
      });
      throw new ApiError(401, AUTH_MESSAGES.INVALID_CREDENTIALS);
    }

    if (user.must_change_password) {
      if (!user.temporary_password_expires_at || user.temporary_password_expires_at < new Date()) {
        throw new ApiError(403, 'Temporary password has expired. Contact an administrator for new credentials.');
      }

      await userRepository.updateUser(user[UserEntity.columns.ID], {
        [UserEntity.columns.FAILED_LOGIN_ATTEMPTS]: 0,
        [UserEntity.columns.LOCKED_UNTIL]: null,
      });

      return {
        user: attachPermissions(sanitizeUser(user)),
        requiresPasswordChange: true,
        passwordChangeToken: generatePasswordChangeToken(user[UserEntity.columns.ID]),
      };
    }

    if (!user.password_set_at) {
      throw new ApiError(403, 'Account activation is required before login.');
    }

    const idField = UserEntity.columns.ID;
    const roleField = UserEntity.columns.ROLE;

    const { accessToken, refreshToken } = generateAuthTokens(
      user[idField],
      user[roleField],
    );

    await userRepository.updateUser(user[idField], {
      [UserEntity.columns.REFRESH_TOKEN]: refreshToken,
      [UserEntity.columns.LAST_LOGIN_AT]: new Date(),
      [UserEntity.columns.FAILED_LOGIN_ATTEMPTS]: 0,
      [UserEntity.columns.LOCKED_UNTIL]: null,
    });

    await sessionService.createSession({
      userId: user[idField],
      refreshToken,
      userAgent: meta.userAgent,
      ipAddress: meta.ipAddress,
    });

    await prisma.auditLog.create({
      data: {
        entity_type: 'user',
        entity_id: user[idField],
        action: 'login_success',
        performed_by_id: user[idField],
        remarks: `User logged in with email ${normalizedEmail}`,
      },
    });

    return {
      user: attachPermissions(sanitizeUser(user)),
      accessToken,
      refreshToken,
    };
  }

  async validateActivationToken(token) {
    const tokenHash = hashActivationToken(token);
    const user = await userRepository.findByActivationTokenHash(tokenHash);
    const result = isActivationValid(user);
    if (!result.valid) {
      throw new ApiError(400, `Activation token is ${result.reason}.`);
    }
    return {
      valid: true,
      user: {
        email: user.email,
        firstName: user.first_name,
        lastName: user.last_name,
        employeeId: user.employee_id,
        role: user.role,
      },
      expiresAt: user.activation_token_expires_at,
    };
  }

  async setPassword(token, newPassword) {
    const tokenHash = hashActivationToken(token);
    const user = await userRepository.findByActivationTokenHash(tokenHash);
    const result = isActivationValid(user);
    if (!result.valid) {
      throw new ApiError(400, `Activation token is ${result.reason}.`);
    }

    const hashedPassword = await bcrypt.hash(newPassword, 10);
    const now = new Date();

    const updatedUser = await userRepository.updateUser(user.id, {
      [UserEntity.columns.PASSWORD]: hashedPassword,
      [UserEntity.columns.ACTIVATION_TOKEN_USED_AT]: now,
      [UserEntity.columns.ACTIVATION_TOKEN_HASH]: null,
      [UserEntity.columns.ACTIVATION_TOKEN_EXPIRES_AT]: null,
      [UserEntity.columns.ACTIVATED_AT]: now,
      [UserEntity.columns.PASSWORD_SET_AT]: now,
      [UserEntity.columns.FAILED_LOGIN_ATTEMPTS]: 0,
      [UserEntity.columns.LOCKED_UNTIL]: null,
    });

    await prisma.auditLog.create({
      data: {
        entity_type: 'user',
        entity_id: user.id,
        action: 'account_activated',
        performed_by_id: user.id,
        remarks: 'User completed account activation and password setup.',
      },
    });

    return attachPermissions(sanitizeUser(updatedUser));
  }

  async activateAccount(token, newPassword) {
    return this.setPassword(token, newPassword);
  }

  async resendActivation(email, requester = null, ipAddress = null, userAgent = null) {
    const normalizedEmail = email.toLowerCase().trim();
    const user = await userRepository.findByEmail(normalizedEmail);

    if (!user || !isActiveAccount(user) || user.activated_at || user.password_set_at) {
      return GENERIC_ACTIVATION_MESSAGE;
    }

    if (user.activation_last_sent_at) {
      const nextAllowed = new Date(user.activation_last_sent_at.getTime() + ACTIVATION_RESEND_COOLDOWN_MINUTES * 60 * 1000);
      if (nextAllowed > new Date()) {
        return GENERIC_ACTIVATION_MESSAGE;
      }
    }

    const token = generateActivationToken();
    const now = new Date();
    const expiresAt = new Date(Date.now() + ACTIVATION_TOKEN_TTL_MINUTES * 60 * 1000);
    const updatedUser = await userRepository.updateUser(user.id, {
      [UserEntity.columns.ACTIVATION_TOKEN_HASH]: hashActivationToken(token),
      [UserEntity.columns.ACTIVATION_TOKEN_EXPIRES_AT]: expiresAt,
      [UserEntity.columns.ACTIVATION_TOKEN_USED_AT]: null,
      [UserEntity.columns.ACTIVATION_LAST_SENT_AT]: now,
      [UserEntity.columns.ACTIVATION_SENT_AT]: user.activation_sent_at || now,
      [UserEntity.columns.ACTIVATION_RESEND_COUNT]: (user.activation_resend_count || 0) + 1,
    });

    await sendActivationEmail({ user: updatedUser, creator: requester, token });
    await prisma.auditLog.create({
      data: {
        entity_type: 'user',
        entity_id: user.id,
        action: 'activation_invitation_resent',
        performed_by_id: requester?.id || null,
        remarks: `Activation invitation resent to ${normalizedEmail}`,
        ip_address: ipAddress,
        user_agent: userAgent,
      },
    });

    return GENERIC_ACTIVATION_MESSAGE;
  }

  /**
   * LOGOUT
   */
  async logout(userId, refreshToken = null) {
    const user = await userRepository.findById(userId);

    if (!user) {
      throw new ApiError(404, AUTH_MESSAGES.USER_NOT_FOUND);
    }

    if (refreshToken) {
      await sessionService.revokeSessionByToken(refreshToken);
    } else {
      await sessionService.revokeAllUserSessions(userId);
    }

    await userRepository.updateUser(userId, {
      [UserEntity.columns.REFRESH_TOKEN]: null,
    });

    return AUTH_MESSAGES.LOGOUT_SUCCESS;
  }

  /**
   * REFRESH TOKEN
   */
  async refreshToken(oldRefreshToken, meta = {}) {
    if (!oldRefreshToken) {
      throw new ApiError(401, AUTH_MESSAGES.UNAUTHORIZED);
    }

    return await sessionService.rotateSession({
      oldRefreshToken,
      userAgent: meta.userAgent,
      ipAddress: meta.ipAddress,
    });
  }

  /**
   * GET PROFILE
   */
  async getProfile(userId) {
    const user = await userRepository.findById(userId);

    if (!user) {
      throw new ApiError(404, AUTH_MESSAGES.USER_NOT_FOUND);
    }

    return attachPermissions(sanitizeUser(user));
  }

  /**
   * CHANGE PASSWORD
   */
  async changePassword(userId, oldPassword, newPassword) {
    const user = await userRepository.findById(userId);

    if (!user) {
      throw new ApiError(404, AUTH_MESSAGES.USER_NOT_FOUND);
    }

    const passwordField = UserEntity.columns.PASSWORD;

    const isMatch = await bcrypt.compare(oldPassword, user[passwordField]);

    if (!isMatch) {
      throw new ApiError(401, AUTH_MESSAGES.INVALID_CREDENTIALS);
    }

    const hashedPassword = await bcrypt.hash(newPassword, 10);

    const now = new Date();
    await userRepository.updateUser(userId, {
      [UserEntity.columns.PASSWORD]: hashedPassword,
      [UserEntity.columns.MUST_CHANGE_PASSWORD]: false,
      [UserEntity.columns.TEMPORARY_PASSWORD_EXPIRES_AT]: null,
      [UserEntity.columns.PASSWORD_CHANGED_AT]: now,
      [UserEntity.columns.PASSWORD_SET_AT]: user.password_set_at || now,
    });

    return AUTH_MESSAGES.PASSWORD_CHANGED;
  }

  async completeTemporaryPasswordChange(passwordChangeToken, newPassword) {
    const decoded = verifyPasswordChangeToken(passwordChangeToken);
    if (!decoded?.[UserEntity.columns.ID]) {
      throw new ApiError(401, 'Password change session is invalid or expired.');
    }

    const user = await userRepository.findById(decoded[UserEntity.columns.ID]);
    if (!user || !isActiveAccount(user)) {
      throw new ApiError(401, AUTH_MESSAGES.INVALID_CREDENTIALS);
    }
    if (!user.must_change_password) {
      throw new ApiError(400, 'Password change is not required for this account.');
    }
    if (!user.temporary_password_expires_at || user.temporary_password_expires_at < new Date()) {
      throw new ApiError(403, 'Temporary password has expired. Contact an administrator for new credentials.');
    }

    const reusedTemporaryPassword = await bcrypt.compare(newPassword, user[UserEntity.columns.PASSWORD]);
    if (reusedTemporaryPassword) {
      throw new ApiError(400, 'New password must be different from the temporary password.');
    }

    const now = new Date();
    const hashedPassword = await bcrypt.hash(newPassword, 10);
    const updatedUser = await userRepository.updateUser(user.id, {
      [UserEntity.columns.PASSWORD]: hashedPassword,
      [UserEntity.columns.MUST_CHANGE_PASSWORD]: false,
      [UserEntity.columns.TEMPORARY_PASSWORD_EXPIRES_AT]: null,
      [UserEntity.columns.PASSWORD_CHANGED_AT]: now,
      [UserEntity.columns.PASSWORD_SET_AT]: now,
      [UserEntity.columns.ACTIVATED_AT]: user.activated_at || now,
      [UserEntity.columns.REFRESH_TOKEN]: null,
      [UserEntity.columns.FAILED_LOGIN_ATTEMPTS]: 0,
      [UserEntity.columns.LOCKED_UNTIL]: null,
    });

    const { accessToken, refreshToken } = generateAuthTokens(updatedUser.id, updatedUser.role);
    await userRepository.updateUser(updatedUser.id, {
      [UserEntity.columns.REFRESH_TOKEN]: refreshToken,
      [UserEntity.columns.LAST_LOGIN_AT]: now,
    });

    await sessionService.createSession({
      userId: updatedUser.id,
      refreshToken,
    });

    await prisma.auditLog.create({
      data: {
        entity_type: 'user',
        entity_id: updatedUser.id,
        action: 'temporary_password_changed',
        performed_by_id: updatedUser.id,
        remarks: 'User changed temporary password during first login.',
      },
    });

    notificationService.createNotification(
      updatedUser.id,
      'password_changed',
      'Password changed successfully',
      'Your VMS password was changed successfully.',
      'user',
      updatedUser.id
    ).catch(() => {});

    return {
      user: attachPermissions(sanitizeUser(updatedUser)),
      accessToken,
      refreshToken,
    };
  }

  /**
   * FORGOT PASSWORD
   * - Generates OTP
   * - Saves password_reset_otp + expires
   * - Emails OTP + expiry time + security warning
   */
  /**
   * FORGOT PASSWORD
   * - Step 1: Validate payload & email input
   * - Step 2: Query PostgreSQL database for user account
   * - Step 3: Generate cryptographically secure OTP
   * - Step 4: Store OTP & expiration in PostgreSQL
   * - Step 5: Send OTP email via SMTP
   */
  async forgotPassword(payload) {
    console.log(`[AUTH] ➡️  [Step 1/5] Starting Forgot Password request`);

    const rawEmail = typeof payload === "string" ? payload : payload?.email;

    if (!rawEmail || typeof rawEmail !== "string") {
      console.warn(`[AUTH] ❌ [Step 1/5] Email validation failed: Missing email payload`);
      throw new ApiError(400, "Email address is required.");
    }

    const email = rawEmail.toLowerCase().trim();
    console.log(`[AUTH] ℹ️  [Step 1/5] Email payload validated: ${email}`);

    console.log(`[DATABASE] 🔍 [Step 2/5] Querying PostgreSQL for user email: ${email}`);
    const user = await userRepository.findByEmail(email);

    // Prevent account enumeration by returning generic success if user does not exist or is inactive
    if (!user || !isActiveAccount(user)) {
      console.log(`[AUTH] 🛡️  [Step 2/5] User lookup completed: Account inactive or not found for ${email}`);
      console.log(`[AUTH] ✅ [Step 5/5] Returning generic success response to prevent account enumeration`);
      return AUTH_MESSAGES.FORGOT_PASSWORD_SENT;
    }

    console.log(`[AUTH] ✅ [Step 2/5] User lookup successful (User ID: ${user[UserEntity.columns.ID]}, Role: ${user.role})`);

    // Cryptographically secure 6-digit OTP generation
    console.log(`[OTP] 🔑 [Step 3/5] Generating cryptographically secure 6-digit OTP via crypto.randomInt()...`);
    const resetOtp = crypto.randomInt(100000, 1000000).toString();
    const resetExpires = new Date(Date.now() + 10 * 60 * 1000);
    console.log(`[OTP] ✅ [Step 3/5] Secure OTP generated (Expires at: ${resetExpires.toISOString()})`);

    console.log(`[DATABASE] 💾 [Step 4/5] Updating user record in PostgreSQL with reset OTP...`);
    await userRepository.updateUser(user[UserEntity.columns.ID], {
      [UserEntity.columns.PASSWORD_RESET_OTP]: resetOtp,
      [UserEntity.columns.PASSWORD_RESET_OTP_EXPIRES]: resetExpires,
    });
    console.log(`[DATABASE] ✅ [Step 4/5] OTP and expiration stored in PostgreSQL for user ID: ${user[UserEntity.columns.ID]}`);

    const userName = `${user.first_name || ''} ${user.last_name || ''}`.trim() || 'User';

    const emailHtml = `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8" />
</head>
<body style="background:#f4f6f9;padding:30px;font-family:Arial,sans-serif;">
  <div style="max-width:600px;margin:auto;background:#ffffff;border-radius:10px;padding:35px;box-shadow:0 0 20px rgba(0,0,0,.15);">
    <h2 style="text-align:center;color:#2563eb;">Vendor Management System</h2>

    <p>Hello <b>${userName}</b>,</p>

    <p>Your OTP for resetting your VMS account password is:</p>

    <div style="margin:20px 0;background:#2563eb;color:white;font-size:34px;font-weight:bold;letter-spacing:10px;text-align:center;padding:18px;border-radius:8px;">
      ${resetOtp}
    </div>

    <p>This OTP will expire in 10 minutes.</p>

    <div style="background:#fef3c7;border:1px solid #f59e0b;padding:14px;border-radius:8px;margin-top:14px;">
      <p style="margin:0;font-size:13px;color:#92400e;"><b>Security Warning:</b> If you did not request a password reset, please ignore this email.</p>
    </div>

    <hr style="margin-top:24px;border:none;border-top:1px solid #e2e8f0;" />

    <p style="font-size:12px;color:gray;margin-top:12px;">Regards,<br/>VMS Team</p>
  </div>
</body>
</html>`;

    try {
      console.log(`[EMAIL] 📧 [Step 5/5] Initiating SMTP email dispatch to: ${email}`);
      await sendEmail({
        to: user[UserEntity.columns.EMAIL],
        subject: "Password Reset OTP",
        html: emailHtml,
        text: `Hello ${userName},\n\nYour OTP for resetting your VMS account password is:\n\n${resetOtp}\n\nThis OTP will expire in 10 minutes.\n\nIf you did not request a password reset, please ignore this email.\n\nRegards,\nVMS Team`,
      });
      console.log(`[EMAIL] ✅ [Step 5/5] OTP email sent successfully to ${email}`);
    } catch (emailErr) {
      console.error(`[EMAIL] ❌ [Step 5/5] OTP email dispatch failed for ${email}:`, emailErr?.message || emailErr);
      console.log(`[DATABASE] 🧹 Cleaning up unsent OTP from PostgreSQL user record...`);
      await userRepository.updateUser(user[UserEntity.columns.ID], {
        [UserEntity.columns.PASSWORD_RESET_OTP]: null,
        [UserEntity.columns.PASSWORD_RESET_OTP_EXPIRES]: null,
      }).catch(() => {});
      throw new ApiError(500, "Unable to send OTP at this time. Please try again later.");
    }

    console.log(`[AUTH] 🎉 Forgot password workflow completed successfully for ${email}`);
    return AUTH_MESSAGES.FORGOT_PASSWORD_SENT;
  }

  /**
   * VERIFY OTP
   */
  async verifyOtp(email, otp) {
    console.log(`[AUTH] ➡️  [Verify OTP] Starting OTP verification process`);
    if (!email || typeof email !== "string") {
      throw new ApiError(400, "Email address is required.");
    }

    if (!otp || typeof otp !== "string") {
      throw new ApiError(400, "OTP is required.");
    }

    const normalizedEmail = email.toLowerCase().trim();
    const cleanOtp = otp.trim();

    console.log(`[DATABASE] 🔍 [Verify OTP] Querying PostgreSQL for user reset OTP...`);
    const user = await userRepository.findByResetOtp(normalizedEmail, cleanOtp);

    if (!user) {
      console.warn(`[AUTH] ❌ [Verify OTP] Verification failed: Invalid or non-matching OTP for ${normalizedEmail}`);
      throw new ApiError(400, "Invalid OTP. Please check and try again.");
    }

    const expiryField = UserEntity.columns.PASSWORD_RESET_OTP_EXPIRES;

    if (!user[expiryField] || user[expiryField] < new Date()) {
      console.warn(`[AUTH] ❌ [Verify OTP] Verification failed: OTP expired for ${normalizedEmail}`);
      throw new ApiError(400, "Your OTP has expired. Please request a new OTP.");
    }

    console.log(`[AUTH] ✅ [Verify OTP] OTP verified successfully for user: ${normalizedEmail}`);
    return "OTP verified successfully.";
  }

  /**
   * RESET PASSWORD USING OTP
   */
  async resetPassword(email, otp, newPassword) {
    console.log(`[AUTH] ➡️  [Reset Password] Starting password reset process`);
    if (!email || typeof email !== "string") {
      throw new ApiError(400, "Email address is required.");
    }

    if (!otp || typeof otp !== "string") {
      throw new ApiError(400, "OTP is required.");
    }

    if (!newPassword || typeof newPassword !== "string") {
      throw new ApiError(400, "New password is required.");
    }

    const normalizedEmail = email.toLowerCase().trim();
    const cleanOtp = otp.trim();

    console.log(`[DATABASE] 🔍 [Reset Password] Validating OTP against PostgreSQL database...`);
    const user = await userRepository.findByResetOtp(normalizedEmail, cleanOtp);

    if (!user) {
      console.warn(`[AUTH] ❌ [Reset Password] Reset failed: Invalid OTP for ${normalizedEmail}`);
      throw new ApiError(400, "Invalid OTP. Please check and try again.");
    }

    const expiryField = UserEntity.columns.PASSWORD_RESET_OTP_EXPIRES;

    if (!user[expiryField] || user[expiryField] < new Date()) {
      console.warn(`[AUTH] ❌ [Reset Password] Reset failed: Expired OTP for ${normalizedEmail}`);
      throw new ApiError(400, "Your OTP has expired. Please request a new OTP.");
    }

    console.log(`[AUTH] 🔒 [Reset Password] Hashing new password using bcrypt...`);
    const hashedPassword = await bcrypt.hash(newPassword, 10);
    const now = new Date();

    console.log(`[DATABASE] 💾 [Reset Password] Updating user password and invalidating OTP in PostgreSQL...`);
    await userRepository.updateUser(user[UserEntity.columns.ID], {
      [UserEntity.columns.PASSWORD]: hashedPassword,
      [UserEntity.columns.PASSWORD_RESET_OTP]: null,
      [UserEntity.columns.PASSWORD_RESET_OTP_EXPIRES]: null,
      [UserEntity.columns.MUST_CHANGE_PASSWORD]: false,
      [UserEntity.columns.TEMPORARY_PASSWORD_EXPIRES_AT]: null,
      [UserEntity.columns.PASSWORD_CHANGED_AT]: now,
      [UserEntity.columns.FAILED_LOGIN_ATTEMPTS]: 0,
      [UserEntity.columns.LOCKED_UNTIL]: null,
    });

    console.log(`[AUTH] 🎉 [Reset Password] Password reset successfully for: ${normalizedEmail}`);
    return AUTH_MESSAGES.PASSWORD_RESET_SUCCESS;
  }


  /**
   * ADMIN RESET PASSWORD
   */
  async adminResetPassword(userId, newPassword) {
    const user = await userRepository.findById(userId);

    if (!user) {
      throw new ApiError(404, AUTH_MESSAGES.USER_NOT_FOUND);
    }

    const hashedPassword = await bcrypt.hash(newPassword, 10);

    await userRepository.updateUser(userId, {
      [UserEntity.columns.PASSWORD]: hashedPassword,
      [UserEntity.columns.PASSWORD_RESET_OTP]: null,
      [UserEntity.columns.PASSWORD_RESET_OTP_EXPIRES]: null,
    });

    return AUTH_MESSAGES.PASSWORD_RESET_SUCCESS;
  }
}

export default new AuthService();

