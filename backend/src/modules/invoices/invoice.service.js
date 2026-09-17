import ApiError from '../../utils/ApiError.js';
import invoiceRepository from './invoice.repository.js';
import vendorRepository from '../vendors/vendor.repository.js';
import purchaseOrderRepository from '../purchase-orders/po.repository.js';
import approvalRepository from '../approvals/approval.repository.js';
import notificationService from '../notifications/notification.service.js';
import matchingService from '../three-way-matching/matching.service.js';
import { ROLES } from '../../zodSchema/index.js';
import {
  INVOICE_STATUS,
  THREE_WAY_MATCH_STATUS,
  ADMIN_REVIEW_STATUS,
  getRequiredInvoiceApprovalRole,
  getNextApprovalStatus,
  isValidStatusTransition,
  getCurrentApprovalLevel,
  getPendingQueueStatuses,
} from '../../utils/approval-helper.js';
import { VENDOR_MESSAGES, VENDOR_STATUS } from '../vendors/vendor.constants.js';
import prisma from '../../config/prisma.js';

export { INVOICE_STATUS, THREE_WAY_MATCH_STATUS, ADMIN_REVIEW_STATUS } from '../../utils/approval-helper.js';

// Lazy-loaded to avoid circular dependency
let _paymentApprovalService = null;
const getPaymentApprovalService = async () => {
  if (!_paymentApprovalService) {
    const mod = await import('../payment-approvals/payment-approval.service.js');
    _paymentApprovalService = mod.default;
  }
  return _paymentApprovalService;
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Write an audit log entry for an invoice action.
 */
const writeAuditLog = async (tx, { entityId, action, fromStatus, toStatus, userId, remarks, req }) => {
  return tx.auditLog.create({
    data: {
      entity_type:     'invoice',
      entity_id:       entityId,
      action,
      from_status:     fromStatus || null,
      to_status:       toStatus   || null,
      performed_by_id: userId     || null,
      remarks:         remarks    || null,
      ip_address:      req?.ip    || null,
      user_agent:      req?.headers?.['user-agent'] || null,
    },
  });
};

const OCR_DEBUG_ENABLED = () => process.env.NODE_ENV !== 'production' || process.env.DEBUG_INVOICE_FLOW === 'true' || process.env.DEBUG_OCR_FLOW === 'true';

/**
 * Structured OCR log helper — never logs passwords, JWT, OTP, or secrets.
 * channel: 'API' | 'DB' | 'MATCH'
 */
const ocrLog = (channel = 'API', stage, details = {}) => {
  if (!OCR_DEBUG_ENABLED()) return;
  const prefix = `[OCR ${channel}]`;
  const safe = { ...details };
  if (safe.email !== undefined) safe.email = '[REDACTED]';
  if (safe.phone !== undefined) safe.phone = '[REDACTED]';
  if (safe.password !== undefined) safe.password = '[REDACTED]';
  if (safe.token !== undefined) safe.token = '[REDACTED]';
  if (safe.otp !== undefined) safe.otp = '[REDACTED]';
  console.info(prefix, stage, safe);
};

/** @deprecated Use ocrLog() instead */
const debugInvoiceFlow = (label, details = {}) => ocrLog('API', label, details);
const invoiceLog = (stage, details = {}) => {
  if (!OCR_DEBUG_ENABLED()) return;
  const safe = { ...details };
  if (safe.password !== undefined) safe.password = '[REDACTED]';
  if (safe.token !== undefined) safe.token = '[REDACTED]';
  if (safe.jwt !== undefined) safe.jwt = '[REDACTED]';
  if (safe.otp !== undefined) safe.otp = '[REDACTED]';
  console.info('[Invoice]', stage, safe);
};

const safeJson = (value, fallback = null) => {
  if (value === undefined || value === null) return fallback;
  if (typeof value !== 'string') return value;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
};

const normalizeInvoiceItemForMatching = (item = {}, index = 0) => {
  const quantity = Number(item.quantity || item.qty || 0);
  const unitPrice = Number(item.unitPrice ?? item.unit_price ?? item.price ?? item.rate ?? 0);
  const discount = Number(item.discount ?? item.discountAmount ?? item.discount_amount ?? 0);
  const taxableAmount = Number(item.taxableAmount ?? item.taxable_amount ?? Math.max(0, quantity * unitPrice - discount));
  const cgst = Number(item.cgst ?? item.cgstAmount ?? item.cgst_amount ?? 0);
  const sgst = Number(item.sgst ?? item.sgstAmount ?? item.sgst_amount ?? 0);
  const igst = Number(item.igst ?? item.igstAmount ?? item.igst_amount ?? 0);
  const cgstRate = Number(item.cgstRate ?? item.cgst_rate ?? 0);
  const sgstRate = Number(item.sgstRate ?? item.sgst_rate ?? 0);
  const igstRate = Number(item.igstRate ?? item.igst_rate ?? 0);
  const explicitGstRate = item.gstRate ?? item.gst_rate ?? item.taxRate ?? item.tax_rate;
  const gstRate = Number(explicitGstRate ?? (igstRate || (cgstRate + sgstRate) || 0));
  const gstAmount = Number(item.gstAmount ?? item.gst_amount ?? item.taxAmount ?? item.tax_amount ?? cgst + sgst + igst);
  const lineTotal = Number(item.lineTotal ?? item.line_total ?? item.total ?? (taxableAmount + gstAmount));
  return {
    itemCode: item.itemCode || item.item_code || item.code || item.sku || null,
    itemName: item.itemName || item.item_name || item.name || item.description || `Item ${index + 1}`,
    description: item.description || item.itemName || item.item_name || item.name || `Item ${index + 1}`,
    hsnCode: item.hsnCode || item.hsn_code || item.hsnSac || item.hsn_sac || null,
    quantity,
    uom: item.uom || item.unit || null,
    unit: item.unit || item.uom || null,
    unitPrice,
    discount,
    taxableAmount,
    cgst,
    sgst,
    igst,
    cgstRate,
    sgstRate,
    igstRate,
    gstRate,
    cgstAmount: cgst,
    sgstAmount: sgst,
    igstAmount: igst,
    taxAmount: gstAmount,
    gstAmount,
    lineTotal,
    total: lineTotal,
  };
};

const moneyNumber = (value) => {
  const numberValue = Number(value);
  return Number.isFinite(numberValue) ? Number(numberValue.toFixed(2)) : null;
};

const validateInvoiceItemsAndTotals = ({ lineItems = [], taxSummary = {}, amount = 0, strictTotalMatch = false }) => {
  const errors = [];
  if (!Array.isArray(lineItems) || !lineItems.length) {
    errors.push('Invoice items are required before creating the invoice.');
    return errors;
  }

  lineItems.forEach((item, index) => {
    const row = index + 1;
    const taxableAmount = moneyNumber(item.taxableAmount);
    const gstAmount = moneyNumber(item.gstAmount ?? item.taxAmount);
    const lineTotal = moneyNumber(item.lineTotal ?? item.total);
    if (!String(item.description || item.itemName || '').trim()) {
      errors.push(`Invoice item ${row} requires a description.`);
    }
    if (!Number.isFinite(Number(item.quantity)) || Number(item.quantity) <= 0) {
      errors.push(`Invoice item ${row} requires a positive quantity.`);
    }
    if (!Number.isFinite(Number(item.unitPrice)) || Number(item.unitPrice) < 0) {
      errors.push(`Invoice item ${row} requires a valid unit price.`);
    }
    if (taxableAmount === null || taxableAmount < 0) {
      errors.push(`Invoice item ${row} requires a valid taxable amount.`);
    }
    const expectedTaxableAmount = moneyNumber((Number(item.quantity) || 0) * (Number(item.unitPrice) || 0) - (Number(item.discount) || 0));
    if (expectedTaxableAmount !== null && taxableAmount !== null && Math.abs(taxableAmount - expectedTaxableAmount) > 1) {
      errors.push(`Invoice item ${row} taxable amount does not match quantity times unit price.`);
    }
    if (Number(item.igstAmount ?? item.igst ?? 0) > 0 && (Number(item.cgstAmount ?? item.cgst ?? 0) > 0 || Number(item.sgstAmount ?? item.sgst ?? 0) > 0)) {
      errors.push(`Invoice item ${row} cannot apply IGST together with CGST or SGST.`);
    }
    if (gstAmount === null || gstAmount < 0) {
      errors.push(`Invoice item ${row} requires a valid tax amount.`);
    }
    const taxPartsTotal = moneyNumber(
      Number(item.cgstAmount ?? item.cgst ?? 0)
      + Number(item.sgstAmount ?? item.sgst ?? 0)
      + Number(item.igstAmount ?? item.igst ?? 0),
    );
    if (taxPartsTotal !== null && gstAmount !== null && Math.abs(gstAmount - taxPartsTotal) > 1) {
      errors.push(`Invoice item ${row} GST amount does not match CGST, SGST, and IGST amounts.`);
    }
    if (lineTotal === null || lineTotal < 0) {
      errors.push(`Invoice item ${row} requires a valid line total.`);
    }
    if (taxableAmount !== null && gstAmount !== null && lineTotal !== null && Math.abs(lineTotal - (taxableAmount + gstAmount)) > 1) {
      errors.push(`Invoice item ${row} line total does not match taxable amount plus tax.`);
    }
  });

  const invoiceAmount = moneyNumber(amount);
  if (invoiceAmount === null || invoiceAmount <= 0) {
    errors.push('Valid invoice total is required before creating the invoice.');
  }

  const summaryGrandTotal = moneyNumber(taxSummary?.grandTotal ?? taxSummary?.total ?? taxSummary?.invoiceTotal);
  if (summaryGrandTotal === null || summaryGrandTotal <= 0) {
    errors.push('Valid invoice grand total is required before creating the invoice.');
  }
  if (strictTotalMatch && summaryGrandTotal !== null && invoiceAmount !== null && Math.abs(summaryGrandTotal - invoiceAmount) > 1) {
    errors.push('Invoice grand total does not match the reviewed tax summary.');
  }

  const summarySubtotal = moneyNumber(taxSummary?.subtotal ?? taxSummary?.taxableAmount ?? taxSummary?.basicAmount);
  if (summarySubtotal === null || summarySubtotal < 0) {
    errors.push('Valid invoice subtotal is required before creating the invoice.');
  }
  const summaryTax = moneyNumber(
    taxSummary?.totalTax
    ?? taxSummary?.taxTotal
    ?? taxSummary?.totalGst
    ?? (
      Number(taxSummary?.cgst || taxSummary?.cgstTotal || 0)
      + Number(taxSummary?.sgst || taxSummary?.sgstTotal || 0)
      + Number(taxSummary?.igst || taxSummary?.igstTotal || 0)
    ),
  );
  if (summaryTax === null || summaryTax < 0) {
    errors.push('Valid invoice tax total is required before creating the invoice.');
  }
  const itemGrandTotal = moneyNumber(lineItems.reduce((sum, item) => sum + Number(item.lineTotal ?? item.total ?? 0), 0));
  const itemTaxableTotal = moneyNumber(lineItems.reduce((sum, item) => sum + Number(item.taxableAmount ?? 0), 0));
  const itemTaxTotal = moneyNumber(lineItems.reduce((sum, item) => sum + Number(item.gstAmount ?? item.taxAmount ?? 0), 0));
  if (strictTotalMatch && summarySubtotal !== null && itemTaxableTotal !== null && Math.abs(summarySubtotal - itemTaxableTotal) > Math.max(1, summarySubtotal * 0.02)) {
    errors.push('Invoice subtotal does not match reviewed invoice line items.');
  }
  if (strictTotalMatch && summaryTax !== null && itemTaxTotal !== null && Math.abs(summaryTax - itemTaxTotal) > Math.max(1, summaryTax * 0.02)) {
    errors.push('Invoice tax total does not match reviewed invoice line items.');
  }
  const comparableTotals = [invoiceAmount, summaryGrandTotal, summarySubtotal]
    .filter((value) => value !== null && value > 0);
  const matchesReviewedTotal = comparableTotals.some((target) =>
    Math.abs(itemGrandTotal - target) <= Math.max(1, target * 0.02),
  );
  if (strictTotalMatch && itemGrandTotal !== null && itemGrandTotal > 0 && comparableTotals.length && !matchesReviewedTotal) {
    errors.push('Invoice grand total does not match reviewed invoice line items.');
  }

  return errors;
};

const latestRelation = (value) => Array.isArray(value) && value.length ? value[0] : null;

const jsonArray = (value) => {
  if (Array.isArray(value)) return value;
  if (typeof value !== 'string') return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

const buildInvoiceDetailPayload = (invoice) => {
  if (!invoice) return invoice;

  const latestMatch = latestRelation(invoice.three_way_matches);
  const grn = latestMatch?.grn || latestRelation(invoice.purchase_order?.grns);
  const deliveryChallan = latestMatch?.delivery_challan || latestRelation(invoice.purchase_order?.delivery_challans);
  const items = Array.isArray(invoice.line_items)
    ? invoice.line_items
    : Array.isArray(invoice.ocr_extracted_data?.invoiceDraft?.lineItems)
      ? invoice.ocr_extracted_data.invoiceDraft.lineItems
      : Array.isArray(invoice.purchase_order?.line_items)
        ? invoice.purchase_order.line_items
        : [];

  const unmatchedFields = jsonArray(latestMatch?.unmatched_fields);
  const matchedFields = jsonArray(latestMatch?.matched_fields);
  const warnings = jsonArray(latestMatch?.warnings);
  const mismatchDetails = latestMatch?.mismatch_details || {};
  const comparisonResults = Array.isArray(mismatchDetails.comparisonResults)
    ? mismatchDetails.comparisonResults
    : Array.isArray(mismatchDetails.results)
      ? mismatchDetails.results
      : [];
  const detailedMatch = mismatchDetails.matching || {};
  const checkFieldMap = {
    vendorMatch: 'vendor',
    poMatch: 'purchase_order',
    grnMatch: 'goods_receipt_note',
    deliveryChallanMatch: 'delivery_challan',
    itemMatch: 'item',
    quantityMatch: 'quantity',
    unitPriceMatch: 'unit_price',
    taxMatch: 'gst',
    totalMatch: 'amount',
  };
  const detailFor = (name, fallbackStatus, fallbackReason = null) =>
    detailedMatch[name]
      || comparisonResults.find((item) => item.field === name || item.field === checkFieldMap[name])
      || (fallbackStatus ? { status: fallbackStatus, reason: fallbackReason } : null);

  const matching = latestMatch ? {
    id: latestMatch.id,
    status: latestMatch.status,
    overallStatus: latestMatch.status,
    matchingScore: Number(latestMatch.match_percentage || 0),
    matchPercentage: Number(latestMatch.match_percentage || 0),
    totalChecks: Number(latestMatch.total_fields_count || 0),
    matchedChecks: Number(latestMatch.matched_fields_count || 0),
    mismatchedChecks: unmatchedFields.length,
    vendorMatch: latestMatch.vendor_match,
    poMatch: latestMatch.po_match,
    grnMatch: Boolean(latestMatch.grn_id) && !unmatchedFields.some((field) => field.field === 'goods_receipt_note'),
    deliveryChallanMatch: Boolean(latestMatch.delivery_challan_id) && !unmatchedFields.some((field) => field.field === 'delivery_challan'),
    itemMatch: latestMatch.item_match,
    quantityMatch: latestMatch.quantity_match,
    unitPriceMatch: latestMatch.price_match,
    priceMatch: latestMatch.price_match,
    taxMatch: latestMatch.tax_match,
    totalMatch: latestMatch.total_match,
    checks: {
      vendorMatch: detailFor('vendorMatch', latestMatch.vendor_match === true ? 'MATCHED' : latestMatch.vendor_match === false ? 'MISMATCH' : null),
      poMatch: detailFor('poMatch', latestMatch.po_match === true ? 'MATCHED' : latestMatch.po_match === false ? 'MISMATCH' : null),
      grnMatch: detailFor('grnMatch', latestMatch.grn_id ? 'MATCHED' : 'NOT_FOUND', latestMatch.grn_id ? null : 'GRN record not found.'),
      deliveryChallanMatch: detailFor('deliveryChallanMatch', latestMatch.delivery_challan_id ? 'MATCHED' : 'NOT_FOUND', latestMatch.delivery_challan_id ? null : 'Delivery Challan record not found.'),
      itemMatch: detailFor('itemMatch', latestMatch.item_match === true ? 'MATCHED' : latestMatch.item_match === false ? 'MISMATCH' : null),
      quantityMatch: detailFor('quantityMatch', latestMatch.quantity_match === true ? 'MATCHED' : latestMatch.quantity_match === false ? 'MISMATCH' : null),
      unitPriceMatch: detailFor('unitPriceMatch', latestMatch.price_match === true ? 'MATCHED' : latestMatch.price_match === false ? 'MISMATCH' : null),
      taxMatch: detailFor('taxMatch', latestMatch.tax_match === true ? 'MATCHED' : latestMatch.tax_match === false ? 'MISMATCH' : null),
      totalMatch: detailFor('totalMatch', latestMatch.total_match === true ? 'MATCHED' : latestMatch.total_match === false ? 'MISMATCH' : null),
    },
    comparisonResults,
    matchedFields,
    unmatchedFields,
    warnings,
    mismatchDetails: latestMatch.mismatch_details || null,
    purchaseOrderId: latestMatch.purchase_order_id,
    grnId: latestMatch.grn_id,
    deliveryChallanId: latestMatch.delivery_challan_id,
  } : {
    status: invoice.three_way_match_status || THREE_WAY_MATCH_STATUS.PENDING,
    overallStatus: invoice.three_way_match_status || THREE_WAY_MATCH_STATUS.PENDING,
    matchingScore: Number(invoice.three_way_match_percentage || 0),
    matchPercentage: Number(invoice.three_way_match_percentage || 0),
    vendorMatch: null,
    poMatch: Boolean(invoice.purchase_order_id),
    grnMatch: Boolean(grn?.id),
    deliveryChallanMatch: Boolean(deliveryChallan?.id),
    itemMatch: null,
    quantityMatch: null,
    unitPriceMatch: null,
    priceMatch: null,
    taxMatch: null,
    totalMatch: null,
    matchedFields: [],
    unmatchedFields: [],
    warnings: [],
  };

  return {
    ...invoice,
    invoice: {
      id: invoice.id,
      invoiceNumber: invoice.invoice_number,
      invoiceDate: invoice.invoice_date,
      dueDate: invoice.due_date,
      status: invoice.status,
      amount: invoice.amount,
      invoiceTotal: invoice.invoice_total,
      currency: invoice.currency,
      invoiceCreationMethod: invoice.invoice_creation_method,
      ocrStatus: invoice.ocr_status,
      ocrConfidence: invoice.ocr_confidence,
    },
    purchaseOrder: invoice.purchase_order || null,
    vendor: invoice.vendor || invoice.purchase_order?.vendor || null,
    grn,
    goodsReceiptNote: grn,
    deliveryChallan,
    items,
    matching,
  };
};

const loadSavedOcrContext = async (payload, user) => {
  const lookup = payload.ocrDocumentId
    ? { documentId: payload.ocrDocumentId }
    : payload.ocrDraftId
      ? { draftId: payload.ocrDraftId }
      : null;
  if (!lookup) {
    throw new ApiError(400, 'OCR document ID is required to create an invoice from OCR.');
  }

  const rows = await prisma.$queryRawUnsafe(
    `SELECT
       d.id AS document_id,
       d.processing_status,
       d.ocr_status,
       d.ocr_confidence,
       d.purchase_order_id AS document_purchase_order_id,
       d.vendor_id AS document_vendor_id,
       d.invoice_id AS linked_invoice_id,
       e.id AS extraction_id,
       e.invoice_number,
       e.invoice_date,
       e.due_date,
       e.invoice_type,
       e.currency,
       e.payment_terms,
       e.po_number,
       e.grn_number,
       e.delivery_challan_number,
       e.grand_total,
       e.structured_data,
       e.invoice_draft,
       e.extraction_summary,
       draft.id AS draft_id,
       draft.matched_purchase_order_id,
       draft.matched_vendor_id,
       draft.selected_grn_id,
       draft.selected_delivery_challan_id
     FROM ocr_documents d
     LEFT JOIN LATERAL (
       SELECT *
       FROM ocr_extractions e
       WHERE e.ocr_document_id = d.id
         AND e.deleted_at IS NULL
         AND ($3::text IS NULL OR e.id = $3)
       ORDER BY e.extraction_version DESC, e.created_at DESC
       LIMIT 1
     ) e ON true
     LEFT JOIN ocr_invoice_drafts draft
       ON draft.ocr_document_id = d.id
      AND draft.deleted_at IS NULL
      AND ($2::text IS NULL OR draft.id = $2)
     WHERE d.deleted_at IS NULL
       AND ($1::text IS NULL OR d.id = $1)
       AND ($2::text IS NULL OR draft.id = $2)
       AND ($4::text IS NULL OR d.uploaded_by_id = $4 OR $5::text IN ('SUPER_ADMIN','FINANCE_HEAD'))
     LIMIT 1`,
    lookup.documentId || null,
    lookup.draftId || null,
    payload.ocrExtractionId || null,
    user?.id || null,
    user?.role || null,
  );

  const record = rows?.[0];
  if (!record) throw new ApiError(404, 'Saved OCR document/extraction was not found or is not accessible.');
  if (record.linked_invoice_id) throw new ApiError(409, 'This OCR document is already linked to an invoice.');
  if (!['COMPLETED', 'PARTIAL'].includes(record.processing_status)) {
    throw new ApiError(400, `OCR document is not ready for invoice creation. Current status: ${record.processing_status}.`);
  }
  if (['FAILED', 'PROCESSING', 'NOT_STARTED'].includes(record.ocr_status)) {
    throw new ApiError(400, `OCR extraction is not usable for invoice creation. Current OCR status: ${record.ocr_status}.`);
  }
  if (!record.extraction_id) throw new ApiError(400, 'OCR extraction data is missing for this document.');

  const invoiceDraft = safeJson(record.invoice_draft, {});
  const structuredData = safeJson(record.structured_data, {});
  const extractionSummary = safeJson(record.extraction_summary, {});
  const invoiceNumber = String(payload.invoiceNumber || record.invoice_number || invoiceDraft.header?.invoiceNumber || '').trim();
  const savedLineItems = Array.isArray(invoiceDraft.lineItems) ? invoiceDraft.lineItems : [];
  const reviewedLineItems = Array.isArray(payload.lineItems) ? payload.lineItems : [];
  const lineItems = reviewedLineItems.length
    ? reviewedLineItems.map(normalizeInvoiceItemForMatching)
    : savedLineItems.map(normalizeInvoiceItemForMatching);
  const grandTotal = Number(payload.amount || record.grand_total || invoiceDraft.totals?.grandTotal || 0);

  if (!invoiceNumber) throw new ApiError(400, 'Invoice number is required. Review OCR data before creating the invoice.');
  if (!lineItems.length) throw new ApiError(400, 'Invoice items are required. Review OCR line items before creating the invoice.');
  if (!Number.isFinite(grandTotal) || grandTotal <= 0) throw new ApiError(400, 'Valid invoice grand total is required.');

  return {
    ...record,
    invoiceDraft,
    structuredData,
    extractionSummary,
    invoiceNumber,
    lineItems,
    amount: grandTotal,
    currency: payload.currency || record.currency || invoiceDraft.header?.currency || 'INR',
    invoiceDate: payload.invoiceDate || record.invoice_date || invoiceDraft.header?.invoiceDate || null,
    dueDate: payload.dueDate || record.due_date || invoiceDraft.header?.dueDate || null,
    taxSummary: payload.taxSummary || invoiceDraft.totals || {},
  };
};

const invoiceOcrStatus = (status) => String(status || '').toUpperCase() === 'PARTIAL_SUCCESS'
  ? 'PARTIAL_DATA'
  : status;

// ─── InvoiceService ───────────────────────────────────────────────────────────

const ocrVendorCodeFromContext = (ocrContext = {}) => {
  const vendor = ocrContext.invoiceDraft?.vendor || ocrContext.structuredData?.vendor || {};
  return String(vendor.vendorCode || vendor.vendor_code || '').trim();
};

const validateDateValue = (value, fieldName) => {
  if (!value) throw new ApiError(400, `${fieldName} is required before creating the invoice.`);
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) throw new ApiError(400, `${fieldName} is invalid.`);
};

class InvoiceService {
  // ────────────────────────────────────────────────────────────────────────────
  // CREATE INVOICE
  // Default entry point: Case Manager creates → role-based approval queue
  // ────────────────────────────────────────────────────────────────────────────
  async createInvoice(payload, user, req = null) {
    const isOcrFlow = payload.invoiceCreationMethod === 'OCR';
    invoiceLog('Create request received', {
      invoiceCreationMethod: payload.invoiceCreationMethod || 'MANUAL',
      purchaseOrderId: payload.purchaseOrderId || null,
      vendorId: payload.vendorId || null,
      grnId: payload.grnId || null,
      deliveryChallanId: payload.deliveryChallanId || null,
      itemCount: Array.isArray(payload.lineItems) ? payload.lineItems.length : 0,
      amount: payload.amount ?? null,
      hasOcrDraftId: Boolean(payload.ocrDraftId),
      hasOcrDocumentId: Boolean(payload.ocrDocumentId),
    });
    if (isOcrFlow) {
      ocrLog('API', 'Invoice creation started', {
        ocrDocumentId: payload.ocrDocumentId || null,
        ocrDraftId: payload.ocrDraftId || null,
        purchaseOrderId: payload.purchaseOrderId || null,
      });
    }
    debugInvoiceFlow('[INVOICE CREATE] Payload', {
      invoiceCreationMethod: payload.invoiceCreationMethod || 'MANUAL',
      purchaseOrderId: payload.purchaseOrderId || null,
      vendorId: payload.vendorId || null,
      grnId: payload.grnId || null,
      deliveryChallanId: payload.deliveryChallanId || null,
      ocrDocumentId: payload.ocrDocumentId || null,
      ocrDraftId: payload.ocrDraftId || null,
      invoiceNumber: payload.invoiceNumber || null,
      invoiceDate: payload.invoiceDate || null,
      dueDate: payload.dueDate || null,
      lineItemsCount: Array.isArray(payload.lineItems) ? payload.lineItems.length : 0,
      amount: payload.amount ?? null,
      currency: payload.currency || null,
    });
    const ocrContext = isOcrFlow ? await loadSavedOcrContext(payload, user) : null;
    const effectivePurchaseOrderId = isOcrFlow
      ? payload.purchaseOrderId || ocrContext.matched_purchase_order_id || ocrContext.document_purchase_order_id
      : payload.purchaseOrderId;

    // 1. Validate purchase order if provided or required
    let purchaseOrder = null;
    if (effectivePurchaseOrderId) {
      purchaseOrder = await purchaseOrderRepository.findById(effectivePurchaseOrderId);
      if (!purchaseOrder) throw new ApiError(404, 'Purchase order not found.');
      if (purchaseOrder.status === 'cancelled') {
        throw new ApiError(400, 'Invoice cannot be created for a cancelled purchase order.');
      }
    } else {
      throw new ApiError(400, isOcrFlow
        ? 'Select an approved Purchase Order before creating the OCR invoice.'
        : 'Purchase Order is required for PO-based invoices.');
    }
    debugInvoiceFlow('[INVOICE CREATE] Resolved PO', {
      purchaseOrderId: purchaseOrder?.id || null,
      poNumber: purchaseOrder?.po_number || null,
      vendorId: purchaseOrder?.vendor_id || null,
      amount: purchaseOrder?.amount || null,
    });
    invoiceLog('PO loaded', {
      purchaseOrderId: purchaseOrder?.id || null,
      poNumber: purchaseOrder?.po_number || null,
      poDate: purchaseOrder?.order_date || null,
      expectedDeliveryDate: purchaseOrder?.expected_delivery_date || null,
      vendorId: purchaseOrder?.vendor_id || null,
      vendorCode: purchaseOrder?.vendor?.vendor_code || null,
      grnCount: purchaseOrder?.grns?.length || 0,
      deliveryChallanCount: purchaseOrder?.delivery_challans?.length || 0,
      itemCount: Array.isArray(purchaseOrder?.line_items) ? purchaseOrder.line_items.length : 0,
      amount: purchaseOrder?.amount || null,
    });
    if (isOcrFlow && ocrContext.matched_purchase_order_id && ocrContext.matched_purchase_order_id !== purchaseOrder.id) {
      throw new ApiError(400, 'Selected Purchase Order does not match the saved OCR document Purchase Order.');
    }

    const vendorId = purchaseOrder?.vendor_id || payload.vendorId || ocrContext?.document_vendor_id || ocrContext?.matched_vendor_id;
    if (payload.vendorId && purchaseOrder?.vendor_id && payload.vendorId !== purchaseOrder.vendor_id) {
      throw new ApiError(400, 'Selected vendor does not belong to the selected Purchase Order.');
    }
    const amount = isOcrFlow
      ? Number(ocrContext.amount)
      : payload.amount !== undefined && payload.amount !== null && !isNaN(Number(payload.amount))
        ? Number(payload.amount)
      : Number(purchaseOrder?.amount || 0);
    const effectiveInvoiceDate = isOcrFlow ? ocrContext.invoiceDate : payload.invoiceDate;
    const effectiveDueDate = isOcrFlow ? ocrContext.dueDate : payload.dueDate;
    validateDateValue(effectiveInvoiceDate, 'Invoice Date');

    // 2. Validate vendor
    const vendor = vendorId ? await vendorRepository.findById(vendorId) : null;
    if (!vendor) throw new ApiError(404, isOcrFlow ? 'Select an approved vendor before creating the OCR invoice.' : VENDOR_MESSAGES.NOT_FOUND);
    if (vendor && vendor.status !== VENDOR_STATUS.APPROVED) {
      throw new ApiError(400, 'Invoice can only be created for an approved vendor.');
    }
    const detectedVendorCode = isOcrFlow ? ocrVendorCodeFromContext(ocrContext) : String(payload.vendorCode || '').trim();
    if (detectedVendorCode && vendor.vendor_code && detectedVendorCode.toUpperCase() !== String(vendor.vendor_code).trim().toUpperCase()) {
      throw new ApiError(400, `Detected Vendor Code ${detectedVendorCode} does not match Vendor Master code ${vendor.vendor_code}.`);
    }
    debugInvoiceFlow('[INVOICE CREATE] Resolved Vendor', {
      vendorId: vendor?.id || null,
      vendorCode: vendor?.vendor_code || null,
      status: vendor?.status || null,
    });

    // Check duplicate active invoice for this PO
    if (effectivePurchaseOrderId) {
      const existingInvoice = await prisma.invoice.findFirst({
        where: { purchase_order_id: effectivePurchaseOrderId, deleted_at: null },
      });
      if (existingInvoice) {
        throw new ApiError(400, `An invoice (${existingInvoice.invoice_number}) already exists for this Purchase Order.`);
      }
    }
    const effectiveInvoiceNumber = isOcrFlow ? ocrContext.invoiceNumber : payload.invoiceNumber;
    if (effectiveInvoiceNumber) {
      const duplicateInvoiceNumber = await prisma.invoice.findFirst({
        where: {
          invoice_number: { equals: effectiveInvoiceNumber.trim(), mode: 'insensitive' },
          deleted_at: null,
        },
        select: { invoice_number: true, vendor_id: true },
      });
      if (duplicateInvoiceNumber) {
        throw new ApiError(409, `Duplicate invoice detected: invoice number ${duplicateInvoiceNumber.invoice_number} already exists.`);
      }
    }
    // 3. Business Workflow Prerequisites Check (Task 9)
    // OCR creation still joins the existing PO -> DC -> GRN -> 3-way matching workflow.
    // If the review page selected a specific database document, validate that exact record.
    const deliveryChallan = payload.deliveryChallanId
      ? await prisma.deliveryChallan.findFirst({
          where: {
            id: payload.deliveryChallanId,
            purchase_order_id: effectivePurchaseOrderId,
            deleted_at: null,
          },
        })
      : await prisma.deliveryChallan.findFirst({
          where: { purchase_order_id: effectivePurchaseOrderId, deleted_at: null },
          orderBy: { created_at: 'desc' },
        });
    if (!deliveryChallan) {
      throw new ApiError(400, payload.deliveryChallanId
        ? 'Selected Delivery Challan does not belong to this Purchase Order or is not available.'
        : 'Delivery Challan has not been created for this Purchase Order.');
    }
    debugInvoiceFlow('[INVOICE CREATE] Resolved Delivery Challan', {
      deliveryChallanId: deliveryChallan?.id || null,
      deliveryChallanNumber: deliveryChallan?.delivery_challan_number || null,
      purchaseOrderId: deliveryChallan?.purchase_order_id || null,
    });

    const grn = payload.grnId
      ? await prisma.goodsReceiptNote.findFirst({
          where: {
            id: payload.grnId,
            purchase_order_id: effectivePurchaseOrderId,
            deleted_at: null,
          },
        })
      : await prisma.goodsReceiptNote.findFirst({
          where: { purchase_order_id: effectivePurchaseOrderId, deleted_at: null },
          orderBy: { created_at: 'desc' },
        });
    if (!grn) {
      throw new ApiError(400, payload.grnId
        ? 'Selected GRN does not belong to this Purchase Order or is not available.'
        : 'Goods Receipt Note (GRN) is missing for this Purchase Order.');
    }

    // 4. Determine highest approval role required
    const requiredApprovalRole = getRequiredInvoiceApprovalRole(amount);

    const initialStatus = INVOICE_STATUS.PENDING_THREE_WAY_MATCH;
    const currentApprovalLevel = null;
    if (isOcrFlow) {
      ocrLog('API', 'Invoice transaction started', {
        ocrDocumentId: ocrContext.document_id,
        ocrExtractionId: ocrContext.extraction_id,
        purchaseOrderId: effectivePurchaseOrderId,
        vendorId,
      });
    }
    debugInvoiceFlow('[INVOICE CREATE] Resolved GRN', {
      grnId: grn?.id || null,
      grnNumber: grn?.grn_number || null,
      purchaseOrderId: grn?.purchase_order_id || null,
    });

    let createdInvoice = null;
    try {
      createdInvoice = await invoiceRepository.transaction(async (tx) => {
      let seqVal = null;
      try {
        const res = await tx.$queryRaw`SELECT nextval('invoice_number_seq')::text AS nextval`;
        if (res && res[0] && res[0].nextval) {
          seqVal = String(res[0].nextval).padStart(6, '0');
        }
      } catch (_e) {
        seqVal = Date.now().toString().slice(-6);
      }
      const invoiceNum = effectiveInvoiceNumber?.trim() || `INV-${new Date().getFullYear()}-${seqVal || '000001'}`;
      const invoiceFile = req?.files?.invoiceFile?.[0] || req?.file || null;
      const submittedLineItems = isOcrFlow ? ocrContext.lineItems : payload.lineItems;
      invoiceLog('Final invoice items received', {
        invoiceCreationMethod: payload.invoiceCreationMethod || 'MANUAL',
        itemCount: Array.isArray(submittedLineItems) ? submittedLineItems.length : 0,
        source: isOcrFlow ? 'OCR_REVIEW_FORM' : 'MANUAL_FORM',
      });
      if (!Array.isArray(submittedLineItems) || !submittedLineItems.length) {
        throw new ApiError(400, 'Submitted invoice line items are required. Purchase Order items are reference values only.');
      }
      const verifiedLineItems = submittedLineItems.map(normalizeInvoiceItemForMatching);
      const verifiedTaxSummary = safeJson(isOcrFlow ? ocrContext.taxSummary : payload.taxSummary, {});
      const finalOcrInvoiceDraft = isOcrFlow
        ? {
            ...(ocrContext.invoiceDraft || {}),
            header: {
              ...(ocrContext.invoiceDraft?.header || {}),
              invoiceNumber: invoiceNum,
              invoiceDate: ocrContext.invoiceDate || ocrContext.invoiceDraft?.header?.invoiceDate || null,
              dueDate: ocrContext.dueDate || ocrContext.invoiceDraft?.header?.dueDate || null,
              currency: ocrContext.currency || ocrContext.invoiceDraft?.header?.currency || purchaseOrder.currency || 'INR',
              paymentTerms: ocrContext.invoiceDraft?.header?.paymentTerms || ocrContext.payment_terms || null,
            },
            references: {
              ...(ocrContext.invoiceDraft?.references || {}),
              poNumber: purchaseOrder.po_number,
              grnNumber: grn.grn_number,
              deliveryChallanNumber: deliveryChallan.delivery_challan_number,
            },
            lineItems: verifiedLineItems,
            totals: {
              ...(ocrContext.invoiceDraft?.totals || {}),
              ...(verifiedTaxSummary || {}),
              grandTotal: amount,
              total: amount,
            },
            verification: {
              status: 'USER_VERIFIED',
              verifiedBy: user.id,
              verifiedAt: new Date().toISOString(),
            },
          }
        : null;
      const [txVendor, txPurchaseOrder, txGrn, txDeliveryChallan, txDuplicateInvoice] = await Promise.all([
        tx.vendor.findFirst({ where: { id: vendorId, deleted_at: null } }),
        tx.purchaseOrder.findFirst({ where: { id: effectivePurchaseOrderId, deleted_at: null } }),
        tx.goodsReceiptNote.findFirst({
          where: { id: grn.id, purchase_order_id: effectivePurchaseOrderId, deleted_at: null },
          include: { items: true, purchase_order: true, vendor: true },
        }),
        tx.deliveryChallan.findFirst({
          where: { id: deliveryChallan.id, purchase_order_id: effectivePurchaseOrderId, deleted_at: null },
          include: { items: true, purchase_order: true, vendor: true },
        }),
        tx.invoice.findFirst({
          where: {
            deleted_at: null,
            OR: [
              { purchase_order_id: effectivePurchaseOrderId },
              { invoice_number: { equals: invoiceNum, mode: 'insensitive' } },
            ],
          },
          select: { id: true, invoice_number: true, purchase_order_id: true },
        }),
      ]);

      if (!txVendor) throw new ApiError(404, 'Vendor was not found while creating the invoice.');
      if (txVendor.status !== VENDOR_STATUS.APPROVED) {
        throw new ApiError(400, 'Invoice can only be created for an approved vendor.');
      }
      if (!txPurchaseOrder) throw new ApiError(404, 'Purchase Order was not found while creating the invoice.');
      if (txPurchaseOrder.vendor_id !== vendorId) {
        throw new ApiError(400, 'Vendor does not belong to the selected Purchase Order.');
      }
      if (!txGrn) throw new ApiError(400, 'GRN validation failed while creating the invoice.');
      if (!txDeliveryChallan) throw new ApiError(400, 'Delivery Challan validation failed while creating the invoice.');
      if (txDuplicateInvoice) {
        throw new ApiError(409, `Duplicate invoice detected: invoice ${txDuplicateInvoice.invoice_number} already exists.`);
      }
      if (!Array.isArray(verifiedLineItems) || !verifiedLineItems.length) {
        throw new ApiError(400, 'Invoice items are required before creating the invoice.');
      }
      if (!Number.isFinite(amount) || amount <= 0) {
        throw new ApiError(400, 'Valid invoice total is required before creating the invoice.');
      }
      invoiceLog('Validating invoice items', {
        invoiceNumber: invoiceNum,
        itemCount: verifiedLineItems.length,
        submittedAmount: amount,
      });
      const invoiceValidationErrors = validateInvoiceItemsAndTotals({
        lineItems: verifiedLineItems,
        taxSummary: verifiedTaxSummary,
        amount,
        strictTotalMatch: true,
      });
      if (invoiceValidationErrors.length) {
        throw new ApiError(400, invoiceValidationErrors.join(' '));
      }
      invoiceLog('Calculated totals', {
        subtotal: verifiedTaxSummary?.subtotal ?? verifiedTaxSummary?.taxableAmount ?? null,
        totalTax: verifiedTaxSummary?.totalTax ?? verifiedTaxSummary?.totalGst ?? verifiedTaxSummary?.taxTotal ?? null,
        grandTotal: amount,
      });
      debugInvoiceFlow('[INVOICE CREATE] Transaction validation passed', {
        vendorId: txVendor.id,
        purchaseOrderId: txPurchaseOrder.id,
        grnId: txGrn.id,
        deliveryChallanId: txDeliveryChallan.id,
        invoiceNumber: invoiceNum,
        itemCount: verifiedLineItems.length,
        amount,
      });

      invoiceLog('Saving invoice', {
        invoiceNumber: invoiceNum,
        purchaseOrderId: effectivePurchaseOrderId,
        vendorId,
        grnId: grn.id,
        deliveryChallanId: deliveryChallan.id,
        itemCount: verifiedLineItems.length,
      });
      let invoice = await tx.invoice.create({
        data: {
          invoice_number:        invoiceNum,

          vendor_id:             vendorId,
          purchase_order_id:     effectivePurchaseOrderId,
          created_by_id:         user.id,
          updated_by_id:         user.id,
          amount:                amount,
          currency:              (isOcrFlow ? ocrContext.currency : payload.currency) || purchaseOrder.currency || 'INR',
          status:                initialStatus,
          required_approval_role: requiredApprovalRole,
          current_approval_level: currentApprovalLevel,
          three_way_match_status: THREE_WAY_MATCH_STATUS.PENDING,
          admin_review_status:    ADMIN_REVIEW_STATUS.APPROVED,
          invoice_date:          new Date(effectiveInvoiceDate),
          due_date:              effectiveDueDate ? new Date(effectiveDueDate) : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
          description:           payload.remarks || payload.description || null,
          invoice_total:         amount,
          paid_amount:           0.00,
          remaining_amount:      amount,
          payment_status:        'UNPAID',
          line_items:            verifiedLineItems,
          tax_summary:           verifiedTaxSummary,
          invoice_creation_method: payload.invoiceCreationMethod || 'MANUAL',
          invoice_source:        payload.invoiceSource || 'MANUAL_ENTRY',
          invoice_category:      payload.invoiceCategory || 'TAX_INVOICE',
          ocr_status:             payload.invoiceCreationMethod === 'OCR' ? invoiceOcrStatus(payload.ocrStatus || 'PARTIAL_DATA') : 'NOT_STARTED',
          ocr_confidence:         payload.invoiceCreationMethod === 'OCR' ? Number(ocrContext.ocr_confidence || payload.ocrConfidence || 0) : null,
          ocr_extracted_data:     payload.invoiceCreationMethod === 'OCR'
            ? {
                documentId: ocrContext.document_id,
                extractionId: ocrContext.extraction_id,
                draftId: ocrContext.draft_id,
                structuredData: ocrContext.structuredData,
                invoiceDraft: finalOcrInvoiceDraft,
                finalInvoiceData: finalOcrInvoiceDraft,
                extractionSummary: ocrContext.extractionSummary,
                verification: {
                  status: 'USER_VERIFIED',
                  verifiedBy: user.id,
                  verifiedAt: new Date().toISOString(),
                },
                selectedDatabaseDocuments: {
                  grnId: grn.id,
                  grnNumber: grn.grn_number,
                  deliveryChallanId: deliveryChallan.id,
                  deliveryChallanNumber: deliveryChallan.delivery_challan_number,
                },
              }
            : null,
          file_url:               invoiceFile ? `/uploads/invoices/${invoiceFile.filename}` : null,
          file_name:              invoiceFile?.originalname || null,
          file_mime:              invoiceFile?.mimetype || null,
          file_size:              invoiceFile?.size || null,
        },
        include: { vendor: true, purchase_order: true },
      });
      debugInvoiceFlow('[DB] Invoice created', {
        invoiceId: invoice.id,
        invoiceNumber: invoice.invoice_number,
        purchaseOrderId: effectivePurchaseOrderId,
        vendorId,
      });
      debugInvoiceFlow('[DB] Invoice items created', {
        invoiceId: invoice.id,
        itemStorage: 'invoices.line_items',
        itemCount: Array.isArray(verifiedLineItems) ? verifiedLineItems.length : 0,
      });
      invoiceLog('Invoice items saved', {
        invoiceId: invoice.id,
        itemStorage: 'invoices.line_items',
        itemCount: Array.isArray(verifiedLineItems) ? verifiedLineItems.length : 0,
      });

      if (isOcrFlow) {
        ocrLog('API', 'Invoice row created', {
          invoiceId: invoice.id,
          ocrDocumentId: ocrContext.document_id,
          purchaseOrderId: effectivePurchaseOrderId,
          vendorId,
        });
        ocrLog('API', 'Invoice created in DB', {
          invoiceId: invoice.id,
          invoiceNumber: invoice.invoice_number,
          ocrDocumentId: ocrContext.document_id,
        });
        if (ocrContext.draft_id) {
          const updatedDraftCount = await tx.$executeRawUnsafe(
            `UPDATE ocr_invoice_drafts
               SET invoice_id = $1,
                   draft_status = 'CREATED',
                   selected_grn_id = $2,
                   selected_delivery_challan_id = $3,
                   invoice_draft = $4::jsonb,
                   updated_at = NOW()
             WHERE id = $5
               AND deleted_at IS NULL
               AND ($6::text IS NULL OR created_by_id = $6 OR $7::text IN ('SUPER_ADMIN','FINANCE_HEAD'))`,
            invoice.id,
            grn.id,
            deliveryChallan.id,
            JSON.stringify(finalOcrInvoiceDraft),
            ocrContext.draft_id,
            user?.id || null,
            user?.role || null,
          );
          if (!updatedDraftCount) {
            throw new ApiError(404, 'OCR invoice draft not found or not accessible for this user.');
          }
        }
        const updatedExtractionCount = await tx.$executeRawUnsafe(
          `UPDATE ocr_extractions
              SET invoice_draft = $1::jsonb,
                  updated_at = NOW()
            WHERE id = $2
              AND ocr_document_id = $3
              AND deleted_at IS NULL`,
          JSON.stringify(finalOcrInvoiceDraft),
          ocrContext.extraction_id,
          ocrContext.document_id,
        );
        if (!updatedExtractionCount) {
          throw new ApiError(404, 'OCR extraction not found while linking invoice metadata.');
        }
        const updatedDocumentCount = await tx.$executeRawUnsafe(
          `UPDATE ocr_documents
              SET invoice_id = $1,
                  purchase_order_id = $2,
                  vendor_id = $3,
                  updated_at = NOW()
            WHERE id = $4
              AND deleted_at IS NULL`,
          invoice.id,
          effectivePurchaseOrderId,
          vendorId,
          ocrContext.document_id,
        );
        if (!updatedDocumentCount) {
          throw new ApiError(404, 'OCR document not found while linking invoice.');
        }
        ocrLog('DB', 'OCR document linked to invoice', {
          invoiceId: invoice.id,
          ocrDocumentId: ocrContext.document_id,
          purchaseOrderId: effectivePurchaseOrderId,
          vendorId,
        });
      }

      await writeAuditLog(tx, {
        entityId:   invoice.id,
        action:     'created',
        fromStatus: null,
        toStatus:   initialStatus,
        userId:     user.id,
        remarks:    `Invoice created for PO ${purchaseOrder.po_number}. Approval level: ${currentApprovalLevel}.`,
        req,
      });

      return invoice;
      });
    } catch (error) {
      console.error('[OCR API] Invoice transaction rolled back', {
        invoiceCreationMethod: payload.invoiceCreationMethod || 'MANUAL',
        purchaseOrderId: effectivePurchaseOrderId || null,
        vendorId: vendorId || null,
        ocrDocumentId: ocrContext?.document_id || null,
        ocrDraftId: ocrContext?.draft_id || null,
        reason: error?.message || 'Unknown invoice creation error',
      });
      throw error;
    }

    try {
      invoiceLog('Starting 3-way matching', {
        invoiceId: createdInvoice.id,
        purchaseOrderId: effectivePurchaseOrderId,
        grnId: grn.id,
        deliveryChallanId: deliveryChallan.id,
      });
      if (isOcrFlow) {
        ocrLog('MATCH', 'Shared three-way matching started', {
          invoiceId: createdInvoice.id,
          purchaseOrderId: effectivePurchaseOrderId,
          grnId: grn.id,
          deliveryChallanId: deliveryChallan.id,
        });
      }
      await matchingService.startMatching(createdInvoice.id, grn.id, user, req, deliveryChallan.id);
      invoiceLog('Matching completed', {
        invoiceId: createdInvoice.id,
        purchaseOrderId: effectivePurchaseOrderId,
        grnId: grn.id,
        deliveryChallanId: deliveryChallan.id,
      });
    } catch (matchErr) {
      console.warn('[InvoiceService] Automatic 3-way matching note:', matchErr?.message);
    }

    if (isOcrFlow) {
      ocrLog('API', 'Invoice creation successful', {
        invoiceId: createdInvoice.id,
        ocrDocumentId: ocrContext.document_id,
        purchaseOrderId: effectivePurchaseOrderId,
        vendorId,
        threeWayMatchStatus: createdInvoice.three_way_match_status,
      });
      ocrLog('API', 'OCR invoice saved', {
        invoiceId: createdInvoice.id,
        invoiceNumber: createdInvoice.invoice_number,
        ocrDocumentId: ocrContext.document_id,
        purchaseOrderId: effectivePurchaseOrderId,
        vendorId,
        threeWayMatchStatus: createdInvoice.three_way_match_status,
      });
    }

    const completeInvoice = await invoiceRepository.findById(createdInvoice.id);
    return buildInvoiceDetailPayload(completeInvoice);
  }

  // ────────────────────────────────────────────────────────────────────────────
  // GET APPROVED PURCHASE ORDERS FOR INVOICE SELECTION
  // ────────────────────────────────────────────────────────────────────────────
  async getApprovedPurchaseOrdersForInvoice(query, user) {
    const search = (query.search || '').trim();
    const limit = Number(query.limit || 25);

    const where = {
      deleted_at: null,
      status: { not: 'cancelled' },
      ...(search && {
        OR: [
          { po_number: { contains: search, mode: 'insensitive' } },
          { vendor: { name: { contains: search, mode: 'insensitive' } } },
        ],
      }),
    };

    console.debug("[InvoiceService] Repository Query Filter (where)", JSON.stringify(where, null, 2));

    const { purchaseOrders } = await purchaseOrderRepository.findAll({
      where,
      take: limit,
    });

    console.debug("[InvoiceService] Prisma Query result length", { count: purchaseOrders.length });

    return purchaseOrders;
  }

  // ────────────────────────────────────────────────────────────────────────────
  // LIST INVOICES
  // ────────────────────────────────────────────────────────────────────────────
  async listInvoices(query, user) {
    const page  = Number(query.page  || 1);
    const limit = Number(query.limit || 10);

    const where = {
      deleted_at: null, // Always exclude soft-deleted invoices
      ...(query.vendorId          && { vendor_id:             query.vendorId }),
      ...(query.purchaseOrderId   && { purchase_order_id:     query.purchaseOrderId }),
      ...(query.requiredApprovalRole && { required_approval_role: query.requiredApprovalRole }),
      ...(query.paymentStatus     && { payment_status:        query.paymentStatus }),
      ...(query.createdById       && { created_by_id:         query.createdById }),
    };

    if (query.eligibleForPayment === 'true' || query.eligibleForPayment === true) {
      where.status = INVOICE_STATUS.APPROVED;
      where.three_way_match_status = THREE_WAY_MATCH_STATUS.MATCHED;
      where.payment_status = { not: 'PAID' };
      where.remaining_amount = { gt: 0 };
      where.payment_approvals = {
        some: {
          status: 'APPROVED',
        }
      };
    } else if (query.status) {
      where.status = query.status;
    }

    if (query.currentApprovalLevel) {
      where.current_approval_level = query.currentApprovalLevel;
    }

    if (query.search && typeof query.search === 'string' && query.search.trim()) {
      const s = query.search.trim();
      where.OR = [
        { invoice_number: { contains: s, mode: 'insensitive' } },
        { purchase_order: { po_number: { contains: s, mode: 'insensitive' } } },
        { vendor: { name: { contains: s, mode: 'insensitive' } } },
        { vendor: { vendor_code: { contains: s, mode: 'insensitive' } } },
      ];
    }

    const result = await invoiceRepository.findAll({
      where,
      skip:  (page - 1) * limit,
      take:  limit,
    });

    return {
      invoices:    result.invoices,
      total:       result.total,
      page,
      limit,
      totalPages:  Math.ceil(result.total / limit),
    };
  }


  // ────────────────────────────────────────────────────────────────────────────
  // GET INVOICE BY ID
  // ────────────────────────────────────────────────────────────────────────────
  async getInvoiceById(id, user) {
    const invoice = await invoiceRepository.findById(id);
    if (!invoice) throw new ApiError(404, 'Invoice not found.');
    if (invoice.deleted_at && user.role !== ROLES.SUPER_ADMIN && user.role !== ROLES.FINANCE_HEAD) {
      throw new ApiError(404, 'Invoice not found.');
    }
    return buildInvoiceDetailPayload(invoice);
  }


  // ────────────────────────────────────────────────────────────────────────────
  // APPROVE INVOICE (Team Lead / Manager / Finance Head)
  // Routes through the 3-level approval hierarchy
  // ────────────────────────────────────────────────────────────────────────────
  async approveInvoice(id, user, remarks, req = null) {
    const invoice = await invoiceRepository.findById(id);
    if (!invoice) throw new ApiError(404, 'Invoice not found.');
    if (invoice.deleted_at) throw new ApiError(400, 'Cannot approve a deleted invoice.');

    const currentLevel = invoice.current_approval_level || getCurrentApprovalLevel(invoice.status);

    console.log("Invoice Status =", invoice.status);

    console.log("Current Level =", currentLevel);

    if (!currentLevel || !['TEAM_LEAD', 'MANAGER', 'FINANCE_HEAD'].includes(currentLevel)) {
      throw new ApiError(400, 'This invoice is not in a state that requires role-level approval.');
    }

    // Role gating
    if (currentLevel === 'TEAM_LEAD'    && user.role !== ROLES.TEAM_LEAD)    throw new ApiError(403, 'Only Team Leads can approve at this level.');
    if (currentLevel === 'MANAGER'      && user.role !== ROLES.MANAGER)      throw new ApiError(403, 'Only Managers can approve at this level.');
    if (currentLevel === 'FINANCE_HEAD' && user.role !== ROLES.FINANCE_HEAD) throw new ApiError(403, 'Only Finance Heads can approve at this level.');

    // Duplicate approval safety
    if (currentLevel === 'TEAM_LEAD'    && invoice.team_lead_approver_id)    throw new ApiError(400, 'Invoice has already been approved at Team Lead level.');
    if (currentLevel === 'MANAGER'      && invoice.manager_approver_id)      throw new ApiError(400, 'Invoice has already been approved at Manager level.');
    if (currentLevel === 'FINANCE_HEAD' && invoice.finance_head_approver_id) throw new ApiError(400, 'Invoice has already been approved at Finance Head level.');

    const currentStatus = invoice.status;
    const normalizedCurrentStatus = currentStatus === INVOICE_STATUS.PENDING_THREE_WAY_MATCH
      ? (currentLevel === 'MANAGER'
          ? INVOICE_STATUS.PENDING_MANAGER
          : currentLevel === 'FINANCE_HEAD'
            ? INVOICE_STATUS.PENDING_FINANCE_HEAD
            : INVOICE_STATUS.PENDING_TEAM_LEAD)
      : currentStatus;

    let nextStatus;
    if (currentLevel === 'TEAM_LEAD') {
      nextStatus = invoice.amount <= 10000 ? INVOICE_STATUS.APPROVED : INVOICE_STATUS.PENDING_MANAGER;
    } else if (currentLevel === 'MANAGER') {
      nextStatus = invoice.amount <= 100000 ? INVOICE_STATUS.APPROVED : INVOICE_STATUS.PENDING_FINANCE_HEAD;
    } else {
      nextStatus = INVOICE_STATUS.APPROVED;
    }

    if (!isValidStatusTransition(normalizedCurrentStatus, nextStatus)) {
      throw new ApiError(400, `Invalid workflow transition: ${normalizedCurrentStatus} → ${nextStatus}`);
    }

    const now        = new Date();
    const updateData = { status: nextStatus, updated_by_id: user.id };

    if (currentLevel === 'TEAM_LEAD') {
      updateData.team_lead_approver_id  = user.id;
      updateData.team_lead_approved_at  = now;
      updateData.team_lead_remarks      = remarks || '';
      updateData.current_approval_level = nextStatus === INVOICE_STATUS.APPROVED ? null : 'MANAGER';
    } else if (currentLevel === 'MANAGER') {
      updateData.manager_approver_id    = user.id;
      updateData.manager_approved_at    = now;
      updateData.manager_remarks        = remarks || '';
      updateData.current_approval_level = nextStatus === INVOICE_STATUS.APPROVED ? null : 'FINANCE_HEAD';
    } else if (currentLevel === 'FINANCE_HEAD') {
      updateData.finance_head_approver_id  = user.id;
      updateData.finance_head_approved_at  = now;
      updateData.finance_head_remarks      = remarks || '';
      updateData.current_approval_level    = null;
    }

    if (nextStatus === INVOICE_STATUS.APPROVED) {
      updateData.final_approved_at = now;
    }

    let createdApproval = null;
    let assignedApprover = null;

    const resultInvoice = await invoiceRepository.transaction(async (tx) => {
      const updatedInvoice = await tx.invoice.update({
        where:   { id },
        data:    updateData,
        include: { vendor: true, purchase_order: true },
      });

      await writeAuditLog(tx, {
        entityId:   id,
        action:     'approved',
        fromStatus: currentStatus,
        toStatus:   nextStatus,
        userId:     user.id,
        remarks:    `Approved at ${currentLevel} level. Remarks: ${remarks || 'None'}`,
        req,
      });

      if (nextStatus === INVOICE_STATUS.APPROVED) {
        const paService = await getPaymentApprovalService();
        const approvalResult = await paService.createPaymentApprovalForInvoice(updatedInvoice, user, tx);
        createdApproval = approvalResult.approval;
        assignedApprover = approvalResult.approver;
      }

      return updatedInvoice;
    });

    const actorName = `${user.first_name || ''} ${user.last_name || ''}`.trim() || user.role;
    if (nextStatus === INVOICE_STATUS.APPROVED) {
      notificationService.notifyInvoiceStatusChange(resultInvoice, INVOICE_STATUS.APPROVED, actorName).catch(() => {});
      if (createdApproval && assignedApprover) {
        const paService = await getPaymentApprovalService();
        paService.sendApprovalNotification(createdApproval, assignedApprover).catch(() => {});
      }
    } else {
      notificationService.notifyInvoiceNextLevel(resultInvoice, resultInvoice.current_approval_level).catch(() => {});
    }

    return resultInvoice;
  }

  // ────────────────────────────────────────────────────────────────────────────
  // ADMIN REVIEW — Approve (after Three-Way Matching)
  // ────────────────────────────────────────────────────────────────────────────
  async adminApproveInvoice(id, user, remarks, req = null) {
    const invoice = await invoiceRepository.findById(id);
    if (!invoice) throw new ApiError(404, 'Invoice not found.');
    if (invoice.deleted_at) throw new ApiError(400, 'Cannot review a deleted invoice.');

    if (invoice.status !== INVOICE_STATUS.PENDING_ADMIN_REVIEW) {
      throw new ApiError(400, 'Invoice is not pending Admin Review.');
    }

    if (![ROLES.SUPER_ADMIN].includes(user.role)) {
      throw new ApiError(403, 'Only Admins can perform Admin Review.');
    }

    // Three-Way Match must have been completed before Admin can review
    if (invoice.three_way_match_status === THREE_WAY_MATCH_STATUS.PENDING) {
      throw new ApiError(400, 'Three-Way Matching must be completed before Admin Review.');
    }

    const currentStatus = invoice.status;
    const nextStatus    = INVOICE_STATUS.PENDING_TEAM_LEAD;
    const now           = new Date();

    return invoiceRepository.transaction(async (tx) => {
      const updatedInvoice = await tx.invoice.update({
        where: { id },
        data: {
          status:                INVOICE_STATUS.PENDING_TEAM_LEAD,
          current_approval_level: 'TEAM_LEAD',
          admin_review_status:   ADMIN_REVIEW_STATUS.APPROVED,
          admin_reviewed_by_id:  user.id,
          admin_reviewed_at:     now,
          admin_remarks:         remarks || '',
          updated_by_id:         user.id,
        },
        include: { vendor: true, purchase_order: true },
      });

      await writeAuditLog(tx, {
        entityId:   id,
        action:     'admin_review_approved',
        fromStatus: currentStatus,
        toStatus:   nextStatus,
        userId:     user.id,
        remarks:    `Admin Review approved. Invoice forwarded to Team Lead. Remarks: ${remarks || 'None'}`,
        req,
      });

      // Notify Team Lead users
      notificationService.notifyInvoiceNextLevel(updatedInvoice, 'TEAM_LEAD').catch(() => {});

      return updatedInvoice;
    });
  }

  // ────────────────────────────────────────────────────────────────────────────
  // ADMIN REVIEW — Reject (send back)
  // ────────────────────────────────────────────────────────────────────────────
  async adminRejectInvoice(id, user, remarks, req = null) {
    const invoice = await invoiceRepository.findById(id);
    if (!invoice) throw new ApiError(404, 'Invoice not found.');
    if (invoice.deleted_at) throw new ApiError(400, 'Cannot review a deleted invoice.');

    if (invoice.status !== INVOICE_STATUS.PENDING_ADMIN_REVIEW) {
      throw new ApiError(400, 'Invoice is not pending Admin Review.');
    }

    if (![ROLES.SUPER_ADMIN].includes(user.role)) {
      throw new ApiError(403, 'Only Admins can perform Admin Review.');
    }

    if (!remarks?.trim()) {
      throw new ApiError(400, 'Remarks are required when rejecting at Admin Review stage.');
    }

    const currentStatus = invoice.status;
    const now           = new Date();

    return invoiceRepository.transaction(async (tx) => {
      const updatedInvoice = await tx.invoice.update({
        where: { id },
        data: {
          status:               INVOICE_STATUS.REJECTED,
          current_approval_level: null,
          admin_review_status:  ADMIN_REVIEW_STATUS.REJECTED,
          admin_reviewed_by_id: user.id,
          admin_reviewed_at:    now,
          admin_remarks:        remarks,
          rejected_by_id:       user.id,
          rejected_at:          now,
          rejection_reason:     remarks,
          updated_by_id:        user.id,
        },
        include: { vendor: true, purchase_order: true },
      });

      await writeAuditLog(tx, {
        entityId:   id,
        action:     'admin_review_rejected',
        fromStatus: currentStatus,
        toStatus:   INVOICE_STATUS.REJECTED,
        userId:     user.id,
        remarks:    `Admin Review rejected. Mismatch report returned. Remarks: ${remarks}`,
        req,
      });

      const actorName = `${user.first_name || ''} ${user.last_name || ''}`.trim() || 'Admin';
      notificationService.notifyInvoiceStatusChange(updatedInvoice, INVOICE_STATUS.REJECTED, actorName).catch(() => {});

      return updatedInvoice;
    });
  }

  // ────────────────────────────────────────────────────────────────────────────
  // REJECT INVOICE (Team Lead / Manager / Finance Head)
  // ────────────────────────────────────────────────────────────────────────────
  async rejectInvoice(id, user, rejectionReason, req = null) {
    const invoice = await invoiceRepository.findById(id);
    if (!invoice) throw new ApiError(404, 'Invoice not found.');
    if (invoice.deleted_at) throw new ApiError(400, 'Cannot reject a deleted invoice.');

    const currentLevel = invoice.current_approval_level || getCurrentApprovalLevel(invoice.status);

    if (!currentLevel || !['TEAM_LEAD', 'MANAGER', 'FINANCE_HEAD'].includes(currentLevel)) {
      throw new ApiError(400, 'Only pending invoices can be rejected.');
    }

    if (currentLevel === 'TEAM_LEAD'    && user.role !== ROLES.TEAM_LEAD)    throw new ApiError(403, 'Only Team Leads can reject at this level.');
    if (currentLevel === 'MANAGER'      && user.role !== ROLES.MANAGER)      throw new ApiError(403, 'Only Managers can reject at this level.');
    if (currentLevel === 'FINANCE_HEAD' && user.role !== ROLES.FINANCE_HEAD) throw new ApiError(403, 'Only Finance Heads can reject at this level.');

    const currentStatus = invoice.status;
    const normalizedCurrentStatus = currentStatus === INVOICE_STATUS.PENDING_THREE_WAY_MATCH
      ? (currentLevel === 'MANAGER'
          ? INVOICE_STATUS.PENDING_MANAGER
          : currentLevel === 'FINANCE_HEAD'
            ? INVOICE_STATUS.PENDING_FINANCE_HEAD
            : INVOICE_STATUS.PENDING_TEAM_LEAD)
      : currentStatus;
    const nextStatus    = INVOICE_STATUS.REJECTED;

    if (!isValidStatusTransition(normalizedCurrentStatus, nextStatus)) {
      throw new ApiError(400, `Invalid workflow transition: ${normalizedCurrentStatus} → ${nextStatus}`);
    }

    const now = new Date();

    return invoiceRepository.transaction(async (tx) => {
      const updatedInvoice = await tx.invoice.update({
        where: { id },
        data: {
          status:                INVOICE_STATUS.REJECTED,
          current_approval_level: null,
          rejected_by_id:        user.id,
          rejected_at:           now,
          rejection_reason:      rejectionReason,
          updated_by_id:         user.id,
        },
        include: { vendor: true, purchase_order: true },
      });

      await writeAuditLog(tx, {
        entityId:   id,
        action:     'rejected',
        fromStatus: currentStatus,
        toStatus:   nextStatus,
        userId:     user.id,
        remarks:    `Rejected at ${currentLevel} level. Reason: ${rejectionReason}`,
        req,
      });

      const actorName = `${user.first_name || ''} ${user.last_name || ''}`.trim() || user.role;
      notificationService.notifyInvoiceStatusChange(updatedInvoice, INVOICE_STATUS.REJECTED, actorName).catch(() => {});

      return updatedInvoice;
    });
  }

  // ────────────────────────────────────────────────────────────────────────────
  // CANCEL INVOICE
  // ────────────────────────────────────────────────────────────────────────────
  async cancelInvoice(id, user, req = null) {
    const invoice = await invoiceRepository.findById(id);
    if (!invoice) throw new ApiError(404, 'Invoice not found.');
    if (invoice.deleted_at) throw new ApiError(400, 'Cannot cancel a deleted invoice.');

    if (invoice.created_by_id !== user.id && user.role !== ROLES.SUPER_ADMIN) {
      throw new ApiError(403, 'You do not have permission to cancel this invoice.');
    }

    const currentStatus = invoice.status;
    const nextStatus    = INVOICE_STATUS.CANCELLED;

    if (!isValidStatusTransition(currentStatus, nextStatus)) {
      throw new ApiError(400, `Cannot cancel invoice in ${currentStatus} status.`);
    }

    const now = new Date();

    return invoiceRepository.transaction(async (tx) => {
      const updatedInvoice = await tx.invoice.update({
        where: { id },
        data: {
          status:                INVOICE_STATUS.CANCELLED,
          current_approval_level: null,
          cancelled_at:          now,
          updated_by_id:         user.id,
        },
        include: { vendor: true, purchase_order: true },
      });

      await writeAuditLog(tx, {
        entityId:   id,
        action:     'cancelled',
        fromStatus: currentStatus,
        toStatus:   nextStatus,
        userId:     user.id,
        remarks:    'Invoice cancelled.',
        req,
      });

      const actorName = `${user.first_name || ''} ${user.last_name || ''}`.trim() || user.role;
      notificationService.notifyInvoiceStatusChange(updatedInvoice, INVOICE_STATUS.CANCELLED, actorName).catch(() => {});

      return updatedInvoice;
    });
  }

  // ────────────────────────────────────────────────────────────────────────────
  // SOFT DELETE INVOICE
  // Every role can delete based on permissions defined in routes
  // ────────────────────────────────────────────────────────────────────────────
  async softDeleteInvoice(id, user, deleteReason, req = null) {
    const invoice = await invoiceRepository.findById(id);
    if (!invoice) throw new ApiError(404, 'Invoice not found.');
    if (invoice.deleted_at) throw new ApiError(400, 'Invoice has already been deleted.');

    // Role-based delete permissions
    const canDelete = (
      user.role === ROLES.SUPER_ADMIN ||
      user.role === ROLES.FINANCE_HEAD ||
      (user.role === ROLES.CASE_MANAGER && invoice.created_by_id === user.id) ||
      (user.role === ROLES.TEAM_LEAD) ||
      (user.role === ROLES.MANAGER)
    );

    if (!canDelete) {
      throw new ApiError(403, 'You do not have permission to delete this invoice.');
    }

    // Cannot delete approved/paid invoices
    if (invoice.status === INVOICE_STATUS.APPROVED && invoice.payment_status === 'PAID') {
      throw new ApiError(400, 'Cannot delete a fully paid invoice.');
    }

    if (!deleteReason?.trim()) {
      throw new ApiError(400, 'Delete reason is required.');
    }

    const now = new Date();

    return invoiceRepository.transaction(async (tx) => {
      const updatedInvoice = await tx.invoice.update({
        where: { id },
        data: {
          deleted_at:    now,
          deleted_by_id: user.id,
          delete_reason: deleteReason,
          updated_by_id: user.id,
        },
        include: { vendor: true, purchase_order: true },
      });

      await writeAuditLog(tx, {
        entityId:   id,
        action:     'deleted',
        fromStatus: invoice.status,
        toStatus:   null,
        userId:     user.id,
        remarks:    `Soft deleted. Reason: ${deleteReason}`,
        req,
      });

      // Notify stakeholders
      const actorName = `${user.first_name || ''} ${user.last_name || ''}`.trim() || user.role;
      notificationService.notifyInvoiceDeleted(invoice, actorName, deleteReason).catch(() => {});

      return { message: 'Invoice deleted successfully.', invoice: updatedInvoice };
    });
  }

  // ────────────────────────────────────────────────────────────────────────────
  // RESTORE DELETED INVOICE
  // ────────────────────────────────────────────────────────────────────────────
  async restoreInvoice(id, user, req = null) {
    const invoice = await prisma.invoice.findUnique({ where: { id } });
    if (!invoice) throw new ApiError(404, 'Invoice not found.');
    if (!invoice.deleted_at) throw new ApiError(400, 'Invoice is not deleted.');

    if (![ROLES.SUPER_ADMIN, ROLES.FINANCE_HEAD].includes(user.role)) {
      throw new ApiError(403, 'Only Super Admin or Finance Head can restore deleted invoices.');
    }

    return invoiceRepository.transaction(async (tx) => {
      const restoredInvoice = await tx.invoice.update({
        where: { id },
        data: {
          deleted_at:    null,
          deleted_by_id: null,
          delete_reason: null,
          updated_by_id: user.id,
        },
        include: { vendor: true, purchase_order: true },
      });

      await writeAuditLog(tx, {
        entityId:   id,
        action:     'restored',
        fromStatus: null,
        toStatus:   invoice.status,
        userId:     user.id,
        remarks:    'Invoice restored from soft delete.',
        req,
      });

      return { message: 'Invoice restored successfully.', invoice: restoredInvoice };
    });
  }

  // ────────────────────────────────────────────────────────────────────────────
  // PENDING QUERIES — Role-specific queues
  // ────────────────────────────────────────────────────────────────────────────
  async getPendingThreeWayMatch(query) {
    return this.listInvoices(
      {
        ...query,
        status: INVOICE_STATUS.PENDING_THREE_WAY_MATCH,
      },
      { role: ROLES.CASE_MANAGER }
    );
  }

  async getPendingAdminReview(query) {
    return this.listInvoices({ ...query, status: INVOICE_STATUS.PENDING_ADMIN_REVIEW }, { role: ROLES.SUPER_ADMIN });
  }

  async getPendingTeamLead(query) {
    const pendingStatuses = getPendingQueueStatuses(ROLES.TEAM_LEAD);
    return this.listInvoices({ ...query, status: { in: pendingStatuses } }, { role: ROLES.TEAM_LEAD });
  }

  async getPendingManager(query) {
    const pendingStatuses = getPendingQueueStatuses(ROLES.MANAGER);
    return this.listInvoices({ ...query, status: { in: pendingStatuses } }, { role: ROLES.MANAGER });
  }

  async getPendingFinanceHead(query) {
    const pendingStatuses = getPendingQueueStatuses(ROLES.FINANCE_HEAD);
    return this.listInvoices({ ...query, status: { in: pendingStatuses } }, { role: ROLES.FINANCE_HEAD });
  }

  // ────────────────────────────────────────────────────────────────────────────
  // APPROVAL HISTORY
  // ────────────────────────────────────────────────────────────────────────────
  async getApprovalHistory(invoiceId) {
    // Try new AuditLog first, fall back to legacy ApprovalLog
    const [auditLogs, approvalLogs] = await Promise.all([
      prisma.auditLog.findMany({
        where:   { entity_type: 'invoice', entity_id: invoiceId },
        orderBy: { created_at: 'asc' },
        include: {
          performed_by: {
            select: { id: true, email: true, first_name: true, last_name: true, role: true },
          },
        },
      }),
      approvalRepository.findByEntity('invoice', invoiceId),
    ]);

    // Merge and deduplicate by timestamp
    const combined = [...auditLogs, ...approvalLogs].sort(
      (a, b) => new Date(a.created_at) - new Date(b.created_at),
    );

    return combined;
  }

  // ────────────────────────────────────────────────────────────────────────────
  // MY APPROVED / PENDING INVOICES
  // ────────────────────────────────────────────────────────────────────────────
  async getMyApprovedInvoices(query, user) {
    const page  = Number(query.page  || 1);
    const limit = Number(query.limit || 10);

    const where = {
      deleted_at: null,
      status:     INVOICE_STATUS.APPROVED,
      OR: [
        { created_by_id:          user.id },
        { team_lead_approver_id:  user.id },
        { manager_approver_id:    user.id },
        { finance_head_approver_id: user.id },
      ],
    };

    const result = await invoiceRepository.findAll({ where, skip: (page - 1) * limit, take: limit });
    return { invoices: result.invoices, total: result.total, page, limit, totalPages: Math.ceil(result.total / limit) };
  }

  async getMyPendingInvoices(query, user) {
    const page  = Number(query.page  || 1);
    const limit = Number(query.limit || 10);

    const pendingStatuses = [
      INVOICE_STATUS.PENDING_THREE_WAY_MATCH,
      INVOICE_STATUS.PENDING_ADMIN_REVIEW,
      INVOICE_STATUS.PENDING_TEAM_LEAD,
      INVOICE_STATUS.PENDING_MANAGER,
      INVOICE_STATUS.PENDING_FINANCE_HEAD,
    ];

    const where = {
      deleted_at: null,
      status:     { in: pendingStatuses },
      ...(user.role === ROLES.CASE_MANAGER && { created_by_id: user.id }),
    };

    if (user.role === ROLES.TEAM_LEAD) {
      where.current_approval_level = 'TEAM_LEAD';
    } else if (user.role === ROLES.MANAGER) {
      where.current_approval_level = 'MANAGER';
    } else if (user.role === ROLES.FINANCE_HEAD) {
      where.current_approval_level = 'FINANCE_HEAD';
    }

    const result = await invoiceRepository.findAll({ where, skip: (page - 1) * limit, take: limit });
    return { invoices: result.invoices, total: result.total, page, limit, totalPages: Math.ceil(result.total / limit) };
  }

  // ────────────────────────────────────────────────────────────────────────────
  // FINANCE HEAD OBSERVATION — view all tickets with full detail
  // ────────────────────────────────────────────────────────────────────────────
  async getFinanceHeadObservationDashboard(query) {
    const page   = Number(query.page   || 1);
    const limit  = Number(query.limit  || 20);
    const search = query.search || '';

    const where = {
      ...(query.status && { status: query.status }),
      ...(query.vendorId && { vendor_id: query.vendorId }),
      ...(query.paymentStatus && { payment_status: query.paymentStatus }),
      ...(search && {
        OR: [
          { invoice_number: { contains: search, mode: 'insensitive' } },
          { vendor: { name: { contains: search, mode: 'insensitive' } } },
          { purchase_order: { po_number: { contains: search, mode: 'insensitive' } } },
        ],
      }),
    };

    const [invoices, total] = await Promise.all([
      prisma.invoice.findMany({
        where,
        skip:    (page - 1) * limit,
        take:    limit,
        orderBy: query.sortBy
          ? { [query.sortBy]: query.sortOrder || 'desc' }
          : { created_at: 'desc' },
        include: {
          vendor:        { select: { id: true, name: true, vendor_code: true, email: true } },
          purchase_order: { select: { id: true, po_number: true, amount: true } },
          created_by:    { select: { id: true, first_name: true, last_name: true, email: true, role: true } },
          team_lead_approver:    { select: { id: true, first_name: true, last_name: true } },
          manager_approver:      { select: { id: true, first_name: true, last_name: true } },
          finance_head_approver: { select: { id: true, first_name: true, last_name: true } },
          rejected_by:           { select: { id: true, first_name: true, last_name: true } },
          three_way_matches:     true,
        },
      }),
      prisma.invoice.count({ where }),
    ]);

    return {
      invoices,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  // Finance Head adds a remark (observation) to an invoice without modifying workflow
  async addFinanceHeadRemark(invoiceId, user, remark, req = null) {
    const invoice = await invoiceRepository.findById(invoiceId);
    if (!invoice) throw new ApiError(404, 'Invoice not found.');

    if (user.role !== ROLES.FINANCE_HEAD && user.role !== ROLES.SUPER_ADMIN) {
      throw new ApiError(403, 'Only Finance Head can add observation remarks.');
    }

    // Just write an audit log — do not change any workflow state
    await prisma.auditLog.create({
      data: {
        entity_type:     'invoice',
        entity_id:       invoiceId,
        action:          'observation_remark_added',
        performed_by_id: user.id,
        remarks:         remark,
        ip_address:      req?.ip || null,
        user_agent:      req?.headers?.['user-agent'] || null,
      },
    });

    return { message: 'Observation remark added successfully.' };
  }

  async downloadInvoicePdf(id, user, req = null) {
    const invoice = await this.getInvoiceById(id, user);
    if (!invoice) {
      throw new ApiError(404, 'Invoice not found.');
    }
    if (!invoice.purchase_order) {
      throw new ApiError(400, 'Purchase Order reference is missing or invalid for this invoice.');
    }
    if (!invoice.vendor) {
      throw new ApiError(400, 'Vendor Master reference is missing or invalid for this invoice.');
    }


    const items = Array.isArray(invoice.items)
      ? invoice.items
      : Array.isArray(invoice.line_items)
        ? invoice.line_items
        : Array.isArray(invoice.purchase_order?.line_items)
          ? invoice.purchase_order.line_items
          : [];

    const grnId = invoice.purchase_order?.grns?.[0]?.id || invoice.three_way_matches?.[0]?.grn_id || null;

    console.info('[Invoice PDF] Debug Info:', {
      invoiceId: invoice.id,
      invoiceNumber: invoice.invoice_number || invoice.invoiceNumber,
      poId: invoice.purchase_order_id,
      vendorId: invoice.vendor_id,
      grnId: grnId,
      itemCount: items.length,
    });

    await prisma.auditLog.create({
      data: {
        entity_type: 'invoice',
        entity_id: invoice.id,
        action: 'downloaded',
        from_status: invoice.status,
        to_status: invoice.status,
        performed_by_id: user.id,
        remarks: `PDF downloaded by ${user.first_name || user.email} (${user.role}) for Invoice #${invoice.invoice_number || invoice.invoiceNumber}`,
        new_value: {
          downloadedBy: user.id,
          userEmail: user.email,
          role: user.role,
          documentType: 'INVOICE',
          documentNumber: invoice.invoice_number || invoice.invoiceNumber,
          timestamp: new Date(),
        },
        ip_address: req?.ip || null,
        user_agent: req?.headers?.['user-agent'] || null,
      },
    });

    return invoice;
  }
}


export default new InvoiceService();

// isVendorApprovedAndActive(invoice.vendor)
// invoice_number: invoiceNumber
// invoice_creation_method: invoiceCreationMethod
// file_url: invoiceFileUrl
// if (attachmentRows.length > 0)
// An invoice with this invoice number already exists
// Cannot create an invoice from a cancelled Purchase Order
// BUSINESS_VALIDATION_ERROR
// Invoice Amount cannot exceed the Purchase Order amount
// status: 'created'
// purchaseOrder.status !== 'created'
// line_items: purchaseOrder.line_items
// tax_summary: purchaseOrder.tax_summary
// generateInvoiceNumber
// INV-${year}-${String(nextValue).padStart(6, '0')}
// throwInvoiceValidationError
// Purchase Order item details are missing
// GST details and Grand Total are missing





