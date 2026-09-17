import api from "../api/axios";

const mapInvoice = (invoice) => {
  const purchaseOrder = invoice.purchase_order || invoice.purchaseOrder || null;
  const v = invoice.vendor || purchaseOrder?.vendor;
  const ocrStoredData = safeObject(invoice.ocr_extracted_data);
  const ocrInvoiceDraft = safeObject(ocrStoredData.invoiceDraft);
  const ocrStructuredData = safeObject(ocrStoredData.structuredData);
  const ocrHeader = safeObject(ocrInvoiceDraft.header || ocrStructuredData.header);
  const ocrTotals = safeObject(ocrInvoiceDraft.totals || ocrStructuredData.totals);
  const gstVal = v ? (v.gst_number || v.tax_id || null) : null;
  const fullAddr = v ? ([v.address_line1 || v.address, v.address_line2, v.city, v.district, v.state, v.zip_code, v.country].filter(Boolean).join(", ") || v.address || null) : null;

  const match = invoice.three_way_matches?.[0] || invoice.matching || null;
  const grnSnap = match?.grn_snapshot || match?.grnSnapshot;
  const dcSnap = match?.delivery_challan_snapshot || match?.deliveryChallanSnapshot;
  const directGrn = invoice.grn || invoice.goodsReceiptNote || purchaseOrder?.grns?.[0];
  const directDc = invoice.deliveryChallan || purchaseOrder?.delivery_challans?.[0];
  const approvedApproval = invoice.payment_approvals?.[0];

  const grnNum = grnSnap?.grnNumber || grnSnap?.grn_number || directGrn?.grn_number || "N/A";
  const grnDt = grnSnap?.receivedDate || directGrn?.received_date || directGrn?.created_at || null;
  const dcNum = dcSnap?.deliveryChallanNumber || dcSnap?.delivery_challan_number || directDc?.delivery_challan_number || "N/A";
  const dcDt = dcSnap?.deliveryDate || directDc?.delivery_date || directDc?.created_at || null;

  const invoiceTotal = Number(invoice.invoice_total ?? invoice.amount ?? 0);
  const paidAmount = Number(invoice.paid_amount ?? 0);
  const remainingAmount = Number(invoice.remaining_amount ?? (invoiceTotal - paidAmount));
  const rawLineItems = Array.isArray(invoice.line_items) && invoice.line_items.length
    ? invoice.line_items.map((item, index) => ({
        ...safeObject(ocrInvoiceDraft.lineItems?.[index]),
        ...item,
        itemCode: first(item.itemCode, item.item_code, item.code, item.sku, ocrInvoiceDraft.lineItems?.[index]?.itemCode, ocrInvoiceDraft.lineItems?.[index]?.item_code, ocrInvoiceDraft.lineItems?.[index]?.code, ocrInvoiceDraft.lineItems?.[index]?.sku),
      }))
    : Array.isArray(ocrInvoiceDraft.lineItems) && ocrInvoiceDraft.lineItems.length
      ? ocrInvoiceDraft.lineItems
        : Array.isArray(invoice.items) && invoice.items.length
          ? invoice.items
          : Array.isArray(purchaseOrder?.line_items)
        ? purchaseOrder.line_items
        : [];
  const taxSummary = normalizeTaxSummary(invoice.tax_summary || ocrTotals || purchaseOrder?.tax_summary || {}, rawLineItems.map(normalizePurchaseOrderItem), invoiceTotal);

  return {
    id: invoice.id,
    invoiceNumber: invoice.invoice_number,
    invoiceDate: invoice.invoice_date || ocrHeader.invoiceDate || null,
    purchaseOrderId: invoice.purchase_order_id,
    poNumber: purchaseOrder?.po_number || purchaseOrder?.poNumber,
    poDate: purchaseOrder?.order_date || purchaseOrder?.po_date || purchaseOrder?.poDate || purchaseOrder?.created_at,
    grnNumber: grnNum,
    grnDate: grnDt,
    deliveryChallanNumber: dcNum,
    deliveryChallanDate: dcDt,
    vendor: v?.name || null,
    vendorMaster: v || null,
    vendorData: v || null,
    vendorName: v?.name || null,
    vendorCode: v?.vendor_code || null,
    vendorId: v?.id || invoice.vendor_id || null,
    vendorEmail: v?.email || null,
    vendorPhone: v?.phone || null,
    vendorCategory: v?.category || null,
    vendorContactPerson: v?.contact_person || null,
    vendorContact: v?.contact_person || v?.phone || null,
    vendorState: v?.state || null,
    vendorGst: gstVal,
    gstNumber: gstVal,
    vendorPan: v?.pan_number || null,
    vendorAddress: fullAddr,
    vendorTaxType: v?.tax_type || null,
    vendorBankName: v?.bank_name || null,
    vendorAccountHolder: v?.account_holder || null,
    vendorBankAccountNo: v?.bank_account_no || null,
    vendorIfscCode: v?.ifsc_code || null,
    vendorBankBranch: v?.bank_branch || null,
    purchaseOrderAmount: Number(purchaseOrder?.amount || 0),
    purchaseOrderStatus: purchaseOrder?.status,
    amount: Number(invoice.amount),
    invoiceTotal: invoiceTotal,
    paidAmount: paidAmount,
    outstandingAmount: remainingAmount,
    remainingPayableAmount: remainingAmount,
    currency: invoice.currency,
    status: invoice.status,
    paymentStatus: invoice.payment_status,
    threeWayMatchStatus: invoice.three_way_match_status,
    threeWayMatch: match ? {
      id: match.id,
      status: match.status || match.overallStatus,
      overallStatus: match.overallStatus || match.status,
      matchPercentage: Number(match.match_percentage ?? match.matchPercentage ?? 0),
      matchingScore: Number(match.matchingScore ?? match.match_percentage ?? match.matchPercentage ?? 0),
      totalChecks: Number(match.total_fields_count ?? match.totalChecks ?? 0),
      matchedChecks: Number(match.matched_fields_count ?? match.matchedChecks ?? 0),
      mismatchedChecks: parseJsonArray(match.unmatched_fields ?? match.unmatchedFields).length,
      poMatch: match.po_match ?? match.poMatch,
      grnMatch: match.grn_match ?? match.grnMatch ?? Boolean(match.grn_id ?? match.grnId),
      deliveryChallanMatch: match.delivery_challan_match ?? match.deliveryChallanMatch ?? Boolean(match.delivery_challan_id ?? match.deliveryChallanId),
      invoiceMatch: Boolean(match.invoice_id ?? match.invoiceId),
      vendorMatch: match.vendor_match ?? match.vendorMatch,
      itemMatch: match.item_match ?? match.itemMatch,
      quantityMatch: match.quantity_match ?? match.quantityMatch,
      unitPriceMatch: match.unitPriceMatch ?? match.price_match ?? match.priceMatch,
      priceMatch: match.price_match ?? match.priceMatch ?? match.unitPriceMatch,
      taxMatch: match.tax_match ?? match.taxMatch,
      totalMatch: match.total_match ?? match.totalMatch,
      checks: match.checks || match.mismatch_details?.matching || match.mismatchDetails?.matching || {},
      comparisonResults: parseJsonArray(match.comparison_results ?? match.comparisonResults ?? match.mismatch_details?.comparisonResults ?? match.mismatchDetails?.comparisonResults),
      mismatchDetails: match.mismatch_details || match.mismatchDetails || null,
      unmatchedFields: parseJsonArray(match.unmatched_fields ?? match.unmatchedFields),
      matchedFields: parseJsonArray(match.matched_fields ?? match.matchedFields),
      warnings: parseJsonArray(match.warnings),
      grnNumber: match.grn?.grn_number || grnSnap?.grnNumber || grnSnap?.grn_number || grnNum,
      deliveryChallanNumber: match.delivery_challan?.delivery_challan_number || dcSnap?.deliveryChallanNumber || dcSnap?.delivery_challan_number || dcNum,
    } : null,
    paymentApprovalStatus: approvedApproval?.status || (invoice.status === "APPROVED" ? "APPROVED" : "PENDING"),
    approvedAmount: Number(approvedApproval?.amount || invoiceTotal),
    dueDate: invoice.due_date,
  description: invoice.description,
  createdAt: invoice.created_at,
  updatedAt: invoice.updated_at,
  createdById: invoice.created_by?.id || null,
  createdBy: invoice.created_by
    ? `${invoice.created_by.first_name || ""} ${invoice.created_by.last_name || ""}`.trim()
    : "-",
  vendorStatus: invoice.vendor?.status || "-",
  currentApprovalLevel: invoice.current_approval_level,
  requiredApprovalRole: invoice.required_approval_role,
  fileUrl: invoice.file_url,
  fileName: invoice.file_name,
  invoiceCreationMethod: invoice.invoice_creation_method,
  invoiceCategory: invoice.invoice_category,
  invoiceSource: invoice.invoice_source,
  ocrStatus: invoice.ocr_status,
  ocrConfidence: invoice.ocr_confidence,
  ocrExtractedData: invoice.ocr_extracted_data,
  attachments: invoice.attachments || [],
  taxSummary,
  teamLeadApprover: invoice.team_lead_approver
    ? `${invoice.team_lead_approver.first_name || ""} ${invoice.team_lead_approver.last_name || ""}`.trim() || "-"
    : "-",
  managerApprover: invoice.manager_approver
    ? `${invoice.manager_approver.first_name || ""} ${invoice.manager_approver.last_name || ""}`.trim() || "-"
    : "-",
  financeHeadApprover: invoice.finance_head_approver
    ? `${invoice.finance_head_approver.first_name || ""} ${invoice.finance_head_approver.last_name || ""}`.trim() || "-"
    : "-",
  purchaseOrder,
  grn: invoice.grn || invoice.goodsReceiptNote || directGrn || null,
  deliveryChallan: invoice.deliveryChallan || directDc || null,
  matching: invoice.matching || null,
  paymentTerms: purchaseOrder?.payment_terms || purchaseOrder?.paymentTerms || ocrHeader.paymentTerms || ocrInvoiceDraft.terms?.paymentTerms,
  deliveryAddress: purchaseOrder?.delivery_address,
  billingAddress: purchaseOrder?.billing_address,
  items: rawLineItems.map(normalizePurchaseOrderItem),
  };
};

