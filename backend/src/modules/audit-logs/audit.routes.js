import express from 'express';
import { protect } from '../../middleware/auth.middleware.js';
import authorize from '../../middleware/authorize.middleware.js';
import auditController from './audit.controller.js';
import { PERMISSION_KEYS } from '../auth/role-permissions.js';

const router = express.Router();

router.use(protect);

/**
 * GET /api/v1/audit-logs
 * Query: entityType, entityId, action, performedById, dateFrom, dateTo, page, limit, source
 * Access: Super Admin (observation)
 */
router.get('/', authorize(PERMISSION_KEYS.VIEW_AUDIT_LOGS), auditController.getAuditLogs);

/**
 * GET /api/v1/audit-logs/:id
 * Access: Super Admin
 */
router.get('/:id', authorize(PERMISSION_KEYS.VIEW_AUDIT_LOGS), auditController.getAuditLogById);

export default router;
