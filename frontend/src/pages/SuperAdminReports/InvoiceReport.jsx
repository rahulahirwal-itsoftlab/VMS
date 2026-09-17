import { useState, useEffect, useCallback, useRef } from "react";
import { Receipt, DollarSign, AlertCircle, CheckCircle, Clock, XCircle, RefreshCw, Search, X } from "lucide-react";
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
  getInvoiceReport,
  getInvoiceReportSummary,
  getInvoiceReportDetail,
  exportInvoiceReport,
  buildExportFilename,
} from "../../services/reportService";

const INVOICE_STATUS_OPTIONS = [
  "", "DRAFT", "SUBMITTED",
  "PENDING_THREE_WAY_MATCH", "PENDING_ADMIN_REVIEW",
  "PENDING_TEAM_LEAD", "PENDING_MANAGER", "PENDING_FINANCE_HEAD",
  "APPROVED", "REJECTED", "CANCELLED",
];
const PAYMENT_STATUS_OPTIONS = ["", "UNPAID", "PARTIALLY_PAID", "PAID"];

const statusLabel = (s) => {
  if (!s) return "All Statuses";
  const map = {
    PENDING_THREE_WAY_MATCH: "PENDING THREE-WAY MATCH",
    PENDING_ADMIN_REVIEW:    "Pending Admin Review",
    PENDING_TEAM_LEAD:       "PENDING BY TEAM LEAD",
    PENDING_MANAGER:         "PENDING BY MANAGER",
    PENDING_FINANCE_HEAD:    "PENDING BY FINANCE HEAD",
  };
  return map[s] || s.charAt(0) + s.slice(1).toLowerCase().replace(/_/g, " ");
};

const COLUMNS = [
  { key: "invoice_number", label: "Invoice Number",  sortable: true },
  { key: "purchase_order", label: "PO Number",       render: (v) => v?.po_number || "—" },
  { key: "vendor",         label: "Vendor",          render: (v) => v?.name || "—" },
  { key: "invoice_date",   label: "Invoice Date",    sortable: true, render: (v) => v ? new Date(v).toLocaleDateString("en-IN") : "—" },
  { key: "invoice_total",  label: "Amount",           sortable: true,
    render: (v, row) => v != null ? `${row.currency} ${Number(v).toLocaleString("en-IN", { minimumFractionDigits: 2 })}` : "—" },
  { key: "status",         label: "Status",          sortable: true, render: (v) => <StatusBadge status={v} /> },
  { key: "created_by",     label: "Created By",      render: (v) => v ? `${v.first_name} ${v.last_name}` : "—" },
  { key: "approval_status", label: "Approval Status", sortable: true, render: (_, row) => <StatusBadge status={row.status} /> },
  { key: "payment_status", label: "Payment Status",  sortable: true, render: (v) => <StatusBadge status={v} /> },
  { key: "created_at",     label: "Created Date",    sortable: true, render: (v) => v ? new Date(v).toLocaleDateString("en-IN") : "—" },
];


const formatAmt = (v) => (v != null ? `₹ ${Number(v).toLocaleString("en-IN", { minimumFractionDigits: 2 })}` : "—");

