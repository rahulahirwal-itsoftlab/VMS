import bcrypt from 'bcryptjs';
import userRepository from './user.repository.js';
import ApiError from '../../utils/ApiError.js';
import { USER_MESSAGES } from './user.constants.js';
import { UserEntity } from '../../zodSchema/index.js';
import { sanitizeUser } from '../../utils/sanitizeUser.js';
import notificationService from '../notifications/notification.service.js';
import prisma from '../../config/prisma.js';
import { getPermissionsForRole } from '../auth/role-permissions.js';
import { USER_ACCOUNT_STATUS, isAllowedUserAccountStatus } from './user-status.constants.js';
import { ROLE_HIERARCHY } from './user-role-hierarchy.constants.js';
import sendEmail from '../../utils/email.js';

// ─── Role Hierarchy & Access Matrix ──────────────────────────────────────────
/**
 * Enforces hierarchical role checks.
 * - Requester must be active (guaranteed by auth protect middleware).
 * - Non-Super Admin users cannot create or manage SUPER_ADMIN accounts.
 * - Requester cannot assign or manage a target role equal to or higher than their own (except Super Admins).
 */
const checkManageAuthority = (requester, targetUserOrRole, operation = 'manage') => {
  if (!requester || !requester.role) {
    throw new ApiError(401, 'Authentication required');
  }

  const requesterRank = ROLE_HIERARCHY[requester.role] || 0;

  // Determine target role name
  let targetRole;
  if (typeof targetUserOrRole === 'string') {
    targetRole = targetUserOrRole;
  } else if (targetUserOrRole && typeof targetUserOrRole === 'object') {
    targetRole = targetUserOrRole.role;
  }

  const targetRank = ROLE_HIERARCHY[targetRole] || 0;

  // SUPER_ADMIN has full management rights
  if (requester.role === 'SUPER_ADMIN') {
    return true;
  }

  // Non-Super Admins:
  // - Cannot create/manage SUPER_ADMIN
  // - Cannot manage/assign roles equal to or higher than their own
  if (targetRole === 'SUPER_ADMIN' || targetRank >= requesterRank) {
    throw new ApiError(403, `Forbidden: You do not have privilege to ${operation} ${targetRole} accounts.`);
  }

  return true;
};

const DELETE_TARGET_ROLES_BY_REQUESTER_ROLE = {
  SUPER_ADMIN: ['SUPER_ADMIN', 'FINANCE_HEAD', 'MANAGER', 'TEAM_LEAD', 'CASE_MANAGER'],
  FINANCE_HEAD: ['MANAGER', 'TEAM_LEAD', 'CASE_MANAGER'],
};

const checkDeleteAuthority = (requester, targetUser) => {
  checkManageAuthority(requester, targetUser, 'delete');

  const allowedTargetRoles = DELETE_TARGET_ROLES_BY_REQUESTER_ROLE[requester.role] || [];
  if (!allowedTargetRoles.includes(targetUser.role)) {
    throw new ApiError(403, `Forbidden: ${requester.role} cannot delete ${targetUser.role} accounts.`);
  }
};

/**
 * Accidental Lockout Prevention:
 * Blocks operations that deactivate, delete, or strip privileges from the final active SUPER_ADMIN.
 */
const checkLockoutRisk = async (targetUserId, statusCode = 400) => {
  const targetUser = await userRepository.findById(targetUserId);
  if (!targetUser) return;

  if (targetUser.role === 'SUPER_ADMIN' && targetUser.status === USER_ACCOUNT_STATUS.ACTIVE) {
    // Count current active, non-deleted Super Admins
    const activeSuperAdminsCount = await prisma.user.count({
      where: {
        role: 'SUPER_ADMIN',
        status: USER_ACCOUNT_STATUS.ACTIVE,
        deleted_at: null,
      },
    });

    if (activeSuperAdminsCount <= 1) {
      throw new ApiError(statusCode, 'Lockout prevention: Cannot deactivate, delete, or demote the final active Super Admin account.');
    }
  }
};

const normalizeOptionalText = (value) => {
  if (value === undefined) return undefined;
  if (value === null || value === '') return null;
  return String(value).trim();
};

