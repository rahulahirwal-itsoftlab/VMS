import prisma from '../../config/prisma.js';
import { UserEntity } from '../../zodSchema/index.js';
import { USER_ACCOUNT_STATUS } from './user-status.constants.js';
import { withDatabaseRetry } from '../../utils/dbRetry.js';

const AUTH_USER_SELECT = {
  [UserEntity.columns.ID]: true,
  [UserEntity.columns.EMPLOYEE_ID]: true,
  [UserEntity.columns.EMAIL]: true,
  [UserEntity.columns.PASSWORD]: true,
  [UserEntity.columns.ROLE]: true,
  [UserEntity.columns.FIRST_NAME]: true,
  [UserEntity.columns.LAST_NAME]: true,
  [UserEntity.columns.STATUS]: true,
  [UserEntity.columns.DELETED_AT]: true,
  [UserEntity.columns.LAST_LOGIN_AT]: true,
  [UserEntity.columns.REFRESH_TOKEN]: true,
  [UserEntity.columns.ACTIVATION_TOKEN_HASH]: true,
  [UserEntity.columns.ACTIVATION_TOKEN_EXPIRES_AT]: true,
  [UserEntity.columns.ACTIVATION_TOKEN_USED_AT]: true,
  [UserEntity.columns.ACTIVATION_SENT_AT]: true,
  [UserEntity.columns.ACTIVATION_LAST_SENT_AT]: true,
  [UserEntity.columns.ACTIVATION_RESEND_COUNT]: true,
  [UserEntity.columns.ACTIVATED_AT]: true,
  [UserEntity.columns.PASSWORD_SET_AT]: true,
  [UserEntity.columns.MUST_CHANGE_PASSWORD]: true,
  [UserEntity.columns.TEMPORARY_PASSWORD_EXPIRES_AT]: true,
  [UserEntity.columns.PASSWORD_CHANGED_AT]: true,
  [UserEntity.columns.CREDENTIALS_EMAIL_STATUS]: true,
  [UserEntity.columns.CREDENTIALS_EMAIL_SENT_AT]: true,
  [UserEntity.columns.FAILED_LOGIN_ATTEMPTS]: true,
  [UserEntity.columns.LOCKED_UNTIL]: true,
};

class UserRepository {
  /**
   * @class UserRepository
   * @description A data access layer for interacting with the User model in the database.
   */

  sanitizeUpdateData(updateData) {
    if (!updateData || typeof updateData !== 'object' || Array.isArray(updateData)) {
      throw new Error('Update data must be a non-array object');
    }

    const normalizedData = Object.fromEntries(
      Object.entries(updateData).filter(([, value]) => value !== undefined)
    );

    if (Object.keys(normalizedData).length === 0) {
      throw new Error('No valid fields provided for update');
    }

    const validColumns = new Set(Object.values(UserEntity.columns));
    const invalidKeys = Object.keys(normalizedData).filter((key) => !validColumns.has(key));

    if (invalidKeys.length > 0) {
      throw new Error(`Invalid user update field(s): ${invalidKeys.join(', ')}`);
    }

    return normalizedData;
  }

  /**
   * Fetch all users with filters, search, paginated metadata, and column sorting.
   */
  buildListWhere({ search, role, status, branch, region, designation } = {}) {
    return {
      [UserEntity.columns.DELETED_AT]: null,
      ...(role && { [UserEntity.columns.ROLE]: role }),
      ...(status && { [UserEntity.columns.STATUS]: status }),
      ...(branch && { [UserEntity.columns.BRANCH]: { equals: branch, mode: 'insensitive' } }),
      ...(region && { [UserEntity.columns.REGION]: { equals: region, mode: 'insensitive' } }),
      ...(designation && { [UserEntity.columns.DESIGNATION]: { equals: designation, mode: 'insensitive' } }),
      ...(search && {
        OR: [
          { [UserEntity.columns.EMPLOYEE_ID]: { contains: search, mode: 'insensitive' } },
          { [UserEntity.columns.FIRST_NAME]: { contains: search, mode: 'insensitive' } },
          { [UserEntity.columns.LAST_NAME]: { contains: search, mode: 'insensitive' } },
          { [UserEntity.columns.EMAIL]: { contains: search, mode: 'insensitive' } },
          { [UserEntity.columns.PHONE]: { contains: search, mode: 'insensitive' } },
          { [UserEntity.columns.DESIGNATION]: { contains: search, mode: 'insensitive' } },
          { [UserEntity.columns.BRANCH]: { contains: search, mode: 'insensitive' } },
          { [UserEntity.columns.REGION]: { contains: search, mode: 'insensitive' } },
        ],
      }),
    };
  }

