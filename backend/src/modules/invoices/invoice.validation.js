import { z } from 'zod';
import { INVOICE_STATUS } from '../../utils/approval-helper.js';

const uuidParamSchema = z.object({
  id: z.string().uuid('Invalid invoice ID format'),
});

export const INVOICE_SOURCES = [
  'MANUAL_ENTRY',
  'UPLOADED_PDF',
  'SCANNED_PDF',
  'SCANNED_IMAGE',
  'EMAIL_ATTACHMENT',
  'SYSTEM_IMPORT',
];

export const INVOICE_CREATION_METHODS = ['MANUAL', 'OCR'];

export const INVOICE_CATEGORIES = [
  'TAX_INVOICE',
  'PROFORMA_INVOICE',
  'DEBIT_NOTE',
  'CREDIT_NOTE',
  'COMMERCIAL_INVOICE',
  'SERVICE_INVOICE',
  'PURCHASE_INVOICE',
  'RECURRING_INVOICE',
  'OTHER',
];

const parseJsonFormField = (value) => {
  if (typeof value !== 'string') return value;
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
};

const verifiedLineItemSchema = z.object({
  itemCode: z.string().trim().max(100).nullable().optional(),
  itemName: z.string().trim().max(500).nullable().optional(),
  description: z.string().trim().max(500).nullable().optional(),
  hsnSac: z.string().trim().max(20).nullable().optional(),
  quantity: z.coerce.number().positive('Line item quantity must be greater than zero.'),
  unit: z.string().trim().max(30).nullable().optional(),
  unitPrice: z.coerce.number().nonnegative('Unit price cannot be negative.'),
  taxableAmount: z.coerce.number().nonnegative('Taxable amount cannot be negative.').optional(),
  discount: z.coerce.number().nonnegative().optional().default(0),
  cgst: z.coerce.number().nonnegative().nullable().optional(),
  sgst: z.coerce.number().nonnegative().nullable().optional(),
  igst: z.coerce.number().nonnegative().nullable().optional(),
  cgstAmount: z.coerce.number().nonnegative().nullable().optional(),
  sgstAmount: z.coerce.number().nonnegative().nullable().optional(),
  igstAmount: z.coerce.number().nonnegative().nullable().optional(),
  gstAmount: z.coerce.number().nonnegative().nullable().optional(),
  taxAmount: z.coerce.number().nonnegative().nullable().optional(),
  lineTotal: z.coerce.number().nonnegative().optional(),
  total: z.coerce.number().nonnegative().optional(),
}).passthrough().superRefine((item, ctx) => {
  if (!String(item.itemName || item.description || '').trim()) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['itemName'],
      message: 'Line item name or description is required.',
    });
  }
  if (item.lineTotal === undefined && item.total === undefined) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['lineTotal'],
      message: 'Line item total is required.',
    });
  }
});

// ─── ID-only param ───────────────────────────────────────────────────────────
export const invoiceIdSchema = z.object({
  params: uuidParamSchema,
});

