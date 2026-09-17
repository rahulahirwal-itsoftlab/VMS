import React, { useCallback, useEffect, useState } from "react";
import {
  Activity,
  Building2,
  DollarSign,
  FileSearch,
  Package,
  Receipt,
  RefreshCw,
  ShieldCheck,
  Users,
  Wallet,
  MapPin,
  TrendingUp,
} from "lucide-react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { useAuth } from "../../../context/AuthContext";
import {
  DATE_PRESETS,
  getDashboardAnalytics,
} from "../../../services/dashboardService";
import FilterSelect from "../../common/FilterSelect";
import StatCard from "../StatCard";

const STATUS_PALETTE = ["#0090B8", "#1E3A5F", "#0EA5E9", "#2DD4BF", "#F59E0B", "#EF4444"];

function safeNumber(value, fallback = 0) {
  const numberValue = typeof value === "number" ? value : Number(value);
  return Number.isFinite(numberValue) ? numberValue : fallback;
}

function formatCompact(value) {
  return new Intl.NumberFormat(undefined, {
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(safeNumber(value, 0));
}

function formatCurrency(value) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(safeNumber(value, 0));
}

function normalizeSeries(source) {
  if (!Array.isArray(source)) return [];

  return source
    .map((item) => ({
      label: item?.label ?? item?.period ?? "",
      value: safeNumber(item?.value, 0),
      count: safeNumber(item?.count, 0),
    }))
    .filter((item) => item.label);
}

const getGreeting = () => {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
};

function EmptyPanel({ message = "No data available yet" }) {
  return (
    <div className="flex h-full min-h-44 items-center justify-center rounded-[20px] border border-dashed border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50 px-4 text-center text-sm font-medium text-slate-400">
      {message}
    </div>
  );
}

function ChartShell({ title, children, hasData, subtitle, actionPills }) {
  return (
    <section className="rounded-[24px] border border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 sm:p-6 shadow-sm flex flex-col justify-between">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <h2 className="truncate text-base font-bold text-slate-900 dark:text-slate-100 font-heading">{title}</h2>
          {subtitle ? <p className="mt-1 truncate text-xs text-slate-500 dark:text-slate-400">{subtitle}</p> : null}
        </div>
        
        {actionPills ? (
          <div className="flex items-center gap-1.5">{actionPills}</div>
        ) : (
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-slate-100 dark:bg-slate-800 text-[#0090B8]">
            <Activity size={18} />
          </div>
        )}
      </div>
      <div className="mt-4 min-w-0 w-full flex-1">
        {hasData ? children : <EmptyPanel />}
      </div>
    </section>
  );
}

const CleanPieChart = ({ data, colors = STATUS_PALETTE }) => {
  const total = Array.isArray(data) ? data.reduce((sum, item) => sum + safeNumber(item.value), 0) : 0;

  if (!data || data.length === 0 || total === 0) {
    return <EmptyPanel message="No chart data available" />;
  }

  return (
    <div className="flex flex-col justify-between h-full min-h-[260px] pt-1">
      <div className="relative h-44 w-full flex items-center justify-center">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Tooltip
              content={({ active, payload }) => {
                if (active && payload && payload.length) {
                  const item = payload[0];
                  const pct = total > 0 ? ((item.value / total) * 100).toFixed(0) : 0;
                  return (
                    <div className="rounded-xl border border-slate-700 bg-[#1E3A5F] p-2.5 shadow-xl text-white backdrop-blur-md">
                      <div className="flex items-center gap-2">
                        <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: item.payload?.fill || item.color }} />
                        <span className="text-xs font-bold">{item.name}</span>
                      </div>
                      <p className="mt-1 text-xs font-extrabold text-sky-300">
                        {item.value} ({pct}%)
                      </p>
                    </div>
                  );
                }
                return null;
              }}
            />
            <Pie
              data={data}
              dataKey="value"
              nameKey="name"
              cx="50%"
              cy="50%"
              outerRadius={70}
              innerRadius={44}
              paddingAngle={3}
              stroke="none"
            >
              {data.map((entry, index) => (
                <Cell key={entry.name || index} fill={colors[index % colors.length]} />
              ))}
            </Pie>
          </PieChart>
        </ResponsiveContainer>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-xl font-extrabold text-[#1E3A5F] dark:text-white font-heading">{total}</span>
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Total</span>
        </div>
      </div>

      <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-1.5 pt-3 border-t border-slate-100 dark:border-slate-800">
        {data.map((entry, index) => {
          const color = colors[index % colors.length];
          const pct = total > 0 ? ((entry.value / total) * 100).toFixed(0) : 0;
          return (
            <div key={entry.name || index} className="flex items-center justify-between rounded-lg bg-slate-50 dark:bg-slate-800/60 px-2.5 py-1.5 text-xs">
              <div className="flex items-center gap-2 min-w-0">
                <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: color }} />
                <span className="truncate text-xs font-bold text-slate-700 dark:text-slate-200" title={entry.name}>
                  {entry.name}
                </span>
              </div>
              <span className="shrink-0 text-xs font-extrabold text-slate-900 dark:text-white">
                {entry.value} <span className="text-[10px] text-slate-400 font-medium">({pct}%)</span>
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
};

const DashboardOverview = () => {
  const { user } = useAuth();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);
  const [filters, setFilters] = useState({
    preset: "last30",
    groupBy: "day",
    startDate: "",
    endDate: "",
  });

  const displayName = `${user?.first_name ?? ""} ${user?.last_name ?? ""}`.trim() || user?.name || user?.email || "User";

  const loadDashboard = useCallback(async ({ silent = false } = {}) => {
    if (!silent) setLoading(true);
    setRefreshing(silent);
    setError(null);

    try {
      const analytics = await getDashboardAnalytics(filters);
      setData(analytics);
    } catch {
      setError("Dashboard data could not be loaded. Please try again.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [filters]);

  useEffect(() => {
    loadDashboard();
  }, [loadDashboard]);

  const summary = data?.summary ?? {};
  const users = summary.users ?? {};
  const vendors = summary.vendors ?? {};
  const invoices = summary.invoices ?? {};
  const revenue = summary.revenue ?? {};
  const revenueTrend = normalizeSeries(data?.trends?.revenue);
  const purchaseOrderTrend = normalizeSeries(data?.trends?.purchaseOrders);
  const invoiceStatus = Array.isArray(data?.charts?.invoiceStatusDistribution)
    ? data.charts.invoiceStatusDistribution.filter((item) => safeNumber(item.value) > 0)
    : [];
  const paymentStatus = Array.isArray(data?.charts?.paymentStatusDistribution)
    ? data.charts.paymentStatusDistribution.filter((item) => safeNumber(item.value) > 0)
    : [];

  const handleFilterChange = (key, value) => {
    setFilters((current) => ({
      ...current,
      [key]: value,
    }));
  };

  if (loading) {
    return (
      <div className="grid gap-6">
        <div className="h-32 animate-pulse rounded-[24px] border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900" />
        <div className="grid gap-5 sm:grid-cols-3">
          {Array.from({ length: 3 }).map((_, index) => (
            <div key={index} className="h-44 animate-pulse rounded-[24px] border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Top Header Toolbar with Warm Greeting */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-slate-900 dark:text-slate-100 font-heading">
            {getGreeting()}, <span className="text-[#0090B8]">{displayName}</span> 👋
          </h1>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400 font-medium">
            Live system performance summary and verified analytics
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <FilterSelect
            className="w-44"
            value={filters.preset}
            onChange={(nextValue) => handleFilterChange("preset", nextValue)}
            options={DATE_PRESETS}
            ariaLabel="Dashboard date preset"
          />

          <button
            type="button"
            onClick={() => loadDashboard({ silent: true })}
            className="flex h-10 items-center gap-2 rounded-full bg-[#0090B8] hover:bg-[#007799] text-white px-5 text-xs font-bold shadow-md shadow-sky-500/20 transition active:scale-95 cursor-pointer"
          >
            <RefreshCw size={14} className={refreshing ? "animate-spin" : ""} />
            <span>Refresh</span>
          </button>
        </div>
      </div>

      {error ? (
        <section className="rounded-[20px] border border-red-500/20 bg-red-50 dark:bg-red-950/30 p-4 text-xs font-bold text-red-700 dark:text-red-400">
          <h2 className="text-xs font-bold">Dashboard unavailable</h2>
          <p className="mt-1 text-xs">{error}</p>
        </section>
      ) : null}

      {/* Top Row Hero Cards (100% Real DB Data) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-5 lg:gap-6">
        <StatCard
          variant="hero"
          title="Recognized Revenue"
          value={formatCurrency(revenue.recognized)}
          change="Verified DB"
          subtitle="Total verified cleared revenue across active PO settlements"
        />

        <StatCard
          variant="progress"
          title="System Users"
          value={formatCompact(users.total)}
          change={`${users.active || users.total || 0} Active`}
          progressPercent={users.total > 0 ? Math.round(((users.active || users.total || 0) / users.total) * 100) : 100}
          progressLabel="Active users"
          progressSubtext="Verified profiles"
        />

        <StatCard
          variant="gauge"
          title="Invoices Cleared"
          gaugeValue={invoices.total || 0}
          gaugeSubtext={`${invoices.approved || 0} Approved invoices`}
        />
      </div>

      {/* Pie Chart Distribution Row with Clean Status Legend Grid */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <ChartShell title="Invoice Status Distribution" subtitle="Breakdown of invoices by current status." hasData={invoiceStatus.length > 0}>
          <CleanPieChart data={invoiceStatus} />
        </ChartShell>

        <ChartShell title="Payment Status Summary" subtitle="Counts by payment resolution status." hasData={paymentStatus.length > 0}>
          <CleanPieChart data={paymentStatus} />
        </ChartShell>
      </div>

      {/* Additional Charts Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 lg:gap-6">
        <ChartShell title="Recognized Revenue Trend" subtitle="Cleared payment values by period." hasData={revenueTrend.length > 0}>
          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={revenueTrend}>
                <defs>
                  <linearGradient id="revenueTrendGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#0090B8" stopOpacity={0.4} />
                    <stop offset="100%" stopColor="#0090B8" stopOpacity={0.0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} className="stroke-slate-200 dark:stroke-slate-800" />
                <XAxis dataKey="label" tick={{ fontSize: 11, fill: "#64748B" }} dy={8} />
                <YAxis tick={{ fontSize: 11, fill: "#64748B" }} dx={-8} />
                <Tooltip formatter={(value) => formatCurrency(value)} contentStyle={{ backgroundColor: "#1E3A5F", borderColor: "#162E4C", borderRadius: "14px", color: "#FFF" }} />
                <Area type="monotone" dataKey="value" stroke="#0090B8" strokeWidth={3} fill="url(#revenueTrendGrad)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </ChartShell>

        <ChartShell title="Purchase Order Value" subtitle="PO totals grouped by selected period." hasData={purchaseOrderTrend.length > 0}>
          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={purchaseOrderTrend}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} className="stroke-slate-200 dark:stroke-slate-800" />
                <XAxis dataKey="label" tick={{ fontSize: 11, fill: "#64748B" }} dy={8} />
                <YAxis tick={{ fontSize: 11, fill: "#64748B" }} dx={-8} />
                <Tooltip formatter={(value) => formatCurrency(value)} contentStyle={{ backgroundColor: "#1E3A5F", borderColor: "#162E4C", borderRadius: "14px", color: "#FFF" }} />
                <Bar dataKey="value" fill="#1E3A5F" radius={[8, 8, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </ChartShell>
      </div>
    </div>
  );
};

export default DashboardOverview;
