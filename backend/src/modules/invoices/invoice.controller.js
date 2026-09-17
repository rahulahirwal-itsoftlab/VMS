import asyncHandler from '../../middleware/asyncHandler.middleware.js';
import invoiceService from './invoice.service.js';
import { generateInvoicePdf } from './invoice.pdf.js';
import { processInvoiceOcr as processInvoiceOcrService } from './invoice.ocr.service.js';
import invoiceOcrPersistenceService from './invoice.ocr.persistence.service.js';
import invoiceOcrJobService from './invoice.ocr.job.service.js';
import purchaseOrderService from '../purchase-orders/po.service.js';
import { COMPANY_CONFIG } from '../../config/company.js';
import ApiError from '../../utils/ApiError.js';
import prisma from '../../config/prisma.js';
import { compareThreeWayDocuments } from '../three-way-matching/matching.utils.js';

const OCR_DEBUG_ENABLED = () => process.env.NODE_ENV !== 'production' || process.env.DEBUG_INVOICE_FLOW === 'true' || process.env.DEBUG_OCR_FLOW === 'true';

/**
 * Structured OCR log helper — never logs passwords, JWT, OTP, or secrets.
 * channel: 'API' | 'DB' | 'MATCH' | 'UI'
 */
const ocrLog = (channel = 'API', stage, details = {}) => {
  if (!OCR_DEBUG_ENABLED()) return;
  const normalizedStage = String(stage || '').toUpperCase();
  const prefix = normalizedStage.includes('VENDOR')
    ? '[OCR VENDOR LOOKUP]'
    : normalizedStage.includes('PO ')
      || normalizedStage.includes('PURCHASE ORDER')
      ? '[OCR PO LOOKUP]'
      : normalizedStage.includes('GRN')
        ? '[OCR GRN LOOKUP]'
        : normalizedStage.includes('DELIVERY CHALLAN') || normalizedStage.includes('DC ')
          ? '[OCR DC LOOKUP]'
          : normalizedStage.includes('ENRICH') || normalizedStage.includes('DRAFT')
            ? '[OCR ENRICHMENT]'
            : `[OCR ${channel}]`;
  const safe = { ...details };
  // Redact sensitive fields
  if (safe.email !== undefined) safe.email = '[REDACTED]';
  if (safe.phone !== undefined) safe.phone = '[REDACTED]';
  if (safe.password !== undefined) safe.password = '[REDACTED]';
  if (safe.token !== undefined) safe.token = '[REDACTED]';
  if (safe.otp !== undefined) safe.otp = '[REDACTED]';
  console.info(prefix, stage, safe);
};