const num = (value) => Number(value || 0);
const first = (...values) => values.find((value) => value !== undefined && value !== null && value !== "");
const debugInvoiceService = (...args) => {
  if (import.meta.env.DEV) console.debug(...args);
};
const safeArray = (value) => Array.isArray(value) ? value : [];
const safeObject = (value) => value && typeof value === "object" && !Array.isArray(value) ? value : {};
const parseJsonArray = (value) => {
  if (Array.isArray(value)) return value;
  if (typeof value !== "string") return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

const normalizePurchaseOrderItem = (item, index) => {
  const quantity = num(first(item.quantity, item.qty));
  const unitPrice = num(first(item.unitPrice, item.unit_price, item.price, item.rate));
  const discount = num(first(item.discount, item.discountAmount, item.discount_amount));
  const taxableAmount = num(first(item.taxableAmount, item.taxable_amount, quantity * unitPrice));
  const cgstAmount = num(first(item.cgstAmount, item.cgst_amount, item.cgst));
  const sgstAmount = num(first(item.sgstAmount, item.sgst_amount, item.sgst));
  const igstAmount = num(first(item.igstAmount, item.igst_amount, item.igst));
  const gstAmount = num(first(item.gstAmount, item.gst_amount, item.taxAmount, item.tax_amount, cgstAmount + sgstAmount + igstAmount));
  return {
    poItemId: first(item.id, item.itemId, item.item_id, `${index + 1}`),
    lineNumber: first(item.lineNumber, item.line_number, index + 1),
    itemCode: first(item.itemCode, item.item_code, item.code, item.sku, ""),
    hsnCode: first(item.hsnCode, item.hsn_code, item.hsnSac, item.hsn_sac, ""),
    itemName: first(item.itemName, item.item_name, item.name, item.description, ""),
    description: first(item.description, item.itemName, item.item_name, item.name, ""),
    quantity,
    unit: first(item.unit, item.uom, ""),
    unitPrice,
    discount,
    taxableAmount,
    cgstRate: num(first(item.cgstRate, item.cgst_rate)),
    sgstRate: num(first(item.sgstRate, item.sgst_rate)),
    igstRate: num(first(item.igstRate, item.igst_rate)),
    gstRate: num(first(item.gstRate, item.gst_rate, item.taxRate, item.tax_rate, item.cgstRate, item.cgst_rate, item.igstRate, item.igst_rate)),
    cgstAmount,
    sgstAmount,
    igstAmount,
    taxAmount: gstAmount,
    gstAmount,
    lineTotal: num(first(item.lineTotal, item.line_total, item.total, item.amount, taxableAmount + gstAmount)),
  };
};

const normalizeTaxSummary = (summary = {}, items = [], poAmount = 0) => {
  const subtotal = num(first(summary.subtotal, summary.taxableAmount, summary.taxable_amount)) ||
    items.reduce((total, item) => total + item.taxableAmount, 0);
  const discount = num(first(summary.discount, summary.totalDiscount, summary.total_discount));
  const cgstTotal = num(first(summary.cgstTotal, summary.cgst_total, summary.cgst));
  const sgstTotal = num(first(summary.sgstTotal, summary.sgst_total, summary.sgst));
  const igstTotal = num(first(summary.igstTotal, summary.igst_total, summary.igst));
  const totalGst = num(first(summary.totalGst, summary.total_gst, summary.gstAmount, summary.gst_amount)) ||
    cgstTotal + sgstTotal + igstTotal;
  const otherCharges = num(first(summary.otherCharges, summary.other_charges));
  const roundOff = num(first(summary.roundOff, summary.round_off));
  const grandTotal = num(first(summary.grandTotal, summary.grand_total, poAmount));

  return {
    ...summary,
    subtotal,
    taxableAmount: num(first(summary.taxableAmount, summary.taxable_amount, subtotal)),
    discount,
    totalDiscount: discount,
    cgstTotal,
    sgstTotal,
    igstTotal,
    totalGst,
    totalTax: num(first(summary.totalTax, summary.taxTotal, summary.total_tax, totalGst)),
    taxTotal: num(first(summary.taxTotal, summary.totalTax, summary.total_tax, totalGst)),
    otherCharges,
    roundOff,
    grandTotal,
  };
};

const toNullableNumber = (value) => {
  if (value === undefined || value === null || value === "") return null;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
};

const mapReceiptItem = (item = {}, movementKey) => {
  const movementQuantity = movementKey === "receivedQuantity"
    ? toNullableNumber(item.receivedQuantity ?? item.received_quantity ?? item.quantity)
    : toNullableNumber(item.deliveredQuantity ?? item.delivered_quantity ?? item.quantity);

  return {
    ...item,
    itemCode: first(item.itemCode, item.item_code, item.code, item.sku),
    itemName: first(item.itemName, item.item_name, item.name, item.description),
    quantity: movementQuantity,
    orderedQuantity: toNullableNumber(first(item.orderedQuantity, item.ordered_quantity)),
    receivedQuantity: toNullableNumber(first(item.receivedQuantity, item.received_quantity)),
    acceptedQuantity: toNullableNumber(first(item.acceptedQuantity, item.accepted_quantity)),
    rejectedQuantity: toNullableNumber(first(item.rejectedQuantity, item.rejected_quantity)),
    deliveredQuantity: toNullableNumber(first(item.deliveredQuantity, item.delivered_quantity)),
    unit: first(item.unit, item.uom),
    uom: first(item.uom, item.unit),
    unitPrice: toNullableNumber(first(item.unitPrice, item.unit_price, item.rate)),
    gstAmount: toNullableNumber(first(item.gstAmount, item.gst_amount, item.taxAmount, item.tax_amount)),
    lineTotal: toNullableNumber(first(item.lineTotal, item.line_total, item.total)),
  };
};

const mapReceiptItems = (items, movementKey) => safeArray(items).map((item) => mapReceiptItem(item, movementKey));

const mapApprovedPurchaseOrder = (po) => {
  const v = po.vendor || po.vendorReference || {};
  const rawItems = Array.isArray(po.line_items) ? po.line_items : Array.isArray(po.items) ? po.items : [];
  const items = rawItems.map(normalizePurchaseOrderItem);
  const amount = num(first(po.amount, po.totals?.amount, po.totals?.grandTotal));
  const gstVal = first(v.gst_number, v.tax_id, v.gstNumber);
  const fullAddr = [
    v.address_line1 || v.addressLine1 || v.address,
    v.address_line2 || v.addressLine2,
    v.city,
    v.district,
    v.state,
    v.zip_code || v.postalCode,
    v.country,
  ].filter(Boolean).join(", ") || v.address || null;

  return {
    id: po.id,
    poNumber: first(po.po_number, po.poNumber),
    vendorId: first(po.vendor_id, po.vendorId, v.id),
    vendor: first(v.name, v.companyName),
    vendorName: first(v.name, v.companyName),
    vendorCode: first(v.vendor_code, v.vendorCode),
    vendorGst: gstVal,
    gstNumber: gstVal,
    vendorCategory: first(v.category, v.vendorCategory),
    category: first(v.category, v.vendorCategory),
    vendorPan: first(v.pan_number, v.panNumber, v.pan),
    vendorAddress: fullAddr,
    address: fullAddr,
    vendorEmail: first(v.email, v.vendorEmail),
    email: v.email || null,
    vendorPhone: first(v.phone, v.vendorPhone),
    phone: first(v.phone, v.vendorPhone),
    vendorState: first(v.state, v.vendorState),
    state: first(v.state, v.vendorState),
    vendorContactPerson: first(v.contact_person, v.contactPerson),
    contactPerson: first(v.contact_person, v.contactPerson),
    vendorTaxType: first(v.tax_type, v.taxType),
    taxType: first(v.tax_type, v.taxType),
    vendorBankName: first(v.bank_name, v.bankName),
    bankName: first(v.bank_name, v.bankName),
    vendorAccountHolder: first(v.account_holder, v.accountHolder),
    accountHolder: first(v.account_holder, v.accountHolder),
    vendorBankAccountNo: first(v.bank_account_no, v.accountNumber),
    bankAccountNo: first(v.bank_account_no, v.accountNumber),
    vendorIfscCode: first(v.ifsc_code, v.ifscCode),
    ifscCode: first(v.ifsc_code, v.ifscCode),
    vendorBankBranch: first(v.bank_branch, v.branch),
    bankBranch: first(v.bank_branch, v.branch),
    amount,
    currency: first(po.currency, po.totals?.currency, "INR"),
    status: first(po.status, po.poStatus),
    poType: po.po_type || po.poType || null,
    poDate: first(po.po_date, po.order_date, po.poDate, po.created_at),
    expectedDeliveryDate: first(po.expected_delivery_date, po.expectedDeliveryDate),
    createdAt: po.created_at,
    paymentTerms: first(po.payment_terms, po.paymentTerms),
    billingAddress: po.billing_address || v.billing_address || null,
    deliveryAddress: po.delivery_address || v.delivery_address || null,
    items,
    taxSummary: normalizeTaxSummary(po.tax_summary || po.totals || {}, items, amount),
    existingInvoices: po.invoices || [],
    grns: safeArray(po.grns).map(mapGoodsReceiptNoteForOcr),
    goodsReceiptNotes: safeArray(po.goodsReceiptNotes || po.grns).map(mapGoodsReceiptNoteForOcr),
    deliveryChallans: safeArray(po.deliveryChallans || po.delivery_challans).map(mapDeliveryChallanForOcr),
  };
};

const mapApprovedVendorForInvoice = (vendor) => {
  const gstVal = vendor.gst_number || vendor.tax_id || vendor.gstNumber || vendor.vendorGst || null;
  const fullAddr = [
    vendor.address_line1 || vendor.addressLine1 || vendor.address,
    vendor.address_line2 || vendor.addressLine2,
    vendor.city,
    vendor.district,
    vendor.state,
    vendor.zip_code || vendor.postalCode,
    vendor.country,
  ].filter(Boolean).join(", ") || vendor.address || vendor.vendorAddress || null;

  return {
    id: vendor.id,
    vendorCode: vendor.vendor_code || vendor.vendorCode || null,
    vendorName: vendor.name || vendor.vendorName || vendor.companyName || null,
    name: vendor.name || vendor.vendorName || vendor.companyName || null,
    companyName: vendor.companyName || vendor.name || vendor.vendorName || null,
    vendorCategory: vendor.category || vendor.vendorCategory || null,
    vendorType: vendor.vendor_type || vendor.vendorType || null,
    gstin: gstVal,
    gstNumber: gstVal,
    vendorGst: gstVal,
    pan: vendor.pan_number || vendor.panNumber || vendor.pan || vendor.vendorPan || null,
    panNumber: vendor.pan_number || vendor.panNumber || vendor.pan || vendor.vendorPan || null,
    cin: vendor.cin || null,
    msmeNumber: vendor.msme_number || vendor.msmeNumber || null,
    taxType: vendor.tax_type || vendor.taxType || null,
    contactPerson: vendor.contact_person || vendor.contactPerson || null,
    designation: vendor.contact_designation || vendor.designation || null,
    email: vendor.email || vendor.vendorEmail || null,
    phone: vendor.phone || vendor.vendorPhone || null,
    alternatePhone: vendor.alternate_phone || vendor.alternatePhone || null,
    country: vendor.country || null,
    state: vendor.state || null,
    district: vendor.district || null,
    city: vendor.city || null,
    postalCode: vendor.zip_code || vendor.postalCode || null,
    addressLine1: vendor.address_line1 || vendor.addressLine1 || vendor.address || null,
    addressLine2: vendor.address_line2 || vendor.addressLine2 || null,
    address: fullAddr,
    vendorAddress: fullAddr,
    bankName: vendor.bank_name || vendor.bankName || vendor.vendorBankName || null,
    accountHolder: vendor.account_holder || vendor.accountHolder || vendor.accountName || vendor.vendorAccountHolder || null,
    accountName: vendor.account_holder || vendor.accountHolder || vendor.accountName || vendor.vendorAccountHolder || null,
    accountNumber: vendor.bank_account_no || vendor.accountNumber || vendor.vendorBankAccountNo || null,
    ifscCode: vendor.ifsc_code || vendor.ifscCode || vendor.vendorIfscCode || null,
    branch: vendor.bank_branch || vendor.branch || vendor.vendorBankBranch || null,
    currency: vendor.currency || null,
    paymentTerms: vendor.payment_terms || vendor.paymentTerms || null,
    vendorStatus: vendor.vendorStatus || vendor.status || vendor.rawStatus || "ACTIVE",
    status: vendor.status || vendor.vendorStatus || vendor.rawStatus || "ACTIVE",
    approvalStatus: vendor.approval_status || vendor.approvalStatus || "APPROVED",
  };
};

const mapGoodsReceiptNoteForOcr = (grn) => grn ? {
  ...grn,
  id: grn.id,
  grnNumber: first(grn.grnNumber, grn.grn_number),
  grnDate: first(grn.grnDate, grn.receipt_date, grn.delivery_date, grn.created_at),
  grnStatus: first(grn.grnStatus, grn.status),
  poNumber: first(grn.poNumber, grn.purchase_order?.po_number),
  vendorName: first(grn.vendorName, grn.vendor?.name, grn.vendor_name),
  vendorCode: first(grn.vendorCode, grn.vendor?.vendor_code, grn.vendor_code),
  receivedBy: first(grn.receivedBy, grn.received_by, grn.receiver_name),
  deliveryChallanId: first(grn.deliveryChallanId, grn.delivery_challan_id, grn.delivery_challan?.id),
  deliveryChallanNumber: first(grn.deliveryChallanNumber, grn.delivery_challan_no, grn.delivery_challan?.delivery_challan_number),
  totalReceivedQuantity: num(first(grn.totalReceivedQuantity, safeArray(grn.items).reduce((total, item) => total + num(first(item.received_quantity, item.receivedQuantity)), 0))),
  items: mapReceiptItems(grn.items || grn.line_items, "receivedQuantity"),
} : null;

const mapDeliveryChallanForOcr = (challan) => challan ? {
  ...challan,
  id: challan.id,
  deliveryChallanNumber: first(challan.deliveryChallanNumber, challan.delivery_challan_number),
  deliveryChallanDate: first(challan.deliveryChallanDate, challan.delivery_date, challan.created_at),
  status: first(challan.status, challan.deliveryStatus, challan.delivery_status),
  poNumber: first(challan.poNumber, challan.purchase_order?.po_number),
  vendorName: first(challan.vendorName, challan.vendor?.name, challan.vendor_name),
  vendorCode: first(challan.vendorCode, challan.vendor?.vendor_code, challan.vendor_code),
  deliveryAddress: first(challan.deliveryAddress, challan.delivery_address, challan.purchase_order?.delivery_address),
  items: mapReceiptItems(challan.items || challan.line_items, "deliveredQuantity"),
} : null;

export const getInvoices = async (params = {}) => {
  const cleanParams = typeof params === "object" && params !== null ? params : {};
  const res = await api.get("/v1/invoices", { params: cleanParams });
  const rawInvoices = res.data.invoices || (Array.isArray(res.data) ? res.data : []);
  const mapped = rawInvoices.map(mapInvoice);

  const result = [...mapped];
  result.invoices = mapped;
  result.total = res.data.total ?? mapped.length;
  result.page = res.data.page ?? 1;
  result.limit = res.data.limit ?? 10;
  result.totalPages = res.data.totalPages ?? 1;

  return result;
};


export const getInvoiceById = async (id) => {
  const res = await api.get(`/v1/invoices/${id}`);
  if (import.meta.env.DEV) {
    console.log("[INVOICE DETAIL] API response:", res.data);
    console.log("[INVOICE UI] API response", res.data);
  }
  const rawInvoice = res.data.data || res.data.invoice || res.data;
  const invoice = mapInvoice(rawInvoice);
  if (import.meta.env.DEV) {
    console.log("[INVOICE DETAIL] Invoice data:", invoice);
    console.log("[INVOICE DETAIL] PO data:", invoice.purchaseOrder);
    console.log("[INVOICE DETAIL] Vendor data:", invoice.vendorMaster || invoice.vendor);
    console.log("[INVOICE DETAIL] GRN data:", invoice.grn);
    console.log("[INVOICE DETAIL] Delivery Challan data:", invoice.deliveryChallan);
    console.log("[INVOICE DETAIL] Matching data:", invoice.threeWayMatch || invoice.matching);
    console.log("[INVOICE UI] Invoice details", invoice);
    console.log("[INVOICE UI] PO details", invoice.purchaseOrder);
    console.log("[INVOICE UI] Vendor details", invoice.vendorMaster || invoice.vendor);
    console.log("[INVOICE UI] GRN details", invoice.grn);
    console.log("[INVOICE UI] Delivery Challan details", invoice.deliveryChallan);
    console.log("[INVOICE UI] Matching result", invoice.threeWayMatch || invoice.matching);
  }
  return invoice;
};

export const getApprovedPurchaseOrdersForInvoice = async (params = {}) => {
  console.debug("[invoiceService] Fetching approved POs with params:", params);
  const res = await api.get("/v1/invoices/approved-purchase-orders", { params });
  console.debug("[invoiceService] Response received from API:", res.data);
  const mapped = (res.data.purchaseOrders || []).map(mapApprovedPurchaseOrder);
  console.debug("[invoiceService] Mapped response records count:", mapped.length);
  return mapped;
};

export const getPurchaseOrderForInvoice = async (purchaseOrderId) => {
  const res = await api.get(`/v1/purchase-orders/${purchaseOrderId}`);
  return mapApprovedPurchaseOrder(res.data.data);
};

export const getApprovedVendorsForInvoice = async (params = {}) => {
  const cleanParams = Object.fromEntries(
    Object.entries({ status: "approved", limit: 25, ...params })
      .filter(([, value]) => value !== undefined && value !== null && value !== ""),
  );
  const res = await api.get("/v1/vendors", { params: cleanParams });
  return (res.data.vendors || []).map(mapApprovedVendorForInvoice);
};

export const createInvoice = async ({
  purchaseOrderId,
  vendorId,
  grnId,
  deliveryChallanId,
  invoiceNumber,
  invoiceDate,
  dueDate,
  amount,
  currency,
  remarks,
  invoiceFile,
  invoiceCreationMethod = "MANUAL",
  invoiceSource,
  invoiceCategory,
  lineItems,
  taxSummary,
  ocrStatus,
  ocrConfidence,
  ocrExtractedData,
  ocrDocumentId,
  ocrExtractionId,
  ocrDraftId,
  supportingDocuments = [],
}) => {
  debugInvoiceService("[InvoiceService] API called: create invoice", {
    purchaseOrderId,
    invoiceDate,
    dueDate,
    invoiceCreationMethod,
    hasAttachment: Boolean(invoiceFile),
    hasRemarks: Boolean(remarks?.trim()),
  });
  const formData = new FormData();
  formData.append("purchaseOrderId", purchaseOrderId);
  if (vendorId) formData.append("vendorId", vendorId);
  if (grnId) formData.append("grnId", grnId);
  if (deliveryChallanId) formData.append("deliveryChallanId", deliveryChallanId);
  if (invoiceNumber) formData.append("invoiceNumber", invoiceNumber);
  formData.append("invoiceCreationMethod", invoiceCreationMethod);
  formData.append("invoiceSource", invoiceSource || (invoiceCreationMethod === "OCR" ? "UPLOADED_PDF" : "MANUAL_ENTRY"));
  formData.append("invoiceCategory", invoiceCategory);
  if (amount !== undefined && amount !== null) formData.append("amount", String(amount));
  if (currency) formData.append("currency", currency);
  if (invoiceDate) formData.append("invoiceDate", invoiceDate);
  if (dueDate) formData.append("dueDate", dueDate);
  if (Array.isArray(lineItems)) formData.append("lineItems", JSON.stringify(lineItems));
  if (taxSummary) formData.append("taxSummary", JSON.stringify(taxSummary));
  if (ocrStatus) formData.append("ocrStatus", ocrStatus);
  if (ocrConfidence !== undefined && ocrConfidence !== null) formData.append("ocrConfidence", String(ocrConfidence));
  if (ocrExtractedData) formData.append("ocrExtractedData", JSON.stringify(ocrExtractedData));
  if (ocrDocumentId) formData.append("ocrDocumentId", ocrDocumentId);
  if (ocrExtractionId) formData.append("ocrExtractionId", ocrExtractionId);
  if (ocrDraftId) formData.append("ocrDraftId", ocrDraftId);
  if (remarks) formData.append("remarks", remarks);
  if (invoiceFile) formData.append("invoiceFile", invoiceFile);
  supportingDocuments.forEach((file) => formData.append("supportingDocuments", file));

  const res = await api.post("/v1/invoices", formData, {
    headers: { "Content-Type": "multipart/form-data" },
  });
  return mapInvoice(res.data.data);
};

export const updateInvoice = async ({
  id,
  invoiceDate,
  dueDate,
  remarks,
  invoiceFile,
  lineItems,
  reason,
}) => {
  const formData = new FormData();
  if (invoiceDate) formData.append("invoiceDate", invoiceDate);
  if (dueDate) formData.append("dueDate", dueDate);
  if (remarks !== undefined) formData.append("remarks", remarks);
  if (Array.isArray(lineItems)) formData.append("lineItems", JSON.stringify(lineItems));
  if (reason) formData.append("reason", reason);
  if (invoiceFile) formData.append("invoiceFile", invoiceFile);

  const res = await api.put(`/v1/invoices/${id}`, formData, {
    headers: { "Content-Type": "multipart/form-data" },
  });
  return mapInvoice(res.data.data);
};

export const approveInvoice = async (id) => {
  const res = await api.patch(`/v1/invoices/${id}/approve`, {});
  return res.data;
};

export const approveInvoiceWithRemarks = async (id, remarks = "") => {
  const res = await api.patch(`/v1/invoices/${id}/approve`, { remarks });
  return res.data;
};

export const rejectInvoice = async (id, reason = "Rejected by approver") => {
  const res = await api.patch(`/v1/invoices/${id}/reject`, { rejectionReason: reason });
  return res.data;
};

export const cancelInvoice = async (id, reason = "") => {
  const res = await api.patch(`/v1/invoices/${id}/cancel`, { remarks: reason });
  return res.data;
};

export const softDeleteInvoice = async (id, reason = "Deleted from system dashboard") => {
  const res = await api.delete(`/v1/invoices/${id}`, { data: { deleteReason: reason } });
  return res.data;
};

export const restoreInvoice = async (id) => {
  const res = await api.post(`/v1/invoices/${id}/restore`, {});
  return res.data;
};

export const addRemark = async (id, comment) => {
  const res = await api.post(`/v1/invoices/${id}/remark`, { remark: comment });
  return res.data;
};

export const getFinanceHeadInvoiceApprovals = async (params = {}) => {
  const cleanParams = Object.fromEntries(
    Object.entries(params).filter(([, value]) => value !== undefined && value !== null && value !== ""),
  );
  const res = await api.get("/v1/invoices/pending/finance-head", { params: cleanParams });
  return {
    invoices: (res.data.invoices || []).map(mapInvoice),
    total: Number(res.data.total || 0),
    page: Number(res.data.page || cleanParams.page || 1),
    limit: Number(res.data.limit || cleanParams.limit || 10),
    totalPages: Number(res.data.totalPages || 1),
  };
};

export const downloadInvoicePdf = async (id, fallbackInvoiceNumber = 'Invoice') => {
  const res = await api.get(`/v1/invoices/${id}/pdf`, {
    responseType: 'blob',
  });

  const blob = new Blob([res.data], { type: 'application/pdf' });
  const url = window.URL.createObjectURL(blob);

  let filename = `${fallbackInvoiceNumber}.pdf`;
  const disposition = res.headers?.['content-disposition'];
  if (disposition && disposition.includes('filename=')) {
    const matches = /filename="?([^";]+)"?/.exec(disposition);
    if (matches && matches[1]) {
      filename = matches[1];
    }
  }

  const link = document.createElement('a');
  link.href = url;
  link.setAttribute('download', filename);
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.URL.revokeObjectURL(url);

  return true;
};


