import { useState, useEffect, useCallback, useMemo } from "react";
import { useAuth } from "../../context/AuthContext";
import { ROLES } from "../../config/permissions";
import {
  getInvoices,
  approveInvoice,
  rejectInvoice,
} from "../../services/invoiceService";
import {
  Eye,
  FileText,
  Plus,
  RefreshCw,
  Search,
  AlertTriangle,
  LayoutGrid,
  List,
  X,
  Calendar,
  Clock,
  RotateCcw,
  Building2,
  ArrowRightLeft,
} from "lucide-react";

import StatusBadge from "../../components/common/StatusBadge";
import EmptyState from "../../components/common/EmptyState";
import Pagination from "../../components/common/Pagination";
import { Link, useNavigate } from "react-router-dom";
import FilterSelect from "../../components/common/FilterSelect";

const formatCurrency = (value, code = "INR") =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: code || "INR",
    maximumFractionDigits: 2,
  }).format(Number(value || 0));

const formatDate = (value) => {
  if (!value) return "—";
  return new Date(value).toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
};

const APPROVAL_STATUS_OPTIONS = [
  { value: "", label: "All Status" },
  { value: "APPROVED", label: "Approved" },
  {
    value: "PENDING_THREE_WAY_MATCH",
    label: "Pending Three-Way Match",
  },
  {
    value: "PENDING_ADMIN_REVIEW",
    label: "Pending Admin Review",
  },
  { value: "PENDING_TEAM_LEAD", label: "Pending Team Lead" },
  { value: "PENDING_MANAGER", label: "Pending Manager" },
  {
    value: "PENDING_FINANCE_HEAD",
    label: "Pending Finance Head",
  },
  { value: "REJECTED", label: "Rejected" },
];

const PAYMENT_STATUS_OPTIONS = [
  { value: "", label: "All Payment Status" },
  { value: "UNPAID", label: "Unpaid" },
  { value: "PARTIALLY_PAID", label: "Partially Paid" },
  { value: "PAID", label: "Paid" },
  { value: "OVERDUE", label: "Overdue" },
];

const CASE_MANAGER_STATUS_OPTIONS = [
  { value: "All Status", label: "All Status" },
];

