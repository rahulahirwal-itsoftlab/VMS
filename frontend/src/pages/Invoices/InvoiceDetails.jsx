import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
  AlertCircle,
  ArrowLeft,
  Ban,
  CheckCircle,
  Clock,
  Download,
  FileText,
  MessageSquare,
  Paperclip,
  Printer,
  Trash2,
  XCircle,
  Building2,
  CreditCard,
  FileCheck,
  ShieldCheck,
} from "lucide-react";
import { toast } from "sonner";
import StatusBadge from "../../components/common/StatusBadge";
import { hasPermission, canDownloadDocument, PERMISSIONS, ROLES } from "../../config/permissions";
import { useAuth } from "../../context/AuthContext";
import { downloadHtmlAsPdf } from "../../utils/pdfGenerator";
import {
  addRemark,
  approveInvoice,
  cancelInvoice,
  getInvoiceById,
  rejectInvoice,
  softDeleteInvoice,
  downloadInvoicePdf,
  getCompanyInfo,
} from "../../services/invoiceService";
import { getMatchReportByInvoice } from "../../services/matchingService";
import { formatRoleLabel } from "../../utils/displayFormatters";
import api from "../../api/axios";

// ─── Utilities & Formatting Helpers ───────────────────────────────────────────

const formatINR = (value) => {
  const num = Number(value || 0);
  return `₹${num.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};

const formatDate = (value) => {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? null
    : date.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
};

const safeVal = (value, fallback = "Not Available") => {
  if (value === null || value === undefined || String(value).trim() === "" || String(value).trim() === "N/A") {
    return fallback;
  }
  return String(value);
};

const hasValue = (value) => value !== null && value !== undefined && String(value).trim() !== "" && String(value).trim() !== "N/A";
const firstValue = (...values) => values.find(hasValue);
const valueAt = (source, path) => {
  if (!source || !path) return undefined;
  return String(path).split(".").reduce((current, key) => current?.[key], source);
};
const resolveValue = (sources, paths) => {
  for (const path of paths) {
    for (const source of sources) {
      const value = valueAt(source, path);
      if (hasValue(value)) return value;
    }
  }
  return undefined;
};
const displayResolved = (sources, paths, formatter = (value) => value) => {
  const value = resolveValue(sources, paths);
  return hasValue(value) ? formatter(value) : "Not Available";
};
const displayAmount = (value) => hasValue(value) ? formatINR(value) : "Not Available";

const maskBankAccount = (accountNo) => {
  if (!accountNo || String(accountNo).trim() === "") return "Not Available";
  const str = String(accountNo).trim();
  if (str.length <= 4) return str;
  const visible = str.slice(-4);
  const maskedCount = Math.max(str.length - 4, 6);
  return "X".repeat(maskedCount) + visible;
};

// ─── Amount in Words (Indian Rupee Notation) ──────────────────────────────────

const ones = [
  "", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine",
  "Ten", "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen", "Seventeen", "Eighteen", "Nineteen"
];
const tens = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];

const convertHundreds = (n) => {
  if (n === 0) return "";
  if (n < 20) return ones[n] + " ";
  if (n < 100) return tens[Math.floor(n / 10)] + (n % 10 ? " " + ones[n % 10] : "") + " ";
  return ones[Math.floor(n / 100)] + " Hundred " + convertHundreds(n % 100);
};

const amountToWordsINR = (amount) => {
  const numVal = Number(amount || 0);
  if (isNaN(numVal) || numVal === 0) return "Rupees Zero Only";

  const rupees = Math.floor(Math.abs(numVal));
  const paise = Math.round((Math.abs(numVal) - rupees) * 100);

  let rupeeStr;
  if (rupees === 0) {
    rupeeStr = "Zero";
  } else {
    let parts = [];
    let n = rupees;
    if (n >= 10000000) { parts.push(convertHundreds(Math.floor(n / 10000000)).trim() + " Crore"); n %= 10000000; }
    if (n >= 100000)   { parts.push(convertHundreds(Math.floor(n / 100000)).trim() + " Lakh"); n %= 100000; }
    if (n >= 1000)     { parts.push(convertHundreds(Math.floor(n / 1000)).trim() + " Thousand"); n %= 1000; }
    if (n > 0)         { parts.push(convertHundreds(n).trim()); }
    rupeeStr = parts.join(" ").replace(/\s+/g, " ").trim();
  }

  let paiseStr = "";
  if (paise > 0) {
    paiseStr = " and " + convertHundreds(paise).trim() + " Paise";
  }

  return `Rupees ${rupeeStr}${paiseStr} Only`;
};

const totalFromItem = (item) =>
  Number(
    item.lineTotal ||
      item.amount ||
      Number(item.quantity || 0) * Number(item.unitPrice || item.rate || 0) ||
      0
  );

const itemAmount = (item, keys) => firstValue(...keys.map((key) => item?.[key]));
const itemMoney = (item, keys) => {
  const value = itemAmount(item, keys);
  return hasValue(value) ? formatINR(value) : "Not Available";
};

// ─── History event colours/labels ──────────────────────────────────────────────
const historyEventMeta = (action = "") => {
  const a = action.toLowerCase();
  if (a.includes("created")) return { color: "bg-blue-500", label: "Created" };
  if (a.includes("approved")) return { color: "bg-emerald-500", label: "Approved" };
  if (a.includes("rejected") || a.includes("reject")) return { color: "bg-red-500", label: "Rejected" };
  if (a.includes("cancelled") || a.includes("cancel")) return { color: "bg-amber-500", label: "Cancelled" };
  if (a.includes("deleted") || a.includes("delete")) return { color: "bg-slate-600", label: "Deleted" };
  if (a.includes("updated") || a.includes("update")) return { color: "bg-indigo-500", label: "Updated" };
  if (a.includes("remark") || a.includes("observation")) return { color: "bg-violet-500", label: "Remark" };
  if (a.includes("download")) return { color: "bg-teal-500", label: "Downloaded" };
  if (a.includes("match")) return { color: "bg-cyan-500", label: "Three-Way Match" };
  if (a.includes("admin")) return { color: "bg-orange-500", label: "Admin Review" };
  return { color: "bg-slate-400", label: action };
};

const escapeHtml = (value) =>
  String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");

// ─── Professional Invoice PDF HTML Builder ─────────────────────────────────────

const buildInvoiceHtml = ({ invoice, company, matchReports, autoPrint = false }) => {
  const summary = invoice.taxSummary || {};
  const cName = company?.name || "ACRE India Pvt Ltd";
  const cAddr = company?.address || "123 Corporate Blvd, Suite 400";
  const cCity = company?.city || "Mumbai";
  const cState = company?.state || "Maharashtra";
  const cPin = company?.pinCode || "400001";
  const cGst = company?.gstin || "27AAAAA1111A1Z1";
  const cPan = company?.pan || "AAAAA1111A";
  const cPhone = company?.phone || "+91-22-12345678";
  const cEmail = company?.email || "info@ACREprocurement.com";
  const cWeb = company?.website || "www.ACREprocurement.com";
  const cLogo = company?.logo || "";

  const grnNumber =
    invoice.grnNumber ||
    matchReports?.find((r) => r.grnNumber && r.grnNumber !== "N/A")?.grnNumber ||
    "Not Available";
  const deliveryChallanNumber =
    invoice.deliveryChallanNumber ||
    matchReports?.find((r) => r.deliveryChallanNumber && r.deliveryChallanNumber !== "N/A")
      ?.deliveryChallanNumber ||
    "Not Available";

  const rows = (invoice.items || [])
    .map(
      (item, index) => `
    <tr>
      <td style="text-align:center">${index + 1}</td>
      <td style="text-align:center">${escapeHtml(item.itemCode || item.code || "—")}</td>
      <td>
        <strong>${escapeHtml(item.itemName || item.description || "Item")}</strong>
        ${item.description && item.itemName ? `<br/><span style="color:#64748b;font-size:10px">${escapeHtml(item.description)}</span>` : ""}
      </td>
      <td class="num">${escapeHtml(item.quantity || 0)}</td>
      <td style="text-align:center">${escapeHtml(item.unit || "Nos")}</td>
      <td class="num">${escapeHtml(formatINR(item.unitPrice || item.rate))}</td>
      <td class="num">${escapeHtml(formatINR(item.taxableAmount))}</td>
      <td style="text-align:center">${escapeHtml(item.gstRate || item.gstPct || 18)}%</td>
      <td class="num">${escapeHtml(formatINR(item.gstAmount))}</td>
      <td class="num"><strong>${escapeHtml(formatINR(totalFromItem(item)))}</strong></td>
    </tr>
  `
    )
    .join("");

  const grandTotal = summary.grandTotal || invoice.invoiceTotal || invoice.amount || 0;
  const wordsText = amountToWordsINR(grandTotal);

  return `<!doctype html>
<html>
  <head>
    <title>${escapeHtml(invoice.invoiceNumber || "Invoice")}</title>
    <style>
      @page { size: A4; margin: 12mm; }
      * { box-sizing: border-box; }
      body { font-family: "Segoe UI", Arial, sans-serif; color: #0f172a; margin: 0; font-size: 11px; line-height: 1.4; }
      .sheet { max-width: 800px; margin: 0 auto; padding: 20px; background: #fff; border: 1px solid #cbd5e1; }
      .header { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2px solid #1e293b; padding-bottom: 12px; margin-bottom: 14px; }
      .brand { display: flex; align-items: center; gap: 12px; }
      .brand img { height: 48px; max-width: 140px; object-fit: contain; }
      .brand-title { font-size: 18px; font-weight: 800; color: #0f172a; letter-spacing: -0.5px; }
      .brand-sub { font-size: 10px; color: #475569; margin-top: 2px; }
      .doc-title { text-align: right; }
      .doc-title h1 { margin: 0; font-size: 24px; font-weight: 900; color: #1e3a8a; letter-spacing: -0.5px; }
      .doc-title .meta { font-size: 11px; font-weight: 700; color: #334155; margin-top: 4px; }

      .grid-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 14px; }
      .card { border: 1px solid #cbd5e1; border-radius: 6px; padding: 10px; background: #fafafa; }
      .card-title { font-size: 10px; font-weight: 800; text-transform: uppercase; color: #1e3a8a; letter-spacing: 0.5px; border-bottom: 1px solid #e2e8f0; padding-bottom: 4px; margin-bottom: 6px; }

      .kv-row { display: flex; justify-content: space-between; margin-bottom: 4px; font-size: 10.5px; }
      .kv-lbl { color: #64748b; font-weight: 600; }
      .kv-val { color: #0f172a; font-weight: 700; text-align: right; word-break: break-word; }

      .ref-bar { border: 1px solid #cbd5e1; background: #f8fafc; border-radius: 6px; padding: 8px 12px; margin-bottom: 14px; display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; }
      .ref-item .lbl { font-size: 9px; font-weight: 700; uppercase; color: #64748b; }
      .ref-item .val { font-size: 11px; font-weight: 700; color: #0f172a; margin-top: 2px; }

      table { width: 100%; border-collapse: collapse; margin-top: 8px; margin-bottom: 14px; font-size: 10.5px; }
      thead th { background: #1e293b; color: #fff; text-align: left; padding: 6px 8px; font-size: 10px; text-transform: uppercase; }
      thead th.num { text-align: right; }
      tbody td { padding: 6px 8px; border-bottom: 1px solid #e2e8f0; vertical-align: top; }
      tbody tr:nth-child(even) { background: #f8fafc; }
      .num { text-align: right; white-space: nowrap; }

      .sum-section { display: flex; justify-content: space-between; align-items: flex-start; gap: 16px; margin-bottom: 14px; }
      .words-box { flex: 1; border: 1px solid #cbd5e1; border-radius: 6px; padding: 10px; background: #f8fafc; font-size: 10.5px; }
      .sum-box { width: 280px; border: 1px solid #cbd5e1; border-radius: 6px; overflow: hidden; }
      .sum-row { display: flex; justify-content: space-between; padding: 5px 10px; border-bottom: 1px solid #f1f5f9; font-size: 10.5px; }
      .sum-row.grand { background: #1e293b; color: #fff; font-size: 12px; font-weight: 800; }

      .footer-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-top: 24px; border-top: 1px dashed #cbd5e1; padding-top: 14px; }
      .sig-box { border-top: 1.5px solid #0f172a; padding-top: 6px; text-align: center; margin-top: 32px; font-size: 10px; font-weight: 700; color: #475569; }
      .disclaimer { text-align: center; font-size: 9.5px; color: #94a3b8; margin-top: 16px; font-style: italic; }
    </style>
  </head>
  <body>
    <main class="sheet">
      <!-- Company Header -->
      <header class="header">
        <div class="brand">
          ${cLogo ? `<img src="${escapeHtml(cLogo)}" alt="Company Logo" />` : ""}
          <div>
            <div class="brand-title">${escapeHtml(cName)}</div>
            <div class="brand-sub">
              ${escapeHtml(cAddr)}, ${escapeHtml(cCity)}, ${escapeHtml(cState)} - ${escapeHtml(cPin)}<br/>
              <strong>GSTIN:</strong> ${escapeHtml(cGst)} | <strong>PAN:</strong> ${escapeHtml(cPan)}<br/>
              Tel: ${escapeHtml(cPhone)} | Email: ${escapeHtml(cEmail)} | Web: ${escapeHtml(cWeb)}
            </div>
          </div>
        </div>
        <div class="doc-title">
          <h1>TAX INVOICE</h1>
          <div class="meta">Invoice No: ${escapeHtml(invoice.invoiceNumber || "INV-2026-000001")}</div>
          <div style="font-size:10px;color:#64748b;margin-top:2px;">Date: ${escapeHtml(formatDate(invoice.invoiceDate) || "N/A")}</div>
          <div style="font-size:10px;color:#64748b;">Due Date: ${escapeHtml(formatDate(invoice.dueDate) || "N/A")}</div>
        </div>
      </header>

      <!-- Bill To & Vendor Section -->
      <section class="grid-2">
        <div class="card">
          <div class="card-title">Bill To</div>
          <div style="font-size:12px;font-weight:800;color:#0f172a;margin-bottom:4px;">${escapeHtml(cName)}</div>
          <div style="font-size:10.5px;color:#334155;line-height:1.5;">
            ${escapeHtml(cAddr)}<br/>
            ${escapeHtml(cCity)}, ${escapeHtml(cState)} - ${escapeHtml(cPin)}, India<br/>
            <strong>GSTIN:</strong> ${escapeHtml(cGst)}<br/>
            <strong>PAN:</strong> ${escapeHtml(cPan)}<br/>
            <strong>Contact:</strong> ${escapeHtml(cPhone)} | ${escapeHtml(cEmail)}
          </div>
        </div>
        <div class="card">
          <div class="card-title">Vendor / Supplier</div>
          <div style="font-size:12px;font-weight:800;color:#0f172a;margin-bottom:4px;">${escapeHtml(safeVal(invoice.vendor))}</div>
          <div class="kv-row"><span class="kv-lbl">Vendor Code:</span><span class="kv-val">${escapeHtml(safeVal(invoice.vendorCode))}</span></div>
          <div class="kv-row"><span class="kv-lbl">GSTIN:</span><span class="kv-val">${escapeHtml(safeVal(invoice.vendorGst || invoice.gstNumber))}</span></div>
          <div class="kv-row"><span class="kv-lbl">PAN:</span><span class="kv-val">${escapeHtml(safeVal(invoice.vendorPan))}</span></div>
          <div class="kv-row"><span class="kv-lbl">Category / Type:</span><span class="kv-val">${escapeHtml(safeVal(invoice.vendorCategory))} / ${escapeHtml(safeVal(invoice.vendorTaxType))}</span></div>
          <div class="kv-row"><span class="kv-lbl">Contact Person:</span><span class="kv-val">${escapeHtml(safeVal(invoice.vendorContactPerson || invoice.vendorContact))}</span></div>
          <div class="kv-row"><span class="kv-lbl">Phone / Email:</span><span class="kv-val">${escapeHtml(safeVal(invoice.vendorPhone))} | ${escapeHtml(safeVal(invoice.vendorEmail))}</span></div>
          <div class="kv-row"><span class="kv-lbl">Address:</span><span class="kv-val">${escapeHtml(safeVal(invoice.vendorAddress))}</span></div>
        </div>
      </section>

      <!-- Reference Details Bar -->
      <section class="ref-bar">
        <div class="ref-item"><div class="lbl">PO Number</div><div class="val">${escapeHtml(safeVal(invoice.poNumber))}</div></div>
        <div class="ref-item"><div class="lbl">PO Date</div><div class="val">${escapeHtml(formatDate(invoice.poDate) || "Not Available")}</div></div>
        <div class="ref-item"><div class="lbl">GRN Number</div><div class="val">${escapeHtml(safeVal(grnNumber))}</div></div>
        <div class="ref-item"><div class="lbl">Delivery Challan</div><div class="val">${escapeHtml(safeVal(deliveryChallanNumber))}</div></div>
      </section>

      <!-- Items Table -->
      <table>
        <thead>
          <tr>
            <th style="width:28px">#</th>
            <th style="width:70px">Item Code</th>
            <th>Item Name / Description</th>
            <th class="num" style="width:40px">Qty</th>
            <th style="width:40px;text-align:center">Unit</th>
            <th class="num" style="width:85px">Unit Price</th>
            <th class="num" style="width:90px">Taxable Amt</th>
            <th style="width:45px;text-align:center">GST %</th>
            <th class="num" style="width:80px">GST Amt</th>
            <th class="num" style="width:95px">Line Total</th>
          </tr>
        </thead>
        <tbody>
          ${rows || `<tr><td colspan="10" style="text-align:center;padding:12px;color:#64748b">No item details available</td></tr>`}
        </tbody>
      </table>

      <!-- Summary & Words Section -->
      <section class="sum-section">
        <div class="words-box">
          <strong style="color:#1e3a8a;font-size:10px;text-transform:uppercase;">Amount in Words:</strong><br/>
          <div style="font-size:11.5px;font-weight:700;color:#0f172a;margin-top:4px;">${escapeHtml(wordsText)}</div>
          
          <div style="margin-top:10px;border-top:1px solid #e2e8f0;padding-top:6px;">
            <strong style="color:#1e3a8a;font-size:10px;text-transform:uppercase;">Vendor Bank Information:</strong><br/>
            <div style="font-size:10px;color:#334155;margin-top:2px;">
              Bank: <strong>${escapeHtml(safeVal(invoice.vendorBankName))}</strong> | Branch: <strong>${escapeHtml(safeVal(invoice.vendorBankBranch))}</strong><br/>
              A/C Holder: <strong>${escapeHtml(safeVal(invoice.vendorAccountHolder))}</strong> | A/C No: <strong>${escapeHtml(maskBankAccount(invoice.vendorBankAccountNo))}</strong><br/>
              IFSC Code: <strong>${escapeHtml(safeVal(invoice.vendorIfscCode))}</strong>
            </div>
          </div>
        </div>

        <div class="sum-box">
          <div class="sum-row"><span>Subtotal (Taxable)</span><strong>${escapeHtml(formatINR(summary.subtotal))}</strong></div>
          <div class="sum-row"><span>CGST Total</span><strong>${escapeHtml(formatINR(summary.cgstTotal))}</strong></div>
          <div class="sum-row"><span>SGST Total</span><strong>${escapeHtml(formatINR(summary.sgstTotal))}</strong></div>
          <div class="sum-row"><span>IGST Total</span><strong>${escapeHtml(formatINR(summary.igstTotal))}</strong></div>
          ${Number(summary.otherCharges || 0) > 0 ? `<div class="sum-row"><span>Other Charges</span><strong>${escapeHtml(formatINR(summary.otherCharges))}</strong></div>` : ""}
          ${Number(summary.roundOff || 0) !== 0 ? `<div class="sum-row"><span>Round Off</span><strong>${escapeHtml(formatINR(summary.roundOff))}</strong></div>` : ""}
          <div class="sum-row grand">
            <span>TOTAL AMOUNT</span>
            <strong>${escapeHtml(formatINR(grandTotal))}</strong>
          </div>
        </div>
      </section>

      <!-- Terms & Signatures -->
      <section class="footer-grid">
        <div style="font-size:9.5px;color:#64748b;">
          <strong style="color:#334155;font-size:10px;">Terms and Conditions:</strong><br/>
          1. Payment terms: ${escapeHtml(safeVal(invoice.paymentTerms, "Net 30"))}.<br/>
          2. All disputes subject to local jurisdiction.<br/>
          3. Interest @ 18% p.a. will be charged on overdue payments.<br/>
        </div>
        <div class="sig-box">
          Authorized Signatory<br/>
          <span style="font-size:11px;font-weight:800;color:#0f172a;">For ${escapeHtml(cName)}</span>
        </div>
      </section>

      <div class="disclaimer">This is a system-generated invoice.</div>
    </main>
    ${autoPrint ? "<script>window.onload = () => { window.focus(); window.print(); };</script>" : ""}
  </body>
</html>`;
};

// ─── InvoiceDetails Component ─────────────────────────────────────────────────

const InvoiceDetails = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const canViewMatching = hasPermission(user, PERMISSIONS.VIEW_THREE_WAY_MATCHING);

  const [invoice, setInvoice] = useState(null);
  const [companyInfo, setCompanyInfo] = useState(null);
  const [matchReports, setMatchReports] = useState([]);
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeModal, setActiveModal] = useState(null);
  const [remarks, setRemarks] = useState("");

  const loadInvoiceData = useCallback(async () => {
    try {
      setLoading(true);
      const [data, comp] = await Promise.all([
        getInvoiceById(id),
        getCompanyInfo(),
      ]);
      setInvoice(data);
      if (comp) setCompanyInfo(comp);

      // Load matching reports in parallel
      if (canViewMatching) {
        getMatchReportByInvoice(id)
          .then((r) => setMatchReports(r))
          .catch(() => setMatchReports([]));
      }

      // Load document history
      api
        .get(`/v1/invoices/${id}/history`)
        .then((res) => setHistory(Array.isArray(res.data.data) ? res.data.data : []))
        .catch(() => setHistory([]));
    } catch (err) {
      console.error("Error loading invoice details:", err);
      toast.error("Failed to load invoice preview details");
    } finally {
      setLoading(false);
    }
  }, [canViewMatching, id]);

  useEffect(() => {
    loadInvoiceData();
  }, [loadInvoiceData]);

  const latestMatch = useMemo(() => matchReports[0] || invoice?.threeWayMatch || null, [matchReports, invoice?.threeWayMatch]);
  const grnNumber =
    latestMatch?.grnNumber && latestMatch.grnNumber !== "N/A"
      ? latestMatch.grnNumber
      : invoice?.grnNumber || "Not Available";
  const deliveryChallanNumber =
    latestMatch?.deliveryChallanNumber && latestMatch.deliveryChallanNumber !== "N/A"
      ? latestMatch.deliveryChallanNumber
      : invoice?.deliveryChallanNumber || "Not Available";

  const summary = invoice?.taxSummary || {};
  const grandTotal = summary.grandTotal || invoice?.invoiceTotal || invoice?.amount || 0;
  const wordsText = useMemo(() => amountToWordsINR(grandTotal), [grandTotal]);
  const ocrDraft = invoice?.ocrExtractedData?.invoiceDraft || {};
  const ocrStructured = invoice?.ocrExtractedData?.structuredData || {};
  const invoiceSources = [invoice, invoice?.purchaseOrder, invoice?.grn, invoice?.deliveryChallan, ocrDraft, ocrStructured, summary];
  const invoiceInfoRows = [
    ["Invoice Number", displayResolved(invoiceSources, ["invoiceNumber", "invoice_number", "header.invoiceNumber"])],
    ["Invoice Date", displayResolved(invoiceSources, ["invoiceDate", "invoice_date", "header.invoiceDate"], (value) => formatDate(value) || "Not Available")],
    ["Due Date", displayResolved(invoiceSources, ["dueDate", "due_date", "header.dueDate"], (value) => formatDate(value) || "Not Available")],
    ["PO Number", displayResolved(invoiceSources, ["poNumber", "po_number", "references.poNumber"])],
    ["GRN Number", safeVal(grnNumber)],
    ["Delivery Challan Number", safeVal(deliveryChallanNumber)],
    ["Currency", displayResolved(invoiceSources, ["currency", "header.currency"])],
    ["Payment Terms", displayResolved(invoiceSources, ["paymentTerms", "payment_terms", "header.paymentTerms", "terms.paymentTerms"])],
    ["Payment Type", (invoice?.paymentType || invoice?.poPaymentType || invoice?.purchaseOrder?.payment_type || invoice?.purchase_order?.payment_type) === 'INSTALLMENT' ? 'Installment Payment' : 'One-Time Payment'],
    ["Subtotal", displayAmount(firstValue(summary.subtotal, summary.taxableAmount, ocrDraft.totals?.subtotal, ocrStructured.totals?.subtotal))],
    ["Discount", displayAmount(firstValue(summary.discount, summary.totalDiscount, ocrDraft.totals?.totalDiscount, ocrStructured.totals?.totalDiscount))],
    ["Taxable Amount", displayAmount(firstValue(summary.taxableAmount, summary.taxable_amount, summary.subtotal, ocrDraft.totals?.taxableAmount, ocrStructured.totals?.taxableAmount))],
    ["CGST", displayAmount(firstValue(summary.cgstTotal, summary.cgst, ocrDraft.totals?.cgstTotal, ocrStructured.totals?.cgstTotal))],
    ["SGST", displayAmount(firstValue(summary.sgstTotal, summary.sgst, ocrDraft.totals?.sgstTotal, ocrStructured.totals?.sgstTotal))],
    ["IGST", displayAmount(firstValue(summary.igstTotal, summary.igst, ocrDraft.totals?.igstTotal, ocrStructured.totals?.igstTotal))],
    ["Total Tax", displayAmount(firstValue(summary.totalTax, summary.taxTotal, summary.totalGst, ocrDraft.totals?.totalTax, ocrStructured.totals?.totalTax))],
    ["Other Charges", displayAmount(firstValue(summary.otherCharges, ocrDraft.totals?.otherCharges, ocrStructured.totals?.otherCharges))],
    ["Round Off", displayAmount(firstValue(summary.roundOff, ocrDraft.totals?.roundOff, ocrStructured.totals?.roundOff))],
    ["Grand Total", displayAmount(firstValue(summary.grandTotal, invoice?.invoiceTotal, invoice?.amount, ocrDraft.totals?.grandTotal, ocrStructured.totals?.grandTotal))],
  ];
  const checkStatusClass = (status) => {
    const normalized = String(status || "PENDING").toUpperCase();
    if (normalized === "MATCHED") return "border-emerald-200 bg-emerald-50 text-emerald-800";
    if (normalized === "MISMATCH") return "border-rose-200 bg-rose-50 text-rose-800";
    if (normalized === "PARTIAL" || normalized === "PARTIAL_MATCH") return "border-amber-200 bg-amber-50 text-amber-800";
    if (normalized === "NOT_FOUND") return "border-amber-200 bg-amber-50 text-amber-800";
    return "border-slate-200 bg-slate-50 text-slate-700";
  };
  const matchingChecks = [
    ["Vendor Match", latestMatch?.checks?.vendorMatch, latestMatch?.vendorMatch],
    ["PO Match", latestMatch?.checks?.poMatch, latestMatch?.poMatch],
    ["GRN Match", latestMatch?.checks?.grnMatch, latestMatch?.grnMatch],
    ["Delivery Challan Match", latestMatch?.checks?.deliveryChallanMatch, latestMatch?.deliveryChallanMatch],
    ["Item Match", latestMatch?.checks?.itemMatch, latestMatch?.itemMatch],
    ["Quantity Match", latestMatch?.checks?.quantityMatch, latestMatch?.quantityMatch],
    ["Unit Price Match", latestMatch?.checks?.unitPriceMatch, latestMatch?.unitPriceMatch ?? latestMatch?.priceMatch],
    ["Tax Match", latestMatch?.checks?.taxMatch, latestMatch?.taxMatch],
    ["Total Match", latestMatch?.checks?.totalMatch, latestMatch?.totalMatch],
  ].map(([label, detail, booleanValue]) => ({
    label,
    detail,
    status: detail?.status || (booleanValue === true ? "MATCHED" : booleanValue === false ? "MISMATCH" : "PENDING"),
    reason: detail?.reason || "",
    expectedValue: firstValue(detail?.poValue, detail?.po_value, detail?.grnValue, detail?.grn_value, detail?.deliveryChallanValue, detail?.delivery_challan_value),
    actualValue: firstValue(detail?.invoiceValue, detail?.invoice_value),
    difference: detail?.difference,
  }));
  const overallMatchStatus = String(latestMatch?.overallStatus || latestMatch?.status || invoice?.threeWayMatchStatus || "PENDING").toUpperCase();
  const isOverallMatched = overallMatchStatus === "MATCHED";
  const isOverallPartial = overallMatchStatus === "PARTIAL" || overallMatchStatus === "PARTIAL_MATCH";

  const company = useMemo(() => ({
    name: companyInfo?.name || "ACRE India Pvt Ltd",
    logo: companyInfo?.logo || "",
    address: companyInfo?.address || "123 Corporate Blvd, Suite 400",
    city: companyInfo?.city || "Mumbai",
    state: companyInfo?.state || "Maharashtra",
    country: companyInfo?.country || "India",
    pinCode: companyInfo?.pinCode || "400001",
    phone: companyInfo?.phone || "+91-22-12345678",
    email: companyInfo?.email || "info@ACREprocurement.com",
    website: companyInfo?.website || "www.ACREprocurement.com",
    gstin: companyInfo?.gstin || "27AAAAA1111A1Z1",
    pan: companyInfo?.pan || "AAAAA1111A",
  }), [companyInfo]);

  const handleDownloadInvoice = async () => {
    if (!canDownload) {
      toast.error("Permission denied. You do not have permission to download this document.");
      return;
    }
    try {
      await downloadInvoicePdf(invoice.id, invoice.invoiceNumber || 'Invoice');
      toast.success("Invoice PDF downloaded successfully.");
    } catch (err) {
      let msg = "Unable to download PDF.";
      if (err?.response?.status === 403 || err?.status === 403) {
        msg = "Permission denied. You do not have permission to download this document.";
      } else if (err?.response?.status === 404 || err?.status === 404) {
        msg = "Document not found.";
      }
      toast.error(msg);
    }
  };


  const handlePrint = () => {
    window.print();
  };

  const handleAction = async () => {
    try {
      if (activeModal === "approve") {
        await approveInvoice(id, remarks);
        toast.success("Invoice approved successfully.");
      } else if (activeModal === "reject") {
        if (!remarks.trim()) { toast.error("Rejection reason is required"); return; }
        await rejectInvoice(id, remarks);
        toast.success("Invoice rejected successfully.");
      } else if (activeModal === "cancel") {
        await cancelInvoice(id, remarks);
        toast.success("Invoice cancelled successfully.");
      } else if (activeModal === "remark") {
        if (!remarks.trim()) { toast.error("Remark is required"); return; }
        await addRemark(id, remarks);
        toast.success("Observation remark added successfully.");
      } else if (activeModal === "delete") {
        if (!remarks.trim()) { toast.error("Delete reason is required"); return; }
        await softDeleteInvoice(id, remarks);
        toast.success("Invoice archived successfully");
        navigate("/invoices");
        return;
      }
      setActiveModal(null);
      setRemarks("");
      loadInvoiceData();
    } catch (err) {
      console.error(err);
      toast.error(err?.response?.data?.message || "Operation failed");
    }
  };

  if (loading)
    return (
      <div className="flex h-96 items-center justify-center text-slate-500 font-medium">
        Loading enterprise invoice preview...
      </div>
    );

  if (!invoice) {
    return (
      <div className="space-y-4 p-12 text-center">
        <h3 className="text-lg font-bold text-slate-700">Invoice Not Found</h3>
        <Link to="/invoices" className="text-blue-600 hover:underline font-semibold">
          Back to Invoice History
        </Link>
      </div>
    );
  }

  const canDownload = canDownloadDocument(user);
  const normalizedInvoiceStatus = (invoice.status || "").toUpperCase();
  const normalizedUserRole = (user?.role || "").toUpperCase();
  const isApprover = [ROLES.TEAM_LEAD, ROLES.MANAGER, ROLES.FINANCE_HEAD].includes(normalizedUserRole);
  const canApprove =
    isApprover &&
    invoice.currentApprovalLevel === normalizedUserRole &&
    normalizedInvoiceStatus.startsWith("PENDING_") &&
    normalizedInvoiceStatus !== "PENDING_THREE_WAY_MATCH" &&
    normalizedInvoiceStatus !== "PENDING_ADMIN_REVIEW";
  const canCancel =
    normalizedUserRole === ROLES.CASE_MANAGER &&
    invoice.createdById === user.id &&
    normalizedInvoiceStatus !== "APPROVED" &&
    normalizedInvoiceStatus !== "CANCELLED";
  const canDelete =
    [ROLES.SUPER_ADMIN, ROLES.CASE_MANAGER].includes(normalizedUserRole) &&
    (normalizedUserRole !== ROLES.CASE_MANAGER || invoice.createdById === user.id);
  const canAddRemark = normalizedUserRole === ROLES.SUPER_ADMIN;

  return (
    <div className="space-y-6 max-w-5xl mx-auto pb-4">
      {/* Printable CSS override */}
      <style dangerouslySetInnerHTML={{ __html: `
        @media print {
          body { background: #ffffff !important; color: #000000 !important; }
          .no-print { display: none !important; }
          .print-paper {
            border: none !important;
            box-shadow: none !important;
            padding: 0 !important;
            margin: 0 !important;
            width: 100% !important;
            max-width: 100% !important;
          }
        }
      ` }} />

      {/* ── TOP ACTION BAR (NO-PRINT) ────────────────────────────────────────── */}
      <div className="no-print flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between bg-white p-4 rounded-2xl border border-slate-200 shadow-sm">
        <Link
          to="/invoices"
          className="inline-flex items-center text-sm font-semibold text-slate-700 transition hover:text-slate-900"
        >
          <ArrowLeft size={18} className="mr-2" /> Back to Invoices
        </Link>

        <div className="flex flex-wrap items-center gap-2.5">
          <button
            type="button"
            onClick={handlePrint}
            className="inline-flex items-center gap-2 rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-800 hover:bg-slate-50 transition shadow-sm"
          >
            <Printer size={16} /> Print
          </button>

          {canDownload ? (
            <button
              type="button"
              onClick={handleDownloadInvoice}
              className="inline-flex items-center gap-2 rounded-xl border border-blue-200 bg-blue-50 px-4 py-2 text-sm font-semibold text-blue-700 hover:bg-blue-100 transition shadow-sm"
            >
              <Download size={16} /> Download PDF
            </button>
          ) : (
            <span className="inline-flex items-center rounded-xl bg-amber-50 border border-amber-200 px-3 py-1.5 text-xs font-semibold text-amber-700">
              No Download Perms
            </span>
          )}

          {canApprove && (
            <>
              <button
                type="button"
                onClick={() => setActiveModal("approve")}
                className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-emerald-700 shadow-sm"
              >
                <CheckCircle size={16} /> Approve
              </button>
              <button
                type="button"
                onClick={() => setActiveModal("reject")}
                className="inline-flex items-center gap-2 rounded-xl bg-rose-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-rose-700 shadow-sm"
              >
                <XCircle size={16} /> Reject
              </button>
            </>
          )}

          {canCancel && (
            <button
              type="button"
              onClick={() => setActiveModal("cancel")}
              className="inline-flex items-center gap-2 rounded-xl bg-amber-500 px-4 py-2 text-sm font-semibold text-white transition hover:bg-amber-600 shadow-sm"
            >
              <Ban size={16} /> Cancel
            </button>
          )}

          {canAddRemark && (
            <button
              type="button"
              onClick={() => setActiveModal("remark")}
              className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 shadow-sm"
            >
              <MessageSquare size={16} /> Add Remark
            </button>
          )}

          {canDelete && (
            <button
              type="button"
              onClick={() => setActiveModal("delete")}
              className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-rose-400 transition hover:bg-slate-800 shadow-sm"
            >
              <Trash2 size={16} /> Archive
            </button>
          )}
        </div>
      </div>

      {/* ── ENTERPRISE INVOICE PREVIEW PAPER ─────────────────────────────────── */}
      <article className="print-paper bg-white rounded-2xl border border-slate-300 shadow-xl p-8 sm:p-12 text-slate-900 font-sans space-y-8">
        
        {/* 1. Header & Company Master Info */}
        <header className="flex flex-col sm:flex-row sm:items-start justify-between border-b-2 border-slate-900 pb-6 gap-6">
          <div className="flex items-start gap-4">
            {company.logo ? (
              <img src={company.logo} alt="Company Logo" className="h-14 w-auto object-contain max-w-40 border border-slate-200 rounded-lg p-1" />
            ) : (
              <div className="h-12 w-12 rounded-xl bg-slate-900 flex items-center justify-center text-white font-black text-xl shrink-0 shadow-sm">
                A
              </div>
            )}
            <div>
              <h1 className="text-2xl font-black tracking-tight text-slate-900">{company.name}</h1>
              <p className="mt-1 text-xs text-slate-600 leading-relaxed">
                {company.address}, {company.city}, {company.state} - {company.pinCode}, {company.country}<br />
                <span className="font-semibold text-slate-700">GSTIN:</span> {company.gstin} | <span className="font-semibold text-slate-700">PAN:</span> {company.pan}<br />
                Phone: {company.phone} | Email: {company.email} | Web: {company.website}
              </p>
            </div>
          </div>

          <div className="text-left sm:text-right shrink-0">
            <span className="inline-block rounded-md bg-slate-900 px-3 py-1 text-xs font-black uppercase text-white tracking-wider">
              Tax Invoice
            </span>
            <div className="mt-3 text-lg font-extrabold text-blue-900">
              {safeVal(invoice.invoiceNumber, "INV-2026-000001")}
            </div>
            <div className="mt-1 text-xs text-slate-600">
              <span className="font-semibold text-slate-700">Invoice Date:</span> {formatDate(invoice.invoiceDate) || "Not Available"}
            </div>
            <div className="text-xs text-slate-600">
              <span className="font-semibold text-slate-700">Due Date:</span> {formatDate(invoice.dueDate) || "Not Available"}
            </div>
            <div className="mt-2">
              <StatusBadge status={invoice.status} />
            </div>
          </div>
        </header>

        {/* 2. Bill To & Vendor Cards (2-Column Grid) */}
        <section className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Bill To Card */}
          <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-5 space-y-2">
            <h2 className="text-xs font-black uppercase tracking-wider text-blue-900 border-b border-slate-200 pb-2 flex items-center gap-1.5">
              <Building2 size={14} /> Bill To
            </h2>
            <div className="text-sm font-bold text-slate-900">{company.name}</div>
            <div className="text-xs text-slate-600 leading-relaxed">
              {company.address}<br />
              {company.city}, {company.state} - {company.pinCode}, India<br />
              <span className="font-semibold text-slate-700">GSTIN:</span> {company.gstin}<br />
              <span className="font-semibold text-slate-700">PAN:</span> {company.pan}<br />
              <span className="font-semibold text-slate-700">Contact:</span> {company.phone} | {company.email}
            </div>
          </div>

          {/* Vendor/Supplier Card */}
          <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-5 space-y-2">
            <h2 className="text-xs font-black uppercase tracking-wider text-blue-900 border-b border-slate-200 pb-2 flex items-center gap-1.5">
              <ShieldCheck size={14} /> Vendor / Supplier
            </h2>
            <div className="text-sm font-bold text-slate-900">{safeVal(invoice.vendor)}</div>
            <div className="grid grid-cols-2 gap-x-2 gap-y-1 text-xs">
              <div><span className="text-slate-500 font-medium">Vendor Code:</span> <span className="font-bold text-slate-800">{safeVal(invoice.vendorCode)}</span></div>
              <div><span className="text-slate-500 font-medium">GSTIN:</span> <span className="font-bold text-slate-800">{safeVal(invoice.vendorGst || invoice.gstNumber)}</span></div>
              <div><span className="text-slate-500 font-medium">PAN:</span> <span className="font-bold text-slate-800">{safeVal(invoice.vendorPan)}</span></div>
              <div><span className="text-slate-500 font-medium">Category:</span> <span className="font-bold text-slate-800">{safeVal(invoice.vendorCategory)}</span></div>
              <div className="col-span-2"><span className="text-slate-500 font-medium">Contact Person:</span> <span className="font-bold text-slate-800">{safeVal(invoice.vendorContactPerson || invoice.vendorContact)}</span></div>
              <div className="col-span-2"><span className="text-slate-500 font-medium">Phone / Email:</span> <span className="font-bold text-slate-800">{safeVal(invoice.vendorPhone)} | {safeVal(invoice.vendorEmail)}</span></div>
              <div className="col-span-2"><span className="text-slate-500 font-medium">Address:</span> <span className="font-bold text-slate-800">{safeVal(invoice.vendorAddress)}</span></div>
            </div>
          </div>
        </section>

        {/* 3. Procurement References Bar (PO, GRN, Delivery Challan) */}
        <section className="rounded-2xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 grid grid-cols-2 sm:grid-cols-4 gap-4 text-xs shadow-sm dark:shadow-slate-950/40">
          <div>
            <div className="font-bold uppercase text-slate-500 dark:text-slate-400 text-[10px]">PO Number</div>
            <div className="font-black text-blue-700 dark:text-blue-400 text-sm mt-0.5">{safeVal(invoice.poNumber)}</div>
          </div>
          <div>
            <div className="font-bold uppercase text-slate-500 dark:text-slate-400 text-[10px]">PO Date</div>
            <div className="font-semibold text-slate-800 dark:text-slate-200 mt-0.5">{formatDate(invoice.poDate) || "Not Available"}</div>
          </div>
          <div>
            <div className="font-bold uppercase text-slate-500 dark:text-slate-400 text-[10px]">GRN Number</div>
            <div className="font-semibold text-blue-700 dark:text-blue-400 mt-0.5">{safeVal(grnNumber)}</div>
          </div>
          <div>
            <div className="font-bold uppercase text-slate-500 dark:text-slate-400 text-[10px]">Delivery Challan</div>
            <div className="font-semibold text-blue-700 dark:text-blue-400 mt-0.5">{safeVal(deliveryChallanNumber)}</div>
          </div>
        </section>

        {/* 3.1 Complete Invoice Information */}
        <section className="rounded-2xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 space-y-4 shadow-sm dark:shadow-slate-950/40">
          <div className="flex flex-col gap-1 border-b border-blue-100 pb-3 sm:flex-row sm:items-center sm:justify-between">
            <h2 className="text-xs font-black uppercase tracking-wider text-blue-950 flex items-center gap-1.5">
              <FileText size={15} /> Invoice Information
            </h2>
            <span className="text-[11px] font-semibold text-blue-700">
              {/*Values are resolved from invoice, PO/GRN/DC relations, and saved OCR data before falling back.*/}
            </span>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {invoiceInfoRows.map(([label, value]) => (
              <div key={label} className="rounded-lg border border-blue-100 bg-white px-3 py-2 text-xs">
                <div className="font-bold uppercase tracking-wide text-slate-500 text-[10px]">{label}</div>
                <div className="mt-0.5 font-bold text-slate-900">{safeVal(value)}</div>
              </div>
            ))}
          </div>
        </section>

        {/* 3.5 3-Way Match Verification Card */}
        {latestMatch || invoice.threeWayMatchStatus ? (
          <section className="space-y-3">
            {isOverallMatched ? (
              <div className="rounded-xl border border-emerald-200 bg-emerald-50/70 p-5 text-xs text-emerald-900">
                <div className="flex items-center justify-between border-b border-emerald-200 pb-2">
                  <span className="font-black uppercase tracking-wider flex items-center gap-1.5 text-emerald-900">
                    <CheckCircle size={16} className="text-emerald-600" /> 3-Way Match Verification: MATCHED
                  </span>
                  <span className="rounded-full bg-emerald-700 px-3 py-1 font-bold text-white text-[11px]">
                    100% Verified
                  </span>
                </div>
                <p className="mt-3 text-slate-700 leading-relaxed font-medium">
                  PO ({safeVal(invoice.poNumber)}), GRN ({safeVal(grnNumber)}), and Invoice ({safeVal(invoice.invoiceNumber)}) vendor, quantities, unit prices, taxes, and totals matched.
                </p>
                <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
                  {matchingChecks.map((check) => (
                    <div key={check.label} className={`rounded-lg border px-3 py-2 ${checkStatusClass(check.status)}`}>
                      <div className="text-[10px] font-black uppercase tracking-wide">{check.label}</div>
                      <div className="mt-0.5 text-xs font-black">{safeVal(check.status)}</div>
                      {hasValue(check.expectedValue) || hasValue(check.actualValue) || hasValue(check.difference) ? (
                        <div className="mt-2 space-y-0.5 text-[11px] font-medium opacity-90">
                          {hasValue(check.expectedValue) ? <div>Expected: <span className="font-bold">{safeVal(check.expectedValue)}</span></div> : null}
                          {hasValue(check.actualValue) ? <div>Actual: <span className="font-bold">{safeVal(check.actualValue)}</span></div> : null}
                          {hasValue(check.difference) ? <div>Difference: <span className="font-bold">{safeVal(check.difference)}</span></div> : null}
                        </div>
                      ) : null}
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className={`rounded-xl border p-5 text-xs ${isOverallPartial ? "border-amber-200 bg-amber-50/70 text-amber-950" : "border-rose-200 bg-rose-50/70 text-rose-950"}`}>
                <div className={`flex items-center justify-between border-b pb-2 ${isOverallPartial ? "border-amber-200" : "border-rose-200"}`}>
                  <span className={`font-black uppercase tracking-wider flex items-center gap-1.5 ${isOverallPartial ? "text-amber-900" : "text-rose-900"}`}>
                    <AlertCircle size={16} className={isOverallPartial ? "text-amber-600" : "text-rose-600"} /> 3-Way Matching Result: {isOverallPartial ? "PARTIAL" : "MISMATCH"}
                  </span>
                  <span className={`rounded-full px-3 py-1 font-bold text-white text-[11px] ${isOverallPartial ? "bg-amber-600" : "bg-rose-600"}`}>
                    {isOverallPartial ? "Review Required" : "Action Required"}
                  </span>
                </div>
                <p className="mt-3 text-slate-800 font-medium">
                  Automated payment approval is blocked because one or more document values need review against live PostgreSQL records. Below is the exact check breakdown:
                </p>
                <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
                  {matchingChecks.map((check) => (
                    <div key={check.label} className={`rounded-lg border px-3 py-2 ${checkStatusClass(check.status)}`}>
                      <div className="text-[10px] font-black uppercase tracking-wide">{check.label}</div>
                      <div className="mt-0.5 text-xs font-black">{safeVal(check.status)}</div>
                      {hasValue(check.expectedValue) || hasValue(check.actualValue) || hasValue(check.difference) ? (
                        <div className="mt-2 space-y-0.5 text-[11px] font-medium opacity-90">
                          {hasValue(check.expectedValue) ? <div>Expected: <span className="font-bold">{safeVal(check.expectedValue)}</span></div> : null}
                          {hasValue(check.actualValue) ? <div>Actual: <span className="font-bold">{safeVal(check.actualValue)}</span></div> : null}
                          {hasValue(check.difference) ? <div>Difference: <span className="font-bold">{safeVal(check.difference)}</span></div> : null}
                        </div>
                      ) : null}
                      {check.reason ? <div className="mt-1 text-[11px] font-medium opacity-90">{check.reason}</div> : null}
                    </div>
                  ))}
                </div>
                {latestMatch?.unmatchedFields?.length ? (
                  <div className="mt-3 overflow-x-auto rounded-lg border border-rose-200 bg-white p-3">
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className="border-b border-rose-100 text-[11px] font-bold text-slate-500 uppercase">
                          <th className="pb-2">Field</th>
                          <th className="pb-2">PO Record</th>
                          <th className="pb-2">GRN Record</th>
                          <th className="pb-2">Delivery Challan</th>
                          <th className="pb-2">Invoice Record</th>
                          <th className="pb-2 text-right">Status</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-rose-50 text-xs font-semibold text-slate-800">
                        {latestMatch.unmatchedFields.map((field, idx) => (
                          <tr key={idx}>
                            <td className="py-2 text-rose-900 font-bold">{field.label || field.field}</td>
                            <td className="py-2">{safeVal(field.po_value || field.poValue)}</td>
                            <td className="py-2">{safeVal(field.grn_value || field.grnValue)}</td>
                            <td className="py-2">{safeVal(field.delivery_challan_value || field.deliveryChallanValue)}</td>
                            <td className="py-2">{safeVal(field.invoice_value || field.invoiceValue)}</td>
                            <td className="py-2 text-right text-rose-600 font-bold">{safeVal(field.status || "MISMATCH")}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <p className="mt-2 text-rose-700 italic">Discrepancy detected in quantities or amounts between PO, GRN, and Invoice.</p>
                )}
              </div>
            )}
          </section>
        ) : null}

        {/* 4. Line Item Table */}
        <section className="space-y-3">
          <h2 className="text-xs font-black uppercase tracking-wider text-slate-700 flex items-center gap-1.5">
            <FileCheck size={15} /> Line Item Details
          </h2>
          <div className="overflow-x-auto rounded-xl border border-slate-200">
            <table className="w-full text-left text-xs border-collapse">
              <thead className="bg-slate-900 text-white font-bold uppercase tracking-wider text-[10px]">
                <tr>
                  <th className="p-3 text-center w-10">#</th>
                  <th className="p-3 w-24">Item Code</th>
                  <th className="p-3 w-36">Item Name</th>
                  <th className="p-3 min-w-48">Description</th>
                  <th className="p-3 text-center w-16">Qty</th>
                  <th className="p-3 text-center w-16">UOM</th>
                  <th className="p-3 text-right w-24">Unit Price</th>
                  <th className="p-3 text-right w-24">Discount</th>
                  <th className="p-3 text-right w-28">Taxable Amt</th>
                  <th className="p-3 text-right w-24">CGST</th>
                  <th className="p-3 text-right w-24">SGST</th>
                  <th className="p-3 text-right w-24">IGST</th>
                  <th className="p-3 text-right w-24">Tax</th>
                  <th className="p-3 text-right w-28">Line Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {invoice.items?.length ? (
                  invoice.items.map((item, index) => (
                    <tr key={`${item.itemName || item.description}-${index}`} className="hover:bg-slate-50/80 transition odd:bg-white even:bg-slate-50/40">
                      <td className="p-3 text-center font-medium text-slate-500">{index + 1}</td>
                      <td className="p-3 font-semibold text-slate-700">{safeVal(item.itemCode || item.code || item.sku, "—")}</td>
                      <td className="p-3 font-bold text-slate-900">{safeVal(item.itemName || item.name || item.description)}</td>
                      <td className="p-3 text-slate-700">{safeVal(item.description || item.itemName || item.name)}</td>
                      <td className="p-3 text-center font-semibold text-slate-800">{safeVal(item.quantity)}</td>
                      <td className="p-3 text-center text-slate-600">{safeVal(item.unit || item.uom, "—")}</td>
                      <td className="p-3 text-right font-medium text-slate-800">{itemMoney(item, ["unitPrice", "unit_price", "price", "rate"])}</td>
                      <td className="p-3 text-right text-slate-800">{itemMoney(item, ["discount", "discountAmount", "discount_amount"])}</td>
                      <td className="p-3 text-right font-semibold text-slate-900">{itemMoney(item, ["taxableAmount", "taxable_amount"])}</td>
                      <td className="p-3 text-right text-slate-800">{itemMoney(item, ["cgstAmount", "cgst_amount", "cgst"])}</td>
                      <td className="p-3 text-right text-slate-800">{itemMoney(item, ["sgstAmount", "sgst_amount", "sgst"])}</td>
                      <td className="p-3 text-right text-slate-800">{itemMoney(item, ["igstAmount", "igst_amount", "igst"])}</td>
                      <td className="p-3 text-right text-slate-800">{itemMoney(item, ["taxAmount", "tax_amount", "gstAmount", "gst_amount"])}</td>
                      <td className="p-3 text-right font-bold text-slate-950">{itemMoney(item, ["lineTotal", "line_total", "total", "amount"])}</td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={14} className="p-6 text-center text-slate-500 italic">
                      No line items recorded for this invoice.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>

        {/* 5. Summary & Amount in Words */}
        <section className="flex flex-col md:flex-row justify-between items-start gap-6 pt-2">
          {/* Amount in Words & Payment Info Box */}
          <div className="w-full md:flex-1 space-y-4">
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 space-y-1">
              <span className="text-[10px] font-black uppercase tracking-wider text-slate-500">Amount in Words</span>
              <p className="text-sm font-bold text-slate-950">{wordsText}</p>
            </div>

            {/* Vendor Bank Payment Info */}
            <div className="rounded-xl border border-slate-200 bg-white p-4 space-y-2 shadow-sm">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-800 flex items-center gap-1.5 border-b border-slate-100 pb-2">
                <CreditCard size={14} /> Vendor Payment Details
              </h3>
              <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs">
                <div><span className="text-slate-500">Bank Name:</span> <span className="font-semibold text-slate-900">{safeVal(invoice.vendorBankName)}</span></div>
                <div><span className="text-slate-500">Branch:</span> <span className="font-semibold text-slate-900">{safeVal(invoice.vendorBankBranch)}</span></div>
                <div><span className="text-slate-500">Account Holder:</span> <span className="font-semibold text-slate-900">{safeVal(invoice.vendorAccountHolder)}</span></div>
                <div><span className="text-slate-500">Account No:</span> <span className="font-mono font-bold text-slate-900">{maskBankAccount(invoice.vendorBankAccountNo)}</span></div>
                <div><span className="text-slate-500">IFSC Code:</span> <span className="font-mono font-semibold text-slate-900">{safeVal(invoice.vendorIfscCode)}</span></div>
                <div><span className="text-slate-500">Payment Terms:</span> <span className="font-semibold text-slate-900">{safeVal(invoice.paymentTerms, "Net 30")}</span></div>
              </div>
            </div>
          </div>

          {/* Tax Summary Box */}
          <div className="w-full md:w-80 rounded-xl border border-slate-200 overflow-hidden shadow-sm shrink-0">
            <div className="bg-slate-900 px-4 py-2 text-white font-bold text-xs uppercase tracking-wider">
              Financial Summary
            </div>
            <div className="p-4 space-y-2 text-xs bg-white">
              <div className="flex justify-between">
                <span className="text-slate-600">Subtotal (Taxable)</span>
                <span className="font-semibold text-slate-900">{formatINR(summary.subtotal)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-600">CGST Total</span>
                <span className="font-semibold text-slate-900">{formatINR(summary.cgstTotal)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-600">SGST Total</span>
                <span className="font-semibold text-slate-900">{formatINR(summary.sgstTotal)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-600">IGST Total</span>
                <span className="font-semibold text-slate-900">{formatINR(summary.igstTotal)}</span>
              </div>
              {Number(summary.otherCharges || 0) > 0 && (
                <div className="flex justify-between">
                  <span className="text-slate-600">Other Charges</span>
                  <span className="font-semibold text-slate-900">{formatINR(summary.otherCharges)}</span>
                </div>
              )}
              {Number(summary.roundOff || 0) !== 0 && (
                <div className="flex justify-between">
                  <span className="text-slate-600">Round Off</span>
                  <span className="font-semibold text-slate-900">{formatINR(summary.roundOff)}</span>
                </div>
              )}
              <div className="border-t-2 border-slate-900 pt-3 mt-2 flex justify-between items-center text-sm">
                <span className="font-black text-slate-950 uppercase">Total Amount</span>
                <span className="font-black text-blue-900 text-base">{formatINR(grandTotal)}</span>
              </div>
            </div>
          </div>
        </section>

        {/* 6. Terms, Remarks & Signatures Footer */}
        <footer className="pt-6 border-t border-slate-200 space-y-8">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 text-xs">
            <div className="space-y-1">
              <span className="font-bold text-slate-800 uppercase text-[10px]">Terms & Conditions</span>
              <p className="text-slate-600 leading-relaxed">
                1. Payment should be made within agreed payment terms ({safeVal(invoice.paymentTerms, "Net 30")}).<br />
                2. Interest @ 18% p.a. will be charged on payments delayed beyond due date.<br />
                3. All disputes subject to local jurisdiction.
              </p>
            </div>
            <div className="space-y-1">
              <span className="font-bold text-slate-800 uppercase text-[10px]">Remarks / Validation Notes</span>
              <p className="text-slate-700 italic bg-slate-50 p-2.5 rounded-lg border border-slate-200">
                {safeVal(invoice.description, "No custom remarks attached.")}
              </p>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row justify-between items-end gap-8 pt-8">
            <div className="border-t-2 border-slate-900 pt-2 w-48 text-center text-xs font-semibold text-slate-600">
              Buyer's / Receiver's Signature
            </div>
            <div className="border-t-2 border-slate-900 pt-2 w-56 text-center text-xs font-bold text-slate-900">
              Authorized Signatory<br />
              <span className="font-normal text-slate-600">For {company.name}</span>
            </div>
          </div>

          <div className="text-center text-[10px] text-slate-400 italic">
            This is a system-generated invoice document created via Vendor Management System (VMS).
          </div>
        </footer>
      </article>

      {/* ── NO-PRINT EXTRA SECTIONS (ATTACHMENTS & TIMELINE) ─────────────────── */}
      <div className="no-print space-y-6 pt-4">
        {/* Invoice Attachments */}
        {invoice.attachments?.length > 0 && (
          <section className="rounded-2xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 shadow-sm dark:shadow-slate-950/40">
            <h2 className="border-b border-slate-100 pb-3 text-base font-bold text-slate-950 flex items-center">
              <Paperclip size={18} className="mr-2 text-blue-600" />
              Attached Documents ({invoice.attachments.length})
            </h2>
            <div className="mt-5 space-y-3">
              {invoice.attachments.map((att) => (
                <div
                  key={att.id}
                  className="flex items-center justify-between rounded-xl border border-slate-200 bg-slate-50 px-4 py-3"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="shrink-0 rounded-lg bg-blue-100 p-2 text-blue-700">
                      <FileText size={18} />
                    </div>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-slate-900">
                        {att.original_file_name || att.stored_file_name}
                      </p>
                      <p className="text-xs text-slate-500">
                        {att.attachment_type || att.file_type} ·{" "}
                        {att.file_size
                          ? `${(Number(att.file_size) / 1024).toFixed(1)} KB`
                          : "Unknown size"}{" "}
                        ·{" "}
                        {att.uploaded_at
                          ? new Date(att.uploaded_at).toLocaleDateString("en-IN")
                          : "Date N/A"}
                      </p>
                    </div>
                  </div>
                  {att.file_url && (
                    <a
                      href={att.file_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 shadow-sm"
                    >
                      <Download size={13} /> View File
                    </a>
                  )}
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Document History Timeline */}
        <section className="rounded-2xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 shadow-sm dark:shadow-slate-950/40">
          <h2 className="border-b border-slate-100 pb-3 text-base font-bold text-slate-950 flex items-center">
            <Clock size={18} className="mr-2 text-blue-600" />
            Audit & Workflow History
          </h2>
          {history.length > 0 ? (
            <div className="mt-5 space-y-0">
              {history.map((entry, idx) => {
                const { color, label } = historyEventMeta(entry.action);
                const performedBy = entry.performed_by
                  ? `${entry.performed_by.first_name || ""} ${entry.performed_by.last_name || ""}`.trim() ||
                    entry.performed_by.email
                  : "System";
                const role = entry.performed_by?.role || "";
                const dateStr = entry.created_at
                  ? new Date(entry.created_at).toLocaleString("en-IN", {
                      day: "2-digit",
                      month: "short",
                      year: "numeric",
                      hour: "2-digit",
                      minute: "2-digit",
                    })
                  : "";
                return (
                  <div key={entry.id || idx} className="relative flex gap-4 pb-6">
                    {idx < history.length - 1 && (
                      <div className="absolute left-2.75 top-6 h-full w-0.5 bg-slate-200" />
                    )}
                    <div
                      className={`mt-1 h-6 w-6 shrink-0 rounded-full ${color} flex items-center justify-center shadow-sm`}
                    >
                      <div className="h-2 w-2 rounded-full bg-white" />
                    </div>
                    <div className="min-w-0 flex-1 rounded-xl border border-slate-100 bg-slate-50 p-3">
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div>
                          <span
                            className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-bold text-white ${color}`}
                          >
                            {label}
                          </span>
                          {entry.from_status && entry.to_status && (
                            <span className="ml-2 text-xs text-slate-500">
                              {entry.from_status} → {entry.to_status}
                            </span>
                          )}
                        </div>
                        <span className="text-xs text-slate-400">{dateStr}</span>
                      </div>
                      <p className="mt-1.5 text-sm font-semibold text-slate-800">
                        {performedBy}
                        {role && (
                          <span className="ml-2 rounded-md bg-slate-200 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-slate-600">
                            {formatRoleLabel(role)}
                          </span>
                        )}
                      </p>
                      {entry.remarks && (
                        <p className="mt-1 text-xs text-slate-600 italic">"{entry.remarks}"</p>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="mt-5 rounded-xl border border-dashed border-slate-200 p-6 text-center text-sm text-slate-500">
              No audit history recorded yet.
            </div>
          )}
        </section>
      </div>

      {/* ── ACTION MODAL (APPROVE / REJECT / CANCEL / ARCHIVE) ────────────────── */}
      {activeModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm no-print">
          <div className="w-125 max-w-full space-y-6 rounded-2xl bg-white p-6 shadow-2xl">
            <div>
              <h3 className="flex items-center gap-2 text-lg font-bold capitalize text-slate-900">
                {activeModal === "delete" ? "Confirm Archive Invoice" : `${activeModal} Invoice`}
              </h3>
              <p className="mt-2 text-sm text-slate-500">
                {activeModal === "delete"
                  ? "Archive this invoice with an auditable reason."
                  : "Confirm this workflow action with remarks where required."}
              </p>
            </div>
            <label className="block text-xs font-semibold uppercase text-slate-700">
              Remarks {["reject", "remark", "delete"].includes(activeModal) ? "*" : ""}
              <textarea
                value={remarks}
                onChange={(e) => setRemarks(e.target.value)}
                placeholder="Include confirmation remarks or reason details..."
                className="mt-2 h-24 w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm outline-none transition focus:border-blue-600"
                required={["reject", "remark", "delete"].includes(activeModal)}
              />
            </label>
            <div className="flex justify-end gap-3">
              <button
                type="button"
                onClick={() => { setActiveModal(null); setRemarks(""); }}
                className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleAction}
                className={`rounded-xl px-4 py-2 text-sm font-semibold capitalize text-white shadow-sm ${
                  activeModal === "reject" || activeModal === "delete"
                    ? "bg-rose-600 hover:bg-rose-700"
                    : activeModal === "cancel"
                    ? "bg-amber-500 hover:bg-amber-600"
                    : "bg-emerald-600 hover:bg-emerald-700"
                }`}
              >
                Confirm {activeModal}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default InvoiceDetails;
export { InvoiceDetails };
