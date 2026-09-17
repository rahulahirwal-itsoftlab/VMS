import api from "../api/axios";

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

const mapMismatch = (field) => ({
  ...field,
  status: field.status || "MISMATCH",
  poValue: field.poValue ?? field.po_value,
  grnValue: field.grnValue ?? field.grn_value,
  deliveryChallanValue: field.deliveryChallanValue ?? field.delivery_challan_value,
  invoiceValue: field.invoiceValue ?? field.invoice_value,
});

const normalizeStatus = (status) => (status === "UNMATCHED" ? "MISMATCH" : status);

const toNullableNumber = (value) => {
  if (value === undefined || value === null || value === "") return null;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
};

const mapReceiptItem = (item = {}, movementKey) => {
  const movementQuantity = toNullableNumber(
    movementKey === "receivedQuantity"
      ? item.receivedQuantity ?? item.received_quantity ?? item.quantity
      : item.deliveredQuantity ?? item.delivered_quantity ?? item.quantity,
  );
  return {
    ...item,
    itemCode: item.itemCode ?? item.item_code ?? item.sku ?? null,
    itemName: item.itemName ?? item.item_name ?? item.name ?? item.description ?? "Item",
    quantity: movementQuantity,
    orderedQuantity: toNullableNumber(item.orderedQuantity ?? item.ordered_quantity),
    receivedQuantity: movementKey === "receivedQuantity"
      ? movementQuantity
      : toNullableNumber(item.receivedQuantity ?? item.received_quantity),
    deliveredQuantity: movementKey === "deliveredQuantity"
      ? movementQuantity
      : toNullableNumber(item.deliveredQuantity ?? item.delivered_quantity),
    acceptedQuantity: toNullableNumber(item.acceptedQuantity ?? item.accepted_quantity),
    rejectedQuantity: toNullableNumber(item.rejectedQuantity ?? item.rejected_quantity),
    unit: item.unit ?? item.uom ?? null,
    unitPrice: toNullableNumber(item.unitPrice ?? item.unit_price ?? item.rate),
    gstAmount: toNullableNumber(item.gstAmount ?? item.gst_amount ?? item.taxAmount ?? item.tax_amount),
    lineTotal: toNullableNumber(item.lineTotal ?? item.line_total ?? item.total),
  };
};

const mapReceiptDocument = (document, movementKey) => {
  if (!document) return document;
  const sourceItems = Array.isArray(document.items) && document.items.length
    ? document.items
    : Array.isArray(document.line_items)
      ? document.line_items
      : [];
  const items = sourceItems.map((item) => mapReceiptItem(item, movementKey));
  return {
    ...document,
    items,
    line_items: items,
  };
};

const mapGRN = (grn) => mapReceiptDocument(grn, "receivedQuantity");
const mapDeliveryChallan = (challan) => mapReceiptDocument(challan, "deliveredQuantity");

const mapMatch = (match) => {
  const status = normalizeStatus(match.status);
  const poSnapshot = match.po_snapshot || null;
  const invoiceSnapshot = match.invoice_snapshot || null;
  const summary = invoiceSnapshot?.summary || match.summary || null;
  const vendor = match.invoice?.vendor?.name || poSnapshot?.vendorName || invoiceSnapshot?.vendorName || "-";
  return {
    id: match.id,
    invoiceId: match.invoice_id,
    invoiceNumber: match.invoice?.invoice_number || invoiceSnapshot?.invoiceNumber || invoiceSnapshot?.invoice_number || "N/A",
    poNumber: match.purchase_order?.po_number || poSnapshot?.poNumber || poSnapshot?.po_number || "N/A",
    poId: match.purchase_order_id,
    grnId: match.grn_id,
    grnNumber: match.grn?.grn_number || match.grn_snapshot?.grnNumber || match.grn_snapshot?.grn_number || "N/A",
    deliveryChallanId: match.delivery_challan_id,
    deliveryChallanNumber: match.delivery_challan?.delivery_challan_number || match.delivery_challan_snapshot?.deliveryChallanNumber || "N/A",
    vendor,
    vendorCode: match.invoice?.vendor?.vendor_code || poSnapshot?.vendorCode || invoiceSnapshot?.vendorCode || "",
    amount: Number(match.invoice?.invoice_total || match.invoice?.amount || summary?.invoiceAmount || invoiceSnapshot?.grandTotal || poSnapshot?.grandTotal || 0),
    status,
    matchPercentage: Number(match.match_percentage || 0),
    matchedFieldsCount: match.matched_fields_count || 0,
    totalFieldsCount: match.total_fields_count || 0,
    unmatchedFields: parseJsonArray(match.unmatched_fields).map(mapMismatch),
    matchedFields: parseJsonArray(match.matched_fields),
    warnings: parseJsonArray(match.warnings),
    approvalRecommendation: match.approval_recommendation,
    poSnapshot,
    grnSnapshot: match.grn_snapshot,
    deliveryChallanSnapshot: match.delivery_challan_snapshot,
    invoiceSnapshot,
    summary,
    completedBy: match.completed_by
      ? `${match.completed_by.first_name || ""} ${match.completed_by.last_name || ""}`.trim()
      : "-",
    completedAt: match.completed_at,
    remarks: match.remarks,
    adminReviewStatus: match.admin_review_status,
    adminReviewedBy: match.admin_reviewed_by
      ? `${match.admin_reviewed_by.first_name || ""} ${match.admin_reviewed_by.last_name || ""}`.trim()
      : "-",
    adminReviewedAt: match.admin_reviewed_at,
    adminRemarks: match.admin_remarks,
    createdAt: match.created_at,
    updatedAt: match.updated_at,
  };
};

