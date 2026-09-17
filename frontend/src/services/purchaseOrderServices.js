import api from "../api/axios";

const mapPO = (po) => {
  if (!po) return null;
  const v = po.vendor;
  const gstVal = v ? (v.gst_number || v.tax_id || null) : null;
  const fullAddr = v ? ([v.address_line1 || v.address, v.address_line2, v.city, v.district, v.state, v.zip_code, v.country].filter(Boolean).join(", ") || v.address || null) : null;

  return {
    id: po.id,
    poNumber: po.po_number || po.poNumber,
    vendor: v?.name || po.vendor || null,
    vendorName: v?.name || po.vendorName || po.vendor || null,
    vendorCode: v?.vendor_code || po.vendorCode || null,
    vendorId: v?.id || po.vendor_id || po.vendorId || null,
    vendorGst: gstVal || po.vendorGst || po.gstNumber || null,
    gstNumber: gstVal || po.gstNumber || po.vendorGst || null,
    vendorCategory: v?.category || po.vendorCategory || null,
    vendorContactPerson: v?.contact_person || po.vendorContactPerson || null,
    vendorContact: v?.contact_person || v?.phone || po.vendorContact || null,
    vendorEmail: v?.email || po.vendorEmail || null,
    vendorPhone: v?.phone || po.vendorPhone || null,
    vendorState: v?.state || po.vendorState || null,
    vendorPan: v?.pan_number || po.vendorPan || null,
    vendorTaxType: v?.tax_type || po.vendorTaxType || null,
    vendorBankName: v?.bank_name || po.vendorBankName || null,
    vendorAccountHolder: v?.account_holder || po.vendorAccountHolder || null,
    vendorBankAccountNo: v?.bank_account_no || po.vendorBankAccountNo || null,
    vendorIfscCode: v?.ifsc_code || po.vendorIfscCode || null,
    vendorBankBranch: v?.bank_branch || po.vendorBankBranch || null,
    vendorAddress: fullAddr || po.vendorAddress || null,
    amount: Number(po.amount || 0),
    currency: po.currency || "INR",
    status:
      po.status === "created"
        ? "Created"
        : po.status === "cancelled"
          ? "Cancelled"
          : po.status === "closed"
            ? "Closed"
            : po.status,
    description: po.description,
    billingAddress: po.billing_address || po.billingAddress || null,
    deliveryAddress: po.delivery_address || po.deliveryAddress || null,
    orderDate: po.order_date || po.orderDate,
    expectedDelivery: po.expected_delivery_date || po.expectedDeliveryDate || po.expectedDelivery,
    createdAt: po.created_at || po.createdAt,
    updatedAt: po.updated_at || po.updatedAt,
    paymentTerms: po.payment_terms || po.paymentTerms || null,
    items: (po.line_items || po.items || []).map((item) => ({
      lineNumber: item.lineNumber || item.line_number,
      itemCode: item.itemCode || item.item_code || null,
      itemName: item.itemName || item.item_name || "Item",
      description: item.description || null,
      unit: item.unit || null,
      quantity: Number(item.quantity || 0),
      unitPrice: Number(item.unitPrice ?? item.unit_price ?? item.rate ?? 0),
      taxableAmount: Number(item.taxableAmount ?? item.taxable_amount ?? 0),
      gstRate: Number(item.gstRate ?? item.gst_rate ?? 0),
      cgstAmount: Number(item.cgstAmount ?? item.cgst_amount ?? 0),
      sgstAmount: Number(item.sgstAmount ?? item.sgst_amount ?? 0),
      igstAmount: Number(item.igstAmount ?? item.igst_amount ?? 0),
      gstAmount: Number(item.gstAmount ?? item.gst_amount ?? 0),
      lineTotal: Number(item.lineTotal ?? item.line_total ?? 0),
    })),
    taxSummary: po.tax_summary || po.taxSummary || null,
    itemCount: (po.line_items || po.items)?.length || 0,
    poType: po.po_type || po.poType || "STANDARD",
    purchaseRequisitionNumber: po.purchase_requisition_number || po.purchaseRequisitionNumber || null,
    department: po.department || null,
    costCenter: po.cost_center || po.costCenter || null,
    requester: po.requester || null,
    buyer: po.buyer || null,
    quotationDate: po.quotation_date || po.quotationDate || null,
    // ── Payment Type & Installment Schedule ─────────────────────────────────
    paymentType: po.payment_type || po.paymentType || "ONE_TIME",
    installments: (po.installments || []).map((inst) => ({
      id: inst.id,
      installmentNumber: inst.installment_number || inst.installmentNumber,
      amount: Number(inst.amount || 0),
      dueDate: inst.due_date || inst.dueDate || null,
      status: inst.status || "PENDING",
      paidAmount: Number(inst.paid_amount || inst.paidAmount || 0),
      remainingAmount: Number(inst.remaining_amount ?? inst.remainingAmount ?? inst.amount ?? 0),
      paidDate: inst.paid_date || inst.paidDate || null,
      remarks: inst.remarks || null,
    })),
    createdBy:
      typeof po.createdBy === "string"
        ? po.createdBy
        : po.created_by
          ? `${po.created_by.first_name ?? ""} ${po.created_by.last_name ?? ""}`.trim()
          : "-",
    createdById: po.created_by_id || po.created_by?.id || po.createdById,
    createdByRole: po.created_by?.role || po.createdByRole,
    grns: (po.grns || []).map((grn) => ({
      id: grn.id,
      grnNumber: grn.grn_number || grn.grnNumber,
      receivedDate: grn.received_date || grn.receivedDate,
      status: grn.status,
      itemsCount: grn.items?.length || 0,
    })),
    deliveryChallans: (po.delivery_challans || po.deliveryChallans || []).map((dc) => ({
      id: dc.id,
      deliveryChallanNumber: dc.delivery_challan_number || dc.deliveryChallanNumber,
      deliveryDate: dc.delivery_date || dc.deliveryDate,
      status: dc.status,
      itemsCount: dc.items?.length || 0,
    })),
  };
};


