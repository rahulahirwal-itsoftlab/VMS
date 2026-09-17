import express from 'express';
import { protect } from '../../middleware/auth.middleware.js';
import authorize from '../../middleware/authorize.middleware.js';
import validate from '../../middleware/validate.middleware.js';
import matchingController from './matching.controller.js';
import {
  startMatchingSchema,
  matchIdSchema,
  invoiceIdParam,
  poIdParam,
  adminReviewSchema,
  adminRejectSchema,
  createGRNSchema,
  updateGRNSchema,
  createDeliveryChallanSchema,
  updateDeliveryChallanSchema,
  searchMatchesSchema,
} from './matching.validation.js';
import { ROLES } from '../../zodSchema/index.js';

const router = express.Router();

router.use(protect);

// ─── GRN Routes ───────────────────────────────────────────────────────────────
// GRN routes are placed before matching routes to avoid route conflicts

/**
 * POST   /api/v1/three-way-matching/grn
 * Create a new Goods Receipt Note (GRN)
 * Access: Case Manager
 */
router.post('/grn',
  authorize([ROLES.CASE_MANAGER, ROLES.SUPER_ADMIN]),
  validate(createGRNSchema),
  matchingController.createGRN,
);

/**
 * GET    /api/v1/three-way-matching/grn/by-po/:poId
 * Get all GRNs for a Purchase Order
 * Access: All roles
 */
router.get('/grn/by-po/:poId',
  authorize(Object.values(ROLES)),
  validate(poIdParam),
  matchingController.getGRNsByPurchaseOrder,
);

/**
 * GET    /api/v1/three-way-matching/grn/:id
 * Get a single GRN by ID
 */
router.get('/grn/:id',
  authorize(Object.values(ROLES)),
  validate(matchIdSchema),
  matchingController.getGRNById,
);

/**
 * PUT    /api/v1/three-way-matching/grn/:id
 * Update a GRN
 */
router.put('/grn/:id',
  authorize([ROLES.CASE_MANAGER, ROLES.SUPER_ADMIN]),
  validate(updateGRNSchema),
  matchingController.updateGRN,
);

router.delete('/grn/:id',
  authorize([ROLES.CASE_MANAGER, ROLES.SUPER_ADMIN]),
  validate(matchIdSchema),
  matchingController.deleteGRN,
);

// Delivery Challan routes are placed before matching routes to avoid route conflicts.
router.post('/delivery-challan',
  authorize([ROLES.CASE_MANAGER, ROLES.SUPER_ADMIN]),
  validate(createDeliveryChallanSchema),
  matchingController.createDeliveryChallan,
);

router.get('/delivery-challan/by-po/:poId',
  authorize(Object.values(ROLES)),
  validate(poIdParam),
  matchingController.getDeliveryChallansByPurchaseOrder,
);

router.get('/delivery-challan/:id',
  authorize(Object.values(ROLES)),
  validate(matchIdSchema),
  matchingController.getDeliveryChallanById,
);

router.put('/delivery-challan/:id',
  authorize([ROLES.CASE_MANAGER, ROLES.SUPER_ADMIN]),
  validate(updateDeliveryChallanSchema),
  matchingController.updateDeliveryChallan,
);

router.delete('/delivery-challan/:id',
  authorize([ROLES.CASE_MANAGER, ROLES.SUPER_ADMIN]),
  validate(matchIdSchema),
  matchingController.deleteDeliveryChallan,
);

// ─── Three-Way Matching Routes ────────────────────────────────────────────────

/**
 * POST   /api/v1/three-way-matching/start
 * Case Manager initiates matching for an invoice
 * Access: Case Manager
 */
router.post('/start',
  authorize([ROLES.CASE_MANAGER, ROLES.SUPER_ADMIN]),
  validate(startMatchingSchema),
  matchingController.startMatching,
);

/**
 * GET    /api/v1/three-way-matching
 * List all matching records
 * Access: Admin only. Finance Head invoice approval must not expose the
 * standalone matching workspace.
 */
router.get('/',
  authorize([ROLES.SUPER_ADMIN, ROLES.CASE_MANAGER, ROLES.FINANCE_HEAD]),
  validate(searchMatchesSchema),
  matchingController.listMatches,
);

/**
 * GET    /api/v1/three-way-matching/invoice/:invoiceId
 * Get all match reports for a specific invoice
 * Access: All read roles
 */
router.get('/invoice/:invoiceId',
  authorize([ROLES.SUPER_ADMIN, ROLES.CASE_MANAGER, ROLES.FINANCE_HEAD]),
  validate(invoiceIdParam),
  matchingController.getMatchReportByInvoice,
);

/**
 * GET    /api/v1/three-way-matching/:id
 * Get a specific match report by ID
 */
router.get('/:id',
  authorize([ROLES.SUPER_ADMIN, ROLES.CASE_MANAGER, ROLES.FINANCE_HEAD]),
  validate(matchIdSchema),
  matchingController.getMatchReport,
);

/**
 * PATCH  /api/v1/three-way-matching/:id/approve
 * Admin approves a match report → Invoice moves to PENDING_TEAM_LEAD
 * Access: Super Admin only
 */
router.patch('/:id/approve',
  authorize([ROLES.FINANCE_HEAD, ROLES.SUPER_ADMIN]),
  validate(adminReviewSchema),
  matchingController.adminApproveMatch,
);

/**
 * PATCH  /api/v1/three-way-matching/:id/reject
 * Admin rejects a match report → Invoice returned with mismatch report
 * Access: Super Admin only
 */
router.patch('/:id/reject',
  authorize([ROLES.FINANCE_HEAD, ROLES.SUPER_ADMIN]),
  validate(adminRejectSchema),
  matchingController.adminRejectMatch,
);

router.patch('/:id/return',
  authorize([ROLES.FINANCE_HEAD, ROLES.SUPER_ADMIN]),
  validate(adminRejectSchema),
  matchingController.returnMatchForCorrection,
);

export default router;
