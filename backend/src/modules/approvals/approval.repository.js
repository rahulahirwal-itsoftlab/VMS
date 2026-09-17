import prisma from '../../config/prisma.js';

class ApprovalRepository {
  /**
   * Create a new approval log entry.
   */
  async createLog(data) {
    return prisma.approvalLog.create({
      data,
      include: {
        performed_by: {
          select: { id: true, email: true, first_name: true, last_name: true, role: true },
        },
      },
    });
  }

  /**
   * Find all approval logs with filtering and pagination.
   */
  async findAll({ where = {}, skip = 0, take = 10 }) {
    const [logs, total] = await Promise.all([
      prisma.approvalLog.findMany({
        where,
        skip,
        take,
        orderBy: { created_at: 'desc' },
        include: {
          performed_by: {
            select: { id: true, email: true, first_name: true, last_name: true, role: true },
          },
        },
      }),
      prisma.approvalLog.count({ where }),
    ]);

    return { logs, total };
  }

  /**
   * Find all approval logs for a specific entity.
   */
  async findByEntity(entityType, entityId) {
    return prisma.approvalLog.findMany({
      where: { entity_type: entityType, entity_id: entityId },
      orderBy: { created_at: 'desc' },
      include: {
        performed_by: {
          select: { id: true, email: true, first_name: true, last_name: true, role: true },
        },
      },
    });
  }
}

export default new ApprovalRepository();
