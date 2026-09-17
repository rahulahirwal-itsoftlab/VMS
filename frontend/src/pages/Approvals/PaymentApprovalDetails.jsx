import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
  ArrowLeft,
  CheckCircle,
  Clock,
  FileText,
  FileCheck,
  Building,
  AlertTriangle,
  Send,
  XCircle,
  ChevronRight,
  Shield,
} from "lucide-react";
import { toast } from "sonner";
import StatusBadge from "../../components/common/StatusBadge";
import { useAuth } from "../../context/AuthContext";
import { ROLES } from "../../config/permissions";
import {
  getPaymentApprovalById,
  approvePaymentApproval,
  rejectPaymentApproval,
  getPaymentApprovalHistory,
} from "../../services/approvalService";
import { formatRoleLabel } from "../../utils/displayFormatters";

const money = (val, cur = "INR") =>
  `${cur} ${Number(val || 0).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;

const formatDate = (value) => {
  if (!value) return "N/A";
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "N/A"
    : date.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
};

const DetailCard = ({ icon: Icon, title, children }) => (
  <div className="bg-white rounded-2xl border border-slate-100 p-5 shadow-sm space-y-4 hover:shadow-md transition-all duration-300">
    <div className="flex items-center gap-2.5 pb-3 border-b border-slate-50">
      <div className="p-1.5 bg-slate-50 text-slate-600 rounded-lg">
        <Icon size={18} />
      </div>
      <h3 className="font-bold text-slate-800 text-sm tracking-tight">{title}</h3>
    </div>
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
      {children}
    </div>
  </div>
);

const DetailItem = ({ label, value, className = "" }) => (
  <div className={`space-y-1 ${className}`}>
    <span className="text-slate-400 font-medium uppercase tracking-wider text-[10px]">{label}</span>
    <p className="font-semibold text-slate-800 text-sm wrap-break-word">{value || "N/A"}</p>
  </div>
);

const PaymentApprovalDetails = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();

  const [approval, setApproval] = useState(null);
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [error, setError] = useState("");

  // Actions state
  const [actionType, setActionType] = useState(null); // "approve" | "reject"
  const [remarks, setRemarks] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const loadDetails = useCallback(async () => {
    try {
      setLoading(true);
      setError("");
      const approvalData = await getPaymentApprovalById(id);
      if (!approvalData) {
        throw new Error("Payment approval request not found.");
      }
      setApproval(approvalData);

      setLoadingHistory(true);
      try {
        const histData = await getPaymentApprovalHistory(id);
        setHistory(histData);
      } catch (err) {
        console.error("Failed to load approval history:", err);
      } finally {
        setLoadingHistory(false);
      }
    } catch (err) {
      console.error(err);
      setError(err.response?.data?.message || err.message || "Failed to load approval details.");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    if (id) {
      loadDetails();
    }
  }, [id, loadDetails]);

  const handleAction = async (e) => {
    e.preventDefault();
    if (actionType === "reject" && !remarks.trim()) {
      toast.error("Rejection reason is mandatory.");
      return;
    }

    try {
      setSubmitting(true);
      if (actionType === "approve") {
        await approvePaymentApproval(id, remarks);
        toast.success("Payment approval granted successfully!");
      } else {
        await rejectPaymentApproval(id, remarks);
        toast.error("Payment approval rejected successfully.");
      }
      setActionType(null);
      setRemarks("");
      await loadDetails();
    } catch (err) {
      console.error(err);
      toast.error(err.response?.data?.message || `Failed to submit payment action.`);
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="space-y-6 max-w-7xl mx-auto px-4 py-8 animate-pulse">
        <div className="h-4 w-48 bg-slate-200 rounded mb-4"></div>
        <div className="h-10 w-96 bg-slate-200 rounded mb-6"></div>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-6">
            <div className="h-48 bg-slate-200 rounded-2xl"></div>
            <div className="h-48 bg-slate-200 rounded-2xl"></div>
            <div className="h-48 bg-slate-200 rounded-2xl"></div>
          </div>
          <div className="h-96 bg-slate-200 rounded-2xl"></div>
        </div>
      </div>
    );
  }

  if (error || !approval) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-16 text-center space-y-4">
        <XCircle className="mx-auto text-red-500" size={54} />
        <h2 className="text-xl font-bold text-slate-800">Error Loading Details</h2>
        <p className="text-slate-500 text-sm max-w-md mx-auto">{error || "The requested payment approval details could not be loaded."}</p>
        <button
          onClick={() => navigate("/approvals")}
          className="inline-flex items-center gap-1.5 px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold rounded-xl text-sm transition"
        >
          <ArrowLeft size={16} /> Return to Queue
        </button>
      </div>
    );
  }

  const isPending = approval.status === "PENDING" || approval.approvalStatus === "PENDING";
  const canUserAct =
    isPending &&
    user.role !== ROLES.CASE_MANAGER &&
    (user.role === ROLES.SUPER_ADMIN ||
      approval.approverId === user.id ||
      approval.requiredRole === user.role ||
      approval.assignedRole === user.role);

  return (
    <div className="space-y-6 max-w-7xl mx-auto px-4 py-6">
      {/* Breadcrumbs */}
      <nav className="flex items-center gap-2 text-xs font-semibold text-slate-400">
        <Link to="/dashboard" className="hover:text-blue-600 transition">Dashboard</Link>
        <ChevronRight size={12} />
        <Link to="/approvals" className="hover:text-blue-600 transition">Payment Approvals</Link>
        <ChevronRight size={12} />
        <span className="text-slate-600">Details ({approval.id.substring(0, 8)})</span>
      </nav>

      {/* Header Panel */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 bg-white p-6 rounded-2xl border border-slate-100 shadow-sm">
        <div className="space-y-1.5">
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-2xl font-extrabold text-slate-900 tracking-tight">
              Payment Request Detail
            </h1>
            <StatusBadge status={approval.status || approval.approvalStatus} />
          </div>
          <p className="text-xs text-slate-400 font-medium">
            Approval Level {approval.approval_level || 1} &bull; Requested {formatDate(approval.requested_at || approval.requestedAt)}
          </p>
        </div>
        <button
          onClick={() => navigate("/approvals")}
          className="self-start md:self-center inline-flex items-center gap-1.5 px-3.5 py-2 border border-slate-200 hover:bg-slate-50 text-slate-600 font-semibold rounded-xl text-sm transition"
        >
          <ArrowLeft size={16} /> Back to Queue
        </button>
      </div>

      {/* Main Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
        {/* Detail Cards Column */}
        <div className="lg:col-span-2 space-y-6">
          {/* Card 1: Approval Meta */}
          <DetailCard icon={Shield} title="Approval Context Information">
            <DetailItem label="Approval Request ID" value={approval.id} />
            <DetailItem label="Assigned Role Pool" value={formatRoleLabel(approval.requiredRole || approval.assignedRole)} />
            <DetailItem label="Assigned User" value={approval.approverName || approval.assignedUser || "Role Pool"} />
            <DetailItem label="Requested By" value={approval.requestedBy || "Workflow System"} />
            <DetailItem label="Requested Amount" value={money(approval.amount || approval.requestedAmount, approval.currency)} />
            <DetailItem label="Status" value={approval.status || approval.approvalStatus} />
          </DetailCard>

          {/* Card 2: Invoice Info */}
          <DetailCard icon={FileText} title="Invoice & Vendor Master Data">
            <DetailItem label="Invoice Number" value={approval.invoice?.invoice_number || approval.invoiceNumber} />
            <DetailItem label="Invoice Date" value={formatDate(approval.invoice?.invoice_date || approval.invoiceDate)} />
            <DetailItem label="Invoice Amount" value={money(approval.invoice?.amount || approval.amount || approval.requestedAmount, approval.currency)} />
            <DetailItem label="Vendor Name" value={approval.vendor?.name || approval.vendorName} />
            <DetailItem label="Vendor Code" value={approval.vendor?.vendor_code || approval.vendorCode} />
            <DetailItem label="Vendor GST" value={approval.vendor?.gst_number || "Not Available"} />
          </DetailCard>

          {/* Card 3: Purchase Order Info */}
          <DetailCard icon={FileCheck} title="Purchase Order Information">
            <DetailItem label="PO Number" value={approval.purchase_order?.po_number || approval.poNumber} />
            <DetailItem label="PO Order Date" value={formatDate(approval.purchase_order?.order_date || approval.poDate)} />
            <DetailItem label="PO Amount" value={money(approval.purchase_order?.amount || approval.poAmount, approval.currency)} />
          </DetailCard>

          {/* Card 4: GRN & DC Info */}
          <DetailCard icon={Building} title="Receipt & Delivery Information">
            <DetailItem label="GRN Number" value={approval.three_way_match?.grn?.grn_number || approval.grnNumber} />
            <DetailItem label="GRN Date" value={formatDate(approval.three_way_match?.grn?.receipt_date || approval.grnDate)} />
            <DetailItem label="Delivery Challan Number" value={approval.three_way_match?.delivery_challan?.delivery_challan_number || approval.deliveryChallanNumber} />
            <DetailItem label="Delivery Challan Date" value={formatDate(approval.three_way_match?.delivery_challan?.delivery_date || approval.deliveryChallanDate)} />
          </DetailCard>

          {/* Card 5: Three-Way Matching Results */}
          <DetailCard icon={AlertTriangle} title="Three-Way Matching Status">
            <DetailItem label="Matching Status" value={approval.three_way_match?.status || approval.threeWayMatchStatus || "MATCHED"} />
            <DetailItem label="Match Percentage" value={`${approval.three_way_match?.match_percentage || 100}%`} />
            <DetailItem label="Mismatch Reason/Variance" value={approval.three_way_match?.unmatched_fields?.length > 0 ? "Discrepancy detected in quantities or unit rates." : "No variance detected."} />
          </DetailCard>
        </div>

        {/* History / Timeline Column */}
        <div className="space-y-6">
          <div className="bg-white rounded-2xl border border-slate-100 p-5 shadow-sm space-y-4">
            <div className="flex items-center gap-2.5 pb-3 border-b border-slate-50">
              <div className="p-1.5 bg-slate-50 text-slate-600 rounded-lg">
                <Clock size={18} />
              </div>
              <h3 className="font-bold text-slate-800 text-sm tracking-tight">Audit Trail / History</h3>
            </div>
            {loadingHistory ? (
              <div className="py-8 text-center text-slate-400 text-xs">Loading history...</div>
            ) : history.length === 0 ? (
              <div className="py-8 text-center text-slate-400 text-xs">No audit events logged.</div>
            ) : (
              <div className="relative pl-4 border-l border-slate-100 space-y-6 text-xs">
                {history.map((h, i) => (
                  <div key={h.id || i} className="relative space-y-1">
                    <div className="absolute -left-[21px] top-1.5 w-2.5 h-2.5 rounded-full bg-blue-500 border-2 border-white"></div>
                    <div className="flex items-center justify-between text-[10px] text-slate-400">
                      <span className="font-bold text-blue-600 uppercase">{h.action}</span>
                      <span>{formatDate(h.created_at || h.createdAt)}</span>
                    </div>
                    <p className="font-semibold text-slate-700">{h.performed_by || h.performedBy?.email || "System"}</p>
                    {h.remarks && (
                      <p className="text-[11px] text-slate-500 italic bg-slate-50 p-2 rounded-lg mt-1 border border-slate-100/50">
                        "{h.remarks}"
                      </p>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* User actions panel - visible only if user can act */}
          {canUserAct && !actionType && (
            <div className="bg-slate-50 rounded-2xl border border-slate-200/60 p-5 shadow-sm space-y-3">
              <h4 className="font-bold text-slate-800 text-xs uppercase tracking-wider">Execute Workflow Decision</h4>
              <p className="text-xs text-slate-500">Confirm payment approval or reject with reason.</p>
              <div className="flex gap-3">
                <button
                  onClick={() => setActionType("approve")}
                  className="flex-1 py-2 px-3 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-bold text-xs shadow-sm transition flex justify-center items-center gap-1"
                >
                  <CheckCircle size={14} /> Approve
                </button>
                <button
                  onClick={() => setActionType("reject")}
                  className="flex-1 py-2 px-3 bg-red-600 hover:bg-red-700 text-white rounded-xl font-bold text-xs shadow-sm transition flex justify-center items-center gap-1"
                >
                  <XCircle size={14} /> Reject
                </button>
              </div>
            </div>
          )}

          {/* Action Form Dialog (inline instead of separate modal) */}
          {actionType && (
            <form onSubmit={handleAction} className="bg-white rounded-2xl border border-slate-200 p-5 shadow-md space-y-4 animate-in fade-in duration-300">
              <div className="flex items-center gap-2 pb-2 border-b border-slate-50">
                <div className={`p-1 rounded-lg ${actionType === "approve" ? "bg-emerald-50 text-emerald-600" : "bg-red-50 text-red-600"}`}>
                  {actionType === "approve" ? <CheckCircle size={16} /> : <XCircle size={16} />}
                </div>
                <h4 className="font-bold text-slate-800 text-xs uppercase">
                  {actionType === "approve" ? "Approve Request" : "Reject Request"}
                </h4>
              </div>

              <div className="space-y-1.5">
                <label className="text-[10px] text-slate-400 font-bold uppercase tracking-wide">
                  Remarks {actionType === "reject" && <span className="text-red-500">*</span>}
                </label>
                <textarea
                  value={remarks}
                  onChange={(e) => setRemarks(e.target.value)}
                  placeholder={actionType === "approve" ? "Enter optional approval comments..." : "Enter mandatory rejection reason..."}
                  required={actionType === "reject"}
                  className="w-full text-xs border border-slate-200 rounded-xl p-2.5 outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 min-h-[80px] bg-slate-50/50 resize-none transition-all"
                />
              </div>

              <div className="flex gap-2">
                <button
                  type="submit"
                  disabled={submitting}
                  className={`flex-1 py-2 px-3 text-white rounded-xl font-semibold text-xs transition flex justify-center items-center gap-1 ${
                    actionType === "approve" ? "bg-emerald-600 hover:bg-emerald-700" : "bg-red-600 hover:bg-red-700"
                  }`}
                >
                  <Send size={12} /> {submitting ? "Submitting..." : actionType === "approve" ? "Approve Payment" : "Reject Payment"}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setActionType(null);
                    setRemarks("");
                  }}
                  className="px-3 py-2 border border-slate-200 hover:bg-slate-50 text-slate-500 rounded-xl font-semibold text-xs transition"
                >
                  Cancel
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
};

export default PaymentApprovalDetails;
