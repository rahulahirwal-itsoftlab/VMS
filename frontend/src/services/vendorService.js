import api from "../api/axios";
import { formatRoleLabel } from "../utils/displayFormatters";

export const mapVendorDocument = (document) => ({
  id: document.id,
  vendorId: document.vendor_id,
  documentName: document.document_name,
  originalFileName: document.original_file_name,
  fileUrl: document.file_url,
  documentType: document.document_type,
  mimeType: document.mime_type,
  fileSize: document.file_size,
  status: document.status,
  uploadedAt: document.uploaded_at,
  uploadedBy: document.uploaded_by
    ? `${document.uploaded_by.first_name || ""} ${document.uploaded_by.last_name || ""}`.trim() || document.uploaded_by.email
    : "-",
});

const normalizeVendorStatus = (vendor) => {
  const status = String(vendor.status || "").toUpperCase();
  const approvalStatus = String(vendor.approval_status || "").toUpperCase();

  if (status === "ACTIVE" && approvalStatus === "APPROVED") return "active";
  if (status === "INACTIVE" && approvalStatus === "REJECTED") return "rejected";
  if (status === "BLOCKED") return "blocked";
  if (status === "PENDING") return "pending";
  return String(vendor.status || "pending").toLowerCase();
};

const mapVendor = (vendor) => {
  const gstVal = vendor.gst_number || vendor.tax_id || null;
  const fullAddr = [vendor.address_line1 || vendor.address, vendor.address_line2, vendor.city, vendor.district, vendor.state, vendor.zip_code, vendor.country].filter(Boolean).join(", ") || vendor.address || null;

  return {
    id: vendor.id,
    vendorCode: vendor.vendor_code,
    name: vendor.name,
    vendorName: vendor.name,
    companyName: vendor.name,
    email: vendor.email || null,
    vendorEmail: vendor.email || null,
    phone: vendor.phone || null,
    vendorPhone: vendor.phone || null,
    alternatePhone: vendor.alternate_phone || null,
    contactPerson: vendor.contact_person || null,
    vendorContactPerson: vendor.contact_person || null,
    contactDesignation: vendor.contact_designation || null,
    category: vendor.category || null,
    vendorCategory: vendor.category || null,
    vendorType: vendor.vendor_type || null,
    status: normalizeVendorStatus(vendor),
    rawStatus: vendor.status,
    approvalStatus: vendor.approval_status,
    isActive: vendor.is_active,
    address: fullAddr,
    vendorAddress: fullAddr,
    addressLine1: vendor.address_line1 || vendor.address || null,
    addressLine2: vendor.address_line2 || null,
    city: vendor.city || null,
    district: vendor.district || null,
    state: vendor.state || null,
    vendorState: vendor.state || null,
    country: vendor.country || null,
    postalCode: vendor.zip_code || null,
    gst: gstVal, // gst: vendor.gst_number || vendor.tax_id
    gstNumber: gstVal,
    vendorGst: gstVal,
    taxId: vendor.tax_id || null,
    pan: vendor.pan_number || null,
    vendorPan: vendor.pan_number || null,
    cin: vendor.cin || null,
    msmeNumber: vendor.msme_number || null,
    taxType: vendor.tax_type || null,
    vendorTaxType: vendor.tax_type || null,
    bankName: vendor.bank_name || null,
    vendorBankName: vendor.bank_name || null,
    accountHolder: vendor.account_holder || null,
    vendorAccountHolder: vendor.account_holder || null,
    bankAccountNo: vendor.bank_account_no || null,
    vendorBankAccountNo: vendor.bank_account_no || null,
    maskedBankAccountNo: vendor.bank_account_no
      ? `**** ${String(vendor.bank_account_no).slice(-4)}`
      : "",
    ifscCode: vendor.ifsc_code || null,
    vendorIfscCode: vendor.ifsc_code || null,
    bankBranch: vendor.bank_branch || null,
    vendorBankBranch: vendor.bank_branch || null,
    paymentTerms: vendor.payment_terms || null,
    approvedAt: vendor.approved_at,
    blockedAt: vendor.blocked_at,
    rejectedAt: vendor.rejected_at,
    createdAt: vendor.created_at,
    createdBy: vendor.created_by
      ? `${vendor.created_by.first_name} ${vendor.created_by.last_name} (${formatRoleLabel(vendor.created_by.role)})`
      : "-",
    approvedBy: vendor.approved_by
      ? `${vendor.approved_by.first_name} ${vendor.approved_by.last_name} (${formatRoleLabel(vendor.approved_by.role)})`
      : "-",
    updatedAt: vendor.updated_at,
    deletedAt: vendor.deleted_at,
    documents: (vendor.documents || []).map(mapVendorDocument),
    approvalReadiness: vendor.approvalReadiness || {
      ready: false,
      missing: [],
      missingDocuments: [],
      invalid: [],
      reasons: [],
      documents: { supported: false },
      bankVerification: { supported: false },
    },
  };
};