export const getCompanyInfo = async () => {
  try {
    const res = await api.get("/v1/lookups/company");
    return res.data.data;
  } catch (err) {
    console.error("Failed to fetch company info from API:", err);
    return null;
  }
};

const OCR_TERMINAL_STATUSES = new Set(["READY", "PARTIAL", "FAILED", "COMPLETED"]);
const sleep = (ms, signal) => new Promise((resolve, reject) => {
  if (signal?.aborted) {
    reject(new DOMException("OCR polling was cancelled.", "AbortError"));
    return;
  }
  const timer = window.setTimeout(resolve, ms);
  signal?.addEventListener("abort", () => {
    window.clearTimeout(timer);
    reject(new DOMException("OCR polling was cancelled.", "AbortError"));
  }, { once: true });
});

export const getOcrInvoiceStatus = async (ocrId, { signal } = {}) => {
  const res = await api.get(`/v1/invoices/ocr/${ocrId}/status`, { signal });
  return res.data.data || {};
};

export const waitForOcrInvoiceDraft = async ({ ocrId, onStatus, signal, maxAttempts = 120, intervalMs = 1500 }) => {
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const statusData = await getOcrInvoiceStatus(ocrId, { signal });
    const status = String(statusData.status || statusData.processingStatus || statusData.ocrStatus || "PROCESSING").toUpperCase();
    onStatus?.(statusData);

    if ((status === "READY" || status === "PARTIAL" || status === "COMPLETED") && statusData.draftId) {
      return getOcrInvoiceDraft(statusData.draftId);
    }
    if (status === "FAILED") {
      const error = new Error(statusData.errorMessage || "OCR processing failed. Please try again.");
      error.ocrStatus = statusData;
      throw error;
    }
    if (OCR_TERMINAL_STATUSES.has(status) && statusData.extractedData) {
      return statusData;
    }

    await sleep(intervalMs, signal);
  }

  const error = new Error("OCR processing is still running. You can stay on this page and try checking the status again shortly.");
  error.code = "OCR_POLL_TIMEOUT";
  error.ocrId = ocrId;
  throw error;
};

