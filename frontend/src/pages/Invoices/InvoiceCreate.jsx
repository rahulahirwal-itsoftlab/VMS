import { ArrowLeft, ChevronDown, Download, Eye, FileText, Trash2, Upload } from "lucide-react";
import { Component, useEffect, useRef, useState } from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";

import {
  createInvoice,
  getApprovedPurchaseOrdersForInvoice,
  getOcrInvoiceDraft,
  getPurchaseOrderForInvoice,
  startInvoiceOcrJob,
  waitForOcrInvoiceDraft,
} from "../../services/invoiceService";

import { RequiredLabel } from "../../components/common/FormValidation";
import DateInput from "../../components/common/DateInput";
import { getErrorMessage, notify } from "../../utils/feedback";
import { fieldErrorClass } from "../../utils/validationMatrix";

class InvoiceCreateErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error("[InvoiceCreateErrorBoundary] Caught UI rendering error:", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="max-w-2xl mx-auto my-12 rounded-2xl border border-red-200 bg-red-50 p-8 text-center text-red-950 space-y-4 shadow-lg">
          <div className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-red-100 text-red-600 font-bold text-xl">
            !
          </div>
          <h2 className="text-xl font-bold text-red-900">Invoice Creation Interface Error</h2>
          <p className="text-sm text-red-700 leading-relaxed">
            {this.state.error?.message || "A rendering issue occurred. You can safely retry or navigate back to invoice history."}
          </p>
          <div className="pt-2 flex justify-center gap-3">
            <button
              type="button"
              onClick={() => this.setState({ hasError: false, error: null })}
              className="rounded-lg bg-red-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-red-700 transition shadow-sm"
            >
              Retry Form
            </button>
            <Link
              to="/invoices"
              className="rounded-lg border border-slate-300 bg-white px-5 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 transition shadow-sm"
            >
              Back to Invoices
            </Link>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

const OcrProgressStepper = ({ ocrStep, onRetry, onUploadAnother, onContinueManual }) => {
  if (!ocrStep) return null;

  const stateMessages = {
    IDLE: "Upload an invoice document to extract details.",
    UPLOADING: "Uploading document...",
    PARSING: "Extracting invoice details using OCR...",
    EXTRACTING: "Extracting invoice details using OCR...",
    MATCHING_VENDOR: "Matching vendor master details...",
    MATCHING_PO: "Matching purchase order from database...",
    COMPLETED: "Invoice details extracted successfully. Please review the information before creating the invoice.",
    PARTIAL_SUCCESS: "Some invoice details could not be detected. Please review and complete the missing fields.",
    FAILED: "Unable to process this document. Please try again or enter invoice details manually.",
    INVALID_FILE: "Unsupported file type. Please upload PDF, PNG, JPG, or JPEG.",
  };

  return (
    <div className="mt-4 rounded-xl border border-blue-200 bg-blue-50/60 p-4 text-xs space-y-3">
      <div className="flex items-center justify-between border-b border-blue-200 pb-2">
        <span className="font-bold uppercase tracking-wider text-blue-900 flex items-center gap-2">
          {stateMessages[ocrStep] || "Processing invoice document..."}
        </span>
      </div>

      <p className="text-slate-700 font-medium leading-relaxed">
        {stateMessages[ocrStep] || "Review extracted invoice metadata below."}
      </p>

      {/* Action Buttons */}
      <div className="flex flex-wrap items-center gap-2 pt-1">
        {onRetry && (ocrStep === "FAILED" || ocrStep === "INVALID_FILE") && (
          <button
            type="button"
            onClick={onRetry}
            className="rounded-lg bg-blue-600 px-3 py-1.5 font-semibold text-white hover:bg-blue-700 transition shadow-sm"
          >
            Retry OCR
          </button>
        )}
        {onUploadAnother && (
          <button
            type="button"
            onClick={onUploadAnother}
            className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 font-semibold text-slate-700 hover:bg-slate-50 transition shadow-sm"
          >
            Upload Another File
          </button>
        )}
        {onContinueManual && (
          <button
            type="button"
            onClick={onContinueManual}
            className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 font-semibold text-slate-700 hover:bg-slate-50 transition shadow-sm"
          >
            Continue Manually
          </button>
        )}
      </div>
    </div>
  );
};



const input = "h-11 w-full rounded-lg border border-slate-300 dark:border-slate-800 bg-white dark:bg-slate-950 px-3 text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 outline-none transition focus:border-blue-600 dark:focus:border-blue-500 focus:ring-2 focus:ring-blue-100 dark:focus:ring-blue-900/25";
const readOnly = "h-11 w-full rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 px-3 text-sm font-medium text-slate-700 dark:text-slate-200";
const currency = (value) => `Rs. ${Number(value || 0).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
const companyName = import.meta.env.VITE_COMPANY_NAME || "";
const companyGst = import.meta.env.VITE_COMPANY_GST || "";
const companyAddress = import.meta.env.VITE_COMPANY_ADDRESS || "";
const MAX_INVOICE_FILE_SIZE = 20 * 1024 * 1024;
const INVOICE_CATEGORIES = [
  { value: "TAX_INVOICE", label: "Tax Invoice" },
  { value: "PROFORMA_INVOICE", label: "Proforma Invoice" },
  { value: "DEBIT_NOTE", label: "Debit Note" },
  { value: "CREDIT_NOTE", label: "Credit Note" },
  { value: "COMMERCIAL_INVOICE", label: "Commercial Invoice" },
  { value: "SERVICE_INVOICE", label: "Service Invoice" },
  { value: "PURCHASE_INVOICE", label: "Purchase Invoice" },
  { value: "RECURRING_INVOICE", label: "Recurring Invoice" },
  { value: "OTHER", label: "Other" },
];
const debugInvoiceCreate = (...args) => {
  if (import.meta.env.DEV) console.debug(...args);
};
/**
 * [OCR UI] structured log - only fires in dev, never logs JWT / passwords / OTP / secrets.
 */
const ocrUI = (stage, details = {}) => {
  if (!import.meta.env.DEV) return;
  const safe = { ...details };
  if (safe.email !== undefined) safe.email = '[REDACTED]';
  if (safe.phone !== undefined) safe.phone = '[REDACTED]';
  if (safe.password !== undefined) safe.password = '[REDACTED]';
  if (safe.token !== undefined) safe.token = '[REDACTED]';
  if (safe.otp !== undefined) safe.otp = '[REDACTED]';
  console.info('[OCR UI]', stage, safe);
};
const formatDate = (value) => {
  if (!value) return "-";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "-" : date.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
};
const isSupportedInvoiceFile = (file) => ["application/pdf", "image/png", "image/jpeg", "image/tiff"].includes(file?.type);
const formatFileSize = (size) => `${(Number(size || 0) / 1024 / 1024).toFixed(2)} MB`;
const firstValue = (...values) => values.find((value) => value !== undefined && value !== null && value !== "");
const toNumber = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};
const roundCurrency = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Number(parsed.toFixed(2)) : 0;
};
const normalizeInvoiceItemForForm = (item = {}, index = 0) => {
  const quantity = toNumber(firstValue(item.quantity, item.qty));
  const unitPrice = toNumber(firstValue(item.unitPrice, item.unit_price, item.rate, item.price));
  const taxableAmount = toNumber(firstValue(item.taxableAmount, item.taxable_amount, quantity * unitPrice));
  const cgstAmount = toNumber(firstValue(item.cgst, item.cgstAmount, item.cgst_amount));
  const sgstAmount = toNumber(firstValue(item.sgst, item.sgstAmount, item.sgst_amount));
  const igstAmount = toNumber(firstValue(item.igst, item.igstAmount, item.igst_amount));
  const cgstRate = toNumber(firstValue(item.cgstRate, item.cgst_rate));
  const sgstRate = toNumber(firstValue(item.sgstRate, item.sgst_rate));
  const igstRate = toNumber(firstValue(item.igstRate, item.igst_rate));
  const gstRate = toNumber(firstValue(item.gstRate, item.gst_rate, item.taxRate, item.tax_rate, igstRate || cgstRate + sgstRate));
  const gstAmount = toNumber(firstValue(item.gstAmount, item.taxAmount, item.gst_amount, item.tax_amount, cgstAmount + sgstAmount + igstAmount));
  const lineTotal = toNumber(firstValue(item.lineTotal, item.line_total, item.total, taxableAmount + gstAmount));
  return {
    ...item,
    lineNumber: firstValue(item.lineNumber, item.line_number, index + 1),
    itemCode: firstValue(item.itemCode, item.item_code, item.code, item.sku, ""),
    itemName: firstValue(item.itemName, item.item_name, item.name, item.description, ""),
    description: firstValue(item.description, item.itemName, item.item_name, item.name, ""),
    quantity,
    unit: firstValue(item.unit, item.uom, ""),
    unitPrice,
    taxableAmount,
    cgst: cgstAmount,
    sgst: sgstAmount,
    igst: igstAmount,
    cgstRate,
    sgstRate,
    igstRate,
    gstRate,
    cgstAmount,
    sgstAmount,
    igstAmount,
    gstAmount,
    taxAmount: gstAmount,
    lineTotal,
    total: lineTotal,
  };
};
const recalculateInvoiceItem = (item = {}, changedField = null) => {
  const quantity = toNumber(item.quantity);
  const unitPrice = toNumber(item.unitPrice);
  const discount = toNumber(item.discount);
  const shouldRecalculateTaxable = ["quantity", "unitPrice", "discount"].includes(changedField);
  const taxableAmount = roundCurrency(shouldRecalculateTaxable
    ? Math.max(0, quantity * unitPrice - discount)
    : firstValue(item.taxableAmount, quantity * unitPrice - discount, 0));
  let cgstRate = toNumber(item.cgstRate);
  let sgstRate = toNumber(item.sgstRate);
  let igstRate = toNumber(item.igstRate);
  const gstRate = toNumber(firstValue(item.gstRate, igstRate || cgstRate + sgstRate));

  if (changedField === "gstRate") {
    if (igstRate > 0 || (cgstRate === 0 && sgstRate === 0)) {
      igstRate = gstRate;
      cgstRate = 0;
      sgstRate = 0;
    } else {
      cgstRate = roundCurrency(gstRate / 2);
      sgstRate = roundCurrency(gstRate / 2);
      igstRate = 0;
    }
  }
  if (changedField === "igstRate" && igstRate > 0) {
    cgstRate = 0;
    sgstRate = 0;
  }
  if ((changedField === "cgstRate" || changedField === "sgstRate") && (cgstRate > 0 || sgstRate > 0)) {
    igstRate = 0;
  }

  const hasExistingTaxAmounts = !changedField && (
    toNumber(firstValue(item.cgstAmount, item.cgst)) > 0
    || toNumber(firstValue(item.sgstAmount, item.sgst)) > 0
    || toNumber(firstValue(item.igstAmount, item.igst)) > 0
  ) && cgstRate === 0 && sgstRate === 0 && igstRate === 0;
  const amountFieldChanged = ["cgstAmount", "sgstAmount", "igstAmount"].includes(changedField) || hasExistingTaxAmounts;
  let cgstAmount = amountFieldChanged ? roundCurrency(firstValue(item.cgstAmount, item.cgst, 0)) : roundCurrency(taxableAmount * cgstRate / 100);
  let sgstAmount = amountFieldChanged ? roundCurrency(firstValue(item.sgstAmount, item.sgst, 0)) : roundCurrency(taxableAmount * sgstRate / 100);
  let igstAmount = amountFieldChanged ? roundCurrency(firstValue(item.igstAmount, item.igst, 0)) : roundCurrency(taxableAmount * igstRate / 100);
  if (changedField === "igstAmount" && igstAmount > 0) {
    cgstAmount = 0;
    sgstAmount = 0;
    cgstRate = 0;
    sgstRate = 0;
    igstRate = taxableAmount > 0 ? roundCurrency(igstAmount * 100 / taxableAmount) : 0;
  }
  if ((changedField === "cgstAmount" || changedField === "sgstAmount") && (cgstAmount > 0 || sgstAmount > 0)) {
    igstAmount = 0;
    igstRate = 0;
    cgstRate = taxableAmount > 0 ? roundCurrency(cgstAmount * 100 / taxableAmount) : 0;
    sgstRate = taxableAmount > 0 ? roundCurrency(sgstAmount * 100 / taxableAmount) : 0;
  }
  if (amountFieldChanged && !["cgstAmount", "sgstAmount", "igstAmount"].includes(changedField)) {
    if (igstAmount > 0) {
      cgstAmount = 0;
      sgstAmount = 0;
      cgstRate = 0;
      sgstRate = 0;
      igstRate = taxableAmount > 0 ? roundCurrency(igstAmount * 100 / taxableAmount) : 0;
    } else {
      cgstRate = taxableAmount > 0 ? roundCurrency(cgstAmount * 100 / taxableAmount) : 0;
      sgstRate = taxableAmount > 0 ? roundCurrency(sgstAmount * 100 / taxableAmount) : 0;
      igstRate = 0;
    }
  }
  const gstAmount = roundCurrency(cgstAmount + sgstAmount + igstAmount);
  const lineTotal = roundCurrency(taxableAmount + gstAmount);
  return {
    ...item,
    quantity,
    unitPrice,
    discount,
    taxableAmount,
    cgstRate,
    sgstRate,
    igstRate,
    gstRate: roundCurrency(igstRate || cgstRate + sgstRate || gstRate),
    cgst: cgstAmount,
    sgst: sgstAmount,
    igst: igstAmount,
    cgstAmount,
    sgstAmount,
    igstAmount,
    gstAmount,
    taxAmount: gstAmount,
    lineTotal,
    total: lineTotal,
  };
};
const recalculateInvoiceSummary = (items = [], baseSummary = {}) => {
  const subtotal = roundCurrency(items.reduce((total, item) => total + toNumber(item.taxableAmount), 0));
  const discount = roundCurrency(firstValue(baseSummary.discount, baseSummary.totalDiscount, baseSummary.total_discount, 0));
  const cgstTotal = roundCurrency(items.reduce((total, item) => total + toNumber(item.cgstAmount ?? item.cgst), 0));
  const sgstTotal = roundCurrency(items.reduce((total, item) => total + toNumber(item.sgstAmount ?? item.sgst), 0));
  const igstTotal = roundCurrency(items.reduce((total, item) => total + toNumber(item.igstAmount ?? item.igst), 0));
  const totalGst = roundCurrency(cgstTotal + sgstTotal + igstTotal);
  const otherCharges = roundCurrency(firstValue(baseSummary.otherCharges, baseSummary.other_charges, 0));
  const roundOff = roundCurrency(firstValue(baseSummary.roundOff, baseSummary.round_off, 0));
  const grandTotal = roundCurrency(subtotal - discount + totalGst + otherCharges + roundOff);
  return {
    ...baseSummary,
    subtotal,
    taxableAmount: subtotal,
    discount,
    cgstTotal,
    sgstTotal,
    igstTotal,
    totalGst,
    totalTax: totalGst,
    otherCharges,
    roundOff,
    grandTotal,
    total: grandTotal,
    invoiceTotal: grandTotal,
  };
};
const buildInvoiceDraftFromSources = ({ ocrData = null, purchaseOrder = null, preferOcr = false } = {}) => {
  const extracted = ocrData?.extractedData || {};
  const rawOcrItems = extracted.items || extracted.lineItems || [];
  const ocrItems = rawOcrItems.map((item, index) => recalculateInvoiceItem(normalizeInvoiceItemForForm(item, index)));
  const poItems = (purchaseOrder?.items || []).map((item, index) => recalculateInvoiceItem(normalizeInvoiceItemForForm(item, index)));
  const items = preferOcr && ocrItems.length ? ocrItems : poItems.length ? poItems : ocrItems;
  const sourceSummary = preferOcr && Object.keys(extracted.totals || {}).length
    ? normalizeSummaryForForm(extracted.totals, items, purchaseOrder?.amount)
    : normalizeSummaryForForm(purchaseOrder?.taxSummary || {}, items, purchaseOrder?.amount);
  return {
    items,
    summary: recalculateInvoiceSummary(items, sourceSummary),
  };
};
const normalizeSummaryForForm = (summary = {}, items = [], fallbackAmount = 0) => {
  const subtotal = toNumber(firstValue(summary.subtotal, summary.taxableAmount, summary.taxable_amount))
    || items.reduce((total, item) => total + toNumber(item.taxableAmount), 0);
  const cgstTotal = toNumber(firstValue(summary.cgst, summary.cgstTotal, summary.cgst_total));
  const sgstTotal = toNumber(firstValue(summary.sgst, summary.sgstTotal, summary.sgst_total));
  const igstTotal = toNumber(firstValue(summary.igst, summary.igstTotal, summary.igst_total));
  const totalGst = toNumber(firstValue(summary.totalTax, summary.taxTotal, summary.totalGst, summary.gstAmount, cgstTotal + sgstTotal + igstTotal));
  return {
    ...summary,
    subtotal,
    taxableAmount: toNumber(firstValue(summary.taxableAmount, summary.taxable_amount, subtotal)),
    discount: toNumber(firstValue(summary.discount, summary.totalDiscount, summary.total_discount)),
    cgstTotal,
    sgstTotal,
    igstTotal,
    totalGst,
    totalTax: totalGst,
    otherCharges: toNumber(firstValue(summary.otherCharges, summary.other_charges)),
    roundOff: toNumber(firstValue(summary.roundOff, summary.round_off)),
    grandTotal: toNumber(firstValue(summary.grandTotal, summary.grand_total, fallbackAmount)),
  };
};

const Field = ({ label, value, fallback = "Not Available" }) => {
  const hasVal = value !== undefined && value !== null && value !== "" && value !== "[object Object]" && value !== "N/A" && value !== "Not Provided";
  return (
    <div className="min-w-0 rounded-xl border border-slate-200/60 dark:border-slate-800/80 bg-white/70 dark:bg-slate-900/60 p-3 shadow-2xs transition">
      <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">{label}</p>
      <p className={`mt-1.5 min-h-5 text-sm ${hasVal ? "font-semibold text-slate-900 dark:text-slate-100 break-all sm:break-words" : "font-medium text-slate-400 dark:text-slate-500 italic font-sans"}`}>
        {hasVal ? value : fallback}
      </p>
    </div>
  );
};

const ErrorText = ({ message }) => (
  message ? <p className="mt-2 text-xs font-semibold text-red-600">{message}</p> : null
);

const collectApiErrorMessages = (error) => {
  const data = error?.response?.data;
  const messages = [];
  if (typeof data?.message === "string" && data.message.trim() && data.message !== "Validation failed") {
    messages.push(data.message.trim());
  }
  if (Array.isArray(data?.errors)) {
    messages.push(...data.errors.filter(Boolean).map(String));
  } else if (data?.errors && typeof data.errors === "object") {
    Object.values(data.errors).flat().filter(Boolean).forEach((message) => messages.push(String(message)));
  }
  const fallback = getErrorMessage(error, "Unable to create invoice.");
  if (!messages.length && fallback) messages.push(fallback);
  return [...new Set(messages)].filter(Boolean);
};

const ItemInput = ({ label, value, onChange, type = "text", step = "any" }) => (
  <label className="block">
    <span className="mb-2 block text-xs font-semibold uppercase text-slate-500">{label}</span>
    <input
      type={type}
      step={type === "number" ? step : undefined}
      value={value ?? ""}
      onChange={(event) => onChange(event.target.value)}
      className={input}
    />
  </label>
);

const InvoiceCreate = () => {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const { draftId } = useParams();
  // OCR invoice creation temporarily disabled on frontend.
  // Keep isOcrRoute strictly false to force Manual Invoice Creation.
  const isOcrRoute = false; // pathname.includes('/create/ocr') || pathname === '/invoices/ocr';
  const dropdownRef = useRef(null);
  const loadedOcrDraftRef = useRef(null);
  const validationPanelRef = useRef(null);
  const purchaseOrderRef = useRef(null);
  const invoiceNumberRef = useRef(null);
  const invoiceDateRef = useRef(null);
  const dueDateRef = useRef(null);
  const invoiceAttachmentRef = useRef(null);
  const remarksRef = useRef(null);
  const vendorRef = useRef(null);
  const itemsRef = useRef(null);
  const gstRef = useRef(null);
  const ocrPollingAbortRef = useRef(null);
  const [purchaseOrders, setPurchaseOrders] = useState([]);
  const [search, setSearch] = useState("");
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [loadingPurchaseOrders, setLoadingPurchaseOrders] = useState(false);
  const [loadingPurchaseOrderDetails, setLoadingPurchaseOrderDetails] = useState(false);
  const [selectedPurchaseOrder, setSelectedPurchaseOrder] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [validationErrors, setValidationErrors] = useState([]);
  const [creationError, setCreationError] = useState(null);
  const [ocrNotice, setOcrNotice] = useState("");
  const [ocrProcessing, setOcrProcessing] = useState(false);
  const [ocrStep, setOcrStep] = useState("IDLE");
  const [ocrJobProgress, setOcrJobProgress] = useState(0);
  const [ocrResultData, setOcrResultData] = useState(null);
  const [createdInvoiceSuccessData, setCreatedInvoiceSuccessData] = useState(null);
  const [invoiceDraftItems, setInvoiceDraftItems] = useState([]);
  const [invoiceDraftTotals, setInvoiceDraftTotals] = useState(() => recalculateInvoiceSummary([]));


  const [formData, setFormData] = useState({
    purchaseOrderId: "",
    invoiceNumber: "",
    invoiceCreationMethod: isOcrRoute ? "OCR" : "MANUAL",
    invoiceDate: new Date().toISOString().split("T")[0],
    dueDate: "",
    receiptDate: new Date().toISOString().split("T")[0],
    priority: "STANDARD",
    invoiceSource: isOcrRoute ? "UPLOADED_PDF" : "MANUAL_ENTRY",
    invoiceCategory: "TAX_INVOICE",
    currency: "INR",
    remarks: "",
    invoiceFile: null,
    supportingDocuments: [],
  });


  const [fetchError, setFetchError] = useState(null);

  useEffect(() => {
    let active = true;
    console.debug("[InvoiceCreate] search state changed", { search });
    const timer = window.setTimeout(async () => {
      setLoadingPurchaseOrders(true);
      setFetchError(null);
      try {
        console.debug("[InvoiceCreate] Triggering API request for PO list with search query", { search });
        const data = await getApprovedPurchaseOrdersForInvoice({ search, limit: 25 });
        console.debug("[InvoiceCreate] Mapped PO list received successfully", { count: data.length });
        if (active) setPurchaseOrders(data);
      } catch (error) {
        console.error("[InvoiceCreate] Error fetching PO list from API", error);
        if (active) {
          setFetchError(error);
          notify.error(getErrorMessage(error, "Unable to fetch Purchase Orders."));
        }
      } finally {
        if (active) setLoadingPurchaseOrders(false);
      }
    }, 250);

    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [search]);

  useEffect(() => {
    const onPointerDown = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setDropdownOpen(false);
      }
    };
    window.addEventListener("pointerdown", onPointerDown);
    return () => window.removeEventListener("pointerdown", onPointerDown);
  }, []);

  useEffect(() => {
    if (!isOcrRoute) return;
    ocrUI("Page mounted", { path: pathname, draftId: draftId || null });
    return () => {
      ocrPollingAbortRef.current?.abort();
      ocrPollingAbortRef.current = null;
    };
  }, [draftId, isOcrRoute, pathname]);

  const errorsByField = validationErrors.reduce((acc, error) => ({ ...acc, [error.field]: error.message }), {});
  const extractedData = ocrResultData?.extractedData || {};
  const ocrInvoice = extractedData.invoice || extractedData.header || {};
  const ocrVendor = extractedData.vendor || {};
  const ocrPayment = extractedData.payment || extractedData.bank || {};
  const taxSummary = invoiceDraftTotals;
  const authoritativeVendor = ocrResultData?.vendorMaster || ocrResultData?.vendor || selectedPurchaseOrder || {};
  const displayVendor = {
    vendorName: firstValue(authoritativeVendor.vendorName, authoritativeVendor.companyName, selectedPurchaseOrder?.vendorName, ocrVendor.vendorName),
    vendorCode: firstValue(authoritativeVendor.vendorCode, selectedPurchaseOrder?.vendorCode, ocrVendor.vendorCode),
    vendorCategory: firstValue(authoritativeVendor.vendorCategory, authoritativeVendor.category),
    vendorType: firstValue(authoritativeVendor.vendorType, authoritativeVendor.vendor_type),
    gst: firstValue(authoritativeVendor.gstNumber, authoritativeVendor.gstin, selectedPurchaseOrder?.vendorGst, selectedPurchaseOrder?.gstNumber, ocrVendor.gstNumber, ocrVendor.gstin),
    pan: firstValue(authoritativeVendor.panNumber, authoritativeVendor.pan, selectedPurchaseOrder?.vendorPan, ocrVendor.pan),
    cin: firstValue(authoritativeVendor.cin),
    msme: firstValue(authoritativeVendor.msmeNumber, authoritativeVendor.msme_number),
    taxType: firstValue(authoritativeVendor.taxType, selectedPurchaseOrder?.vendorTaxType),
    contactPerson: firstValue(authoritativeVendor.contactPerson, selectedPurchaseOrder?.vendorContactPerson),
    email: firstValue(authoritativeVendor.email, selectedPurchaseOrder?.vendorEmail, ocrVendor.email),
    phone: firstValue(authoritativeVendor.phone, selectedPurchaseOrder?.vendorPhone, ocrVendor.phone),
    address: firstValue(authoritativeVendor.vendorAddress, authoritativeVendor.address, selectedPurchaseOrder?.vendorAddress, ocrVendor.vendorAddress, ocrVendor.address),
    bankName: firstValue(authoritativeVendor.bankName, selectedPurchaseOrder?.vendorBankName, ocrPayment.bankName),
    accountHolder: firstValue(authoritativeVendor.accountHolder, authoritativeVendor.accountName, selectedPurchaseOrder?.vendorAccountHolder, ocrPayment.accountHolder, ocrPayment.accountName),
    accountNumber: firstValue(authoritativeVendor.accountNumber, selectedPurchaseOrder?.vendorBankAccountNo, ocrPayment.accountNumber),
    ifsc: firstValue(authoritativeVendor.ifscCode, selectedPurchaseOrder?.vendorIfscCode, ocrPayment.ifsc, ocrPayment.ifscCode),
    branch: firstValue(authoritativeVendor.branch, selectedPurchaseOrder?.vendorBankBranch, ocrPayment.branch),
    paymentTerms: firstValue(authoritativeVendor.paymentTerms, selectedPurchaseOrder?.paymentTerms, ocrInvoice.paymentTerms, extractedData.terms?.paymentTerms),
    currency: firstValue(formData.currency, selectedPurchaseOrder?.currency),
    status: firstValue(authoritativeVendor.status),
  };
  const focusValidationTarget = (field) => {
    const fieldRefs = {
      purchaseOrder: purchaseOrderRef,
      invoiceNumber: invoiceNumberRef,
      invoiceDate: invoiceDateRef,
      dueDate: dueDateRef,
      invoiceAttachment: invoiceAttachmentRef,
      remarks: remarksRef,
      vendor: vendorRef,
      items: itemsRef,
      gst: gstRef,
      paymentTerms: vendorRef,
    };
    const target = fieldRefs[field]?.current || validationPanelRef.current;
    target?.scrollIntoView({ behavior: "smooth", block: "center" });
    if (typeof target?.focus === "function") target.focus({ preventScroll: true });
  };

  const validateBeforeSubmit = () => {
    const errors = [];
    const add = (field, label, message) => errors.push({ field, label, message });

    const rawPoId = String(formData.purchaseOrderId || "").trim();
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(rawPoId);

    if (!rawPoId || !isUuid || rawPoId === "undefined" || rawPoId === "null") {
      add("purchaseOrder", "Purchase Order", "Purchase Order is required. Select a valid Purchase Order from database.");
    }
    if (formData.invoiceCreationMethod !== "OCR" && !String(formData.invoiceNumber || "").trim()) {
      add("invoiceNumber", "Invoice Number", "Invoice Number is required for manual invoice creation.");
    }
    if (!formData.invoiceDate) {
      add("invoiceDate", "Invoice Date", "Invoice Date is required.");
    }
    if (!formData.dueDate) {
      add("dueDate", "Invoice Due Date", "Invoice Due Date is required.");
    }

    if (loadingPurchaseOrderDetails) {
      add("purchaseOrder", "Purchase Order", "Purchase Order details are still loading.");
    }

    if (formData.invoiceFile && !isSupportedInvoiceFile(formData.invoiceFile)) {
      add("invoiceAttachment", "Invoice Attachment", "Invoice file must be PDF, PNG, JPG, or JPEG.");
    } else if (formData.invoiceFile && formData.invoiceFile.size > MAX_INVOICE_FILE_SIZE) {
      add("invoiceAttachment", "Invoice Attachment", "Invoice file must be 20 MB or smaller.");
    }

    if (selectedPurchaseOrder) {
      const vendorName = selectedPurchaseOrder.vendorName || selectedPurchaseOrder.vendor;
      if (!selectedPurchaseOrder.vendorId && !selectedPurchaseOrder.vendor_id) {
        add("vendor", "Vendor", "Vendor could not be matched. Please select a valid Vendor.");
      }
      if (!vendorName) {
        add("vendor", "Vendor", "Vendor Name is missing for the selected Purchase Order.");
      }
      if (!invoiceDraftItems.length) {
        add("items", "Item Details", "Invoice item details are missing.");
      }
      invoiceDraftItems.forEach((item, index) => {
        const row = index + 1;
        const quantity = toNumber(item.quantity);
        const unitPrice = toNumber(item.unitPrice);
        const taxableAmount = toNumber(item.taxableAmount);
        const cgstAmount = toNumber(item.cgstAmount ?? item.cgst);
        const sgstAmount = toNumber(item.sgstAmount ?? item.sgst);
        const igstAmount = toNumber(item.igstAmount ?? item.igst);
        const gstAmount = toNumber(item.gstAmount ?? item.taxAmount);
        const lineTotal = toNumber(item.lineTotal ?? item.total);
        if (!String(item.itemName || item.description || "").trim()) {
          add("items", "Item Details", `Invoice item ${row} requires an item name or description.`);
        }
        if (!Number.isFinite(quantity) || quantity <= 0) {
          add("items", "Item Details", `Invoice item ${row} quantity must be greater than zero.`);
        }
        if (!Number.isFinite(unitPrice) || unitPrice < 0) {
          add("items", "Item Details", `Invoice item ${row} unit price cannot be negative.`);
        }
        if (!Number.isFinite(taxableAmount) || taxableAmount < 0) {
          add("items", "Item Details", `Invoice item ${row} taxable amount must be valid.`);
        }
        if (igstAmount > 0 && (cgstAmount > 0 || sgstAmount > 0)) {
          add("items", "Item Details", `Invoice item ${row} cannot apply IGST together with CGST or SGST.`);
        }
        if (!Number.isFinite(gstAmount) || gstAmount < 0) {
          add("items", "Item Details", `Invoice item ${row} tax amount must be valid.`);
        }
        if (!Number.isFinite(lineTotal) || lineTotal < 0) {
          add("items", "Item Details", `Invoice item ${row} line total must be valid.`);
        }
      });
      if (!invoiceDraftTotals.grandTotal || Number(invoiceDraftTotals.grandTotal) <= 0) {
        add("gst", "GST Details", "GST totals and Grand Total are missing.");
      }
    }

    setValidationErrors(errors);
    if (errors.length > 0) {
      setCreationError({
        title: "Unable to create invoice.",
        reasons: errors.map((error) => error.message).filter(Boolean),
      });
      window.setTimeout(() => focusValidationTarget(errors[0].field), 0);
      notify.error(errors[0].message || "Cannot create Invoice. Please complete the highlighted fields.");
      return false;
    }
    setCreationError(null);
    return true;
  };

  const initializeInvoiceDraft = ({ ocrData = ocrResultData, purchaseOrder = selectedPurchaseOrder, preferOcr = isOcrRoute } = {}) => {
    const draft = buildInvoiceDraftFromSources({ ocrData, purchaseOrder, preferOcr });
    setInvoiceDraftItems(draft.items);
    setInvoiceDraftTotals(draft.summary);
    console.info("[Invoice] Initial invoice items", {
      source: preferOcr && draft.items.length ? "OCR_REVIEW" : purchaseOrder?.id ? "PURCHASE_ORDER_REFERENCE" : "EMPTY",
      purchaseOrderId: purchaseOrder?.id || null,
      poNumber: purchaseOrder?.poNumber || null,
      itemCount: draft.items.length,
      grandTotal: draft.summary?.grandTotal ?? null,
    });
    return draft;
  };

  const handleItemChange = (index, field, value) => {
    setInvoiceDraftItems((currentItems) => {
      const nextItems = currentItems.map((item, itemIndex) => {
        if (itemIndex !== index) return item;
        const numericFields = new Set([
          "quantity",
          "unitPrice",
          "taxableAmount",
          "cgstRate",
          "sgstRate",
          "igstRate",
          "gstRate",
          "cgstAmount",
          "sgstAmount",
          "igstAmount",
          "discount",
        ]);
        const nextItem = {
          ...item,
          [field]: numericFields.has(field) ? toNumber(value) : value,
        };
        return numericFields.has(field) ? recalculateInvoiceItem(nextItem, field) : nextItem;
      });
      const nextTotals = recalculateInvoiceSummary(nextItems, invoiceDraftTotals);
      console.info("[Invoice] Item changed", {
        index,
        field,
        itemCode: nextItems[index]?.itemCode || null,
        itemName: nextItems[index]?.itemName || null,
        quantity: nextItems[index]?.quantity ?? null,
        unitPrice: nextItems[index]?.unitPrice ?? null,
        lineTotal: nextItems[index]?.lineTotal ?? null,
      });
      console.info("[Invoice] Recalculated totals", {
        subtotal: nextTotals.subtotal,
        totalTax: nextTotals.totalTax,
        grandTotal: nextTotals.grandTotal,
      });
      setInvoiceDraftTotals(nextTotals);
      setCreationError(null);
      return nextItems;
    });
  };


  const applyServerValidationErrors = (error) => {
    const serverErrors = error?.response?.data?.errors;
    if (!serverErrors || typeof serverErrors !== "object") return false;

    const fieldLabels = {
      purchaseOrderId: "Purchase Order",
      invoiceDate: "Invoice Date",
      dueDate: "Due Date",
      invoiceFile: "Invoice Attachment",
      remarks: "Remarks",
      vendor: "Vendor",
      items: "Item Details",
      taxSummary: "GST Details",
      amount: "Invoice Amount",
      invoiceNumber: "Invoice Number",
      paymentTerms: "Payment Terms",
    };
    const fieldMap = {
      purchaseOrderId: "purchaseOrder",
      invoiceDate: "invoiceDate",
      dueDate: "dueDate",
      invoiceFile: "invoiceAttachment",
      remarks: "remarks",
      vendor: "vendor",
      items: "items",
      taxSummary: "gst",
      amount: "gst",
      invoiceNumber: "invoiceNumber",
      paymentTerms: "paymentTerms",
    };

    const mapped = Object.entries(serverErrors).flatMap(([field, messages]) => {
      const messageList = Array.isArray(messages) ? messages : [messages];
      return messageList.filter(Boolean).map((message) => ({
        field: fieldMap[field] || field,
        label: fieldLabels[field] || field,
        message: String(message),
      }));
    });

    if (mapped.length === 0) return false;
    setValidationErrors(mapped);
    window.setTimeout(() => focusValidationTarget(mapped[0].field), 0);
    return true;
  };

  const setInvoiceFile = (file) => {
    setCreationError(null);
    setFormData((prev) => ({ ...prev, invoiceFile: file || null }));
    if (!file) {
      ocrUI("File selected", { selected: false });
      setOcrNotice("");
      setOcrResultData(null);
      setInvoiceDraftItems([]);
      setInvoiceDraftTotals(recalculateInvoiceSummary([]));
      setOcrStep("IDLE");
      setOcrJobProgress(0);
      return;
    }
    ocrUI("File selected", { fileName: file.name, fileSize: file.size, fileType: file.type || "unknown" });
    if (Number(file.size || 0) <= 0) {
      setOcrStep("FAILED");
      setOcrNotice("The selected invoice document is empty. Please upload a valid file.");
      return;
    }
    if (!isSupportedInvoiceFile(file)) {
      setOcrStep("FAILED");
      setOcrNotice("Unsupported file format for OCR. Please upload a PDF, PNG, JPG, JPEG, or TIFF file.");
      return;
    }

    setOcrStep("IDLE");
    setOcrNotice("Invoice document selected.");
  };

  const previewInvoiceFile = () => {
    if (!formData.invoiceFile) return;
    const url = window.URL.createObjectURL(formData.invoiceFile);
    window.open(url, "_blank", "noopener,noreferrer");
    window.setTimeout(() => window.URL.revokeObjectURL(url), 60_000);
  };

  const downloadInvoiceFile = () => {
    if (!formData.invoiceFile) return;
    const url = window.URL.createObjectURL(formData.invoiceFile);
    const link = document.createElement("a");
    link.href = url;
    link.download = formData.invoiceFile.name || "invoice-document";
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.URL.revokeObjectURL(url);
  };

  const fillFormFromOcrData = (data = {}) => {
    const extracted = data.extractedData || {};
    const invoice = extracted.invoice || extracted.header || {};
    const terms = extracted.terms || {};
    const purchaseOrder = data.matchedPurchaseOrder || data.purchaseOrder || null;
    const vendor = data.vendorMaster || data.vendor || data.matchedVendor || null;
    setFormData((prev) => ({
      ...prev,
      invoiceCreationMethod: "OCR",
      invoiceSource: "UPLOADED_PDF",
      invoiceNumber: firstValue(invoice.invoiceNumber, prev.invoiceNumber),
      invoiceCategory: firstValue(invoice.invoiceCategory, invoice.invoiceType, prev.invoiceCategory),
      receiptDate: firstValue(invoice.receiptDate, data.goodsReceiptNote?.grnDate, data.grn?.grnDate, data.matchedGrn?.grnDate, prev.receiptDate),
      priority: firstValue(invoice.priority, prev.priority),
      invoiceDate: firstValue(invoice.invoiceDate, prev.invoiceDate),
      dueDate: firstValue(invoice.dueDate, prev.dueDate),
      currency: firstValue(invoice.currency, purchaseOrder?.currency, vendor?.currency, prev.currency, "INR"),
      paymentTerms: firstValue(invoice.paymentTerms, terms.paymentTerms, vendor?.paymentTerms, purchaseOrder?.paymentTerms, prev.paymentTerms),
      purchaseOrderId: firstValue(purchaseOrder?.id, prev.purchaseOrderId),
    }));
  };

  const processSelectedInvoiceFile = async () => {
    setCreationError(null);
    const file = formData.invoiceFile;
    if (!file) {
      setOcrStep("FAILED");
      setOcrNotice("Select an invoice document before processing.");
      notify.error("Select an invoice document before processing.");
      return;
    }
    if (!isSupportedInvoiceFile(file)) {
      setOcrStep("FAILED");
      setOcrNotice("Unsupported file format for OCR. Please upload a PDF, PNG, JPG, JPEG, or TIFF file.");
      return;
    }
    if (Number(file.size || 0) <= 0) {
      setOcrStep("FAILED");
      setOcrNotice("The selected invoice document is empty. Please upload a valid file.");
      return;
    }

    ocrUI("Upload started", { fileName: file.name, fileSize: file.size, fileType: file.type });
    ocrPollingAbortRef.current?.abort();
    ocrPollingAbortRef.current = new AbortController();
    setOcrProcessing(true);
    setOcrJobProgress(0);
    setOcrStep("UPLOADING");
    setOcrNotice("Uploading document...");
    try {
      const handleJobStatus = (statusData = {}) => {
        const status = String(statusData.status || statusData.processingStatus || statusData.ocrStatus || "PROCESSING").toUpperCase();
        const progress = Number(statusData.progress);
        if (Number.isFinite(progress)) setOcrJobProgress(Math.max(0, Math.min(100, progress)));
        if (status === "UPLOADED" || status === "NOT_STARTED") {
          setOcrStep("UPLOADING");
          setOcrNotice("Invoice processing started. Waiting for OCR worker...");
        } else if (status === "PROCESSING") {
          setOcrStep("PARSING");
          setOcrNotice("Processing invoice document in the background...");
        } else if (status === "PARTIAL") {
          setOcrStep("PARTIAL_SUCCESS");
          setOcrNotice("OCR extracted partial data. Review and complete the missing fields.");
        } else if (status === "READY" || status === "COMPLETED") {
          setOcrStep("COMPLETED");
          setOcrNotice("Preparing invoice form...");
        } else if (status === "FAILED") {
          setOcrStep("FAILED");
          setOcrNotice(statusData.errorMessage || "OCR processing failed. Please try again.");
        }
      };
      const startedJob = await startInvoiceOcrJob(file, {
        onStatus: (statusData = {}) => {
          handleJobStatus(statusData);
        },
      });
      const jobId = startedJob.jobId || startedJob.ocrId || startedJob.ocrDocumentId;
      ocrUI("OCR job created", {
        jobId,
        queuePosition: startedJob.queuePosition || null,
        status: startedJob.status || null,
      });
      notify.success("Invoice processing started.");
      setOcrStep("PARSING");
      setOcrJobProgress((current) => Math.max(current, 10));
      setOcrNotice(`Invoice processing started. Job ID: ${jobId}`);

      const res = await waitForOcrInvoiceDraft({
        ocrId: jobId,
        onStatus: handleJobStatus,
        signal: ocrPollingAbortRef.current.signal,
      });
      setOcrResultData(res);
      setOcrJobProgress(100);
      const { ocrConfidence, extractedData, matchedPurchaseOrder } = res;
      fillFormFromOcrData(res);
      initializeInvoiceDraft({ ocrData: res, purchaseOrder: selectedPurchaseOrder, preferOcr: true });
      ocrUI("OCR response received", {
        ocrDocumentId: res?.ocrDocument?.id || null,
        draftId: res?.id || null,
        ocrStatus: res?.ocrStatus || null,
        confidence: ocrConfidence,
        draftStatus: res?.draftStatus || null,
      });
      ocrUI("Extracted invoice number", { invoiceNumber: extractedData?.invoice?.invoiceNumber || extractedData?.header?.invoiceNumber || null });
      ocrUI("Extracted vendor code", { vendorCode: extractedData?.vendor?.vendorCode || null });
      ocrUI("Extracted PO number", { poNumber: extractedData?.references?.poNumber || null });
      ocrUI("Extracted GRN number", { grnNumber: extractedData?.references?.grnNumber || null });
      ocrUI("Extracted DC number", { dcNumber: extractedData?.references?.deliveryChallanNumber || null });
      ocrUI("Vendor enrichment response", { found: Boolean(res?.vendorMaster || res?.vendor), vendorCode: res?.vendorMaster?.vendorCode || res?.vendor?.vendorCode || null });
      ocrUI("PO enrichment response", { found: Boolean(res?.purchaseOrder || res?.matchedPurchaseOrder), poNumber: res?.purchaseOrder?.poNumber || res?.matchedPurchaseOrder?.poNumber || null });
      ocrUI("GRN enrichment response", { found: Boolean(res?.goodsReceiptNote || res?.grn || res?.matchedGrn), grnNumber: res?.goodsReceiptNote?.grnNumber || res?.grn?.grnNumber || res?.matchedGrn?.grnNumber || null });
      ocrUI("DC enrichment response", { found: Boolean(res?.deliveryChallan || res?.matchedDeliveryChallan), dcNumber: res?.deliveryChallan?.deliveryChallanNumber || res?.matchedDeliveryChallan?.deliveryChallanNumber || null });

      setOcrStep("EXTRACTING");
      setOcrNotice("Invoice data extracted. Review the populated form below.");

      if (extractedData?.vendor?.gstin || extractedData?.vendor?.vendorName) {
        ocrUI("Vendor reference detected in OCR", {
          vendorCode: extractedData?.vendor?.vendorCode || null,
          gstin: extractedData?.vendor?.gstin || null,
          vendorName: extractedData?.vendor?.vendorName || null,
        });
        setOcrStep("MATCHING_VENDOR");
      }

      if (matchedPurchaseOrder) {
        ocrUI("PO detected and matched", { poNumber: matchedPurchaseOrder.poNumber, purchaseOrderId: matchedPurchaseOrder.id });
        setOcrStep("MATCHING_PO");
        await selectPurchaseOrder(matchedPurchaseOrder, { ocrData: res, preferOcr: true });
        setOcrStep("COMPLETED");
        notify.success("Invoice details extracted.");
        setOcrNotice(`Invoice details were populated from the document and matched to Purchase Order #${matchedPurchaseOrder.poNumber}.`);
      } else {
        ocrUI("No PO matched from OCR", { poNumber: extractedData?.references?.poNumber || null });
        setOcrStep("COMPLETED");
        notify.success("Invoice details extracted.");
        setOcrNotice("Invoice details were populated from the document. Select the matching Purchase Order to continue.");
      }
    } catch (err) {
      if (err?.name === "AbortError" || err?.code === "ERR_CANCELED") return;
      const message = err?.code === "OCR_POLL_TIMEOUT"
        ? err.message
        : getErrorMessage(err, "Unable to extract invoice information from this document.");
      ocrUI("OCR extraction error", { errorMessage: message, status: err?.response?.status || err?.status || null });
      console.error("[InvoiceCreate] OCR Extraction error:", err);
      if (err?.code === "OCR_POLL_TIMEOUT") {
        setOcrStep("PARSING");
        setOcrNotice(message);
        notify.info?.(message);
        return;
      }
      setOcrStep("FAILED");
      setCreationError({
        title: "Unable to extract invoice data.",
        reasons: [message],
      });
      notify.error(message);
      setOcrNotice(message);
    } finally {
      setOcrProcessing(false);
    }
  };

  const selectPurchaseOrder = async (purchaseOrder, options = {}) => {
    setCreationError(null);
    debugInvoiceCreate("[InvoiceCreate] Purchase Order selected", { purchaseOrderId: purchaseOrder.id });
    console.info("[Invoice] PO selected", {
      purchaseOrderId: purchaseOrder.id,
      poNumber: purchaseOrder.poNumber || null,
      source: options.preferOcr ? "OCR_LOOKUP" : "MANUAL_SELECTION",
    });
    setFormData((prev) => ({ ...prev, purchaseOrderId: purchaseOrder.id }));
    setSelectedPurchaseOrder(purchaseOrder);
    setSearch(`${purchaseOrder.poNumber} - ${purchaseOrder.vendorName || "Vendor"}`);
    setDropdownOpen(false);
    setLoadingPurchaseOrderDetails(true);
    try {
      const detail = await getPurchaseOrderForInvoice(purchaseOrder.id);
      console.info("[Invoice] PO data loaded", {
        purchaseOrderId: detail.id,
        poNumber: detail.poNumber || null,
        vendorId: detail.vendorId || detail.vendor_id || null,
        vendorCode: detail.vendorCode || null,
        grnCount: detail.grns?.length || detail.goodsReceiptNotes?.length || 0,
        deliveryChallanCount: detail.deliveryChallans?.length || 0,
        itemCount: detail.items?.length || 0,
        amount: detail.amount ?? detail.taxSummary?.grandTotal ?? null,
      });
      setSelectedPurchaseOrder(detail);
      initializeInvoiceDraft({
        ocrData: options.ocrData || ocrResultData,
        purchaseOrder: detail,
        preferOcr: options.preferOcr ?? isOcrRoute,
      });
      setValidationErrors([]);
    } catch (error) {
      const reason = getErrorMessage(error, "Purchase order details could not be loaded.");
      setCreationError({
        title: "Unable to load Purchase Order.",
        reasons: [reason],
      });
      notify.error(reason);
      setFormData((prev) => ({ ...prev, purchaseOrderId: "" }));
      setSelectedPurchaseOrder(null);
      setInvoiceDraftItems([]);
      setInvoiceDraftTotals(recalculateInvoiceSummary([]));
    } finally {
      setLoadingPurchaseOrderDetails(false);
    }
  };

  useEffect(() => {
    if (!isOcrRoute || !draftId || loadedOcrDraftRef.current === draftId) return;
    let active = true;
    loadedOcrDraftRef.current = draftId;

    const loadDraft = async () => {
      setOcrProcessing(true);
      setOcrStep("PARSING");
      setOcrNotice("Loading saved OCR invoice draft...");
      try {
        const draft = await getOcrInvoiceDraft(draftId);
        if (!active) return;
        setOcrResultData(draft);
        fillFormFromOcrData(draft);
        ocrUI("OCR response received", { draftId, ocrStatus: draft?.ocrStatus || null, draftStatus: draft?.draftStatus || null });
        setFormData((prev) => ({ ...prev, invoiceFile: null }));
        const matchedPurchaseOrder = draft.matchedPurchaseOrder || draft.purchaseOrder || null;
        if (matchedPurchaseOrder?.id) {
          await selectPurchaseOrder(matchedPurchaseOrder, { ocrData: draft, preferOcr: true });
        } else {
          initializeInvoiceDraft({ ocrData: draft, purchaseOrder: null, preferOcr: true });
        }
        if (!active) return;
        setOcrStep("COMPLETED");
        setOcrNotice("Saved OCR invoice draft loaded. Review the populated form before creating the invoice.");
      } catch (error) {
        if (!active) return;
        console.error("[InvoiceCreate] OCR draft load failed:", error);
        setOcrStep("FAILED");
        setOcrNotice("Unable to load the saved OCR invoice draft.");
        notify.error(getErrorMessage(error, "Unable to load OCR invoice draft."));
      } finally {
        if (active) setOcrProcessing(false);
      }
    };

    loadDraft();
    return () => {
      active = false;
    };
    // Load a saved OCR draft once for the current route/draft id.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draftId, isOcrRoute]);

  const handleSubmit = async (event) => {
    event.preventDefault();
    setCreationError(null);
    debugInvoiceCreate("[InvoiceCreate] Create Invoice button clicked");
    if (!validateBeforeSubmit()) {
      debugInvoiceCreate("[InvoiceCreate] Validation blocked submission");
      return;
    }

    const isOcrSubmit = formData.invoiceCreationMethod === "OCR";

    // Build the complete payload — merge OCR metadata from ocrResultData for OCR workflow
    const submitPayload = {
      ...formData,
      lineItems: invoiceDraftItems,
      taxSummary: invoiceDraftTotals,
      amount: invoiceDraftTotals?.grandTotal || null,
      currency: formData.currency || selectedPurchaseOrder?.currency || ocrResultData?.extractedData?.invoice?.currency || ocrResultData?.extractedData?.header?.currency || "INR",
      ...(isOcrSubmit && ocrResultData ? {
        ocrDraftId: ocrResultData.id || ocrResultData.draftId || null,
        ocrDocumentId: ocrResultData.ocrDocument?.id || ocrResultData.ocrDocumentId || null,
        ocrExtractionId: ocrResultData.ocrExtractionId || null,
        ocrStatus: ocrResultData.ocrStatus || ocrResultData.ocr?.status || null,
        ocrConfidence: ocrResultData.ocrConfidence ?? ocrResultData.ocr?.confidence ?? null,
        ocrExtractedData: ocrResultData.extractedData || ocrResultData.rawExtractedData || null,
        invoiceDate: formData.invoiceDate || ocrResultData?.extractedData?.invoice?.invoiceDate || ocrResultData?.extractedData?.header?.invoiceDate || null,
        dueDate: formData.dueDate || ocrResultData?.extractedData?.invoice?.dueDate || ocrResultData?.extractedData?.header?.dueDate || null,
      } : {}),
    };
    console.info("[Invoice] Final payload", {
      invoiceCreationMethod: submitPayload.invoiceCreationMethod,
      purchaseOrderId: submitPayload.purchaseOrderId || null,
      poNumber: selectedPurchaseOrder?.poNumber || null,
      invoiceNumber: submitPayload.invoiceNumber || null,
      invoiceDate: submitPayload.invoiceDate || null,
      dueDate: submitPayload.dueDate || null,
      itemCount: submitPayload.lineItems?.length || 0,
      subtotal: submitPayload.taxSummary?.subtotal ?? null,
      totalTax: submitPayload.taxSummary?.totalTax ?? submitPayload.taxSummary?.totalGst ?? null,
      grandTotal: submitPayload.amount ?? null,
      hasOcrDraftId: Boolean(submitPayload.ocrDraftId),
      hasOcrDocumentId: Boolean(submitPayload.ocrDocumentId),
    });

    if (isOcrSubmit) {
      ocrUI("Final invoice form data", {
        purchaseOrderId: submitPayload.purchaseOrderId,
        poNumber: selectedPurchaseOrder?.poNumber || null,
        invoiceCreationMethod: submitPayload.invoiceCreationMethod,
        invoiceDate: submitPayload.invoiceDate,
        dueDate: submitPayload.dueDate,
        lineItemsCount: submitPayload.lineItems?.length || 0,
        grandTotal: submitPayload.amount || null,
        hasOcrDraftId: Boolean(submitPayload.ocrDraftId),
        hasOcrDocumentId: Boolean(submitPayload.ocrDocumentId),
        ocrStatus: submitPayload.ocrStatus,
      });
    } else {
      console.debug("[INVOICE CREATE]", {
        poIdAvailable: Boolean(formData.purchaseOrderId),
        poNumber: selectedPurchaseOrder?.poNumber || "N/A",
        vendorIdAvailable: Boolean(selectedPurchaseOrder?.vendorId || selectedPurchaseOrder?.vendor_id),
        lineItemsCount: submitPayload.lineItems?.length || 0,
        grandTotal: submitPayload.amount || null,
      });
    }

    setSubmitting(true);
    try {
      if (isOcrSubmit) {
        ocrUI("Invoice submission started", { purchaseOrderId: submitPayload.purchaseOrderId, invoiceNumber: submitPayload.invoiceNumber || null });
      }
      debugInvoiceCreate("[InvoiceCreate] Validation passed. API called", { purchaseOrderId: submitPayload.purchaseOrderId });
      const invoice = await createInvoice(submitPayload);
      notify.success("Invoice created successfully.");
      console.info("[Invoice] Invoice created", {
        invoiceId: invoice?.id || null,
        invoiceNumber: invoice?.invoiceNumber || invoice?.invoice?.invoiceNumber || null,
        matchingStatus: invoice?.matching?.overallStatus || invoice?.three_way_match_status || null,
      });
      if (isOcrSubmit) {
        ocrUI("Invoice created", { invoiceId: invoice?.id, invoiceNumber: invoice?.invoiceNumber || invoice?.invoice?.invoiceNumber || null });
        ocrUI("3-Way Matching response", {
          status: invoice?.matching?.overallStatus || invoice?.three_way_match_status || null,
          score: invoice?.matching?.matchingScore || invoice?.three_way_match_percentage || null,
        });
      }
      setCreatedInvoiceSuccessData(invoice);

      const createdId = invoice?.id;
      const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(createdId || "").trim());

      if (createdId && isUuid) {
        console.info("[Invoice] Redirecting to matching", {
          invoiceId: createdId,
          target: `/invoices/${createdId}`,
        });
        navigate(`/invoices/${createdId}`);
      } else {
        notify.error("Invoice created successfully, but we could not open the Invoice Details page.");
      }
    } catch (error) {
      if (isOcrSubmit) {
        ocrUI("Invoice creation failed", { errorMessage: error?.message || String(error) });
      }
      const reasons = collectApiErrorMessages(error);
      setCreationError({
        title: "Unable to create invoice.",
        reasons,
      });
      applyServerValidationErrors(error);
      notify.error(reasons[0] || getErrorMessage(error, "Unable to create invoice."));
    } finally {
      setSubmitting(false);
    }
  };

  if (createdInvoiceSuccessData) {
    const createdId = createdInvoiceSuccessData.id;
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(createdId || "").trim());

    return (
      <div className="max-w-3xl mx-auto my-12 rounded-2xl border border-emerald-200 bg-emerald-50/60 p-8 shadow-lg text-slate-900 space-y-6">
        <div className="flex items-center gap-4 border-b border-emerald-200 pb-5">
          <div className="grid h-12 w-12 place-items-center rounded-xl bg-emerald-600 text-white font-bold shadow-md">
            ✓
          </div>
          <div>
            <h1 className="text-xl font-bold text-emerald-950">Invoice Created Successfully</h1>
            <p className="text-sm text-emerald-800">The invoice has been saved in PostgreSQL and submitted to 3-Way Matching.</p>
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 rounded-xl bg-white p-6 border border-emerald-100 text-sm">
          <div>
            <span className="text-xs font-semibold text-slate-500 uppercase">Invoice Number</span>
            <p className="mt-0.5 font-bold text-slate-900">{createdInvoiceSuccessData.invoiceNumber || "INV-2026-000001"}</p>
          </div>
          <div>
            <span className="text-xs font-semibold text-slate-500 uppercase">Purchase Order</span>
            <p className="mt-0.5 font-bold text-purple-800">{createdInvoiceSuccessData.poNumber || selectedPurchaseOrder?.poNumber || "PO"}</p>
          </div>
          <div>
            <span className="text-xs font-semibold text-slate-500 uppercase">Vendor Name</span>
            <p className="mt-0.5 font-bold text-slate-900">{createdInvoiceSuccessData.vendorName || selectedPurchaseOrder?.vendorName || "Vendor"}</p>
          </div>
          <div>
            <span className="text-xs font-semibold text-slate-500 uppercase">Workflow Status</span>
            <p className="mt-0.5 inline-flex items-center rounded-full bg-blue-100 px-3 py-0.5 text-xs font-bold text-blue-800">
              {createdInvoiceSuccessData.status || "Created"}
            </p>
          </div>
        </div>

        {!isUuid ? (
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-xs font-semibold text-amber-900">
            Invoice created successfully, but we could not open the Invoice Details page.
          </div>
        ) : null}

        <div className="flex flex-wrap items-center gap-4 pt-2">
          {isUuid ? (
            <Link
              to={`/invoices/${createdId}`}
              className="rounded-xl bg-blue-600 px-6 py-3 text-sm font-semibold text-white transition hover:bg-blue-700 shadow-sm"
            >
              View Invoice Details
            </Link>
          ) : (
            <Link
              to="/invoices"
              className="rounded-xl bg-blue-600 px-6 py-3 text-sm font-semibold text-white transition hover:bg-blue-700 shadow-sm"
            >
              View Invoice
            </Link>
          )}
          <Link
            to="/three-way-matching"
            className="rounded-xl border border-slate-300 bg-white px-6 py-3 text-sm font-semibold text-slate-800 transition hover:bg-slate-50 shadow-sm"
          >
            Go to 3-Way Matching
          </Link>
          <Link
            to="/invoices"
            className="rounded-xl text-sm font-semibold text-slate-600 hover:text-slate-900 transition ml-auto"
          >
            Back to Invoice History
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Link to="/invoices" className="rounded-lg p-2 transition hover:bg-slate-100 dark:hover:bg-slate-900">
          <ArrowLeft size={20} className="text-slate-600 dark:text-slate-400" />
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-slate-950">Create Invoice</h1>
          <p className="mt-1 text-sm text-slate-500">Invoices are generated from available purchase orders.</p>
        </div>
      </div>

      <div className="grid gap-2 rounded-xl border border-slate-200 bg-white p-4 text-xs font-semibold text-slate-600 md:grid-cols-4">
        {["Select PO", "Manual Entry", "Review", "Save"].map((step, index) => (
          <div key={step} className={`rounded-lg px-3 py-2 ${index <= 1 || selectedPurchaseOrder ? "bg-blue-50 text-blue-700" : "bg-slate-50"}`}>
            Step {index + 1}: {step}
          </div>
        ))}
      </div>

      {validationErrors.length > 0 ? (
        <section
          ref={validationPanelRef}
          tabIndex={-1}
          className="rounded-xl border border-red-200 bg-red-50 p-5 outline-none"
        >
          <h2 className="text-base font-bold text-red-800">Cannot create Invoice.</h2>
          <p className="mt-1 text-sm text-red-700">Please complete the following fields:</p>
          <div className="mt-4 grid gap-2 md:grid-cols-2">
            {validationErrors.map((error) => (
              <button
                key={`${error.field}-${error.message}`}
                type="button"
                onClick={() => focusValidationTarget(error.field)}
                className="rounded-lg border border-red-200 bg-white px-3 py-2 text-left text-sm font-semibold text-red-700 transition hover:bg-red-100 focus:outline-none focus:ring-2 focus:ring-red-300"
              >
                {error.label}: <span className="font-medium">{error.message}</span>
              </button>
            ))}
          </div>
        </section>
      ) : null}

      {creationError?.reasons?.length ? (
        <section className="rounded-xl border border-red-200 bg-red-50 p-5 text-red-900">
          <h2 className="text-base font-bold">{creationError.title || "Unable to create invoice."}</h2>
          <p className="mt-2 text-sm font-semibold">Reason:</p>
          <ul className="mt-2 space-y-1 text-sm">
            {creationError.reasons.map((reason) => (
              <li key={reason} className="rounded-lg border border-red-100 bg-white px-3 py-2">
                {reason}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <form onSubmit={handleSubmit} noValidate className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_340px]">
        <div className="space-y-6">
          {/* Invoice Creation Method header temporarily hidden for manual-only flow */}

          {isOcrRoute ? (
          <section className="rounded-2xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 shadow-sm dark:shadow-slate-950/40">
            <div className="mb-5 border-b border-slate-100 pb-4">
              <h2 className="text-base font-bold text-slate-950">Upload Invoice Document</h2>
            </div>
            <div className="space-y-4">
              <label ref={invoiceAttachmentRef} tabIndex={-1} className={`flex cursor-pointer items-center gap-3 rounded-xl border border-dashed bg-slate-50 p-4 transition hover:border-blue-300 hover:bg-blue-50 ${errorsByField.invoiceAttachment ? "border-red-400" : "border-slate-300"}`}>
                <Upload size={20} className="text-blue-600" />
                <span className="text-sm font-medium text-slate-700">{formData.invoiceFile?.name || "Choose File"}</span>
                <input
                  type="file"
                  accept="application/pdf,image/png,image/jpeg,image/tiff"
                  className="sr-only"
                  onChange={(event) => setInvoiceFile(event.target.files?.[0] || null)}
                />
              </label>
              <p className="text-xs font-medium text-slate-500">Supported: PDF / PNG / JPG / JPEG / TIFF.</p>
              <ErrorText message={errorsByField.invoiceAttachment} />

              {formData.invoiceFile ? (
                <div className="grid gap-3 rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm md:grid-cols-3">
                  <Field label="File Name" value={formData.invoiceFile.name} />
                  <Field label="File Type" value={formData.invoiceFile.type || "Unknown"} />
                  <Field label="File Size" value={formatFileSize(formData.invoiceFile.size)} />
                </div>
              ) : null}

              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={processSelectedInvoiceFile}
                  disabled={!formData.invoiceFile || ocrProcessing}
                  className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-xs font-semibold text-white shadow-sm transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <Upload size={14} />
                  {ocrProcessing ? "Extracting..." : "Extract invoice details"}
                </button>
                {formData.invoiceFile ? (
                  <button type="button" onClick={() => setInvoiceFile(null)} className="inline-flex items-center gap-1 rounded-lg border border-red-200 px-3 py-2 text-xs font-semibold text-red-700 hover:bg-red-50">
                    <Trash2 size={14} /> Remove File
                  </button>
                ) : null}
              </div>

              {ocrProcessing ? (
                <div className="flex items-center gap-2 rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-xs font-semibold text-blue-700">
                  <span className="h-3 w-3 animate-spin rounded-full border-2 border-blue-600 border-t-transparent" />
                  <span className="flex-1">Analyzing document via OCR engine...</span>
                  <span>{ocrJobProgress}%</span>
                </div>
              ) : null}

              {ocrNotice ? (
                <p className={`rounded-lg border px-3 py-2 text-xs font-semibold ${ocrResultData?.ocrStatus === "SUCCESS" || ocrStep === "COMPLETED" ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-amber-200 bg-amber-50 text-amber-800"}`}>
                  {ocrNotice}
                </p>
              ) : null}

            </div>
          </section>
          ) : null}

          <section className="rounded-2xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 shadow-sm dark:shadow-slate-950/40">
            <div className="mb-5 border-b border-slate-100 pb-4">
              <h2 className="text-base font-bold text-slate-950">Purchase Order Selection</h2>
              <p className="mt-1 text-sm text-slate-500">Select an existing purchase order. Vendor, item, tax, and total values are read-only.</p>
            </div>

            <div className="grid gap-5 lg:grid-cols-2">
              <div className="relative lg:col-span-2" ref={dropdownRef}>
                <RequiredLabel helper="Invoice must be created from an existing Purchase Order.">Purchase Order</RequiredLabel>
                <div className="relative">
                  <input
                    ref={purchaseOrderRef}
                    value={search}
                    onFocus={() => setDropdownOpen(true)}
                    onChange={(event) => {
                      setSearch(event.target.value);
                      setDropdownOpen(true);
                      setFormData((prev) => ({ ...prev, purchaseOrderId: "" }));
                      setSelectedPurchaseOrder(null);
                      setInvoiceDraftItems([]);
                      setInvoiceDraftTotals(recalculateInvoiceSummary([]));
                    }}
                    placeholder="Search and select PO number, vendor, vendor code, or GST"
                    className={`${input} pr-10 ${fieldErrorClass(errorsByField.purchaseOrder)}`}
                  />
                  <ChevronDown className="pointer-events-none absolute right-3 top-3 text-slate-400" size={18} />
                </div>
                <ErrorText message={errorsByField.purchaseOrder} />
                {dropdownOpen && (
                  <div className="absolute z-30 mt-2 max-h-80 w-full overflow-auto rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-xl">
                    {fetchError ? (
                      <div className="p-4 text-sm text-red-600 font-semibold">
                        {fetchError.message?.toLowerCase().includes("conn") || fetchError.status === 500
                          ? "Database connection failed. Unable to fetch Purchase Orders."
                          : "Unable to fetch Purchase Orders."}
                      </div>
                    ) : loadingPurchaseOrders ? (
                      <div className="p-4 text-sm text-slate-500">Loading available purchase orders...</div>
                    ) : purchaseOrders.length ? (
                      purchaseOrders.map((purchaseOrder) => (
                        <button
                          key={purchaseOrder.id}
                          type="button"
                          onClick={() => selectPurchaseOrder(purchaseOrder)}
                          className="block w-full border-b border-slate-100 dark:border-slate-800/80 px-4 py-3 text-left transition last:border-0 hover:bg-blue-50 focus:bg-blue-50 focus:outline-none"
                        >
                          <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                            <div className="min-w-0">
                              <p className="truncate text-sm font-bold text-slate-950 dark:text-slate-100">{purchaseOrder.poNumber}</p>
                              <p className="mt-1 text-xs text-slate-505 dark:text-slate-400">
                                {purchaseOrder.vendorName || "-"} | {purchaseOrder.vendorCode || "-"}
                              </p>
                            </div>
                            <div className="text-left sm:text-right">
                              <p className="text-[11px] font-bold uppercase tracking-wide text-slate-400">Grand Total</p>
                              <p className="mt-0.5 text-sm font-bold text-blue-700 dark:text-blue-400">{currency(purchaseOrder.taxSummary?.grandTotal || purchaseOrder.amount)}</p>
                              <p className="mt-1 text-xs text-slate-505 dark:text-slate-400">{formatDate(purchaseOrder.poDate || purchaseOrder.createdAt)}</p>
                            </div>
                          </div>
                          <p className="mt-2 text-xs text-slate-505 dark:text-slate-400">GST: {purchaseOrder.vendorGst || "-"} | {purchaseOrder.vendorAddress || "Address not available"}</p>
                        </button>
                      ))
                    ) : (
                      <div className="p-4 text-sm text-slate-500">
                        {search ? "No matching Purchase Orders found." : "No eligible Purchase Orders available."}
                      </div>
                    )}
                  </div>
                )}
              </div>
              <div>
                <label className="mb-2 block text-sm font-semibold text-slate-700">PO Number</label>
                <input value={selectedPurchaseOrder?.poNumber || ""} disabled className={readOnly} />
              </div>
              <div>
                <label className="mb-2 block text-sm font-semibold text-slate-700 dark:text-slate-200">Purchase Order Date</label>
                <input value={formatDate(selectedPurchaseOrder?.poDate || selectedPurchaseOrder?.createdAt)} disabled className={readOnly} />
              </div>
              <div>
                <label className="mb-2 block text-sm font-semibold text-slate-700 dark:text-slate-200">Expected Delivery Date</label>
                <input value={formatDate(selectedPurchaseOrder?.expectedDeliveryDate)} disabled className={readOnly} />
              </div>
            </div>

            {loadingPurchaseOrderDetails ? (
              <div className="mt-6 rounded-xl border border-blue-100 bg-blue-50 p-4 text-sm font-medium text-blue-700">
                Loading complete purchase order details...
              </div>
            ) : null}

            {selectedPurchaseOrder ? (
              <div ref={vendorRef} tabIndex={-1} className="mt-6 grid gap-5 rounded-xl bg-slate-50 p-5 outline-none md:grid-cols-2 xl:grid-cols-4">
                <Field label="Vendor" value={selectedPurchaseOrder.vendorName || selectedPurchaseOrder.vendor} isRequired />
                <Field label="Vendor Code" value={selectedPurchaseOrder.vendorCode} isRequired />
                <Field label="Vendor GST" value={selectedPurchaseOrder.vendorGst || selectedPurchaseOrder.gstNumber} isRequired />
                <Field label="Vendor PAN" value={selectedPurchaseOrder.vendorPan} />
                <Field label="Vendor Email" value={selectedPurchaseOrder.vendorEmail} isRequired />
                <Field label="Vendor Phone" value={selectedPurchaseOrder.vendorPhone} isRequired />
                <Field label="Contact Person" value={selectedPurchaseOrder.vendorContactPerson} isRequired />
                <Field label="Tax Type" value={selectedPurchaseOrder.vendorTaxType} isRequired />
                <Field label="Bank Name" value={selectedPurchaseOrder.vendorBankName} isRequired />
                <Field label="Account Holder" value={selectedPurchaseOrder.vendorAccountHolder} isRequired />
                <Field label="Account Number" value={selectedPurchaseOrder.vendorBankAccountNo ? (String(selectedPurchaseOrder.vendorBankAccountNo).startsWith("****") ? selectedPurchaseOrder.vendorBankAccountNo : `**** ${String(selectedPurchaseOrder.vendorBankAccountNo).slice(-4)}`) : null} isRequired />
                <Field label="IFSC Code" value={selectedPurchaseOrder.vendorIfscCode} isRequired />
                <Field label="Payment Terms" value={selectedPurchaseOrder.paymentTerms} isRequired />
                <Field label="Currency" value={selectedPurchaseOrder.currency} />
                <Field label="Delivery Challan" value={selectedPurchaseOrder.deliveryChallans?.[0]?.delivery_challan_number || "-"} />
                <Field label="GRN" value={selectedPurchaseOrder.grns?.[0]?.grn_number || "-"} />
                <Field label="Grand Total" value={currency(selectedPurchaseOrder.taxSummary?.grandTotal || selectedPurchaseOrder.amount)} />
              </div>
            ) : null}
            <ErrorText message={errorsByField.vendor || errorsByField.paymentTerms} />

            <div className="mt-5 grid gap-5 lg:grid-cols-2">
              {displayVendor.address ? (
              <div>
                <label className="mb-2 block text-sm font-semibold text-slate-700">Vendor Address</label>
                <textarea value={selectedPurchaseOrder?.vendorAddress || ""} disabled rows={3} className={`${readOnly} h-auto py-3`} />
              </div>
              ) : null}
              {selectedPurchaseOrder?.billingAddress ? (
              <div>
                <label className="mb-2 block text-sm font-semibold text-slate-700 dark:text-slate-200">Billing Address</label>
                <textarea value={selectedPurchaseOrder?.billingAddress || ""} disabled rows={3} className={`${readOnly} h-auto py-3`} />
              </div>
              ) : null}
              {selectedPurchaseOrder?.deliveryAddress ? (
              <div>
                <label className="mb-2 block text-sm font-semibold text-slate-700 dark:text-slate-200">Delivery Address</label>
                <textarea value={selectedPurchaseOrder?.deliveryAddress || ""} disabled rows={3} className={`${readOnly} h-auto py-3`} />
              </div>
              ) : null}
              {[companyName, companyGst, companyAddress].filter(Boolean).length ? (
              <div>
                <label className="mb-2 block text-sm font-semibold text-slate-700 dark:text-slate-200">Company Details</label>
                <textarea value={[companyName, companyGst, companyAddress].filter(Boolean).join("\n")} disabled rows={3} className={`${readOnly} h-auto py-3`} />
              </div>
              ) : null}
            </div>
          </section>

          <section className="rounded-2xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 shadow-sm dark:shadow-slate-950/40">
            <div className="mb-5 border-b border-slate-100 dark:border-slate-800 pb-4">
              <h2 className="text-base font-bold text-slate-950 dark:text-slate-100 font-heading">Invoice Information</h2>
            </div>
            <div className="grid gap-5 md:grid-cols-2">
              <div>
                <RequiredLabel>Invoice Number</RequiredLabel>
                <input
                  ref={invoiceNumberRef}
                  name="invoiceNumber"
                  type="text"
                  placeholder="e.g. INV-2026-008502"
                  value={formData.invoiceNumber}
                  onChange={(event) => setFormData((prev) => ({ ...prev, invoiceNumber: event.target.value }))}
                  className={`${input} ${fieldErrorClass(errorsByField.invoiceNumber)}`}
                />
                <ErrorText message={errorsByField.invoiceNumber} />
              </div>
              <div>
                <RequiredLabel>Invoice Category</RequiredLabel>
                <select value={formData.invoiceCategory} onChange={(event) => setFormData((prev) => ({ ...prev, invoiceCategory: event.target.value }))} className={`${input} ${fieldErrorClass(errorsByField.invoiceCategory)}`}>
                  {INVOICE_CATEGORIES.map((category) => (
                    <option key={category.value} value={category.value}>{category.label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="mb-2 block text-sm font-semibold text-slate-700 dark:text-slate-200">Receipt Date</label>
                <DateInput name="receiptDate" value={formData.receiptDate} onChange={(nextValue) => setFormData((prev) => ({ ...prev, receiptDate: nextValue }))} className="w-full" ariaLabel="Receipt date" />
              </div>
              <div>
                <label className="mb-2 block text-sm font-semibold text-slate-700 dark:text-slate-200">Priority</label>
                <select value={formData.priority} onChange={(event) => setFormData((prev) => ({ ...prev, priority: event.target.value }))} className={input}>
                  <option value="STANDARD">Standard</option>
                  <option value="HIGH">High</option>
                  <option value="URGENT">Urgent</option>
                </select>
              </div>
              <div>
                <RequiredLabel>Invoice Date</RequiredLabel>
                <DateInput ref={invoiceDateRef} name="invoiceDate" value={formData.invoiceDate} onChange={(nextValue) => setFormData((prev) => ({ ...prev, invoiceDate: nextValue }))} invalid={!!errorsByField.invoiceDate} ariaLabel="Invoice date" />
                <ErrorText message={errorsByField.invoiceDate} />
              </div>
              <div>
                <RequiredLabel>Invoice Due Date</RequiredLabel>
                <DateInput ref={dueDateRef} name="dueDate" value={formData.dueDate} onChange={(nextValue) => setFormData((prev) => ({ ...prev, dueDate: nextValue }))} invalid={!!errorsByField.dueDate} ariaLabel="Invoice due date" />
                <ErrorText message={errorsByField.dueDate} />
              </div>
              <div className="md:col-span-2">
                <label className="mb-2 block text-sm font-semibold text-slate-700">Invoice Attachment <span className="font-medium text-slate-400">(Optional)</span></label>
                <label ref={invoiceAttachmentRef} tabIndex={-1} className={`flex cursor-pointer items-center gap-3 rounded-xl border border-dashed bg-slate-50 p-4 transition hover:border-blue-300 hover:bg-blue-50 ${errorsByField.invoiceAttachment ? "border-red-400" : "border-slate-300"}`}>
                  <Upload size={20} className="text-blue-600" />
                  <span className="text-sm font-medium text-slate-700">{formData.invoiceFile?.name || "Upload PDF, PNG, JPG, or JPEG invoice file"}</span>
                  <input
                    type="file"
                    accept="application/pdf,image/png,image/jpeg"
                    className="sr-only"
                    onChange={(event) => setInvoiceFile(event.target.files?.[0] || null)}
                  />
                </label>
                <ErrorText message={errorsByField.invoiceAttachment} />
                {formData.invoiceFile ? (
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <span className="text-xs font-medium text-slate-500">{formatFileSize(formData.invoiceFile.size)}</span>
                    <button type="button" onClick={previewInvoiceFile} className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50">
                      <Eye size={14} /> Preview
                    </button>
                    <button type="button" onClick={downloadInvoiceFile} className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50">
                      <Download size={14} /> Download
                    </button>
                    <button type="button" onClick={() => setInvoiceFile(null)} className="inline-flex items-center gap-1 rounded-lg border border-red-200 px-3 py-2 text-xs font-semibold text-red-700 hover:bg-red-50">
                      <Trash2 size={14} /> Delete
                    </button>
                  </div>
                ) : null}
                {ocrProcessing ? (
                  <div className="mt-3 flex items-center gap-2 rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-xs font-semibold text-blue-700">
                    <span className="h-3 w-3 animate-spin rounded-full border-2 border-blue-600 border-t-transparent" />
                    <span className="flex-1">Analyzing document via OCR engine...</span>
                    <span>{ocrJobProgress}%</span>
                  </div>
                ) : null}

                {ocrNotice ? (
                  <p className={`mt-3 rounded-lg border px-3 py-2 text-xs font-semibold ${ocrResultData?.ocrStatus === "SUCCESS" || ocrStep === "COMPLETED" ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-amber-200 bg-amber-50 text-amber-800"}`}>
                    {ocrNotice}
                  </p>
                ) : null}

                <OcrProgressStepper ocrStep={ocrStep} ocrResultData={ocrResultData} />


                {ocrResultData?.extractedData ? (
                  <div className="mt-4 rounded-xl border border-blue-100 bg-blue-50/50 p-4 text-xs space-y-4">
                    <div className="flex items-center justify-between border-b border-blue-200 pb-2">
                      <span className="font-bold uppercase tracking-wider text-blue-900">OCR Extracted Information (Raw Document Text)</span>
                      <span className="rounded-full bg-blue-600 px-2.5 py-0.5 font-bold text-white">
                        {ocrResultData.ocrConfidence}% Confidence
                      </span>
                    </div>

                    <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4">
                      <div><span className="text-slate-500">PO Number:</span> <strong className="text-slate-900 block">{ocrResultData.extractedData.references?.poNumber || "Not Detected"}</strong></div>
                      <div><span className="text-slate-500">PO Date:</span> <strong className="text-slate-900 block">{ocrResultData.extractedData.header?.poDate || "Not Detected"}</strong></div>
                      <div><span className="text-slate-500">Vendor Name:</span> <strong className="text-slate-900 block">{ocrResultData.extractedData.vendor?.vendorName || "Not Detected"}</strong></div>
                      <div><span className="text-slate-500">Vendor Code:</span> <strong className="text-slate-900 block">{ocrResultData.extractedData.vendor?.vendorCode || "Not Detected"}</strong></div>
                      <div><span className="text-slate-500">Vendor GSTIN:</span> <strong className="text-slate-900 block">{ocrResultData.extractedData.vendor?.gstin || "Not Detected"}</strong></div>
                      <div><span className="text-slate-500">Vendor PAN:</span> <strong className="text-slate-900 block">{ocrResultData.extractedData.vendor?.pan || "Not Detected"}</strong></div>
                      <div><span className="text-slate-500">Currency:</span> <strong className="text-slate-900 block">{ocrResultData.extractedData.header?.currency || "INR"}</strong></div>
                      <div><span className="text-slate-500">Payment Terms:</span> <strong className="text-slate-900 block">{ocrResultData.extractedData.header?.paymentTerms || "Net 30"}</strong></div>
                      <div><span className="text-slate-500">Expected Delivery:</span> <strong className="text-slate-900 block">{ocrResultData.extractedData.header?.expectedDeliveryDate || "Not Detected"}</strong></div>
                      <div><span className="text-slate-500">Bank Account:</span> <strong className="text-slate-900 block">{ocrResultData.extractedData.bank?.accountNumber || "Not Detected"}</strong></div>
                      <div><span className="text-slate-500">IFSC Code:</span> <strong className="text-slate-900 block">{ocrResultData.extractedData.bank?.ifscCode || "Not Detected"}</strong></div>
                      <div><span className="text-slate-500">Extracted Total:</span> <strong className="text-slate-900 block">{ocrResultData.extractedData.totals?.grandTotal ? currency(ocrResultData.extractedData.totals.grandTotal) : "Not Detected"}</strong></div>
                    </div>

                    {ocrResultData.extractedData.vendor?.address ? (
                      <div className="border-t border-blue-100 pt-2">
                        <span className="text-slate-500">Vendor Address:</span> <span className="text-slate-800 font-medium">{ocrResultData.extractedData.vendor.address}</span>
                      </div>
                    ) : null}
                  </div>
                ) : null}

                {/* DB Match Found vs Not Found State */}
                {ocrResultData?.extractedData && selectedPurchaseOrder ? (
                  <div className="mt-4 rounded-xl border border-purple-200 bg-purple-50/60 p-4 text-xs space-y-3">
                    <div className="flex items-center justify-between border-b border-purple-200 pb-2">
                      <span className="font-bold uppercase tracking-wider text-purple-900">
                        PostgreSQL Database Record (Source of Truth)
                      </span>
                      <span className="rounded-full bg-emerald-600 px-2.5 py-0.5 font-bold text-white">
                        ✓ PO Match Found
                      </span>
                    </div>
                    <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-4">
                      <div><span className="text-slate-500">PO Number:</span> <strong className="text-purple-900 block font-bold">{selectedPurchaseOrder.poNumber}</strong></div>
                      <div><span className="text-slate-500">PO Date:</span> <strong className="text-slate-900 block font-semibold">{formatDate(selectedPurchaseOrder.poDate || selectedPurchaseOrder.createdAt)}</strong></div>
                      <div><span className="text-slate-500">Vendor:</span> <strong className="text-slate-900 block font-semibold">{selectedPurchaseOrder.vendorName || selectedPurchaseOrder.vendor}</strong></div>
                      <div><span className="text-slate-500">Vendor Code:</span> <strong className="text-slate-900 block font-semibold">{selectedPurchaseOrder.vendorCode || "N/A"}</strong></div>
                      <div><span className="text-slate-500">PO Amount:</span> <strong className="text-blue-700 block font-bold">{currency(selectedPurchaseOrder.taxSummary?.grandTotal || selectedPurchaseOrder.amount)}</strong></div>
                      <div><span className="text-slate-500">PO Items:</span> <strong className="text-slate-900 block font-semibold">{selectedPurchaseOrder.items?.length || 0} Line Items</strong></div>
                      <div><span className="text-slate-500">PO Status:</span> <span className="inline-flex rounded-full bg-emerald-100 px-2 py-0.5 font-bold text-emerald-800 text-[10px] uppercase">{selectedPurchaseOrder.status || "APPROVED"}</span></div>
                    </div>
                  </div>
                ) : ocrResultData?.extractedData && !selectedPurchaseOrder && !loadingPurchaseOrderDetails ? (
                  <div className="mt-4 rounded-xl border border-amber-300 bg-amber-50 p-4 text-xs space-y-3 shadow-sm">
                    <div className="flex items-center gap-2 text-amber-900 font-bold border-b border-amber-200 pb-2">
                      <span className="rounded-full bg-amber-500 text-white h-5 w-5 flex items-center justify-center font-extrabold text-xs">!</span>
                      Purchase Order {ocrResultData.extractedData.references?.poNumber ? `"${ocrResultData.extractedData.references.poNumber}"` : ""} was not found in the system.
                    </div>
                    <p className="text-amber-800 font-medium leading-relaxed">
                      The document text was extracted, but no matching Purchase Order record exists in PostgreSQL. Choose an action below:
                    </p>
                    <div className="flex flex-wrap items-center gap-2 pt-1">
                      <button
                        type="button"
                        onClick={() => {
                          purchaseOrderRef.current?.focus();
                          setDropdownOpen(true);
                        }}
                        className="rounded-lg bg-blue-600 px-3 py-2 font-semibold text-white hover:bg-blue-700 transition shadow-sm"
                      >
                        Search Existing PO
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setDropdownOpen(true);
                          dropdownRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
                        }}
                        className="rounded-lg border border-slate-300 bg-white px-3 py-2 font-semibold text-slate-800 hover:bg-slate-50 transition shadow-sm"
                      >
                        Select PO Manually
                      </button>
                      <button
                        type="button"
                        onClick={() => navigate("/purchase-orders/create")}
                        className="rounded-lg border border-purple-300 bg-purple-50 px-3 py-2 font-semibold text-purple-800 hover:bg-purple-100 transition shadow-sm"
                      >
                        Create PO First
                      </button>
                      <button
                        type="button"
                        onClick={() => setInvoiceFile(null)}
                        className="rounded-lg border border-red-200 bg-white px-3 py-2 font-semibold text-red-700 hover:bg-red-50 transition shadow-sm"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : null}


              </div>
              <div className="md:col-span-2">
                <label className="mb-2 block text-sm font-semibold text-slate-700 dark:text-slate-200">Remarks</label>
                <textarea ref={remarksRef} value={formData.remarks} onChange={(event) => setFormData((prev) => ({ ...prev, remarks: event.target.value }))} rows={4} className={`${input} h-auto py-3 ${errorsByField.remarks ? "border-red-400 focus:border-red-500 focus:ring-red-100 dark:border-red-800" : ""}`} />
                <ErrorText message={errorsByField.remarks} />
              </div>
            </div>
          </section>

          <section ref={itemsRef} tabIndex={-1} className="rounded-2xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 shadow-sm dark:shadow-slate-950/40 outline-none">
            <div className="mb-5 border-b border-slate-100 dark:border-slate-800 pb-4">
              <h2 className="text-base font-bold text-slate-950 dark:text-slate-100 font-heading">Invoice Items</h2>
            </div>
            <div className="space-y-4">
              {invoiceDraftItems.map((item, index) => (
                <article key={`${item.lineNumber || index}-${item.itemName || item.description}`} className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
                  <div className="flex flex-col gap-3 border-b border-slate-100 pb-4 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <p className="text-xs font-bold uppercase tracking-wide text-blue-600">Item {index + 1}</p>
                      <h3 className="mt-1 text-base font-bold text-slate-950">{item.itemName || "-"}</h3>
                      <p className="mt-1 text-sm text-slate-500">{item.description || "-"}</p>
                    </div>
                    <p className="text-lg font-bold text-blue-700 dark:text-blue-400">{currency(item.lineTotal)}</p>
                  </div>
                  <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                    <ItemInput label="Item Code" value={item.itemCode} onChange={(value) => handleItemChange(index, "itemCode", value)} />
                    <ItemInput label="Item Name" value={item.itemName} onChange={(value) => handleItemChange(index, "itemName", value)} />
                    <ItemInput label="Description" value={item.description} onChange={(value) => handleItemChange(index, "description", value)} />
                    <ItemInput label="Unit" value={item.unit} onChange={(value) => handleItemChange(index, "unit", value)} />
                    <ItemInput label="Quantity" type="number" value={item.quantity} onChange={(value) => handleItemChange(index, "quantity", value)} />
                    <ItemInput label="Unit Price" type="number" value={item.unitPrice} onChange={(value) => handleItemChange(index, "unitPrice", value)} />
                    <ItemInput label="Taxable Amount" type="number" value={item.taxableAmount} onChange={(value) => handleItemChange(index, "taxableAmount", value)} />
                    <ItemInput label="GST %" type="number" value={item.gstRate} onChange={(value) => handleItemChange(index, "gstRate", value)} />
                    <ItemInput label="CGST %" type="number" value={item.cgstRate} onChange={(value) => handleItemChange(index, "cgstRate", value)} />
                    <ItemInput label="SGST %" type="number" value={item.sgstRate} onChange={(value) => handleItemChange(index, "sgstRate", value)} />
                    <ItemInput label="IGST %" type="number" value={item.igstRate} onChange={(value) => handleItemChange(index, "igstRate", value)} />
                    <ItemInput label="CGST Amount" type="number" value={item.cgstAmount} onChange={(value) => handleItemChange(index, "cgstAmount", value)} />
                    <ItemInput label="SGST Amount" type="number" value={item.sgstAmount} onChange={(value) => handleItemChange(index, "sgstAmount", value)} />
                    <ItemInput label="IGST Amount" type="number" value={item.igstAmount} onChange={(value) => handleItemChange(index, "igstAmount", value)} />
                    <div>
                      <p className="mb-2 text-xs font-semibold uppercase text-slate-500">GST Amount</p>
                      <input value={currency(item.gstAmount)} disabled className={readOnly} />
                    </div>
                    <div>
                      <p className="mb-2 text-xs font-semibold uppercase text-slate-500">Line Total</p>
                      <input value={currency(item.lineTotal)} disabled className={readOnly} />
                    </div>
                  </div>
                </article>
              ))}
              {!invoiceDraftItems.length ? (
                <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 p-8 text-center text-sm text-slate-500">
                  Select a purchase order or run OCR extraction to load editable invoice items.
                </div>
              ) : null}
              <ErrorText message={errorsByField.items} />
            </div>
          </section>
        </div>

        <aside className="xl:sticky xl:top-6 xl:self-start">
          <section ref={gstRef} tabIndex={-1} className="rounded-2xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 shadow-sm dark:shadow-slate-950/40 outline-none">
            <div className="flex items-center gap-2">
              <FileText size={18} className="text-blue-600" />
              <h2 className="text-base font-bold text-slate-950 dark:text-slate-100 font-heading">Invoice Summary</h2>
            </div>
            <div className="mt-5 space-y-3 text-sm">
              <div className="flex justify-between"><span className="text-slate-500">Subtotal</span><strong>{currency(taxSummary.subtotal)}</strong></div>
              <div className="flex justify-between"><span className="text-slate-500">CGST</span><strong>{currency(taxSummary.cgstTotal)}</strong></div>
              <div className="flex justify-between"><span className="text-slate-500">SGST</span><strong>{currency(taxSummary.sgstTotal)}</strong></div>
              <div className="flex justify-between"><span className="text-slate-500">IGST</span><strong>{currency(taxSummary.igstTotal)}</strong></div>
              <div className="flex justify-between"><span className="text-slate-500">Total GST</span><strong>{currency(taxSummary.totalGst)}</strong></div>
              <div className="flex justify-between"><span className="text-slate-500">Round Off</span><strong>{currency(taxSummary.roundOff)}</strong></div>
              <div className="border-t border-slate-200 pt-4">
                <div className="flex justify-between text-lg">
                  <span className="font-bold text-slate-950">Grand Total</span>
                  <strong className="text-blue-700">{currency(taxSummary.grandTotal || selectedPurchaseOrder?.amount)}</strong>
                </div>
              </div>
            </div>
            <ErrorText message={errorsByField.gst} />
            <div className="mt-6 grid gap-3">
              <button type="submit" disabled={submitting || ocrProcessing || loadingPurchaseOrderDetails} className="rounded-lg bg-blue-600 py-3 text-center font-semibold text-white transition hover:bg-blue-700 disabled:opacity-60">
                {ocrProcessing ? "Processing Invoice..." : submitting ? "Creating..." : "Create Invoice"}
              </button>

              <button type="button" onClick={() => navigate("/invoices")} className="rounded-lg border border-slate-300 dark:border-slate-800 py-3 text-center font-semibold text-slate-700 dark:text-slate-200 transition hover:bg-slate-50 dark:hover:bg-slate-900">
                Cancel
              </button>
            </div>
          </section>
        </aside>
      </form>
    </div>
  );
};

const InvoiceCreateWithBoundary = (props) => (
  <InvoiceCreateErrorBoundary>
    <InvoiceCreate {...props} />
  </InvoiceCreateErrorBoundary>
);

export default InvoiceCreateWithBoundary;

