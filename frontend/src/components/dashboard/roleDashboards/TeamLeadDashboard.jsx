import { useCallback, useEffect, useState } from "react";
import {
  CheckCircle2,
  ClipboardList,
  FileText,
  RefreshCw,
  Wallet,
  XCircle,
} from "lucide-react";
import { useAuth } from "../../../context/AuthContext";
import { getMyDashboard } from "../../../services/dashboardService";
import StatCard from "../StatCard";

const safeNumber = (value) => {
  const n = Number(value ?? 0);
  return Number.isFinite(n) ? n : 0;
};

const formatNumber = (value) =>
  new Intl.NumberFormat("en-IN").format(safeNumber(value));

const getGreeting = () => {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
};

const TeamLeadDashboard = () => {
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
      const result = await getMyDashboard({ preset: "thisMonth" });
      setData(result);
    } catch (err) {
      setError(
        err?.response?.data?.message ||
          "Team Lead dashboard data could not be loaded."
      );
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    const id = window.setInterval(() => load({ silent: true }), 60_000);
    return () => window.clearInterval(id);
  }, [load]);

  const pending   = data?.pendingActions ?? {};
  const summary   = data?.summary       ?? {};
  const invoices  = summary.invoices    ?? {};
  const payments  = summary.payments    ?? {};

  const totalInv = safeNumber(invoices.total);
  const apprInv = safeNumber(invoices.approved);
  const invRatio = totalInv > 0 ? Math.round((apprInv / totalInv) * 100) : 0;

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

  return (
    <div className="space-y-6">
      {/* Header Toolbar with Warm Greeting */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-slate-900 dark:text-slate-100 font-heading">
            {getGreeting()}, <span className="text-[#0090B8]">{displayName}</span> 👋
          </h1>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400 font-medium">
            Invoice approval queue and team operations based on database records
          </p>
        </div>
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

      {error && (
        <section className="rounded-[20px] border border-red-200 bg-red-50 p-4 text-xs font-bold text-red-700">
          {error}
        </section>
      )}

      {/* Top 3 Hero Cards (Pure DB Data) */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-5 lg:gap-6">
        <StatCard
          variant="hero"
          title="Pending Invoice Approvals"
          value={formatNumber(pending.pendingInvoiceApprovals || 0)}
          change="Real-time DB"
          subtitle="Invoices routed to Team Lead queue awaiting review"
        />

        <StatCard
          variant="progress"
          title="Invoice Clearance"
          value={formatNumber(invoices.total || 0)}
          change={`${formatNumber(invoices.approved || 0)} Approved`}
          progressPercent={invRatio}
          progressLabel="Clearance rate"
          progressSubtext="Based on DB records"
        />

        <StatCard
          variant="gauge"
          title="Total Payments"
          gaugeValue={safeNumber(payments.total || 0)}
          gaugeSubtext={`${formatNumber(payments.success ?? payments.completed ?? 0)} successful payments`}
        />
      </div>

      {/* Invoice Approval Queue Table */}
      <section className="rounded-[24px] border border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 shadow-sm">
        <div className="mb-4 flex items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-bold text-slate-900 dark:text-slate-100 font-heading">
              Invoice Approval Queue
            </h2>
            <p className="mt-0.5 text-xs text-slate-400">
              Invoices routed to Team Lead for approval (<code className="rounded-full bg-slate-100 dark:bg-slate-800 px-2 py-0.5 text-[10px] font-mono text-[#0090B8]">PENDING_TEAM_LEAD</code>)
            </p>
          </div>
        </div>

        {safeNumber(pending.pendingInvoiceApprovals) === 0 ? (
          <div className="flex min-h-36 items-center justify-center rounded-[20px] border border-dashed border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 text-xs font-medium text-slate-400">
            No invoices pending your approval at this time.
          </div>
        ) : (
          <div className="overflow-hidden rounded-[20px] border border-slate-100 dark:border-slate-800">
            <div className="overflow-x-auto custom-scrollbar">
              <table className="min-w-full text-xs">
                <thead className="bg-slate-50 dark:bg-slate-800 text-left font-bold uppercase tracking-wider text-slate-500">
                  <tr>
                    <th className="px-4 py-3.5">Invoice</th>
                    <th className="px-4 py-3.5">Vendor</th>
                    <th className="px-4 py-3.5 text-right">Amount</th>
                    <th className="px-4 py-3.5 text-center">Status</th>
                    <th className="px-4 py-3.5">Date</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800 bg-white dark:bg-slate-900">
                  <tr>
                    <td colSpan={5} className="px-4 py-8 text-center text-xs text-slate-400">
                      {safeNumber(pending.pendingInvoiceApprovals)} invoice(s) awaiting approval — open the approval queue to review them.
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        )}
      </section>
    </div>
  );
};

export default TeamLeadDashboard;
