import { z } from 'zod';
import {
  VENDOR_STATUS_VALUES,
  VENDOR_SORT_FIELDS,
  PO_STATUS_VALUES,
  PO_SORT_FIELDS,
  PO_CURRENCY_VALUES,
  INVOICE_STATUS_VALUES,
  INVOICE_PAYMENT_STATUS_VALUES,
  INVOICE_SORT_FIELDS,
  PAYMENT_STATUS_VALUES,
  PAYMENT_METHOD_VALUES,
  PAYMENT_SORT_FIELDS,
  DEFAULT_PAGE_SIZE,
  MAX_PAGE_SIZE,
} from './report.constants.js';

// ─── Shared helpers ───────────────────────────────────────────────────────────

const dateString = z.string().regex(
  /^\d{4}-\d{2}-\d{2}(T[\d:.Z+-]+)?$/,
  'Date must be YYYY-MM-DD or ISO 8601 format'
).optional();

const positiveIntStr = (def) =>
  z.union([z.string(), z.number()]).pipe(z.coerce.number().int().positive()).default(def);

const nonNegAmount = z.union([z.string(), z.number()])
  .pipe(z.coerce.number().min(0))
  .optional();

const uuidParam = z.object({
  params: z.object({ id: z.string().uuid('Invalid ID') }),
});

// ─── Vendor Report ────────────────────────────────────────────────────────────
export const vendorReportSchema = z.object({
  query: z.object({
    startDate:   dateString,
    endDate:     dateString,
    status:      z.enum(VENDOR_STATUS_VALUES).optional(),
    category:    z.string().trim().optional(),
    search:      z.string().trim().optional(),
    createdById: z.string().uuid().optional(),
    sortField:   z.enum(VENDOR_SORT_FIELDS).optional().default('created_at'),
    sortOrder:   z.enum(['asc', 'desc']).optional().default('desc'),
    page:        positiveIntStr(1),
    limit:       z.union([z.string(), z.number()]).pipe(z.coerce.number().int().positive().max(MAX_PAGE_SIZE)).default(DEFAULT_PAGE_SIZE),
  }).superRefine((data, ctx) => {
    if (data.startDate && data.endDate && new Date(data.startDate) > new Date(data.endDate)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'startDate must not be after endDate', path: ['startDate'] });
    }
  }),
});

export const vendorDetailReportSchema = uuidParam;

export const vendorExportSchema = z.object({
  query: z.object({
    startDate:   dateString,
    endDate:     dateString,
    status:      z.enum(VENDOR_STATUS_VALUES).optional(),
    category:    z.string().trim().optional(),
    search:      z.string().trim().optional(),
    createdById: z.string().uuid().optional(),
    sortField:   z.enum(VENDOR_SORT_FIELDS).optional().default('created_at'),
    sortOrder:   z.enum(['asc', 'desc']).optional().default('desc'),
    format:      z.enum(['xlsx', 'csv']).optional().default('xlsx'),
  }).superRefine((data, ctx) => {
    if (data.startDate && data.endDate && new Date(data.startDate) > new Date(data.endDate)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'startDate must not be after endDate', path: ['startDate'] });
    }
  }),
});

// ─── PO Report ────────────────────────────────────────────────────────────────
export const poReportSchema = z.object({
  query: z.object({
    startDate:   dateString,
    endDate:     dateString,
    status:      z.enum(PO_STATUS_VALUES).optional(),
    vendorId:    z.string().uuid().optional(),
    search:      z.string().trim().optional(),
    currency:    z.enum(PO_CURRENCY_VALUES).optional(),
    minAmount:   nonNegAmount,
    maxAmount:   nonNegAmount,
    createdById: z.string().uuid().optional(),
    sortField:   z.enum(PO_SORT_FIELDS).optional().default('order_date'),
    sortOrder:   z.enum(['asc', 'desc']).optional().default('desc'),
    page:        positiveIntStr(1),
    limit:       z.union([z.string(), z.number()]).pipe(z.coerce.number().int().positive().max(MAX_PAGE_SIZE)).default(DEFAULT_PAGE_SIZE),
  }).superRefine((data, ctx) => {
    if (data.startDate && data.endDate && new Date(data.startDate) > new Date(data.endDate)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'startDate must not be after endDate', path: ['startDate'] });
    }
    if (data.minAmount !== undefined && data.maxAmount !== undefined && data.minAmount > data.maxAmount) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'minAmount must not exceed maxAmount', path: ['minAmount'] });
    }
  }),
});

export const poDetailReportSchema = uuidParam;

export const poExportSchema = z.object({
  query: z.object({
    startDate: dateString, endDate: dateString,
    status:    z.enum(PO_STATUS_VALUES).optional(),
    vendorId:  z.string().uuid().optional(),
    search:    z.string().trim().optional(),
    currency:  z.enum(PO_CURRENCY_VALUES).optional(),
    minAmount: nonNegAmount, maxAmount: nonNegAmount,
    sortField: z.enum(PO_SORT_FIELDS).optional().default('order_date'),
    sortOrder: z.enum(['asc', 'desc']).optional().default('desc'),
    format:    z.enum(['xlsx', 'csv']).optional().default('xlsx'),
  }),
});

