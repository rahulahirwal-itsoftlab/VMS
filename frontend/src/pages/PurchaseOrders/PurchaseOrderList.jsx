import { Download, Plus, Trash2, X, ShoppingCart, CheckCircle2, IndianRupee, ArrowRight, FileText } from "lucide-react";
import { Link } from "react-router-dom";
import { useEffect, useState, useCallback } from "react";
import { COMPANY_CONFIG } from "../../config/company";

import LoadingSpinner from "../../components/common/LoadingSpinner";
import ConfirmationModal from "../../components/common/ConfirmationModal";
import DataTable from "../../components/common/DataTable";
import EmptyState from "../../components/common/EmptyState";
import StatusBadge from "../../components/common/StatusBadge";
import ViewDetailsButton from "../../components/common/ViewDetailsButton";
import Pagination from "../../components/common/Pagination";
import { deletePurchaseOrder, getPurchaseOrders, downloadPurchaseOrderPdf } from "../../services/purchaseOrderServices";
import { getErrorMessage, notify } from "../../utils/feedback";
import { useAuth } from "../../context/AuthContext";
import { canDownloadDocument } from "../../config/permissions";
import { formatRoleLabel } from "../../utils/displayFormatters";

// Company constants loaded dynamically from COMPANY_CONFIG

const money = (value, cur = "INR") =>
  `${cur} ${Number(value || 0).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;

const esc = (v) =>
  String(v ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");

const fmtDate = (v) => {
  if (!v) return "N/A";
  const d = new Date(v);
  return Number.isNaN(d.getTime())
    ? "N/A"
    : d.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
};

// ─── Professional Purchase Order PDF ──────────────────────────────────────────
const buildPurchaseOrderHtml = (po, autoPrint = true) => {
  const summary = po.taxSummary || {};
  const items = po.items || [];

  const itemRows = items
    .map(
      (item, i) => `
    <tr>
      <td style="text-align:center">${i + 1}</td>
      <td>
        <strong>${esc(item.itemName || item.description || "Item")}</strong>
        ${item.description && item.itemName ? `<br/><span style="color:#64748b;font-size:10px">${esc(item.description)}</span>` : ""}
      </td>
      <td style="text-align:center">${esc(item.quantity || 0)}</td>
      <td class="num">${esc(money(item.unitPrice, po.currency))}</td>
      <td class="num">${esc(money(item.taxableAmount, po.currency))}</td>
      <td style="text-align:center">${esc(item.gstRate || 0)}%</td>
      <td class="num">${esc(money(item.cgstAmount || 0, po.currency))}</td>
      <td class="num">${esc(money(item.sgstAmount || 0, po.currency))}</td>
      <td class="num">${esc(money(item.igstAmount || 0, po.currency))}</td>
      <td class="num"><strong>${esc(money(item.lineTotal, po.currency))}</strong></td>
    </tr>`
    )
    .join("");

  return `<!doctype html>