const normalizePhone = (value) => {
  const normalized = normalizeOptionalText(value);
  if (!normalized) return normalized;
  const hasPlus = normalized.startsWith('+');
  const digits = normalized.replace(/\D/g, '');
  return hasPlus ? `+${digits}` : digits;
};

const TEMPORARY_PASSWORD_TTL_MINUTES = Number(process.env.TEMPORARY_PASSWORD_TTL_MINUTES || 1440);

const getFrontendLoginUrl = () =>
  process.env.FRONTEND_LOGIN_URL ||
  (process.env.FRONTEND_URL ? `${process.env.FRONTEND_URL.replace(/\/$/, '')}/login` : 'http://localhost:5173/login');

const formatDateTime = (date) => new Intl.DateTimeFormat('en-IN', {
  dateStyle: 'medium',
  timeStyle: 'short',
  timeZone: process.env.APP_TIMEZONE || 'Asia/Kolkata',
}).format(date);

const buildTemporaryPasswordEmail = ({ user, temporaryPassword, expiresAt }) => {
  const fullName = `${user.first_name || ''} ${user.last_name || ''}`.trim() || user.email;
  const loginUrl = getFrontendLoginUrl();
  const supportContact = process.env.SUPPORT_CONTACT_EMAIL || process.env.SMTP_USER || 'your administrator';
  const expiryText = formatDateTime(expiresAt);

  return {
    subject: 'Your VMS account login credentials',
    text: [
      `Hello ${fullName},`,
      '',
      'Your VMS account has been created.',
      '',
      `Employee ID: ${user.employee_id}`,
      `Role: ${user.role}`,
      `Login email: ${user.email}`,
      `Temporary password: ${temporaryPassword}`,
      '',
      'Login URL:',
      loginUrl,
      '',
      'You must change this temporary password after your first login.',
      `This temporary password expires on ${expiryText}.`,
      '',
      'Do not share these credentials with anyone.',
      `If you did not expect this account, contact ${supportContact}.`,
    ].join('\n'),
    html: `<!DOCTYPE html>
<html>
<body style="margin:0;background:#f8fafc;font-family:Arial,sans-serif;color:#0f172a;">
  <div style="max-width:640px;margin:0 auto;padding:32px;">
    <div style="background:#ffffff;border:1px solid #e2e8f0;border-radius:16px;padding:28px;">
      <h1 style="margin:0 0 8px;color:#2563eb;">Vendor Management System</h1>
      <p>Hello <strong>${fullName}</strong>,</p>
      <p>Your VMS account has been created.</p>
      <div style="background:#f1f5f9;border-radius:12px;padding:16px;margin:20px 0;">
        <p><strong>Employee ID:</strong> ${user.employee_id}</p>
        <p><strong>Role:</strong> ${user.role}</p>
        <p><strong>Login email:</strong> ${user.email}</p>
        <p><strong>Temporary password:</strong> ${temporaryPassword}</p>
      </div>
      <p><strong>Login URL:</strong></p>
      <p><a href="${loginUrl}" style="color:#2563eb;">${loginUrl}</a></p>
      <p>You must change this temporary password after your first login.</p>
      <p><strong>Temporary password expiry:</strong> ${expiryText}</p>
      <div style="background:#fef3c7;border:1px solid #f59e0b;border-radius:12px;padding:14px;margin-top:20px;">
        Do not share these credentials with anyone. If you did not expect this account, contact ${supportContact}.
      </div>
    </div>
  </div>
</body>
</html>`,
  };
};

const sendTemporaryPasswordEmail = async ({ user, temporaryPassword, expiresAt }) => {
  const email = buildTemporaryPasswordEmail({ user, temporaryPassword, expiresAt });
  await sendEmail({
    to: user.email,
    subject: email.subject,
    text: email.text,
    html: email.html,
  });
  return email;
};

/**
 * @class UserService
 * @description Handles user profile business rules, encryption, lockout safeguards, and audit logs.
 */
