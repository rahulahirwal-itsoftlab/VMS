import { useCallback, useEffect, useMemo, useState } from "react";
import { CheckCircle2, Eye, Loader2, RefreshCw, Search, XCircle } from "lucide-react";
import { Link } from "react-router-dom";

import ConfirmationModal from "../../components/common/ConfirmationModal";
import StatusBadge from "../../components/common/StatusBadge";
import Pagination from "../../components/common/Pagination";
import {
  approveInvoiceWithRemarks,
  getFinanceHeadInvoiceApprovals,
  rejectInvoice,
} from "../../services/invoiceService";
import { getErrorMessage, notify } from "../../utils/feedback";

const formatCurrency = (value, currency = "INR") =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: currency || "INR",
    maximumFractionDigits: 2,
  }).format(Number(value || 0));

const formatDate = (value) => (value ? new Date(value).toLocaleDateString("en-IN") : "-");

const FinanceHeadInvoiceApprovals = () => {
  const [invoices, setInvoices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [query, setQuery] = useState({ page: 1, limit: 10, search: "" });
  const [action, setAction] = useState(null);
  const [remarks, setRemarks] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [pagination, setPagination] = useState({
    total: 0,
    page: 1,
    limit: 10,
    totalPages: 1,
  });

  const loadInvoices = useCallback(async ({ silent = false } = {}) => {
    if (silent) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }
    setError("");

    try {
      const result = await getFinanceHeadInvoiceApprovals(query);
      setInvoices(result.invoices);
      setPagination({
        total: result.total,
        page: result.page,
        limit: result.limit,
        totalPages: result.totalPages,
      });
    } catch (err) {
      setError(getErrorMessage(err, "Finance Head invoice approvals could not be loaded."));
      setInvoices([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [query]);

  useEffect(() => {
    loadInvoices();
  }, [loadInvoices]);

  const pageRange = useMemo(() => {
    const totalPages = Math.max(Number(pagination.totalPages || 1), 1);
    return Array.from({ length: totalPages }, (_, index) => index + 1).slice(0, 7);
  }, [pagination.totalPages]);

  const submitSearch = (event) => {
    event.preventDefault();
    setQuery((current) => ({ ...current, page: 1, search: searchInput.trim() }));
  };

  const openAction = (type, invoice) => {
    setAction({ type, invoice });
    setRemarks("");
  };

  const closeAction = () => {
    if (submitting) return;
    setAction(null);
    setRemarks("");
  };

  const handleConfirmAction = async () => {
    if (!action?.invoice) return;

    if (action.type === "reject" && !remarks.trim()) {
      notify.error("Rejection reason is required.");
      return;
    }

    setSubmitting(true);
    try {
      if (action.type === "approve") {
        await approveInvoiceWithRemarks(action.invoice.id, remarks.trim());
        notify.success("Invoice approved successfully.");
      } else {
        await rejectInvoice(action.invoice.id, remarks.trim());
        notify.success("Invoice rejected successfully.");
      }

      setAction(null);
      setRemarks("");
      await loadInvoices({ silent: true });
    } catch (err) {
      notify.error(getErrorMessage(err, "Invoice approval action failed."));
    } finally {
      setSubmitting(false);
    }
  };

  const changePage = (page) => {
    if (page < 1 || page > pagination.totalPages || page === query.page) return;
    setQuery((current) => ({ ...current, page }));
  };

  const actionInvoice = action?.invoice;
  const isReject = action?.type === "reject";

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 shadow-sm dark:shadow-slate-950/40">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-sm font-medium text-slate-500">Finance Head</p>
            <h1 className="mt-2 text-3xl font-bold tracking-tight text-slate-950">
              Invoice Approvals
            </h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-500">
              Real INR invoices awaiting Finance Head approval at or above the configured approval threshold.
            </p>
          </div>

          <div className="flex flex-col gap-3 sm:flex-row">
            <form onSubmit={submitSearch} className="relative">
              <Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-slate-400" />
              <input
                className="h-10 w-full rounded-xl border border-slate-200 bg-white pl-10 pr-3 text-sm text-slate-700 outline-none focus:border-blue-500 sm:w-72"
                value={searchInput}
                onChange={(event) => setSearchInput(event.target.value)}
                placeholder="Search invoice, vendor, PO"
                aria-label="Search invoice approvals"
              />
            </form>
            <button
              type="button"
              onClick={() => loadInvoices({ silent: true })}
              disabled={refreshing}
              className="inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:opacity-60"
            >
              <RefreshCw size={16} className={refreshing ? "animate-spin" : ""} />
              Refresh
            </button>
          </div>
        </div>
      </section>

      {error ? (
        <section className="rounded-2xl border border-red-200 bg-red-50 p-5 text-sm font-medium text-red-800">
          {error}
        </section>
      ) : null}

      <section className="overflow-hidden rounded-2xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm dark:shadow-slate-950/40">
        {loading ? (
          <div className="flex h-80 items-center justify-center gap-3 text-sm font-medium text-slate-500">
            <Loader2 className="h-5 w-5 animate-spin" />
            Loading invoice approvals...
          </div>
        ) : invoices.length === 0 ? (
          <div className="flex h-80 items-center justify-center px-6 text-center">
            <div>
              <h2 className="text-lg font-semibold text-slate-900">No invoice approvals waiting</h2>
              <p className="mt-2 text-sm text-slate-500">
                There are no eligible INR invoices awaiting Finance Head approval for the current search.
              </p>
            </div>
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-slate-200">
                <thead className="bg-slate-50">
                  <tr>
                    {[
                      "Invoice",
                      "Vendor",
                      "PO",
                      "Dates",
                      "Amount",
                      "Payment",
                      "Status",
                      "Submitted By",
                      "Actions",
                    ].map((heading) => (
                      <th key={heading} className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                        {heading}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 bg-white">
                  {invoices.map((invoice) => (
                    <tr key={invoice.id} className="align-top hover:bg-slate-50">
                      <td className="px-4 py-4">
                        <Link to={`/invoices/${invoice.id}`} className="font-semibold text-blue-700 hover:underline">
                          {invoice.invoiceNumber}
                        </Link>
                        <p className="mt-1 text-xs text-slate-500">{invoice.currency}</p>
                      </td>
                      <td className="px-4 py-4">
                        <p className="font-medium text-slate-900">{invoice.vendor || "-"}</p>
                        <p className="mt-1 text-xs text-slate-500">{invoice.vendorStatus}</p>
                      </td>
                      <td className="px-4 py-4 text-sm text-slate-700">{invoice.poNumber || "-"}</td>
                      <td className="px-4 py-4 text-sm text-slate-700">
                        <p>Invoice: {formatDate(invoice.invoiceDate)}</p>
                        <p className="mt-1 text-xs text-slate-500">Due: {formatDate(invoice.dueDate)}</p>
                      </td>
                      <td className="px-4 py-4 text-sm text-slate-700">
                        <p className="font-semibold text-slate-950">{formatCurrency(invoice.amount, invoice.currency)}</p>
                        <p className="mt-1 text-xs text-slate-500">Paid {formatCurrency(invoice.paidAmount, invoice.currency)}</p>
                        <p className="text-xs text-slate-500">Outstanding {formatCurrency(invoice.outstandingAmount, invoice.currency)}</p>
                      </td>
                      <td className="px-4 py-4"><StatusBadge status={invoice.paymentStatus} /></td>
                      <td className="px-4 py-4">
                        <StatusBadge status={invoice.status} />
                        <p className="mt-2 text-xs font-medium text-slate-500">{invoice.currentApprovalLevel || "-"}</p>
                      </td>
                      <td className="px-4 py-4 text-sm text-slate-700">
                        <p>{invoice.createdBy}</p>
                        <p className="mt-1 text-xs text-slate-500">{formatDate(invoice.createdAt)}</p>
                      </td>
                      <td className="px-4 py-4">
                        <div className="flex flex-wrap items-center gap-2">
                          <Link
                            to={`/invoices/${invoice.id}`}
                            className="inline-flex h-9 items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                          >
                            <Eye size={14} />
                            Review
                          </Link>
                          <button
                            type="button"
                            onClick={() => openAction("approve", invoice)}
                            className="inline-flex h-9 items-center gap-2 rounded-lg bg-emerald-600 px-3 text-xs font-semibold text-white hover:bg-emerald-700"
                          >
                            <CheckCircle2 size={14} />
                            Approve
                          </button>
                          <button
                            type="button"
                            onClick={() => openAction("reject", invoice)}
                            className="inline-flex h-9 items-center gap-2 rounded-lg bg-red-600 px-3 text-xs font-semibold text-white hover:bg-red-700"
                          >
                            <XCircle size={14} />
                            Reject
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {!loading && pagination.totalPages > 1 && (
              <div className="p-4 border-t border-slate-200/80 dark:border-slate-800">
                <Pagination
                  currentPage={pagination.page}
                  totalPages={pagination.totalPages}
                  totalItems={pagination.total}
                  itemsPerPage={pagination.limit}
                  onPageChange={(page) => changePage(page)}
                  isLoading={loading}
                  label="invoices"
                />
              </div>
            )}
          </>
        )}
      </section>

      <ConfirmationModal
        open={Boolean(action)}
        title={isReject ? "Reject invoice?" : "Approve invoice?"}
        description={
          isReject
            ? "A rejection reason is required and will be recorded in the audit history."
            : "This will complete the Finance Head approval step after backend eligibility checks pass."
        }
        confirmLabel={isReject ? "Reject Invoice" : "Approve Invoice"}
        variant={isReject ? "destructive" : "default"}
        loading={submitting}
        disabled={isReject && !remarks.trim()}
        onCancel={closeAction}
        onConfirm={handleConfirmAction}
        ariaLabel={isReject ? "Reject invoice confirmation" : "Approve invoice confirmation"}
      >
        {actionInvoice ? (
          <div className="space-y-4">
            <dl className="grid gap-3 rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm sm:grid-cols-2">
              <div>
                <dt className="font-semibold text-slate-500">Invoice</dt>
                <dd className="mt-1 text-slate-900">{actionInvoice.invoiceNumber}</dd>
              </div>
              <div>
                <dt className="font-semibold text-slate-500">Vendor</dt>
                <dd className="mt-1 text-slate-900">{actionInvoice.vendor}</dd>
              </div>
              <div>
                <dt className="font-semibold text-slate-500">Amount</dt>
                <dd className="mt-1 text-slate-900">{formatCurrency(actionInvoice.amount, actionInvoice.currency)}</dd>
              </div>
              <div>
                <dt className="font-semibold text-slate-500">Due Date</dt>
                <dd className="mt-1 text-slate-900">{formatDate(actionInvoice.dueDate)}</dd>
              </div>
            </dl>
            <label className="block text-sm">
              <span className="font-semibold text-slate-700">
                {isReject ? "Rejection reason" : "Approval remarks"}
              </span>
              <textarea
                className="mt-2 min-h-28 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-blue-500"
                value={remarks}
                onChange={(event) => setRemarks(event.target.value)}
                placeholder={isReject ? "Explain why this invoice is rejected" : "Optional remarks"}
                maxLength={1000}
              />
            </label>
          </div>
        ) : null}
      </ConfirmationModal>
    </div>
  );
};

export default FinanceHeadInvoiceApprovals;