export const createInvoiceSchema = z.object({
  body: z.object({
    purchaseOrderId: z.string().uuid('Invalid purchase order ID format').optional(),
    vendorId: z.string().uuid('Invalid vendor ID format').optional(),
    grnId: z.string().uuid('Invalid GRN ID format').optional(),
    deliveryChallanId: z.string().uuid('Invalid Delivery Challan ID format').optional(),
    ocrDocumentId: z.string().uuid('Invalid OCR document ID format').optional(),
    ocrExtractionId: z.string().uuid('Invalid OCR extraction ID format').optional(),
    ocrDraftId: z.string().uuid('Invalid OCR draft ID format').optional(),
    invoiceNumber: z.string().trim().min(1).max(100).optional(),
    amount: z.coerce.number().positive().optional(),
    currency: z.string().optional().default('INR'),
    invoiceCreationMethod: z.enum(INVOICE_CREATION_METHODS, { message: 'Invoice creation method is required.' }).optional().default('MANUAL'),
    invoiceSource: z.enum(INVOICE_SOURCES, { message: 'Invoice Source is required.' }).optional().default('MANUAL_ENTRY'),
    invoiceCategory: z.enum(INVOICE_CATEGORIES, { message: 'Invoice Category is required.' }).optional().default('TAX_INVOICE'),
    invoiceDate: z.preprocess(
      (val) => (val ? new Date(val) : undefined),
      z.date({ required_error: 'Invoice date is required', invalid_type_error: 'Invoice date must be a valid date' }),
    ),
    dueDate: z.preprocess(
      (val) => (val ? new Date(val) : undefined),
      z.date({ required_error: 'Due Date is required', invalid_type_error: 'Due Date must be a valid date' }),
    ),
    lineItems: z.preprocess(parseJsonFormField, z.array(verifiedLineItemSchema).min(1, 'At least one verified line item is required.').max(200)),
    taxSummary: z.preprocess(parseJsonFormField, z.record(z.string(), z.any()).optional()),
    ocrStatus: z.enum(['SUCCESS', 'PARTIAL_DATA', 'PARTIAL_SUCCESS', 'LOW_CONFIDENCE', 'FAILED']).optional(),
    ocrConfidence: z.coerce.number().min(0).max(100).optional(),
    ocrExtractedData: z.preprocess(parseJsonFormField, z.record(z.string(), z.any()).optional()),
  }).superRefine((data, ctx) => {
    if (data.invoiceCreationMethod !== 'OCR' && !String(data.invoiceNumber || '').trim()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['invoiceNumber'],
        message: 'Invoice Number is required for manual invoice creation.',
      });
    }
    if (data.invoiceCreationMethod !== 'OCR' && !data.purchaseOrderId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['purchaseOrderId'],
        message: 'Purchase Order ID is required for PO-based invoices.',
      });
    }
    if (data.invoiceCreationMethod === 'OCR' && !data.ocrDocumentId && !data.ocrDraftId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['ocrDocumentId'],
        message: 'Saved OCR document reference is required to create an OCR invoice.',
      });
    }
  }),
});

export const approvedPurchaseOrdersForInvoiceSchema = z.object({
  query: z.object({
    search: z.string().trim().optional(),
    limit: z.coerce.number().int().positive().max(50).optional().default(25),
  }),
});

// ─── Approve ─────────────────────────────────────────────────────────────────
export const invoiceApproveSchema = z.object({
  params: uuidParamSchema,
  body: z.object({
    remarks: z.string().max(1000, 'Remarks cannot exceed 1000 characters').trim().optional().default(''),
  }).optional().default({}),
});

// ─── Reject ───────────────────────────────────────────────────────────────────
export const invoiceRejectSchema = z.object({
  params: uuidParamSchema,
  body: z.object({
    rejectionReason: z.string().max(1000, 'Rejection reason cannot exceed 1000 characters').trim().optional(),
    remarks:         z.string().max(1000, 'Remarks cannot exceed 1000 characters').trim().optional(),
  }).refine((data) => !!(data.rejectionReason?.trim() || data.remarks?.trim()), {
    message: 'Rejection reason or remarks must be provided',
    path:    ['rejectionReason'],
  }),
});

// ─── Cancel ───────────────────────────────────────────────────────────────────
export const invoiceCancelSchema = z.object({
  params: uuidParamSchema,
  body: z.object({
    remarks: z.string().max(1000, 'Remarks cannot exceed 1000 characters').trim().optional().default(''),
  }).optional().default({}),
});

export const updateInvoiceSchema = z.object({
  params: uuidParamSchema,
  body: z.object({
    invoiceDate: z.preprocess(
      (val) => (val ? new Date(val) : undefined),
      z.date({ invalid_type_error: 'Invoice date must be a valid date' }).optional(),
    ),
    dueDate: z.preprocess(
      (val) => (val ? new Date(val) : undefined),
      z.date({ invalid_type_error: 'Due Date must be a valid date' }).optional(),
    ),
    remarks: z.string().trim().max(2000, 'Remarks cannot exceed 2000 characters').optional(),
    lineItems: z.array(z.record(z.any())).optional(),
    reason: z.string().trim().max(500, 'Reason cannot exceed 500 characters').optional(),
  }),
});

// ─── Admin Review ─────────────────────────────────────────────────────────────
export const adminReviewApproveSchema = z.object({
  params: uuidParamSchema,
  body: z.object({
    remarks: z.string().max(1000, 'Remarks cannot exceed 1000 characters').trim().optional().default(''),
  }).optional().default({}),
});

