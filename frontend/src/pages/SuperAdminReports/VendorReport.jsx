import { useState, useEffect, useCallback, useRef } from "react";
import { Building2, Users, CheckCircle, Clock, XCircle, RefreshCw, Search, X } from "lucide-react";
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
  getVendorReport,
  getVendorReportSummary,
  getVendorReportDetail,
  exportVendorReport,
  buildExportFilename,
} from "../../services/reportService";

const VENDOR_STATUS_OPTIONS = ["", "pending", "approved", "rejected", "blocked"];
const CATEGORY_OPTIONS = ["", "IT", "Manufacturing", "Services", "Logistics", "Healthcare", "Finance", "Other"];

const COLUMNS = [
  { key: "vendor_code", label: "Code",          sortable: true },
  { key: "name",        label: "Vendor Name",    sortable: true },
  { key: "category",   label: "Category",       sortable: true },
  { key: "email",      label: "Email" },
  { key: "phone",      label: "Phone" },
  { key: "status",     label: "Status",         sortable: true,
    render: (v) => <StatusBadge status={v} /> },
  { key: "created_at", label: "Created",         sortable: true,
    render: (v) => v ? new Date(v).toLocaleDateString("en-IN") : "—" },
];

const VendorReport = () => {
  const [searchParams, setSearchParams] = useSearchParams();

  // ── Filter state (synced with URL) ─────────────────────────────────────────
  const [filters, setFilters] = useState({
    startDate:   searchParams.get("startDate")   || "",
    endDate:     searchParams.get("endDate")     || "",
    status:      searchParams.get("status")      || "",
    category:    searchParams.get("category")    || "",
    search:      searchParams.get("search")      || "",
    sortField:   searchParams.get("sortField")   || "created_at",
    sortOrder:   searchParams.get("sortOrder")   || "desc",
    page:        Number(searchParams.get("page")) || 1,
    limit:       20,
  });

  const [data,    setData]    = useState([]);
  const [total,   setTotal]   = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(false);
  const [summaryLoading, setSummaryLoading] = useState(false);
  const [error,   setError]   = useState(null);

  // Detail drawer
  const [drawerOpen,   setDrawerOpen]   = useState(false);
  const [drawerRecord, setDrawerRecord] = useState(null);
  const [drawerLoading, setDrawerLoading] = useState(false);

  // Search debounce
  const searchTimer = useRef(null);

  // ── Sync filters → URL ─────────────────────────────────────────────────────
  const syncURL = useCallback((f) => {
    const params = {};
    if (f.startDate) params.startDate = f.startDate;
    if (f.endDate)   params.endDate   = f.endDate;
    if (f.status)    params.status    = f.status;
    if (f.category)  params.category  = f.category;
    if (f.search)    params.search    = f.search;
    if (f.sortField) params.sortField = f.sortField;
    if (f.sortOrder) params.sortOrder = f.sortOrder;
    if (f.page > 1)  params.page     = f.page;
    setSearchParams(params, { replace: true });
  }, [setSearchParams]);

  // ── Fetch data ─────────────────────────────────────────────────────────────
  const fetchData = useCallback(async (f) => {
    setLoading(true);
    setError(null);
    try {
      const params = { ...f };
      if (!params.status)   delete params.status;
      if (!params.category) delete params.category;
      if (!params.search)   delete params.search;
      if (!params.startDate) delete params.startDate;
      if (!params.endDate)   delete params.endDate;

      const res = await getVendorReport(params);
      setData(res.vendors || []);
      setTotal(res.total || 0);
      setTotalPages(res.totalPages || 1);
    } catch (err) {
      const msg = err?.response?.data?.message || "Failed to load vendor report.";
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
      const res = await getVendorReportSummary(params);
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
  }, [filters.startDate, filters.endDate, filters.status, filters.category, filters.sortField, filters.sortOrder, filters.page]);

  // ── Handlers ───────────────────────────────────────────────────────────────
  const updateFilter = (key, value) => {
    setFilters((prev) => ({ ...prev, [key]: value, page: 1 }));
  };

  const handleSearch = (value) => {
    clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => {
      setFilters((prev) => ({ ...prev, search: value, page: 1 }));
      fetchData({ ...filters, search: value, page: 1 });
      syncURL({ ...filters, search: value, page: 1 });
    }, 400);
  };

  const handleSort = (field, order) => {
    setFilters((prev) => ({ ...prev, sortField: field, sortOrder: order, page: 1 }));
  };

  const handlePageChange = (p) => setFilters((prev) => ({ ...prev, page: p }));

  const handleClearFilters = () => {
    const reset = { startDate: "", endDate: "", status: "", category: "", search: "", sortField: "created_at", sortOrder: "desc", page: 1, limit: 20 };
    setFilters(reset);
    setSearchParams({}, { replace: true });
  };

  const handleRowClick = async (row) => {
    setDrawerOpen(true);
    setDrawerLoading(true);
    try {
      const detail = await getVendorReportDetail(row.id);
      setDrawerRecord(detail);
    } catch {
      toast.error("Failed to load vendor details.");
      setDrawerOpen(false);
    } finally {
      setDrawerLoading(false);
    }
  };

  const handleExport = async (format) => {
    const params = { ...filters, format };
    if (!params.status)   delete params.status;
    if (!params.category) delete params.category;
    if (!params.search)   delete params.search;
    if (!params.startDate) delete params.startDate;
    if (!params.endDate)   delete params.endDate;
    return exportVendorReport(params);
  };

  const hasActiveFilters = !!(filters.startDate || filters.endDate || filters.status || filters.category || filters.search);

  // ── Summary cards data ─────────────────────────────────────────────────────
  const summaryCards = [
    { title: "Total Vendors",    value: summary?.totalVendors,    icon: Building2,    colorClass: "bg-blue-50 text-blue-600" },
    { title: "Active Vendors",   value: summary?.activeVendors,   icon: CheckCircle,  colorClass: "bg-emerald-50 text-emerald-600" },
    { title: "Pending Vendors",  value: summary?.pendingVendors,  icon: Clock,        colorClass: "bg-amber-50 text-amber-600" },
    { title: "Inactive/Blocked", value: summary?.inactiveVendors, icon: XCircle,      colorClass: "bg-red-50 text-red-600" },
    { title: "New This Period",  value: summary?.newInPeriod,     icon: Users,        colorClass: "bg-violet-50 text-violet-600" },
    { title: "Rejected",         value: summary?.rejectedVendors, icon: XCircle,      colorClass: "bg-rose-50 text-rose-600" },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-violet-100 text-violet-600">
            <Building2 size={18} />
          </div>
          <div>
            <h1 className="text-xl font-bold text-slate-900">Vendor Report</h1>
            <p className="text-xs text-slate-500">Filtered by vendor creation date</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <ExportButton
            onExport={handleExport}
            filename={buildExportFilename("vendor-report", filters, "xlsx")}
            label="Export"
          />
        </div>
      </div>

      {/* Summary cards */}
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
            <button
              onClick={handleClearFilters}
              className="flex items-center gap-1 text-xs text-slate-400 hover:text-red-500 transition"
            >
              <X size={13} /> Clear all filters
            </button>
          )}
        </div>

        <div className="flex flex-wrap gap-3 items-end">
          {/* Search */}
          <div className="relative">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
            <input
              type="text"
              placeholder="Search name, code, email…"
              defaultValue={filters.search}
              onChange={(e) => handleSearch(e.target.value)}
              className={`${sharedInputClass} w-full sm:w-60 pl-9`}
            />
          </div>

          {/* Date Range */}
          <DateRangePicker
            startDate={filters.startDate}
            endDate={filters.endDate}
            onChange={(s, e) => {
              setFilters((prev) => ({ ...prev, startDate: s, endDate: e, page: 1 }));
            }}
          />

          {/* Status */}
          <FilterSelect
            value={filters.status}
            onChange={(nextValue) => updateFilter("status", nextValue)}
            options={VENDOR_STATUS_OPTIONS.map((s) => ({
              value: s,
              label: s ? s.charAt(0).toUpperCase() + s.slice(1) : "All Statuses",
            }))}
            placeholder="All Statuses"
            className="w-full sm:w-44"
          />

          {/* Category */}
          <FilterSelect
            value={filters.category}
            onChange={(nextValue) => updateFilter("category", nextValue)}
            options={CATEGORY_OPTIONS.map((c) => ({ value: c, label: c || "All Categories" }))}
            placeholder="All Categories"
            className="w-full sm:w-48"
          />

          {/* Refresh */}
          <button
            onClick={() => fetchData(filters)}
            className="flex items-center gap-1.5 rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-600 hover:bg-slate-50 transition"
          >
            <RefreshCw size={13} /> Refresh
          </button>
        </div>

        {/* Active filter badges */}
        {hasActiveFilters && (
          <div className="flex flex-wrap gap-2 pt-1">
            {filters.startDate && (
              <span className="rounded-full bg-blue-50 px-3 py-1 text-xs font-medium text-blue-700">
                From: {filters.startDate}
              </span>
            )}
            {filters.endDate && (
              <span className="rounded-full bg-blue-50 px-3 py-1 text-xs font-medium text-blue-700">
                To: {filters.endDate}
              </span>
            )}
            {filters.status && (
              <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-700">
                Status: {filters.status}
              </span>
            )}
            {filters.category && (
              <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-700">
                Category: {filters.category}
              </span>
            )}
            {filters.search && (
              <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-700">
                Search: "{filters.search}"
              </span>
            )}
          </div>
        )}
      </div>

      {/* Error */}
      {error && (
        <div className="rounded-2xl border border-red-200 bg-red-50 px-5 py-4 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* Table */}
      <ReportTable
        columns={COLUMNS}
        data={data}
        total={total}
        page={filters.page}
        totalPages={totalPages}
        limit={filters.limit}
        sortField={filters.sortField}
        sortOrder={filters.sortOrder}
        loading={loading}
        onSort={handleSort}
        onPageChange={handlePageChange}
        onRowClick={handleRowClick}
        emptyMessage="No vendors found for the selected filters."
      />

      {/* Detail Drawer */}
      <ReportDetailDrawer
        open={drawerOpen}
        onClose={() => { setDrawerOpen(false); setDrawerRecord(null); }}
        title="Vendor Details"
      >
        {drawerLoading ? (
          <div className="space-y-4 animate-pulse">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i}>
                <div className="mb-1 h-3 w-20 rounded bg-slate-200" />
                <div className="h-4 w-48 rounded bg-slate-100" />
              </div>
            ))}
          </div>
        ) : drawerRecord ? (
          <>
            <DetailSection title="Basic Information" />
            <DetailField label="Vendor Code"   value={drawerRecord.vendor_code} mono />
            <DetailField label="Vendor Name"   value={drawerRecord.name} />
            <DetailField label="Email"         value={drawerRecord.email} />
            <DetailField label="Phone"         value={drawerRecord.phone} />
            <DetailField label="Category"      value={drawerRecord.category} />
            <DetailField label="Contact Person" value={drawerRecord.contact_person} />
            <DetailField label="Status"        value={drawerRecord.status} />

            <DetailSection title="Location" />
            <DetailField label="Address" value={drawerRecord.address} />
            <DetailField label="City"    value={drawerRecord.city} />
            <DetailField label="State"   value={drawerRecord.state} />
            <DetailField label="ZIP"     value={drawerRecord.zip_code} />

            <DetailSection title="Tax & Financial" />
            <DetailField label="Tax ID"  value={drawerRecord.tax_id} mono />
            <DetailField label="GST"     value={drawerRecord.gst_number} mono />
            <DetailField label="Payment Terms" value={drawerRecord.payment_terms} />

            <DetailSection title="Activity" />
            <DetailField label="Purchase Orders" value={drawerRecord._count?.purchase_orders ?? 0} />
            <DetailField label="Invoices"        value={drawerRecord._count?.invoices ?? 0} />
            <DetailField label="Payments"        value={drawerRecord._count?.payments ?? 0} />

            <DetailSection title="Audit" />
            <DetailField label="Created By"    value={drawerRecord.created_by ? `${drawerRecord.created_by.first_name} ${drawerRecord.created_by.last_name} (${formatRoleLabel(drawerRecord.created_by.role)})` : "—"} />
            <DetailField label="Created Date"  value={drawerRecord.created_at ? new Date(drawerRecord.created_at).toLocaleString("en-IN") : "—"} />
            <DetailField label="Approved By"   value={drawerRecord.approved_by ? `${drawerRecord.approved_by.first_name} ${drawerRecord.approved_by.last_name}` : "—"} />
            <DetailField label="Approved Date" value={drawerRecord.approved_at ? new Date(drawerRecord.approved_at).toLocaleString("en-IN") : "—"} />
          </>
        ) : null}
      </ReportDetailDrawer>
    </div>
  );
};

export default VendorReport;
