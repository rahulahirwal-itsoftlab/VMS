import { useState, useEffect, useCallback, useRef } from "react";
import { ShoppingCart, DollarSign, CheckCircle, Clock, XCircle, RefreshCw, Search, X } from "lucide-react";
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
  getPOReport,
  getPOReportSummary,
  getPOReportDetail,
  exportPOReport,
  buildExportFilename,
} from "../../services/reportService";

const PO_STATUS_OPTIONS = ["", "pending", "open", "closed", "cancelled"];
const CURRENCY_OPTIONS  = ["", "INR", "USD", "EUR", "GBP", "AED"];

const COLUMNS = [
  { key: "po_number",   label: "PO Number",    sortable: true },
  { key: "vendor",      label: "Vendor",        render: (v) => v?.name || "—" },
  { key: "amount",      label: "Amount",        sortable: true,
    render: (v, row) => v != null ? `${row.currency} ${Number(v).toLocaleString("en-IN", { minimumFractionDigits: 2 })}` : "—" },
  { key: "status",      label: "Status",        sortable: true, render: (v) => <StatusBadge status={v} /> },
  { key: "order_date",  label: "Order Date",    sortable: true, render: (v) => v ? new Date(v).toLocaleDateString("en-IN") : "—" },
  { key: "_count",      label: "Invoices",      render: (v) => v?.invoices ?? 0 },
  { key: "created_at",  label: "Created",       sortable: true, render: (v) => v ? new Date(v).toLocaleDateString("en-IN") : "—" },
];

const formatINR = (v) => (v != null ? `₹ ${Number(v).toLocaleString("en-IN", { minimumFractionDigits: 2 })}` : "—");

