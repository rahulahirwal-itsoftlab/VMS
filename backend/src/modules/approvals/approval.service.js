import approvalRepository from './approval.repository.js';

class ApprovalService {
  /**
   * Get paginated approval history with optional filters.
   * @param {object} query - { entityType, entityId, page, limit }
   */
  async getApprovalHistory(query) {
    const page = Number(query.page || 1);
    const limit = Number(query.limit || 20);
    const where = {
      ...(query.entityType && { entity_type: query.entityType }),
      ...(query.entityId && { entity_id: query.entityId }),
      ...(query.action && { action: query.action }),
      ...(query.performedById && { performed_by_id: query.performedById }),
    };

    const result = await approvalRepository.findAll({
      where,
      skip: (page - 1) * limit,
      take: limit,
    });

    return {
      ...result,
      page,
      limit,
      totalPages: Math.ceil(result.total / limit),
    };
  }

  /**
   * Get full approval history for a specific entity (e.g., all history for vendor X).
   * @param {string} entityType - 'vendor' | 'invoice' | 'payment'
   * @param {string} entityId - UUID of the entity
   */
  async getEntityHistory(entityType, entityId) {
    return approvalRepository.findByEntity(entityType, entityId);
  }
}

export default new ApprovalService();