class UserService {
  /**
   * Creates a new user.
   */
  async createUser(userData, requester, ipAddress = null, userAgent = null) {
    const {
      email,
      firstName,
      lastName,
      role,
      phone,
      alternatePhone,
      designation,
      branch,
      region,
      password,
    } = userData;

    // Hierarchy rule check
    checkManageAuthority(requester, role, 'create');
    const now = new Date();
    const temporaryPasswordExpiresAt = new Date(Date.now() + TEMPORARY_PASSWORD_TTL_MINUTES * 60 * 1000);
    const hashedPassword = await bcrypt.hash(password, 10);

    const newUser = await prisma.$transaction(async (tx) => {
      const existingUser = await tx.user.findFirst({
        where: { email: email.toLowerCase().trim() },
      });
      if (existingUser) {
        throw new ApiError(409, USER_MESSAGES.EMAIL_ALREADY_EXISTS);
      }

      const user = await tx.user.create({
        data: {
          [UserEntity.columns.EMAIL]: email.toLowerCase().trim(),
          [UserEntity.columns.PASSWORD]: hashedPassword,
          [UserEntity.columns.FIRST_NAME]: firstName.trim(),
          [UserEntity.columns.LAST_NAME]: lastName.trim(),
          [UserEntity.columns.PHONE]: normalizePhone(phone),
          [UserEntity.columns.ALTERNATE_PHONE]: normalizePhone(alternatePhone),
          [UserEntity.columns.DESIGNATION]: normalizeOptionalText(designation),
          [UserEntity.columns.BRANCH]: normalizeOptionalText(branch),
          [UserEntity.columns.REGION]: normalizeOptionalText(region),
          [UserEntity.columns.ROLE]: role,
          [UserEntity.columns.STATUS]: USER_ACCOUNT_STATUS.ACTIVE,
          [UserEntity.columns.ACTIVATED_AT]: now,
          [UserEntity.columns.MUST_CHANGE_PASSWORD]: true,
          [UserEntity.columns.TEMPORARY_PASSWORD_EXPIRES_AT]: temporaryPasswordExpiresAt,
          [UserEntity.columns.CREDENTIALS_EMAIL_STATUS]: 'PENDING',
        },
      });

      // Write audit log in the same transaction context
      await tx.auditLog.create({
        data: {
          entity_type: 'user',
          entity_id: user.id,
          action: 'user_created',
          to_status: USER_ACCOUNT_STATUS.ACTIVE,
          performed_by_id: requester.id,
          remarks: `User account created with role ${role} by ${requester.email}`,
          new_value: {
            phone: normalizePhone(phone),
            alternate_phone: normalizePhone(alternatePhone),
            designation: normalizeOptionalText(designation),
            branch: normalizeOptionalText(branch),
            region: normalizeOptionalText(region),
          },
          ip_address: ipAddress,
          user_agent: userAgent,
        },
      });

      await tx.auditLog.create({
        data: {
          entity_type: 'user',
          entity_id: user.id,
          action: 'temporary_credentials_created',
          performed_by_id: requester.id,
          remarks: `Temporary login credentials created for ${user.email}`,
          ip_address: ipAddress,
          user_agent: userAgent,
        },
      });

      return user;
    });

    notificationService.notifyUserCreated(requester.id, newUser).catch(() => {});
    notificationService.createNotification(
      newUser.id,
      'password_change_required',
      'Password change required',
      'Your account was created with a temporary password. Change it after your first login.',
      'user',
      newUser.id
    ).catch(() => {});

    // Dispatch temporary credentials email asynchronously in background so user creation completes instantly
    (async () => {
      try {
        await sendTemporaryPasswordEmail({
          user: newUser,
          temporaryPassword: password,
          expiresAt: temporaryPasswordExpiresAt,
        });

        try {
          const sentAt = new Date();
          await userRepository.updateUser(newUser.id, {
            [UserEntity.columns.CREDENTIALS_EMAIL_STATUS]: 'SENT',
            [UserEntity.columns.CREDENTIALS_EMAIL_SENT_AT]: sentAt,
          });
          await prisma.auditLog.create({
            data: {
              entity_type: 'user',
              entity_id: newUser.id,
              action: 'temporary_credentials_email_sent',
              performed_by_id: requester.id,
              remarks: `Temporary credentials email sent to ${newUser.email}`,
              ip_address: ipAddress,
              user_agent: userAgent,
            },
          });
        } catch {
          // Non-fatal after user transaction commit.
        }
        notificationService.notifyCredentialEmailSent(requester.id, newUser).catch(() => {});
      } catch {
        try {
          await userRepository.updateUser(newUser.id, {
            [UserEntity.columns.CREDENTIALS_EMAIL_STATUS]: 'FAILED',
          });
          await prisma.auditLog.create({
            data: {
              entity_type: 'user',
              entity_id: newUser.id,
              action: 'temporary_credentials_email_failed',
              performed_by_id: requester.id,
              remarks: 'Temporary credentials email failed.',
              ip_address: ipAddress,
              user_agent: userAgent,
            },
          });
        } catch {
          // Non-fatal after user transaction commit.
        }
        notificationService.notifyCredentialEmailFailed(requester.id, newUser).catch(() => {});
      }
    })().catch(() => {});

    return sanitizeUser(newUser);
  }

