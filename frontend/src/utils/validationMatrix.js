const required = (value) => {
  if (Array.isArray(value)) return value.length > 0;
  return value !== undefined && value !== null && String(value).trim() !== "";
};

const positive = (value) => Number(value) > 0;
const nonNegative = (value) => Number(value) >= 0;
const email = (value) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || "").trim());
const gst = (value) => /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/.test(String(value || "").trim().toUpperCase());
const pan = (value) => !required(value) || /^[A-Z]{5}[0-9]{4}[A-Z]$/.test(String(value || "").trim().toUpperCase());
const phone = (value) => /^\d{10}$/.test(String(value || "").trim());
const postalCode = (value) => /^\d{6}$/.test(String(value || "").trim());
const accountNumber = (value) => /^\d{9,18}$/.test(String(value || "").trim());
const ifsc = (value) => !required(value) || /^[A-Z]{4}0[A-Z0-9]{6}$/.test(String(value || "").trim().toUpperCase());

const poRules = [
  { field: "vendorId", label: "Vendor", dbColumn: "purchase_orders.vendor_id", required: true, rule: required, message: "Vendor is required.", usedIn: ["PO", "Invoice", "Matching"] },
  { field: "orderDate", label: "Purchase Order Date", dbColumn: "purchase_orders.order_date", required: true, rule: required, message: "Purchase Order Date is required.", usedIn: ["PO", "Invoice"] },
  { field: "expectedDelivery", label: "Expected Delivery Date", dbColumn: "purchase_orders.expected_delivery_date", required: true, rule: required, message: "Expected Delivery Date is required.", usedIn: ["PO", "GRN"] },
  { field: "deliveryAddress", label: "Delivery Address", dbColumn: "purchase_orders.delivery_address", required: true, rule: required, message: "Delivery Address is required.", usedIn: ["PO", "Invoice"] },
  { field: "billingAddress", label: "Billing Address", dbColumn: "purchase_orders.billing_address", required: true, rule: required, message: "Billing Address is required.", usedIn: ["PO", "Invoice"] },
  { field: "terms", label: "Payment Terms", dbColumn: "purchase_orders.payment_terms", required: true, rule: required, message: "Payment Terms are required.", usedIn: ["PO", "Invoice", "Payment"] },
  { field: "paymentType", label: "Payment Type", dbColumn: "purchase_orders.payment_type", required: true, rule: required, message: "Please select a payment type.", usedIn: ["PO", "Payment"] },
  { field: "items", label: "Purchase Order Items", dbColumn: "purchase_orders.line_items", required: true, rule: (items) => Array.isArray(items) && items.length > 0 && items.every((item) => required(item.itemName) && positive(item.quantity) && (item.rate !== undefined || item.unitPrice !== undefined) && nonNegative(item.rate !== undefined ? item.rate : item.unitPrice)), message: "Every PO item requires Item Name, Quantity (>0), and Unit Price (>=0).", usedIn: ["PO", "Invoice", "Matching"] },
];

