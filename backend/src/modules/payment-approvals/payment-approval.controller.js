import asyncHandler from '../../middleware/asyncHandler.middleware.js';
import paymentApprovalService from './payment-approval.service.js';

class PaymentApprovalController {
  /**
   * Get all payment approvals assigned to the logged-in user.
   */
  getMyApprovals = asyncHandler(async (req, res) => {
    const result = await paymentApprovalService.getMyApprovals(req.user, req.query);
    res.status(200).json({
      success: true,
      message: 'Payment approvals retrieved successfully.',
      ...result,
    });
  });

  /**
   * Get a single payment approval by ID.
   */
  getApprovalById = asyncHandler(async (req, res) => {
    const approval = await paymentApprovalService.getApprovalById(req.params.id, req.user);
    res.status(200).json({
      success: true,
      message: 'Payment approval details retrieved successfully.',
      data: approval,
    });
  });

  /**
   * Get all payment approvals linked to a specific invoice.
   * Allows the frontend to load approval state from an invoice detail page
   * without requiring the frontend to hardcode any IDs or thresholds.
   */
  getApprovalsByInvoiceId = asyncHandler(async (req, res) => {
    const approvals = await paymentApprovalService.getApprovalsByInvoiceId(req.params.invoiceId, req.user);
    res.status(200).json({
      success: true,
      message: 'Payment approvals for invoice retrieved successfully.',
      data: approvals,
    });
  });

  /**
   * Return the approval routing configuration (thresholds) from the backend.
   * The frontend must call this endpoint instead of hardcoding amounts.
   */
  getApprovalConfig = asyncHandler(async (req, res) => {
    const config = paymentApprovalService.getApprovalConfig();
    res.status(200).json({
      success: true,
      message: 'Approval configuration retrieved successfully.',
      data: config,
    });
  });

  /**
   * Approve a pending payment approval.
   */
  approvePaymentApproval = asyncHandler(async (req, res) => {
    const remarks = req.body?.remarks || req.body?.remarksText || '';
    const approval = await paymentApprovalService.approvePaymentApproval(req.params.id, req.user, remarks);
    res.status(200).json({
      success: true,
      message: 'Payment approval approved successfully.',
      data: approval,
    });
  });

  /**
   * Reject a pending payment approval.
   */
  rejectPaymentApproval = asyncHandler(async (req, res) => {
    const rejectionReason = req.body?.rejectionReason || req.body?.remarks || req.body?.remarksText || '';
    const approval = await paymentApprovalService.rejectPaymentApproval(req.params.id, req.user, rejectionReason);
    res.status(200).json({
      success: true,
      message: 'Payment approval rejected successfully.',
      data: approval,
    });
  });

  /**
   * Get audit/action history for a payment approval.
   */
  getApprovalHistory = asyncHandler(async (req, res) => {
    const history = await paymentApprovalService.getApprovalHistory(req.params.id, req.user);
    res.status(200).json({
      success: true,
      message: 'Payment approval history retrieved successfully.',
      data: history,
    });
  });
}

export default new PaymentApprovalController();