  buildSummaryWhere({ search, role, branch, region, designation } = {}) {
    return this.buildListWhere({ search, role, branch, region, designation });
  }

  async getAccountStatusSummary({ search, role, branch, region, designation } = {}) {
    const where = this.buildSummaryWhere({ search, role, branch, region, designation });
    const [activeAccounts, deactivatedAccounts] = await Promise.all([
      prisma.user.count({
        where: {
          ...where,
          [UserEntity.columns.STATUS]: USER_ACCOUNT_STATUS.ACTIVE,
        },
      }),
      prisma.user.count({
        where: {
          ...where,
          [UserEntity.columns.STATUS]: USER_ACCOUNT_STATUS.DEACTIVATED,
        },
      }),
    ]);

    return {
      activeAccounts,
      deactivatedAccounts,
      totalAccounts: activeAccounts + deactivatedAccounts,
    };
  }

  async findAll({ search, role, status, branch, region, designation, page = 1, limit = 10, sortField = 'created_at', sortOrder = 'desc' }) {
    const take = parseInt(limit) || 10;
    const skip = (parseInt(page) - 1) * take;

    const where = this.buildListWhere({ search, role, status, branch, region, designation });

    // Sort column allowlist to guard against SQL injection
    const allowedSortColumns = ['created_at', 'employee_id', 'first_name', 'last_name', 'email', 'role', 'status'];
    const sortColumn = allowedSortColumns.includes(sortField) ? sortField : 'created_at';
    const direction = sortOrder === 'asc' ? 'asc' : 'desc';

    const [users, total, summary] = await Promise.all([
      prisma.user.findMany({
        where,
        skip,
        take,
        orderBy: { [sortColumn]: direction },
        select: {
          [UserEntity.columns.ID]: true,
          [UserEntity.columns.EMPLOYEE_ID]: true,
          [UserEntity.columns.EMAIL]: true,
          [UserEntity.columns.FIRST_NAME]: true,
          [UserEntity.columns.LAST_NAME]: true,
          [UserEntity.columns.PHONE]: true,
          [UserEntity.columns.ALTERNATE_PHONE]: true,
          [UserEntity.columns.DESIGNATION]: true,
          [UserEntity.columns.BRANCH]: true,
          [UserEntity.columns.REGION]: true,
          [UserEntity.columns.ROLE]: true,
          [UserEntity.columns.STATUS]: true,
          [UserEntity.columns.STATUS_CHANGED_AT]: true,
          [UserEntity.columns.STATUS_CHANGED_BY]: true,
          [UserEntity.columns.UPDATED_BY]: true,
          [UserEntity.columns.UPDATED_AT]: true,
          [UserEntity.columns.LAST_LOGIN_AT]: true,
          [UserEntity.columns.MUST_CHANGE_PASSWORD]: true,
          [UserEntity.columns.TEMPORARY_PASSWORD_EXPIRES_AT]: true,
          [UserEntity.columns.PASSWORD_CHANGED_AT]: true,
          [UserEntity.columns.CREDENTIALS_EMAIL_STATUS]: true,
          [UserEntity.columns.CREDENTIALS_EMAIL_SENT_AT]: true,
          [UserEntity.columns.CREATED_AT]: true,
        },
      }),
      prisma.user.count({ where }),
      this.getAccountStatusSummary({ search, role, branch, region, designation }),
    ]);

    const totalPages = Math.ceil(total / take);

    return {
      users,
      pagination: {
        page: parseInt(page),
        pageSize: take,
        totalRecords: total,
        totalPages: totalPages || 1,
      },
      summary,
    };
  }

  /**
   * Find a single user by ID, excluding soft-deleted records.
   */
  async findById(id) {
    return await withDatabaseRetry('UserRepository.findById', () =>
      prisma.user.findFirst({
        where: {
          [UserEntity.columns.ID]: id,
          [UserEntity.columns.DELETED_AT]: null,
        },
      })
    );
  }
  /**
   * Find a single user by ID, including soft-deleted records.
   */
  async findAnyById(id) {
    return await withDatabaseRetry('UserRepository.findAnyById', () =>
      prisma.user.findFirst({
        where: {
          [UserEntity.columns.ID]: id,
        },
      })
    );
  }
  /**
   * Find a single user by email.
   */
  async findByEmail(email) {
    return await withDatabaseRetry('UserRepository.findByEmail', () =>
      prisma.user.findFirst({
        where: {
          email: email.toLowerCase().trim(),
          deleted_at: null,
        },
        select: AUTH_USER_SELECT,
      })
    );
  }