export const REQUIRED_FIELD_MATRIX = {
  vendor: [
    { field: "companyName", label: "Vendor Name", dbColumn: "vendors.name", required: true, rule: required, message: "Vendor Name is required.", usedIn: ["Vendor", "Purchase Order", "Invoice", "Three-Way Matching"] },
    { field: "vendorCategory", label: "Vendor Category", dbColumn: "vendors.category", required: true, rule: required, message: "Vendor Category is required.", usedIn: ["Vendor", "Reports"] },
    { field: "vendorType", label: "Vendor Type", dbColumn: "vendors.vendor_type", required: true, rule: required, message: "Vendor Type is required.", usedIn: ["Vendor", "Tax"] },
    { field: "gst", label: "Vendor GST Number", dbColumn: "vendors.gst_number / vendors.tax_id", required: true, rule: gst, message: "Vendor GST Number is required and must be valid.", usedIn: ["Vendor", "Purchase Order", "Invoice", "Three-Way Matching"] },
    { field: "pan", label: "Vendor PAN Number", dbColumn: "vendors.pan_number", required: true, rule: (v) => required(v) && pan(v), message: "Vendor PAN Number is required and must be valid.", usedIn: ["Vendor", "Invoice"] },
    { field: "taxType", label: "Tax Type", dbColumn: "vendors.tax_type", required: true, rule: required, message: "Tax Type is required.", usedIn: ["Vendor", "Purchase Order Tax"] },
    { field: "contactPerson", label: "Contact Person", dbColumn: "vendors.contact_person", required: true, rule: required, message: "Vendor Contact Person is required.", usedIn: ["Vendor", "Approvals", "Notifications"] },
    { field: "designation", label: "Contact Person Designation", dbColumn: "vendors.contact_designation", required: true, rule: required, message: "Contact Person Designation is required.", usedIn: ["Vendor"] },
    { field: "email", label: "Vendor Email", dbColumn: "vendors.email", required: true, rule: email, message: "Vendor Email is required and must be valid.", usedIn: ["Vendor", "Notifications"] },
    { field: "phone", label: "Vendor Phone", dbColumn: "vendors.phone", required: true, rule: phone, message: "Vendor Phone is required and must be exactly 10 digits.", usedIn: ["Vendor", "Notifications"] },
    { field: "addressLine1", label: "Address Line 1", dbColumn: "vendors.address_line1", required: true, rule: required, message: "Address Line 1 is required.", usedIn: ["Vendor", "Purchase Order", "Invoice"] },
    { field: "city", label: "City", dbColumn: "vendors.city", required: true, rule: required, message: "City is required.", usedIn: ["Vendor"] },
    { field: "state", label: "State", dbColumn: "vendors.state", required: true, rule: required, message: "State is required.", usedIn: ["Vendor", "Purchase Order Tax"] },
    { field: "country", label: "Country", dbColumn: "vendors.country", required: true, rule: required, message: "Country is required.", usedIn: ["Vendor"] },
    { field: "postalCode", label: "Postal Code", dbColumn: "vendors.zip_code", required: true, rule: postalCode, message: "Postal Code must be exactly 6 digits.", usedIn: ["Vendor"] },
    { field: "bankName", label: "Bank Name", dbColumn: "vendors.bank_name", required: true, rule: required, message: "Bank Name is required.", usedIn: ["Payment"] },
    { field: "accountHolder", label: "Account Holder", dbColumn: "vendors.account_holder", required: true, rule: required, message: "Account Holder is required.", usedIn: ["Payment"] },
    { field: "accountNumber", label: "Account Number", dbColumn: "vendors.bank_account_no", required: true, rule: accountNumber, message: "Account Number must be between 9 and 18 digits.", usedIn: ["Payment"] },
    { field: "ifscCode", label: "IFSC Code", dbColumn: "vendors.ifsc_code", required: true, rule: ifsc, message: "IFSC Code is required and must be valid.", usedIn: ["Payment"] },
    { field: "bankBranch", label: "Bank Branch", dbColumn: "vendors.bank_branch", required: true, rule: required, message: "Bank Branch is required.", usedIn: ["Payment"] },
  ],
  purchaseOrder: poRules,
  purchaseOrderCreate: poRules,
  invoice: [
    { field: "purchaseOrderId", label: "Purchase Order", dbColumn: "invoices.purchase_order_id", required: true, rule: required, message: "Purchase Order is required.", usedIn: ["Invoice", "Matching", "Payment"] },
    { field: "invoiceDate", label: "Invoice Date", dbColumn: "invoices.invoice_date", required: true, rule: required, message: "Invoice Date is required.", usedIn: ["Invoice", "Approval"] },
    { field: "dueDate", label: "Due Date", dbColumn: "invoices.due_date", required: true, rule: required, message: "Due Date is required.", usedIn: ["Invoice", "Payment"] },
    { field: "invoiceCategory", label: "Invoice Category", dbColumn: "invoices.invoice_category", required: true, rule: required, message: "Invoice Category is required.", usedIn: ["Invoice"] },
  ],
  receiptDocument: [
    { field: "purchaseOrderId", label: "Purchase Order", dbColumn: "goods_receipt_notes.purchase_order_id / delivery_challans.purchase_order_id", required: true, rule: required, message: "Purchase Order is required.", usedIn: ["GRN", "Delivery Challan", "Matching"] },
    { field: "receiverName", label: "Receiver Name", dbColumn: "goods_receipt_notes.receiver_name", required: true, rule: required, message: "Receiver Name is required.", usedIn: ["GRN"] },
    { field: "lineItems", label: "Received/Delivered Items", dbColumn: "line_items", required: true, rule: (items) => Array.isArray(items) && items.length > 0, message: "Receipt item details are required.", usedIn: ["GRN", "Delivery Challan", "Matching"] },
  ],
  payment: [
    { field: "invoiceId", label: "Invoice Number", dbColumn: "payments.invoice_id", required: true, rule: required, message: "Invoice Number is required.", usedIn: ["Payment"] },
    { field: "amount", label: "Payment Amount", dbColumn: "payments.amount", required: true, rule: positive, message: "Payment Amount must be greater than 0.", usedIn: ["Payment"] },
    { field: "paymentMethod", label: "Payment Method", dbColumn: "payments.payment_method", required: true, rule: required, message: "Payment Method is required.", usedIn: ["Payment"] },
  ],
  approvalReject: [
    { field: "remarks", label: "Remarks / Reason", dbColumn: "audit_logs.remarks", required: true, rule: required, message: "Remarks / reason is required.", usedIn: ["Approval", "Audit"] },
  ],
  paymentApprove: [
    { field: "referenceNo", label: "Transaction Reference Number / UTR", dbColumn: "payments.provider_transaction_id", required: true, rule: required, message: "Transaction reference number / UTR is required.", usedIn: ["Payment", "Audit"] },
  ],
};

export const validateRequiredFields = (moduleKey, values) => (
  (REQUIRED_FIELD_MATRIX[moduleKey] || [])
    .filter((field) => field.required && !field.rule(values?.[field.field], values))
    .map((field) => ({ field: field.field, label: field.label, message: field.message, dbColumn: field.dbColumn, usedIn: field.usedIn }))
);

export const focusValidationField = (field, refs = {}, fallback = null) => {
  const target = refs[field]?.current || fallback?.current || document.querySelector(`[name="${field}"]`);
  target?.scrollIntoView({ behavior: "smooth", block: "center" });
  if (typeof target?.focus === "function") target.focus({ preventScroll: true });
};

export const fieldErrorClass = (hasError) => (
  hasError ? "border-red-400 focus:border-red-600 focus:ring-red-100" : ""
);