export const getVendors = async (params = {}) => {
  const query = Object.fromEntries(
    Object.entries(params).filter(([, value]) => value !== "" && value !== undefined && value !== null)
  );
  const res = await api.get("/v1/vendors", { params: query });
  const vendors = res.data?.vendors || [];

  return {
    vendors: vendors.map(mapVendor),
    total: res.data?.total || 0,
    page: res.data?.page || 1,
    limit: res.data?.limit || 10,
    totalPages: res.data?.totalPages || 1,
    summary: res.data?.summary || { pending: 0, approved: 0, rejected: 0, onHold: 0 },
  };
};

export const getVendorById = async (id) => {
  const res = await api.get(`/v1/vendors/${id}`);
  return mapVendor(res.data.data);
};

export const getVendor = async (id) => {
  const res = await api.get(`/v1/vendors/${id}`);
  return mapVendor(res.data.data);
};

export const createVendor = async (formData) => {
  const payload = {
    name: formData.companyName,
    email: formData.email,
    phone: formData.phone,
    address: formData.address,
    addressLine1: formData.addressLine1 || formData.address,
    addressLine2: formData.addressLine2,
    city: formData.city,
    district: formData.district,
    state: formData.state,
    country: formData.country,
    zipCode: formData.postalCode,
    taxId: formData.gst,
    gstNumber: formData.gst,
    panNumber: formData.pan,
    cin: formData.cin,
    msmeNumber: formData.msmeNumber,
    taxType: formData.taxType,
    category: formData.vendorCategory,
    vendorType: formData.vendorType,
    contactPerson: formData.contactPerson,
    contactDesignation: formData.designation || formData.contactDesignation,
    alternatePhone: formData.alternatePhone,
    bankName: formData.bankName,
    accountHolder: formData.accountHolder,
    bankAccountNo: formData.accountNumber,
    ifscCode: formData.ifscCode,
    bankBranch: formData.bankBranch,
    paymentTerms: formData.paymentTerms,
  };

  const res = await api.post("/v1/vendors", payload);
  return mapVendor(res.data.data);
};

export const updateVendor = async (id, formData) => {
  const payload = {
    name: formData.companyName,
    email: formData.email,
    phone: formData.phone,
    address: formData.address,
    addressLine1: formData.addressLine1 || formData.address,
    addressLine2: formData.addressLine2,
    city: formData.city,
    district: formData.district,
    state: formData.state,
    country: formData.country,
    zipCode: formData.postalCode,
    taxId: formData.gst,
    gstNumber: formData.gst,
    panNumber: formData.pan,
    cin: formData.cin,
    msmeNumber: formData.msmeNumber,
    taxType: formData.taxType,
    category: formData.vendorCategory,
    vendorType: formData.vendorType,
    contactPerson: formData.contactPerson,
    contactDesignation: formData.designation || formData.contactDesignation,
    alternatePhone: formData.alternatePhone,
    bankName: formData.bankName,
    accountHolder: formData.accountHolder,
    bankAccountNo: formData.accountNumber,
    ifscCode: formData.ifscCode,
    bankBranch: formData.bankBranch,
    paymentTerms: formData.paymentTerms,
    status: formData.status,
  };

  const res = await api.put(`/v1/vendors/${id}`, payload);
  return mapVendor(res.data.data);
};

