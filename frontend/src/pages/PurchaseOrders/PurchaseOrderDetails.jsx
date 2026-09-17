import { useEffect, useState, useMemo } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, Download, Trash2, Edit3, Printer, Eye } from "lucide-react";

import { useAuth } from "../../context/AuthContext";
import { canDownloadDocument } from "../../config/permissions";
import {
  getPurchaseOrderById,
  deletePurchaseOrder,
  downloadPurchaseOrderPdf,
  openPurchaseOrderPdfInNewTab,
} from "../../services/purchaseOrderServices";
import { COMPANY_CONFIG } from "../../config/company";
import { getErrorMessage, notify } from "../../utils/feedback";
import ConfirmationModal from "../../components/common/ConfirmationModal";
import StatusBadge from "../../components/common/StatusBadge";

// ─── Amount in Words Conversion Utilities ──────────────────────────────────
const numberToWordsINR = (num) => {
  const a = [
    "", "One ", "Two ", "Three ", "Four ", "Five ", "Six ", "Seven ", "Eight ", "Nine ", "Ten ",
    "Eleven ", "Twelve ", "Thirteen ", "Fourteen ", "Fifteen ", "Sixteen ", "Seventeen ", "Eighteen ", "Nineteen "
  ];
  const b = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];

  const numToWords = (n, suffix) => {
    let str = "";
    if (n > 19) {
      str += b[Math.floor(n / 10)] + " " + a[n % 10];
    } else if (n > 0) {
      str += a[n];
    }
    if (n) {
      str += suffix;
    }
    return str;
  };

  let res = "";
  res += numToWords(Math.floor(num / 10000000), "Crore ");
  res += numToWords(Math.floor((num / 100000) % 100), "Lakh ");
  res += numToWords(Math.floor((num / 1000) % 100), "Thousand ");
  res += numToWords(Math.floor((num / 100) % 10), "Hundred ");

  if (num > 100 && num % 100) {
    res += "and ";
  }
  res += numToWords(num % 100, "");

  return res.trim();
};

const numberToWordsUSD = (num) => {
  const a = [
    "", "One ", "Two ", "Three ", "Four ", "Five ", "Six ", "Seven ", "Eight ", "Nine ", "Ten ",
    "Eleven ", "Twelve ", "Thirteen ", "Fourteen ", "Fifteen ", "Sixteen ", "Seventeen ", "Eighteen ", "Nineteen "
  ];
  const b = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];

  const numToWords = (n, suffix) => {
    let str = "";
    if (n > 99) {
      str += a[Math.floor(n / 100)] + "Hundred " + (n % 100 ? "and " : "");
      n %= 100;
    }
    if (n > 19) {
      str += b[Math.floor(n / 10)] + " " + a[n % 10];
    } else if (n > 0) {
      str += a[n];
    }
    if (n || str) {
      str += suffix;
    }
    return str;
  };

  let res = "";
  res += numToWords(Math.floor(num / 1000000), "Million ");
  res += numToWords(Math.floor((num / 1000) % 1000), "Thousand ");
  res += numToWords(num % 1000, "");

  return res.trim();
};

const amountToWords = (amount, currency = "INR") => {
  const amt = Number(amount || 0);
  if (amt <= 0) return "Zero Amount Only";

  const whole = Math.floor(amt);

  let currencyName = "Rupees";
  let wordsFunc = numberToWordsINR;

  if (currency === "USD") {
    currencyName = "Dollars";
    wordsFunc = numberToWordsUSD;
  } else if (currency === "EUR") {
    currencyName = "Euros";
    wordsFunc = numberToWordsUSD;
  }

  const words = wordsFunc(whole);
  return `${words} ${currencyName} Only`;
};

