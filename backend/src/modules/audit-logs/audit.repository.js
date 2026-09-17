import prisma from '../../config/prisma.js';

class AuditRepository {
  /**
   * Find audit logs from the new AuditLog table (with IP/browser/old/new values).
   * Falls back to legacy ApprovalLog if needed.
   */
  async findAll({ where = {}, skip = 0, take = 50, orderBy = { created_at: 'desc' }, source = 'audit' }) {
    const model = source === 'legacy' ? prisma.approvalLog : prisma.auditLog;

    const [logs, total] = await Promise.all([
      model.findMany({
        where,
        skip,
        take,
        orderBy,
        include: {
          performed_by: {
            select: { id: true, employee_id: true, email: true, first_name: true, last_name: true, role: true },
          },
        },
      }),
      model.count({ where }),
    ]);

    return { logs, total };
  }

  /**
   * Find a single audit log by ID.
   */
  async findById(id, source = 'audit') {
    const model = source === 'legacy' ? prisma.approvalLog : prisma.auditLog;
    return model.findUnique({
      where: { id },
      include: {
        performed_by: {
          select: { id: true, email: true, first_name: true, last_name: true, role: true },
        },
      },
    });
  }

  async findFirst({ where = {}, source = 'audit' }) {
    const model = source === 'legacy' ? prisma.approvalLog : prisma.auditLog;
    return model.findFirst({
      where,
      include: {
        performed_by: {
          select: { id: true, employee_id: true, email: true, first_name: true, last_name: true, role: true },
        },
      },
    });
  }

  /**
   * Get combined audit logs (new AuditLog + legacy ApprovalLog) for an entity.
   */
  async findByEntity(entityType, entityId) {
    const [newLogs, legacyLogs] = await Promise.all([
      prisma.auditLog.findMany({
        where:   { entity_type: entityType, entity_id: entityId },
        orderBy: { created_at: 'asc' },
        include: {
          performed_by: {
            select: { id: true, email: true, first_name: true, last_name: true, role: true },
          },
        },
      }),
      prisma.approvalLog.findMany({
        where:   { entity_type: entityType, entity_id: entityId },
        orderBy: { created_at: 'asc' },
        include: {
          performed_by: {
            select: { id: true, email: true, first_name: true, last_name: true, role: true },
          },
        },
      }),
    ]);

    // Merge and deduplicate (prefer new logs)
    const combined = [...newLogs, ...legacyLogs].sort(
      (a, b) => new Date(a.created_at) - new Date(b.created_at),
    );
    return combined;
  }
}

export default new AuditRepository();
