import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
  AlertTriangle,
  ArrowLeft,
  Building2,
  Check,
  CreditCard,
  History,
  Loader2,
  MapPin,
  RotateCcw,
  ShieldCheck,
  User,
  X,
} from "lucide-react";

import ConfirmationModal from "../../components/common/ConfirmationModal";
import DateInput from "../../components/common/DateInput";
import StatusBadge from "../../components/common/StatusBadge";
import VendorDocumentsPanel from "../../components/vendors/VendorDocumentsPanel";
import { hasPermission, PERMISSIONS } from "../../config/permissions";
import { useAuth } from "../../context/AuthContext";
import { formatRoleLabel } from "../../utils/displayFormatters";
import {
  approveVendor,
  blockVendor,
  getVendorById,
  getVendorReviewHistory,
  holdVendor,
  rejectVendor,
  returnVendorToPending,
} from "../../services/vendorService";
import { getErrorMessage, notify } from "../../utils/feedback";
import { emitNotificationsChanged } from "../../services/notificationService";

const displayValue = (value) => value || "Not provided";
const formatDate = (value) => (value ? new Date(value).toLocaleString("en-IN") : "Not provided");
const initialReviewForm = {
  reason: "",
  correctiveAction: "",
  followUpDate: "",
  blockCategory: "",
  remarks: "",
};

const actionRequiresReason = (type) => ["reject", "hold", "block", "pending"].includes(type);

const buildActionPayload = (type, form) => ({
  ...(actionRequiresReason(type) && { reason: form.reason.trim() }),
  ...(type === "hold" && { correctiveAction: form.correctiveAction.trim() }),
  ...(type === "hold" && form.followUpDate && { followUpDate: form.followUpDate }),
  ...(type === "block" && form.blockCategory.trim() && { blockCategory: form.blockCategory.trim() }),
  ...(form.remarks.trim() && { remarks: form.remarks.trim() }),
});

const getReadinessReasons = (readiness = {}) => {
  const reasons = readiness.reasons?.length
    ? readiness.reasons
    : [
      ...(readiness.missing || []).map((field) => `Missing ${field}`),
      ...(readiness.missingDocuments || []).map((document) => `Missing ${document}`),
      ...(readiness.invalid || []),
    ];
  return reasons.length ? reasons : ["No blocking issues reported."];
};

const Section = ({ children, icon: Icon, title }) => (
  <section className="rounded-2xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 shadow-sm dark:shadow-slate-950/40">
    <div className="mb-5 flex items-center gap-3">
      <div className="rounded-xl bg-blue-50 dark:bg-blue-950/50 p-2 text-blue-700 dark:text-blue-400">
        <Icon size={20} />
      </div>
      <h2 className="text-lg font-bold text-slate-950 dark:text-slate-100">{title}</h2>
    </div>
    {children}
  </section>
);

const Field = ({ label, value }) => (
  <div className="rounded-xl border border-slate-100 bg-slate-50 p-4">
    <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</p>
    <p className="mt-2 break-words text-sm font-semibold text-slate-900">{displayValue(value)}</p>
  </div>
);

