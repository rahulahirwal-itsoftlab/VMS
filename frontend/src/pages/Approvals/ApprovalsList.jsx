import { useEffect, useMemo, useState } from "react";
import { useSearchParams, useParams } from "react-router-dom";
import { Search, Eye, Check, X, Clock, CheckCircle2, AlertTriangle } from "lucide-react";
import { getPaymentApprovals, getPaymentApprovalById, approvePaymentApproval, rejectPaymentApproval, getPaymentApprovalHistory } from "../../services/approvalService";
import { useAuth } from "../../context/AuthContext";
import { ROLES } from "../../config/permissions";
import { toast } from "sonner";
import StatusBadge from "../../components/common/StatusBadge";
import { formatRoleLabel } from "../../utils/displayFormatters";
import FilterSelect from "../../components/common/FilterSelect";

const money = (val, cur = "INR") =>
  `${cur} ${Number(val || 0).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;

const ApprovalsList = () => {
  const { user } = useAuth();
  const [searchParams] = useSearchParams();
  const { id: routeApprovalId } = useParams();
  const urlApprovalId = searchParams.get("id") || routeApprovalId;

  const [approvalData, setApprovalData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("All");

  // Detail Modal
  const [selectedApproval, setSelectedApproval] = useState(null);
  const [history, setHistory] = useState([]);
  const [loadingHistory, setLoadingHistory] = useState(false);

  // Action Dialogs
  const [actionType, setActionType] = useState(null); // "approve" | "reject"
  const [actionApproval, setActionApproval] = useState(null);
  const [remarks, setRemarks] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    loadApprovals();
  }, []);

  const loadApprovals = async () => {
    try {
      setLoading(true);
      const data = await getPaymentApprovals();
      setApprovalData(data);

      // If URL has ?id=<approvalId> or /payment-approvals/<approvalId>, auto open detail modal
      if (urlApprovalId) {
        let target = data.find((a) => a.id === urlApprovalId);
        if (!target) {
          try {
            target = await getPaymentApprovalById(urlApprovalId);
          } catch (err) {
            console.error("Failed to load target approval by ID:", err);
          }
        }
        if (target) {
          handleOpenDetails(target);
        }
      }
    } catch (err) {
      console.error("Failed to load payment approvals:", err);
      toast.error("Failed to load approvals list.");
    } finally {
      setLoading(false);
    }
  };

  const filteredApprovals = useMemo(() => {
    return approvalData.filter((approval) => {
      // Role & User Based Filtering (Already filtered on backend, but let's double check)
      if (user.role !== ROLES.SUPER_ADMIN) {
        if (
          approval.approverId !== user.id &&
          approval.requiredRole !== user.role &&
          approval.requestedById !== user.id
        ) {
          return false;
        }
      }

      // Status Filter
      if (status !== "All" && approval.status !== status.toUpperCase()) {
        return false;
      }

      // Search Filter
      const keyword = search.toLowerCase();
      return (
        String(approval.invoiceNumber || "").toLowerCase().includes(keyword) ||
        String(approval.poNumber || "").toLowerCase().includes(keyword) ||
        String(approval.vendorName || "").toLowerCase().includes(keyword) ||
        String(approval.id || "").toLowerCase().includes(keyword)
      );
    });
  }, [approvalData, search, status, user]);

  const handleOpenDetails = async (approval) => {
    setSelectedApproval(approval);
    setLoadingHistory(true);
    try {
      const hist = await getPaymentApprovalHistory(approval.id);
      setHistory(hist);
    } catch (err) {
      console.error("Failed to fetch approval history:", err);
      toast.error("Failed to load history.");
    } finally {
      setLoadingHistory(false);
    }
  };

  const handleOpenAction = (approval, type) => {
    setActionApproval(approval);
    setActionType(type);
    setRemarks("");
  };

  const handleActionSubmit = async (e) => {
    e.preventDefault();
    if (!actionApproval || !actionType) return;

    if (!remarks.trim()) {
      toast.error(`Please provide remarks to ${actionType === "approve" ? "approve" : "reject"} the payment.`);
      return;
    }

    try {
      setSubmitting(true);
      if (actionType === "approve") {
        await approvePaymentApproval(actionApproval.id, remarks);
        toast.success("Payment approval granted successfully!");
      } else {
        await rejectPaymentApproval(actionApproval.id, remarks);
        toast.error("Payment approval rejected.");
      }

      // Reset & Reload
      setActionApproval(null);
      setActionType(null);
      setRemarks("");
      setSelectedApproval(null); // Close detail modal if open
      loadApprovals();
    } catch (err) {
      console.error(err);
      toast.error(err.response?.data?.message || `Failed to ${actionType} approval.`);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto px-4 py-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight text-slate-900 dark:text-slate-100 font-heading sm:text-3xl flex items-center gap-2">
            💳 Payment Approval Queue
          </h1>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400 sm:text-sm">
            Review and process payment approval requests assigned specifically to you.
          </p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-4 rounded-2xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 shadow-sm dark:shadow-slate-950/40">
        <div className="relative flex-1 min-w-[280px]">
          <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by invoice, PO, vendor, or approval ID..."
            className="w-full rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 py-2.5 pl-10 pr-4 outline-none focus:border-blue-500 transition-all text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400"
          />
        </div>

        <FilterSelect
          value={status}
          onChange={setStatus}
          options={[
            { value: "All", label: "All Statuses" },
            { value: "Pending", label: "Pending" },
            { value: "Approved", label: "Approved" },
            { value: "Rejected", label: "Rejected" },
          ]}
          placeholder="All Statuses"
          className="w-full sm:w-44"
        />
      </div>

      {/* Table */}
      {loading ? (
        <div className="flex flex-col items-center justify-center py-20 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-sm dark:shadow-slate-950/40">
          <Clock className="animate-spin text-blue-500 mb-4" size={40} />
          <span className="text-slate-500 dark:text-slate-400 font-medium">Loading approval queue...</span>
        </div>
      ) : filteredApprovals.length === 0 ? (
        <div className="text-center py-16 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-sm dark:shadow-slate-950/40 flex flex-col items-center justify-center">
          <CheckCircle2 className="text-emerald-400 mb-4" size={48} />
          <h3 className="text-lg font-bold text-slate-800 dark:text-slate-100">Queue is Clear!</h3>
          <p className="text-slate-500 dark:text-slate-400 mt-1 max-w-sm text-sm">
            No payment approval requests match your filters or are assigned to you.
          </p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm dark:shadow-slate-950/40">
          <div className="overflow-x-auto custom-scrollbar">
            <table className="w-full text-left border-collapse text-sm">
              <thead className="bg-slate-50 dark:bg-slate-800/80 border-b border-slate-100 dark:border-slate-800 text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                <tr>
                  <th className="px-6 py-4">Approval / Invoice</th>
                  <th className="px-6 py-4">Vendor / PO</th>
                  <th className="px-6 py-4">Approval Amount</th>
                  <th className="px-6 py-4">3WM Status</th>
                  <th className="px-6 py-4">Required Role</th>
                  <th className="px-6 py-4">Assigned User</th>
                  <th className="px-6 py-4">Approval Status</th>
                  <th className="px-6 py-4 text-center">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60 bg-white dark:bg-slate-900">
                {filteredApprovals.map((approval) => {
                  const canUserAct =
                    (approval.status === "PENDING" || approval.approvalStatus === "PENDING") &&
                    user.role !== ROLES.CASE_MANAGER &&
                    (user.role === ROLES.SUPER_ADMIN ||
                      approval.approverId === user.id ||
                      approval.requiredRole === user.role ||
                      approval.assignedRole === user.role);

                  return (
                    <tr key={approval.id} className="hover:bg-slate-50/60 dark:hover:bg-slate-800/40 transition-all">
                      <td className="px-6 py-4">
                        <div className="font-bold text-slate-900 dark:text-slate-100 text-sm">Inv: {approval.invoiceNumber || "N/A"}</div>
                        <div className="text-xs text-slate-400 font-mono mt-0.5">ID: {approval.id.substring(0, 8)}...</div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="font-semibold text-slate-800 dark:text-slate-200 text-sm">{approval.vendorName || "N/A"}</div>
                        <div className="text-xs text-slate-400 font-mono mt-0.5">PO: {approval.poNumber || "N/A"}</div>
                      </td>
                      <td className="px-6 py-4 font-bold text-slate-900 dark:text-slate-100 text-sm">
                        {money(approval.amount || approval.requestedAmount, approval.currency)}
                      </td>
                      <td className="px-6 py-4">
                        <StatusBadge status={approval.threeWayMatchStatus || "MATCHED"} />
                      </td>
                      <td className="px-6 py-4">
                        <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold bg-indigo-50 dark:bg-indigo-950/50 text-indigo-700 dark:text-indigo-300 border border-indigo-100 dark:border-indigo-900">
                          {formatRoleLabel(approval.requiredRole || approval.assignedRole)}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-sm text-slate-700 dark:text-slate-300">
                        {approval.approverName || approval.assignedUser || approval.approverEmail || "Role Pool"}
                      </td>
                      <td className="px-6 py-4">
                        <StatusBadge status={approval.status || approval.approvalStatus} />
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex justify-center items-center gap-2">
                          <button
                            onClick={() => handleOpenDetails(approval)}
                            className="p-2 text-slate-500 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-all"
                            title="View Full Details"
                          >
                            <Eye size={18} />
                          </button>
                          {canUserAct && (
                            <>
                              <button
                                onClick={() => handleOpenAction(approval, "approve")}
                                className="p-2 text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50 rounded-lg transition-all"
                                title="Approve Payment"
                              >
                                <Check size={18} />
                              </button>
                              <button
                                onClick={() => handleOpenAction(approval, "reject")}
                                className="p-2 text-red-600 hover:text-red-700 hover:bg-red-50 rounded-lg transition-all"
                                title="Reject Payment"
                              >
                                <X size={18} />
                              </button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Details Slide-Over or Modal */}
      {selectedApproval && (
        <div className="fixed inset-0 z-50 overflow-hidden bg-slate-900/60 backdrop-blur-sm flex justify-end">
          <div className="w-full max-w-2xl bg-white h-full flex flex-col shadow-2xl animate-in slide-in-from-right duration-350">
            {/* Modal Header */}
            <div className="px-6 py-5 bg-slate-900 text-white flex justify-between items-center">
              <div>
                <h2 className="text-lg font-bold">Payment Approval Request</h2>
                <p className="text-xs text-slate-400 mt-1">Approval ID: {selectedApproval.id}</p>
              </div>
              <button onClick={() => setSelectedApproval(null)} className="p-1 hover:bg-slate-800 rounded-lg transition">
                <X size={20} />
              </button>
            </div>

            {/* Modal Content */}
            <div className="flex-1 overflow-y-auto p-6 space-y-6">
              {/* Financial Overview */}
              <div className="bg-slate-900 text-white p-6 rounded-2xl flex justify-between items-center shadow-lg">
                <div>
                  <span className="text-xs text-slate-400 uppercase tracking-wider font-semibold block">Required Approval Amount</span>
                  <div className="text-3xl font-extrabold text-emerald-400 mt-1">
                    {money(selectedApproval.amount, selectedApproval.currency)}
                  </div>
                  <div className="text-xs text-slate-400 mt-1">
                    Remaining Payable: {money(selectedApproval.remainingPayableAmount, selectedApproval.currency)}
                  </div>
                </div>
                <div className="text-right">
                  <StatusBadge status={selectedApproval.status} />
                  <span className="text-xs text-slate-300 block mt-2 font-medium">
                    Required Role: {formatRoleLabel(selectedApproval.requiredRole)}
                  </span>
                </div>
              </div>

              {/* Three-Way Matching Summary */}
              <div className="space-y-3">
                <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
                  <CheckCircle2 size={16} className="text-emerald-500" /> Three-Way Matching Verification
                </h3>
                <div className="bg-emerald-50/60 border border-emerald-100 p-4 rounded-xl space-y-2 text-sm">
                  <div className="flex justify-between items-center">
                    <span className="font-semibold text-emerald-900">Matching Status</span>
                    <span className="font-bold text-emerald-700 bg-emerald-100 px-2.5 py-0.5 rounded-full text-xs">
                      {selectedApproval.threeWayMatchStatus || "MATCHED"} ({selectedApproval.threeWayMatchPercentage || 100}%)
                    </span>
                  </div>
                  <div className="flex justify-between items-center text-xs text-slate-600">
                    <span>Matched Amount: {money(selectedApproval.matchedAmount, selectedApproval.currency)}</span>
                    <span>Variance: {money(selectedApproval.varianceAmount, selectedApproval.currency)}</span>
                  </div>
                  {selectedApproval.unmatchedFields?.length > 0 && (
                    <div className="mt-2 pt-2 border-t border-emerald-200 text-xs text-red-700">
                      <strong>Mismatch Details:</strong>
                      {selectedApproval.unmatchedFields.map((f, idx) => (
                        <div key={idx} className="mt-1">
                          - {f.field}: {f.reason}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* Document References */}
              <div className="space-y-3">
                <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider">Document References</h3>
                <div className="grid grid-cols-2 gap-4 text-sm bg-white border border-slate-200 p-4 rounded-xl shadow-sm">
                  <div>
                    <span className="text-slate-400 text-xs block">Invoice Number</span>
                    <span className="font-bold text-slate-800">{selectedApproval.invoiceNumber || "N/A"}</span>
                    {selectedApproval.invoiceDate && (
                      <span className="text-xs text-slate-400 block mt-0.5">Date: {new Date(selectedApproval.invoiceDate).toLocaleDateString("en-IN")}</span>
                    )}
                  </div>
                  <div>
                    <span className="text-slate-400 text-xs block">Purchase Order</span>
                    <span className="font-bold text-slate-800">{selectedApproval.poNumber || "N/A"}</span>
                    {selectedApproval.poDate && (
                      <span className="text-xs text-slate-400 block mt-0.5">Date: {new Date(selectedApproval.poDate).toLocaleDateString("en-IN")} (Total: {money(selectedApproval.poTotal, selectedApproval.currency)})</span>
                    )}
                  </div>
                  <div>
                    <span className="text-slate-400 text-xs block">Goods Receipt Note (GRN)</span>
                    <span className="font-semibold text-slate-800">{selectedApproval.grnNumber || "GRN Verified"}</span>
                    {selectedApproval.grnDate && (
                      <span className="text-xs text-slate-400 block mt-0.5">Date: {new Date(selectedApproval.grnDate).toLocaleDateString("en-IN")}</span>
                    )}
                  </div>
                  <div>
                    <span className="text-slate-400 text-xs block">Delivery Challan</span>
                    <span className="font-semibold text-slate-800">{selectedApproval.deliveryChallanNumber || "Challan Verified"}</span>
                    {selectedApproval.deliveryChallanDate && (
                      <span className="text-xs text-slate-400 block mt-0.5">Date: {new Date(selectedApproval.deliveryChallanDate).toLocaleDateString("en-IN")}</span>
                    )}
                  </div>
                </div>
              </div>

              {/* Vendor Information */}
              <div className="space-y-3">
                <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider">Vendor Details</h3>
                <div className="grid grid-cols-2 gap-4 text-sm bg-white border border-slate-200 p-4 rounded-xl shadow-sm">
                  <div>
                    <span className="text-slate-400 text-xs block">Vendor Name</span>
                    <span className="font-bold text-slate-800">{selectedApproval.vendorName}</span>
                  </div>
                  <div>
                    <span className="text-slate-400 text-xs block">Vendor Code</span>
                    <span className="font-semibold text-slate-800">{selectedApproval.vendorCode || "N/A"}</span>
                  </div>
                  {selectedApproval.vendorGstin && (
                    <div className="col-span-2">
                      <span className="text-slate-400 text-xs block">GSTIN / Tax ID</span>
                      <span className="font-semibold text-slate-800">{selectedApproval.vendorGstin}</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Assignment Details */}
              <div className="space-y-3">
                <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider">Assignment Details</h3>
                <div className="grid grid-cols-2 gap-4 text-sm bg-white border border-slate-200 p-4 rounded-xl shadow-sm">
                  <div>
                    <span className="text-slate-400 text-xs block">Assigned Approver</span>
                    <span className="font-semibold text-slate-800">{selectedApproval.approverName || "Assigned by Role"}</span>
                  </div>
                  <div>
                    <span className="text-slate-400 text-xs block">Assigned Role</span>
                    <span className="font-semibold text-indigo-700">{formatRoleLabel(selectedApproval.requiredRole)}</span>
                  </div>
                  <div>
                    <span className="text-slate-400 text-xs block">Requested By</span>
                    <span className="font-semibold text-slate-800">{selectedApproval.requestedBy || "System"}</span>
                  </div>
                  <div>
                    <span className="text-slate-400 text-xs block">Requested Date</span>
                    <span className="font-semibold text-slate-800">
                      {new Date(selectedApproval.requestedAt).toLocaleString("en-IN")}
                    </span>
                  </div>
                </div>
              </div>

              {/* Remarks/Rejection Reason */}
              {selectedApproval.remarks && (
                <div className="bg-slate-50 p-4 rounded-xl border border-slate-100">
                  <div className="text-xs text-slate-400 font-semibold mb-1">Approval Remarks</div>
                  <p className="text-sm text-slate-800 italic">"{selectedApproval.remarks}"</p>
                </div>
              )}

              {selectedApproval.rejectionReason && (
                <div className="bg-red-50 p-4 rounded-xl border border-red-100">
                  <div className="text-xs text-red-500 font-semibold mb-1">Rejection Reason</div>
                  <p className="text-sm text-red-800 italic">"{selectedApproval.rejectionReason}"</p>
                </div>
              )}

              {/* Action History / Audit Trail */}
              <div className="space-y-4">
                <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
                  <Clock size={16} /> Audit Trail & History
                </h3>
                {loadingHistory ? (
                  <div className="text-center py-6 text-slate-400 text-sm flex items-center justify-center gap-2">
                    <Clock className="animate-spin text-slate-400" size={16} />
                    Loading approval history...
                  </div>
                ) : history.length === 0 ? (
                  <div className="text-slate-400 text-sm italic">No history logged.</div>
                ) : (
                  <div className="relative border-l border-slate-200 pl-4 ml-2 space-y-5">
                    {history.map((item) => (
                      <div key={item.id} className="relative">
                        <div className="absolute -left-[21px] top-1.5 w-3 h-3 rounded-full bg-slate-300 border-2 border-white"></div>
                        <div className="text-xs text-slate-400">
                          {new Date(item.createdAt).toLocaleString("en-IN")}
                        </div>
                        <div className="font-semibold text-sm text-slate-800 mt-0.5">{item.action}</div>
                        <div className="text-xs text-slate-500 mt-0.5">
                          By: {item.performedBy} ({formatRoleLabel(item.performedByRole) || "System"})
                        </div>
                        {item.remarks && <p className="text-xs text-slate-600 mt-1 italic">"{item.remarks}"</p>}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Modal Actions */}
            {(selectedApproval.status === "PENDING" || selectedApproval.approvalStatus === "PENDING") &&
              user.role !== ROLES.CASE_MANAGER &&
              (user.role === ROLES.SUPER_ADMIN ||
                selectedApproval.approverId === user.id ||
                selectedApproval.requiredRole === user.role ||
                selectedApproval.assignedRole === user.role) && (
                <div className="p-6 border-t border-slate-100 bg-slate-50 flex gap-4">
                  <button
                    onClick={() => handleOpenAction(selectedApproval, "approve")}
                    className="flex-1 py-2.5 px-4 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-semibold shadow-sm transition flex justify-center items-center gap-1.5 text-sm"
                  >
                    <Check size={18} /> Approve Payment
                  </button>
                  <button
                    onClick={() => handleOpenAction(selectedApproval, "reject")}
                    className="flex-1 py-2.5 px-4 bg-red-600 hover:bg-red-700 text-white rounded-xl font-semibold shadow-sm transition flex justify-center items-center gap-1.5 text-sm"
                  >
                    <X size={18} /> Reject Payment
                  </button>
                </div>
              )}
          </div>
        </div>
      )}

      {/* Confirmation Remarks Dialog */}
      {actionApproval && actionType && (
        <div className="fixed inset-0 z-50 overflow-hidden bg-slate-900/60 backdrop-blur-sm flex justify-center items-center p-4 animate-in fade-in duration-200">
          <form
            onSubmit={handleActionSubmit}
            className="w-full max-w-md bg-white rounded-3xl border border-slate-200 shadow-2xl flex flex-col overflow-hidden animate-in zoom-in-95 duration-200"
          >
            {/* Dialog Header */}
            <div className={`px-6 py-5 text-white flex items-center gap-2 ${actionType === "approve" ? "bg-emerald-600" : "bg-red-600"}`}>
              {actionType === "approve" ? <CheckCircle2 size={22} /> : <AlertTriangle size={22} />}
              <h3 className="font-bold text-lg">
                {actionType === "approve" ? "Confirm Payment Approval" : "Reject Payment Approval"}
              </h3>
            </div>

            {/* Dialog Body */}
            <div className="p-6 space-y-4">
              <div className="text-slate-500 text-sm leading-relaxed">
                You are about to {actionType === "approve" ? "approve" : "reject"} the payment for{" "}
                <strong className="text-slate-800">{actionApproval.vendorName}</strong> amounting to{" "}
                <strong className="text-slate-900">{money(actionApproval.amount, actionApproval.currency)}</strong>.
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-500 uppercase tracking-wider block">
                  {actionType === "approve" ? "Approval Remarks" : "Reason for Rejection"}
                </label>
                <textarea
                  required
                  value={remarks}
                  onChange={(e) => setRemarks(e.target.value)}
                  placeholder={
                    actionType === "approve"
                      ? "Describe any additional details or confirmation context..."
                      : "Provide a clear reason for the rejection so the requester can adjust details..."
                  }
                  rows={4}
                  className="w-full rounded-xl border border-slate-200 p-3 outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 text-sm transition-all"
                />
              </div>
            </div>

            {/* Dialog Footer */}
            <div className="px-6 py-4 bg-slate-50 border-t border-slate-100 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => {
                  setActionApproval(null);
                  setActionType(null);
                }}
                className="py-2 px-4 rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-100 text-sm font-semibold transition"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={submitting}
                className={`py-2 px-5 rounded-xl text-white font-semibold text-sm transition flex items-center gap-1.5 shadow-sm ${
                  actionType === "approve" ? "bg-emerald-600 hover:bg-emerald-700" : "bg-red-600 hover:bg-red-700"
                }`}
              >
                {submitting ? (
                  <>
                    <Clock className="animate-spin" size={16} /> Submitting...
                  </>
                ) : (
                  <>
                    {actionType === "approve" ? "Confirm Approve" : "Confirm Reject"}
                  </>
                )}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};

export default ApprovalsList;