  /**
   * Retrieves a list of users with pagination and filtering.
   */
  async searchUsers(query) {
    return await userRepository.findAll(query);
  }

  /**
   * Retrieves a single user by their ID.
   */
  async getUserById(userId) {
    const user = await userRepository.findById(userId);
    if (!user) {
      throw new ApiError(404, USER_MESSAGES.USER_NOT_FOUND);
    }
    
    // Query audit history for user details view
    const auditHistory = await prisma.auditLog.findMany({
      where: {
        OR: [
          { entity_type: 'user', entity_id: userId },
          { performed_by_id: userId }
        ]
      },
      orderBy: { created_at: 'desc' },
      take: 15,
      select: {
        id: true,
        action: true,
        entity_type: true,
        entity_id: true,
        from_status: true,
        to_status: true,
        remarks: true,
        created_at: true,
        ip_address: true,
        performed_by: {
          select: {
            employee_id: true,
            first_name: true,
            last_name: true,
            email: true,
          }
        }
      }
    });

    const sanitized = sanitizeUser(user);
    sanitized.auditHistory = auditHistory;
    sanitized.permissions = getPermissionsForRole(user.role);
    return sanitized;
  }

  /**
   * Updates a user's information.
   */
  async updateUser(userId, updateData, requester, ipAddress = null, userAgent = null) {
    const targetUser = await userRepository.findById(userId);
    if (!targetUser) {
      throw new ApiError(404, USER_MESSAGES.USER_NOT_FOUND);
    }

    // Hierarchy check on current target user state
    checkManageAuthority(requester, targetUser, 'update');

    // Prevent self role-modification
    if (requester.id === userId && updateData.role !== undefined && updateData.role !== targetUser.role) {
      throw new ApiError(400, 'You cannot change your own role.');
    }

    // Hierarchy check on new target role being assigned
    if (updateData.role !== undefined) {
      checkManageAuthority(requester, updateData.role, 'assign');

      // If target user is a SUPER_ADMIN and we are stripping/changing their role, check lockout risk
      if (targetUser.role === 'SUPER_ADMIN' && updateData.role !== 'SUPER_ADMIN') {
        await checkLockoutRisk(userId);
      }
    }

    // Validate duplicate email excluding the current user account
    if (updateData.email !== undefined && updateData.email.toLowerCase().trim() !== targetUser.email.toLowerCase()) {
      const emailExists = await userRepository.findByEmail(updateData.email.toLowerCase().trim());
      if (emailExists) {
        throw new ApiError(409, USER_MESSAGES.EMAIL_ALREADY_EXISTS);
      }
    }

    const mappedUpdateData = {};
    if (updateData.email !== undefined) {
      mappedUpdateData[UserEntity.columns.EMAIL] = updateData.email.toLowerCase().trim();
    }
    if (updateData.firstName !== undefined) {
      mappedUpdateData[UserEntity.columns.FIRST_NAME] = updateData.firstName.trim();
    }
    if (updateData.lastName !== undefined) {
      mappedUpdateData[UserEntity.columns.LAST_NAME] = updateData.lastName.trim();
    }
    if (updateData.phone !== undefined) {
      mappedUpdateData[UserEntity.columns.PHONE] = normalizePhone(updateData.phone);
    }
    if (updateData.alternatePhone !== undefined) {
      mappedUpdateData[UserEntity.columns.ALTERNATE_PHONE] = normalizePhone(updateData.alternatePhone);
    }
    if (updateData.designation !== undefined) {
      mappedUpdateData[UserEntity.columns.DESIGNATION] = normalizeOptionalText(updateData.designation);
    }
    if (updateData.branch !== undefined) {
      mappedUpdateData[UserEntity.columns.BRANCH] = normalizeOptionalText(updateData.branch);
    }
    if (updateData.region !== undefined) {
      mappedUpdateData[UserEntity.columns.REGION] = normalizeOptionalText(updateData.region);
    }
    const nextPhone = mappedUpdateData[UserEntity.columns.PHONE] !== undefined
      ? mappedUpdateData[UserEntity.columns.PHONE]
      : targetUser.phone;
    const nextAlternatePhone = mappedUpdateData[UserEntity.columns.ALTERNATE_PHONE] !== undefined
      ? mappedUpdateData[UserEntity.columns.ALTERNATE_PHONE]
      : targetUser.alternate_phone;
    if (nextPhone && nextAlternatePhone && nextPhone === nextAlternatePhone) {
      throw new ApiError(400, 'Alternate phone must be different from phone.');
    }
    if (updateData.role !== undefined) {
      mappedUpdateData[UserEntity.columns.ROLE] = updateData.role;
    }

    const updatedUser = await userRepository.updateUser(userId, mappedUpdateData);

    // Write audit log with clean sanitized values
    await prisma.auditLog.create({
      data: {
        entity_type: 'user',
        entity_id: userId,
        action: 'user_updated',
        performed_by_id: requester.id,
        remarks: `User details updated. Changed fields: ${Object.keys(mappedUpdateData).join(', ')}`,
        ip_address: ipAddress,
        user_agent: userAgent,
        old_value: sanitizeUser(targetUser),
        new_value: sanitizeUser(updatedUser),
      },
    });

    return sanitizeUser(updatedUser);
  }

