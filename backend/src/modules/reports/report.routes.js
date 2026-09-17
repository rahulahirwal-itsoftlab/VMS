import express from 'express';
import { protect } from '../../middleware/auth.middleware.js';
import authorize from '../../middleware/authorize.middleware.js';
import validate from '../../middleware/validate.middleware.js';
import reportController from './report.controller.js';
import { PERMISSION_KEYS } from '../auth/role-permissions.js';
import {
  vendorReportSchema,
  vendorDetailReportSchema,
  vendorExportSchema,
  poReportSchema,
  poDetailReportSchema,
  poExportSchema,
  invoiceReportSchema,
  invoiceDetailReportSchema,
  invoiceExportSchema,
  paymentReportSchema,
  paymentDetailReportSchema,
  paymentExportSchema,
} from './report.validation.js';

const router = express.Router();

// All report routes require authentication
router.use(protect);

// ─── Vendor Reports ────────────────────────────────────────────────────────────
router.get(
  '/vendors',
  authorize([PERMISSION_KEYS.VIEW_VENDOR_REPORTS]),
  validate(vendorReportSchema),
  reportController.getVendorReport,
);

router.get(
  '/vendors/summary',
  authorize([PERMISSION_KEYS.VIEW_VENDOR_REPORTS]),
  validate(vendorReportSchema),
  reportController.getVendorReportSummary,
);

router.get(
  '/vendors/export',
  authorize([PERMISSION_KEYS.EXPORT_VENDOR_REPORTS]),
  validate(vendorExportSchema),
  reportController.exportVendorReport,
);

router.get(
  '/vendors/:id',
  authorize([PERMISSION_KEYS.VIEW_VENDOR_REPORTS]),
  validate(vendorDetailReportSchema),
  reportController.getVendorReportDetail,
);

// ─── Purchase Order Reports ────────────────────────────────────────────────────
router.get(
  '/purchase-orders',
  authorize([PERMISSION_KEYS.VIEW_PO_REPORTS]),
  validate(poReportSchema),
  reportController.getPOReport,
);

router.get(
  '/purchase-orders/summary',
  authorize([PERMISSION_KEYS.VIEW_PO_REPORTS]),
  validate(poReportSchema),
  reportController.getPOReportSummary,
);

router.get(
  '/purchase-orders/export',
  authorize([PERMISSION_KEYS.EXPORT_PO_REPORTS]),
  validate(poExportSchema),
  reportController.exportPOReport,
);

router.get(
  '/purchase-orders/:id',
  authorize([PERMISSION_KEYS.VIEW_PO_REPORTS]),
  validate(poDetailReportSchema),
  reportController.getPOReportDetail,
);

// ─── Invoice Reports ───────────────────────────────────────────────────────────
router.get(
  '/invoices',
  authorize([PERMISSION_KEYS.VIEW_INVOICE_REPORTS]),
  validate(invoiceReportSchema),
  reportController.getInvoiceReport,
);

router.get(
  '/invoices/summary',
  authorize([PERMISSION_KEYS.VIEW_INVOICE_REPORTS]),
  validate(invoiceReportSchema),
  reportController.getInvoiceReportSummary,
);

router.get(
  '/invoices/export',
  authorize([PERMISSION_KEYS.EXPORT_INVOICE_REPORTS]),
  validate(invoiceExportSchema),
  reportController.exportInvoiceReport,
);

router.get(
  '/invoices/:id',
  authorize([PERMISSION_KEYS.VIEW_INVOICE_REPORTS]),
  validate(invoiceDetailReportSchema),
  reportController.getInvoiceReportDetail,
);

// ─── Payment Reports ───────────────────────────────────────────────────────────
router.get(
  '/payments',
  authorize([PERMISSION_KEYS.VIEW_PAYMENT_REPORTS]),
  validate(paymentReportSchema),
  reportController.getPaymentReport,
);

router.get(
  '/payments/summary',
  authorize([PERMISSION_KEYS.VIEW_PAYMENT_REPORTS]),
  validate(paymentReportSchema),
  reportController.getPaymentReportSummary,
);

router.get(
  '/payments/export',
  authorize([PERMISSION_KEYS.EXPORT_PAYMENT_REPORTS]),
  validate(paymentExportSchema),
  reportController.exportPaymentReport,
);

router.get(
  '/payments/:id',
  authorize([PERMISSION_KEYS.VIEW_PAYMENT_REPORTS]),
  validate(paymentDetailReportSchema),
  reportController.getPaymentReportDetail,
);

export default router;
