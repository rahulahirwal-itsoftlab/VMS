import { useState, useEffect, useCallback, useRef } from "react";
import { Wallet, DollarSign, CheckCircle, Clock, XCircle, RotateCcw, RefreshCw, Search, X } from "lucide-react";
import { toast } from "sonner";
import { useSearchParams } from "react-router-dom";

import ReportSummaryCard from "../../components/reports/ReportSummaryCard";
import DateRangePicker from "../../components/reports/DateRangePicker";
import ReportTable from "../../components/reports/ReportTable";
import ReportDetailDrawer, { DetailField, DetailSection } from "../../components/reports/ReportDetailDrawer";
import ExportButton from "../../components/reports/ExportButton";
import StatusBadge from "../../components/common/StatusBadge";
import FilterSelect from "../../components/common/FilterSelect";
import { formatRoleLabel } from "../../utils/displayFormatters";
import { inputClass as sharedInputClass } from "../../utils/formStyles";

import {
  getPaymentReport,
  getPaymentReportSummary,
  getPaymentReportDetail,
  exportPaymentReport,
  buildExportFilename,
} from "../../services/reportService";

const PAYMENT_STATUS_OPTIONS  = ["", "PENDING", "INITIATED", "PROCESSING", "SUCCESS", "FAILED", "CANCELLED", "REFUNDED", "PARTIALLY_PAID", "COMPLETED"];
const PAYMENT_METHOD_OPTIONS  = ["", "NEFT", "RTGS", "IMPS", "UPI", "CHEQUE", "CASH", "WIRE_TRANSFER", "MANUAL"];
const CURRENCY_OPTIONS        = ["", "INR", "USD", "EUR", "GBP", "AED"];

const COLUMNS = [
  { key: "payment_number",  label: "Payment #",      sortable: true },
  { key: "vendor",          label: "Vendor",          render: (v) => v?.name || "—" },
  { key: "invoice",         label: "Invoice",         render: (v) => v?.invoice_number || "—" },
  { key: "amount",          label: "Amount",          sortable: true,
    render: (v, row) => v != null ? `${row.currency} ${Number(v).toLocaleString("en-IN", { minimumFractionDigits: 2 })}` : "—" },
  { key: "status",          label: "Status",          sortable: true, render: (v) => <StatusBadge status={v} /> },
  { key: "payment_method",  label: "Method" },
  { key: "payment_date",    label: "Payment Date",    sortable: true, render: (v) => v ? new Date(v).toLocaleDateString("en-IN") : "—" },
  { key: "created_at",      label: "Created",         sortable: true, render: (v) => v ? new Date(v).toLocaleDateString("en-IN") : "—" },
];

const fmtAmt = (v) => (v != null ? `₹ ${Number(v).toLocaleString("en-IN", { minimumFractionDigits: 2 })}` : "—");