  /**
   * Deletes a user (soft delete).
   */
  async deleteUser(userId, requester, ipAddress = null, userAgent = null) {
    const targetUser = await userRepository.findById(userId);
    if (!targetUser) {
      throw new ApiError(404, USER_MESSAGES.USER_NOT_FOUND);
    }

    // Hierarchy and explicit target-role allowlist checks.
    checkDeleteAuthority(requester, targetUser);

    // Prevent self-deletion
    if (requester.id === userId) {
      throw new ApiError(409, 'Self-deletion is forbidden.');
    }

    // Lockout protection check
    await checkLockoutRisk(userId, 409);

    const deletedAt = new Date();
    const deletedUser = await prisma.$transaction(async (tx) => {
      const currentTarget = await tx.user.findFirst({
        where: {
          [UserEntity.columns.ID]: userId,
          [UserEntity.columns.DELETED_AT]: null,
        },
      });

      if (!currentTarget) {
        throw new ApiError(404, USER_MESSAGES.USER_NOT_FOUND);
      }

      const updatedUser = await userRepository.softDeleteUser(userId, {
        tx,
        deletedById: requester.id,
        deletedAt,
      });

      await tx.auditLog.create({
        data: {
          entity_type: 'user',
          entity_id: userId,
          action: 'user_deleted',
          from_status: targetUser.status,
          to_status: USER_ACCOUNT_STATUS.DEACTIVATED,
          performed_by_id: requester.id,
          remarks: `User soft-deleted, deactivated, and sessions revoked by ${requester.email}`,
          old_value: sanitizeUser(targetUser),
          new_value: sanitizeUser(updatedUser), 
          ip_address: ipAddress,
          user_agent: userAgent,
        },
      });

      return updatedUser;
    });

    return {
      message: USER_MESSAGES.USER_DELETED,
      user: sanitizeUser(deletedUser),
    };
  }