export const getMatches = async (params = {}) => {
  const res = await api.get("/v1/three-way-matching", { params });
  return (res.data.matches || []).map(mapMatch);
};

export const getMatchReport = async (id) => {
  const res = await api.get(`/v1/three-way-matching/${id}`);
  return mapMatch(res.data.data);
};

export const getMatchReportByInvoice = async (invoiceId) => {
  const res = await api.get(`/v1/three-way-matching/invoice/${invoiceId}`);
  // backend returns array
  const list = Array.isArray(res.data.data) ? res.data.data : [res.data.data].filter(Boolean);
  return list.map(mapMatch);
};

export const startMatching = async (invoiceId, grnId = undefined, deliveryChallanId = undefined) => {
  const res = await api.post("/v1/three-way-matching/start", { invoiceId, grnId, deliveryChallanId });
  return {
    match: mapMatch(res.data.data.match),
    comparison: res.data.data.comparison,
  };
};

export const adminApproveMatch = async (id, remarks = "") => {
  const res = await api.patch(`/v1/three-way-matching/${id}/approve`, { remarks });
  return res.data;
};

export const adminRejectMatch = async (id, remarks = "") => {
  const res = await api.patch(`/v1/three-way-matching/${id}/reject`, { remarks });
  return res.data;
};

export const returnMatchForCorrection = async (id, remarks = "") => {
  const res = await api.patch(`/v1/three-way-matching/${id}/return`, { remarks });
  return res.data;
};

export const createGRN = async (payload) => {
  const res = await api.post("/v1/three-way-matching/grn", payload);
  return mapGRN(res.data.data);
};

export const getGRNsByPO = async (poId) => {
  const res = await api.get(`/v1/three-way-matching/grn/by-po/${poId}`);
  return (res.data.data || []).map(mapGRN);
};

export const getGRNById = async (id) => {
  const res = await api.get(`/v1/three-way-matching/grn/${id}`);
  return mapGRN(res.data.data);
};

export const updateGRN = async (id, payload) => {
  const res = await api.put(`/v1/three-way-matching/grn/${id}`, payload);
  return mapGRN(res.data.data);
};

export const deleteGRN = async (id) => {
  const res = await api.delete(`/v1/three-way-matching/grn/${id}`);
  return res.data.data;
};

export const createDeliveryChallan = async (payload) => {
  const res = await api.post("/v1/three-way-matching/delivery-challan", payload);
  return mapDeliveryChallan(res.data.data);
};

export const getDeliveryChallansByPO = async (poId) => {
  const res = await api.get(`/v1/three-way-matching/delivery-challan/by-po/${poId}`);
  return (res.data.data || []).map(mapDeliveryChallan);
};

export const getDeliveryChallanById = async (id) => {
  const res = await api.get(`/v1/three-way-matching/delivery-challan/${id}`);
  return mapDeliveryChallan(res.data.data);
};

export const updateDeliveryChallan = async (id, payload) => {
  const res = await api.put(`/v1/three-way-matching/delivery-challan/${id}`, payload);
  return mapDeliveryChallan(res.data.data);
};

export const deleteDeliveryChallan = async (id) => {
  const res = await api.delete(`/v1/three-way-matching/delivery-challan/${id}`);
  return res.data.data;
};
