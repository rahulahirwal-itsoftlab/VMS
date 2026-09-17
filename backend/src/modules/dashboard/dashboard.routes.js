import express from 'express';
import { protect } from '../../middleware/auth.middleware.js';
import authorize from '../../middleware/authorize.middleware.js';
import dashboardController from './dashboard.controller.js';
import { PERMISSION_KEYS } from '../auth/role-permissions.js';

const router = express.Router();

router.use(protect);

router.get(
  '/analytics',
  authorize([PERMISSION_KEYS.VIEW_DASHBOARD]),
  dashboardController.getAnalytics,
);

router.get(
  '/overview',
  authorize([PERMISSION_KEYS.VIEW_SYSTEM_ANALYTICS]),
  dashboardController.getOverview,
);

router.get(
  '/finance-head/observation',
  authorize([PERMISSION_KEYS.VIEW_SYSTEM_ANALYTICS]),
  dashboardController.getFinanceHeadObservation,
);

router.get(
  '/finance-head',
  authorize([PERMISSION_KEYS.REVIEW_VENDORS, PERMISSION_KEYS.EXECUTE_PAYMENT]),
  dashboardController.getFinanceHeadDashboard,
);

router.get(
  '/me',
  authorize([PERMISSION_KEYS.VIEW_DASHBOARD]),
  dashboardController.getMyDashboard,
);

export default router;
