import { useCallback, useEffect, useState } from "react";
import { CheckCircle, Clock, RefreshCw, Wallet, XCircle, Filter, Download } from "lucide-react";
import { useAuth } from "../../../context/AuthContext";
import { getMyDashboard } from "../../../services/dashboardService";
import StatCard from "../StatCard";

const money = (value) => `₹ ${Number(value || 0).toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;
const dateTime = (value) => (value ? new Date(value).toLocaleString("en-IN") : "-");

const getGreeting = () => {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
};

const ManagerDashboard = () => {
  const { user } = useAuth();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");

  const displayName = `${user?.first_name ?? ""} ${user?.last_name ?? ""}`.trim() || user?.name || user?.email || "User";

  const load = useCallback(async ({ silent = false } = {}) => {
    if (!silent) setLoading(true);
    setRefreshing(silent);
    setError("");
    try {
      setData(await getMyDashboard({ preset: "thisMonth" }));
    } catch (err) {
      setError(err?.response?.data?.message || "Manager dashboard data could not be loaded.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="h-28 animate-pulse rounded-[24px] border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900" />
        <div className="grid gap-5 sm:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-44 animate-pulse rounded-[24px] border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900" />
          ))}
        </div>
      </div>
    );
  }
  if (error) return <div className="rounded-[20px] border border-red-200 bg-red-50 p-4 text-xs font-bold text-red-700">{error}</div>;

  const summary = data?.summary || {};
  const approvals = data?.paymentApprovals || [];
  const history = data?.approvalHistory || [];
  const limits = data?.approvalLimits || {};

  const totalAppr = Number(summary.pendingPaymentApprovals || 0) + Number(summary.approvedPayments || 0) + Number(summary.rejectedPayments || 0);
  const apprRate = totalAppr > 0 ? Math.round((Number(summary.approvedPayments || 0) / totalAppr) * 100) : 0;

  return (
    <div className="space-y-6">
      {/* Header Toolbar with Warm Greeting */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-slate-900 dark:text-slate-100 font-heading">
            {getGreeting()}, <span className="text-[#0090B8]">{displayName}</span> 👋
          </h1>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400 font-medium">
            Approval threshold scope: {money(limits.managerMin)} to {money(limits.managerMax)}
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <button
            type="button"
            onClick={() => load({ silent: true })}
            disabled={refreshing}
            className="flex h-10 items-center gap-2 rounded-full bg-[#0090B8] hover:bg-[#007799] text-white px-5 text-xs font-bold shadow-md shadow-sky-500/20 transition cursor-pointer"
          >
            <RefreshCw size={14} className={refreshing ? "animate-spin" : ""} />
            Refresh
          </button>
        </div>
      </div>

      {/* Top 3 Hero Cards (Pure DB Data) */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-5 lg:gap-6">
        <StatCard
          variant="hero"
          title="Pending Approvals"
          value={summary.pendingPaymentApprovals || 0}
          change={money(summary.pendingAmount || 0)}
          subtitle="Awaiting your authorization in your assigned tier"
        />

        <StatCard
          variant="progress"
          title="Approved Payments"
          value={summary.approvedPayments || 0}
          change="Completed DB"
          progressPercent={apprRate}
          progressLabel="Approval clearing rate"
          progressSubtext="Based on DB records"
        />

        <StatCard
          variant="gauge"
          title="Today's Requests"
          gaugeValue={summary.todaysRequests || 0}
          gaugeSubtext={`${summary.weeksRequests || 0} requests processed this week`}
        />
      </div>

      {/* Assigned Approvals Table */}
      <section className="rounded-[24px] border border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 shadow-sm">
        <div className="mb-4 flex items-center justify-between gap-3">
          <h2 className="text-base font-bold text-slate-900 dark:text-slate-100 font-heading">
            Assigned Payment Approvals
          </h2>
        </div>
        <div className="overflow-hidden rounded-[20px] border border-slate-100 dark:border-slate-800">
          <div className="overflow-x-auto custom-scrollbar">
            <table className="min-w-full text-xs">
              <thead className="bg-slate-50 dark:bg-slate-800 text-left font-bold uppercase tracking-wider text-slate-500">
                <tr>
                  <th className="px-4 py-3.5">Payment</th>
                  <th className="px-4 py-3.5">Invoice</th>
                  <th className="px-4 py-3.5">PO</th>
                  <th className="px-4 py-3.5">Vendor</th>
                  <th className="px-4 py-3.5 text-right">Amount</th>
                  <th className="px-4 py-3.5">Requested By</th>
                  <th className="px-4 py-3.5 text-center">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800 bg-white dark:bg-slate-900">
                {approvals.map((item) => (
                  <tr key={item.id} className="transition hover:bg-slate-50/60 dark:hover:bg-slate-800/40">
                    <td className="px-4 py-3.5 font-bold text-[#0090B8]">{item.paymentNumber}</td>
                    <td className="px-4 py-3.5">{item.invoiceNumber || "-"}</td>
                    <td className="px-4 py-3.5">{item.purchaseOrderNumber || "-"}</td>
                    <td className="px-4 py-3.5">
                      <p className="font-bold text-slate-900 dark:text-slate-100">{item.vendorName || "-"}</p>
                      <p className="text-[10px] text-slate-400 font-mono">{item.vendorCode || "-"}</p>
                    </td>
                    <td className="px-4 py-3.5 text-right font-extrabold text-slate-900 dark:text-slate-100">{money(item.requestedAmount)}</td>
                    <td className="px-4 py-3.5">{item.requestedBy || "-"}</td>
                    <td className="px-4 py-3.5 text-center">
                      <span className="inline-flex items-center rounded-full bg-amber-50 text-amber-600 px-3 py-1 text-[10px] font-bold border border-amber-200">
                        {item.currentStatus}
                      </span>
                    </td>
                  </tr>
                ))}
                {!approvals.length && (
                  <tr>
                    <td colSpan="7" className="px-4 py-8 text-center text-xs text-slate-400">
                      No approval requests pending at this time.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* History */}
      <section className="rounded-[24px] border border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 shadow-sm">
        <h2 className="mb-4 text-base font-bold text-slate-900 dark:text-slate-100 font-heading">Approval History</h2>
        <div className="space-y-3">
          {history.map((item) => (
            <div key={item.id} className="rounded-2xl border border-slate-100 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-800/40 p-4">
              <p className="text-xs font-bold capitalize text-slate-900 dark:text-slate-100">{String(item.action || "").replaceAll("_", " ")}</p>
              <p className="mt-1 text-[11px] text-slate-400">{item.remarks || "No remarks"} • {dateTime(item.created_at)}</p>
            </div>
          ))}
          {!history.length && (
            <div className="flex min-h-24 items-center justify-center rounded-2xl border border-dashed border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 text-xs font-medium text-slate-400">
              No approval history available yet.
            </div>
          )}
        </div>
      </section>
    </div>
  );
};

export default ManagerDashboard;
