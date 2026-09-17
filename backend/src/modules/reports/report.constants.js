// ─── Report Constants ────────────────────────────────────────────────────────
// Shared across all four report types.

/** Maximum number of records that can be exported in one request. */
export const EXPORT_LIMIT = 10_000;

/** Default page size for report list endpoints. */
export const DEFAULT_PAGE_SIZE = 20;

/** Maximum allowed page size for report list endpoints. */
export const MAX_PAGE_SIZE = 100;

// ─── Vendor Report ───────────────────────────────────────────────────────────
export const VENDOR_SORT_FIELDS = ['name', 'vendor_code', 'category', 'status', 'created_at', 'approved_at'];
export const VENDOR_STATUS_VALUES = [
  'pending',
  'approved',
  'rejected',
  'blocked',
  'PENDING',
  'ACTIVE',
  'APPROVED',
  'INACTIVE',
  'REJECTED',
  'BLOCKED',
];

// ─── PO Report ───────────────────────────────────────────────────────────────
export const PO_SORT_FIELDS = ['po_number', 'amount', 'status', 'order_date', 'created_at'];
export const PO_STATUS_VALUES = ['pending', 'open', 'closed', 'cancelled'];
export const PO_CURRENCY_VALUES = ['INR', 'USD', 'EUR', 'GBP', 'AED'];

// ─── Invoice Report ──────────────────────────────────────────────────────────
export const INVOICE_SORT_FIELDS = ['invoice_number', 'amount', 'invoice_total', 'status', 'payment_status', 'invoice_date', 'due_date', 'created_at'];
export const INVOICE_STATUS_VALUES = [
  'DRAFT', 'SUBMITTED',
  'PENDING_THREE_WAY_MATCH', 'PENDING_ADMIN_REVIEW',
  'PENDING_TEAM_LEAD', 'PENDING_MANAGER', 'PENDING_FINANCE_HEAD',
  'APPROVED', 'REJECTED', 'CANCELLED',
];
export const INVOICE_PAYMENT_STATUS_VALUES = ['UNPAID', 'PARTIALLY_PAID', 'PAID'];

// ─── Payment Report ──────────────────────────────────────────────────────────
export const PAYMENT_SORT_FIELDS = ['payment_number', 'amount', 'status', 'payment_method', 'payment_date', 'created_at'];
export const PAYMENT_STATUS_VALUES = ['PENDING', 'INITIATED', 'PROCESSING', 'SUCCESS', 'FAILED', 'CANCELLED', 'REFUNDED', 'PARTIALLY_PAID', 'COMPLETED'];
export const PAYMENT_METHOD_VALUES = ['NEFT', 'RTGS', 'IMPS', 'UPI', 'CHEQUE', 'CASH', 'WIRE_TRANSFER', 'MANUAL'];

// ─── Sensitive fields never exported ─────────────────────────────────────────
// These are stripped at the service level before any response or export.
export const SENSITIVE_VENDOR_FIELDS = ['bank_account_no', 'ifsc_code'];

// ─── Formula injection prefix chars (sanitize in export) ─────────────────────
export const FORMULA_INJECTION_CHARS = /^[=+\-@|]/;

/**
 * Sanitize a value for safe CSV / XLSX export.
 * Prevents spreadsheet formula injection.
 */
export const sanitizeExportValue = (value) => {
  if (typeof value !== 'string') return value;
  if (FORMULA_INJECTION_CHARS.test(value)) return `'${value}`;
  return value;
};

/**
 * Format a Date to a readable string for exports.
 */
export const formatDateForExport = (date) => {
  if (!date) return '';
  return new Date(date).toISOString().slice(0, 10); // YYYY-MM-DD
};

/**
 * Format a number/decimal value for export with 2 decimal places.
 */
export const formatAmountForExport = (value) => {
  if (value === null || value === undefined) return '';
  return Number(value).toFixed(2);
};