const PaymentReport = () => {
  const [searchParams, setSearchParams] = useSearchParams();

  const [filters, setFilters] = useState({
    startDate:     searchParams.get("startDate")     || "",
    endDate:       searchParams.get("endDate")       || "",
    status:        searchParams.get("status")        || "",
    paymentMethod: searchParams.get("paymentMethod") || "",
    currency:      searchParams.get("currency")      || "",
    search:        searchParams.get("search")        || "",
    sortField:     searchParams.get("sortField")     || "payment_date",
    sortOrder:     searchParams.get("sortOrder")     || "desc",
    page:          Number(searchParams.get("page"))  || 1,
    limit:         20,
  });

  const [data,       setData]       = useState([]);
  const [total,      setTotal]      = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [summary,    setSummary]    = useState(null);
  const [loading,    setLoading]    = useState(false);
  const [summaryLoading, setSummaryLoading] = useState(false);
  const [error,      setError]      = useState(null);

  const [drawerOpen,    setDrawerOpen]    = useState(false);
  const [drawerRecord,  setDrawerRecord]  = useState(null);
  const [drawerLoading, setDrawerLoading] = useState(false);

  const searchTimer = useRef(null);

  const syncURL = useCallback((f) => {
    const params = {};
    if (f.startDate)     params.startDate     = f.startDate;
    if (f.endDate)       params.endDate       = f.endDate;
    if (f.status)        params.status        = f.status;
    if (f.paymentMethod) params.paymentMethod = f.paymentMethod;
    if (f.currency)      params.currency      = f.currency;
    if (f.search)        params.search        = f.search;
    if (f.sortField)     params.sortField     = f.sortField;
    if (f.sortOrder)     params.sortOrder     = f.sortOrder;
    if (f.page > 1)      params.page         = f.page;
    setSearchParams(params, { replace: true });
  }, [setSearchParams]);

  const fetchData = useCallback(async (f) => {
    setLoading(true);
    setError(null);
    try {
      const params = { ...f };
      ["status", "paymentMethod", "currency", "search", "startDate", "endDate"].forEach((k) => { if (!params[k]) delete params[k]; });
      const res = await getPaymentReport(params);
      setData(res.payments || []);
      setTotal(res.total || 0);
      setTotalPages(res.totalPages || 1);
    } catch (err) {
      const msg = err?.response?.data?.message || "Failed to load payment report.";
      setError(msg);
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchSummary = useCallback(async (f) => {
    setSummaryLoading(true);
    try {
      const params = {};
      if (f.startDate) params.startDate = f.startDate;
      if (f.endDate)   params.endDate   = f.endDate;
      const res = await getPaymentReportSummary(params);
      setSummary(res);
    } catch { /* non-fatal */ } finally {
      setSummaryLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData(filters);
    fetchSummary(filters);
    syncURL(filters);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters.startDate, filters.endDate, filters.status, filters.paymentMethod, filters.currency, filters.sortField, filters.sortOrder, filters.page]);

  const updateFilter = (key, value) =>
    setFilters((prev) => ({ ...prev, [key]: value, page: 1 }));

  const handleSearch = (value) => {
    clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => {
      setFilters((prev) => ({ ...prev, search: value, page: 1 }));
      fetchData({ ...filters, search: value, page: 1 });
    }, 400);
  };

  const handleSort       = (field, order) => setFilters((prev) => ({ ...prev, sortField: field, sortOrder: order, page: 1 }));
  const handlePageChange = (p) => setFilters((prev) => ({ ...prev, page: p }));

  const handleClearFilters = () => {
    const reset = { startDate: "", endDate: "", status: "", paymentMethod: "", currency: "", search: "", sortField: "payment_date", sortOrder: "desc", page: 1, limit: 20 };
    setFilters(reset);
    setSearchParams({}, { replace: true });
  };

  const handleRowClick = async (row) => {
    setDrawerOpen(true);
    setDrawerLoading(true);
    try {
      const detail = await getPaymentReportDetail(row.id);
      setDrawerRecord(detail);
    } catch { toast.error("Failed to load payment details."); setDrawerOpen(false); }
    finally { setDrawerLoading(false); }
  };

  const handleExport = async (format) => {
    const params = { ...filters, format };
    ["status", "paymentMethod", "currency", "search", "startDate", "endDate"].forEach((k) => { if (!params[k]) delete params[k]; });
    return exportPaymentReport(params);
  };

  const hasActiveFilters = !!(filters.startDate || filters.endDate || filters.status || filters.paymentMethod || filters.currency || filters.search);

  const summaryCards = [
    { title: "Total Payments",   value: summary?.totalPayments,     icon: Wallet,       colorClass: "bg-blue-50 text-blue-600" },
    { title: "Successful Amount", value: summary?.successfulAmount, icon: CheckCircle,  colorClass: "bg-emerald-50 text-emerald-600" },
    { title: "Pending Amount",   value: summary?.pendingAmount,     icon: Clock,        colorClass: "bg-amber-50 text-amber-600" },
    { title: "Failed Amount",    value: summary?.failedAmount,      icon: XCircle,      colorClass: "bg-red-50 text-red-600" },
    { title: "Refunded Amount",  value: summary?.refundedAmount,    icon: RotateCcw,    colorClass: "bg-violet-50 text-violet-600" },
    { title: "Completed",        value: summary?.completedPayments, icon: CheckCircle,  colorClass: "bg-teal-50 text-teal-600" },
    { title: "Pending Count",    value: summary?.pendingPayments,   icon: Clock,        colorClass: "bg-orange-50 text-orange-600" },
    { title: "Failed Count",     value: summary?.failedPayments,    icon: DollarSign,   colorClass: "bg-rose-50 text-rose-600" },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-emerald-100 text-emerald-600">
            <Wallet size={18} />
          </div>
          <div>
            <h1 className="text-xl font-bold text-slate-900">Payment Report</h1>
            <p className="text-xs text-slate-500">Filtered by payment date</p>
          </div>
        </div>
        <ExportButton onExport={handleExport} filename={buildExportFilename("payment-report", filters)} label="Export" />
      </div>

      {/* Summary */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
        {summaryCards.map((card) => (
          <ReportSummaryCard key={card.title} {...card} loading={summaryLoading} />
        ))}
      </div>

      {/* Filters */}
      <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 shadow-sm dark:shadow-slate-950/40 space-y-4">
        <div className="flex items-center justify-between">
          <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">Filters</p>
          {hasActiveFilters && (
            <button onClick={handleClearFilters} className="flex items-center gap-1 text-xs text-slate-400 hover:text-red-500 transition">
              <X size={13} /> Clear all
            </button>
          )}
        </div>
        <div className="flex flex-wrap gap-3 items-end">
          <div className="relative">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
            <input
              type="text"
              placeholder="Search payment #, vendor…"
              defaultValue={filters.search}
              onChange={(e) => handleSearch(e.target.value)}
              className={`${sharedInputClass} w-full sm:w-60 pl-9`}
            />
          </div>
          <DateRangePicker
            startDate={filters.startDate}
            endDate={filters.endDate}
            onChange={(s, e) => setFilters((prev) => ({ ...prev, startDate: s, endDate: e, page: 1 }))}
          />
          <FilterSelect
            value={filters.status}
            onChange={(nextValue) => updateFilter("status", nextValue)}
            options={PAYMENT_STATUS_OPTIONS.map((s) => ({ value: s, label: s || "All Statuses" }))}
            placeholder="All Statuses"
            className="w-full sm:w-48"
          />
          <FilterSelect
            value={filters.paymentMethod}
            onChange={(nextValue) => updateFilter("paymentMethod", nextValue)}
            options={PAYMENT_METHOD_OPTIONS.map((m) => ({ value: m, label: m || "All Methods" }))}
            placeholder="All Methods"
            className="w-full sm:w-48"
          />
          <FilterSelect
            value={filters.currency}
            onChange={(nextValue) => updateFilter("currency", nextValue)}
            options={CURRENCY_OPTIONS.map((c) => ({ value: c, label: c || "All Currencies" }))}
            placeholder="All Currencies"
            className="w-full sm:w-44"
          />
          <button onClick={() => fetchData(filters)} className="flex items-center gap-1.5 rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-600 hover:bg-slate-50 transition">
            <RefreshCw size={13} /> Refresh
          </button>
        </div>
      </div>

      {error && <div className="rounded-2xl border border-red-200 bg-red-50 px-5 py-4 text-sm text-red-700">{error}</div>}

      <ReportTable
        columns={COLUMNS} data={data} total={total} page={filters.page}
        totalPages={totalPages} limit={filters.limit}
        sortField={filters.sortField} sortOrder={filters.sortOrder}
        loading={loading} onSort={handleSort} onPageChange={handlePageChange}
        onRowClick={handleRowClick} emptyMessage="No payments found for the selected filters."
      />

      <ReportDetailDrawer
        open={drawerOpen}
        onClose={() => { setDrawerOpen(false); setDrawerRecord(null); }}
        title="Payment Details"
      >
        {drawerLoading ? (
          <div className="space-y-4 animate-pulse">
            {Array.from({ length: 8 }).map((_, i) => <div key={i}><div className="mb-1 h-3 w-20 rounded bg-slate-200" /><div className="h-4 w-48 rounded bg-slate-100" /></div>)}
          </div>
        ) : drawerRecord ? (
          <>
            <DetailSection title="Payment Information" />
            <DetailField label="Payment Number" value={drawerRecord.payment_number} mono />
            <DetailField label="Status"         value={drawerRecord.status} />
            <DetailField label="Amount"         value={fmtAmt(drawerRecord.amount)} />
            <DetailField label="Currency"       value={drawerRecord.currency} />
            <DetailField label="Method"         value={drawerRecord.payment_method} />
            <DetailField label="Type"           value={drawerRecord.payment_type} />
            <DetailField label="Provider"       value={drawerRecord.payment_provider} />
            <DetailSection title="Transaction" />
            <DetailField label="Transaction ID" value={drawerRecord.provider_transaction_id} mono />
            <DetailField label="Gateway Ref"    value={drawerRecord.gateway_reference} mono />
            <DetailField label="Gateway Status" value={drawerRecord.gateway_status} />
            <DetailField label="Response"       value={drawerRecord.response_message} />
            <DetailSection title="Linked Records" />
            <DetailField label="Vendor"         value={drawerRecord.vendor?.name} />
            <DetailField label="Invoice"        value={drawerRecord.invoice?.invoice_number} mono />
            <DetailField label="PO Number"      value={drawerRecord.purchase_order?.po_number} mono />
            <DetailSection title="Dates" />
            <DetailField label="Payment Date"   value={drawerRecord.payment_date ? new Date(drawerRecord.payment_date).toLocaleDateString("en-IN") : "—"} />
            <DetailField label="Due Date"       value={drawerRecord.due_date ? new Date(drawerRecord.due_date).toLocaleDateString("en-IN") : "—"} />
            <DetailField label="Remarks"        value={drawerRecord.remarks} />
            <DetailSection title="Audit" />
            <DetailField label="Created By"     value={drawerRecord.created_by ? `${drawerRecord.created_by.first_name} ${drawerRecord.created_by.last_name} (${formatRoleLabel(drawerRecord.created_by.role)})` : "—"} />
            <DetailField label="Processed By"   value={drawerRecord.processed_by ? `${drawerRecord.processed_by.first_name} ${drawerRecord.processed_by.last_name} (${formatRoleLabel(drawerRecord.processed_by.role)})` : "—"} />
            <DetailField label="Approved By"    value={drawerRecord.approved_by ? `${drawerRecord.approved_by.first_name} ${drawerRecord.approved_by.last_name} (${formatRoleLabel(drawerRecord.approved_by.role)})` : "—"} />
            <DetailField label="Created Date"   value={drawerRecord.created_at ? new Date(drawerRecord.created_at).toLocaleString("en-IN") : "—"} />
          </>
        ) : null}
      </ReportDetailDrawer>
    </div>
  );
};

export default PaymentReport;