<html>
  <head>
    <title>Purchase Order — ${esc(po.poNumber || "PO")}</title>
    <style>
      @page { size: A4 landscape; margin: 10mm 12mm; }
      * { box-sizing: border-box; }
      body { font-family: "Segoe UI", Arial, sans-serif; color: #0f172a; margin: 0; font-size: 11px; }
      .sheet { max-width: 1100px; margin: 0 auto; }
      .header { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 3px solid #1d4ed8; padding-bottom: 12px; margin-bottom: 14px; }
      .brand-row { display: flex; align-items: center; gap: 10px; }
      .logo { width: 48px; height: 48px; object-fit: contain; border-radius: 6px; border: 1px solid #e2e8f0; }
      .brand-name { font-size: 18px; font-weight: 800; color: #1d4ed8; }
      .brand-sub { font-size: 10px; color: #64748b; line-height: 1.6; margin-top: 2px; }
      .doc-title { text-align: right; }
      .doc-title h1 { margin: 0; font-size: 26px; font-weight: 900; color: #1d4ed8; }
      .doc-title .po-num { font-size: 12px; font-weight: 700; color: #334155; margin-top: 3px; }
      .info-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-bottom: 12px; }
      .info-grid.cols3 { grid-template-columns: 1fr 1fr 1fr; }
      .info-grid.cols4 { grid-template-columns: 1fr 1fr 1fr 1fr; }
      .box { border: 1px solid #cbd5e1; border-radius: 5px; padding: 6px 9px; }
      .box .lbl { color: #64748b; font-size: 9px; text-transform: uppercase; font-weight: 700; letter-spacing: 0.5px; }
      .box .val { margin-top: 2px; font-size: 11px; font-weight: 700; }
      h2 { margin: 12px 0 6px; font-size: 10px; text-transform: uppercase; color: #334155; border-bottom: 1px solid #e2e8f0; padding-bottom: 3px; letter-spacing: 1px; }
      table { width: 100%; border-collapse: collapse; font-size: 10px; }
      thead th { background: #1d4ed8; color: #fff; text-align: left; padding: 6px 5px; font-size: 9px; }
      thead th.num { text-align: right; }
      tbody td { padding: 6px 5px; border-bottom: 1px solid #f1f5f9; vertical-align: top; }
      .num { text-align: right; white-space: nowrap; }
      .summary-wrap { display: flex; justify-content: flex-end; margin-top: 10px; }
      .summary { width: 280px; border: 1px solid #e2e8f0; border-radius: 6px; overflow: hidden; }
      .sum-row { display: flex; justify-content: space-between; padding: 5px 10px; border-bottom: 1px solid #f1f5f9; font-size: 11px; }
      .sum-row.grand { background: #1d4ed8; color: #fff; font-size: 13px; font-weight: 800; border-bottom: none; }
      .sig-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-top: 24px; }
      .sig-box { border-top: 2px solid #0f172a; padding-top: 6px; }
      .sig-label { font-size: 9px; text-transform: uppercase; font-weight: 700; color: #64748b; }
      .sig-name { margin-top: 30px; font-weight: 700; font-size: 11px; }
      .tnc { border: 1px solid #e2e8f0; border-radius: 6px; padding: 8px 12px; margin-top: 12px; font-size: 9px; color: #64748b; }
      .tnc strong { color: #334155; }
      @media print { .no-print { display: none; } }
    </style>
  </head>
  <body>
    <main class="sheet">
      <!-- Header -->
      <section class="header">
        <div class="brand-row">
          ${COMPANY_CONFIG.logo ? `<img class="logo" src="${esc(COMPANY_CONFIG.logo)}" alt="logo" />` : ""}
          <div>
            <div class="brand-name">${esc(COMPANY_CONFIG.name)}</div>
            <div class="brand-sub">
              ${COMPANY_CONFIG.address ? esc(`${COMPANY_CONFIG.address}, ${COMPANY_CONFIG.city}, ${COMPANY_CONFIG.state}, ${COMPANY_CONFIG.country} - ${COMPANY_CONFIG.pinCode}`) + "<br/>" : ""}
              ${COMPANY_CONFIG.gstin ? "GST: " + esc(COMPANY_CONFIG.gstin) : ""}
              ${COMPANY_CONFIG.pan ? " | PAN: " + esc(COMPANY_CONFIG.pan) : ""}
              ${COMPANY_CONFIG.phone ? "<br/>Tel: " + esc(COMPANY_CONFIG.phone) : ""}
              ${COMPANY_CONFIG.email ? " | " + esc(COMPANY_CONFIG.email) : ""}
            </div>
          </div>
        </div>
        <div class="doc-title">
          <h1>PURCHASE ORDER</h1>
          <div class="po-num">${esc(po.poNumber || "N/A")}</div>
        </div>
      </section>

      <!-- PO Metadata -->
      <h2>Order Information</h2>
      <div class="info-grid cols4">
        <div class="box"><div class="lbl">PO Number</div><div class="val">${esc(po.poNumber)}</div></div>
        <div class="box"><div class="lbl">Order Date</div><div class="val">${fmtDate(po.orderDate)}</div></div>
        <div class="box"><div class="lbl">Expected Delivery</div><div class="val">${fmtDate(po.expectedDelivery)}</div></div>
        <div class="box"><div class="lbl">Payment Terms</div><div class="val">${esc(po.paymentTerms || "N/A")}</div></div>
        <div class="box"><div class="lbl">Payment Type</div><div class="val" style="font-weight:bold;color:#1d4ed8">${(po.paymentType || po.payment_type) === 'INSTALLMENT' ? 'Installment Payment' : 'One-Time Payment'}</div></div>
        <div class="box"><div class="lbl">Currency</div><div class="val">${esc(po.currency || "INR")}</div></div>
        <div class="box"><div class="lbl">Status</div><div class="val">${esc(po.status || "N/A")}</div></div>
        <div class="box"><div class="lbl">Created By</div><div class="val">${esc(po.createdBy || "N/A")}</div></div>
      </div>

      ${(po.paymentType || po.payment_type) === 'INSTALLMENT' && po.installments?.length ? `
      <h2>Installment Schedule (${po.installments.length} Months)</h2>
      <table style="width:100%;margin-bottom:16px;border-collapse:collapse;">
        <thead>
          <tr style="background-color:#1e293b;color:#ffffff;font-size:10px;text-transform:uppercase;">
            <th style="padding:6px;text-align:center;width:40px;">#</th>
            <th style="padding:6px;text-align:center;">Due Date</th>
            <th style="padding:6px;text-align:right;">Amount</th>
          </tr>
        </thead>
        <tbody>
          ${po.installments.map((inst, idx) => `
            <tr style="border-bottom:1px solid #e2e8f0;font-size:10px;${idx % 2 === 0 ? 'background-color:#f8fafc;' : ''}">
              <td style="padding:6px;text-align:center;font-weight:bold;color:#1d4ed8;">#${inst.installmentNumber || inst.installment_number || idx + 1}</td>
              <td style="padding:6px;text-align:center;">${fmtDate(inst.dueDate || inst.due_date)}</td>
              <td style="padding:6px;text-align:right;font-weight:bold;">${esc(money(inst.amount, po.currency))}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
      ` : ""}

      <!-- Vendor -->
      <h2>Vendor &amp; Delivery Details</h2>
      <div class="info-grid cols3">
        <div class="box"><div class="lbl">Vendor Name</div><div class="val">${esc(po.vendor || "N/A")}</div></div>
        <div class="box"><div class="lbl">Vendor Code</div><div class="val">${esc(po.vendorCode || "N/A")}</div></div>
        <div class="box"><div class="lbl">Vendor GST</div><div class="val">${esc(po.vendorGst || "N/A")}</div></div>
      </div>
      <div class="info-grid cols3">
        <div class="box"><div class="lbl">Vendor Address</div><div class="val">${esc(po.vendorAddress || "N/A")}</div></div>
        <div class="box"><div class="lbl">Delivery Address</div><div class="val">${esc(po.deliveryAddress || "N/A")}</div></div>
        <div class="box"><div class="lbl">Billing Address</div><div class="val">${esc(po.billingAddress || "N/A")}</div></div>
      </div>

      <!-- Items Table -->
      <h2>Line Items</h2>
      <table>
        <thead>
          <tr>
            <th style="width:28px">#</th>
            <th>Item / Description</th>
            <th style="width:60px;text-align:center">Qty</th>
            <th class="num" style="width:90px">Unit Price</th>
            <th class="num" style="width:90px">Taxable Amt</th>
            <th style="width:50px;text-align:center">GST%</th>
            <th class="num" style="width:70px">CGST</th>
            <th class="num" style="width:70px">SGST</th>
            <th class="num" style="width:70px">IGST</th>
            <th class="num" style="width:90px">Line Total</th>
          </tr>
        </thead>
        <tbody>
          ${itemRows || `<tr><td colspan="10" style="text-align:center;padding:14px;color:#64748b">No items available</td></tr>`}
        </tbody>
      </table>

      <!-- Tax Summary -->
      <div class="summary-wrap">
        <div class="summary">
          <div class="sum-row"><span>Subtotal (Taxable)</span><strong>${esc(money(summary.taxableAmount || summary.subtotal, po.currency))}</strong></div>
          <div class="sum-row"><span>CGST</span><strong>${esc(money(summary.cgstTotal, po.currency))}</strong></div>
          <div class="sum-row"><span>SGST</span><strong>${esc(money(summary.sgstTotal, po.currency))}</strong></div>
          <div class="sum-row"><span>IGST</span><strong>${esc(money(summary.igstTotal, po.currency))}</strong></div>
          ${Number(summary.otherCharges || 0) > 0 ? `<div class="sum-row"><span>Other Charges</span><strong>${esc(money(summary.otherCharges, po.currency))}</strong></div>` : ""}
          ${Number(summary.roundOff || 0) !== 0 ? `<div class="sum-row"><span>Round Off</span><strong>${esc(money(summary.roundOff, po.currency))}</strong></div>` : ""}
          <div class="sum-row grand"><span>GRAND TOTAL</span><strong>${esc(money(summary.grandTotal || po.amount, po.currency))}</strong></div>
        </div>
      </div>

      ${po.description ? `<h2>Description / Remarks</h2><div style="border:1px solid #e2e8f0;border-radius:5px;padding:8px 12px;font-size:10px;color:#475569">${esc(po.description)}</div>` : ""}

      <!-- Terms & Conditions -->
      <div class="tnc">
        <strong>Terms &amp; Conditions:</strong>
        1. Goods/services must be delivered by the expected delivery date.
        2. Invoice must quote this PO Number for payment processing.
        3. All prices are inclusive of taxes unless stated separately.
        4. Disputes subject to local jurisdiction.
        5. The vendor must comply with applicable GST regulations and provide a valid Tax Invoice.
      </div>

      <!-- Signatures -->
      <div class="sig-grid">
        <div class="sig-box">
          <div class="sig-label">Vendor Acceptance / Signature</div>
          <div class="sig-name">&nbsp;</div>
          <div style="font-size:9px;color:#64748b">Name, Date &amp; Stamp</div>
        </div>
        <div class="sig-box" style="text-align:right">
          <div class="sig-label">For ${esc(COMPANY_CONFIG.name)}</div>
          <div class="sig-name">&nbsp;</div>
          <div style="font-size:9px;color:#64748b">Authorized Signatory</div>
        </div>
      </div>
    </main>
    ${autoPrint ? "<script>window.onload = () => { window.focus(); window.print(); };</script>" : ""}
  </body>
</html>`;
};

const handleDownloadPO = async (po) => {
  try {
    await downloadPurchaseOrderPdf(po.id, `${po.poNumber || "PurchaseOrder"}.pdf`);
  } catch (err) {
    let msg = "Unable to generate PDF.";
    if (err?.response?.status === 403 || err?.status === 403) {
      msg = "Permission denied. You do not have permission to download this document.";
    } else if (err?.response?.status === 404 || err?.status === 404) {
      msg = "Document not found.";
    }
    notify.error(getErrorMessage(err, msg));
  }
};

const Detail = ({ label, value }) => (
  <div className="rounded-2xl border border-slate-200/80 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950/40 p-4">
    <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">{label}</p>
    <p className="mt-1 wrap-break-word text-sm font-bold text-slate-900 dark:text-slate-100">
      {value || <span className="rounded-full bg-amber-50 dark:bg-amber-950/50 px-2 py-1 text-xs text-amber-700 dark:text-amber-400">Not Available</span>}
    </p>
  </div>
);

const StatCard = ({ title, value, tone = "blue", icon: Icon, isActive = false, onClick }) => {
  const valueTitle = value === null || value === undefined ? "" : String(value);
  const wrappingStyle = { overflowWrap: "anywhere" };

  const tones = {
    blue: "text-blue-600 dark:text-blue-400 bg-blue-50/80 dark:bg-blue-950/50 border-blue-500/20",
    amber: "text-amber-600 dark:text-amber-400 bg-amber-50/80 dark:bg-amber-950/50 border-amber-500/20",
    green: "text-emerald-600 dark:text-emerald-400 bg-emerald-50/80 dark:bg-emerald-950/50 border-emerald-500/20",
    purple: "text-indigo-600 dark:text-indigo-400 bg-indigo-50/80 dark:bg-indigo-950/50 border-indigo-500/20",
    red: "text-red-600 dark:text-red-400 bg-red-50/80 dark:bg-red-950/50 border-red-500/20",
  };

  const activeBorders = {
    blue: "ring-2 ring-blue-500/80 border-blue-500 shadow-blue-500/10",
    amber: "ring-2 ring-amber-500/80 border-amber-500 shadow-amber-500/10",
    green: "ring-2 ring-emerald-500/80 border-emerald-500 shadow-emerald-500/10",
    purple: "ring-2 ring-indigo-500/80 border-indigo-500 shadow-indigo-500/10",
    red: "ring-2 ring-red-500/80 border-red-500 shadow-red-500/10",
  };

  return (
    <div
      onClick={onClick}
      role={onClick ? "button" : undefined}
      tabIndex={onClick ? 0 : undefined}
      className={`group relative cursor-pointer rounded-xl sm:rounded-2xl border bg-white dark:bg-slate-900 p-2.5 sm:p-3.5 md:p-4 min-h-24 flex flex-col justify-between shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md dark:shadow-slate-950/40 w-full min-w-0 ${isActive
        ? `${activeBorders[tone]} bg-slate-50/90 dark:bg-slate-800/90`
        : "border-slate-200/80 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700"
        }`}
    >
      <div className="flex items-center justify-between gap-1 sm:gap-2 min-w-0">
        <p className="min-w-0 break-words text-[10px] sm:text-xs md:text-sm font-semibold tracking-tight text-slate-500 dark:text-slate-400" title={title}>
          {title}
        </p>
        {Icon && (
          <div className={`rounded-lg p-1 sm:p-1.5 transition-transform duration-200 group-hover:scale-105 shrink-0 ${tones[tone]}`}>
            <Icon className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
          </div>
        )}
      </div>
      <div className="flex min-w-0 items-baseline justify-between">
        <p
          className={`inline-flex max-w-full break-words rounded-lg border px-2 py-0.5 sm:px-2.5 sm:py-0.5 text-[clamp(0.95rem,2vw,1.5rem)] font-black leading-tight font-heading tracking-tight tabular-nums ${tones[tone]}`}
          style={wrappingStyle}
          title={valueTitle}
        >
          {value}
        </p>
      </div>
    </div>
  );
};

const PurchaseOrderList = () => {
  const { user } = useAuth();
  const canDownload = canDownloadDocument(user);
  const [purchaseOrders, setPurchaseOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedPO, setSelectedPO] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleteReason, setDeleteReason] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [summaryMetrics, setSummaryMetrics] = useState({
    total: null,
    available: null,
    totalValue: null,
  });

  // ─── Server-side pagination state ──────────────────────────────────────────
  const PAGE_SIZE = 10;
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalItems, setTotalItems] = useState(0);

  const loadPOs = useCallback(async (page = 1) => {
    try {
      setLoading(true);
      const data = await getPurchaseOrders({ page, limit: PAGE_SIZE });
      setPurchaseOrders(data);
      setSummaryMetrics({
        total: Number(data.total ?? data.length ?? 0),
        available: Number(data.availableCount ?? data.filter((p) => p.status !== "Cancelled").length ?? 0),
        totalValue: Number(data.totalValue ?? data.reduce((sum, p) => sum + Number(p.amount || 0), 0)),
      });
      setTotalPages(Number(data.totalPages ?? 1));
      setTotalItems(Number(data.total ?? data.length ?? 0));
    } catch (error) {
      notify.error(getErrorMessage(error, "Purchase orders could not be loaded."));
      setSummaryMetrics({ total: 0, available: 0, totalValue: 0 });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadPOs(currentPage);
  }, [loadPOs, currentPage]);

  const handlePageChange = (newPage) => {
    if (newPage < 1 || newPage > totalPages || loading) return;
    setCurrentPage(newPage);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const columns = [
    {
      key: "poNumber",
      label: "PO Number",
      sortable: true,
      render: (value) => <span className="font-semibold text-blue-700">{value}</span>,
    },
    {
      key: "vendor",
      label: "Vendor",
      sortable: true,
      render: (value) => <span className="font-bold text-slate-900 dark:text-slate-100">{value}</span>,
    },
    {
      key: "amount",
      label: "Amount",
      sortable: true,
      render: (value, row) => <span className="font-semibold">{money(value, row.currency)}</span>,
    },
    { key: "itemCount", label: "Items", sortable: true },
    {
      key: "orderDate",
      label: "Order Date",
      sortable: true,
      render: (value) => (value ? new Date(value).toLocaleDateString("en-IN") : "-"),
    },
    {
      key: "status",
      label: "Status",
      sortable: true,
      render: (value) => <StatusBadge status={value} />,
    },
  ];


  const confirmDelete = async () => {
    if (!deleteReason.trim()) {
      notify.error("Delete reason is required.");
      return;
    }
    try {
      setDeleting(true);
      await deletePurchaseOrder(deleteTarget.id, deleteReason.trim());
      notify.success("Purchase Order deleted successfully.");
      setDeleteTarget(null);
      setDeleteReason("");
      // After delete, reload current page (or go to page 1 if this was the last item)
      await loadPOs(currentPage);
    } catch (error) {
      notify.error(getErrorMessage(error, "Purchase Order could not be deleted."));
    } finally {
      setDeleting(false);
    }
  };

  const exportCSV = () => {
    if (!purchaseOrders.length) return;
    const rows = purchaseOrders.map((po) => ({
      "PO Number": po.poNumber,
      Vendor: po.vendor,
      Amount: po.amount,
      Currency: po.currency,
      Status: po.status,
      "Order Date": po.orderDate,
    }));
    const csv = [
      Object.keys(rows[0]).join(","),
      ...rows.map((row) => Object.values(row).map((value) => `"${String(value ?? "").replaceAll('"', '""')}"`).join(",")),
    ].join("\n");
    const url = window.URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = "purchase-orders.csv";
    link.click();
    window.URL.revokeObjectURL(url);
  };

  if (loading) {
    return (
      <div className="flex h-96 items-center justify-center">
        <LoadingSpinner size="lg" text="Loading purchase orders..." />
      </div>
    );
  }

  return (
    <>
      <div className="space-y-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-extrabold tracking-tight text-slate-900 dark:text-slate-100 font-heading sm:text-3xl">Purchase Orders</h1>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400 sm:text-sm">Purchase orders are created by Case Managers and available immediately.</p>
          </div>
          <div className="flex flex-wrap items-center gap-2.5">
            <Link to="/purchase-orders/new" className="inline-flex cursor-pointer h-9 items-center justify-center gap-1.5 rounded-xl bg-[#0090B8] hover:bg-[#007799] px-3.5 text-xs sm:text-sm font-semibold text-white transition shadow-sm">
              <Plus size={15} />
              New Purchase Order
            </Link>
            <Link to="/receipt-documents" className="inline-flex cursor-pointer h-9 items-center justify-center gap-1.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-3.5 text-xs sm:text-sm font-semibold text-slate-700 dark:text-slate-200 shadow-2xs transition hover:border-[#0090B8] hover:bg-sky-50 dark:hover:bg-slate-800 hover:text-[#0090B8] dark:hover:text-[#00E5FF]">
              <FileText size={15} className="text-[#0090B8] dark:text-[#00E5FF]" />
              <span>Next: Receipt Documents</span>
              <ArrowRight size={15} />
            </Link>
          </div>
        </div>

        {/* KPI Cards - Aggregated from backend database */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4 w-full">
          <StatCard
            title="Total POs"
            value={loading || summaryMetrics.total === null ? "Loading..." : String(summaryMetrics.total)}
            tone="blue"
            icon={ShoppingCart}
          />
          <StatCard
            title="Available"
            value={loading || summaryMetrics.available === null ? "Loading..." : String(summaryMetrics.available)}
            tone="green"
            icon={CheckCircle2}
          />
          <StatCard
            title="Total Value"
            value={loading || summaryMetrics.totalValue === null ? "Loading..." : money(summaryMetrics.totalValue)}
            tone="purple"
            icon={IndianRupee}
          />
        </div>

        <section className="rounded-2xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 sm:p-6 shadow-sm dark:shadow-slate-950/40 space-y-4">
          {purchaseOrders.length ? (
            <>
              <DataTable
                columns={columns}
                data={purchaseOrders}
                searchableFields={["poNumber", "vendor", "description", "status"]}
                rowActions={(po) => (
                  <div className="flex items-center gap-1.5 whitespace-nowrap">
                    <Link to={`/purchase-orders/${po.id}`}>
                      <ViewDetailsButton label="View PO" size="sm" />
                    </Link>
                    {canDownload ? (
                      <button
                        type="button"
                        className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-blue-200 dark:border-blue-900 bg-blue-50 dark:bg-blue-950/50 px-2.5 text-xs font-semibold text-blue-700 dark:text-blue-300 transition hover:bg-blue-100 dark:hover:bg-blue-900 whitespace-nowrap"
                        onClick={() => handleDownloadPO(po)}
                      >
                        <Download size={14} /> PDF
                      </button>
                    ) : (
                      <span
                        className="inline-flex h-8 items-center px-2 text-[11px] font-semibold text-slate-400 dark:text-slate-500 whitespace-nowrap"
                        title="You do not have permission to download this document."
                      >
                        No download access
                      </span>
                    )}
                    <button
                      type="button"
                      className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-red-200 dark:border-red-900/60 bg-white dark:bg-slate-950 px-2.5 text-xs font-semibold text-red-700 dark:text-red-400 transition hover:bg-red-50 dark:hover:bg-red-950/30 whitespace-nowrap"
                      onClick={() => setDeleteTarget(po)}
                    >
                      <Trash2 size={14} /> Delete
                    </button>
                  </div>
                )}
                itemsPerPage={PAGE_SIZE * 10}
                isLoading={loading}
              />
              {/* ─── Server-side Pagination ──────────────────────────────── */}
              {totalPages > 1 && (
                <Pagination
                  currentPage={currentPage}
                  totalPages={totalPages}
                  totalItems={totalItems}
                  itemsPerPage={PAGE_SIZE}
                  onPageChange={handlePageChange}
                  isLoading={loading}
                  label="Purchase Orders"
                />
              )}
              {totalPages <= 1 && totalItems > 0 && (
                <p className="text-center text-xs text-slate-500 dark:text-slate-400 pt-1">
                  Showing all{" "}
                  <span className="font-semibold text-slate-700 dark:text-slate-300">{totalItems}</span>{" "}
                  Purchase Order{totalItems !== 1 ? "s" : ""}
                </p>
              )}
              <div className="flex justify-end pt-3 border-t border-slate-100 dark:border-slate-800">
                <button
                  type="button"
                  onClick={exportCSV}
                  className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white dark:bg-slate-900 dark:border-slate-800 px-4 py-2 text-sm font-semibold text-slate-700 dark:text-slate-200 transition hover:bg-slate-50 dark:hover:bg-slate-800 shadow-sm"
                >
                  <Download size={16} />
                  Export
                </button>
              </div>
            </>
          ) : (
            <EmptyState
              icon={Plus}
              title="No purchase orders"
              description="Create the first purchase order from an approved vendor."
              action={<Link to="/purchase-orders/new" className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-blue-700"><Plus size={16} />Create Purchase Order</Link>}
            />
          )}
        </section>
      </div>

      {selectedPO && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 dark:bg-slate-950/80 p-4">
          <section className="max-h-[90vh] w-full max-w-5xl overflow-y-auto rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xl">
            <div className="flex items-start justify-between border-b border-slate-200 dark:border-slate-800 px-6 py-5">
              <div>
                <h2 className="text-xl font-bold text-slate-950 dark:text-slate-100">Purchase Order Details</h2>
                <p className="mt-1 text-sm font-semibold text-blue-700 dark:text-blue-400">{selectedPO.poNumber}</p>
              </div>
              <div className="flex items-center gap-2">
                {canDownload ? (
                  <button
                    type="button"
                    onClick={() => handleDownloadPO(selectedPO)}
                    className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2 text-xs font-semibold text-white transition hover:bg-blue-700"
                  >
                    <Download size={15} /> Download PDF
                  </button>
                ) : (
                  <span className="rounded-xl bg-amber-50 dark:bg-amber-950/50 border border-amber-200 dark:border-amber-900 px-3 py-1.5 text-xs font-medium text-amber-700 dark:text-amber-400">
                    You do not have permission to download this document.
                  </span>
                )}
                <button
                  type="button"
                  onClick={() => setSelectedPO(null)}
                  className="rounded-xl border border-slate-200 dark:border-slate-800 p-2 text-slate-500 hover:bg-slate-50 dark:hover:bg-slate-800 hover:text-red-600 dark:hover:text-red-400"
                >
                  <X size={18} />
                </button>
              </div>
            </div>

            <div className="space-y-6 p-6">
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                <Detail label="PO Number" value={selectedPO.poNumber} />
                <Detail label="Vendor" value={selectedPO.vendor} />
                <Detail label="Status" value={selectedPO.status} />
                <Detail label="Amount" value={money(selectedPO.amount, selectedPO.currency)} />
                <Detail label="Order Date" value={selectedPO.orderDate ? new Date(selectedPO.orderDate).toLocaleDateString("en-IN") : "-"} />
                <Detail label="Expected Delivery" value={selectedPO.expectedDelivery ? new Date(selectedPO.expectedDelivery).toLocaleDateString("en-IN") : "-"} />
                <Detail label="Payment Terms" value={selectedPO.paymentTerms} />
                <Detail label="Created By" value={`${formatRoleLabel(selectedPO.createdByRole) || ""} ${selectedPO.createdBy || ""}`.trim()} />
              </div>

              <section>
                <h3 className="mb-3 text-base font-bold text-slate-950 dark:text-slate-100">Line Items</h3>
                <div className="grid gap-3">
                  {selectedPO.items?.length ? selectedPO.items.map((item, index) => (
                    <article key={`${item.itemName || item.description}-${index}`} className="rounded-2xl border border-slate-200/80 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950/40 p-4">
                      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                        <div>
                          <p className="font-bold text-slate-950 dark:text-slate-100">{item.itemName || item.description}</p>
                          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{item.description}</p>
                        </div>
                        <p className="font-bold text-blue-700 dark:text-blue-400">{money(item.lineTotal, selectedPO.currency)}</p>
                      </div>
                      <div className="mt-3 grid gap-3 text-sm sm:grid-cols-4">
                        <Detail label="Qty" value={item.quantity} />
                        <Detail label="Unit Price" value={money(item.unitPrice, selectedPO.currency)} />
                        <Detail label="Taxable Amount" value={money(item.taxableAmount, selectedPO.currency)} />
                        <Detail label="GST" value={money(item.gstAmount, selectedPO.currency)} />
                      </div>
                    </article>
                  )) : <p className="rounded-2xl border border-dashed border-slate-200 dark:border-slate-800 p-5 text-center text-slate-500 dark:text-slate-400">No line items available.</p>}
                </div>
              </section>
            </div>
          </section>
        </div>
      )}
      <ConfirmationModal
        open={Boolean(deleteTarget)}
        title="Delete Purchase Order?"
        description={deleteTarget ? `This will archive ${deleteTarget.poNumber}. The backend will block deletion if it is linked to a GRN, Invoice, Three-Way Matching, or Payment.` : ""}
        confirmLabel="Delete Purchase Order"
        cancelLabel="Cancel"
        variant="destructive"
        loading={deleting}
        onConfirm={confirmDelete}
        onCancel={() => {
          if (!deleting) {
            setDeleteTarget(null);
            setDeleteReason("");
          }
        }}
        ariaLabel="Delete purchase order confirmation"
      >
        <label className="mt-4 block text-sm font-semibold text-slate-700 dark:text-slate-200">
          Delete Reason
          <textarea
            value={deleteReason}
            onChange={(event) => setDeleteReason(event.target.value)}
            rows={3}
            className="mt-2 w-full rounded-xl border border-slate-300 dark:border-slate-800 bg-white dark:bg-slate-950 px-3 py-2 text-sm text-slate-900 dark:text-slate-100 outline-none focus:border-red-500 focus:ring-2 focus:ring-red-500/20"
            placeholder="Explain why this Purchase Order is being deleted"
            required
          />
        </label>
      </ConfirmationModal>
    </>
  );
};

export default PurchaseOrderList;
