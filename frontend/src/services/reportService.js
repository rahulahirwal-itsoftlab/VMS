import api from "../api/axios";

// ─── Vendor Reports ───────────────────────────────────────────────────────────

export const getVendorReport = async (params = {}) => {
  const res = await api.get("/v1/reports/vendors", { params });
  return res.data;
};

export const getVendorReportSummary = async (params = {}) => {
  const res = await api.get("/v1/reports/vendors/summary", { params });
  return res.data.data;
};

export const getVendorReportDetail = async (id) => {
  const res = await api.get(`/v1/reports/vendors/${id}`);
  return res.data.data;
};

export const exportVendorReport = async (params = {}) => {
  const format = params.format || "xlsx";
  const res = await api.get("/v1/reports/vendors/export", {
    params,
    responseType: "blob",
  });
  return { data: res.data, format };
};

// ─── Purchase Order Reports ───────────────────────────────────────────────────

export const getPOReport = async (params = {}) => {
  const res = await api.get("/v1/reports/purchase-orders", { params });
  return res.data;
};

export const getPOReportSummary = async (params = {}) => {
  const res = await api.get("/v1/reports/purchase-orders/summary", { params });
  return res.data.data;
};

export const getPOReportDetail = async (id) => {
  const res = await api.get(`/v1/reports/purchase-orders/${id}`);
  return res.data.data;
};

export const exportPOReport = async (params = {}) => {
  const format = params.format || "xlsx";
  const res = await api.get("/v1/reports/purchase-orders/export", {
    params,
    responseType: "blob",
  });
  return { data: res.data, format };
};

// ─── Invoice Reports ──────────────────────────────────────────────────────────

export const getInvoiceReport = async (params = {}) => {
  const res = await api.get("/v1/reports/invoices", { params });
  return res.data;
};

export const getInvoiceReportSummary = async (params = {}) => {
  const res = await api.get("/v1/reports/invoices/summary", { params });
  return res.data.data;
};

export const getInvoiceReportDetail = async (id) => {
  const res = await api.get(`/v1/reports/invoices/${id}`);
  return res.data.data;
};

export const exportInvoiceReport = async (params = {}) => {
  const format = params.format || "xlsx";
  const res = await api.get("/v1/reports/invoices/export", {
    params,
    responseType: "blob",
  });
  return { data: res.data, format };
};

// ─── Payment Reports ──────────────────────────────────────────────────────────

export const getPaymentReport = async (params = {}) => {
  const res = await api.get("/v1/reports/payments", { params });
  return res.data;
};

export const getPaymentReportSummary = async (params = {}) => {
  const res = await api.get("/v1/reports/payments/summary", { params });
  return res.data.data;
};

export const getPaymentReportDetail = async (id) => {
  const res = await api.get(`/v1/reports/payments/${id}`);
  return res.data.data;
};

export const exportPaymentReport = async (params = {}) => {
  const format = params.format || "xlsx";
  const res = await api.get("/v1/reports/payments/export", {
    params,
    responseType: "blob",
  });
  return { data: res.data, format };
};

// ─── Shared: trigger browser file download from blob ─────────────────────────

export const triggerBlobDownload = (blob, filename) => {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
};

/**
 * Build a safe export filename.
 * e.g. vendor-report-2025-01-01-to-2025-12-31.xlsx
 */
export const buildExportFilename = (prefix, params, format = "xlsx") => {
  const start = (params.startDate || "all").slice(0, 10);
  const end   = (params.endDate   || "all").slice(0, 10);
  return `${prefix}-${start}-to-${end}.${format}`;
};
