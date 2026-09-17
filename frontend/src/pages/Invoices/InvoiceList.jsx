import { useState, useEffect, useCallback } from "react";
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

const InvoiceList = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const normalizedRole = (user?.role || "").toUpperCase();

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
  const [statusFilter, setStatusFilter] = useState("");
  const [paymentStatusFilter, setPaymentStatusFilter] = useState("");

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
        if (statusFilter) params.status = statusFilter;
        if (paymentStatusFilter) params.paymentStatus = paymentStatusFilter;

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
      await approveInvoice(id);
      await loadInvoices(pagination.page);
      alert("Invoice approved successfully");
    } catch (err) {
      console.error(err);
      alert(err?.response?.data?.message || "Unable to approve invoice");
    }
  };

  const handleReject = async (id) => {
    try {
      await rejectInvoice(id, `Rejected by ${user?.role || "approver"}`);
      await loadInvoices(pagination.page);
      alert("Invoice rejected successfully");
    } catch (err) {
      console.error(err);
      alert(err?.response?.data?.message || "Unable to reject invoice");
    }
  };

  const rowActions = (row) => (
    <button
      key={row.id}
      type="button"
      onClick={() => navigate(`/invoices/${row.id}`)}
      className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 text-xs font-semibold text-slate-700 dark:text-slate-200 transition hover:bg-slate-50 dark:hover:bg-slate-700"
    >
      <Eye size={14} />
      View
    </button>
  );

  return (
    <div className="space-y-6">
      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight text-slate-900 dark:text-slate-100 font-heading sm:text-3xl">
            Invoice History
          </h1>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400 sm:text-sm">
            Track and manage all historical vendor invoices .
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => loadInvoices(pagination.page)}
            disabled={loading}
            className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 px-3 text-xs font-semibold text-slate-700 dark:text-slate-200 transition hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-60 sm:h-10 sm:px-4 sm:text-sm"
          >
            <RefreshCw size={15} className={loading ? "animate-spin" : ""} />
            Refresh
          </button>
          {normalizedRole === ROLES.CASE_MANAGER && (
            <Link
              to="/invoices/create"
              className="inline-flex h-9 items-center gap-1.5 rounded-xl bg-blue-600 px-3 text-xs font-semibold text-white transition hover:bg-blue-700 sm:h-10 sm:px-4 sm:text-sm"
            >
              <Plus size={16} />
              Create Invoice
            </Link>
          )}
        </div>
      </div>

      {/* ── Search & Filters Bar ───────────────────────────────────────────── */}
      <section className="rounded-2xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 shadow-sm dark:shadow-slate-950/40 sm:p-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="relative flex-1">
            <Search
              className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
              size={17}
            />
            <input
              type="text"
              placeholder="Search by Invoice , PO , or Vendor Name/Code..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="h-10 w-full rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 pl-9 pr-4 text-xs text-slate-900 dark:text-slate-100 placeholder:text-slate-400 outline-none focus:border-blue-500 transition sm:text-sm"
            />
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <FilterSelect
              value={statusFilter}
              onChange={setStatusFilter}
              options={[
                { value: "", label: "All Approval Statuses" },
                { value: "APPROVED", label: "Approved" },
                {
                  value: "PENDING_THREE_WAY_MATCH",
                  label: "PENDING THREE-WAY MATCH",
                },
                {
                  value: "PENDING_ADMIN_REVIEW",
                  label: "Pending Admin Review",
                },
                { value: "PENDING_TEAM_LEAD", label: "PENDING BY TEAM LEAD" },
                { value: "PENDING_MANAGER", label: "PENDING BY MANAGER" },
                {
                  value: "PENDING_FINANCE_HEAD",
                  label: "PENDING BY FINANCE HEAD",
                },
                { value: "REJECTED", label: "Rejected" },
              ]}
              placeholder="All Approval Statuses"
              className="w-full sm:w-56"
            />

            <FilterSelect
              value={paymentStatusFilter}
              onChange={setPaymentStatusFilter}
              options={[
                { value: "", label: "All Payment Statuses" },
                { value: "UNPAID", label: "Unpaid" },
                { value: "PARTIALLY_PAID", label: "Partially Paid" },
                { value: "PAID", label: "Paid" },
                { value: "OVERDUE", label: "Overdue" },
              ]}
              placeholder="All Payment Statuses"
              className="w-full sm:w-52"
            />
          </div>
        </div>
      </section>

      {/* ── Error Banner ───────────────────────────────────────────────────── */}
      {error && (
        <section className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-red-500/20 bg-red-50 dark:bg-red-950/30 p-5 text-red-800 dark:text-red-300">
          <div className="flex items-center gap-3">
            <AlertTriangle
              className="text-red-600 dark:text-red-400"
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

      {/* ── Main Data Table / Skeleton ────────────────────────────────────── */}
      <section className="rounded-2xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm dark:shadow-slate-950/40 overflow-hidden">
        {loading ? (
          <div className="space-y-4 p-6">
            <div className="h-6 w-48 animate-pulse rounded bg-slate-200 dark:bg-slate-800" />
            <div className="space-y-3">
              {Array.from({ length: 5 }).map((_, i) => (
                <div
                  key={i}
                  className="h-12 w-full animate-pulse rounded-xl bg-slate-100 dark:bg-slate-800/60"
                />
              ))}
            </div>
          </div>
        ) : invoices.length > 0 ? (
          <div className="overflow-x-auto custom-scrollbar">
            <table className="min-w-full divide-y divide-slate-100 dark:divide-slate-800 text-sm">
              <thead className="bg-slate-50 dark:bg-slate-800/80 text-left text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                <tr>
                  <th className="px-4 py-3.5">Invoice </th>
                  <th className="px-4 py-3.5">PO </th>
                  <th className="px-4 py-3.5">Vendor</th>
                  <th className="px-4 py-3.5">Invoice Date</th>
                  <th className="px-4 py-3.5 text-right">Amount</th>
                  <th className="px-4 py-3.5 text-center">3-Way Match</th>
                  <th className="px-4 py-3.5 text-center">Approval Status</th>
                  <th className="px-4 py-3.5 text-center">Payment Status</th>
                  <th className="px-4 py-3.5">Created Date</th>
                  <th className="px-4 py-3.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60 bg-white dark:bg-slate-900">
                {invoices.map((row) => (
                  <tr
                    key={row.id}
                    className="transition hover:bg-slate-50/60 dark:hover:bg-slate-800/40"
                  >
                    <td className="px-4 py-3.5 font-semibold">
                      <Link
                        to={`/invoices/${row.id}`}
                        className="text-blue-600 dark:text-blue-400 hover:underline"
                      >
                        {row.invoiceNumber}
                      </Link>
                    </td>
                    <td className="px-4 py-3.5 text-slate-600 dark:text-slate-400 font-mono text-xs">
                      {row.poNumber || "N/A"}
                    </td>
                    <td className="px-4 py-3.5">
                      <p className="font-semibold text-slate-900 dark:text-slate-100">
                        {row.vendorName || row.vendor || "N/A"}
                      </p>
                      {row.vendorCode && (
                        <p className="text-xs font-mono text-slate-400">
                          {row.vendorCode}
                        </p>
                      )}
                    </td>
                    <td className="px-4 py-3.5 text-slate-600 dark:text-slate-300 whitespace-nowrap">
                      {formatDate(row.invoiceDate)}
                    </td>
                    <td className="px-4 py-3.5 text-right font-bold text-slate-900 dark:text-slate-100 whitespace-nowrap">
                      {formatCurrency(row.amount, row.currency)}
                    </td>
                    <td className="px-4 py-3.5 text-center">
                      <StatusBadge
                        status={row.threeWayMatchStatus || "PENDING"}
                      />
                    </td>
                    <td className="px-4 py-3.5 text-center">
                      <StatusBadge status={row.status} />
                    </td>
                    <td className="px-4 py-3.5 text-center">
                      <StatusBadge status={row.paymentStatus} />
                    </td>
                    <td className="px-4 py-3.5 text-slate-500 dark:text-slate-400 text-xs whitespace-nowrap">
                      {formatDate(row.createdAt)}
                    </td>
                    <td className="px-4 py-3.5 text-right">
                      <div className="flex items-center justify-end gap-2">
                        {canActOnInvoice(row, user?.role) && (
                          <>
                            <button
                              type="button"
                              onClick={() => handleApprove(row.id)}
                              className="rounded-lg bg-emerald-600 px-2.5 py-1 text-xs font-semibold text-white hover:bg-emerald-700"
                            >
                              Approve
                            </button>
                            <button
                              type="button"
                              onClick={() => handleReject(row.id)}
                              className="rounded-lg bg-red-600 px-2.5 py-1 text-xs font-semibold text-white hover:bg-red-700"
                            >
                              Reject
                            </button>
                          </>
                        )}
                        {rowActions(row)}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : !error ? (
          <div className="p-8">
            <EmptyState
              icon={FileText}
              title="No invoices found"
              description="No invoice records exist for the specified search or filter criteria."
            />
          </div>
        ) : null}

        {/* ── Server-Side Pagination Bar ───────────────────────────────────── */}
        {!loading && !error && pagination.totalPages > 1 && (
          <div className="p-4 border-t border-slate-200/80 dark:border-slate-800">
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
