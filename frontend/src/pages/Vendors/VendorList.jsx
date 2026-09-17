import React, { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  AlertTriangle,
  Check,
  Loader2,
  Plus,
  RefreshCw,
  RotateCcw,
  X,
  Search,
  Building2,
  Eye,
  Edit,
  Clock,
  CheckCircle2,
  XCircle,
} from "lucide-react";

import ConfirmationModal from "../../components/common/ConfirmationModal";
import EmptyState from "../../components/common/EmptyState";
import StatusBadge from "../../components/common/StatusBadge";
import Button from "../../components/common/Button";
import Pagination from "../../components/common/Pagination";
import VendorDocumentsPanel from "../../components/vendors/VendorDocumentsPanel";
import { useAuth } from "../../context/AuthContext";
import FilterSelect from "../../components/common/FilterSelect";
import DateInput from "../../components/common/DateInput";
import { hasPermission, PERMISSIONS, ROLES } from "../../config/permissions";
import { getErrorMessage, notify } from "../../utils/feedback";
import {
  approveVendor,
  blockVendor,
  getVendors,
  holdVendor,
  rejectVendor,
  returnVendorToPending,
} from "../../services/vendorService";
import { emitNotificationsChanged } from "../../services/notificationService";

const statusOptions = [
  { label: "All statuses", value: "" },
  { label: "Pending Review", value: "pending" },
  { label: "On Hold / Blocked", value: "blocked" },
  { label: "Approved", value: "approved" },
  { label: "Rejected", value: "rejected" },
];

const initialReviewForm = {
  reason: "",
  correctiveAction: "",
  followUpDate: "",
  blockCategory: "",
  remarks: "",
};

const actionRequiresReason = (type) =>
  ["reject", "hold", "block", "pending"].includes(type);

const buildActionPayload = (type, form) => ({
  ...(actionRequiresReason(type) && { reason: form.reason.trim() }),
  ...(type === "hold" && { correctiveAction: form.correctiveAction.trim() }),
  ...(type === "hold" &&
    form.followUpDate && { followUpDate: form.followUpDate }),
  ...(type === "block" &&
    form.blockCategory.trim() && { blockCategory: form.blockCategory.trim() }),
  ...(form.remarks.trim() && { remarks: form.remarks.trim() }),
});

const canShowReviewActions = (vendor) => vendor.status === "pending";
const canShowApproveAction = (vendor) =>
  canShowReviewActions(vendor) && Boolean(vendor.approvalReadiness?.ready);
const canShowReturnPending = (vendor) =>
  ["blocked", "rejected"].includes(vendor.status);
const canShowBlockAction = (vendor) =>
  ["pending", "active", "approved"].includes(vendor.status);
const getReadinessReasons = (readiness = {}) => {
  const reasons = readiness.reasons?.length
    ? readiness.reasons
    : [
        ...(readiness.missing || []).map((field) => `Missing ${field}`),
        ...(readiness.missingDocuments || []).map(
          (document) => `Missing ${document}`,
        ),
        ...(readiness.invalid || []),
      ];
  return reasons.length ? reasons : ["No blocking issues reported."];
};