const InvoiceReport = () => {
  const [searchParams, setSearchParams] = useSearchParams();

  const [filters, setFilters] = useState({
    startDate:     searchParams.get("startDate")     || "",
    endDate:       searchParams.get("endDate")       || "",
    status:        searchParams.get("status")        || "",
    paymentStatus: searchParams.get("paymentStatus") || "",
    search:        searchParams.get("search")        || "",
    overdueOnly:   searchParams.get("overdueOnly") === "true",
    sortField:     searchParams.get("sortField")     || "invoice_date",
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
    if (f.paymentStatus) params.paymentStatus = f.paymentStatus;
    if (f.search)        params.search        = f.search;
    if (f.overdueOnly)   params.overdueOnly   = "true";
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
      ["status", "paymentStatus", "search", "startDate", "endDate"].forEach((k) => { if (!params[k]) delete params[k]; });
      if (!params.overdueOnly) delete params.overdueOnly;
      const res = await getInvoiceReport(params);
      setData(res.invoices || []);
      setTotal(res.total || 0);
      setTotalPages(res.totalPages || 1);
    } catch (err) {
      const msg = err?.response?.data?.message || "Failed to load invoice report.";
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
      const res = await getInvoiceReportSummary(params);
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
  }, [filters.startDate, filters.endDate, filters.status, filters.paymentStatus, filters.search, filters.overdueOnly, filters.sortField, filters.sortOrder, filters.page]);

  const updateFilter = (key, value) =>
    setFilters((prev) => ({ ...prev, [key]: value, page: 1 }));

  const handleSearch = (value) => {
    clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => {
      setFilters((prev) => ({ ...prev, search: value, page: 1 }));
    }, 400);
  };

  const handleSort       = (field, order) => {
    const mappedField = field === "approval_status" ? "status" : field;
    setFilters((prev) => ({ ...prev, sortField: mappedField, sortOrder: order, page: 1 }));
  };
  const handlePageChange = (p) => setFilters((prev) => ({ ...prev, page: p }));

  const handleClearFilters = () => {
    const reset = { startDate: "", endDate: "", status: "", paymentStatus: "", search: "", overdueOnly: false, sortField: "invoice_date", sortOrder: "desc", page: 1, limit: 20 };
    setFilters(reset);
    setSearchParams({}, { replace: true });
  };

  const handleRowClick = async (row) => {
    setDrawerOpen(true);
    setDrawerLoading(true);
    try {
      const detail = await getInvoiceReportDetail(row.id);
      setDrawerRecord(detail);
    } catch { toast.error("Failed to load invoice details."); setDrawerOpen(false); }
    finally { setDrawerLoading(false); }
  };

  const handleExport = async (format) => {
    const params = { ...filters, format };
    ["status", "paymentStatus", "search", "startDate", "endDate"].forEach((k) => { if (!params[k]) delete params[k]; });
    if (!params.overdueOnly) delete params.overdueOnly;
    return exportInvoiceReport(params);
  };

  const hasActiveFilters = !!(filters.startDate || filters.endDate || filters.status || filters.paymentStatus || filters.search || filters.overdueOnly);

  const summaryCards = [
    { title: "Total Invoices",   value: summary?.totalInvoices,        icon: Receipt,      colorClass: "bg-blue-50 text-blue-600" },
    { title: "Total Invoiced",   value: summary?.totalInvoicedAmount,  icon: DollarSign,   colorClass: "bg-emerald-50 text-emerald-600" },
    { title: "Approved Amount",  value: summary?.approvedAmount,        icon: CheckCircle,  colorClass: "bg-green-50 text-green-600" },
    { title: "Amount Paid",      value: summary?.totalPaidAmount,       icon: CheckCircle,  colorClass: "bg-teal-50 text-teal-600" },
    { title: "Outstanding",      value: summary?.outstandingAmount,     icon: AlertCircle,  colorClass: "bg-amber-50 text-amber-600" },
    { title: "Overdue",          value: summary?.overdueInvoices,       icon: Clock,        colorClass: "bg-red-50 text-red-600" },
    { title: "Pending Amount",   value: summary?.pendingAmount,         icon: Clock,        colorClass: "bg-violet-50 text-violet-600" },
    { title: "Rejected",         value: summary?.rejectedInvoices,      icon: XCircle,      colorClass: "bg-rose-50 text-rose-600" },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-amber-100 text-amber-600">
            <Receipt size={18} />
          </div>
          <div>
            <h1 className="text-xl font-bold text-slate-900">Invoice Report</h1>
            <p className="text-xs text-slate-500">Filtered by invoice date</p>
          </div>
        </div>
        <ExportButton onExport={handleExport} filename={buildExportFilename("invoice-report", filters)} label="Export" />
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
              placeholder="Search invoice #, vendor…"
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
            options={INVOICE_STATUS_OPTIONS.map((s) => ({ value: s, label: statusLabel(s) }))}
            placeholder="All Statuses"
            className="w-full sm:w-56"
          />
          <FilterSelect
            value={filters.paymentStatus}
            onChange={(nextValue) => updateFilter("paymentStatus", nextValue)}
            options={PAYMENT_STATUS_OPTIONS.map((s) => ({ value: s, label: s || "All Payment Statuses" }))}
            placeholder="All Payment Statuses"
            className="w-full sm:w-56"
          />
          {/* Overdue toggle */}
          <label className="flex items-center gap-2 cursor-pointer select-none">
            <div
              onClick={() => updateFilter("overdueOnly", !filters.overdueOnly)}
              className={`relative h-5 w-9 rounded-full transition ${filters.overdueOnly ? "bg-red-500" : "bg-slate-300"}`}
            >
              <span className={`absolute top-0.5 left-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform ${filters.overdueOnly ? "translate-x-4" : ""}`} />
            </div>
            <span className="text-sm text-slate-600">Overdue only</span>
          </label>
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
        onRowClick={handleRowClick} emptyMessage="No invoices found for the selected filters."
      />

      <ReportDetailDrawer
        open={drawerOpen}
        onClose={() => { setDrawerOpen(false); setDrawerRecord(null); }}
        title="Invoice Details"
      >
        {drawerLoading ? (
          <div className="space-y-4 animate-pulse">
            {Array.from({ length: 8 }).map((_, i) => <div key={i}><div className="mb-1 h-3 w-20 rounded bg-slate-200" /><div className="h-4 w-48 rounded bg-slate-100" /></div>)}
          </div>
        ) : drawerRecord ? (
          <>
            <DetailSection title="Invoice Information" />
            <DetailField label="Invoice Number" value={drawerRecord.invoice_number} mono />
            <DetailField label="Status"         value={drawerRecord.status} />
            <DetailField label="Payment Status" value={drawerRecord.payment_status} />
            <DetailField label="Currency"       value={drawerRecord.currency} />
            <DetailField label="Amount"         value={formatAmt(drawerRecord.amount)} />
            <DetailField label="Invoice Total"  value={formatAmt(drawerRecord.invoice_total)} />
            <DetailField label="Paid Amount"    value={formatAmt(drawerRecord.paid_amount)} />
            <DetailField label="Remaining"      value={formatAmt(drawerRecord.remaining_amount)} />
            <DetailSection title="Vendor & PO" />
            <DetailField label="Vendor"         value={drawerRecord.vendor?.name} />
            <DetailField label="Vendor Code"    value={drawerRecord.vendor?.vendor_code} mono />
            <DetailField label="PO Number"      value={drawerRecord.purchase_order?.po_number} mono />
            <DetailSection title="Dates" />
            <DetailField label="Invoice Date"   value={drawerRecord.invoice_date ? new Date(drawerRecord.invoice_date).toLocaleDateString("en-IN") : "—"} />
            <DetailField label="Due Date"       value={drawerRecord.due_date ? new Date(drawerRecord.due_date).toLocaleDateString("en-IN") : "—"} />
            <DetailField label="Approved Date"  value={drawerRecord.final_approved_at ? new Date(drawerRecord.final_approved_at).toLocaleDateString("en-IN") : "—"} />
            <DetailSection title="Approval Chain" />
            <DetailField label="Team Lead"      value={drawerRecord.team_lead_approver ? `${drawerRecord.team_lead_approver.first_name} ${drawerRecord.team_lead_approver.last_name}` : "—"} />
            <DetailField label="Manager"        value={drawerRecord.manager_approver ? `${drawerRecord.manager_approver.first_name} ${drawerRecord.manager_approver.last_name}` : "—"} />
            <DetailField label="Finance Head"   value={drawerRecord.finance_head_approver ? `${drawerRecord.finance_head_approver.first_name} ${drawerRecord.finance_head_approver.last_name}` : "—"} />
            {drawerRecord.rejected_by && (
              <>
                <DetailField label="Rejected By"    value={`${drawerRecord.rejected_by.first_name} ${drawerRecord.rejected_by.last_name}`} />
                <DetailField label="Rejection Reason" value={drawerRecord.rejection_reason} />
              </>
            )}
            <DetailSection title="3-Way Match" />
            <DetailField label="Match Status"   value={drawerRecord.three_way_match_status} />
            <DetailField label="Match %"        value={drawerRecord.three_way_match_percentage != null ? `${drawerRecord.three_way_match_percentage}%` : "—"} />
            <DetailSection title="Audit" />
            <DetailField label="Created By"     value={drawerRecord.created_by ? `${drawerRecord.created_by.first_name} ${drawerRecord.created_by.last_name} (${formatRoleLabel(drawerRecord.created_by.role)})` : "—"} />
            <DetailField label="Created Date"   value={drawerRecord.created_at ? new Date(drawerRecord.created_at).toLocaleString("en-IN") : "—"} />
          </>
        ) : null}
      </ReportDetailDrawer>
    </div>
  );
};

export default InvoiceReport;