const buildActionPayload = (payload = {}) => {
  if (typeof payload === "string") {
    return { remarks: payload };
  }

  return Object.fromEntries(
    Object.entries(payload).filter(([, value]) => value !== "" && value !== undefined && value !== null)
  );
};

export const approveVendor = async (id, payload = {}) => {
  const res = await api.patch(`/v1/vendors/${id}/approve`, buildActionPayload(payload));
  return res.data.data;
};

export const rejectVendor = async (id, payload = {}) => {
  const res = await api.patch(`/v1/vendors/${id}/reject`, buildActionPayload(payload));
  return res.data.data;
};

export const blockVendor = async (id, payload = {}) => {
  const res = await api.patch(`/v1/vendors/${id}/block`, { ...buildActionPayload(payload), action: "block" });
  return res.data.data;
};

export const holdVendor = async (id, payload = {}) => {
  const body = typeof payload === "string" ? { reason: payload } : payload;
  const res = await api.patch(`/v1/vendors/${id}/hold`, { ...body, action: "hold" });
  return res.data.data;
};

export const unblockVendor = async (id, remarks = "") => {
  const res = await api.patch(`/v1/vendors/${id}/unblock`, { remarks });
  return res.data.data;
};

export const returnVendorToPending = async (id, payload = {}) => {
  const res = await api.patch(`/v1/vendors/${id}/pending`, buildActionPayload(payload));
  return res.data.data;
};

export const getVendorReviewHistory = async (id) => {
  const res = await api.get(`/v1/vendors/${id}/history`);
  return res.data.history || [];
};

export const getVendorDocuments = async (vendorId) => {
  const res = await api.get(`/v1/vendors/${vendorId}/documents`);
  return (res.data.documents || []).map(mapVendorDocument);
};

const buildDocumentFormData = ({ file, documentType, documentName }) => {
  const data = new FormData();
  data.append("file", file);
  data.append("documentType", documentType);
  if (documentName) data.append("documentName", documentName);
  return data;
};

export const uploadVendorDocument = async (vendorId, payload, onUploadProgress) => {
  const res = await api.post(`/v1/vendors/${vendorId}/documents`, buildDocumentFormData(payload), {
    headers: { "Content-Type": "multipart/form-data" },
    onUploadProgress,
  });
  return mapVendorDocument(res.data.data);
};

export const replaceVendorDocument = async (vendorId, documentId, payload, onUploadProgress) => {
  const res = await api.put(`/v1/vendors/${vendorId}/documents/${documentId}`, buildDocumentFormData(payload), {
    headers: { "Content-Type": "multipart/form-data" },
    onUploadProgress,
  });
  return mapVendorDocument(res.data.data);
};

export const deleteVendorDocument = async (vendorId, documentId) => {
  const res = await api.delete(`/v1/vendors/${vendorId}/documents/${documentId}`);
  return res.data;
};

export const downloadVendorDocument = async (vendorId, document) => {
  const res = await api.get(`/v1/vendors/${vendorId}/documents/${document.id}/download`, {
    responseType: "blob",
  });
  const url = window.URL.createObjectURL(new Blob([res.data], { type: document.mimeType || "application/octet-stream" }));
  const link = window.document.createElement("a");
  link.href = url;
  link.download = document.originalFileName || document.documentName || "vendor-document";
  window.document.body.appendChild(link);
  link.click();
  link.remove();
  window.URL.revokeObjectURL(url);
};