  async findSeedUserByEmail(email) {
    return await withDatabaseRetry('UserRepository.findSeedUserByEmail', () =>
      prisma.user.findFirst({
        where: {
          [UserEntity.columns.EMAIL]: email.toLowerCase().trim(),
        },
        select: {
          [UserEntity.columns.ID]: true,
          [UserEntity.columns.EMPLOYEE_ID]: true,
          [UserEntity.columns.EMAIL]: true,
          [UserEntity.columns.ROLE]: true,
          [UserEntity.columns.STATUS]: true,
          [UserEntity.columns.DELETED_AT]: true,
        },
      })
    );
  }

  async findAnyByEmail(email) {
    return await withDatabaseRetry('UserRepository.findAnyByEmail', () =>
      prisma.user.findFirst({
        where: {
          email: email.toLowerCase().trim(),
        },
      })
    );
  }

  async findByActivationTokenHash(tokenHash) {
    return await withDatabaseRetry('UserRepository.findByActivationTokenHash', () =>
      prisma.user.findFirst({
        where: {
          [UserEntity.columns.ACTIVATION_TOKEN_HASH]: tokenHash,
        },
      })
    );
  }

  /**
   * Find a user by their refresh token.
   */
  async findByRefreshToken(refreshToken) {
    return await withDatabaseRetry('UserRepository.findByRefreshToken', () =>
      prisma.user.findFirst({
        where: { [UserEntity.columns.REFRESH_TOKEN]: refreshToken },
      })
    );
  }

  async findByResetOtp(email, otp) {
    return await withDatabaseRetry('UserRepository.findByResetOtp', () =>
      prisma.user.findFirst({
        where: {
          [UserEntity.columns.EMAIL]: email,
          [UserEntity.columns.PASSWORD_RESET_OTP]: otp,
          [UserEntity.columns.DELETED_AT]: null,
        },
      })
    );
  }

  /**
   * Create a new user.
   */
  async createUser(userData) {
    return await withDatabaseRetry('UserRepository.createUser', () =>
      prisma.user.create({
        data: userData,
      })
    );
  }

  /**
   * Update a user's details by their ID.
   */
  async updateUser(id, updateData) {
    const safeUpdateData = this.sanitizeUpdateData(updateData);

    return await withDatabaseRetry('UserRepository.updateUser', () =>
      prisma.user.update({
        where: { [UserEntity.columns.ID]: id },
        data: safeUpdateData,
      })
    );
  }

  /**
   * Update user status and create audit log within a database transaction.
   */
  async updateUserStatus(id, statusData, auditLogData) {
    return await prisma.$transaction(async (tx) => {
      const updatedUser = await tx.user.update({
        where: { id },
        data: statusData,
      });

      await tx.auditLog.create({
        data: auditLogData,
      });

      return updatedUser;
    });
  }

  /**
   * Soft delete a user by their ID, suffixing their email to avoid constraint collisions.
   */
  async softDeleteUser(id, { tx = prisma, deletedById = null, deletedAt = new Date() } = {}) {
    const user = await tx.user.findUnique({ where: { id } });
    if (!user) return null;
    const retiredEmail = `${user.email}_deleted_${deletedAt.getTime()}`;
    return await tx.user.update({
      where: { [UserEntity.columns.ID]: id },
      data: {
        [UserEntity.columns.DELETED_AT]: deletedAt,
        [UserEntity.columns.DELETED_BY_ID]: deletedById,
        [UserEntity.columns.STATUS]: USER_ACCOUNT_STATUS.DEACTIVATED,
        [UserEntity.columns.EMAIL]: retiredEmail,
        [UserEntity.columns.REFRESH_TOKEN]: null, // Invalidate session
      },
    });
  }

  /**
   * Restores a soft-deleted user and recovers their original email.
   */
  async restoreUser(id, originalEmail) {
    return await prisma.user.update({
      where: { [UserEntity.columns.ID]: id },
      data: {
        [UserEntity.columns.DELETED_AT]: null,
        [UserEntity.columns.DELETED_BY_ID]: null,
        [UserEntity.columns.STATUS]: USER_ACCOUNT_STATUS.ACTIVE,
        [UserEntity.columns.EMAIL]: originalEmail,
      },
    });
  }

  async countUsers() {
    return await prisma.user.count();
  }
}

export default new UserRepository();