const money = (val, cur = "INR") =>
  `${cur} ${Number(val || 0).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;

const fmtDate = (d) => (d ? new Date(d).toLocaleDateString("en-IN") : "—");
const displayVal = (v) => v || "—";

const PurchaseOrderDetails = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const canDownload = canDownloadDocument(user);

  const [po, setPo] = useState(null);
  const [loading, setLoading] = useState(true);
  const [downloading, setDownloading] = useState(false);

  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleteReason, setDeleteReason] = useState("");
  const [deleting, setDeleting] = useState(false);

  const [isPreviewMode, setIsPreviewMode] = useState(false);

  useEffect(() => {
    const fetchPO = async () => {
      try {
        setLoading(true);
        const data = await getPurchaseOrderById(id);
        setPo(data);
      } catch (err) {
        notify.error(getErrorMessage(err, "Purchase Order could not be loaded."));
      } finally {
        setLoading(false);
      }
    };
    fetchPO();
  }, [id]);

  const canEdit = useMemo(() => {
    if (!po || !user) return false;
    const editableStatuses = ["CREATED", "DRAFT", "PENDING"];
    const isOwner = po.createdById === user.id;
    const isAdmin = ["SUPER_ADMIN", "CASE_MANAGER"].includes(user.role);
    return editableStatuses.includes((po.status || "").toUpperCase()) && (isOwner || isAdmin);
  }, [po, user]);

  const canDelete = useMemo(() => {
    if (!po || !user) return false;
    const deletableStatuses = ["CREATED", "DRAFT", "PENDING"];
    const isOwner = po.createdById === user.id;
    const isAdmin = ["SUPER_ADMIN", "CASE_MANAGER"].includes(user.role);
    return deletableStatuses.includes((po.status || "").toUpperCase()) && (isOwner || isAdmin);
  }, [po, user]);

  const handleDownload = async () => {
    if (!canDownload) {
      notify.error("You do not have permission to download PO documents.");
      return;
    }
    try {
      setDownloading(true);
      await downloadPurchaseOrderPdf(id, po.poNumber);
      notify.success("Purchase Order PDF downloaded.");
    } catch (err) {
      notify.error(getErrorMessage(err, "PDF generation failed."));
    } finally {
      setDownloading(false);
    }
  };

  const handlePrint = async () => {
    try {
      await openPurchaseOrderPdfInNewTab(id);
    } catch (err) {
      notify.error(getErrorMessage(err, "Unable to open PDF preview."));
    }
  };

  const confirmDelete = async () => {
    if (!deleteReason.trim()) {
      notify.error("Delete reason is required.");
      return;
    }
    try {
      setDeleting(true);
      await deletePurchaseOrder(id, deleteReason.trim());
      notify.success("Purchase Order deleted.");
      navigate("/purchase-orders");
    } catch (err) {
      notify.error(getErrorMessage(err, "Delete operation failed."));
    } finally {
      setDeleting(false);
    }
  };

  const procurementRefs = useMemo(() => {
    if (!po) return [];
    return [
      { label: "Purchase Requisition", value: po.purchaseRequisitionNumber },
      { label: "Department", value: po.department },
      { label: "Cost Center", value: po.costCenter },
      { label: "Requester", value: po.requester },
      { label: "Buyer", value: po.buyer },
      { label: "Quotation Date", value: po.quotationDate ? fmtDate(po.quotationDate) : null },
    ].filter((item) => Boolean(item.value));
  }, [po]);

  if (loading) {
    return (
      <div className="flex h-96 items-center justify-center text-slate-500 dark:text-slate-400">
        <div className="flex flex-col items-center gap-3">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-blue-600 border-t-transparent"></div>
          <p className="font-semibold text-sm">Loading Purchase Order details...</p>
        </div>
      </div>
    );
  }

  if (!po) {
    return (
      <div className="mx-auto max-w-xl my-12 rounded-2xl border border-red-200 dark:border-red-900/50 bg-red-50/50 dark:bg-red-950/20 p-8 text-center space-y-4">
        <h2 className="text-lg font-bold text-red-700 dark:text-red-400">Unable to load purchase order details.</h2>
        <p className="text-xs text-slate-600 dark:text-slate-400">The requested purchase order could not be retrieved or may have been deleted.</p>
        <div className="flex justify-center gap-3 pt-2">
          <button
            type="button"
            onClick={() => {
              setLoading(true);
              getPurchaseOrderById(id)
                .then(setPo)
                .catch((err) => notify.error(getErrorMessage(err, "Purchase Order could not be loaded.")))
                .finally(() => setLoading(false));
            }}
            className="px-4 py-2 bg-[#0090B8] hover:bg-[#007799] text-white rounded-xl text-xs font-bold transition shadow-sm cursor-pointer"
          >
            Try Again
          </button>
          <Link
            to="/purchase-orders"
            className="px-4 py-2 border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 rounded-xl text-xs font-bold transition shadow-sm"
          >
            Back to Purchase Orders
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-12 print:pb-0">
      {/* SECTION 10: ACTION HEADER BAR (Hidden in print mode) */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between border-b border-slate-200 dark:border-slate-800 pb-5 no-print">
        <div className="flex items-center gap-3">
          <Link to="/purchase-orders" className="inline-flex items-center gap-2 rounded-xl border border-slate-200 dark:border-slate-800 p-2.5 bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 shadow-sm transition hover:bg-slate-50 dark:hover:bg-slate-800 text-xs font-semibold">
            <ArrowLeft size={16} />
            <span>Back to Purchase Orders</span>
          </Link>
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-xl font-black text-slate-900 dark:text-slate-100">{po.poNumber}</h1>
              <StatusBadge status={po.status} />
            </div>
            <p className="text-[11px] text-slate-500 dark:text-slate-400">
              Created on {fmtDate(po.createdAt)} · Creator: <span className="font-semibold text-slate-700 dark:text-slate-300">{po.createdBy}</span>
            </p>
          </div>
        </div>
        <div className="flex flex-row flex-nowrap items-center gap-1.5 sm:gap-2 self-end sm:self-auto overflow-x-visible">
          {/* View PO / Preview PO Toggle */}
          <button
            type="button"
            title={isPreviewMode ? "Standard View" : "Document Preview"}
            onClick={() => setIsPreviewMode(!isPreviewMode)}
            className={`inline-flex items-center gap-1.5 rounded-xl border px-3 py-2 sm:px-3.5 sm:py-2 text-xs font-bold shadow-sm transition duration-150 shrink-0 ${isPreviewMode
                ? "bg-slate-900 border-slate-900 dark:bg-slate-100 dark:border-slate-100 text-white dark:text-slate-900 hover:bg-slate-800 dark:hover:bg-slate-200"
                : "bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800"
              }`}
          >
            <Eye size={14} className="shrink-0" />
            <span className="hidden md:inline">
              {isPreviewMode ? "Standard View" : "Document Preview"}
            </span>
          </button>

          {canEdit && (
            <Link
              to={`/purchase-orders/${po.id}/edit`}
              title="Edit PO"
              className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-3 py-2 sm:px-3.5 sm:py-2 text-xs font-bold text-slate-700 dark:text-slate-200 shadow-sm transition hover:bg-slate-50 dark:hover:bg-slate-800 shrink-0"
            >
              <Edit3 size={14} className="shrink-0" />
              <span className="hidden md:inline">Edit PO</span>
            </Link>
          )}

          {canDownload && (
            <button
              type="button"
              title="Download PDF"
              onClick={handleDownload}
              disabled={downloading}
              className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-3 py-2 sm:px-3.5 sm:py-2 text-xs font-bold text-slate-700 dark:text-slate-200 shadow-sm transition hover:bg-slate-50 dark:hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60 shrink-0"
            >
              {downloading ? (
                <>
                  <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-slate-400 border-t-slate-700 shrink-0" />
                  <span className="hidden md:inline">Generating...</span>
                </>
              ) : (
                <>
                  <Download size={14} className="shrink-0" />
                  <span className="hidden md:inline">Download PDF</span>
                </>
              )}
            </button>
          )}

          <button
            type="button"
            title="Open & Print PDF"
            onClick={handlePrint}
            className="inline-flex items-center gap-1.5 rounded-xl bg-slate-900 dark:bg-slate-100 px-3 py-2 sm:px-4 sm:py-2 text-xs font-bold text-white dark:text-slate-900 shadow-sm transition hover:bg-slate-800 dark:hover:bg-slate-200 shrink-0"
          >
            <Printer size={14} className="shrink-0" />
            <span className="hidden md:inline">Open &amp; Print PDF</span>
          </button>

          {canDelete && (
            <button
              type="button"
              title="Delete PO"
              className="inline-flex items-center gap-1.5 rounded-xl border border-red-200 dark:border-red-900/60 bg-white dark:bg-slate-900 px-3 py-2 sm:px-3.5 sm:py-2 text-xs font-bold text-red-600 dark:text-red-400 shadow-sm transition hover:bg-red-50 dark:hover:bg-red-950/30 shrink-0"
              onClick={() => setDeleteTarget(po)}
            >
              <Trash2 size={14} className="shrink-0" />
              <span className="hidden md:inline">Delete PO</span>
            </button>
          )}
        </div>
      </div>

      {/* DOCUMENT CANVAS SHEET */}
      <div className={`mx-auto bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 print:border-none shadow-xl dark:shadow-slate-950/50 print:shadow-none transition-all duration-200 ${isPreviewMode
          ? "max-w-4xl p-8 sm:p-12 md:p-16 border-t-4 border-t-slate-900 dark:border-t-slate-100"
          : "max-w-6xl p-6 sm:p-8 md:p-10 rounded-2xl"
        }`}>
        <article className="space-y-8 print:space-y-6">

          {/* SECTION 1: COMPANY HEADER */}
          <header className="flex flex-col gap-6 md:flex-row md:items-start md:justify-between border-b-2 border-slate-900 dark:border-slate-700 pb-6 print:pb-4">
            <div className="space-y-3">
              <div className="flex items-center gap-3">
                {COMPANY_CONFIG.logo && (
                  <img className="h-10 w-10 rounded-lg object-contain border border-slate-100 dark:border-slate-800 print:h-8 print:w-8" src={COMPANY_CONFIG.logo} alt="Company Logo" />
                )}
                <h1 className="text-xl font-black text-slate-900 dark:text-slate-100 tracking-tight">{COMPANY_CONFIG.name}</h1>
              </div>
              <div className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed max-w-md">
                <p>{COMPANY_CONFIG.address}</p>
                <p>{COMPANY_CONFIG.city}, {COMPANY_CONFIG.state}, {COMPANY_CONFIG.country} - {COMPANY_CONFIG.pinCode}</p>
                <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-[10px] text-slate-400 dark:text-slate-500">
                  <span>Tel: {COMPANY_CONFIG.phone}</span>
                  <span>Email: {COMPANY_CONFIG.email}</span>
                  <span>Web: {COMPANY_CONFIG.website}</span>
                </div>
              </div>
            </div>
            <div className="text-left md:text-right space-y-1 self-start md:self-auto">
              <div className="text-[10px] font-extrabold uppercase tracking-widest text-slate-400 dark:text-slate-500">TAX INVOICE / DOCUMENT</div>
              <div className="text-2xl font-black tracking-tight text-slate-900 dark:text-slate-100">PURCHASE ORDER</div>
              <div className="mt-1.5 inline-flex items-center gap-2 border border-slate-200 dark:border-slate-800 rounded-md bg-slate-50 dark:bg-slate-950 px-2.5 py-1 text-xs font-bold text-slate-800 dark:text-slate-200">
                <span>GSTIN:</span> <span className="font-extrabold">{COMPANY_CONFIG.gstin}</span>
              </div>
              <div className="ml-2 inline-flex items-center gap-1.5 border border-slate-200 dark:border-slate-800 rounded-md bg-slate-50 dark:bg-slate-950 px-2.5 py-1 text-xs font-bold text-slate-800 dark:text-slate-200">
                <span>PAN:</span> <span className="font-extrabold">{COMPANY_CONFIG.pan}</span>
              </div>
            </div>
          </header>

          {/* SECTION 2: PO INFORMATION (Shipment Left / PO Details Right) */}
          <section className="grid gap-6 md:grid-cols-2 border-b border-slate-200 dark:border-slate-800 pb-6 print:pb-4">
            {/* Shipment Address Block */}
            <div className="space-y-3">
              <h3 className="text-xs font-black uppercase tracking-wider text-slate-400 dark:text-slate-500 border-b border-slate-100 dark:border-slate-800 pb-1.5">
                Shipment / Delivery Address
              </h3>
              <div className="text-xs text-slate-700 dark:text-slate-300 space-y-1">
                <p className="font-black text-slate-800 dark:text-slate-100">Corporate Delivery Hub</p>
                <p className="font-semibold">{po.deliveryAddress || "Not Available"}</p>
                <div className="pt-2 text-[11px] font-medium text-slate-500 dark:text-slate-400">
                  <p><strong>Billing Address:</strong> {po.billingAddress || "Not Available"}</p>
                </div>
              </div>
            </div>

            {/* PO Information Block */}
            <div className="space-y-3">
              <h3 className="text-xs font-black uppercase tracking-wider text-slate-400 dark:text-slate-500 border-b border-slate-100 dark:border-slate-800 pb-1.5">
                Purchase Order Details
              </h3>
              <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs">
                <div><span className="text-slate-400 dark:text-slate-500 font-semibold">PO Number:</span></div>
                <div><strong className="text-slate-900 dark:text-slate-100 font-bold">{po.poNumber}</strong></div>

                <div><span className="text-slate-400 dark:text-slate-500 font-semibold">PO Date:</span></div>
                <div><strong className="text-slate-800 dark:text-slate-200">{fmtDate(po.orderDate) || "Not Available"}</strong></div>

                <div><span className="text-slate-400 dark:text-slate-500 font-semibold">PO Type:</span></div>
                <div><strong className="text-slate-800 dark:text-slate-200 uppercase">{po.poType || "STANDARD"}</strong></div>

                <div><span className="text-slate-400 dark:text-slate-500 font-semibold">PO Status:</span></div>
                <div><strong className="text-slate-800 dark:text-slate-200 capitalize">{po.status}</strong></div>

                <div><span className="text-slate-400 dark:text-slate-500 font-semibold">Currency:</span></div>
                <div><strong className="text-slate-800 dark:text-slate-200">{po.currency || "INR"}</strong></div>

                <div><span className="text-slate-400 dark:text-slate-500 font-semibold">Payment Terms:</span></div>
                <div><strong className="text-slate-800 dark:text-slate-200">{po.paymentTerms || "Not Available"}</strong></div>

                <div><span className="text-slate-400 dark:text-slate-500 font-semibold">Expected Delivery:</span></div>
                <div><strong className="text-slate-800 dark:text-slate-200">{fmtDate(po.expectedDelivery) || "Not Available"}</strong></div>
              </div>
            </div>
          </section>

          {/* SECTION 3: VENDOR ADDRESS */}
          <section className="space-y-3 border-b border-slate-200 dark:border-slate-800 pb-6 print:pb-4">
            <h3 className="text-xs font-black uppercase tracking-wider text-slate-400 dark:text-slate-500 border-b border-slate-100 dark:border-slate-800 pb-1.5">
              Vendor / Supplier
            </h3>
            <div className="grid gap-6 md:grid-cols-2 text-xs leading-relaxed text-slate-700 dark:text-slate-300">
              {/* Address details */}
              <div className="space-y-1">
                <p className="text-sm font-black text-slate-900 dark:text-slate-100">{po.vendorName || po.vendor || "Not Available"}</p>
                <p className="text-xs font-bold text-blue-600 dark:text-blue-400">{po.vendorCode || "—"}</p>
                <p className="font-semibold text-slate-600 dark:text-slate-400 mt-1.5">{po.vendorAddress || "Not Available"}</p>
              </div>

              {/* Compliance & Contact */}
              <div className="grid grid-cols-2 gap-x-4 gap-y-1.5">
                <div><span className="text-slate-400 dark:text-slate-500 font-semibold">Contact Person:</span></div>
                <div><strong className="text-slate-800 dark:text-slate-200">{displayVal(po.vendorContactPerson)}</strong></div>

                <div><span className="text-slate-400 dark:text-slate-500 font-semibold">Phone:</span></div>
                <div><strong className="text-slate-800 dark:text-slate-200">{displayVal(po.vendorPhone)}</strong></div>

                <div><span className="text-slate-400 dark:text-slate-500 font-semibold">Email:</span></div>
                <div><strong className="text-slate-800 dark:text-slate-200 break-all">{displayVal(po.vendorEmail)}</strong></div>

                <div><span className="text-slate-400 dark:text-slate-500 font-semibold">GSTIN:</span></div>
                <div><strong className="text-slate-900 dark:text-slate-100 font-bold">{displayVal(po.vendorGst || po.gstNumber)}</strong></div>

                <div><span className="text-slate-400 dark:text-slate-500 font-semibold">PAN:</span></div>
                <div><strong className="text-slate-900 dark:text-slate-100 font-bold">{displayVal(po.vendorPan)}</strong></div>

                <div><span className="text-slate-400 dark:text-slate-500 font-semibold">Registration Type:</span></div>
                <div><strong className="text-slate-800 dark:text-slate-200 uppercase">{displayVal(po.vendorTaxType)}</strong></div>
              </div>
            </div>
          </section>

          {/* SECTION 4: PROCUREMENT REFERENCES (Only non-empty) */}
          {procurementRefs.length > 0 && (
            <section className="space-y-3 border-b border-slate-200 dark:border-slate-800 pb-6 print:pb-4">
              <h3 className="text-xs font-black uppercase tracking-wider text-slate-400 dark:text-slate-500 border-b border-slate-100 dark:border-slate-800 pb-1.5">
                Procurement References
              </h3>
              <div className="grid gap-4 grid-cols-2 sm:grid-cols-3 md:grid-cols-4 text-xs">
                {procurementRefs.map((ref, idx) => (
                  <div key={idx} className="space-y-0.5">
                    <span className="text-slate-400 dark:text-slate-500 font-semibold">{ref.label}:</span>
                    <p className="font-bold text-slate-800 dark:text-slate-200 break-words">{ref.value}</p>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* SECTION 4B: LINKED PROCUREMENT DOCUMENTS (GRN & Delivery Challan) */}
          <section className="space-y-3 border-b border-slate-200 dark:border-slate-800 pb-6 print:pb-4">
            <h3 className="text-xs font-black uppercase tracking-wider text-slate-400 dark:text-slate-500 border-b border-slate-100 dark:border-slate-800 pb-1.5">
              Procurement Documents (GRN &amp; Delivery Challan)
            </h3>
            <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 text-xs">
              <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-950/40 p-4 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-slate-800 dark:text-slate-200">Delivery Challans</span>
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-blue-100 dark:bg-blue-950 text-blue-700 dark:text-blue-300">
                    {po.deliveryChallans?.length || 0} Linked
                  </span>
                </div>
                {po.deliveryChallans?.length ? (
                  <div className="space-y-1.5 pt-1">
                    {po.deliveryChallans.map((dc) => (
                      <div key={dc.id} className="flex items-center justify-between text-xs border-b border-slate-100 dark:border-slate-800 pb-1">
                        <span className="font-bold text-[#0090B8] dark:text-[#00E5FF]">{dc.deliveryChallanNumber}</span>
                        <span className="text-[11px] text-slate-500">{fmtDate(dc.deliveryDate)}</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-[11px] text-slate-400 italic">No delivery challans created yet.</p>
                )}
              </div>

              <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-950/40 p-4 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-slate-800 dark:text-slate-200">Goods Receipt Notes (GRN)</span>
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300">
                    {po.grns?.length || 0} Linked
                  </span>
                </div>
                {po.grns?.length ? (
                  <div className="space-y-1.5 pt-1">
                    {po.grns.map((grn) => (
                      <div key={grn.id} className="flex items-center justify-between text-xs border-b border-slate-100 dark:border-slate-800 pb-1">
                        <span className="font-bold text-emerald-600 dark:text-emerald-400">{grn.grnNumber}</span>
                        <span className="text-[11px] text-slate-500">{fmtDate(grn.receivedDate)}</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-[11px] text-slate-400 italic">No GRNs created yet.</p>
                )}
              </div>
            </div>
          </section>

          {/* SECTION 5: ITEM DETAILS TABLE */}
          <section className="space-y-3 print:pt-4">
            <h3 className="text-xs font-black uppercase tracking-wider text-slate-400 dark:text-slate-500 border-b border-slate-100 dark:border-slate-800 pb-1.5">
              Line Items
            </h3>
            <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-800 print:border-slate-300">
              <table className="w-full text-left border-collapse text-[11px] print:text-[10px]">
                <thead>
                  <tr className="bg-slate-900 dark:bg-slate-800 text-white text-[10px] uppercase tracking-wider font-bold">
                    <th className="py-2.5 px-2 text-center w-8">Sl</th>
                    <th className="py-2.5 px-2 text-center w-24">Item Code</th>
                    <th className="py-2.5 px-3 min-w-[150px]">Item Description</th>
                    <th className="py-2.5 px-2 text-center w-12">Unit</th>
                    <th className="py-2.5 px-2 text-center w-12">Qty</th>
                    <th className="py-2.5 px-3 text-right w-24">Unit Price</th>
                    <th className="py-2.5 px-3 text-right w-24">Taxable Amt</th>
                    <th className="py-2.5 px-2 text-center w-12">GST%</th>
                    <th className="py-2.5 px-3 text-right w-20">CGST</th>
                    <th className="py-2.5 px-3 text-right w-20">SGST</th>
                    <th className="py-2.5 px-3 text-right w-20">IGST</th>
                    <th className="py-2.5 px-3 text-right w-28">Total</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60 bg-white dark:bg-slate-900">
                  {po.items?.length ? (
                    po.items.map((item, index) => (
                      <tr key={index} className="border-b border-slate-200 dark:border-slate-800 print:border-slate-300 hover:bg-slate-50/50 dark:hover:bg-slate-800/40">
                        <td className="py-3 px-2 text-center text-slate-400 font-medium">{index + 1}</td>
                        <td className="py-3 px-2 text-center font-bold text-blue-600 dark:text-blue-400">{item.itemCode || "—"}</td>
                        <td className="py-3 px-3">
                          <div className="font-bold text-slate-800 dark:text-slate-100">{item.itemName || "Item"}</div>
                          {item.description && (
                            <div className="text-[10px] text-slate-400 dark:text-slate-500 mt-0.5 whitespace-pre-wrap">{item.description}</div>
                          )}
                        </td>
                        <td className="py-3 px-2 text-center font-semibold text-slate-600 dark:text-slate-400">{item.unit || "—"}</td>
                        <td className="py-3 px-2 text-center font-bold text-slate-800 dark:text-slate-200">{item.quantity}</td>
                        <td className="py-3 px-3 text-right text-slate-700 dark:text-slate-300">{money(item.unitPrice, po.currency)}</td>
                        <td className="py-3 px-3 text-right font-semibold text-slate-800 dark:text-slate-200">{money(item.taxableAmount, po.currency)}</td>
                        <td className="py-3 px-2 text-center font-semibold text-slate-600 dark:text-slate-400">{item.gstRate}%</td>
                        <td className="py-3 px-3 text-right text-slate-500 dark:text-slate-400">{money(item.cgstAmount, po.currency)}</td>
                        <td className="py-3 px-3 text-right text-slate-500 dark:text-slate-400">{money(item.sgstAmount, po.currency)}</td>
                        <td className="py-3 px-3 text-right text-slate-500 dark:text-slate-400">{money(item.igstAmount, po.currency)}</td>
                        <td className="py-3 px-3 text-right font-extrabold text-slate-900 dark:text-slate-100">{money(item.lineTotal, po.currency)}</td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan="12" className="py-12 text-center text-slate-400 font-semibold bg-slate-50/20 dark:bg-slate-950/20">
                        No items available.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>

          {/* SECTION 6: TAX SUMMARY & AMOUNT IN WORDS */}
          <section className="grid gap-6 md:grid-cols-2 pt-2">
            {/* Column Left: Amount in Words */}
            <div className="rounded-2xl border border-slate-200/80 dark:border-slate-800 bg-slate-50/40 dark:bg-slate-950/40 p-5 space-y-2 h-fit">
              <span className="text-[10px] font-black uppercase tracking-wider text-slate-400 dark:text-slate-500 block border-b border-slate-100 dark:border-slate-800 pb-1.5">Amount in Words</span>
              <p className="text-xs font-black text-slate-800 dark:text-slate-100 leading-relaxed capitalize">
                {amountToWords(po.taxSummary?.grandTotal || po.amount, po.currency)}
              </p>
            </div>

            {/* Column Right: Financial summaries */}
            <div className="rounded-2xl border border-slate-200/80 dark:border-slate-800 bg-slate-50/20 dark:bg-slate-950/20 p-5 space-y-3.5">
              <span className="text-[10px] font-black uppercase tracking-wider text-slate-400 dark:text-slate-500 block border-b border-slate-100 dark:border-slate-800 pb-1.5">Financial Summary</span>
              <div className="space-y-2.5 text-xs text-slate-600 dark:text-slate-400">
                <div className="flex justify-between font-semibold"><span>Subtotal (Taxable)</span><strong className="text-slate-800 dark:text-slate-200">{money(po.taxSummary?.taxableAmount || po.taxSummary?.subtotal, po.currency)}</strong></div>
                <div className="flex justify-between font-semibold"><span>CGST Total</span><strong className="text-slate-800 dark:text-slate-200">{money(po.taxSummary?.cgstTotal, po.currency)}</strong></div>
                <div className="flex justify-between font-semibold"><span>SGST Total</span><strong className="text-slate-800 dark:text-slate-200">{money(po.taxSummary?.sgstTotal, po.currency)}</strong></div>
                <div className="flex justify-between font-semibold"><span>IGST Total</span><strong className="text-slate-800 dark:text-slate-200">{money(po.taxSummary?.igstTotal, po.currency)}</strong></div>
                <div className="flex justify-between font-semibold border-t border-slate-100 dark:border-slate-800 pt-2 text-slate-700 dark:text-slate-300"><span>Total Tax / GST</span><strong className="text-slate-850 dark:text-slate-100 font-bold">{money(po.taxSummary?.totalGst, po.currency)}</strong></div>
                {Number(po.taxSummary?.otherCharges || 0) > 0 && (
                  <div className="flex justify-between font-semibold"><span>Other Charges</span><strong className="text-slate-800 dark:text-slate-200">{money(po.taxSummary?.otherCharges, po.currency)}</strong></div>
                )}
                {Number(po.taxSummary?.roundOff || 0) !== 0 && (
                  <div className="flex justify-between font-semibold"><span>Round Off</span><strong className="text-slate-850 dark:text-slate-100">{money(po.taxSummary?.roundOff, po.currency)}</strong></div>
                )}
                <div className="flex justify-between border-t-2 border-slate-900 dark:border-slate-700 bg-slate-900 dark:bg-slate-800 -mx-5 px-5 py-3 text-sm font-black text-white rounded-b-xl">
                  <span>NET PO AMOUNT</span>
                  <strong className="text-base font-extrabold">{money(po.taxSummary?.grandTotal || po.amount, po.currency)}</strong>
                </div>
              </div>
            </div>
          </section>

          {/* SECTION 7: PAYMENT TERMS & SECTION 8: TERMS AND CONDITIONS */}
          <section className="grid gap-6 md:grid-cols-2 border-t border-slate-200 dark:border-slate-800 pt-6">
            <div className="space-y-3">
              <h4 className="text-[10px] font-black uppercase tracking-wider text-slate-400 dark:text-slate-500">Payment Conditions</h4>
              <div className="text-xs space-y-1.5 text-slate-750 dark:text-slate-300">
                <p><strong>Payment Terms:</strong> {po.paymentTerms || "No payment terms defined"}</p>
                <div className="flex items-center gap-2">
                  <strong>Payment Type:</strong>
                  <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-bold ${
                    po.paymentType === 'INSTALLMENT' || po.payment_type === 'INSTALLMENT'
                      ? 'bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300 border border-blue-200 dark:border-blue-800'
                      : 'bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-200'
                  }`}>
                    {po.paymentType === 'INSTALLMENT' || po.payment_type === 'INSTALLMENT' ? 'Installment Payment' : 'One-Time Payment'}
                  </span>
                </div>
                <p><strong>Currency:</strong> {po.currency || "INR"}</p>
                <p><strong>Expected Delivery Date:</strong> {fmtDate(po.expectedDelivery || po.expected_delivery_date) || "Not Available"}</p>
              </div>

              {(po.paymentType === 'INSTALLMENT' || po.payment_type === 'INSTALLMENT') && po.installments?.length > 0 && (
                <div className="mt-4 rounded-xl border border-blue-200 dark:border-blue-900/60 bg-blue-50/30 dark:bg-blue-950/20 p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <h5 className="text-xs font-black uppercase tracking-wider text-blue-700 dark:text-blue-300">Installment Schedule ({po.installments.length} Installments)</h5>
                    <span className="text-[11px] font-bold text-slate-600 dark:text-slate-400">
                      Total: {money(po.installments.reduce((sum, item) => sum + Number(item.amount || 0), 0), po.currency)}
                    </span>
                  </div>

                  <div className="overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
                    <table className="w-full text-left text-xs border-collapse">
                      <thead>
                        <tr className="bg-slate-100 dark:bg-slate-800/80 text-[10px] uppercase font-bold text-slate-600 dark:text-slate-400">
                          <th className="py-2 px-2 text-center">#</th>
                          <th className="py-2 px-3 text-right">Amount</th>
                          <th className="py-2 px-3 text-center">Due Date</th>
                          <th className="py-2 px-3 text-right">Paid</th>
                          <th className="py-2 px-3 text-right">Remaining</th>
                          <th className="py-2 px-3 text-center">Status</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                        {po.installments.map((inst, idx) => {
                          const amt = Number(inst.amount || 0);
                          const paid = Number(inst.paidAmount || inst.paid_amount || 0);
                          const rem = Math.max(0, amt - paid);
                          const isOverdue = inst.status !== 'PAID' && inst.dueDate && new Date(inst.dueDate || inst.due_date) < new Date();
                          const displayStatus = isOverdue && inst.status !== 'PAID' ? 'OVERDUE' : (inst.status || 'PENDING');

                          return (
                            <tr key={inst.id || idx} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                              <td className="py-2 px-2 text-center font-bold text-blue-600 dark:text-blue-400">#{inst.installmentNumber || inst.installment_number || idx + 1}</td>
                              <td className="py-2 px-3 text-right font-semibold text-slate-900 dark:text-slate-100">{money(amt, po.currency)}</td>
                              <td className="py-2 px-3 text-center text-slate-600 dark:text-slate-400">{fmtDate(inst.dueDate || inst.due_date)}</td>
                              <td className="py-2 px-3 text-right font-medium text-emerald-600 dark:text-emerald-400">{money(paid, po.currency)}</td>
                              <td className="py-2 px-3 text-right font-medium text-amber-600 dark:text-amber-400">{money(rem, po.currency)}</td>
                              <td className="py-2 px-3 text-center">
                                <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold ${
                                  displayStatus === 'PAID' ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300' :
                                  displayStatus === 'PARTIALLY_PAID' ? 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300' :
                                  displayStatus === 'OVERDUE' ? 'bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300' :
                                  'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300'
                                }`}>
                                  {displayStatus}
                                </span>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
            <div className="space-y-2">
              <h4 className="text-[10px] font-black uppercase tracking-wider text-slate-400 dark:text-slate-500">Terms and Conditions</h4>
              <div className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed bg-slate-50 dark:bg-slate-950 border border-slate-100 dark:border-slate-800 rounded-xl p-3">
                {po.description ? (
                  <p className="whitespace-pre-line font-medium text-slate-650 dark:text-slate-300">{po.description}</p>
                ) : (
                  <p className="italic text-slate-400 dark:text-slate-500">No terms and conditions specified.</p>
                )}
              </div>
            </div>
          </section>

          {/* SECTION 9: APPROVAL / AUDIT INFORMATION */}
          <section className="grid gap-6 sm:grid-cols-3 border-t border-slate-200 dark:border-slate-800 pt-6 text-xs text-slate-500 dark:text-slate-400">
            <div className="space-y-1">
              <span className="text-[9px] font-extrabold uppercase tracking-wider text-slate-400 dark:text-slate-500 block">Created</span>
              <p><strong>User:</strong> {po.createdBy}</p>
              <p><strong>Date:</strong> {fmtDate(po.createdAt)}</p>
            </div>
            <div className="space-y-1">
              <span className="text-[9px] font-extrabold uppercase tracking-wider text-slate-400 dark:text-slate-500 block">Last Modified</span>
              <p><strong>User:</strong> {po.updated_by || "System"}</p>
              <p><strong>Date:</strong> {fmtDate(po.updatedAt)}</p>
            </div>
            <div className="space-y-1">
              <span className="text-[9px] font-extrabold uppercase tracking-wider text-slate-400 dark:text-slate-500 block">Workflow State</span>
              <p className="capitalize font-bold text-slate-800 dark:text-slate-200">{po.status}</p>
            </div>
          </section>

          {/* Document Acceptance Signature Blocks for printing */}
          <footer className="hidden print:grid grid-cols-2 gap-12 pt-16 text-xs text-slate-500 leading-normal">
            <div className="border-t border-slate-900 pt-3">
              <p className="font-extrabold uppercase text-[9px] tracking-wide text-slate-400">Vendor Acceptance / Stamp</p>
              <div className="h-12"></div>
              <p className="font-bold text-slate-700">Authorized Signatory Name &amp; Date</p>
            </div>
            <div className="border-t border-slate-900 pt-3 text-right">
              <p className="font-extrabold uppercase text-[9px] tracking-wide text-slate-400">For {COMPANY_CONFIG.name}</p>
              <div className="h-12"></div>
              <p className="font-bold text-slate-700">Authorized Signatory Stamp &amp; Date</p>
            </div>
          </footer>

        </article>
      </div>

      {/* SECTION 10: DELETE CONFIRMATION MODAL */}
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
    </div>
  );
};

export default PurchaseOrderDetails;
