import ApiError from '../../utils/ApiError.js';
import auditRepository from './audit.repository.js';
import prisma from '../../config/prisma.js';
import { ROLES } from '../../zodSchema/index.js';

const FINANCE_HEAD_MANAGED_ROLES = [ROLES.MANAGER, ROLES.TEAM_LEAD, ROLES.CASE_MANAGER];
const SAFE_VALUE_BLOCKLIST = new Set([
  'password',
  'password_hash',
  'refresh_token',
  'access_token',
  'temporary_password',
  'token',
  'authorization',
  'cookie',
  'bank_account_no',
]);

const sanitizeAuditValue = (value) => {
  if (Array.isArray(value)) return value.map(sanitizeAuditValue);
  if (!value || typeof value !== 'object') return value;

  return Object.entries(value).reduce((safe, [key, item]) => {
    const normalizedKey = key.toLowerCase();
    if ([...SAFE_VALUE_BLOCKLIST].some((blocked) => normalizedKey.includes(blocked))) {
      return safe;
    }
    safe[key] = sanitizeAuditValue(item);
    return safe;
  }, {});
};

const sanitizeAuditLog = (log) => {
  if (!log) return log;
  return {
    ...log,
    old_value: sanitizeAuditValue(log.old_value),
    new_value: sanitizeAuditValue(log.new_value),
    performed_by: log.performed_by
      ? {
          id: log.performed_by.id,
          employee_id: log.performed_by.employee_id,
          email: log.performed_by.email,
          first_name: log.performed_by.first_name,
          last_name: log.performed_by.last_name,
          role: log.performed_by.role,
        }
      : null,
  };
};

const buildFinanceHeadAuditScope = async (actor) => {
  const managedUsers = await prisma.user.findMany({
    where: {
      deleted_at: null,
      role: { in: FINANCE_HEAD_MANAGED_ROLES },
    },
    select: { id: true },
  });

  const managedUserIds = managedUsers.map((user) => user.id);
  const scopedActorIds = [actor.id, ...managedUserIds];

  return {
    OR: [
      { performed_by_id: { in: scopedActorIds } },
      {
        entity_type: 'user',
        entity_id: { in: managedUserIds },
      },
    ],
  };
};

const buildUserFilters = async (query) => {
  const userWhere = {
    role: { in: FINANCE_HEAD_MANAGED_ROLES },
    ...(query.role && { role: query.role }),
    ...(query.employeeId && { employee_id: { contains: query.employeeId, mode: 'insensitive' } }),
    ...(query.employee && {
      OR: [
        { employee_id: { contains: query.employee, mode: 'insensitive' } },
        { first_name: { contains: query.employee, mode: 'insensitive' } },
        { last_name: { contains: query.employee, mode: 'insensitive' } },
        { email: { contains: query.employee, mode: 'insensitive' } },
      ],
    }),
  };

  if (!query.role && !query.employeeId && !query.employee) {
    return null;
  }

  const users = await prisma.user.findMany({
    where: userWhere,
    select: { id: true },
  });

  return users.map((user) => user.id);
};

class AuditService {
  /**
   * Get paginated audit logs with optional filters.
   * @param {object} query - { entityType, entityId, action, performedById, dateFrom, dateTo, page, limit }
   */
  async getAuditLogs(query, actor) {
    const page = Number(query.page || 1);
    const limit = Number(query.limit || 50);
    const scopedUserIds = actor?.role === ROLES.FINANCE_HEAD
      ? await buildUserFilters(query)
      : null;
    const financeHeadScope = actor?.role === ROLES.FINANCE_HEAD
      ? await buildFinanceHeadAuditScope(actor)
      : null;

    const andFilters = [];
    if (financeHeadScope) andFilters.push(financeHeadScope);
    if (query.status) {
      andFilters.push({
        OR: [
          { from_status: query.status },
          { to_status: query.status },
        ],
      });
    }
    if (scopedUserIds) {
      andFilters.push({
        OR: [
          { performed_by_id: { in: scopedUserIds } },
          { entity_type: 'user', entity_id: { in: scopedUserIds } },
        ],
      });
    }

    const where = {
      ...(andFilters.length ? { AND: andFilters } : {}),
      ...(query.entityType && { entity_type: query.entityType }),
      ...(query.entityId && { entity_id: query.entityId }),
      ...(query.action && { action: query.action }),
      ...(query.performedById && { performed_by_id: query.performedById }),
      ...(query.dateFrom || query.dateTo
        ? {
            created_at: {
              ...(query.dateFrom && { gte: new Date(query.dateFrom) }),
              ...(query.dateTo && { lte: new Date(query.dateTo) }),
            },
          }
        : {}),
    };

    const result = await auditRepository.findAll({
      where,
      skip: (page - 1) * limit,
      take: limit,
    });

    return {
      ...result,
      logs: result.logs.map(sanitizeAuditLog),
      page,
      limit,
      totalPages: Math.ceil(result.total / limit),
    };
  }

  /**
   * Get a single audit log by ID.
   */
  async getAuditLogById(id, actor) {
    const financeHeadScope = actor?.role === ROLES.FINANCE_HEAD
      ? await buildFinanceHeadAuditScope(actor)
      : null;
    const log = financeHeadScope
      ? await auditRepository.findFirst({ where: { id, AND: [financeHeadScope] } })
      : await auditRepository.findById(id);
    if (!log) {
      throw new ApiError(404, 'Audit log entry not found.');
    }
    return sanitizeAuditLog(log);
  }
}

export default new AuditService();