const POReport = () => {
  const [searchParams, setSearchParams] = useSearchParams();

  const [filters, setFilters] = useState({
    startDate:  searchParams.get("startDate")  || "",
    endDate:    searchParams.get("endDate")    || "",
    status:     searchParams.get("status")     || "",
    currency:   searchParams.get("currency")   || "",
    search:     searchParams.get("search")     || "",
    sortField:  searchParams.get("sortField")  || "order_date",
    sortOrder:  searchParams.get("sortOrder")  || "desc",
    page:       Number(searchParams.get("page")) || 1,
    limit:      20,
  });

  const [data,      setData]      = useState([]);
  const [total,     setTotal]     = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [summary,   setSummary]   = useState(null);
  const [loading,   setLoading]   = useState(false);
  const [summaryLoading, setSummaryLoading] = useState(false);
  const [error,     setError]     = useState(null);

  const [drawerOpen,    setDrawerOpen]    = useState(false);
  const [drawerRecord,  setDrawerRecord]  = useState(null);
  const [drawerLoading, setDrawerLoading] = useState(false);

  const searchTimer = useRef(null);

  const syncURL = useCallback((f) => {
    const params = {};
    if (f.startDate) params.startDate = f.startDate;
    if (f.endDate)   params.endDate   = f.endDate;
    if (f.status)    params.status    = f.status;
    if (f.currency)  params.currency  = f.currency;
    if (f.search)    params.search    = f.search;
    if (f.sortField) params.sortField = f.sortField;
    if (f.sortOrder) params.sortOrder = f.sortOrder;
    if (f.page > 1)  params.page     = f.page;
    setSearchParams(params, { replace: true });
  }, [setSearchParams]);

  const fetchData = useCallback(async (f) => {
    setLoading(true);
    setError(null);
    try {
      const params = { ...f };
      ["status", "currency", "search", "startDate", "endDate"].forEach((k) => {
        if (!params[k]) delete params[k];
      });
      const res = await getPOReport(params);
      setData(res.purchaseOrders || []);
      setTotal(res.total || 0);
      setTotalPages(res.totalPages || 1);
    } catch (err) {
      const msg = err?.response?.data?.message || "Failed to load PO report.";
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
      const res = await getPOReportSummary(params);
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
  }, [filters.startDate, filters.endDate, filters.status, filters.currency, filters.sortField, filters.sortOrder, filters.page]);

  const updateFilter = (key, value) =>
    setFilters((prev) => ({ ...prev, [key]: value, page: 1 }));

  const handleSearch = (value) => {
    clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => {
      setFilters((prev) => ({ ...prev, search: value, page: 1 }));
      fetchData({ ...filters, search: value, page: 1 });
    }, 400);
  };

  const handleSort     = (field, order) => setFilters((prev) => ({ ...prev, sortField: field, sortOrder: order, page: 1 }));
  const handlePageChange = (p)          => setFilters((prev) => ({ ...prev, page: p }));

  const handleClearFilters = () => {
    const reset = { startDate: "", endDate: "", status: "", currency: "", search: "", sortField: "order_date", sortOrder: "desc", page: 1, limit: 20 };
    setFilters(reset);
    setSearchParams({}, { replace: true });
  };

  const handleRowClick = async (row) => {
    setDrawerOpen(true);
    setDrawerLoading(true);
    try {
      const detail = await getPOReportDetail(row.id);
      setDrawerRecord(detail);
    } catch { toast.error("Failed to load PO details."); setDrawerOpen(false); }
    finally { setDrawerLoading(false); }
  };

  const handleExport = async (format) => {
    const params = { ...filters, format };
    ["status", "currency", "search", "startDate", "endDate"].forEach((k) => {
      if (!params[k]) delete params[k];
    });
    return exportPOReport(params);
  };

  const hasActiveFilters = !!(filters.startDate || filters.endDate || filters.status || filters.currency || filters.search);

  const summaryCards = [
    { title: "Total POs",         value: summary?.totalPurchaseOrders, icon: ShoppingCart, colorClass: "bg-blue-50 text-blue-600" },
    { title: "Total PO Value",    value: summary?.totalPOValue,        icon: DollarSign,   colorClass: "bg-emerald-50 text-emerald-600", prefix: "₹ " },
    { title: "Open Value",        value: summary?.openPOValue,         icon: Clock,        colorClass: "bg-amber-50 text-amber-600",     prefix: "₹ " },
    { title: "Avg PO Value",      value: summary?.averagePOValue,      icon: DollarSign,   colorClass: "bg-violet-50 text-violet-600",   prefix: "₹ " },
    { title: "Completed POs",     value: summary?.completedPOs,        icon: CheckCircle,  colorClass: "bg-green-50 text-green-600" },
    { title: "Cancelled POs",     value: summary?.cancelledPOs,        icon: XCircle,      colorClass: "bg-red-50 text-red-600" },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-blue-100 text-blue-600">
            <ShoppingCart size={18} />
          </div>
          <div>
            <h1 className="text-xl font-bold text-slate-900">Purchase Order Report</h1>
            <p className="text-xs text-slate-500">Filtered by order date</p>
          </div>
        </div>
        <ExportButton onExport={handleExport} filename={buildExportFilename("po-report", filters)} label="Export" />
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
              placeholder="Search PO number, vendor…"
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
            options={PO_STATUS_OPTIONS.map((s) => ({ value: s, label: s || "All Statuses" }))}
            placeholder="All Statuses"
            className="w-full sm:w-44"
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
        onRowClick={handleRowClick} emptyMessage="No purchase orders found for the selected filters."
      />

      <ReportDetailDrawer
        open={drawerOpen}
        onClose={() => { setDrawerOpen(false); setDrawerRecord(null); }}
        title="Purchase Order Details"
      >
        {drawerLoading ? (
          <div className="space-y-4 animate-pulse">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i}><div className="mb-1 h-3 w-20 rounded bg-slate-200" /><div className="h-4 w-48 rounded bg-slate-100" /></div>
            ))}
          </div>
        ) : drawerRecord ? (
          <>
            <DetailSection title="PO Information" />
            <DetailField label="PO Number"    value={drawerRecord.po_number} mono />
            <DetailField label="Status"       value={drawerRecord.status} />
            <DetailField label="Description"  value={drawerRecord.description} />
            <DetailField label="Amount"       value={formatINR(drawerRecord.amount)} />
            <DetailField label="Currency"     value={drawerRecord.currency} />
            <DetailSection title="Vendor" />
            <DetailField label="Vendor Code"  value={drawerRecord.vendor?.vendor_code} mono />
            <DetailField label="Vendor Name"  value={drawerRecord.vendor?.name} />
            <DetailField label="Category"     value={drawerRecord.vendor?.category} />
            <DetailSection title="Dates" />
            <DetailField label="Order Date"        value={drawerRecord.order_date ? new Date(drawerRecord.order_date).toLocaleDateString("en-IN") : "—"} />
            <DetailField label="Expected Delivery" value={drawerRecord.expected_delivery_date ? new Date(drawerRecord.expected_delivery_date).toLocaleDateString("en-IN") : "—"} />
            <DetailField label="Closed At"         value={drawerRecord.closed_at ? new Date(drawerRecord.closed_at).toLocaleDateString("en-IN") : "—"} />
            <DetailField label="Cancelled At"      value={drawerRecord.cancelled_at ? new Date(drawerRecord.cancelled_at).toLocaleDateString("en-IN") : "—"} />
            <DetailSection title="Activity" />
            <DetailField label="Invoices Count"    value={drawerRecord._count?.invoices ?? 0} />
            <DetailField label="Payments Count"    value={drawerRecord._count?.payments ?? 0} />
            <DetailSection title="Audit" />
            <DetailField label="Created By"   value={drawerRecord.created_by ? `${drawerRecord.created_by.first_name} ${drawerRecord.created_by.last_name} (${formatRoleLabel(drawerRecord.created_by.role)})` : "—"} />
            <DetailField label="Created Date" value={drawerRecord.created_at ? new Date(drawerRecord.created_at).toLocaleString("en-IN") : "—"} />
          </>
        ) : null}
      </ReportDetailDrawer>
    </div>
  );
};

export default POReport;