/** Truncates large raw text fields to keep logs readable. */
const summarizeExtractedForLog = (value = {}) => {
  if (!value || typeof value !== 'object') return value;
  return {
    ...value,
    rawText: value.rawText
      ? { length: String(value.rawText).length, preview: String(value.rawText).slice(0, 200) }
      : null,
    rawTextSummary: value.rawTextSummary
      ? { length: String(value.rawTextSummary).length, preview: String(value.rawTextSummary).slice(0, 200) }
      : null,
  };
};
const buildSafeOcrResponseLog = (payload = {}) => ({
  ...payload,
  ocrData: summarizeExtractedForLog(payload.ocrData),
  extractedData: summarizeExtractedForLog(payload.extractedData),
});
/** @deprecated Use ocrLog() instead */
const debugOcrFlow = (label, details = {}) => ocrLog('API', label, details);
const perfTime = (label) => {
  try { console.time(label); } catch {}
};
const perfTimeEnd = (label) => {
  try { console.timeEnd(label); } catch {}
};
const hasValue = (value) => value !== undefined && value !== null && value !== '';
const compactIdentifier = (value) => String(value || '').trim().replace(/\s+/g, '').toUpperCase();
const uniqueValues = (values) => [...new Set(values.filter(hasValue))];
const lookupText = (value) => String(value || '').trim().replace(/\s+/g, ' ');
const lookupDigits = (value) => String(value || '').replace(/\D+/g, '');
const isUuid = (value) => /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(value || '').trim());
const identifierLookupVariants = (value) => {
  const raw = String(value || '').trim();
  if (!raw) return [];
  const compact = compactIdentifier(raw);
  return uniqueValues([
    raw,
    compact,
    compact.replace(/^([A-Z]+)(\d+)$/, '$1-$2'),
    compact.replace(/^(PO)(\d{4})(\d+)$/i, '$1/$2/$3'),
    compact.replace(/-/g, '/'),
    compact.replace(/\//g, '-'),
    compact.replace(/[./_-]/g, ''),
    raw.replace(/\s*([/._-])\s*/g, '$1'),
  ]);
};
const insensitiveEqualsAny = (field, values) => ({
  OR: identifierLookupVariants(values).map((value) => ({ [field]: { equals: value, mode: 'insensitive' } })),
});
const poNumberMatches = (actual, expected) => {
  const actualVariants = new Set(identifierLookupVariants(actual).map(compactIdentifier));
  return identifierLookupVariants(expected).some((candidate) => actualVariants.has(compactIdentifier(candidate)));
};
export const buildVendorLookupAttempts = (vendor = {}) => {
  const vendorCode = lookupText(vendor.vendorCode || vendor.vendor_code);
  const vendorId = lookupText(vendor.vendorId || vendor.vendor_id || vendor.id);
  const gst = lookupText(vendor.gstin || vendor.gstNumber || vendor.gst_number || vendor.gst);
  const pan = lookupText(vendor.pan || vendor.panNumber || vendor.pan_number);
  const email = lookupText(vendor.email).toLowerCase();
  const rawPhone = lookupText(vendor.phone || vendor.mobile || vendor.contactPhone);
  const phoneDigits = lookupDigits(rawPhone);
  const phoneValues = uniqueValues([
    rawPhone,
    phoneDigits,
    phoneDigits.length > 10 ? phoneDigits.slice(-10) : null,
  ]);
  const companyName = lookupText(vendor.vendorName || vendor.companyName || vendor.name || vendor.supplierName);

  return [
    vendorCode && {
      method: 'VENDOR_CODE',
      value: vendorCode,
      where: insensitiveEqualsAny('vendor_code', vendorCode),
    },
    gst && {
      method: 'GST',
      value: gst,
      where: {
        OR: [
          { gst_number: { equals: gst, mode: 'insensitive' } },
          { tax_id: { equals: gst, mode: 'insensitive' } },
        ],
      },
    },
    vendorId && {
      method: 'VENDOR_ID',
      value: vendorId,
      where: {
        OR: [
          ...(isUuid(vendorId) ? [{ id: vendorId }] : []),
          { vendor_code: { equals: vendorId, mode: 'insensitive' } },
        ],
      },
    },
    companyName && {
      method: 'COMPANY_NAME',
      value: companyName,
      where: { name: { equals: companyName, mode: 'insensitive' } },
    },
    pan && {
      method: 'PAN',
      value: pan,
      where: { pan_number: { equals: pan, mode: 'insensitive' } },
    },
    email && {
      method: 'EMAIL',
      value: email,
      where: { email: { equals: email, mode: 'insensitive' } },
    },
    phoneValues.length && {
      method: 'PHONE',
      value: rawPhone || phoneDigits,
      where: {
        OR: phoneValues.flatMap((phone) => [
          { phone: { contains: phone, mode: 'insensitive' } },
          { alternate_phone: { contains: phone, mode: 'insensitive' } },
        ]),
      },
    },
    companyName && {
      method: 'COMPANY_NAME_CONTAINS',
      value: companyName,
      where: { name: { contains: companyName, mode: 'insensitive' } },
    },
  ].filter(Boolean);
};
const findApprovedVendorByCandidates = async ({ candidates, approvedVendorFilter, ocrDocumentId }) => {
  if (!candidates.length) return { vendor: null, method: null, value: null };
  const startedAt = Date.now();
  ocrLog('DB', 'Vendor lookup started', {
    ocrDocumentId,
    lookupOrder: candidates.map((c) => c.method),
    candidateCount: candidates.length,
  });
  const results = await Promise.all(candidates.map(async (candidate) => {
    const vendor = await prisma.vendor.findFirst({
      where: { ...candidate.where, ...approvedVendorFilter },
    });
    return { candidate, vendor };
  }));
  const selected = results.find((result) => result.vendor);
  ocrLog('DB', 'Vendor lookup completed', {
    ocrDocumentId,
    attempted: candidates.length,
    elapsedMs: Date.now() - startedAt,
    matchMethod: selected?.candidate?.method || null,
    matchValue: selected && !['EMAIL', 'PHONE'].includes(selected.candidate.method)
      ? selected.candidate.value
      : '[REDACTED]',
    found: Boolean(selected?.vendor),
    vendorId: selected?.vendor?.id || null,
    vendorCode: selected?.vendor?.vendor_code || null,
  });
  return {
    vendor: selected?.vendor || null,
    method: selected?.candidate?.method || null,
    value: selected?.candidate?.value || null,
  };
};
const isoDate = (value) => {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString().slice(0, 10);
};
const nestedSource = (sources, section, field, source) => {
  sources[section] ||= {};
  sources[section][field] = source;
};
const sameDraftValue = (left, right) => String(left ?? '')
  .trim()
  .replace(/\s+/g, ' ')
  .toUpperCase() === String(right ?? '')
  .trim()
  .replace(/\s+/g, ' ')
  .toUpperCase();
const mergeDraftValue = (sources, section, field, ocrValue, databaseValue, fallbackValue = null, fallbackSource = null) => {
  if (hasValue(ocrValue)) {
    nestedSource(
      sources,
      section,
      field,
      hasValue(databaseValue) && sameDraftValue(ocrValue, databaseValue)
        ? 'OCR_EXTRACTED_AND_DATABASE_MATCHED'
        : 'OCR_EXTRACTED',
    );
    return ocrValue;
  }
  if (hasValue(databaseValue)) {
    nestedSource(sources, section, field, 'DATABASE_MATCHED');
    return databaseValue;
  }
  if (hasValue(fallbackValue) || fallbackSource) {
    nestedSource(sources, section, field, fallbackSource || 'SYSTEM_GENERATED');
    return fallbackValue;
  }
  nestedSource(sources, section, field, 'NOT_AVAILABLE');
  return null;
};
const normalizeDraftItem = (item = {}) => {
  const quantity = Number(item.quantity ?? item.qty ?? item.ordered_quantity ?? 0);
  const unitPrice = Number(item.unitPrice ?? item.unit_price ?? item.rate ?? 0);
  const taxableAmount = Number(item.taxableAmount ?? item.taxable_amount ?? quantity * unitPrice);
  const gstRate = Number(item.gstRate ?? item.gst_rate ?? item.taxRate ?? item.tax_rate ?? 0);
  const gstAmount = Number(item.gstAmount ?? item.gst_amount ?? item.taxAmount ?? item.tax_amount ?? 0);
  const lineTotal = Number(item.lineTotal ?? item.line_total ?? item.total ?? taxableAmount + gstAmount);
  return {
    description: item.description || item.itemName || item.item_name || item.name || '',
    itemName: item.itemName || item.item_name || item.name || item.description || '',
    itemCode: item.itemCode || item.item_code || item.code || null,
    hsnSac: item.hsnSac || item.hsn_sac || item.hsnCode || item.hsn_code || null,
    quantity,
    unit: item.unit || item.uom || null,
    uom: item.uom || item.unit || null,
    unitPrice,
    discount: Number(item.discount || 0),
    taxableAmount,
    gstRate,
    taxRate: gstRate,
    gstAmount,
    taxAmount: gstAmount,
    cgstRate: Number(item.cgstRate ?? item.cgst_rate ?? 0),
    cgstAmount: Number(item.cgstAmount ?? item.cgst_amount ?? 0),
    sgstRate: Number(item.sgstRate ?? item.sgst_rate ?? 0),
    sgstAmount: Number(item.sgstAmount ?? item.sgst_amount ?? 0),
    igstRate: Number(item.igstRate ?? item.igst_rate ?? 0),
    igstAmount: Number(item.igstAmount ?? item.igst_amount ?? 0),
    cess: Number(item.cess ?? item.cessAmount ?? item.cess_amount ?? 0),
    lineTotal,
    total: lineTotal,
  };
};
const toPlainNumber = (value, fallback = 0) => {
  if (value === undefined || value === null || value === '') return fallback;
  const numberValue = Number(value);
  return Number.isFinite(numberValue) ? numberValue : fallback;
};
const mapDatabaseLineItem = (item = {}) => ({
  id: item.id || null,
  itemCode: item.itemCode || item.item_code || item.code || null,
  itemName: item.itemName || item.item_name || item.name || item.description || null,
  description: item.description || item.itemName || item.item_name || item.name || null,
  hsnSac: item.hsnSac || item.hsn_sac || item.hsnCode || item.hsn_code || null,
  quantity: toPlainNumber(item.quantity ?? item.qty ?? item.ordered_quantity ?? item.orderedQuantity, null),
  orderedQuantity: toPlainNumber(item.ordered_quantity ?? item.orderedQuantity ?? item.quantity, null),
  receivedQuantity: toPlainNumber(item.received_quantity ?? item.receivedQuantity, null),
  acceptedQuantity: toPlainNumber(item.accepted_quantity ?? item.acceptedQuantity, null),
  rejectedQuantity: toPlainNumber(item.rejected_quantity ?? item.rejectedQuantity, null),
  deliveredQuantity: toPlainNumber(item.delivered_quantity ?? item.deliveredQuantity, null),
  uom: item.uom || item.unit || null,
  unit: item.unit || item.uom || null,
  unitPrice: toPlainNumber(item.unitPrice ?? item.unit_price ?? item.rate, null),
  gstAmount: toPlainNumber(item.gstAmount ?? item.gst_amount ?? item.taxAmount ?? item.tax_amount, null),
  lineTotal: toPlainNumber(item.lineTotal ?? item.line_total ?? item.total, null),
  remarks: item.remarks || null,
});
const mapReceiptLineItem = (item = {}, movementKey) => {
  const movementQuantity = movementKey === 'receivedQuantity'
    ? toPlainNumber(item.received_quantity ?? item.receivedQuantity ?? item.quantity, null)
    : toPlainNumber(item.delivered_quantity ?? item.deliveredQuantity ?? item.quantity, null);
  const mapped = mapDatabaseLineItem(item);
  return {
    ...mapped,
    quantity: movementQuantity,
    orderedQuantity: toPlainNumber(item.ordered_quantity ?? item.orderedQuantity ?? item.quantity, null),
    receivedQuantity: toPlainNumber(item.received_quantity ?? item.receivedQuantity, null),
    acceptedQuantity: toPlainNumber(item.accepted_quantity ?? item.acceptedQuantity, null),
    rejectedQuantity: toPlainNumber(item.rejected_quantity ?? item.rejectedQuantity, null),
    deliveredQuantity: toPlainNumber(item.delivered_quantity ?? item.deliveredQuantity, null),
  };
};
const normalizeItemIdentity = (value) => String(value || '').trim().replace(/\s+/g, ' ').toLowerCase();
const receiptItemKeys = (item = {}) => [
  item.id,
  item.itemId,
  item.item_id,
  item.productId,
  item.product_id,
  item.poItemId,
  item.po_item_id,
  item.itemCode,
  item.item_code,
  item.sku,
  item.productCode,
  item.product_code,
  item.itemName,
  item.item_name,
  item.name,
  item.description,
].map(normalizeItemIdentity).filter(Boolean);
const findReceiptSourceItem = (sourceItems, dbItem, usedIndexes) => {
  const dbKeys = new Set(receiptItemKeys(dbItem));
  const matchedIndex = sourceItems.findIndex((sourceItem, index) => (
    !usedIndexes.has(index) && receiptItemKeys(sourceItem).some((key) => dbKeys.has(key))
  ));
  if (matchedIndex < 0) return {};
  usedIndexes.add(matchedIndex);
  return sourceItems[matchedIndex];
};
const mapReceiptDocumentItems = (lineItems, dbItems, movementKey) => {
  const sourceItems = Array.isArray(lineItems) ? lineItems : [];
  const rows = Array.isArray(dbItems) && dbItems.length ? dbItems : sourceItems;
  const usedIndexes = new Set();
  return rows.map((dbItem) => {
    const sourceItem = dbItems?.length ? findReceiptSourceItem(sourceItems, dbItem, usedIndexes) : {};
    return mapReceiptLineItem({ ...sourceItem, ...dbItem }, movementKey);
  });
};
const normalizeCompareText = (value) => String(value ?? '').trim().replace(/\s+/g, ' ').toUpperCase();
const toComparableNumber = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};
const itemTaxValue = (item = {}) => {
  const direct = toComparableNumber(item.tax ?? item.taxAmount ?? item.tax_amount ?? item.totalTax ?? item.total_tax);
  if (direct !== null) return direct;
  return ['cgst', 'sgst', 'igst', 'cgstAmount', 'sgstAmount', 'igstAmount', 'cgst_amount', 'sgst_amount', 'igst_amount']
    .reduce((total, key) => total + Number(item[key] || 0), 0);
};
const comparisonRow = ({ field, ocrValue, databaseValue, type = 'text' }) => {
  const missing = !hasValue(ocrValue) || !hasValue(databaseValue);
  let matched = false;
  let difference = null;

  if (!missing && type === 'number') {
    const left = toComparableNumber(ocrValue);
    const right = toComparableNumber(databaseValue);
    matched = left !== null && right !== null && Math.abs(left - right) < 0.01;
    difference = left !== null && right !== null ? Number((left - right).toFixed(2)) : null;
  } else if (!missing) {
    matched = normalizeCompareText(ocrValue) === normalizeCompareText(databaseValue);
  }

  return {
    field,
    ocrValue: hasValue(ocrValue) ? ocrValue : null,
    databaseValue: hasValue(databaseValue) ? databaseValue : null,
    status: missing ? 'NOT_FOUND' : matched ? 'MATCHED' : 'MISMATCH',
    difference,
  };
};
const mapVendorMasterForOcr = (vendor, currency = 'INR') => vendor ? {
  id: vendor.id,
  companyName: vendor.name || null,
  vendorCode: vendor.vendor_code || null,
  vendorCategory: vendor.category || null,
  vendorType: vendor.vendor_type || null,
  gstNumber: vendor.gst_number || vendor.tax_id || null,
  panNumber: vendor.pan_number || null,
  cin: vendor.cin || null,
  msmeNumber: vendor.msme_number || null,
  taxType: vendor.tax_type || null,
  contactPerson: vendor.contact_person || null,
  designation: vendor.contact_designation || null,
  email: vendor.email || null,
  phone: vendor.phone || null,
  alternatePhone: vendor.alternate_phone || null,
  website: vendor.website || null,
  country: vendor.country || null,
  state: vendor.state || null,
  district: vendor.district || null,
  city: vendor.city || null,
  postalCode: vendor.zip_code || null,
  addressLine1: vendor.address_line1 || vendor.address || null,
  addressLine2: vendor.address_line2 || null,
  bankName: vendor.bank_name || null,
  accountHolder: vendor.account_holder || null,
  accountNumber: vendor.bank_account_no || null,
  ifscCode: vendor.ifsc_code || null,
  branch: vendor.bank_branch || null,
  paymentTerms: vendor.payment_terms || null,
  currency,
  vendorStatus: vendor.status || null,
  approvalStatus: vendor.approval_status || null,
  isActive: Boolean(vendor.is_active),
} : null;
const mapPurchaseOrderForOcr = (purchaseOrder) => purchaseOrder ? {
  id: purchaseOrder.id,
  poNumber: purchaseOrder.po_number,
  poDate: purchaseOrder.order_date,
  poStatus: purchaseOrder.status,
  poType: purchaseOrder.po_type,
  currency: purchaseOrder.currency || 'INR',
  paymentTerms: purchaseOrder.payment_terms || null,
  expectedDeliveryDate: purchaseOrder.expected_delivery_date || null,
  vendorId: purchaseOrder.vendor_id || purchaseOrder.vendor?.id || null,
  vendorCode: purchaseOrder.vendor?.vendor_code || null,
  vendorName: purchaseOrder.vendor?.name || null,
  vendorReference: purchaseOrder.vendor ? {
    id: purchaseOrder.vendor.id,
    companyName: purchaseOrder.vendor.name,
    vendorCode: purchaseOrder.vendor.vendor_code,
    gstNumber: purchaseOrder.vendor.gst_number || purchaseOrder.vendor.tax_id || null,
    panNumber: purchaseOrder.vendor.pan_number || null,
    email: purchaseOrder.vendor.email || null,
    phone: purchaseOrder.vendor.phone || null,
  } : null,
  addresses: {
    billingAddress: purchaseOrder.billing_address || null,
    deliveryAddress: purchaseOrder.delivery_address || null,
  },
  billingAddress: purchaseOrder.billing_address || null,
  deliveryAddress: purchaseOrder.delivery_address || null,
  deliveryTerms: purchaseOrder.delivery_terms || null,
  department: purchaseOrder.department || null,
  costCenter: purchaseOrder.cost_center || null,
  requester: purchaseOrder.requester || null,
  buyer: purchaseOrder.buyer || null,
  items: (Array.isArray(purchaseOrder.line_items) ? purchaseOrder.line_items : []).map(mapDatabaseLineItem),
  grns: (Array.isArray(purchaseOrder.grns) ? purchaseOrder.grns : []).map(mapGoodsReceiptNoteForOcr),
  goodsReceiptNotes: (Array.isArray(purchaseOrder.grns) ? purchaseOrder.grns : []).map(mapGoodsReceiptNoteForOcr),
  deliveryChallans: (Array.isArray(purchaseOrder.delivery_challans) ? purchaseOrder.delivery_challans : []).map(mapDeliveryChallanForOcr),
  totals: {
    amount: toPlainNumber(purchaseOrder.amount),
    currency: purchaseOrder.currency || 'INR',
    ...(purchaseOrder.tax_summary || {}),
  },
  taxSummary: purchaseOrder.tax_summary || null,
  taxDetails: purchaseOrder.tax_summary || null,
  raw: purchaseOrder,
} : null;
const mapGoodsReceiptNoteForOcr = (grn) => grn ? {
  id: grn.id,
  grnNumber: grn.grn_number,
  grnDate: grn.receipt_date || grn.delivery_date || grn.created_at,
  status: grn.status,
  grnStatus: grn.status,
  poNumber: grn.purchase_order?.po_number || null,
  purchaseOrderId: grn.purchase_order_id,
  poReference: grn.purchase_order ? {
    id: grn.purchase_order.id,
    poNumber: grn.purchase_order.po_number,
    status: grn.purchase_order.status,
  } : null,
  vendorName: grn.vendor?.name || grn.vendor_name || null,
  vendorCode: grn.vendor?.vendor_code || grn.vendor_code || null,
  vendorId: grn.vendor_id,
  vendorReference: grn.vendor ? {
    id: grn.vendor.id,
    companyName: grn.vendor.name,
    vendorCode: grn.vendor.vendor_code,
    gstNumber: grn.vendor.gst_number || grn.vendor.tax_id || null,
  } : null,
  receivedBy: grn.received_by || grn.receiver_name || null,
  deliveryChallanId: grn.delivery_challan_id || grn.delivery_challan?.id || null,
  deliveryChallanNumber: grn.delivery_challan_no || grn.delivery_challan?.delivery_challan_number || null,
  deliveryAddress: grn.delivery_address || null,
  billingAddress: grn.billing_address || null,
  paymentTerms: grn.payment_terms || null,
  currency: grn.currency || null,
  totals: {
    subtotal: toPlainNumber(grn.subtotal),
    gstAmount: toPlainNumber(grn.gst_amount),
    discount: toPlainNumber(grn.discount),
    totalAmount: toPlainNumber(grn.total_amount),
  },
  totalReceivedQuantity: (Array.isArray(grn.items) ? grn.items : []).reduce((total, item) => total + toPlainNumber(item.received_quantity || item.receivedQuantity), 0),
  totalAcceptedQuantity: (Array.isArray(grn.items) ? grn.items : []).reduce((total, item) => total + toPlainNumber(item.accepted_quantity || item.acceptedQuantity), 0),
  totalRejectedQuantity: (Array.isArray(grn.items) ? grn.items : []).reduce((total, item) => total + toPlainNumber(item.rejected_quantity || item.rejectedQuantity), 0),
  items: mapReceiptDocumentItems(grn.line_items, grn.items, 'receivedQuantity'),
  raw: grn,
} : null;
const mapDeliveryChallanForOcr = (challan) => challan ? {
  id: challan.id,
  deliveryChallanNumber: challan.delivery_challan_number,
  deliveryChallanDate: challan.delivery_date || challan.created_at,
  dcNumber: challan.delivery_challan_number,
  dcDate: challan.delivery_date || challan.created_at,
  status: challan.status || challan.delivery_status,
  deliveryStatus: challan.delivery_status || challan.status,
  poNumber: challan.purchase_order?.po_number || null,
  purchaseOrderId: challan.purchase_order_id,
  poReference: challan.purchase_order ? {
    id: challan.purchase_order.id,
    poNumber: challan.purchase_order.po_number,
    status: challan.purchase_order.status,
  } : null,
  vendorName: challan.vendor?.name || challan.vendor_name || null,
  vendorCode: challan.vendor?.vendor_code || challan.vendor_code || null,
  vendorId: challan.vendor_id,
  vendor: challan.vendor ? {
    id: challan.vendor.id,
    companyName: challan.vendor.name || null,
    vendorCode: challan.vendor.vendor_code || null,
    gstNumber: challan.vendor.gst_number || challan.vendor.tax_id || null,
  } : null,
  deliveryAddress: challan.delivery_address || challan.purchase_order?.delivery_address || null,
  transporter: challan.transporter || null,
  vehicleNumber: challan.vehicle_number || null,
  currency: challan.currency || null,
  totals: {
    subtotal: toPlainNumber(challan.subtotal),
    gstAmount: toPlainNumber(challan.gst_amount),
    totalAmount: toPlainNumber(challan.total_amount),
  },
  totalDeliveredQuantity: (Array.isArray(challan.items) ? challan.items : []).reduce((total, item) => total + toPlainNumber(item.delivered_quantity || item.deliveredQuantity), 0),
  items: mapReceiptDocumentItems(challan.line_items, challan.items, 'deliveredQuantity'),
  raw: challan,
} : null;
const buildOcrInvoiceForThreeWayPreview = ({ invoiceDraft, matchedVendor, matchedPurchaseOrder }) => {
  const totals = invoiceDraft?.totals || {};
  const amount = Number(totals.grandTotal ?? totals.total ?? totals.taxableAmount ?? 0);
  return {
    id: null,
    invoice_number: invoiceDraft?.header?.invoiceNumber || 'OCR-INVOICE-PREVIEW',
    invoice_date: invoiceDraft?.header?.invoiceDate || null,
    vendor_id: matchedPurchaseOrder?.vendor_id || matchedVendor?.id || null,
    vendor: matchedPurchaseOrder?.vendor || matchedVendor || null,
    purchase_order: matchedPurchaseOrder || null,
    line_items: (Array.isArray(invoiceDraft?.lineItems) ? invoiceDraft.lineItems : []).map((item) => ({
      ...item,
      itemName: item.itemName || item.item_name || item.description || item.name || null,
      quantity: Number(item.quantity || item.qty || 0),
      unitPrice: Number(item.unitPrice ?? item.unit_price ?? item.rate ?? 0),
      gstAmount: Number(item.gstAmount ?? item.gst_amount ?? item.taxAmount ?? item.tax_amount ?? item.cgstAmount ?? item.sgstAmount ?? item.igstAmount ?? 0),
      lineTotal: Number(item.lineTotal ?? item.line_total ?? item.total ?? item.taxableAmount ?? 0),
    })),
    amount,
    invoice_total: amount,
    tax_summary: {
      gstAmount: Number(totals.totalTax ?? totals.taxTotal ?? 0),
    },
  };
};
const previewStatusFromField = (unmatchedFields, field, isAvailable = true) => {
  if (!isAvailable) return 'PENDING';
  return unmatchedFields.has(field) ? 'MISMATCH' : 'MATCHED';
};
const previewBooleanFromStatus = (status) => status === 'MATCHED';
const buildThreeWayMatchingPreview = ({ invoiceDraft, matchedVendor, matchedPurchaseOrder, matchedGrn, matchedDeliveryChallan }) => {
  if (!matchedPurchaseOrder) {
    const pendingSummary = {
      vendorMatch: matchedVendor ? 'PENDING' : 'NOT_FOUND',
      poMatch: 'NOT_FOUND',
      grnMatch: matchedGrn ? 'PENDING' : 'NOT_FOUND',
      deliveryChallanMatch: matchedDeliveryChallan ? 'PENDING' : 'NOT_FOUND',
      itemMatch: 'PENDING',
      quantityMatch: 'PENDING',
      priceMatch: 'PENDING',
      taxMatch: 'PENDING',
      totalMatch: 'PENDING',
      amountMatch: 'PENDING',
      overallStatus: 'PENDING',
    };
    return {
      status: 'PENDING',
      matchPercentage: 0,
      matchingScore: 0,
      totalChecks: 9,
      matchedChecks: 0,
      mismatchedChecks: 1,
      checks: {
        vendorMatch: false,
        poMatch: false,
        grnMatch: false,
        deliveryChallanMatch: false,
        itemMatch: false,
        quantityMatch: false,
        priceMatch: false,
        taxMatch: false,
        totalMatch: false,
        overallStatus: 'PENDING',
        matchingScore: 0,
      },
      summary: pendingSummary,
      details: [{
        field: 'purchase_order',
        label: 'Purchase Order',
        status: 'NOT_FOUND',
        reason: 'Purchase Order must be found in PostgreSQL before the existing 3-Way Matching comparison can run.',
        poValue: null,
        grnValue: matchedGrn?.grn_number || null,
        deliveryChallanValue: matchedDeliveryChallan?.delivery_challan_number || null,
        invoiceValue: invoiceDraft?.references?.poNumber || null,
      }],
      rawComparison: null,
    };
  }

  const invoicePreview = buildOcrInvoiceForThreeWayPreview({ invoiceDraft, matchedVendor, matchedPurchaseOrder });
  const purchaseOrderPreview = {
    ...matchedPurchaseOrder,
    line_items: Array.isArray(matchedPurchaseOrder.line_items) ? matchedPurchaseOrder.line_items : [],
  };
  const grnPreview = matchedGrn ? {
    ...matchedGrn,
    line_items: Array.isArray(matchedGrn.line_items) && matchedGrn.line_items.length ? matchedGrn.line_items : (matchedGrn.items || []),
  } : null;
  const deliveryChallanPreview = matchedDeliveryChallan ? {
    ...matchedDeliveryChallan,
    line_items: Array.isArray(matchedDeliveryChallan.line_items) && matchedDeliveryChallan.line_items.length ? matchedDeliveryChallan.line_items : (matchedDeliveryChallan.items || []),
  } : null;

  let comparison;
  try {
    comparison = compareThreeWayDocuments({
      invoice: invoicePreview,
      purchaseOrder: purchaseOrderPreview,
      grn: grnPreview,
      deliveryChallan: deliveryChallanPreview,
    });
  } catch (error) {
    console.error('[OCR MATCH] 3-Way preview calculation failed', {
      purchaseOrderId: matchedPurchaseOrder.id,
      message: error.message,
    });
    const pendingSummary = {
      vendorMatch: 'PENDING',
      poMatch: 'MATCHED',
      grnMatch: matchedGrn ? 'PENDING' : 'NOT_FOUND',
      deliveryChallanMatch: matchedDeliveryChallan ? 'PENDING' : 'NOT_FOUND',
      itemMatch: 'PENDING',
      quantityMatch: 'PENDING',
      priceMatch: 'PENDING',
      taxMatch: 'PENDING',
      totalMatch: 'PENDING',
      amountMatch: 'PENDING',
      overallStatus: 'PENDING',
    };
    return {
      status: 'PENDING',
      matchPercentage: 0,
      matchingScore: 0,
      totalChecks: 9,
      matchedChecks: 1,
      mismatchedChecks: 0,
      checks: {
        vendorMatch: false,
        poMatch: true,
        grnMatch: false,
        deliveryChallanMatch: false,
        itemMatch: false,
        quantityMatch: false,
        priceMatch: false,
        taxMatch: false,
        totalMatch: false,
        overallStatus: 'PENDING',
        matchingScore: 0,
      },
      summary: pendingSummary,
      details: [{
        field: 'three_way_matching',
        label: '3-Way Matching',
        status: 'PENDING',
        reason: 'The existing 3-Way Matching preview could not be calculated from the current OCR draft. Please review the invoice fields and try again.',
        poValue: matchedPurchaseOrder.po_number,
        grnValue: matchedGrn?.grn_number || null,
        deliveryChallanValue: matchedDeliveryChallan?.delivery_challan_number || null,
        invoiceValue: invoiceDraft?.header?.invoiceNumber || null,
      }],
      warnings: [],
      rawComparison: null,
    };
  }
  const unmatchedFields = new Set((comparison.unmatched_fields || []).map((item) => item.field));
  const amountMismatch = unmatchedFields.has('amount') || unmatchedFields.has('line_total') || unmatchedFields.has('grn_amount') || unmatchedFields.has('delivery_challan_amount');
  const summary = {
    vendorMatch: previewStatusFromField(unmatchedFields, 'vendor'),
    poMatch: 'MATCHED',
    grnMatch: matchedGrn ? previewStatusFromField(unmatchedFields, 'goods_receipt_note') : 'NOT_FOUND',
    deliveryChallanMatch: matchedDeliveryChallan ? previewStatusFromField(unmatchedFields, 'delivery_challan') : 'NOT_FOUND',
    itemMatch: previewStatusFromField(unmatchedFields, 'item', invoicePreview.line_items.length > 0),
    quantityMatch: previewStatusFromField(unmatchedFields, 'quantity', invoicePreview.line_items.length > 0),
    priceMatch: previewStatusFromField(unmatchedFields, 'unit_price', invoicePreview.line_items.length > 0),
    taxMatch: previewStatusFromField(unmatchedFields, 'gst', invoicePreview.line_items.length > 0),
    totalMatch: amountMismatch ? 'MISMATCH' : 'MATCHED',
    amountMatch: amountMismatch ? 'MISMATCH' : 'MATCHED',
    overallStatus: comparison.status,
  };
  const checks = {
    vendorMatch: previewBooleanFromStatus(summary.vendorMatch),
    poMatch: previewBooleanFromStatus(summary.poMatch),
    grnMatch: previewBooleanFromStatus(summary.grnMatch),
    deliveryChallanMatch: previewBooleanFromStatus(summary.deliveryChallanMatch),
    itemMatch: previewBooleanFromStatus(summary.itemMatch),
    quantityMatch: previewBooleanFromStatus(summary.quantityMatch),
    priceMatch: previewBooleanFromStatus(summary.priceMatch),
    taxMatch: previewBooleanFromStatus(summary.taxMatch),
    totalMatch: previewBooleanFromStatus(summary.totalMatch),
    overallStatus: comparison.status,
    matchingScore: Number(comparison.match_percentage || 0),
  };

  return {
    status: comparison.status,
    matchPercentage: comparison.match_percentage,
    matchingScore: checks.matchingScore,
    totalChecks: comparison.total_fields_count,
    matchedChecks: comparison.matched_fields_count,
    mismatchedChecks: (comparison.unmatched_fields || []).length,
    checks,
    summary,
    details: (comparison.unmatched_fields || []).map((item) => ({
      field: item.field,
      label: item.label,
      status: item.status || 'MISMATCH',
      reason: item.reason,
      poValue: item.po_value ?? null,
      grnValue: item.grn_value ?? null,
      deliveryChallanValue: item.delivery_challan_value ?? null,
      invoiceValue: item.invoice_value ?? null,
    })),
    warnings: comparison.warnings || [],
    rawComparison: comparison,
  };
};
const buildOcrMasterComparison = ({ extracted, invoiceDraft, purchaseOrder, vendorMaster }) => {
  const ocrVendor = extracted.vendor || {};
  const ocrReferences = extracted.references || {};
  const ocrItems = Array.isArray(invoiceDraft.lineItems) ? invoiceDraft.lineItems : [];
  const poItems = Array.isArray(purchaseOrder?.line_items) ? purchaseOrder.line_items.map(normalizeDraftItem) : [];
  const poTax = purchaseOrder?.tax_summary || {};
  const ocrTotals = invoiceDraft.totals || extracted.totals || {};
  const comparisons = [
    comparisonRow({ field: 'vendor.name', ocrValue: ocrVendor.vendorName || ocrVendor.name, databaseValue: vendorMaster?.companyName }),
    comparisonRow({ field: 'vendor.gstNumber', ocrValue: ocrVendor.gstin || ocrVendor.gstNumber, databaseValue: vendorMaster?.gstNumber }),
    comparisonRow({ field: 'vendor.vendorCode', ocrValue: ocrVendor.vendorCode, databaseValue: vendorMaster?.vendorCode }),
    comparisonRow({ field: 'purchaseOrder.poNumber', ocrValue: ocrReferences.poNumber, databaseValue: purchaseOrder?.po_number }),
    comparisonRow({ field: 'totals.totalTax', ocrValue: ocrTotals.totalTax || ocrTotals.taxTotal, databaseValue: poTax.totalGst || poTax.taxTotal, type: 'number' }),
    comparisonRow({ field: 'totals.grandTotal', ocrValue: ocrTotals.grandTotal, databaseValue: purchaseOrder?.amount, type: 'number' }),
  ];

  const maxItems = Math.max(ocrItems.length, poItems.length);
  for (let index = 0; index < maxItems; index += 1) {
    const ocrItem = ocrItems[index] || {};
    const poItem = poItems[index] || {};
    const row = index + 1;
    comparisons.push(
      comparisonRow({ field: `items[${row}].description`, ocrValue: ocrItem.description || ocrItem.itemName, databaseValue: poItem.description }),
      comparisonRow({ field: `items[${row}].quantity`, ocrValue: ocrItem.quantity, databaseValue: poItem.quantity, type: 'number' }),
      comparisonRow({ field: `items[${row}].unitPrice`, ocrValue: ocrItem.unitPrice || ocrItem.unit_price, databaseValue: poItem.unitPrice, type: 'number' }),
      comparisonRow({ field: `items[${row}].tax`, ocrValue: itemTaxValue(ocrItem), databaseValue: itemTaxValue(poItem), type: 'number' }),
      comparisonRow({ field: `items[${row}].total`, ocrValue: ocrItem.total || ocrItem.lineTotal, databaseValue: poItem.total, type: 'number' }),
    );
  }

  return {
    summary: {
      total: comparisons.length,
      matched: comparisons.filter((item) => item.status === 'MATCHED').length,
      mismatched: comparisons.filter((item) => item.status === 'MISMATCH').length,
      notFound: comparisons.filter((item) => item.status === 'NOT_FOUND').length,
    },
    comparisons,
  };
};