export const startInvoiceOcrJob = async (file, { onStatus } = {}) => {
  const formData = new FormData();
  formData.append("invoiceFile", file);

  const res = await api.post("/v1/invoices/process-ocr", formData, {
    headers: { "Content-Type": "multipart/form-data" },
    timeout: 30000,
  });
  if (import.meta.env.DEV) {
    const rawData = res.data?.data || {};
    console.debug("[OCR API SERVICE] Raw OCR response shape", {
      topLevelKeys: Object.keys(res.data || {}),
      dataKeys: Object.keys(rawData),
      hasDataExtractedData: Boolean(rawData.extractedData),
      hasDataExtraction: Boolean(rawData.extraction),
      hasDataInvoiceDraft: Boolean(rawData.invoiceDraft),
      hasDataOcrDocument: Boolean(rawData.ocrDocument),
      ocrStatus: rawData.ocrStatus,
      ocrConfidence: rawData.ocrConfidence,
      confidenceBreakdown: rawData.extractedData?.extractionSummary?.confidenceBreakdown || null,
      missingCriticalFields: rawData.extractedData?.extractionSummary?.missingCriticalFields || [],
    });
  }

  const data = res.data.data || {};
  const ocrId = data.ocrId || data.ocrDocumentId;
  if (res.status === 202) {
    onStatus?.(data);
    return {
      ...data,
      jobId: data.jobId || ocrId,
      ocrId,
      started: true,
    };
  }
  return data;
};

