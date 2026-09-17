import express from 'express';
import { protect } from '../../middleware/auth.middleware.js';
import authorize from '../../middleware/authorize.middleware.js';
import validate from '../../middleware/validate.middleware.js';
import invoiceController from './invoice.controller.js';
import {
  createInvoiceSchema,
  invoiceApproveSchema,
  invoiceRejectSchema,
  invoiceCancelSchema,
  adminReviewApproveSchema,
  adminReviewRejectSchema,
  invoiceDeleteSchema,
  invoiceRestoreSchema,
  financeHeadRemarkSchema,
  invoiceIdSchema,
  searchInvoicesSchema,
  financeHeadObservationSchema,
  approvedPurchaseOrdersForInvoiceSchema,
} from './invoice.validation.js';
import { ROLES } from '../../zodSchema/index.js';
import { uploadInvoiceFile } from './invoice.upload.js';

const router = express.Router();

// ─── Role groups ─────────────────────────────────────────────────────────────
const ALL_ROLES     = Object.values(ROLES);
const READ_ROLES    = [ROLES.SUPER_ADMIN, ROLES.CASE_MANAGER, ROLES.TEAM_LEAD, ROLES.MANAGER, ROLES.FINANCE_HEAD];
const APPROVER_ROLES = [ROLES.TEAM_LEAD, ROLES.MANAGER, ROLES.FINANCE_HEAD];

router.use(protect);

// ─── Finance Head Observation Dashboard ──────────────────────────────────────
router.get('/observation',
  authorize([ROLES.FINANCE_HEAD, ROLES.SUPER_ADMIN]),
  validate(financeHeadObservationSchema),
  invoiceController.getFinanceHeadObservation,
);

// ─── My Invoices ──────────────────────────────────────────────────────────────
router.get('/my/approved',
  authorize(READ_ROLES),
  validate(searchInvoicesSchema),
  invoiceController.getMyApprovedInvoices,
);
router.get('/my/pending',
  authorize(READ_ROLES),
  validate(searchInvoicesSchema),
  invoiceController.getMyPendingInvoices,
);

// ─── Workflow-Stage Queues ────────────────────────────────────────────────────
// Three-Way Matching queue (Case Manager)
router.get('/pending/three-way-match',
  authorize([ROLES.CASE_MANAGER, ROLES.SUPER_ADMIN]),
  validate(searchInvoicesSchema),
  invoiceController.getPendingThreeWayMatch,
);

// Admin Review queue (Super Admin)
router.get('/pending/admin-review',
  authorize([ROLES.SUPER_ADMIN]),
  validate(searchInvoicesSchema),
  invoiceController.getPendingAdminReview,
);

// Team Lead queue (formerly L1)
router.get('/pending/team-lead',
  authorize([ROLES.TEAM_LEAD, ROLES.SUPER_ADMIN]),
  validate(searchInvoicesSchema),
  invoiceController.getPendingTeamLead,
);

// Manager queue (formerly L2)
router.get('/pending/manager',
  authorize([ROLES.MANAGER, ROLES.SUPER_ADMIN]),
  validate(searchInvoicesSchema),
  invoiceController.getPendingManager,
);

// Finance Head queue (formerly L3)
router.get('/pending/finance-head',
  authorize([ROLES.FINANCE_HEAD, ROLES.SUPER_ADMIN]),
  validate(searchInvoicesSchema),
  invoiceController.getPendingFinanceHead,
);

// ─── Approved Purchase Orders for Invoice Selection ─────────────────────────────
router.get('/approved-purchase-orders',
  authorize(READ_ROLES),
  validate(approvedPurchaseOrdersForInvoiceSchema),
  invoiceController.getApprovedPurchaseOrdersForInvoice,
);


// ─── OCR Processing Route ──────────────────────────────────────────────────
router.post(
  '/process-ocr',
  authorize([
    ROLES.CASE_MANAGER,
    ROLES.SUPER_ADMIN,
  ]),
  uploadInvoiceFile.single('invoiceFile'),
  invoiceController.processInvoiceOcr
);