const InvoiceList = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const normalizedRole = (user?.role || "").toUpperCase();
  const isCaseManager = normalizedRole === ROLES.CASE_MANAGER;

  const [invoices, setInvoices] = useState([]);
  const [pagination, setPagination] = useState({
    page: 1,
    limit: 10,
    total: 0,
    totalPages: 1,
  });

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState(() =>
    isCaseManager ? "All Status" : "",
  );
  const [paymentStatusFilter, setPaymentStatusFilter] = useState("");

  useEffect(() => {
    if (isCaseManager) {
      setStatusFilter("All Status");
      setPaymentStatusFilter("");
    }
  }, [isCaseManager]);

  // Responsive view mode state: default to 'cards' on mobile (< 768px), 'table' on desktop
  const [viewMode, setViewMode] = useState(() =>
    typeof window !== "undefined" && window.innerWidth < 768 ? "cards" : "table",
  );
  const [userOverrodeView, setUserOverrodeView] = useState(false);
  const [actionInProgressId, setActionInProgressId] = useState(null);

  useEffect(() => {
    const handleResize = () => {
      if (!userOverrodeView) {
        setViewMode(window.innerWidth < 768 ? "cards" : "table");
      }
    };
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, [userOverrodeView]);

  const loadInvoices = useCallback(
    async (pageToLoad = pagination.page) => {
      try {
        setLoading(true);
        setError(null);

        const params = {
          page: pageToLoad,
          limit: pagination.limit,
        };

        if (search.trim()) params.search = search.trim();
        if (!isCaseManager && statusFilter) params.status = statusFilter;
        if (!isCaseManager && paymentStatusFilter) params.paymentStatus = paymentStatusFilter;

        const response = await getInvoices(params);

        setInvoices(response.invoices || []);
        setPagination({
          page: response.page || pageToLoad,
          limit: response.limit || 10,
          total: response.total || 0,
          totalPages: response.totalPages || 1,
        });
      } catch (err) {
        console.error("[InvoiceList] Error loading invoices:", err);
        setError(
          err?.response?.data?.message ||
            err?.response?.data?.error ||
            "Unable to load invoice history. Please try again.",
        );
      } finally {
        setLoading(false);
      }
    },
    [
      pagination.limit,
      search,
      statusFilter,
      paymentStatusFilter,
      pagination.page,
      isCaseManager,
    ],
  );

  useEffect(() => {
    loadInvoices(1);
  }, [search, statusFilter, paymentStatusFilter]);

  const canActOnInvoice = (invoice, role) => {
    if (!invoice || !role) return false;
    const normalizedInvoiceStatus = (invoice?.status || "").toUpperCase();
    const normalizedRoleValue = (role || "").toUpperCase();
    if (normalizedRoleValue === ROLES.TEAM_LEAD) {
      return ["PENDING_TEAM_LEAD", "PENDING_L1", "PENDING"].includes(
        normalizedInvoiceStatus,
      );
    }
    if (normalizedRoleValue === ROLES.MANAGER) {
      return ["PENDING_MANAGER", "PENDING_L2"].includes(
        normalizedInvoiceStatus,
      );
    }
    return false;
  };

  const handleApprove = async (id) => {
    try {
      setActionInProgressId(id);
      await approveInvoice(id);
      await loadInvoices(pagination.page);
      alert("Invoice approved successfully");
    } catch (err) {
      console.error(err);
      alert(err?.response?.data?.message || "Unable to approve invoice");
    } finally {
      setActionInProgressId(null);
    }
  };

  const handleReject = async (id) => {
    try {
      setActionInProgressId(id);
      await rejectInvoice(id, `Rejected by ${user?.role || "approver"}`);
      await loadInvoices(pagination.page);
      alert("Invoice rejected successfully");
    } catch (err) {
      console.error(err);
      alert(err?.response?.data?.message || "Unable to reject invoice");
    } finally {
      setActionInProgressId(null);
    }
  };

  const hasActiveFilters = Boolean(
    search.trim() ||
      (!isCaseManager && (statusFilter || paymentStatusFilter)),
  );

  const handleClearFilters = () => {
    setSearch("");
    if (isCaseManager) {
      setStatusFilter("All Status");
      setPaymentStatusFilter("");
    } else {
      setStatusFilter("");
      setPaymentStatusFilter("");
    }
  };

  const handleSelectViewMode = (mode) => {
    setViewMode(mode);
    setUserOverrodeView(true);
  };

  // Quick summary stats computed from current dataset
  const stats = useMemo(() => {
    const totalAmount = invoices.reduce(
      (sum, inv) => sum + Number(inv.amount || 0),
      0,
    );
    const pendingCount = invoices.filter((inv) =>
      String(inv.status || "").toUpperCase().includes("PENDING"),
    ).length;
    const matchedCount = invoices.filter(
      (inv) =>
        String(inv.threeWayMatchStatus || "").toUpperCase() === "MATCHED",
    ).length;

    return { totalAmount, pendingCount, matchedCount };
  }, [invoices]);

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* ── Page Header ─────────────────────────────────────────────────────────── */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2 sm:gap-3">
            <h1 className="text-2xl font-extrabold tracking-tight text-slate-900 dark:text-slate-100 font-heading sm:text-3xl">
              Invoice History
            </h1>
            {pagination.total > 0 && (
              <span className="inline-flex items-center rounded-full bg-blue-50 dark:bg-blue-950/60 border border-blue-200/80 dark:border-blue-900 px-2.5 py-0.5 text-xs font-semibold text-blue-700 dark:text-blue-300">
                {pagination.total} {pagination.total === 1 ? "invoice" : "invoices"}
              </span>
            )}
          </div>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400 sm:text-sm">
            Track and manage all historical vendor invoices.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 sm:gap-2.5 self-start sm:self-auto">
          {/* View Mode Switcher */}
          <div className="inline-flex items-center rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 p-1 shadow-2xs">
            <button
              type="button"
              onClick={() => handleSelectViewMode("table")}
              title="Table view"
              className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-semibold transition ${
                viewMode === "table"
                  ? "bg-slate-100 dark:bg-slate-800 text-blue-600 dark:text-blue-400 shadow-xs"
                  : "text-slate-500 hover:text-slate-900 dark:hover:text-slate-200"
              }`}
            >
              <List size={14} />
              <span className="hidden sm:inline">Table</span>
            </button>
            <button
              type="button"
              onClick={() => handleSelectViewMode("cards")}
              title="Cards view"
              className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-semibold transition ${
                viewMode === "cards"
                  ? "bg-slate-100 dark:bg-slate-800 text-blue-600 dark:text-blue-400 shadow-xs"
                  : "text-slate-500 hover:text-slate-900 dark:hover:text-slate-200"
              }`}
            >
              <LayoutGrid size={14} />
              <span className="hidden sm:inline">Cards</span>
            </button>
          </div>

          <button
            type="button"
            onClick={() => loadInvoices(pagination.page)}
            disabled={loading}
            className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 px-3 text-xs font-semibold text-slate-700 dark:text-slate-200 transition hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-60 shadow-2xs sm:h-10 sm:px-4 sm:text-sm"
          >
            <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
            <span>Refresh</span>
          </button>

          {normalizedRole === ROLES.CASE_MANAGER && (
            <Link
              to="/invoices/create"
              className="inline-flex h-9 items-center gap-1.5 rounded-xl bg-blue-600 px-3 text-xs font-semibold text-white transition hover:bg-blue-700 shadow-sm sm:h-10 sm:px-4 sm:text-sm"
            >
              <Plus size={16} />
              <span>Create Invoice</span>
            </Link>
          )}
        </div>
      </div>

      {/* ── Metric Summary Strip ─────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4 sm:gap-4">
        <div className="rounded-2xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 p-3 sm:p-4 shadow-sm">
          <p className="text-[11px] font-medium uppercase tracking-wider text-slate-400 sm:text-xs">
            Total Invoices
          </p>
          <p className="mt-1 text-base font-bold text-slate-900 dark:text-slate-100 sm:text-2xl font-mono">
            {pagination.total}
          </p>
        </div>
        <div className="rounded-2xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 p-3 sm:p-4 shadow-sm">
          <p className="text-[11px] font-medium uppercase tracking-wider text-slate-400 sm:text-xs">
            Page Total Amount
          </p>
          <p className="mt-1 text-base font-bold text-slate-900 dark:text-slate-100 sm:text-2xl font-mono truncate">
            {formatCurrency(stats.totalAmount)}
          </p>
        </div>
        <div className="rounded-2xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 p-3 sm:p-4 shadow-sm">
          <p className="text-[11px] font-medium uppercase tracking-wider text-slate-400 sm:text-xs">
            Pending Approvals
          </p>
          <p className="mt-1 text-base font-bold text-amber-600 dark:text-amber-400 sm:text-2xl font-mono">
            {stats.pendingCount}
          </p>
        </div>
        <div className="rounded-2xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 p-3 sm:p-4 shadow-sm">
          <p className="text-[11px] font-medium uppercase tracking-wider text-slate-400 sm:text-xs">
            3-Way Matched
          </p>
          <p className="mt-1 text-base font-bold text-emerald-600 dark:text-emerald-400 sm:text-2xl font-mono">
            {stats.matchedCount}
          </p>
        </div>
      </div>

      {/* ── Search & Filters Bar ───────────────────────────────────────────── */}
      <section className="rounded-2xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 p-3.5 shadow-sm sm:p-5">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          {/* Search Input */}
          <div className="relative flex-1 min-w-0">
            <Search
              className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none"
              size={17}
            />
            <input
              type="text"
              placeholder="Search by invoice #, PO #, or vendor name..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="h-10 w-full rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 pl-10 pr-9 text-xs text-slate-900 dark:text-slate-100 placeholder:text-slate-400 outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition sm:text-sm"
            />
            {search && (
              <button
                type="button"
                onClick={() => setSearch("")}
                className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full p-0.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition"
                title="Clear search"
              >
                <X size={15} />
              </button>
            )}
          </div>

          {/* Filter Selects & Actions */}
          <div className="flex flex-col gap-2.5 sm:flex-row sm:items-center sm:flex-wrap lg:flex-nowrap">
            {isCaseManager ? (
              <FilterSelect
                value={statusFilter || "All Status"}
                onChange={setStatusFilter}
                options={CASE_MANAGER_STATUS_OPTIONS}
                placeholder="All Status"
                className="w-full sm:w-56"
                ariaLabel="Invoice status filter"
              />
            ) : (
              <>
                <FilterSelect
                  value={statusFilter}
                  onChange={setStatusFilter}
                  options={APPROVAL_STATUS_OPTIONS}
                  placeholder="All Status"
                  className="w-full sm:w-56"
                />

                <FilterSelect
                  value={paymentStatusFilter}
                  onChange={setPaymentStatusFilter}
                  options={PAYMENT_STATUS_OPTIONS}
                  placeholder="All Payment Status"
                  className="w-full sm:w-52"
                />
              </>
            )}

            {hasActiveFilters && (
              <button
                type="button"
                onClick={handleClearFilters}
                className="inline-flex h-10 items-center justify-center gap-1.5 rounded-xl border border-dashed border-slate-300 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-800/40 px-3 text-xs font-semibold text-slate-600 dark:text-slate-300 transition hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-red-600 dark:hover:text-red-400"
              >
                <RotateCcw size={13} />
                <span>Reset</span>
              </button>
            )}
          </div>
        </div>

        {/* Active Filter Badges */}
        {hasActiveFilters && (
          <div className="mt-3 flex flex-wrap items-center gap-2 pt-3 border-t border-slate-100 dark:border-slate-800/80">
            <span className="text-[11px] font-medium text-slate-400">
              Active filters:
            </span>
            {search.trim() && (
              <span className="inline-flex items-center gap-1 rounded-lg bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-900/60 px-2 py-0.5 text-xs text-blue-700 dark:text-blue-300">
                Search: "{search.trim()}"
                <button
                  type="button"
                  onClick={() => setSearch("")}
                  className="hover:text-blue-900 dark:hover:text-white"
                >
                  <X size={12} />
                </button>
              </span>
            )}
            {!isCaseManager && statusFilter && (
              <span className="inline-flex items-center gap-1 rounded-lg bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900/60 px-2 py-0.5 text-xs text-amber-700 dark:text-amber-300">
                Approval: {statusFilter.replaceAll("_", " ")}
                <button
                  type="button"
                  onClick={() => setStatusFilter("")}
                  className="hover:text-amber-900 dark:hover:text-white"
                >
                  <X size={12} />
                </button>
              </span>
            )}
            {!isCaseManager && paymentStatusFilter && (
              <span className="inline-flex items-center gap-1 rounded-lg bg-indigo-50 dark:bg-indigo-950/40 border border-indigo-200 dark:border-indigo-900/60 px-2 py-0.5 text-xs text-indigo-700 dark:text-indigo-300">
                Payment: {paymentStatusFilter.replaceAll("_", " ")}
                <button
                  type="button"
                  onClick={() => setPaymentStatusFilter("")}
                  className="hover:text-indigo-900 dark:hover:text-white"
                >
                  <X size={12} />
                </button>
              </span>
            )}
            <button
              type="button"
              onClick={handleClearFilters}
              className="text-[11px] font-semibold text-slate-500 hover:text-red-600 dark:hover:text-red-400 transition ml-1"
            >
              Clear all
            </button>
          </div>
        )}
      </section>

      {/* ── Error Banner ───────────────────────────────────────────────────── */}
      {error && (
        <section className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-red-500/20 bg-red-50 dark:bg-red-950/30 p-4 sm:p-5 text-red-800 dark:text-red-300">
          <div className="flex items-center gap-3">
            <AlertTriangle
              className="text-red-600 dark:text-red-400 shrink-0"
              size={20}
            />
            <div>
              <p className="text-sm font-semibold">
                Unable to load invoice history
              </p>
              <p className="mt-0.5 text-xs text-red-600 dark:text-red-400">
                {error}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => loadInvoices(pagination.page)}
            className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-red-300 dark:border-red-800 bg-white dark:bg-slate-900 px-3 text-xs font-semibold text-red-700 dark:text-red-400 transition hover:bg-red-50 dark:hover:bg-slate-800"
          >
            <RefreshCw size={14} /> Retry
          </button>
        </section>
      )}

      {/* ── Main Data View ────────────────────────────────────────────────── */}
      <section className="space-y-4">
        {loading ? (
          /* Skeletons */
          <div className="space-y-4">
            <div className="rounded-2xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 shadow-sm">
              <div className="space-y-3">
                <div className="h-6 w-48 animate-pulse rounded bg-slate-200 dark:bg-slate-800" />
                {Array.from({ length: 5 }).map((_, i) => (
                  <div
                    key={i}
                    className="h-12 w-full animate-pulse rounded-xl bg-slate-100 dark:bg-slate-800/60"
                  />
                ))}
              </div>
            </div>
          </div>
        ) : invoices.length > 0 ? (
          <>
            {/* ── Table Layout (Visible when viewMode === 'table') ── */}
            {viewMode === "table" && (
              <div className="rounded-2xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm dark:shadow-slate-950/40 overflow-hidden">
                {/* Horizontal Scroll Hint for tablet / small laptop screens */}
                <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800/80 px-4 py-2.5 text-xs text-slate-500 dark:text-slate-400 xl:hidden">
                  <span className="flex items-center gap-1.5 text-[11px] text-slate-400">
                    <ArrowRightLeft size={13} />
                    Scroll horizontally to inspect full invoice columns
                  </span>
                  <span className="text-[11px] font-medium text-slate-400">
                    Showing {invoices.length} of {pagination.total}
                  </span>
                </div>

                <div className="overflow-x-auto custom-scrollbar">
                  <table className="w-full min-w-[1150px] divide-y divide-slate-100 dark:divide-slate-800 text-sm">
                    <thead className="bg-slate-50/90 dark:bg-slate-800/80 text-left text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                      <tr>
                        <th className="w-[145px] px-4 py-3.5 whitespace-nowrap">
                          Invoice #
                        </th>
                        <th className="w-[130px] px-4 py-3.5 whitespace-nowrap">
                          PO #
                        </th>
                        <th className="min-w-[210px] max-w-[260px] px-4 py-3.5">
                          Vendor
                        </th>
                        <th className="w-[120px] px-4 py-3.5 whitespace-nowrap">
                          Invoice Date
                        </th>
                        <th className="w-[140px] px-4 py-3.5 text-right whitespace-nowrap">
                          Amount
                        </th>
                        <th className="w-[135px] px-4 py-3.5 text-center whitespace-nowrap">
                          3-Way Match
                        </th>
                        <th className="w-[170px] px-4 py-3.5 text-center whitespace-nowrap">
                          Approval Status
                        </th>
                        <th className="w-[135px] px-4 py-3.5 text-center whitespace-nowrap">
                          Payment Status
                        </th>
                        <th className="w-[120px] px-4 py-3.5 whitespace-nowrap">
                          Created Date
                        </th>
                        <th className="w-[125px] px-4 py-3.5 text-right whitespace-nowrap sticky right-0 bg-slate-50/95 dark:bg-slate-800/95 backdrop-blur-xs border-l border-slate-200/60 dark:border-slate-800 shadow-[-6px_0_10px_rgba(0,0,0,0.02)]">
                          Actions
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60 bg-white dark:bg-slate-900">
                      {invoices.map((row) => (
                        <tr
                          key={row.id}
                          className="transition hover:bg-slate-50/60 dark:hover:bg-slate-800/40 group"
                        >
                          {/* Invoice Number */}
                          <td className="px-4 py-3.5 font-semibold whitespace-nowrap">
                            <Link
                              to={`/invoices/${row.id}`}
                              className="text-blue-600 dark:text-blue-400 hover:underline inline-flex items-center gap-1 font-mono tracking-tight font-bold"
                            >
                              {row.invoiceNumber}
                            </Link>
                          </td>

                          {/* PO Number */}
                          <td className="px-4 py-3.5 font-mono text-xs whitespace-nowrap text-slate-600 dark:text-slate-400">
                            {row.poNumber ? (
                              <span className="inline-block rounded-md bg-slate-100 dark:bg-slate-800/80 px-2 py-0.5 text-slate-700 dark:text-slate-300">
                                {row.poNumber}
                              </span>
                            ) : (
                              <span className="text-slate-400 italic">None</span>
                            )}
                          </td>

                          {/* Vendor */}
                          <td className="px-4 py-3.5 min-w-[210px] max-w-[260px]">
                            <p
                              className="font-semibold text-slate-900 dark:text-slate-100 leading-snug truncate"
                              title={row.vendorName || row.vendor}
                            >
                              {row.vendorName || row.vendor || "N/A"}
                            </p>
                            {row.vendorCode && (
                              <p className="text-xs font-mono text-slate-400 mt-0.5">
                                {row.vendorCode}
                              </p>
                            )}
                          </td>

                          {/* Invoice Date */}
                          <td className="px-4 py-3.5 text-slate-600 dark:text-slate-300 whitespace-nowrap text-xs sm:text-sm">
                            {formatDate(row.invoiceDate)}
                          </td>

                          {/* Amount */}
                          <td className="px-4 py-3.5 text-right font-bold text-slate-900 dark:text-slate-100 whitespace-nowrap font-mono tracking-tight text-sm">
                            {formatCurrency(row.amount, row.currency)}
                          </td>

                          {/* 3-Way Match */}
                          <td className="px-4 py-3.5 text-center whitespace-nowrap">
                            <StatusBadge
                              status={row.threeWayMatchStatus || "PENDING"}
                            />
                          </td>

                          {/* Approval Status */}
                          <td className="px-4 py-3.5 text-center whitespace-nowrap">
                            <StatusBadge status={row.status} />
                          </td>

                          {/* Payment Status */}
                          <td className="px-4 py-3.5 text-center whitespace-nowrap">
                            <StatusBadge status={row.paymentStatus} />
                          </td>

                          {/* Created Date */}
                          <td className="px-4 py-3.5 text-slate-500 dark:text-slate-400 text-xs whitespace-nowrap">
                            {formatDate(row.createdAt)}
                          </td>

                          {/* Actions (Sticky Right Column) */}
                          <td className="px-4 py-3.5 text-right whitespace-nowrap sticky right-0 bg-white dark:bg-slate-900 group-hover:bg-slate-50 dark:group-hover:bg-slate-800/90 border-l border-slate-100 dark:border-slate-800 shadow-[-6px_0_10px_rgba(0,0,0,0.02)]">
                            <div className="flex items-center justify-end gap-1.5">
                              {canActOnInvoice(row, user?.role) && (
                                <>
                                  <button
                                    type="button"
                                    onClick={() => handleApprove(row.id)}
                                    disabled={actionInProgressId === row.id}
                                    className="rounded-lg bg-emerald-600 px-2.5 py-1 text-xs font-semibold text-white hover:bg-emerald-700 transition disabled:opacity-50"
                                  >
                                    Approve
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => handleReject(row.id)}
                                    disabled={actionInProgressId === row.id}
                                    className="rounded-lg bg-red-600 px-2.5 py-1 text-xs font-semibold text-white hover:bg-red-700 transition disabled:opacity-50"
                                  >
                                    Reject
                                  </button>
                                </>
                              )}
                              <button
                                type="button"
                                onClick={() => navigate(`/invoices/${row.id}`)}
                                className="inline-flex h-8 items-center gap-1 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-2.5 text-xs font-semibold text-slate-700 dark:text-slate-200 transition hover:bg-slate-50 dark:hover:bg-slate-700"
                              >
                                <Eye size={13} />
                                View
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* ── Responsive Invoice Cards (Visible when viewMode === 'cards') ── */}
            {viewMode === "cards" && (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5 sm:gap-4">
                {invoices.map((row) => (
                  <div
                    key={row.id}
                    className="rounded-2xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 sm:p-5 shadow-sm space-y-3.5 transition hover:shadow-md dark:shadow-slate-950/40"
                  >
                    {/* Card Top Bar: Invoice # & Approval Status */}
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <Link
                            to={`/invoices/${row.id}`}
                            className="font-mono text-sm sm:text-base font-bold text-blue-600 dark:text-blue-400 hover:underline tracking-tight"
                          >
                            {row.invoiceNumber}
                          </Link>
                          {row.poNumber && (
                            <span className="inline-flex items-center rounded-md bg-slate-100 dark:bg-slate-800 px-2 py-0.5 font-mono text-[11px] font-medium text-slate-600 dark:text-slate-300">
                              PO: {row.poNumber}
                            </span>
                          )}
                        </div>
                        <p className="mt-1 text-[11px] text-slate-400 flex items-center gap-1">
                          <Clock size={11} /> Created {formatDate(row.createdAt)}
                        </p>
                      </div>

                      <div className="shrink-0">
                        <StatusBadge status={row.status} />
                      </div>
                    </div>

                    {/* Vendor & Amount Highlight Section */}
                    <div className="rounded-xl bg-slate-50 dark:bg-slate-800/50 p-3 flex items-center justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 flex items-center gap-1">
                          <Building2 size={11} /> Vendor
                        </p>
                        <p className="font-semibold text-xs sm:text-sm text-slate-900 dark:text-slate-100 truncate mt-0.5">
                          {row.vendorName || row.vendor || "N/A"}
                        </p>
                        {row.vendorCode && (
                          <p className="text-[11px] font-mono text-slate-400">
                            {row.vendorCode}
                          </p>
                        )}
                      </div>

                      <div className="text-right shrink-0">
                        <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                          Total Amount
                        </p>
                        <p className="text-sm sm:text-base font-bold font-mono text-slate-900 dark:text-white tracking-tight mt-0.5">
                          {formatCurrency(row.amount, row.currency)}
                        </p>
                      </div>
                    </div>

                    {/* Card Metadata Details */}
                    <div className="grid grid-cols-2 gap-2 text-xs pt-1 border-t border-slate-100 dark:border-slate-800/80">
                      <div>
                        <span className="text-[11px] text-slate-400 block">
                          Invoice Date
                        </span>
                        <span className="font-medium text-slate-700 dark:text-slate-300 flex items-center gap-1 mt-0.5">
                          <Calendar size={12} className="text-slate-400" />
                          {formatDate(row.invoiceDate)}
                        </span>
                      </div>

                      <div>
                        <span className="text-[11px] text-slate-400 block">
                          3-Way Match
                        </span>
                        <div className="mt-0.5">
                          <StatusBadge
                            status={row.threeWayMatchStatus || "PENDING"}
                          />
                        </div>
                      </div>

                      <div className="col-span-2">
                        <span className="text-[11px] text-slate-400 block">
                          Payment Status
                        </span>
                        <div className="mt-0.5">
                          <StatusBadge status={row.paymentStatus} />
                        </div>
                      </div>
                    </div>

                    {/* Card Action Buttons */}
                    <div className="pt-2 flex items-center justify-between gap-2 border-t border-slate-100 dark:border-slate-800/80">
                      <button
                        type="button"
                        onClick={() => navigate(`/invoices/${row.id}`)}
                        className="inline-flex h-9 flex-1 items-center justify-center gap-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 text-xs font-semibold text-slate-700 dark:text-slate-200 transition hover:bg-slate-50 dark:hover:bg-slate-700"
                      >
                        <Eye size={14} />
                        <span>View Details</span>
                      </button>

                      {canActOnInvoice(row, user?.role) && (
                        <div className="flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => handleApprove(row.id)}
                            disabled={actionInProgressId === row.id}
                            className="inline-flex h-9 items-center justify-center rounded-xl bg-emerald-600 px-3 text-xs font-semibold text-white transition hover:bg-emerald-700 disabled:opacity-50"
                          >
                            Approve
                          </button>
                          <button
                            type="button"
                            onClick={() => handleReject(row.id)}
                            disabled={actionInProgressId === row.id}
                            className="inline-flex h-9 items-center justify-center rounded-xl bg-red-600 px-3 text-xs font-semibold text-white transition hover:bg-red-700 disabled:opacity-50"
                          >
                            Reject
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        ) : !error ? (
          <div className="rounded-2xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 p-8 shadow-sm">
            <EmptyState
              icon={FileText}
              title={
                hasActiveFilters
                  ? "No matching invoices found"
                  : "No invoices yet"
              }
              description={
                hasActiveFilters
                  ? "No invoice records match your current search and filter settings. Try clearing filters."
                  : "No invoice records exist in the system yet."
              }
              action={
                hasActiveFilters ? (
                  <button
                    type="button"
                    onClick={handleClearFilters}
                    className="inline-flex items-center gap-1.5 rounded-xl bg-blue-600 px-4 py-2 text-xs font-semibold text-white hover:bg-blue-700 transition"
                  >
                    <RotateCcw size={14} />
                    Reset Filters
                  </button>
                ) : normalizedRole === ROLES.CASE_MANAGER ? (
                  <Link
                    to="/invoices/create"
                    className="inline-flex items-center gap-1.5 rounded-xl bg-blue-600 px-4 py-2 text-xs font-semibold text-white hover:bg-blue-700 transition"
                  >
                    <Plus size={15} />
                    Create First Invoice
                  </Link>
                ) : null
              }
            />
          </div>
        ) : null}

        {/* ── Server-Side Pagination Bar ───────────────────────────────────── */}
        {!loading && !error && pagination.totalPages > 1 && (
          <div className="pt-2">
            <Pagination
              currentPage={pagination.page}
              totalPages={pagination.totalPages}
              totalItems={pagination.total}
              itemsPerPage={pagination.limit}
              onPageChange={(page) => loadInvoices(page)}
              isLoading={loading}
              label="invoices"
            />
          </div>
        )}
      </section>
    </div>
  );
};

export default InvoiceList;