const lookupValidation = ({ label, extractedValue, matchedRecord, matchedValue, fallbackSource = null }) => {
  if (matchedRecord) {
    return {
      status: 'MATCHED',
      extractedValue: extractedValue || null,
      matchedValue: matchedValue || extractedValue || null,
      message: `${label} was resolved from PostgreSQL.`,
      source: extractedValue ? 'OCR_EXTRACTED' : fallbackSource,
    };
  }
  if (extractedValue) {
    return {
      status: 'NOT_FOUND',
      extractedValue,
      matchedValue: null,
      message: `${label} "${extractedValue}" was extracted from OCR, but no matching record was found in PostgreSQL.`,
      source: 'OCR_EXTRACTED',
    };
  }
  return {
    status: 'PENDING',
    extractedValue: null,
    matchedValue: null,
    message: `${label} was not extracted from OCR.`,
    source: null,
  };
};

export const buildInvoiceDraft = ({ extracted, matchedVendor, matchedPurchaseOrder, matchedGrn, matchedDeliveryChallan }) => {
  const sources = {};
  const missingReasons = {};
  const ocrHeader = extracted.header || {};
  const ocrVendor = extracted.vendor || {};
  const ocrCompany = extracted.company || {};
  const ocrBank = extracted.bank || {};
  const ocrReferences = extracted.references || {};
  const ocrTotals = extracted.totals || {};
  const ocrTerms = extracted.terms || {};
  const poTax = matchedPurchaseOrder?.tax_summary || {};
  const paymentTerms = mergeDraftValue(
    sources, 'header', 'paymentTerms',
    ocrHeader.paymentTerms,
    matchedPurchaseOrder?.payment_terms || matchedVendor?.payment_terms,
  );
  const invoiceDate = mergeDraftValue(sources, 'header', 'invoiceDate', ocrHeader.invoiceDate, null);
  const receiptDate = mergeDraftValue(sources, 'header', 'receiptDate', ocrHeader.receiptDate, null);
  const dueDate = mergeDraftValue(
    sources, 'header', 'dueDate',
    ocrHeader.dueDate,
    null,
  );
  const invoiceNumber = mergeDraftValue(sources, 'header', 'invoiceNumber', ocrHeader.invoiceNumber, null);
  if (!invoiceNumber) {
    missingReasons.invoiceNumber = 'Generated by the backend when the invoice is created.';
    nestedSource(sources, 'header', 'invoiceNumber', 'SYSTEM_GENERATED');
  }
  nestedSource(sources, 'terms', 'paymentTerms', sources.header.paymentTerms);

  const documentItems = Array.isArray(extracted.lineItems) ? extracted.lineItems : [];
  const databaseItems = Array.isArray(matchedPurchaseOrder?.line_items) ? matchedPurchaseOrder.line_items : [];
  const lineItems = (documentItems.length ? documentItems : databaseItems).map(normalizeDraftItem);
  sources.lineItems = lineItems.map(() => (documentItems.length ? 'OCR_EXTRACTED' : 'DATABASE_MATCHED'));

  const draft = { 
    ...extracted,
    header: {
      invoiceNumber,
      invoiceDate,
      receiptDate,
      dueDate,
      invoiceType: extracted.documentType || ocrHeader.invoiceType || null,
      invoiceCategory: mergeDraftValue(sources, 'header', 'invoiceCategory', ocrHeader.invoiceCategory, null),
      currency: mergeDraftValue(sources, 'header', 'currency', ocrHeader.currency, matchedPurchaseOrder?.currency),
      paymentTerms,
    },
    vendor: {
      vendorName: mergeDraftValue(sources, 'vendor', 'vendorName', ocrVendor.vendorName, matchedVendor?.name),
      vendorCode: mergeDraftValue(sources, 'vendor', 'vendorCode', ocrVendor.vendorCode, matchedVendor?.vendor_code),
      vendorAddress: mergeDraftValue(sources, 'vendor', 'vendorAddress', ocrVendor.vendorAddress || ocrVendor.address, matchedVendor?.address),
      address: mergeDraftValue(sources, 'vendor', 'address', ocrVendor.address, matchedVendor?.address),
      gstin: mergeDraftValue(sources, 'vendor', 'gstin', ocrVendor.gstin, matchedVendor?.gst_number || matchedVendor?.tax_id),
      pan: mergeDraftValue(sources, 'vendor', 'pan', ocrVendor.pan, matchedVendor?.pan_number),
      email: mergeDraftValue(sources, 'vendor', 'email', ocrVendor.email, matchedVendor?.email),
      phone: mergeDraftValue(sources, 'vendor', 'phone', ocrVendor.phone, matchedVendor?.phone),
    },
    company: {
      companyName: mergeDraftValue(sources, 'company', 'companyName', ocrCompany.companyName, null),
      companyAddress: mergeDraftValue(sources, 'company', 'companyAddress', ocrCompany.companyAddress || ocrCompany.address, matchedPurchaseOrder?.billing_address),
      address: mergeDraftValue(sources, 'company', 'address', ocrCompany.address, matchedPurchaseOrder?.billing_address),
      companyGstin: mergeDraftValue(sources, 'company', 'companyGstin', ocrCompany.companyGstin, null),
      companyPan: mergeDraftValue(sources, 'company', 'companyPan', ocrCompany.companyPan, null),
    },
    references: {
      poNumber: mergeDraftValue(sources, 'references', 'poNumber', ocrReferences.poNumber, matchedPurchaseOrder?.po_number),
      poDate: mergeDraftValue(sources, 'references', 'poDate', ocrReferences.poDate, isoDate(matchedPurchaseOrder?.order_date)),
      grnNumber: mergeDraftValue(sources, 'references', 'grnNumber', ocrReferences.grnNumber, matchedGrn?.grn_number),
      deliveryChallanNumber: mergeDraftValue(sources, 'references', 'deliveryChallanNumber', ocrReferences.deliveryChallanNumber, matchedDeliveryChallan?.delivery_challan_number),
      quotationNumber: mergeDraftValue(sources, 'references', 'quotationNumber', ocrReferences.quotationNumber, null),
      contractNumber: mergeDraftValue(sources, 'references', 'contractNumber', ocrReferences.contractNumber, null),
    },
    bank: {
      bankName: mergeDraftValue(sources, 'bank', 'bankName', ocrBank.bankName, matchedVendor?.bank_name),
      accountName: mergeDraftValue(sources, 'bank', 'accountName', ocrBank.accountName, matchedVendor?.account_holder),
      accountNumber: mergeDraftValue(sources, 'bank', 'accountNumber', ocrBank.accountNumber, matchedVendor?.bank_account_no),
      ifscCode: mergeDraftValue(sources, 'bank', 'ifscCode', ocrBank.ifscCode, matchedVendor?.ifsc_code),
      branch: mergeDraftValue(sources, 'bank', 'branch', ocrBank.branch, matchedVendor?.bank_branch),
      upiId: mergeDraftValue(sources, 'bank', 'upiId', ocrBank.upiId, null),
    },
    lineItems,
    totals: {
      subtotal: mergeDraftValue(sources, 'totals', 'subtotal', ocrTotals.subtotal, poTax.subtotal),
      totalDiscount: mergeDraftValue(sources, 'totals', 'totalDiscount', ocrTotals.totalDiscount ?? ocrTotals.discount, poTax.totalDiscount ?? poTax.discount),
      taxableAmount: mergeDraftValue(sources, 'totals', 'taxableAmount', ocrTotals.taxableAmount, poTax.taxableAmount ?? poTax.subtotal),
      cgstTotal: mergeDraftValue(sources, 'totals', 'cgstTotal', ocrTotals.cgstTotal, poTax.cgstTotal),
      sgstTotal: mergeDraftValue(sources, 'totals', 'sgstTotal', ocrTotals.sgstTotal, poTax.sgstTotal),
      igstTotal: mergeDraftValue(sources, 'totals', 'igstTotal', ocrTotals.igstTotal, poTax.igstTotal),
      cessTotal: mergeDraftValue(sources, 'totals', 'cessTotal', ocrTotals.cessTotal, poTax.cessTotal),
      otherCharges: mergeDraftValue(sources, 'totals', 'otherCharges', ocrTotals.otherCharges, poTax.otherCharges),
      roundOff: mergeDraftValue(sources, 'totals', 'roundOff', ocrTotals.roundOff, poTax.roundOff),
      taxTotal: mergeDraftValue(sources, 'totals', 'taxTotal', ocrTotals.taxTotal ?? ocrTotals.totalTax, poTax.totalGst ?? poTax.taxTotal),
      totalTax: mergeDraftValue(sources, 'totals', 'totalTax', ocrTotals.totalTax ?? ocrTotals.taxTotal, poTax.totalGst ?? poTax.taxTotal),
      grandTotal: mergeDraftValue(sources, 'totals', 'grandTotal', ocrTotals.grandTotal, poTax.grandTotal ?? matchedPurchaseOrder?.amount),
      amountInWords: mergeDraftValue(sources, 'totals', 'amountInWords', ocrTotals.amountInWords, null),
    },
    terms: {
      paymentTerms,
      deliveryTerms: mergeDraftValue(sources, 'terms', 'deliveryTerms', ocrTerms.deliveryTerms, matchedPurchaseOrder?.delivery_terms),
      warrantyTerms: mergeDraftValue(sources, 'terms', 'warrantyTerms', ocrTerms.warrantyTerms, null),
      notes: mergeDraftValue(sources, 'terms', 'notes', ocrTerms.notes, null),
      remarks: mergeDraftValue(sources, 'terms', 'remarks', ocrTerms.remarks, null),
    },
    fieldSources: sources,
    missingReasons,
  };
  return draft;
};