  /**
   * Restores a soft-deleted user.
   */
  async restoreUser(userId, requester, ipAddress = null, userAgent = null) {
    const targetUser = await userRepository.findAnyById(userId);
    if (!targetUser) {
      throw new ApiError(404, USER_MESSAGES.USER_NOT_FOUND);
    }
    if (!targetUser.deleted_at) {
      throw new ApiError(400, 'User account is not deleted.');
    }

    // Resolve original email
    const originalEmail = targetUser.email.includes('_deleted_')
      ? targetUser.email.split('_deleted_')[0]
      : targetUser.email;

    // Check if email already exists in active records
    const emailExists = await userRepository.findByEmail(originalEmail);
    if (emailExists) {
      throw new ApiError(409, 'Cannot restore user. The email address is already in use by another active account.');
    }

    // Hierarchy check
    checkManageAuthority(requester, targetUser, 'restore');

    const restoredUser = await userRepository.restoreUser(userId, originalEmail);

    // Write audit log
    await prisma.auditLog.create({
      data: {
        entity_type: 'user',
        entity_id: userId,
        action: 'user_restored',
        from_status: USER_ACCOUNT_STATUS.DEACTIVATED,
        to_status: USER_ACCOUNT_STATUS.ACTIVE,
        performed_by_id: requester.id,
        remarks: `User account restored with email ${originalEmail} by ${requester.email}`,
        ip_address: ipAddress,
        user_agent: userAgent,
      },
    });

    return sanitizeUser(restoredUser);
  }

  /**
   * Updates the status of a user.
   */
  async updateUserStatus(userId, newStatus, updater, remarks = null, ipAddress = null, userAgent = null) {
    if (!isAllowedUserAccountStatus(newStatus)) {
      throw new ApiError(400, 'User status must be ACTIVE or INACTIVE.');
    }

    const user = await userRepository.findById(userId);
    if (!user) {
      throw new ApiError(404, USER_MESSAGES.USER_NOT_FOUND);
    }
    if (user.deleted_at) {
      throw new ApiError(400, 'Cannot update status of a deleted user.');
    }

    // Hierarchy check
    checkManageAuthority(updater, user, 'change status of');

    // Prevent self-deactivation
    if (updater.id === userId && newStatus !== USER_ACCOUNT_STATUS.ACTIVE) {
      throw new ApiError(400, 'Self-deactivation is forbidden.');
    }

    const oldStatus = user.status || USER_ACCOUNT_STATUS.ACTIVE;
    if (oldStatus === newStatus) {
      throw new ApiError(400, `User status is already ${newStatus}.`);
    }

    // Lockout protection check on deactivation
    if (newStatus !== USER_ACCOUNT_STATUS.ACTIVE) {
      await checkLockoutRisk(userId);
    }

    const statusData = {
      [UserEntity.columns.STATUS]: newStatus,
      [UserEntity.columns.STATUS_CHANGED_AT]: new Date(),
      [UserEntity.columns.STATUS_CHANGED_BY]: updater.email,
      [UserEntity.columns.UPDATED_BY]: updater.email,
    };

    const auditLogData = {
      entity_type: 'user',
      entity_id: userId,
      action: 'status_updated',
      from_status: oldStatus,
      to_status: newStatus,
      performed_by_id: updater.id,
      remarks: remarks || `Status changed from ${oldStatus} to ${newStatus} by ${updater.email}`,
      ip_address: ipAddress,
      user_agent: userAgent,
    };

    const updatedUser = await userRepository.updateUserStatus(userId, statusData, auditLogData);

    // Send in-app notification to the updated user
    await notificationService.createNotification(
      userId,
      'user_status_changed',
      'Account Status Updated',
      `Your account status has been updated to ${newStatus} by ${updater.first_name || ''} ${updater.last_name || ''}`.trim()
    );

    return sanitizeUser(updatedUser);
  }