const FinanceHeadVendorReview = () => {
  const { vendorId } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const canReviewVendors = hasPermission(user, PERMISSIONS.REVIEW_VENDORS);
  const [vendor, setVendor] = useState(null);
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [action, setAction] = useState(null);
  const [reviewForm, setReviewForm] = useState(initialReviewForm);
  const [submitting, setSubmitting] = useState(false);

  const loadVendor = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [vendorResult, historyResult] = await Promise.all([
        getVendorById(vendorId),
        getVendorReviewHistory(vendorId),
      ]);
      setVendor(vendorResult);
      setHistory(historyResult);
    } catch (err) {
      setError(getErrorMessage(err, "Vendor review details could not be loaded."));
    } finally {
      setLoading(false);
    }
  }, [vendorId]);

  useEffect(() => {
    loadVendor();
  }, [loadVendor]);

  const openAction = (type) => {
    setAction(type);
    setReviewForm(initialReviewForm);
  };

  const closeAction = () => {
    if (submitting) return;
    setAction(null);
    setReviewForm(initialReviewForm);
  };

  const submitAction = async () => {
    if (!vendor || !action) return;
    if (actionRequiresReason(action) && !reviewForm.reason.trim()) {
      notify.error("A reason is required for this vendor review action.");
      return;
    }
    if (action === "hold" && !reviewForm.correctiveAction.trim()) {
      notify.error("Corrective action is required before placing a vendor on hold.");
      return;
    }

    setSubmitting(true);
    try {
      const payload = buildActionPayload(action, reviewForm);
      if (action === "approve") {
        await approveVendor(vendor.id, payload);
        notify.success("Vendor approved successfully.");
      } else if (action === "reject") {
        await rejectVendor(vendor.id, payload);
        notify.success("Vendor rejected successfully.");
      } else if (action === "hold") {
        await holdVendor(vendor.id, payload);
        notify.success("Vendor placed on hold.");
      } else if (action === "block") {
        await blockVendor(vendor.id, payload);
        notify.success("Vendor blocked successfully.");
      } else if (action === "pending") {
        await returnVendorToPending(vendor.id, payload);
        notify.success("Vendor returned to pending review.");
      }
      setAction(null);
      setReviewForm(initialReviewForm);
      await loadVendor();
      emitNotificationsChanged();
    } catch (err) {
      notify.error(getErrorMessage(err, "Vendor review action failed."));
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex h-96 items-center justify-center gap-3 text-slate-500">
        <Loader2 className="animate-spin" size={20} />
        Loading vendor review...
      </div>
    );
  }

  if (error || !vendor) {
    return (
      <section className="rounded-2xl border border-red-200 bg-red-50 p-6 text-red-800">
        <h1 className="text-lg font-bold">Vendor review unavailable</h1>
        <p className="mt-2 text-sm">{error || "Vendor was not found."}</p>
        <button className="mt-4 rounded-xl bg-red-700 px-4 py-2 text-sm font-semibold text-white" onClick={() => navigate(-1)} type="button">
          Go back
        </button>
      </section>
    );
  }

  const readiness = vendor.approvalReadiness || { ready: false, missing: [] };
  const canReviewPending = canReviewVendors && vendor.status === "pending";
  const canApproveVendor = canReviewPending && Boolean(readiness.ready);
  const canReturnPending = canReviewVendors && ["blocked", "rejected"].includes(vendor.status);
  const canBlockVendor = canReviewVendors && ["pending", "active", "approved"].includes(vendor.status);
  const actionTitle = {
    approve: "Approve Vendor",
    reject: "Reject Vendor",
    hold: "Place Vendor On Hold",
    block: "Block Vendor",
    pending: "Return Vendor To Pending",
  }[action] || "Vendor Review";

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <Link to="/finance-head/vendors" className="inline-flex items-center gap-2 text-sm font-semibold text-blue-700 hover:underline">
            <ArrowLeft size={16} />
            Back to vendor reviews
          </Link>
          <h1 className="mt-4 text-3xl font-bold tracking-tight text-slate-950">{vendor.companyName}</h1>
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <span className="rounded-full bg-slate-100 px-3 py-1 text-sm font-semibold text-slate-700">{vendor.vendorCode}</span>
            <StatusBadge status={vendor.status === "blocked" ? "on hold" : vendor.status} />
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          {canReviewPending && (
            <>
              {canApproveVendor && (
                <button type="button" onClick={() => openAction("approve")} className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700">
                  <Check size={16} />
                  Approve
                </button>
              )}
              <button type="button" onClick={() => openAction("reject")} className="inline-flex items-center gap-2 rounded-xl bg-red-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-red-700">
                <X size={16} />
                Reject
              </button>
              <button type="button" onClick={() => openAction("hold")} className="inline-flex items-center gap-2 rounded-xl bg-amber-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-amber-700">
                <AlertTriangle size={16} />
                Hold
              </button>
            </>
          )}
          {canBlockVendor && (
            <button type="button" onClick={() => openAction("block")} className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white hover:bg-black">
              <ShieldCheck size={16} />
              Block
            </button>
          )}
          {canReturnPending && (
            <button type="button" onClick={() => openAction("pending")} className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-700">
              <RotateCcw size={16} />
              Return to Pending
            </button>
          )}
        </div>
      </div>

      <Section icon={ShieldCheck} title="Approval Readiness">
        <div className={`rounded-xl border p-4 ${readiness.ready ? "border-emerald-200 bg-emerald-50" : "border-amber-200 bg-amber-50"}`}>
          <p className={`text-sm font-bold ${readiness.ready ? "text-emerald-800" : "text-amber-800"}`}>
            {readiness.ready ? "Vendor has the required database fields for approval." : "Vendor is missing required approval information."}
          </p>
          {!readiness.ready && (
            <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-amber-800">
              {getReadinessReasons(readiness).map((reason) => (
                <li key={reason}>{reason}</li>
              ))}
            </ul>
          )}
          <p className="mt-2 text-xs text-slate-600">
            Documents and banking details are loaded from the vendor database record.
          </p>
        </div>
      </Section>

      <div className="grid gap-6 xl:grid-cols-2">
        <Section icon={Building2} title="Summary">
          <div className="grid gap-4 md:grid-cols-2">
            <Field label="Legal / Display Name" value={vendor.companyName} />
            <Field label="Vendor Code" value={vendor.vendorCode} />
            <Field label="Category" value={vendor.category} />
            <Field label="Created Date" value={formatDate(vendor.createdAt)} />
            <Field label="Last Updated" value={formatDate(vendor.updatedAt)} />
            <Field label="Approved At" value={formatDate(vendor.approvedAt)} />
          </div>
        </Section>

        <Section icon={User} title="Tax And Contacts">
          <div className="grid gap-4 md:grid-cols-2">
            <Field label="GST / Tax ID" value={vendor.gst} />
            <Field label="Primary Contact" value={vendor.contactPerson} />
            <Field label="Email" value={vendor.email} />
            <Field label="Phone" value={vendor.phone} />
          </div>
        </Section>

        <Section icon={MapPin} title="Address">
          <div className="grid gap-4 md:grid-cols-2">
            <Field label="Address" value={vendor.address} />
            <Field label="City" value={vendor.city} />
            <Field label="State" value={vendor.state} />
            <Field label="Postal Code" value={vendor.postalCode} />
          </div>
        </Section>

        <Section icon={CreditCard} title="Banking And Commercial">
          <div className="grid gap-4 md:grid-cols-2">
            <Field label="Account Number" value={vendor.maskedBankAccountNo || "Not provided"} />
            <Field label="IFSC" value={vendor.ifscCode} />
            <Field label="Payment Terms" value={vendor.paymentTerms} />
            <Field label="Bank Verification" value={readiness.bankVerification?.status || "Not provided"} />
          </div>
        </Section>
      </div>

      <VendorDocumentsPanel vendorId={vendor.id} initialDocuments={vendor.documents || []} readOnly={!canReviewVendors} />

      <Section icon={History} title="Review History">
        {history.length ? (
          <div className="space-y-3">
            {history.map((entry) => {
              const actor = entry.performed_by;
              const actorName = `${actor?.first_name || ""} ${actor?.last_name || ""}`.trim() || actor?.email || "System";
              return (
                <article key={`${entry.id}-${entry.action}`} className="rounded-xl border border-slate-200 p-4">
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <p className="font-semibold capitalize text-slate-950">{String(entry.action || "activity").replaceAll("_", " ")}</p>
                      <p className="mt-1 text-sm text-slate-500">{entry.from_status || "-"} to {entry.to_status || "-"}</p>
                    </div>
                    <p className="text-xs font-semibold text-slate-500">{formatDate(entry.created_at)}</p>
                  </div>
                  <p className="mt-3 text-sm text-slate-600">{entry.remarks || "No comments provided."}</p>
                  <p className="mt-2 text-xs text-slate-500">By {actorName} {actor?.role ? `(${formatRoleLabel(actor.role)})` : ""}</p>
                </article>
              );
            })}
          </div>
        ) : (
          <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 p-5 text-sm font-medium text-slate-600">
            No review history available.
          </div>
        )}
      </Section>

      <ConfirmationModal
        open={Boolean(action)}
        title={actionTitle}
        description={`${vendor.companyName} (${vendor.vendorCode})`}
        confirmLabel={action === "approve" ? "Approve" : "Confirm"}
        variant={["reject", "block"].includes(action) ? "destructive" : action === "hold" ? "warning" : "default"}
        loading={submitting}
        disabled={
          (actionRequiresReason(action) && !reviewForm.reason.trim()) ||
          (action === "hold" && !reviewForm.correctiveAction.trim())
        }
        onCancel={closeAction}
        onConfirm={submitAction}
      >
        <div className="space-y-4">
          {action === "approve" && (
            <div className={`rounded-xl border p-3 text-sm ${readiness.ready ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-amber-200 bg-amber-50 text-amber-800"}`}>
              <p className="font-semibold">
                {readiness.ready
                  ? "Legal, tax, contact, banking, and required document checks are complete."
                  : "Approval is blocked by incomplete vendor readiness."}
              </p>
              <p className="mt-2">Bank verification: {readiness.bankVerification?.status || "not provided"}</p>
              <p className="mt-1">Documents: {(readiness.documents?.uploaded || 0)} uploaded</p>
              {!readiness.ready && (
                <ul className="mt-2 list-disc space-y-1 pl-5">
                  {getReadinessReasons(readiness).map((reason) => (
                    <li key={reason}>{reason}</li>
                  ))}
                </ul>
              )}
            </div>
          )}

          {actionRequiresReason(action) && (
            <label className="block text-sm font-semibold text-slate-700">
              Reason *
              <textarea
                className="mt-2 h-24 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-blue-500"
                value={reviewForm.reason}
                onChange={(event) => setReviewForm((current) => ({ ...current, reason: event.target.value }))}
                placeholder="Enter the decision reason"
              />
            </label>
          )}

          {action === "hold" && (
            <>
              <label className="block text-sm font-semibold text-slate-700">
                Corrective action *
                <textarea
                  className="mt-2 h-20 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-blue-500"
                  value={reviewForm.correctiveAction}
                  onChange={(event) => setReviewForm((current) => ({ ...current, correctiveAction: event.target.value }))}
                  placeholder="Describe what the vendor must correct"
                />
              </label>
              <label className="block text-sm font-semibold text-slate-700">
                Follow-up date
                <DateInput
                  value={reviewForm.followUpDate}
                  onChange={(nextValue) => setReviewForm((current) => ({ ...current, followUpDate: nextValue }))}
                  className="mt-2"
                  ariaLabel="Vendor follow-up date"
                />
              </label>
            </>
          )}

          {action === "block" && (
            <label className="block text-sm font-semibold text-slate-700">
              Block category
              <input
                type="text"
                className="mt-2 h-10 w-full rounded-xl border border-slate-200 px-3 text-sm outline-none focus:border-blue-500"
                value={reviewForm.blockCategory}
                onChange={(event) => setReviewForm((current) => ({ ...current, blockCategory: event.target.value }))}
                placeholder="Compliance, banking, legal, or operational"
              />
            </label>
          )}

          <label className="block text-sm font-semibold text-slate-700">
            Comments
            <textarea
              className="mt-2 h-24 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-blue-500"
              value={reviewForm.remarks}
              onChange={(event) => setReviewForm((current) => ({ ...current, remarks: event.target.value }))}
              placeholder="Add optional Finance review comments"
            />
          </label>
        </div>
      </ConfirmationModal>
    </div>
  );
};

export default FinanceHeadVendorReview;