const buildNormalizedOcrResponse = ({
  confidence = 0,
  status = 'PENDING',
  ocrDocument = {},
  ocrDraft = {},
  invoiceDraft = {},
  extractedData = {},
  file,
}) => {
  const header = invoiceDraft.header || extractedData.header || {};
  const references = invoiceDraft.references || extractedData.references || {};
  const vendor = invoiceDraft.vendor || extractedData.vendor || {};
  const totals = invoiceDraft.totals || extractedData.totals || {};
  const terms = invoiceDraft.terms || extractedData.terms || {};
  const document = extractedData.document || {};
  const fileType = ocrDraft.mimeType || ocrDocument.fileType || file?.mimetype || document.mimeType || document.fileType || null;

  return {
    confidence: Number(confidence || 0),
    status,
    document: {
      id: ocrDraft.ocrDocumentId || ocrDocument.id || null,
      fileName: ocrDraft.sourceFileName || ocrDocument.fileName || file?.originalname || document.fileName || document.sourceFileName || null,
      fileType,
      mimeType: fileType,
      fileSize: ocrDraft.fileSize || ocrDocument.fileSize || file?.size || document.fileSize || null,
      pageCount: Number(ocrDraft.pageCount ?? ocrDocument.pageCount ?? document.pageCount ?? 0),
    },
    invoice: {
      invoiceNumber: header.invoiceNumber || null,
      invoiceDate: header.invoiceDate || null,
      receiptDate: header.receiptDate || null,
      dueDate: header.dueDate || null,
      poNumber: references.poNumber || null,
      grnNumber: references.grnNumber || null,
      deliveryChallanNumber: references.deliveryChallanNumber || null,
      currency: header.currency || extractedData.currency || 'INR',
      paymentTerms: terms.paymentTerms || header.paymentTerms || null,
      subtotal: totals.subtotal ?? null,
      discount: totals.totalDiscount ?? totals.discount ?? null,
      taxableAmount: totals.taxableAmount ?? null,
      cgst: totals.cgstTotal ?? totals.cgst ?? null,
      sgst: totals.sgstTotal ?? totals.sgst ?? null,
      igst: totals.igstTotal ?? totals.igst ?? null,
      totalTax: totals.totalTax ?? totals.taxTotal ?? null,
      otherCharges: totals.otherCharges ?? null,
      roundOff: totals.roundOff ?? null,
      grandTotal: totals.grandTotal ?? null,
    },
    vendor: {
      name: vendor.vendorName || vendor.name || null,
      code: vendor.vendorCode || vendor.vendor_code || null,
      gstNumber: vendor.gstin || vendor.gstNumber || vendor.gst_number || null,
      panNumber: vendor.pan || vendor.panNumber || vendor.pan_number || null,
      email: vendor.email || null,
      phone: vendor.phone || null,
      address: vendor.vendorAddress || vendor.address || null,
    },
    items: Array.isArray(invoiceDraft.lineItems)
      ? invoiceDraft.lineItems
      : Array.isArray(extractedData.lineItems)
        ? extractedData.lineItems
        : [],
  };
};