export const adminReviewRejectSchema = z.object({
  params: uuidParamSchema,
  body: z.object({
    remarks: z.string().min(1, 'Remarks are required when rejecting.').max(1000).trim(),
  }),
});

// ─── Soft Delete ─────────────────────────────────────────────────────────────
export const invoiceDeleteSchema = z.object({
  params: uuidParamSchema,
  body: z.object({
    deleteReason: z.string().min(1, 'Delete reason is required.').max(500, 'Delete reason cannot exceed 500 characters').trim(),
  }),
});

// ─── Restore ─────────────────────────────────────────────────────────────────
export const invoiceRestoreSchema = z.object({
  params: uuidParamSchema,
});

// ─── Finance Head Remark ──────────────────────────────────────────────────────
export const financeHeadRemarkSchema = z.object({
  params: uuidParamSchema,
  body: z.object({
    remark: z.string().min(1, 'Remark is required.').max(2000, 'Remark cannot exceed 2000 characters').trim(),
  }),
});

// ─── Search / Filter Invoices ─────────────────────────────────────────────────
const ALL_STATUSES = [
  INVOICE_STATUS.DRAFT,
  INVOICE_STATUS.SUBMITTED,
  INVOICE_STATUS.PENDING_THREE_WAY_MATCH,
  INVOICE_STATUS.PENDING_ADMIN_REVIEW,
  INVOICE_STATUS.PENDING_TEAM_LEAD,
  INVOICE_STATUS.PENDING_MANAGER,
  INVOICE_STATUS.PENDING_FINANCE_HEAD,
  INVOICE_STATUS.APPROVED,
  INVOICE_STATUS.REJECTED,
  INVOICE_STATUS.PAID,
  INVOICE_STATUS.CANCELLED,
];

export const searchInvoicesSchema = z.object({
  query: z.object({
    status: z.enum(ALL_STATUSES).optional(),
    paymentStatus: z.enum([
      'UNPAID', 'PARTIALLY_PAID', 'PAID', 'OVERDUE',
      'PAYMENT_PENDING', 'PAYMENT_FAILED', 'REFUNDED',
    ]).optional(),
    vendorId:            z.string().uuid('Invalid vendor ID format').optional(),
    purchaseOrderId:     z.string().uuid('Invalid purchase order ID format').optional(),
    requiredApprovalRole: z.enum(['TEAM_LEAD', 'MANAGER', 'FINANCE_HEAD']).optional(),
    currentApprovalLevel: z.enum(['TEAM_LEAD', 'MANAGER', 'FINANCE_HEAD']).optional(),
    search:  z.string().trim().optional(),
    sortBy:  z.string().optional(),
    sortOrder: z.enum(['asc', 'desc']).optional().default('desc'),
    page:    z.coerce.number().int().positive().optional().default(1),
    limit:   z.coerce.number().int().positive().max(100).optional().default(10),
    eligibleForPayment: z.string().optional(),
  }),
});

export const financeHeadObservationSchema = z.object({
  query: z.object({
    status:        z.enum(ALL_STATUSES).optional(),
    vendorId:      z.string().uuid().optional(),
    paymentStatus: z.string().optional(),
    search:        z.string().trim().optional(),
    sortBy:        z.string().optional(),
    sortOrder:     z.enum(['asc', 'desc']).optional().default('desc'),
    page:          z.coerce.number().int().positive().optional().default(1),
    limit:         z.coerce.number().int().positive().max(100).optional().default(20),
  }),
});

// Legacy alias
export const invoiceActionSchema = z.object({
  params: uuidParamSchema,
  body:   z.object({ remarks: z.string().trim().optional() }).optional().default({}),
});

export default {
  invoiceIdSchema,
  invoiceApproveSchema,
  invoiceRejectSchema,
  invoiceCancelSchema,
  updateInvoiceSchema,
  adminReviewApproveSchema,
  adminReviewRejectSchema,
  invoiceDeleteSchema,
  invoiceRestoreSchema,
  financeHeadRemarkSchema,
  searchInvoicesSchema,
  financeHeadObservationSchema,
  createInvoiceSchema,
  approvedPurchaseOrdersForInvoiceSchema,
  invoiceActionSchema,
};

// Due Date is required