export const getPurchaseOrders = async (params = {}) => {
  const res = await api.get("/v1/purchase-orders", { params });
  const rawList = res.data.purchaseOrders || [];
  const items = rawList.map(mapPO);

  items.total = Number(res.data.total ?? items.length);
  items.totalValue = Number(res.data.totalValue ?? items.reduce((sum, item) => sum + Number(item.amount || 0), 0));
  items.availableCount = Number(res.data.availableCount ?? items.filter((item) => item.status !== "Cancelled").length);
  items.page = Number(res.data.page || 1);
  items.limit = Number(res.data.limit || 10);
  items.totalPages = Number(res.data.totalPages || 1);

  return items;
};

export const getPurchaseOrderById = async (id) => {
  const res = await api.get(`/v1/purchase-orders/${id}`);

  return mapPO(res.data.data);
};

const toFiniteNumber = (value, fallback = undefined) => {
  if (value === "" || value === null || value === undefined) return fallback;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
};

const buildPurchaseOrderTaxPayload = (data) => ({
    vendorId: data.vendorId,
    otherCharges: toFiniteNumber(data.otherCharges, 0),
    items: data.items.map((item) => {
      const price = toFiniteNumber(item.rate !== undefined ? item.rate : item.unitPrice, 0);
      return {
        itemName: item.itemName || "",
        description: item.description || "",
        quantity: toFiniteNumber(item.quantity, 0),
        unitPrice: price,
        rate: price,
        ...(item.unit ? { unit: item.unit } : {}),
        ...(item.itemCode ? { itemCode: item.itemCode } : {}),
        gstRate: toFiniteNumber(item.gstRate, 0),
      };
    }),
});

export const calculatePurchaseOrderTax = async (data) => {
  const res = await api.post("/v1/purchase-orders/calculate-tax", buildPurchaseOrderTaxPayload(data));
  return res.data.data;
};