const buildOcrDraftResponsePayload = async (draft) => {
  const [matchedVendorRecord, matchedPurchaseOrder, selectedGrnRecord, selectedDeliveryChallanRecord] = await Promise.all([
    draft.matched_vendor_id
      ? prisma.vendor.findUnique({ where: { id: draft.matched_vendor_id } })
      : null,
    draft.matched_purchase_order_id
      ? prisma.purchaseOrder.findUnique({
          where: { id: draft.matched_purchase_order_id },
          include: {
            vendor: true,
            invoices: { where: { deleted_at: null }, select: { id: true, invoice_number: true, status: true } },
            grns: {
              where: { deleted_at: null },
              include: {
                items: true,
                purchase_order: true,
                vendor: true,
                delivery_challan: { include: { items: true, purchase_order: true, vendor: true } },
              },
              orderBy: { created_at: 'desc' },
            },
            delivery_challans: { where: { deleted_at: null }, include: { items: true, purchase_order: true, vendor: true }, orderBy: { created_at: 'desc' } },
          },
        })
      : null,
    draft.selected_grn_id
      ? prisma.goodsReceiptNote.findUnique({
          where: { id: draft.selected_grn_id },
          include: {
            items: true,
            purchase_order: true,
            vendor: true,
            delivery_challan: { include: { items: true, purchase_order: true, vendor: true } },
          },
        })
      : null,
    draft.selected_delivery_challan_id
      ? prisma.deliveryChallan.findUnique({ where: { id: draft.selected_delivery_challan_id }, include: { items: true, purchase_order: true, vendor: true } })
      : null,
  ]);
  const invoiceDraft = draft.invoice_draft || {};
  const extractedData = draft.structured_data || {};
  const matchedVendor = matchedVendorRecord || matchedPurchaseOrder?.vendor || null;
  const matchedGrn = selectedGrnRecord || matchedPurchaseOrder?.grns?.[0] || null;
  const matchedDeliveryChallan = selectedDeliveryChallanRecord || matchedGrn?.delivery_challan || matchedPurchaseOrder?.delivery_challans?.[0] || null;
  const resolvedVendorMasterRecord = matchedVendorRecord || matchedVendor || matchedPurchaseOrder?.vendor || null;
  const vendorMaster = mapVendorMasterForOcr(
    resolvedVendorMasterRecord,
    matchedPurchaseOrder?.currency || invoiceDraft.header?.currency || resolvedVendorMasterRecord?.currency || 'INR',
  );
  const purchaseOrderMaster = mapPurchaseOrderForOcr(matchedPurchaseOrder);
  const goodsReceiptNoteMaster = mapGoodsReceiptNoteForOcr(matchedGrn);
  const deliveryChallanMaster = mapDeliveryChallanForOcr(matchedDeliveryChallan);
  const matchingComparison = buildOcrMasterComparison({
    extracted: extractedData,
    invoiceDraft,
    purchaseOrder: matchedPurchaseOrder,
    vendorMaster,
  });
  const threeWayMatchingPreview = buildThreeWayMatchingPreview({
    invoiceDraft,
    matchedVendor,
    matchedPurchaseOrder,
    matchedGrn,
    matchedDeliveryChallan,
  });
  const references = invoiceDraft.references || extractedData.references || {};
  const vendorData = invoiceDraft.vendor || extractedData.vendor || {};
  const storedVendorConflict = draft.vendor_match_conflict || null;
  const vendorValidation = {
    status: storedVendorConflict
      ? 'MISMATCH'
        : matchedVendor && matchedPurchaseOrder?.vendor
          ? 'MATCHED'
        : 'PENDING',
    ocrVendorName: extractedData.vendor?.vendorName || extractedData.vendor?.name || vendorData.vendorName || vendorData.name || null,
    ocrVendorCode: extractedData.vendor?.vendorCode || vendorData.vendorCode || null,
    vendorMasterId: matchedVendor?.id || null,
    vendorMasterName: matchedVendor?.name || null,
    vendorMasterCode: matchedVendor?.vendor_code || null,
    purchaseOrderVendorId: matchedPurchaseOrder?.vendor?.id || null,
    purchaseOrderVendorName: matchedPurchaseOrder?.vendor?.name || null,
    purchaseOrderVendorCode: matchedPurchaseOrder?.vendor?.vendor_code || null,
    message: storedVendorConflict?.message
      || (matchedVendor && matchedPurchaseOrder?.vendor
        ? 'Vendor Code / Vendor Master matches the Purchase Order vendor.'
        : 'Vendor validation is pending because Vendor Master or Purchase Order was not found.'),
  };
  const normalizedOcr = buildNormalizedOcrResponse({
    confidence: draft.ocr_confidence,
    status: draft.ocr_status,
    ocrDraft: {
      ocrDocumentId: draft.ocr_document_id,
      sourceFileName: draft.source_file_name,
      mimeType: draft.mime_type,
      fileSize: draft.file_size,
      pageCount: draft.page_count,
    },
    invoiceDraft,
    extractedData,
  });

  return {
    draftId: draft.id,
    ocrDraft: {
      id: draft.id,
      ocrDocumentId: draft.ocr_document_id,
      sourceFileName: draft.source_file_name,
      fileUrl: draft.file_url,
      mimeType: draft.mime_type,
      fileSize: draft.file_size,
      ocrStatus: draft.ocr_status,
      ocrConfidence: Number(draft.ocr_confidence || 0),
      pageCount: draft.page_count,
      draftStatus: draft.draft_status,
      createdAt: draft.created_at,
      updatedAt: draft.updated_at,
    },
    ocrStatus: draft.ocr_status,
    ocrConfidence: Number(draft.ocr_confidence || 0),
    ocr: normalizedOcr,
    vendorCode: vendorData.vendorCode || vendorData.vendor_code || references.vendorCode || null,
    poNumber: references.poNumber || null,
    grnNumber: references.grnNumber || matchedGrn?.grn_number || null,
    deliveryChallanNumber: references.deliveryChallanNumber || matchedDeliveryChallan?.delivery_challan_number || null,
    confidence: {
      overall: Number(draft.ocr_confidence || 0),
      fields: extractedData.fieldConfidence || {},
    },
    extraction: {
      invoiceNumber: invoiceDraft.header?.invoiceNumber || null,
      invoiceDate: invoiceDraft.header?.invoiceDate || null,
      receiptDate: invoiceDraft.header?.receiptDate || null,
      dueDate: invoiceDraft.header?.dueDate || null,
      poNumber: references.poNumber || null,
      grnNumber: references.grnNumber || matchedGrn?.grn_number || null,
      deliveryChallanNumber: references.deliveryChallanNumber || matchedDeliveryChallan?.delivery_challan_number || null,
      currency: invoiceDraft.header?.currency || 'INR',
      paymentTerms: invoiceDraft.terms?.paymentTerms || invoiceDraft.header?.paymentTerms || null,
      vendor: invoiceDraft.vendor || {},
      items: invoiceDraft.lineItems || [],
      totals: invoiceDraft.totals || {},
    },
    rawExtractedData: extractedData,
    databaseEnrichment: {
      purchaseOrder: purchaseOrderMaster,
      vendor: vendorMaster,
      grn: goodsReceiptNoteMaster,
      deliveryChallan: deliveryChallanMaster,
    },
    finalInvoiceData: invoiceDraft,
    extractedData: invoiceDraft,
    invoiceDraft,
    extractionSummary: draft.extraction_summary || {},
    matchingReadiness: draft.matching_readiness || {},
    purchaseOrder: purchaseOrderMaster,
    goodsReceiptNote: goodsReceiptNoteMaster,
    grn: goodsReceiptNoteMaster,
    deliveryChallan: deliveryChallanMaster,
    vendor: vendorMaster,
    vendorMaster,
    matchingPreview: draft.matching_readiness || {},
    matchingComparison,
    threeWayMatchingPreview,
    matching: threeWayMatchingPreview,
    ocrData: extractedData,
    duplicateInvoice: draft.duplicate_invoice || null,
    vendorMatchConflict: storedVendorConflict,
    vendorValidation,
    matchedVendor,
    matchedPurchaseOrder,
    matchedGrn,
    matchedDeliveryChallan,
  };
};



class InvoiceController {
  // ─── Create ────────────────────────────────────────────────────────────────
  createInvoice = asyncHandler(async (req, res) => {
    const invoice = await invoiceService.createInvoice(req.body, req.user, req);
    res.status(201).json({ success: true, message: 'Invoice created successfully.', data: invoice });
  });

  // ─── List & Get ────────────────────────────────────────────────────────────
  getApprovedPurchaseOrdersForInvoice = asyncHandler(async (req, res) => {
    console.debug("[InvoiceController] getApprovedPurchaseOrdersForInvoice request received", {
      jwtUser: req.user ? { id: req.user.id, role: req.user.role } : null,
      requestParameters: req.query
    });
    const purchaseOrders = await invoiceService.getApprovedPurchaseOrdersForInvoice(req.query, req.user);
    console.debug("[InvoiceController] purchaseOrders returned count", { count: purchaseOrders.length });
    res.status(200).json({ success: true, purchaseOrders });
  });

  getInvoices = asyncHandler(async (req, res) => {
    const result = await invoiceService.listInvoices(req.query, req.user);
    res.status(200).json({ success: true, ...result });
  });

  getInvoiceById = asyncHandler(async (req, res) => {
    const invoice = await invoiceService.getInvoiceById(req.params.id, req.user);
    res.status(200).json({ success: true, data: invoice });
  });

  // ─── Role-Level Approval ───────────────────────────────────────────────────
  approveInvoice = asyncHandler(async (req, res) => {
    const { remarks } = req.body || {};
    const invoice = await invoiceService.approveInvoice(req.params.id, req.user, remarks, req);
    res.status(200).json({ success: true, message: 'Invoice approved at current level.', data: invoice });
  });

  rejectInvoice = asyncHandler(async (req, res) => {
    const { rejectionReason, remarks } = req.body || {};
    const reason = (rejectionReason || remarks || '').trim();
    const invoice = await invoiceService.rejectInvoice(req.params.id, req.user, reason, req);
    res.status(200).json({ success: true, message: 'Invoice rejected.', data: invoice });
  });

  cancelInvoice = asyncHandler(async (req, res) => {
    const invoice = await invoiceService.cancelInvoice(req.params.id, req.user, req);
    res.status(200).json({ success: true, message: 'Invoice cancelled.', data: invoice });
  });

  // ─── Admin Review ──────────────────────────────────────────────────────────
  adminApproveInvoice = asyncHandler(async (req, res) => {
    const { remarks } = req.body || {};
    const invoice = await invoiceService.adminApproveInvoice(req.params.id, req.user, remarks, req);
    res.status(200).json({ success: true, message: 'Admin Review approved. Invoice forwarded to Team Lead.', data: invoice });
  });

  adminRejectInvoice = asyncHandler(async (req, res) => {
    const { remarks } = req.body || {};
    const invoice = await invoiceService.adminRejectInvoice(req.params.id, req.user, remarks, req);
    res.status(200).json({ success: true, message: 'Admin Review rejected. Invoice returned.', data: invoice });
  });

  // ─── Soft Delete & Restore ─────────────────────────────────────────────────
  softDeleteInvoice = asyncHandler(async (req, res) => {
    const { deleteReason } = req.body || {};
    const result = await invoiceService.softDeleteInvoice(req.params.id, req.user, deleteReason, req);
    res.status(200).json({ success: true, ...result });
  });

  restoreInvoice = asyncHandler(async (req, res) => {
    const result = await invoiceService.restoreInvoice(req.params.id, req.user, req);
    res.status(200).json({ success: true, ...result });
  });

  // ─── Pending Queues ────────────────────────────────────────────────────────
  getPendingThreeWayMatch = asyncHandler(async (req, res) => {
    const result = await invoiceService.getPendingThreeWayMatch(req.query);
    res.status(200).json({ success: true, ...result });
  });

  getPendingAdminReview = asyncHandler(async (req, res) => {
    const result = await invoiceService.getPendingAdminReview(req.query);
    res.status(200).json({ success: true, ...result });
  });

  getPendingTeamLead = asyncHandler(async (req, res) => {
    const result = await invoiceService.getPendingTeamLead(req.query);
    res.status(200).json({ success: true, ...result });
  });

  getPendingManager = asyncHandler(async (req, res) => {
    const result = await invoiceService.getPendingManager(req.query);
    res.status(200).json({ success: true, ...result });
  });

  getPendingFinanceHead = asyncHandler(async (req, res) => {
    const result = await invoiceService.getPendingFinanceHead(req.query);
    res.status(200).json({ success: true, ...result });
  });

  // ─── History ───────────────────────────────────────────────────────────────
  getApprovalHistory = asyncHandler(async (req, res) => {
    const history = await invoiceService.getApprovalHistory(req.params.id);
    res.status(200).json({ success: true, data: history });
  });

  // ─── My Invoices ───────────────────────────────────────────────────────────
  getMyApprovedInvoices = asyncHandler(async (req, res) => {
    const result = await invoiceService.getMyApprovedInvoices(req.query, req.user);
    res.status(200).json({ success: true, ...result });
  });

  getMyPendingInvoices = asyncHandler(async (req, res) => {
    const result = await invoiceService.getMyPendingInvoices(req.query, req.user);
    res.status(200).json({ success: true, ...result });
  });

  // ─── Finance Head Observation ─────────────────────────────────────────────
  getFinanceHeadObservation = asyncHandler(async (req, res) => {
    const result = await invoiceService.getFinanceHeadObservationDashboard(req.query);
    res.status(200).json({ success: true, ...result });
  });

  addFinanceHeadRemark = asyncHandler(async (req, res) => {
    const { remark } = req.body || {};
    const result = await invoiceService.addFinanceHeadRemark(req.params.id, req.user, remark, req);
    res.status(200).json({ success: true, ...result });
  });

