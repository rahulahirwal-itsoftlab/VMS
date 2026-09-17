import api from "../api/axios";
import { formatRoleLabel } from "../utils/displayFormatters";

const mapApprovalLog = (log) => ({
  id: log.id,
  invoiceNo: log.entity_type === "invoice" ? log.entity_id : `${log.entity_type || "entity"}:${log.entity_id || "-"}`,
  vendor: log.performed_by?.email || "-",
  amount: 0,
  priority: "Normal",
  status: log.to_status || log.action || "-",
  assignedTo: log.performed_by?.role ? formatRoleLabel(log.performed_by.role) : "-",
  entityType: log.entity_type,
  entityId: log.entity_id,
  action: log.action,
  fromStatus: log.from_status,
  toStatus: log.to_status,
  performedById: log.performed_by_id,
  remarks: log.remarks,
  createdAt: log.created_at,
  performedBy: log.performed_by
    ? `${log.performed_by.first_name || ""} ${log.performed_by.last_name || ""}`.trim() || log.performed_by.email
    : "-",
});

export const getApprovals = async (params = {}) => {
  const res = await api.get("/v1/approvals", { params });
  const rows = res.data?.logs || res.data?.data || [];
  return rows.map(mapApprovalLog);
};

export const getApprovalById = async (entityType, entityId) => {
  const res = await api.get(`/v1/approvals/${entityType}/${entityId}`);
  return (res.data?.data || []).map(mapApprovalLog);
};

export const approveInvoice = async (id, remarks = "") => {
  const res = await api.patch(`/v1/invoices/${id}/approve`, { remarks });
  return res.data?.data;
};

export const rejectInvoice = async (id, rejectionReason = "") => {
  const res = await api.patch(`/v1/invoices/${id}/reject`, { rejectionReason });
  return res.data?.data;
};

export const holdInvoice = async (id, remarks = "") => {
  const res = await api.post(`/v1/invoices/${id}/remark`, { remark: remarks || "Held for review" });
  return res.data?.data;
};

// ─── Payment Approval Section ──────────────────────────────────────────────────

export const getPaymentApprovals = async (params = {}) => {
  const res = await api.get("/v1/payment-approvals", { params });
  return res.data?.approvals || [];
};

export const getPaymentApprovalById = async (id) => {
  const res = await api.get(`/v1/payment-approvals/${id}`);
  return res.data?.data;
};

export const approvePaymentApproval = async (id, remarks = "") => {
  const res = await api.post(`/v1/payment-approvals/${id}/approve`, { remarks });
  return res.data?.data;
};

export const rejectPaymentApproval = async (id, rejectionReason = "") => {
  const res = await api.post(`/v1/payment-approvals/${id}/reject`, { rejectionReason });
  return res.data?.data;
};

export const getPaymentApprovalHistory = async (id) => {
  const res = await api.get(`/v1/payment-approvals/${id}/history`);
  return res.data?.data || [];
};

