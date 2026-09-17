import asyncHandler from '../../middleware/asyncHandler.middleware.js';
import approvalService from './approval.service.js';

class ApprovalController {
  /**
   * @desc    Get paginated approval history (with optional filters)
   * @route   GET /api/v1/approvals
   * @access  Private (SUPER_ADMIN, FINANCE_MANAGER)
   * @query   entityType, entityId, action, performedById, page, limit
   */
  getApprovalHistory = asyncHandler(async (req, res) => {
    const result = await approvalService.getApprovalHistory(req.query);
    res.status(200).json({
      success: true,
      message: 'Approval history retrieved successfully.',
      ...result,
    });
  });

  /**
   * @desc    Get approval history for a specific entity
   * @route   GET /api/v1/approvals/:entityType/:entityId
   * @access  Private (SUPER_ADMIN, FINANCE_MANAGER)
   */
  getEntityHistory = asyncHandler(async (req, res) => {
    const { entityType, entityId } = req.params;
    const logs = await approvalService.getEntityHistory(entityType, entityId);
    res.status(200).json({
      success: true,
      message: `Approval history for ${entityType} retrieved successfully.`,
      data: logs,
    });
  });
}

export default new ApprovalController();