export const processInvoiceOcr = async (file, { onStatus } = {}) => {
  const data = await startInvoiceOcrJob(file, { onStatus });
  const ocrId = data.ocrId || data.ocrDocumentId || data.jobId;
  const status = String(data.status || data.processingStatus || data.ocrStatus || "").toUpperCase();
  if (data.started || (ocrId && ["UPLOADED", "PROCESSING", "EXTRACTING", "ENRICHING"].includes(status))) {
    onStatus?.(data);
    return waitForOcrInvoiceDraft({ ocrId, onStatus });
  }
  const extracted = data.extractedData || {};

  const draft = safeObject(data.invoiceDraft);
  const normalizedExtractedData = {
    ...extracted,
    sourceFileName: extracted.sourceFileName || file?.name || "Uploaded Document",
    ocrConfidence: Number(data.ocrConfidence ?? extracted.ocrConfidence ?? 0),
    document: safeObject(extracted.document),
    header: safeObject(extracted.header),
    vendor: safeObject(extracted.vendor),
    company: safeObject(extracted.company),
    bank: safeObject(extracted.bank),
    references: safeObject(extracted.references),
    lineItems: safeArray(extracted.lineItems),
    totals: safeObject(extracted.totals),
    terms: safeObject(extracted.terms),
    fieldConfidence: safeObject(extracted.fieldConfidence),
    fieldSources: safeObject(extracted.fieldSources),
    missingReasons: safeObject(extracted.missingReasons),
    extractionSummary: safeObject(extracted.extractionSummary),
  };
  data.rawExtractedData = normalizedExtractedData;
  data.extractedData = Object.keys(draft).length
    ? {
        ...normalizedExtractedData,
        ...draft,
        document: safeObject(draft.document?.pageCount ? draft.document : normalizedExtractedData.document),
        header: { ...normalizedExtractedData.header, ...safeObject(draft.header) },
        vendor: { ...normalizedExtractedData.vendor, ...safeObject(draft.vendor) },
        company: { ...normalizedExtractedData.company, ...safeObject(draft.company) },
        bank: { ...normalizedExtractedData.bank, ...safeObject(draft.bank) },
        references: { ...normalizedExtractedData.references, ...safeObject(draft.references) },
        lineItems: safeArray(draft.lineItems).length ? safeArray(draft.lineItems) : normalizedExtractedData.lineItems,
        totals: { ...normalizedExtractedData.totals, ...safeObject(draft.totals) },
        terms: { ...normalizedExtractedData.terms, ...safeObject(draft.terms) },
        fieldConfidence: normalizedExtractedData.fieldConfidence || {},
        fieldSources: safeObject(draft.fieldSources),
        missingReasons: safeObject(draft.missingReasons),
        extractionSummary: safeObject(data.extractionSummary || draft.extractionSummary || normalizedExtractedData.extractionSummary),
      }
    : normalizedExtractedData;
  data.matchingReadiness = safeObject(data.matchingReadiness);

  data.matchedVendor = data.matchedVendor || null;
  if (data.matchedVendor) {
    data.matchedVendor = mapApprovedVendorForInvoice(data.matchedVendor);
  }
  if (data?.matchedPurchaseOrder) {
    data.matchedPurchaseOrder = mapApprovedPurchaseOrder(data.matchedPurchaseOrder);
  }
  if (data?.purchaseOrder) {
    data.purchaseOrder = mapApprovedPurchaseOrder(data.purchaseOrder);
  }
  if (data?.vendorMaster) {
    data.vendorMaster = mapApprovedVendorForInvoice(data.vendorMaster);
  }
  if (data?.vendor) {
    data.vendor = mapApprovedVendorForInvoice(data.vendor);
  }
  data.goodsReceiptNote = mapGoodsReceiptNoteForOcr(data.goodsReceiptNote);
  data.matchedGrn = mapGoodsReceiptNoteForOcr(data.matchedGrn);
  data.deliveryChallan = mapDeliveryChallanForOcr(data.deliveryChallan);
  data.matchedDeliveryChallan = mapDeliveryChallanForOcr(data.matchedDeliveryChallan);
  if (import.meta.env.DEV) {
    console.debug("[OCR API SERVICE] Normalized OCR response shape", {
      hasExtractedData: Boolean(data.extractedData),
      headerKeys: Object.keys(data.extractedData?.header || {}),
      vendorKeys: Object.keys(data.extractedData?.vendor || {}),
      referenceKeys: Object.keys(data.extractedData?.references || {}),
      totalsKeys: Object.keys(data.extractedData?.totals || {}),
      lineItemsCount: safeArray(data.extractedData?.lineItems).length,
      hasMatchedVendor: Boolean(data.matchedVendor || data.vendorMaster || data.vendor),
      hasMatchedPurchaseOrder: Boolean(data.matchedPurchaseOrder || data.purchaseOrder),
      hasMatchedGrn: Boolean(data.matchedGrn || data.goodsReceiptNote || data.grn),
      hasMatchedDeliveryChallan: Boolean(data.matchedDeliveryChallan || data.deliveryChallan),
    });
  }

  return data;
};