  downloadInvoicePdf = asyncHandler(async (req, res) => {
    const invoice = await invoiceService.downloadInvoicePdf(req.params.id, req.user, req);

    if (!invoice) {
      throw new ApiError(404, 'Invoice not found.');
    }

    let pdfBuffer;
    try {
      pdfBuffer = await generateInvoicePdf(invoice, COMPANY_CONFIG);
    } catch (pdfError) {
      console.error('[Invoice PDF] Generation failed:', pdfError);
      throw new ApiError(500, 'PDF generation failed. Please try again.');
    }

    if (!pdfBuffer || pdfBuffer.length === 0) {
      throw new ApiError(500, 'PDF generation produced an empty document. Please contact support.');
    }

    const safeNumber = String(invoice.invoice_number || invoice.invoiceNumber || invoice.id || 'invoice-document').replace(/[/\\?%*:|"<>]/g, '_');
    const filename = `${safeNumber}.pdf`;

    res.set({
      'Content-Type':        'application/pdf',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Content-Length':      pdfBuffer.length,
      'Cache-Control':       'no-cache, no-store, must-revalidate',
      'Pragma':              'no-cache',
      'Expires':             '0',
    });

    res.end(pdfBuffer);
  });

  processInvoiceOcr = asyncHandler(async (req, res) => {
    ocrLog('API', 'Upload started', {
      userId: req.user?.id,
      role: req.user?.role,
      contentType: req.headers?.['content-type'] ? 'multipart/form-data' : null,
    });
    const file = req.file || (req.files && req.files.invoiceFile && req.files.invoiceFile[0]);
    if (!file) {
      throw new ApiError(400, 'Please upload an invoice document file (PDF, PNG, JPG, JPEG, or TIFF).');
    }
    ocrLog('API', 'File received', {
      originalFileName: file.originalname,
      mimeType: file.mimetype,
      fileSize: file.size,
    });

    const ocrDocument = await invoiceOcrPersistenceService.createProcessingDocument({ file, user: req.user });
    console.info('[OCR PERF] Job created:', ocrDocument.id);
    const totalStartedAt = Date.now();
    const runPipeline = async () => {
    perfTime('[OCR PERF] Total OCR job');
    let ocrResult = null;
    try {
      ocrLog('API', 'OCR extraction started', { ocrDocumentId: ocrDocument.id });
      invoiceOcrJobService.updateJob(ocrDocument.id, {
        status: 'PROCESSING',
        stage: 'TEXT_EXTRACTION',
        progress: 20,
      });
      
      ocrResult = await processInvoiceOcrService(file);
      invoiceOcrJobService.updateJob(ocrDocument.id, {
        status: 'PROCESSING',
        stage: 'FIELD_MAPPING',
        progress: 55,
      });
      ocrLog('API', 'OCR extraction completed', {
        ocrDocumentId: ocrDocument.id,
        status: ocrResult.status,
        confidence: ocrResult.confidence,
      });
      
      debugOcrFlow('[OCR] Raw response', {
        ocrDocumentId: ocrDocument.id,
        status: ocrResult.status,
        confidence: ocrResult.confidence,
        hasExtractedData: Boolean(ocrResult.extractedData),
        pageCount: ocrResult.extractedData?.document?.pageCount || ocrResult.extractedData?.pageCount || null,
        pageSources: Array.isArray(ocrResult.extractedData?.document?.pages)
          ? ocrResult.extractedData.document.pages.map((page) => ({
              pageNumber: page.pageNumber,
              source: page.source,
              confidence: page.confidence,
              textLength: page.textLength,
            }))
          : [],
        confidenceBreakdown: ocrResult.extractedData?.extractionSummary?.confidenceBreakdown || null,
        missingCriticalFields: ocrResult.extractedData?.extractionSummary?.missingCriticalFields || [],
        lineItemsCount: Array.isArray(ocrResult.extractedData?.lineItems) ? ocrResult.extractedData.lineItems.length : 0,
        rawTextLength: String(ocrResult.extractedData?.rawText || '').length,
      });
    } catch (ocrError) {
      await invoiceOcrPersistenceService.markDocumentFailed({
        ocrDocumentId: ocrDocument.id,
        errorMessage: ocrError?.message || 'OCR processing failed.',
      });
      perfTimeEnd('[OCR PERF] Total OCR job');
      throw ocrError;
    }
    const extracted = ocrResult.extractedData || {};
    const vendorData = extracted.vendor || {};
    const references = extracted.references || {};
    const invoiceNumber = extracted.header?.invoiceNumber;
    const databaseStartedAt = Date.now();
    invoiceOcrJobService.updateJob(ocrDocument.id, {
      status: 'PROCESSING',
      stage: 'VENDOR_LOOKUP',
      progress: 60,
    });
    ocrLog('DB', 'Database enrichment started', {
      ocrDocumentId: ocrDocument.id,
      vendorCode: vendorData.vendorCode || null,
      gstNumber: vendorData.gstin || vendorData.gstNumber || null,
      poNumber: references.poNumber || null,
      grnNumber: references.grnNumber || null,
      deliveryChallanNumber: references.deliveryChallanNumber || null,
    });
    ocrLog('API', 'Normalized data', {
      ocrDocumentId: ocrDocument.id,
      invoiceNumber: invoiceNumber || null,
      poNumber: references.poNumber || null,
      vendorCode: vendorData.vendorCode || null,
      grnNumber: references.grnNumber || null,
      deliveryChallanNumber: references.deliveryChallanNumber || null,
      lineItemsCount: Array.isArray(extracted.lineItems) ? extracted.lineItems.length : 0,
      grandTotal: extracted.totals?.grandTotal || null,
    });

    ocrLog('DB', 'Vendor lookup candidates', {
      ocrDocumentId: ocrDocument.id,
      vendorCode: vendorData.vendorCode || null,
      gstNumberDetected: Boolean(vendorData.gstin || vendorData.gstNumber),
      panDetected: Boolean(vendorData.pan || vendorData.panNumber),
      emailDetected: Boolean(vendorData.email),
      phoneDetected: Boolean(vendorData.phone),
      companyNameDetected: Boolean(vendorData.vendorName || vendorData.companyName || vendorData.name),
    });
    const vendorMatchCandidates = buildVendorLookupAttempts(vendorData);
    const approvedVendorFilter = {
      deleted_at: null,
      is_active: true,
      status: 'ACTIVE',
      approval_status: 'APPROVED',
    };
    const vendorLookupPromise = findApprovedVendorByCandidates({
      candidates: vendorMatchCandidates,
      approvedVendorFilter,
      ocrDocumentId: ocrDocument.id,
    });
    const purchaseOrderLookupPromise = references.poNumber
      ? (async () => {
          perfTime('[OCR PERF] PO lookup');
          ocrLog('DB', 'PO lookup', {
            ocrDocumentId: ocrDocument.id,
            poNumber: references.poNumber,
            source: 'PURCHASE_ORDER_SERVICE',
          });
          try {
            const poReference = await prisma.purchaseOrder.findFirst({
              where: {
                ...insensitiveEqualsAny('po_number', references.poNumber),
                deleted_at: null,
              },
              select: { id: true, po_number: true },
            });
            if (!poReference || !poNumberMatches(poReference.po_number, references.poNumber)) return null;
            return purchaseOrderService.getPurchaseOrderById(poReference.id, req.user);
          } finally {
            perfTimeEnd('[OCR PERF] PO lookup');
          }
        })()
      : Promise.resolve(null);
    perfTime('[OCR PERF] Vendor lookup');
    const [vendorLookup, matchedPurchaseOrder] = await Promise.all([
      vendorLookupPromise,
      purchaseOrderLookupPromise,
    ]);
    perfTimeEnd('[OCR PERF] Vendor lookup');
    invoiceOcrJobService.updateJob(ocrDocument.id, {
      status: 'PROCESSING',
      stage: 'PO_LOOKUP',
      progress: 68,
    });
    let matchedVendor = vendorLookup.vendor;
    let vendorMatchMethod = vendorLookup.method;
    let vendorMatchValue = vendorLookup.value;
    const vendorFromOcrLookup = matchedVendor;
    if (matchedVendor) {
      ocrLog('DB', 'Vendor matched via OCR lookup', { ocrDocumentId: ocrDocument.id, vendorId: matchedVendor.id, vendorCode: matchedVendor.vendor_code, matchMethod: vendorMatchMethod });
    } else {
    ocrLog('DB', 'Vendor not found', { ocrDocumentId: ocrDocument.id, attemptedMethods: vendorMatchCandidates.map((c) => c.method) });
    }

    if (matchedPurchaseOrder) {
        ocrLog('DB', 'PO matched', { ocrDocumentId: ocrDocument.id, purchaseOrderId: matchedPurchaseOrder.id, poNumber: matchedPurchaseOrder.po_number });
    } else {
      ocrLog('DB', 'PO not found', { ocrDocumentId: ocrDocument.id, poNumber: references.poNumber || null });
    }

    let vendorMatchConflict = null;
    if (matchedVendor && matchedPurchaseOrder?.vendor && matchedVendor.id !== matchedPurchaseOrder.vendor.id) {
      vendorMatchConflict = {
        extractedVendorId: matchedVendor.id,
        purchaseOrderVendorId: matchedPurchaseOrder.vendor.id,
        ocrVendorName: vendorData.vendorName || vendorData.name || null,
        ocrVendorCode: vendorData.vendorCode || null,
        matchedVendorName: matchedVendor.name || null,
        matchedVendorCode: matchedVendor.vendor_code || null,
        poVendorName: matchedPurchaseOrder.vendor.name || null,
        poVendorCode: matchedPurchaseOrder.vendor.vendor_code || null,
        message: 'The extracted Vendor Code matched a different Vendor Master record than the Purchase Order vendor. Both records are shown for review.',
      };
    }
    if (!matchedVendor && matchedPurchaseOrder?.vendor) {
      matchedVendor = matchedPurchaseOrder.vendor;
      ocrLog('DB', 'Vendor matched from PO relation', { ocrDocumentId: ocrDocument.id, vendorId: matchedVendor.id, vendorCode: matchedVendor.vendor_code });
    }
    const vendorValidation = {
      status: vendorMatchConflict
        ? 'MISMATCH'
        : matchedVendor && matchedPurchaseOrder?.vendor
          ? 'MATCHED'
        : vendorData.vendorCode && !vendorFromOcrLookup
          ? 'NOT_FOUND'
          : 'PENDING',
      ocrVendorName: vendorData.vendorName || vendorData.name || null,
      ocrVendorCode: vendorData.vendorCode || null,
      vendorMasterId: vendorFromOcrLookup?.id || matchedVendor?.id || null,
      vendorMasterName: vendorFromOcrLookup?.name || matchedVendor?.name || null,
      vendorMasterCode: vendorFromOcrLookup?.vendor_code || matchedVendor?.vendor_code || null,
      vendorMasterMatchMethod: vendorMatchMethod,
      vendorMasterMatchValue: vendorMatchValue && ['EMAIL', 'PHONE'].includes(vendorMatchMethod)
        ? '[REDACTED]'
        : vendorMatchValue,
      purchaseOrderVendorId: matchedPurchaseOrder?.vendor?.id || null,
      purchaseOrderVendorName: matchedPurchaseOrder?.vendor?.name || null,
      purchaseOrderVendorCode: matchedPurchaseOrder?.vendor?.vendor_code || null,
      message: vendorMatchConflict?.message
        || (vendorData.vendorCode && !vendorFromOcrLookup
          ? matchedPurchaseOrder?.vendor
            ? 'Vendor Code was extracted from OCR but did not match an approved Vendor Master record. Purchase Order vendor was resolved from PostgreSQL as fallback context.'
            : 'Vendor Code was extracted from OCR, but no approved Vendor Master record was found for that code.'
          : null)
        || (matchedVendor && matchedPurchaseOrder?.vendor
          ? 'Vendor Code / Vendor Master matches the Purchase Order vendor.'
          : 'Vendor validation is pending because Vendor Master or Purchase Order was not found.'),
    };

    ocrLog('DB', 'GRN lookup started', {
      ocrDocumentId: ocrDocument.id,
      grnNumber: references.grnNumber || null,
      purchaseOrderId: matchedPurchaseOrder?.id || null,
      fallbackToPurchaseOrderRelation: !references.grnNumber,
    });
    ocrLog('DB', 'GRN lookup', {
      ocrDocumentId: ocrDocument.id,
      grnNumber: references.grnNumber || null,
      purchaseOrderId: matchedPurchaseOrder?.id || null,
    });
    invoiceOcrJobService.updateJob(ocrDocument.id, {
      status: 'PROCESSING',
      stage: 'GRN_LOOKUP',
      progress: 74,
    });
    perfTime('[OCR PERF] GRN lookup');
    const matchedGrn = references.grnNumber
      ? await prisma.goodsReceiptNote.findFirst({
          where: {
            ...insensitiveEqualsAny('grn_number', references.grnNumber),
            ...(matchedPurchaseOrder?.id ? { purchase_order_id: matchedPurchaseOrder.id } : {}),
            deleted_at: null,
          },
          include: {
            items: true,
            purchase_order: true,
            vendor: true,
            delivery_challan: { include: { items: true, purchase_order: true, vendor: true } },
          },
        })
      : matchedPurchaseOrder?.grns?.[0] || null;
    perfTimeEnd('[OCR PERF] GRN lookup');
    ocrLog('DB', 'GRN lookup result', {
      ocrDocumentId: ocrDocument.id,
      grnId: matchedGrn?.id || null,
      grnNumber: matchedGrn?.grn_number || references.grnNumber || null,
      found: Boolean(matchedGrn),
    });
    if (matchedGrn) {
    }

    ocrLog('DB', 'DC lookup started', {
      ocrDocumentId: ocrDocument.id,
      deliveryChallanNumber: references.deliveryChallanNumber || null,
      purchaseOrderId: matchedPurchaseOrder?.id || null,
      fallbackToPurchaseOrderRelation: !references.deliveryChallanNumber,
    });
    ocrLog('DB', 'DC lookup', {
      ocrDocumentId: ocrDocument.id,
      deliveryChallanNumber: references.deliveryChallanNumber || null,
      purchaseOrderId: matchedPurchaseOrder?.id || null,
    });
    invoiceOcrJobService.updateJob(ocrDocument.id, {
      status: 'PROCESSING',
      stage: 'DC_LOOKUP',
      progress: 82,
    });
    perfTime('[OCR PERF] DC lookup');
    const matchedDeliveryChallan = references.deliveryChallanNumber
      ? await prisma.deliveryChallan.findFirst({
          where: {
            ...insensitiveEqualsAny('delivery_challan_number', references.deliveryChallanNumber),
            ...(matchedPurchaseOrder?.id ? { purchase_order_id: matchedPurchaseOrder.id } : {}),
            deleted_at: null,
          },
          include: { items: true, purchase_order: true, vendor: true },
        })
      : matchedGrn?.delivery_challan || matchedPurchaseOrder?.delivery_challans?.[0] || null;
    perfTimeEnd('[OCR PERF] DC lookup');
    ocrLog('DB', 'DC lookup result', {
      ocrDocumentId: ocrDocument.id,
      deliveryChallanId: matchedDeliveryChallan?.id || null,
      deliveryChallanNumber: matchedDeliveryChallan?.delivery_challan_number || references.deliveryChallanNumber || null,
      found: Boolean(matchedDeliveryChallan),
    });
    if (matchedDeliveryChallan) {
    }

    const duplicateInvoice = invoiceNumber
      ? await prisma.invoice.findFirst({
          where: {
            invoice_number: { equals: invoiceNumber, mode: 'insensitive' },
            deleted_at: null,
          },
          select: { id: true, invoice_number: true, vendor_id: true, purchase_order_id: true, status: true },
        })
      : null;
    ocrLog('DB', 'Database enrichment completed', {
      ocrDocumentId: ocrDocument.id,
      databaseMs: Date.now() - databaseStartedAt,
      vendorMatched: Boolean(matchedVendor),
      purchaseOrderMatched: Boolean(matchedPurchaseOrder),
      grnMatched: Boolean(matchedGrn),
      deliveryChallanMatched: Boolean(matchedDeliveryChallan),
      duplicateInvoiceFound: Boolean(duplicateInvoice),
    });

    const isFailed = ['FAILED', 'LOW_CONFIDENCE'].includes(ocrResult.status);
    const invoiceDraft = buildInvoiceDraft({
      extracted,
      matchedVendor,
      matchedPurchaseOrder,
      matchedGrn,
      matchedDeliveryChallan,
    });
    ocrLog('API', 'Invoice draft built', {
      ocrDocumentId: ocrDocument.id,
      invoiceNumber: invoiceDraft.header?.invoiceNumber || null,
      invoiceDate: invoiceDraft.header?.invoiceDate || null,
      receiptDate: invoiceDraft.header?.receiptDate || null,
      vendorCode: invoiceDraft.vendor?.vendorCode || null,
      poNumber: invoiceDraft.references?.poNumber || null,
      grnNumber: invoiceDraft.references?.grnNumber || null,
      deliveryChallanNumber: invoiceDraft.references?.deliveryChallanNumber || null,
      itemCount: invoiceDraft.lineItems?.length || 0,
      grandTotal: invoiceDraft.totals?.grandTotal || null,
    });
    const extractionSummary = {
      ...(extracted.extractionSummary || {}),
      databaseMatches: {
        purchaseOrder: Boolean(matchedPurchaseOrder),
        vendor: Boolean(matchedVendor),
        grn: Boolean(matchedGrn),
        deliveryChallan: Boolean(matchedDeliveryChallan),
      },
      systemGenerated: {
        invoiceNumber: !extracted.header?.invoiceNumber,
        invoiceDate: !extracted.header?.invoiceDate,
        receiptDate: !extracted.header?.receiptDate,
        dueDate: !extracted.header?.dueDate,
      },
      lineItemsInDraft: invoiceDraft.lineItems.length,
      missingOptionalFields: Object.entries(invoiceDraft.fieldSources || {}).flatMap(([section, fields]) =>
        typeof fields === 'object' && !Array.isArray(fields)
          ? Object.entries(fields).filter(([, source]) => source === 'NOT_AVAILABLE').map(([field]) => `${section}.${field}`)
          : []
      ),
      warnings: vendorMatchConflict ? [vendorMatchConflict.message] : [],
    };
    invoiceDraft.extractionSummary = extractionSummary;
    const normalizedOcrStatus = ocrResult.status;
    const message = normalizedOcrStatus === 'SUCCESS'
      ? 'Invoice extracted successfully. Review the values before creating the invoice.'
      : normalizedOcrStatus === 'PARTIAL_DATA'
        ? 'Invoice partially extracted. Please review the highlighted fields.'
        : extracted.reason || 'The invoice could not be extracted reliably. Please upload a clearer document.';
    ocrResult = { ...ocrResult, status: normalizedOcrStatus };
    const matchingReadiness = {
      purchaseOrderMatched: Boolean(matchedPurchaseOrder),
      vendorMatched: Boolean(matchedVendor),
      grnMatched: Boolean(matchedGrn),
      deliveryChallanMatched: Boolean(matchedDeliveryChallan),
      canRunExistingThreeWayMatch: Boolean(matchedPurchaseOrder && matchedGrn && matchedDeliveryChallan),
    };
    const resolvedVendorMasterRecord = vendorFromOcrLookup || matchedVendor || matchedPurchaseOrder?.vendor || null;
    const vendorMaster = mapVendorMasterForOcr(
      resolvedVendorMasterRecord,
      matchedPurchaseOrder?.currency || invoiceDraft.header?.currency || resolvedVendorMasterRecord?.currency || 'INR',
    );
    const purchaseOrderMaster = mapPurchaseOrderForOcr(matchedPurchaseOrder);
    const goodsReceiptNoteMaster = mapGoodsReceiptNoteForOcr(matchedGrn);
    const deliveryChallanMaster = mapDeliveryChallanForOcr(matchedDeliveryChallan);
    const lookupValidations = {
      purchaseOrder: lookupValidation({
        label: 'Purchase Order',
        extractedValue: references.poNumber || null,
        matchedRecord: matchedPurchaseOrder,
        matchedValue: matchedPurchaseOrder?.po_number || null,
      }),
      vendor: {
        status: vendorValidation.status,
        extractedValue: vendorData.vendorCode || vendorData.gstin || vendorData.gstNumber || vendorData.vendorName || vendorData.name || null,
        matchedValue: vendorMaster?.vendorCode || vendorMaster?.gstNumber || vendorMaster?.companyName || null,
        message: vendorValidation.message,
        source: vendorMatchMethod || (matchedVendor && matchedPurchaseOrder?.vendor ? 'PURCHASE_ORDER_RELATION' : null),
      },
      grn: lookupValidation({
        label: 'GRN',
        extractedValue: references.grnNumber || null,
        matchedRecord: matchedGrn,
        matchedValue: matchedGrn?.grn_number || null,
        fallbackSource: matchedPurchaseOrder?.grns?.[0] ? 'PURCHASE_ORDER_RELATION' : null,
      }),
      deliveryChallan: lookupValidation({
        label: 'Delivery Challan',
        extractedValue: references.deliveryChallanNumber || null,
        matchedRecord: matchedDeliveryChallan,
        matchedValue: matchedDeliveryChallan?.delivery_challan_number || null,
        fallbackSource: matchedGrn?.delivery_challan
          ? 'GRN_RELATION'  
          : matchedPurchaseOrder?.delivery_challans?.[0]
            ? 'PURCHASE_ORDER_RELATION'
            : null,
      }),
    };
    ocrLog('API', 'Enrichment completed', {
      ocrDocumentId: ocrDocument.id,
      purchaseOrderMatched: Boolean(purchaseOrderMaster),
      vendorMatched: Boolean(vendorMaster),
      grnMatched: Boolean(goodsReceiptNoteMaster),
      deliveryChallanMatched: Boolean(deliveryChallanMaster),
    });
    ocrLog('MATCH', 'Three-way preview started', {
      ocrDocumentId: ocrDocument.id,
      purchaseOrderMatched: Boolean(matchedPurchaseOrder),
      vendorMatched: Boolean(matchedVendor),
      grnMatched: Boolean(matchedGrn),
      deliveryChallanMatched: Boolean(matchedDeliveryChallan),
    });
    const matchingComparison = buildOcrMasterComparison({
      extracted,
      invoiceDraft,
      purchaseOrder: matchedPurchaseOrder,
      vendorMaster,
    });
    const threeWayMatchingPreview = buildThreeWayMatchingPreview({
      invoiceDraft,
      matchedVendor,
      matchedPurchaseOrder,
      matchedGrn,
      matchedDeliveryChallan,
    });
    ocrLog('MATCH', 'Three-way preview result', {
      ocrDocumentId: ocrDocument.id,
      total: matchingComparison.summary.total,
      matched: matchingComparison.summary.matched,
      mismatched: matchingComparison.summary.mismatched,
      notFound: matchingComparison.summary.notFound,
      threeWayStatus: threeWayMatchingPreview.status,
    });
    let ocrDraft = null;
    try {
      const persistenceStartedAt = Date.now();
      invoiceOcrJobService.updateJob(ocrDocument.id, {
        status: 'PROCESSING',
        stage: 'DATABASE_SAVE',
        progress: 92,
      });
      perfTime('[OCR PERF] Database persistence');
      ocrDraft = await invoiceOcrPersistenceService.completeDocumentWithExtraction({
        ocrDocumentId: ocrDocument.id,
        file,
        user: req.user,
        ocrResult,
        extracted,
        invoiceDraft,
        extractionSummary,
        matchingReadiness,
        matchedVendor,
        matchedPurchaseOrder,
        matchedGrn,
        matchedDeliveryChallan,
        duplicateInvoice,
        vendorMatchConflict,
      });
      ocrLog('DB', 'OCR draft saved', {
        ocrDocumentId: ocrDocument.id,
        ocrDraftId: ocrDraft?.id,
        ocrExtractionId: ocrDraft?.ocrExtractionId,
        itemCount: invoiceDraft.lineItems.length,
        persistenceMs: Date.now() - persistenceStartedAt,
      });
      perfTimeEnd('[OCR PERF] Database persistence');
    } catch (draftError) {
      perfTimeEnd('[OCR PERF] Database persistence');
      perfTimeEnd('[OCR PERF] Total OCR job');
      console.error('[Invoice OCR] Draft persistence failed:', draftError);
      throw new ApiError(500, 'OCR extraction completed, but the review draft could not be saved. Please run the latest database migration and try again.');
    }

    const normalizedOcr = buildNormalizedOcrResponse({
      confidence: ocrResult.confidence,
      status: ocrResult.status,
      ocrDocument: {
        id: ocrDocument.id,
        fileName: ocrDocument.fileName,
        fileType: ocrDocument.fileType,
        fileSize: ocrDocument.fileSize,
        pageCount: extracted.document?.pageCount,
      },
      ocrDraft,
      invoiceDraft,
      extractedData: extracted,
      file,
    });

    const normalizedOCRData = {
        draftId: ocrDraft?.id || null,
        ocrDraft,
        ocr: normalizedOcr,
        vendorCode: invoiceDraft.vendor?.vendorCode || extracted.vendor?.vendorCode || null,
        poNumber: invoiceDraft.references?.poNumber || null,
        grnNumber: invoiceDraft.references?.grnNumber || matchedGrn?.grn_number || null,
        deliveryChallanNumber: invoiceDraft.references?.deliveryChallanNumber || matchedDeliveryChallan?.delivery_challan_number || null,
        confidence: {
          overall: Number(ocrResult.confidence || 0),
          fields: extracted.fieldConfidence || {},
        },
        ocrDocument: {
          id: ocrDraft?.ocrDocumentId || ocrDocument.id,
          fileName: ocrDraft?.sourceFileName || ocrDocument.fileName,
          fileType: ocrDraft?.mimeType || ocrDocument.fileType,
          status: ocrDraft?.draftStatus || ocrDocument.status,
          confidence: Number(ocrResult.confidence || 0),
        },
        extraction: {
          invoiceNumber: invoiceDraft.header?.invoiceNumber || null,
          invoiceDate: invoiceDraft.header?.invoiceDate || null,
          receiptDate: invoiceDraft.header?.receiptDate || null,
          dueDate: invoiceDraft.header?.dueDate || null,
          poNumber: invoiceDraft.references?.poNumber || null,
          grnNumber: invoiceDraft.references?.grnNumber || null,
          deliveryChallanNumber: invoiceDraft.references?.deliveryChallanNumber || null,
          currency: invoiceDraft.header?.currency || 'INR',
          paymentTerms: invoiceDraft.terms?.paymentTerms || invoiceDraft.header?.paymentTerms || null,
          subtotal: invoiceDraft.totals?.subtotal ?? null,
          discount: invoiceDraft.totals?.totalDiscount ?? invoiceDraft.totals?.discount ?? null,
          taxableAmount: invoiceDraft.totals?.taxableAmount ?? null,
          cgst: invoiceDraft.totals?.cgstTotal ?? invoiceDraft.totals?.cgst ?? null,
          sgst: invoiceDraft.totals?.sgstTotal ?? invoiceDraft.totals?.sgst ?? null,
          igst: invoiceDraft.totals?.igstTotal ?? invoiceDraft.totals?.igst ?? null,
          totalTax: invoiceDraft.totals?.totalTax ?? invoiceDraft.totals?.taxTotal ?? null,
          otherCharges: invoiceDraft.totals?.otherCharges ?? null,
          roundOff: invoiceDraft.totals?.roundOff ?? null,
          grandTotal: invoiceDraft.totals?.grandTotal ?? null,
          vendor: {
            name: invoiceDraft.vendor?.vendorName || invoiceDraft.vendor?.name || null,
            vendorCode: invoiceDraft.vendor?.vendorCode || null,
            gstNumber: invoiceDraft.vendor?.gstin || invoiceDraft.vendor?.gstNumber || null,
            panNumber: invoiceDraft.vendor?.pan || invoiceDraft.vendor?.panNumber || null,
            contactPerson: invoiceDraft.vendor?.contactPerson || null,
            email: invoiceDraft.vendor?.email || null,
            phone: invoiceDraft.vendor?.phone || null,
            address: invoiceDraft.vendor?.vendorAddress || invoiceDraft.vendor?.address || null,
          },
          items: invoiceDraft.lineItems || [],
        },
        purchaseOrder: purchaseOrderMaster,
        goodsReceiptNote: goodsReceiptNoteMaster,
        grn: goodsReceiptNoteMaster,
        deliveryChallan: deliveryChallanMaster,
        vendor: vendorMaster,
        vendorMaster,
        matchingPreview: matchingReadiness,
        matchingComparison,
        threeWayMatchingPreview,
        matching: threeWayMatchingPreview,
        rawExtractedData: extracted,
        ocrData: extracted,
        ocrStatus: ocrResult.status,
        ocrConfidence: ocrResult.confidence,
        validation: lookupValidations,
        databaseEnrichment: {
          purchaseOrder: purchaseOrderMaster,
          purchaseOrderLookup: {
            matched: Boolean(matchedPurchaseOrder),
            status: lookupValidations.purchaseOrder.status,
            message: lookupValidations.purchaseOrder.message,
            extractedPoNumber: references.poNumber || null,
            poNumber: matchedPurchaseOrder?.po_number || null,
            purchaseOrderId: matchedPurchaseOrder?.id || null,
            source: references.poNumber ? 'OCR_PO_NUMBER' : null,
          },
          vendor: vendorMaster,
          vendorLookup: {
            matched: Boolean(vendorFromOcrLookup),
            status: lookupValidations.vendor.status,
            message: lookupValidations.vendor.message,
            method: vendorMatchMethod,
            value: vendorMatchValue && ['EMAIL', 'PHONE'].includes(vendorMatchMethod)
              ? '[REDACTED]'
              : vendorMatchValue,
            attemptedMethods: vendorMatchCandidates.map((candidate) => candidate.method),
          },
          grn: goodsReceiptNoteMaster,
          grnLookup: {
            matched: Boolean(matchedGrn),
            status: lookupValidations.grn.status,
            message: lookupValidations.grn.message,
            extractedGrnNumber: references.grnNumber || null,
            grnNumber: matchedGrn?.grn_number || null,
            grnId: matchedGrn?.id || null,
            source: references.grnNumber
              ? 'OCR_GRN_NUMBER'
              : matchedPurchaseOrder?.grns?.[0]
                ? 'PURCHASE_ORDER_RELATION'
                : null,
          },
          deliveryChallan: deliveryChallanMaster,
          deliveryChallanLookup: {
            matched: Boolean(matchedDeliveryChallan),
            status: lookupValidations.deliveryChallan.status,
            message: lookupValidations.deliveryChallan.message,
            extractedDeliveryChallanNumber: references.deliveryChallanNumber || null,
            deliveryChallanNumber: matchedDeliveryChallan?.delivery_challan_number || null,
            deliveryChallanId: matchedDeliveryChallan?.id || null,
            source: references.deliveryChallanNumber
              ? 'OCR_DELIVERY_CHALLAN_NUMBER'
              : matchedGrn?.delivery_challan
                ? 'GRN_RELATION'
                : matchedPurchaseOrder?.delivery_challans?.[0]
                  ? 'PURCHASE_ORDER_RELATION'
                  : null,
          },
        },
        finalInvoiceData: invoiceDraft,
        extractedData: invoiceDraft,
        invoiceDraft,
        extractionSummary,
        matchedVendor,
        matchedPurchaseOrder,
        matchedGrn,
        matchedDeliveryChallan,
        duplicateInvoice,
        vendorMatchConflict,
        vendorValidation,
        matchingReadiness,
    };

    if (ocrDebugEnabled()) {
      console.info('[OCR API] Final normalized response summary:',
        JSON.stringify(buildSafeOcrResponseLog(normalizedOCRData), null, 2),
      );
    }

    const responsePayload = {
      success: !isFailed,
      message,
      data: normalizedOCRData,
    };
    perfTimeEnd('[OCR PERF] Total OCR job');
    return responsePayload;
    };

    const shouldRunSynchronously = req.query?.sync === 'true' || req.headers?.['x-ocr-sync'] === 'true';
    if (!shouldRunSynchronously) {
      const queuedJob = invoiceOcrJobService.enqueue({
        jobId: ocrDocument.id,
        onStart: async () => {
          await invoiceOcrPersistenceService.markDocumentProcessing({ ocrDocumentId: ocrDocument.id });
          ocrLog('API', 'Background OCR job started', {
            ocrDocumentId: ocrDocument.id,
            queuedMs: Date.now() - totalStartedAt,
          });
        },
        task: runPipeline,
        onSuccess: async (result) => {
          ocrLog('API', 'Background OCR job completed', {
            ocrDocumentId: ocrDocument.id,
            draftId: result?.data?.draftId || null,
            status: result?.data?.ocrStatus || null,
            totalMs: Date.now() - totalStartedAt,
          });
        },
        onFailure: async (error) => {
          const safeErrorMessage = /timed out/i.test(String(error?.message || ''))
            ? 'OCR processing took too long. Please upload a clearer or smaller invoice document.'
            : error?.message || 'OCR processing failed.';
          console.error('[Invoice OCR] Background processing failed:', {
            ocrDocumentId: ocrDocument.id,
            name: error?.name,
            message: safeErrorMessage,
          });
          await invoiceOcrPersistenceService.markDocumentFailed({
            ocrDocumentId: ocrDocument.id,
            errorMessage: safeErrorMessage,
          });
        },
      });

      res.status(202).json({
        success: true,
        message: 'Invoice processing started.',
        data: {
          jobId: ocrDocument.id,
          ocrId: ocrDocument.id,
          ocrDocumentId: ocrDocument.id,
          status: 'UPLOADED',
          processingStatus: 'UPLOADED',
          ocrStatus: 'NOT_STARTED',
          fileName: ocrDocument.fileName,
          fileType: ocrDocument.fileType,
          fileSize: ocrDocument.fileSize,
          queuePosition: queuedJob.queuePosition,
          activeJobs: queuedJob.activeCount,
          concurrency: queuedJob.concurrency,
          timeoutMs: queuedJob.timeoutMs,
          statusUrl: `/api/v1/invoices/ocr/${ocrDocument.id}/status`,
          enrichmentUrl: `/api/v1/ocr/invoice/${ocrDocument.id}/enrichment`,
        },
      });
      return;
    }

    const result = await runPipeline();
    res.status(200).json(result);
  });

  getOcrInvoiceDraft = asyncHandler(async (req, res) => {
    const draft = await invoiceOcrPersistenceService.getDraftRecord(req.params.draftId, req.user);
    if (!draft) {
      throw new ApiError(404, 'OCR invoice draft not found.');
    }

    const data = await buildOcrDraftResponsePayload(draft);

    res.status(200).json({
      success: true,
      data,
    });
  });

  getOcrInvoiceStatus = asyncHandler(async (req, res) => {
    const ocrId = req.params.ocrId;
    const inMemoryJob = invoiceOcrJobService.getJob(ocrId);
    const draft = await invoiceOcrPersistenceService.getDraftRecord(ocrId, req.user)
      || await invoiceOcrPersistenceService.getDraftRecordByOcrDocumentId(ocrId, req.user);

    if (draft) {
      const data = await buildOcrDraftResponsePayload(draft);
      const status = draft.draft_status === 'READY_FOR_REVIEW'
        ? 'READY'
        : draft.ocr_status === 'FAILED' || draft.draft_status === 'FAILED'
          ? 'FAILED'
          : draft.ocr_status === 'PARTIAL_SUCCESS' || draft.draft_status === 'REQUIRES_MANUAL_INPUT'
            ? 'PARTIAL'
            : 'PROCESSING';
      res.status(200).json({
        success: status !== 'FAILED',
        message: status === 'READY' || status === 'PARTIAL'
          ? 'Invoice OCR draft is ready for review.'
          : 'Invoice OCR is still processing.',
        data: {
          ...data,
          jobId: data.ocrDraft?.ocrDocumentId || ocrId,
          ocrId: data.ocrDraft?.ocrDocumentId || ocrId,
          status,
          processingStatus: status,
          stage: status === 'FAILED' ? 'FAILED' : 'COMPLETED',
          progress: 100,
        },
      });
      return;
    }

    const document = await invoiceOcrPersistenceService.getDocumentRecord(ocrId, req.user);
    if (!document) {
      throw new ApiError(404, 'OCR document not found.');
    }

    const processingStatus = String(document.processing_status || 'PROCESSING');
    const ocrStatus = String(document.ocr_status || 'PROCESSING');
    const isFailed = processingStatus === 'FAILED' || ocrStatus === 'FAILED';
    const jobStage = inMemoryJob?.stage || (
      processingStatus === 'UPLOADED'
        ? 'UPLOAD'
        : isFailed
          ? 'FAILED'
          : 'OCR_EXTRACTION'
    );
    const jobProgress = Number.isFinite(Number(inMemoryJob?.progress))
      ? Number(inMemoryJob.progress)
      : processingStatus === 'UPLOADED'
        ? 5
        : isFailed
          ? 100
          : 25;
    const safeErrorMessage = isFailed
      ? document.error_message || inMemoryJob?.errorMessage || 'OCR processing failed. Please try again.'
      : null;
    res.status(200).json({
      success: !isFailed,
      message: isFailed
        ? safeErrorMessage
        : 'Invoice OCR is still processing.',
      data: {
        jobId: document.id,
        ocrId: document.id,
        ocrDocumentId: document.id,
        status: isFailed ? 'FAILED' : processingStatus,
        processingStatus,
        ocrStatus,
        stage: jobStage,
        progress: jobProgress,
        ocrConfidence: Number(document.ocr_confidence || 0),
        fileName: document.original_file_name,
        fileType: document.file_type || document.mime_type,
        fileSize: document.file_size,
        startedAt: document.processing_started_at,
        completedAt: document.processing_completed_at,
        errorStage: isFailed ? 'OCR_PROCESSING' : null,
        errorMessage: safeErrorMessage,
      },
    });
  });

  getOcrInvoiceEnrichment = asyncHandler(async (req, res) => {
    const draft = await invoiceOcrPersistenceService.getDraftRecord(req.params.ocrId, req.user)
      || await invoiceOcrPersistenceService.getDraftRecordByOcrDocumentId(req.params.ocrId, req.user);
    if (!draft) {
      const document = await invoiceOcrPersistenceService.getDocumentRecord(req.params.ocrId, req.user);
      if (document) {
        const processingStatus = String(document.processing_status || 'PROCESSING');
        const ocrStatus = String(document.ocr_status || 'PROCESSING');
        const isFailed = processingStatus === 'FAILED' || ocrStatus === 'FAILED';
        res.status(200).json({
          success: !isFailed,
          message: isFailed ? 'OCR processing failed. Please try again.' : 'Invoice OCR is still processing.',
          data: {
            ocrId: document.id,
            ocrDocumentId: document.id,
            status: isFailed ? 'FAILED' : processingStatus,
            processingStatus,
            ocrStatus,
            ocrConfidence: Number(document.ocr_confidence || 0),
            fileName: document.original_file_name,
            fileType: document.file_type || document.mime_type,
            fileSize: document.file_size,
          },
        });
        return;
      }
      throw new ApiError(404, 'OCR invoice enrichment record not found.');
    }

    const data = await buildOcrDraftResponsePayload(draft);
    res.status(200).json({
      success: true,
      data: {
        ocrData: data.ocrData,
        vendor: data.vendorMaster || data.vendor,
        purchaseOrder: data.purchaseOrder,
        grn: data.grn || data.goodsReceiptNote,
        deliveryChallan: data.deliveryChallan,
        matching: data.threeWayMatchingPreview || data.matching,
        references: {
          vendorCode: data.vendorCode,
          poNumber: data.poNumber,
          grnNumber: data.grnNumber,
          deliveryChallanNumber: data.deliveryChallanNumber,
        },
        draftId: data.draftId,
        ocrDocumentId: data.ocrDraft?.ocrDocumentId || null,
      },
    });
  });
}

export default new InvoiceController();