  /**
   * Resets a user's password by an admin.
   */
  async adminResetPassword(userId, newPassword, requester, ipAddress = null, userAgent = null) {
    const targetUser = await userRepository.findById(userId);
    if (!targetUser) {
      throw new ApiError(404, USER_MESSAGES.USER_NOT_FOUND);
    }

    // Hierarchy check
    checkManageAuthority(requester, targetUser, 'reset password of');

    const hashedPassword = await bcrypt.hash(newPassword, 10);

    await userRepository.updateUser(userId, {
      [UserEntity.columns.PASSWORD]: hashedPassword,
      [UserEntity.columns.PASSWORD_RESET_OTP]: null,
      [UserEntity.columns.PASSWORD_RESET_OTP_EXPIRES]: null,
    });

    // Write audit log
    await prisma.auditLog.create({
      data: {
        entity_type: 'user',
        entity_id: userId,
        action: 'password_reset',
        performed_by_id: requester.id,
        remarks: `Password reset by ${requester.email}`,
        ip_address: ipAddress,
        user_agent: userAgent,
      },
    });

    return USER_MESSAGES.PASSWORD_RESET_SUCCESS;
  }

  async resendCredentials(userId, password, requester, ipAddress = null, userAgent = null) {
    const targetUser = await userRepository.findById(userId);
    if (!targetUser) {
      throw new ApiError(404, USER_MESSAGES.USER_NOT_FOUND);
    }

    checkManageAuthority(requester, targetUser, 'resend credentials for');

    const temporaryPasswordExpiresAt = new Date(Date.now() + TEMPORARY_PASSWORD_TTL_MINUTES * 60 * 1000);
    const hashedPassword = await bcrypt.hash(password, 10);

    const updatedUser = await userRepository.updateUser(userId, {
      [UserEntity.columns.PASSWORD]: hashedPassword,
      [UserEntity.columns.MUST_CHANGE_PASSWORD]: true,
      [UserEntity.columns.TEMPORARY_PASSWORD_EXPIRES_AT]: temporaryPasswordExpiresAt,
      [UserEntity.columns.PASSWORD_CHANGED_AT]: null,
      [UserEntity.columns.REFRESH_TOKEN]: null,
      [UserEntity.columns.CREDENTIALS_EMAIL_STATUS]: 'PENDING',
      [UserEntity.columns.ACTIVATED_AT]: targetUser.activated_at || new Date(),
    });

    try {
      await sendTemporaryPasswordEmail({
        user: updatedUser,
        temporaryPassword: password,
        expiresAt: temporaryPasswordExpiresAt,
      });

      const sentAt = new Date();
      const sentUser = await userRepository.updateUser(userId, {
        [UserEntity.columns.CREDENTIALS_EMAIL_STATUS]: 'SENT',
        [UserEntity.columns.CREDENTIALS_EMAIL_SENT_AT]: sentAt,
      });

      await prisma.auditLog.create({
        data: {
          entity_type: 'user',
          entity_id: userId,
          action: 'temporary_credentials_resent',
          performed_by_id: requester.id,
          remarks: `Temporary credentials resent to ${targetUser.email}`,
          ip_address: ipAddress,
          user_agent: userAgent,
        },
      });

      notificationService.createNotification(
        requester.id,
        'user_credential_email_sent',
        'Credentials resent',
        `Temporary credentials were resent to ${targetUser.email}.`,
        'user',
        userId
      ).catch(() => {});

      return {
        message: 'Temporary credentials resent successfully.',
        credentialsEmailStatus: 'SENT',
        user: sanitizeUser(sentUser),
      };
    } catch {
      await userRepository.updateUser(userId, {
        [UserEntity.columns.CREDENTIALS_EMAIL_STATUS]: 'FAILED',
      });

      await prisma.auditLog.create({
        data: {
          entity_type: 'user',
          entity_id: userId,
          action: 'temporary_credentials_resend_failed',
          performed_by_id: requester.id,
          remarks: 'Temporary credentials resend email failed.',
          ip_address: ipAddress,
          user_agent: userAgent,
        },
      });

      notificationService.createNotification(
        requester.id,
        'user_credential_email_failed',
        'Credentials email failed',
        `Temporary credentials could not be emailed to ${targetUser.email}.`,
        'user',
        userId
      ).catch(() => {});

      return {
        message: 'User credentials were updated, but email delivery failed.',
        credentialsEmailStatus: 'FAILED',
        user: sanitizeUser(updatedUser),
      };
    }
  }
}

export default new UserService();