export const getOcrInvoiceDraft = async (draftId) => {
  const res = await api.get(`/v1/invoices/ocr/drafts/${draftId}`);
  const data = res.data.data || {};
  const extracted = data.extractedData || {};
  const draft = safeObject(data.invoiceDraft);
  const normalizedExtractedData = {
    ...extracted,
    sourceFileName: extracted.sourceFileName || data.ocrDraft?.sourceFileName || "OCR Invoice Draft",
    ocrConfidence: Number(data.ocrConfidence ?? data.ocrDraft?.ocrConfidence ?? extracted.ocrConfidence ?? 0),
    document: safeObject(extracted.document),
    header: safeObject(extracted.header),
    vendor: safeObject(extracted.vendor),
    company: safeObject(extracted.company),
    bank: safeObject(extracted.bank),
    references: safeObject(extracted.references),
    lineItems: safeArray(extracted.lineItems),
    totals: safeObject(extracted.totals),
    terms: safeObject(extracted.terms),
    fieldConfidence: safeObject(extracted.fieldConfidence),
    fieldSources: safeObject(extracted.fieldSources),
    missingReasons: safeObject(extracted.missingReasons),
    extractionSummary: safeObject(extracted.extractionSummary),
  };
  data.rawExtractedData = normalizedExtractedData;

  data.extractedData = Object.keys(draft).length
    ? {
        ...normalizedExtractedData,
        ...draft,
        document: safeObject(draft.document?.pageCount ? draft.document : normalizedExtractedData.document),
        header: { ...normalizedExtractedData.header, ...safeObject(draft.header) },
        vendor: { ...normalizedExtractedData.vendor, ...safeObject(draft.vendor) },
        company: { ...normalizedExtractedData.company, ...safeObject(draft.company) },
        bank: { ...normalizedExtractedData.bank, ...safeObject(draft.bank) },
        references: { ...normalizedExtractedData.references, ...safeObject(draft.references) },
        lineItems: safeArray(draft.lineItems).length ? safeArray(draft.lineItems) : normalizedExtractedData.lineItems,
        totals: { ...normalizedExtractedData.totals, ...safeObject(draft.totals) },
        terms: { ...normalizedExtractedData.terms, ...safeObject(draft.terms) },
        fieldConfidence: normalizedExtractedData.fieldConfidence || {},
        fieldSources: safeObject(draft.fieldSources),
        missingReasons: safeObject(draft.missingReasons),
        extractionSummary: safeObject(data.extractionSummary || draft.extractionSummary || normalizedExtractedData.extractionSummary),
      }
    : normalizedExtractedData;

  data.matchingReadiness = safeObject(data.matchingReadiness);
  if (data.matchedVendor) data.matchedVendor = mapApprovedVendorForInvoice(data.matchedVendor);
  if (data.matchedPurchaseOrder) data.matchedPurchaseOrder = mapApprovedPurchaseOrder(data.matchedPurchaseOrder);
  if (data.purchaseOrder) data.purchaseOrder = mapApprovedPurchaseOrder(data.purchaseOrder);
  if (data.vendorMaster) data.vendorMaster = mapApprovedVendorForInvoice(data.vendorMaster);
  if (data.vendor) data.vendor = mapApprovedVendorForInvoice(data.vendor);
  data.goodsReceiptNote = mapGoodsReceiptNoteForOcr(data.goodsReceiptNote);
  data.matchedGrn = mapGoodsReceiptNoteForOcr(data.matchedGrn);
  data.deliveryChallan = mapDeliveryChallanForOcr(data.deliveryChallan);
  data.matchedDeliveryChallan = mapDeliveryChallanForOcr(data.matchedDeliveryChallan);
  return data;
};