router.get(
  '/ocr/drafts/:draftId',
  authorize([
    ROLES.CASE_MANAGER,
    ROLES.FINANCE_HEAD,
    ROLES.SUPER_ADMIN,
  ]),
  invoiceController.getOcrInvoiceDraft,
);

router.get(
  '/ocr/:ocrId/status',
  authorize([
    ROLES.CASE_MANAGER,
    ROLES.FINANCE_HEAD,
    ROLES.SUPER_ADMIN,
  ]),
  invoiceController.getOcrInvoiceStatus,
);

// ─── Base Collection Routes ───────────────────────────────────────────────────

router
  .route("/")
  .post(
    authorize([
      ROLES.CASE_MANAGER,
      ROLES.FINANCE_HEAD,
      ROLES.SUPER_ADMIN,
    ]),
    uploadInvoiceFile.fields([
      { name: 'invoiceFile', maxCount: 1 },
      { name: 'supportingDocuments', maxCount: 10 }
    ]),
    validate(createInvoiceSchema),
    invoiceController.createInvoice
  )
  .get(
    authorize(READ_ROLES),
    validate(searchInvoicesSchema),
    invoiceController.getInvoices
  );

// ─── Dynamic Parameterized Routes ─────────────────────────────────────────────
router.get('/:id',
  authorize(READ_ROLES),
  validate(invoiceIdSchema),
  invoiceController.getInvoiceById,
);
router.get('/:id/history',
  authorize(READ_ROLES),
  validate(invoiceIdSchema),
  invoiceController.getApprovalHistory,
);
router.get('/:id/download',
  authorize(READ_ROLES),
  validate(invoiceIdSchema),
  invoiceController.downloadInvoicePdf,
);
router.get('/:id/pdf',
  authorize(READ_ROLES),
  validate(invoiceIdSchema),
  invoiceController.downloadInvoicePdf,
);


// ─── Role-Level Approval Actions ──────────────────────────────────────────────
router.patch('/:id/approve',
  authorize(APPROVER_ROLES),
  validate(invoiceApproveSchema),
  invoiceController.approveInvoice,
);
router.patch('/:id/reject',
  authorize(APPROVER_ROLES),
  validate(invoiceRejectSchema),
  invoiceController.rejectInvoice,
);
router.patch('/:id/cancel',
  authorize([ROLES.CASE_MANAGER, ROLES.SUPER_ADMIN]),
  validate(invoiceCancelSchema),
  invoiceController.cancelInvoice,
);

// ─── Admin Review Actions ─────────────────────────────────────────────────────
router.patch('/:id/admin-review/approve',
  authorize([ROLES.SUPER_ADMIN]),
  validate(adminReviewApproveSchema),
  invoiceController.adminApproveInvoice,
);
router.patch('/:id/admin-review/reject',
  authorize([ROLES.SUPER_ADMIN]),
  validate(adminReviewRejectSchema),
  invoiceController.adminRejectInvoice,
);

// ─── Soft Delete & Restore ────────────────────────────────────────────────────
router.delete('/:id',
  authorize([ROLES.SUPER_ADMIN, ROLES.FINANCE_HEAD, ROLES.CASE_MANAGER, ROLES.TEAM_LEAD, ROLES.MANAGER]),
  validate(invoiceDeleteSchema),
  invoiceController.softDeleteInvoice,
);
router.post('/:id/restore',
  authorize([ROLES.SUPER_ADMIN, ROLES.FINANCE_HEAD]),
  validate(invoiceRestoreSchema),
  invoiceController.restoreInvoice,
);

// ─── Finance Head Observation Remarks ─────────────────────────────────────────
router.post('/:id/remark',
  authorize([ROLES.FINANCE_HEAD, ROLES.SUPER_ADMIN]),
  validate(financeHeadRemarkSchema),
  invoiceController.addFinanceHeadRemark,
);

export default router;
