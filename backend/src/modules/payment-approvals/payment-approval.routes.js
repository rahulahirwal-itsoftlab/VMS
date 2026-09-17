import express from 'express';
import { protect } from '../../middleware/auth.middleware.js';
import authorize from '../../middleware/authorize.middleware.js';
import paymentApprovalController from './payment-approval.controller.js';
import { PERMISSION_KEYS } from '../auth/role-permissions.js';
import { ROLES } from '../../zodSchema/index.js';

const router = express.Router();

const VIEW_ACCESS = [
  PERMISSION_KEYS.VIEW_APPROVALS,
  ROLES.SUPER_ADMIN,
  ROLES.CASE_MANAGER,
  ROLES.TEAM_LEAD,
  ROLES.MANAGER,
  ROLES.FINANCE_HEAD,
];

const ACTION_ACCESS = [
  PERMISSION_KEYS.EXECUTE_PAYMENT,
  ROLES.SUPER_ADMIN,
  ROLES.TEAM_LEAD,
  ROLES.MANAGER,
  ROLES.FINANCE_HEAD,
];

router.use(protect);

// ── Configuration (no ID required) ───────────────────────────────────────────
// Must be defined BEFORE /:id routes to avoid Express treating 'config' as an ID.
router.get('/config', authorize(VIEW_ACCESS), paymentApprovalController.getApprovalConfig);

// ── Invoice-level lookup ──────────────────────────────────────────────────────
router.get('/by-invoice/:invoiceId', authorize(VIEW_ACCESS), paymentApprovalController.getApprovalsByInvoiceId);

// ── Single approval operations ────────────────────────────────────────────────
router.get('/', authorize(VIEW_ACCESS), paymentApprovalController.getMyApprovals);
router.get('/:id', authorize(VIEW_ACCESS), paymentApprovalController.getApprovalById);
router.post('/:id/approve', authorize(ACTION_ACCESS), paymentApprovalController.approvePaymentApproval);
router.post('/:id/reject', authorize(ACTION_ACCESS), paymentApprovalController.rejectPaymentApproval);
router.get('/:id/history', authorize(VIEW_ACCESS), paymentApprovalController.getApprovalHistory);

export default router;