const StatCard = ({
  title,
  value,
  tone = "blue",
  icon: Icon,
  isActive = false,
  onClick,
}) => {
  const valueTitle = value === null || value === undefined ? "" : String(value);
  const wrappingStyle = { overflowWrap: "anywhere" };

  const tones = {
    blue: "text-blue-600 dark:text-blue-400 bg-blue-50/80 dark:bg-blue-950/50 border-blue-500/20",
    amber:
      "text-amber-600 dark:text-amber-400 bg-amber-50/80 dark:bg-amber-950/50 border-amber-500/20",
    green:
      "text-emerald-600 dark:text-emerald-400 bg-emerald-50/80 dark:bg-emerald-950/50 border-emerald-500/20",
    red: "text-red-600 dark:text-red-400 bg-red-50/80 dark:bg-red-950/50 border-red-500/20",
  };

  const activeBorders = {
    blue: "ring-2 ring-blue-500/80 border-blue-500 shadow-blue-500/10",
    amber: "ring-2 ring-amber-500/80 border-amber-500 shadow-amber-500/10",
    green:
      "ring-2 ring-emerald-500/80 border-emerald-500 shadow-emerald-500/10",
    red: "ring-2 ring-red-500/80 border-red-500 shadow-red-500/10",
  };

  return (
    <div
      onClick={onClick}
      role="button"
      tabIndex={0}
      className={`group relative cursor-pointer rounded-xl sm:rounded-2xl border bg-white dark:bg-slate-900 p-2.5 sm:p-3.5 md:p-4 min-h-24 flex flex-col justify-between shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md dark:shadow-slate-950/40 w-full min-w-0 ${
        isActive
          ? `${activeBorders[tone]} bg-slate-50/90 dark:bg-slate-800/90`
          : "border-slate-200/80 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700"
      }`}
    >
      <div className="flex items-center justify-between gap-1 sm:gap-2 min-w-0">
        <p
          className="min-w-0 break-words text-[10px] sm:text-xs md:text-sm font-semibold tracking-tight text-slate-500 dark:text-slate-400"
          title={title}
        >
          {title}
        </p>
        {Icon && (
          <div
            className={`rounded-lg p-1 sm:p-1.5 transition-transform duration-200 group-hover:scale-105 shrink-0 ${tones[tone]}`}
          >
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

const VendorReviewDrawer = ({
  vendor,
  onClose,
  canManageDocuments = false,
}) => {
  const [activeVendor, setActiveVendor] = useState(vendor);
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    if (vendor) {
      setActiveVendor(vendor);
      const timer = setTimeout(() => setIsOpen(true), 10);
      return () => clearTimeout(timer);
    } else {
      setIsOpen(false);
      const timer = setTimeout(() => setActiveVendor(null), 300);
      return () => clearTimeout(timer);
    }
  }, [vendor]);

  const handleClose = () => {
    setIsOpen(false);
    setTimeout(() => {
      onClose();
      setActiveVendor(null);
    }, 300);
  };

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === "Escape" && activeVendor) {
        handleClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [activeVendor]);

  if (!activeVendor && !isOpen) return null;

  const currentVendor = vendor || activeVendor;
  if (!currentVendor) return null;

  const details = [
    ["Vendor Code", currentVendor.vendorCode],
    ["Legal / Display Name", currentVendor.companyName],
    ["Category", currentVendor.category],
    ["Status", currentVendor.status],
    ["Tax ID / GST", currentVendor.gst],
    ["Contact Person", currentVendor.contactPerson],
    ["Email", currentVendor.email],
    ["Phone", currentVendor.phone],
    ["Address", currentVendor.address],
    ["City", currentVendor.city],
    ["State", currentVendor.state],
    ["Postal Code", currentVendor.postalCode],
    ["Bank Account", currentVendor.maskedBankAccountNo || "Not provided"],
    ["IFSC", currentVendor.ifscCode],
    ["Payment Terms", currentVendor.paymentTerms],
    ["Created By", currentVendor.createdBy],
    ["Approved By", currentVendor.approvedBy],
  ];

  return (
    <div
      className={`fixed inset-0 z-50 overflow-hidden ${activeVendor || isOpen ? "visible" : "invisible"}`}
    >
      {/* Backdrop with Fade Animation */}
      <div
        className={`fixed inset-0 bg-slate-950/60 backdrop-blur-sm transition-opacity duration-300 ease-in-out ${
          isOpen ? "opacity-100" : "opacity-0"
        }`}
        aria-label="Close vendor review"
        onClick={handleClose}
      />

      {/* Sidebar Panel with Slide Animation */}
      <aside
        className={`fixed inset-y-0 right-0 z-50 flex w-full max-w-full sm:max-w-xl md:max-w-3xl lg:max-w-4xl flex-col bg-white dark:bg-slate-900 border-l border-slate-200 dark:border-slate-800 shadow-2xl transition-transform duration-300 ease-in-out transform ${
          isOpen ? "translate-x-0" : "translate-x-full"
        }`}
      >
        <div className="flex items-start justify-between border-b border-slate-100 dark:border-slate-800 px-4 py-4 sm:px-6 sm:py-5">
          <div>
            <p className="text-xs font-bold uppercase tracking-wider text-blue-600 dark:text-blue-400">
              Vendor Finance Review
            </p>
            <h2 className="mt-1 text-2xl font-extrabold tracking-tight text-slate-900 dark:text-slate-100 font-heading">
              {currentVendor.companyName}
            </h2>
            <p className="mt-0.5 text-xs text-slate-500 font-mono">
              {currentVendor.vendorCode}
            </p>
          </div>
          <button
            type="button"
            className="rounded-xl p-2 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
            onClick={handleClose}
          >
            <X size={20} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-6 custom-scrollbar">
          <div className="grid gap-4 md:grid-cols-2">
            {details.map(([label, value]) => (
              <div
                key={label}
                className="rounded-2xl border border-slate-200/80 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950/40 p-4"
              >
                <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                  {label}
                </p>
                <p className="mt-1 text-sm font-bold text-slate-900 dark:text-slate-100">
                  {value || "Not provided"}
                </p>
              </div>
            ))}
          </div>

          <div className="mt-6">
            <VendorDocumentsPanel
              vendorId={currentVendor.id}
              initialDocuments={currentVendor.documents || []}
              readOnly={!canManageDocuments}
            />
          </div>
        </div>
      </aside>
    </div>
  );
};

const VendorList = () => {
  const { user } = useAuth();
  const isFinanceHead = user?.role === ROLES.FINANCE_HEAD;
  const canReviewVendors = hasPermission(user, PERMISSIONS.REVIEW_VENDORS);
  const [vendors, setVendors] = useState([]);
  const [summary, setSummary] = useState({
    pending: 0,
    approved: 0,
    rejected: 0,
    blocked: 0,
    onHold: 0,
  });
  const [pagination, setPagination] = useState({
    page: 1,
    totalPages: 1,
    total: 0,
  });
  const [filters, setFilters] = useState({
    search: "",
    status: "",
    page: 1,
    limit: 10,
    sortField: "created_at",
    sortOrder: "desc",
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selectedVendor, setSelectedVendor] = useState(null);
  const [pendingAction, setPendingAction] = useState(null);
  const [reviewForm, setReviewForm] = useState(initialReviewForm);
  const [actionLoading, setActionLoading] = useState(false);

  const loadVendors = useCallback(async () => {
    try {
      setLoading(true);
      setError("");
      const result = await getVendors(filters);
      setVendors(result.vendors);
      setSummary(result.summary);
      setPagination({
        page: result.page,
        totalPages: result.totalPages,
        total: result.total,
      });
    } catch (err) {
      setError(getErrorMessage(err, "Vendor review data could not be loaded."));
    } finally {
      setLoading(false);
    }
  }, [filters]);

  useEffect(() => {
    loadVendors();
  }, [loadVendors]);

  const updateFilter = (key, value) => {
    setFilters((current) => ({ ...current, [key]: value, page: 1 }));
  };

  const openAction = (type, vendor) => {
    setPendingAction({ type, vendor });
    setReviewForm(initialReviewForm);
  };

  const closeAction = () => {
    if (actionLoading) return;
    setPendingAction(null);
    setReviewForm(initialReviewForm);
  };

  const submitAction = async () => {
    if (!pendingAction) return;
    if (actionRequiresReason(pendingAction.type) && !reviewForm.reason.trim()) {
      notify.error("A reason is required for this Finance review action.");
      return;
    }
    if (pendingAction.type === "hold" && !reviewForm.correctiveAction.trim()) {
      notify.error(
        "Corrective action is required before placing a vendor on hold.",
      );
      return;
    }

    try {
      setActionLoading(true);
      const payload = buildActionPayload(pendingAction.type, reviewForm);
      if (pendingAction.type === "approve") {
        await approveVendor(pendingAction.vendor.id, payload);
        notify.success("Vendor approved successfully.");
      } else if (pendingAction.type === "reject") {
        await rejectVendor(pendingAction.vendor.id, payload);
        notify.success("Vendor rejected successfully.");
      } else if (pendingAction.type === "hold") {
        await holdVendor(pendingAction.vendor.id, payload);
        notify.success("Vendor placed on hold.");
      } else if (pendingAction.type === "block") {
        await blockVendor(pendingAction.vendor.id, payload);
        notify.success("Vendor blocked successfully.");
      } else if (pendingAction.type === "pending") {
        await returnVendorToPending(pendingAction.vendor.id, payload);
        notify.success("Vendor returned to pending review.");
      }
      setPendingAction(null);
      setReviewForm(initialReviewForm);
      await loadVendors();
      emitNotificationsChanged();
    } catch (err) {
      notify.error(getErrorMessage(err, "Vendor review action failed."));
    } finally {
      setActionLoading(false);
    }
  };

  const actionTitle =
    {
      approve: "Approve Vendor",
      reject: "Reject Vendor",
      hold: "Place Vendor On Hold",
      block: "Block Vendor",
      pending: "Return Vendor To Pending",
    }[pendingAction?.type] || "Vendor Review";

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight text-slate-900 dark:text-slate-100 font-heading sm:text-3xl">
            Vendor Directory
          </h1>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400 sm:text-sm">
            Review vendor identity, compliance, banking status, and lifecycle
            approvals.
          </p>
        </div>
        {!isFinanceHead && (
          <Link to="/vendors/new">
            <Button variant="primary" leftIcon={Plus}>
              Add Vendor
            </Button>
          </Link>
        )}
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-4 sm:gap-4 w-full">
        <StatCard
          title="Pending Review"
          value={summary.pending || 0}
          tone="blue"
          icon={Clock}
          isActive={filters.status === "pending"}
          onClick={() =>
            updateFilter(
              "status",
              filters.status === "pending" ? "" : "pending",
            )
          }
        />
        <StatCard
          title="On Hold / Blocked"
          value={summary.onHold ?? summary.blocked ?? 0}
          tone="amber"
          icon={AlertTriangle}
          isActive={filters.status === "blocked"}
          onClick={() =>
            updateFilter(
              "status",
              filters.status === "blocked" ? "" : "blocked",
            )
          }
        />
        <StatCard
          title="Approved"
          value={summary.approved || 0}
          tone="green"
          icon={CheckCircle2}
          isActive={filters.status === "approved"}
          onClick={() =>
            updateFilter(
              "status",
              filters.status === "approved" ? "" : "approved",
            )
          }
        />
        <StatCard
          title="Rejected"
          value={summary.rejected || 0}
          tone="red"
          icon={XCircle}
          isActive={filters.status === "rejected"}
          onClick={() =>
            updateFilter(
              "status",
              filters.status === "rejected" ? "" : "rejected",
            )
          }
        />
      </div>

      {/* Controls Bar */}
      <section className="rounded-2xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 shadow-sm dark:shadow-slate-950/40">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
          <div className="relative flex-1">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <input
              className="w-full h-10 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 pl-10 pr-4 text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 outline-none focus:border-blue-500 transition"
              placeholder="Search vendor name, code, email, or GST ID..."
              value={filters.search}
              onChange={(event) => updateFilter("search", event.target.value)}
            />
          </div>

          <FilterSelect
            value={filters.status}
            onChange={(nextValue) => updateFilter("status", nextValue)}
            options={statusOptions}
            placeholder="All Statuses"
            ariaLabel="Vendor status filter"
            className="w-full sm:w-52"
          />

          <Button variant="outline" leftIcon={RefreshCw} onClick={loadVendors}>
            Refresh
          </Button>
        </div>
      </section>

      {error && (
        <section className="rounded-2xl border border-red-500/20 bg-red-50 dark:bg-red-950/30 p-5 text-sm font-bold text-red-700 dark:text-red-400">
          {error}
        </section>
      )}

      {/* Main Table */}
      <section className="overflow-hidden rounded-2xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm dark:shadow-slate-950/40">
        {loading ? (
          <div className="flex h-64 items-center justify-center gap-2 text-slate-400 text-sm">
            <Loader2 className="animate-spin text-blue-500" size={20} />
            Loading vendor directory...
          </div>
        ) : vendors.length ? (
          <div className="overflow-x-auto custom-scrollbar">
            <table className="min-w-full divide-y divide-slate-100 dark:divide-slate-800 text-sm">
              <thead className="bg-slate-50 dark:bg-slate-800/80 text-left text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                <tr>
                  <th className="px-5 py-4">Vendor</th>
                  <th className="px-5 py-4">Contact</th>
                  <th className="px-5 py-4">Category</th>
                  <th className="px-5 py-4">Status</th>
                  <th className="px-5 py-4">Created By</th>
                  <th className="px-5 py-4 text-right whitespace-nowrap">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60 bg-white dark:bg-slate-900">
                {vendors.map((vendor) => (
                  <tr
                    key={vendor.id}
                    className="transition hover:bg-slate-50/60 dark:hover:bg-slate-800/40"
                  >
                    <td className="px-5 py-4">
                      <p className="font-bold text-slate-900 dark:text-slate-100">
                        {vendor.companyName}
                      </p>
                      <p className="mt-0.5 text-xs font-mono text-slate-400">
                        {vendor.vendorCode}
                      </p>
                    </td>
                    <td className="px-5 py-4">
                      <p className="font-medium text-slate-800 dark:text-slate-200">
                        {vendor.contactPerson || "Not provided"}
                      </p>
                      <p className="mt-0.5 text-xs text-slate-400">
                        {vendor.email}
                      </p>
                    </td>
                    <td className="px-5 py-4 font-medium text-slate-600 dark:text-slate-300">
                      {vendor.category || "Not provided"}
                    </td>
                    <td className="px-5 py-4">
                      <StatusBadge
                        status={
                          vendor.status === "blocked"
                            ? "on hold"
                            : vendor.status
                        }
                      />
                    </td>
                    <td className="px-5 py-4 text-xs font-medium text-slate-400">
                      {vendor.createdBy}
                    </td>
                    <td className="px-5 py-4 whitespace-nowrap text-right">
                      <div className="flex items-center justify-end gap-2 whitespace-nowrap">
                        {isFinanceHead ? (
                          <Link
                            to={`/finance-head/vendors/${vendor.id}/review`}
                          >
                            <Button size="sm" variant="subtle" leftIcon={Eye}>
                              Review
                            </Button>
                          </Link>
                        ) : (
                          <Button
                            size="sm"
                            variant="outline"
                            leftIcon={Eye}
                            onClick={() => setSelectedVendor(vendor)}
                          >
                            View
                          </Button>
                        )}
                        {!isFinanceHead && (
                          <Link to={`/vendors/${vendor.id}/edit`}>
                            <Button size="sm" variant="outline" leftIcon={Edit}>
                              Edit
                            </Button>
                          </Link>
                        )}
                        {canReviewVendors && canShowReviewActions(vendor) && (
                          <div className="flex items-center gap-1.5 ml-1">
                            {canShowApproveAction(vendor) && (
                              <button
                                type="button"
                                className="rounded-xl bg-emerald-600 p-2 text-white hover:bg-emerald-700 transition"
                                onClick={() => openAction("approve", vendor)}
                                title="Approve"
                              >
                                <Check size={16} />
                              </button>
                            )}
                            <button
                              type="button"
                              className="rounded-xl bg-red-600 p-2 text-white hover:bg-red-700 transition"
                              onClick={() => openAction("reject", vendor)}
                              title="Reject"
                            >
                              <X size={16} />
                            </button>
                            <button
                              type="button"
                              className="rounded-xl bg-amber-600 p-2 text-white hover:bg-amber-700 transition"
                              onClick={() => openAction("hold", vendor)}
                              title="Place on hold"
                            >
                              <AlertTriangle size={16} />
                            </button>
                          </div>
                        )}
                        {canReviewVendors && canShowBlockAction(vendor) && (
                          <button
                            type="button"
                            className="rounded-xl bg-slate-800 p-2 text-white hover:bg-slate-700 transition"
                            onClick={() => openAction("block", vendor)}
                            title="Block vendor"
                          >
                            <AlertTriangle size={16} />
                          </button>
                        )}
                        {canReviewVendors && canShowReturnPending(vendor) && (
                          <button
                            type="button"
                            className="rounded-xl bg-blue-600 p-2 text-white hover:bg-blue-700 transition"
                            onClick={() => openAction("pending", vendor)}
                            title="Return to pending"
                          >
                            <RotateCcw size={16} />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState
            title="No vendor records found"
            description="No database records match the current filters."
          />
        )}
      </section>

      {!loading && pagination.totalPages > 1 && (
        <Pagination
          currentPage={pagination.page}
          totalPages={pagination.totalPages}
          totalItems={pagination.total}
          itemsPerPage={filters.limit}
          onPageChange={(page) =>
            setFilters((current) => ({ ...current, page }))
          }
          isLoading={loading}
          label="vendors"
        />
      )}

      <VendorReviewDrawer
        vendor={selectedVendor}
        onClose={() => setSelectedVendor(null)}
        canManageDocuments={canReviewVendors}
      />

      <ConfirmationModal
        open={Boolean(pendingAction)}
        title={actionTitle}
        description={
          pendingAction
            ? `${pendingAction.vendor.companyName} (${pendingAction.vendor.vendorCode})`
            : ""
        }
        confirmLabel={pendingAction?.type === "approve" ? "Approve" : "Confirm"}
        variant={
          ["reject", "block"].includes(pendingAction?.type)
            ? "destructive"
            : pendingAction?.type === "hold"
              ? "warning"
              : "default"
        }
        loading={actionLoading}
        disabled={
          Boolean(pendingAction) &&
          ((actionRequiresReason(pendingAction.type) &&
            !reviewForm.reason.trim()) ||
            (pendingAction.type === "hold" &&
              !reviewForm.correctiveAction.trim()))
        }
        onCancel={closeAction}
        onConfirm={submitAction}
      >
        <div className="space-y-4">
          {pendingAction?.type === "approve" &&
            pendingAction.vendor.approvalReadiness && (
              <div
                className={`rounded-xl border p-3 text-sm ${pendingAction.vendor.approvalReadiness.ready ? "border-emerald-500/20 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-400" : "border-amber-500/20 bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-400"}`}
              >
                <p className="font-bold">
                  {pendingAction.vendor.approvalReadiness.ready
                    ? "Legal, tax, contact, banking, and required document checks are complete."
                    : "Approval is blocked by incomplete vendor readiness."}
                </p>
                <p className="mt-2 text-xs">
                  Bank verification:{" "}
                  {pendingAction.vendor.approvalReadiness.bankVerification
                    ?.status || "not provided"}
                </p>
                <p className="mt-1 text-xs">
                  Documents:{" "}
                  {pendingAction.vendor.approvalReadiness.documents?.uploaded ||
                    0}{" "}
                  uploaded
                </p>
                {!pendingAction.vendor.approvalReadiness.ready && (
                  <ul className="mt-2 list-disc space-y-1 pl-5 text-xs">
                    {getReadinessReasons(
                      pendingAction.vendor.approvalReadiness,
                    ).map((reason) => (
                      <li key={reason}>{reason}</li>
                    ))}
                  </ul>
                )}
              </div>
            )}

          {actionRequiresReason(pendingAction?.type) && (
            <label className="block text-xs font-bold uppercase tracking-wider text-slate-400">
              Reason *
              <textarea
                className="mt-2 h-24 w-full rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 px-3 py-2 text-sm text-slate-900 dark:text-slate-100 outline-none focus:border-blue-500"
                value={reviewForm.reason}
                onChange={(event) =>
                  setReviewForm((current) => ({
                    ...current,
                    reason: event.target.value,
                  }))
                }
                placeholder="Enter the decision reason"
              />
            </label>
          )}

          {pendingAction?.type === "hold" && (
            <>
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-400">
                Corrective action *
                <textarea
                  className="mt-2 h-20 w-full rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 px-3 py-2 text-sm text-slate-900 dark:text-slate-100 outline-none focus:border-blue-500"
                  value={reviewForm.correctiveAction}
                  onChange={(event) =>
                    setReviewForm((current) => ({
                      ...current,
                      correctiveAction: event.target.value,
                    }))
                  }
                  placeholder="Describe what the vendor must correct"
                />
              </label>
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-400">
                Follow-up date
                <DateInput
                  value={reviewForm.followUpDate}
                  onChange={(nextValue) =>
                    setReviewForm((current) => ({
                      ...current,
                      followUpDate: nextValue,
                    }))
                  }
                  className="mt-2"
                  ariaLabel="Vendor follow-up date"
                />
              </label>
            </>
          )}

          {pendingAction?.type === "block" && (
            <label className="block text-xs font-bold uppercase tracking-wider text-slate-400">
              Block category
              <input
                className="mt-2 h-10 w-full rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 px-3 text-sm text-slate-900 dark:text-slate-100 outline-none focus:border-blue-500"
                value={reviewForm.blockCategory}
                onChange={(event) =>
                  setReviewForm((current) => ({
                    ...current,
                    blockCategory: event.target.value,
                  }))
                }
                placeholder="Compliance, banking, legal, or operational"
              />
            </label>
          )}

          <label className="block text-xs font-bold uppercase tracking-wider text-slate-400">
            Comments
            <textarea
              className="mt-2 h-24 w-full rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 px-3 py-2 text-sm text-slate-900 dark:text-slate-100 outline-none focus:border-blue-500"
              value={reviewForm.remarks}
              onChange={(event) =>
                setReviewForm((current) => ({
                  ...current,
                  remarks: event.target.value,
                }))
              }
              placeholder="Add optional Finance review comments"
            />
          </label>
        </div>
      </ConfirmationModal>
    </div>
  );
};

export default VendorList;