export const createPurchaseOrder = async (data) => {
  const payload = {
    ...buildPurchaseOrderTaxPayload(data),
    description: data.notes,
    billingAddress: data.billingAddress,
    deliveryAddress: data.deliveryAddress,
    orderDate: data.orderDate,
    expectedDeliveryDate: data.expectedDelivery,
    paymentTerms: data.terms,
    poType: data.poType || 'STANDARD',
    // ── Payment Type & Installment Schedule ─────────────────────────────────
    paymentType: data.paymentType || 'ONE_TIME',
    installmentDurationMonths: data.paymentType === 'INSTALLMENT'
      ? Number(data.installmentDurationMonths || data.installments?.length || 1)
      : undefined,
    installments: data.paymentType === 'INSTALLMENT' && Array.isArray(data.installments)
      ? data.installments.map((inst, idx) => ({
          installmentNumber: inst.installmentNumber || idx + 1,
          amount: Number(inst.amount),
          dueDate: inst.dueDate,
          ...(inst.remarks ? { remarks: inst.remarks } : {}),
        }))
      : undefined,
    ...(data.purchaseRequisitionNumber ? { purchaseRequisitionNumber: data.purchaseRequisitionNumber } : {}),
    ...(data.department ? { department: data.department } : {}),
    ...(data.costCenter ? { costCenter: data.costCenter } : {}),
    ...(data.requester ? { requester: data.requester } : {}),
    ...(data.buyer ? { buyer: data.buyer } : {}),
    ...(data.quotationDate ? { quotationDate: data.quotationDate } : {}),
  };

  const res = await api.post("/v1/purchase-orders", payload);

  return mapPO(res.data.data);
};

export const updatePurchaseOrder = async (id, data) => {
  const payload = {
    ...buildPurchaseOrderTaxPayload(data),
    currency: data.currency || "INR",
    description: data.notes ?? data.description,
    billingAddress: data.billingAddress,
    deliveryAddress: data.deliveryAddress,
    orderDate: data.orderDate,
    expectedDeliveryDate: data.expectedDelivery,
    paymentTerms: data.terms ?? data.paymentTerms,
    reason: data.reason,
    // ── Payment Type & Installment Schedule ─────────────────────────────────
    paymentType: data.paymentType || 'ONE_TIME',
    installmentDurationMonths: data.paymentType === 'INSTALLMENT'
      ? Number(data.installmentDurationMonths || data.installments?.length || 1)
      : undefined,
    installments: data.paymentType === 'INSTALLMENT' && Array.isArray(data.installments)
      ? data.installments.map((inst, idx) => ({
          installmentNumber: inst.installmentNumber || idx + 1,
          amount: Number(inst.amount),
          dueDate: inst.dueDate,
          ...(inst.remarks ? { remarks: inst.remarks } : {}),
        }))
      : undefined,
  };

  const res = await api.put(`/v1/purchase-orders/${id}`, payload);
  return mapPO(res.data.data);
};

export const deletePurchaseOrder = async (id, deleteReason) => {
  const res = await api.delete(`/v1/purchase-orders/${id}`, { data: { deleteReason } });
  return res.data;
};

/**
 * Downloads the PO as a real PDF binary from the backend.
 * The backend returns Content-Type: application/pdf — we must use responseType: 'blob'.
 * @param {string} id  PO UUID
 * @param {string} [filename]  Optional override for the saved filename
 * @returns {Promise<void>}
 */
export const downloadPurchaseOrderPdf = async (id, filename) => {
  const res = await api.get(`/v1/purchase-orders/${id}/download`, {
    responseType: 'blob',          // CRITICAL: tells Axios to treat the body as a binary Blob
  });

  // Derive filename from Content-Disposition header if not supplied
  if (!filename) {
    const contentDisp = res.headers?.['content-disposition'] || '';
    const match = contentDisp.match(/filename="?([^";\r\n]+)"?/i);
    filename = match ? match[1].trim() : `PurchaseOrder_${id}.pdf`;
  }

  // Create a temporary object URL and trigger the download
  const blob = new Blob([res.data], { type: 'application/pdf' });
  const url  = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href     = url;
  link.download = filename;
  link.style.display = 'none';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);

  // Revoke the object URL to free memory
  setTimeout(() => URL.revokeObjectURL(url), 5000);
};

/**
 * Opens the PO PDF in a new browser tab (useful for "Print" / "Preview" flows).
 * @param {string} id  PO UUID
 * @returns {Promise<void>}
 */
export const openPurchaseOrderPdfInNewTab = async (id) => {
  const res = await api.get(`/v1/purchase-orders/${id}/download`, {
    responseType: 'blob',
  });
  const blob = new Blob([res.data], { type: 'application/pdf' });
  const url  = URL.createObjectURL(blob);
  const win  = window.open(url, '_blank');
  if (win) win.focus();
  // The blob URL stays alive while the tab is open; revoke after a longer delay
  setTimeout(() => URL.revokeObjectURL(url), 60000);
};


