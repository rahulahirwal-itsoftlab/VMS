import express from 'express';
import { protect } from '../../middleware/auth.middleware.js';
import authorize from '../../middleware/authorize.middleware.js';
import approvalController from './approval.controller.js';
import { ROLES } from '../../zodSchema/index.js';

const router = express.Router();

const HISTORY_ROLES = [ROLES.SUPER_ADMIN, ROLES.FINANCE_HEAD, ROLES.TEAM_LEAD, ROLES.MANAGER];

router.use(protect);

/**
 * GET /api/v1/approvals
 * Query params: entityType, entityId, action, performedById, page, limit
 */
router.get('/', authorize(HISTORY_ROLES), approvalController.getApprovalHistory);

/**
 * GET /api/v1/approvals/:entityType/:entityId
 * entityType: vendor | invoice | payment
 */
router.get('/:entityType/:entityId', authorize(HISTORY_ROLES), approvalController.getEntityHistory);

export default router;