// ─── Invoice Report ───────────────────────────────────────────────────────────
export const invoiceReportSchema = z.object({
  query: z.object({
    startDate:     dateString,
    endDate:       dateString,
    status:        z.enum(INVOICE_STATUS_VALUES).optional(),
    paymentStatus: z.enum(INVOICE_PAYMENT_STATUS_VALUES).optional(),
    vendorId:      z.string().uuid().optional(),
    poId:          z.string().uuid().optional(),
    search:        z.string().trim().optional(),
    minAmount:     nonNegAmount,
    maxAmount:     nonNegAmount,
    createdById:   z.string().uuid().optional(),
    overdueOnly:   z.union([z.string(), z.boolean()])
      .transform((v) => v === 'true' || v === true)
      .optional(),
    sortField:     z.enum(INVOICE_SORT_FIELDS).optional().default('invoice_date'),
    sortOrder:     z.enum(['asc', 'desc']).optional().default('desc'),
    page:          positiveIntStr(1),
    limit:         z.union([z.string(), z.number()]).pipe(z.coerce.number().int().positive().max(MAX_PAGE_SIZE)).default(DEFAULT_PAGE_SIZE),
  }).superRefine((data, ctx) => {
    if (data.startDate && data.endDate && new Date(data.startDate) > new Date(data.endDate)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'startDate must not be after endDate', path: ['startDate'] });
    }
    if (data.minAmount !== undefined && data.maxAmount !== undefined && data.minAmount > data.maxAmount) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'minAmount must not exceed maxAmount', path: ['minAmount'] });
    }
  }),
});

export const invoiceDetailReportSchema = uuidParam;

export const invoiceExportSchema = z.object({
  query: z.object({
    startDate: dateString, endDate: dateString,
    status:    z.enum(INVOICE_STATUS_VALUES).optional(),
    paymentStatus: z.enum(INVOICE_PAYMENT_STATUS_VALUES).optional(),
    vendorId:  z.string().uuid().optional(),
    poId:      z.string().uuid().optional(),
    search:    z.string().trim().optional(),
    minAmount: nonNegAmount, maxAmount: nonNegAmount,
    overdueOnly: z.union([z.string(), z.boolean()]).transform((v) => v === 'true' || v === true).optional(),
    sortField: z.enum(INVOICE_SORT_FIELDS).optional().default('invoice_date'),
    sortOrder: z.enum(['asc', 'desc']).optional().default('desc'),
    format:    z.enum(['xlsx', 'csv']).optional().default('xlsx'),
  }),
});

// ─── Payment Report ───────────────────────────────────────────────────────────
export const paymentReportSchema = z.object({
  query: z.object({
    startDate:     dateString,
    endDate:       dateString,
    status:        z.enum(PAYMENT_STATUS_VALUES).optional(),
    paymentMethod: z.enum(PAYMENT_METHOD_VALUES).optional(),
    vendorId:      z.string().uuid().optional(),
    invoiceId:     z.string().uuid().optional(),
    poId:          z.string().uuid().optional(),
    search:        z.string().trim().optional(),
    minAmount:     nonNegAmount,
    maxAmount:     nonNegAmount,
    currency:      z.enum(PO_CURRENCY_VALUES).optional(),
    processedById: z.string().uuid().optional(),
    sortField:     z.enum(PAYMENT_SORT_FIELDS).optional().default('payment_date'),
    sortOrder:     z.enum(['asc', 'desc']).optional().default('desc'),
    page:          positiveIntStr(1),
    limit:         z.union([z.string(), z.number()]).pipe(z.coerce.number().int().positive().max(MAX_PAGE_SIZE)).default(DEFAULT_PAGE_SIZE),
  }).superRefine((data, ctx) => {
    if (data.startDate && data.endDate && new Date(data.startDate) > new Date(data.endDate)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'startDate must not be after endDate', path: ['startDate'] });
    }
    if (data.minAmount !== undefined && data.maxAmount !== undefined && data.minAmount > data.maxAmount) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'minAmount must not exceed maxAmount', path: ['minAmount'] });
    }
  }),
});

export const paymentDetailReportSchema = uuidParam;

export const paymentExportSchema = z.object({
  query: z.object({
    startDate:     dateString, endDate: dateString,
    status:        z.enum(PAYMENT_STATUS_VALUES).optional(),
    paymentMethod: z.enum(PAYMENT_METHOD_VALUES).optional(),
    vendorId:      z.string().uuid().optional(),
    invoiceId:     z.string().uuid().optional(),
    poId:          z.string().uuid().optional(),
    search:        z.string().trim().optional(),
    minAmount:     nonNegAmount, maxAmount: nonNegAmount,
    currency:      z.enum(PO_CURRENCY_VALUES).optional(),
    sortField:     z.enum(PAYMENT_SORT_FIELDS).optional().default('payment_date'),
    sortOrder:     z.enum(['asc', 'desc']).optional().default('desc'),
    format:        z.enum(['xlsx', 'csv']).optional().default('xlsx'),
  }),
});
