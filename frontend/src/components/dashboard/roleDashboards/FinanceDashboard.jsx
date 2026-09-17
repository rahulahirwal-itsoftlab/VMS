import { useCallback, useEffect, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Clock3,
  RefreshCw,
  Users,
  Wallet,
} from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
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
  getFinanceHeadDashboard,
} from "../../../services/dashboardService";
import StatCard from "../StatCard";
import FilterSelect from "../../common/FilterSelect";

const STATUS_COLORS = ["#0090B8", "#1E3A5F", "#0EA5E9", "#2DD4BF", "#F59E0B"];

const safeNumber = (value) => {
  const parsed = Number(value || 0);
  return Number.isFinite(parsed) ? parsed : 0;
};

const formatCompact = (value) =>
  new Intl.NumberFormat("en-IN", {
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(safeNumber(value));

const formatCurrency = (value) =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(safeNumber(value));

const normalizeSeries = (source) =>
  Array.isArray(source)
    ? source
        .map((item) => ({
          label: item?.label ?? "",
          value: safeNumber(item?.value),
          count: safeNumber(item?.count),
        }))
        .filter((item) => item.label)
    : [];

const getGreeting = () => {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
};

const EmptyPanel = ({ message = "No data available yet" }) => (
  <div className="flex h-full min-h-44 items-center justify-center rounded-[20px] border border-dashed border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 px-4 text-center text-sm font-medium text-slate-400">
    {message}
  </div>
);

const ChartCard = ({ title, subtitle, hasData, children }) => (
  <section className="rounded-[24px] border border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 shadow-sm flex flex-col justify-between">
    <h2 className="truncate text-base font-bold text-slate-900 dark:text-slate-100 font-heading">
      {title}
    </h2>
    {subtitle ? (
      <p className="mt-1 truncate text-xs text-slate-400">{subtitle}</p>
    ) : null}
    <div className="mt-4 min-w-0 w-full flex-1">
      {hasData ? children : <EmptyPanel />}
    </div>
  </section>
);

const CleanPieChart = ({ data, colors = STATUS_COLORS }) => {
  const total = Array.isArray(data)
    ? data.reduce((sum, item) => sum + safeNumber(item.value), 0)
    : 0;

  if (!data || data.length === 0 || total === 0) {
    return <EmptyPanel message="No chart data available" />;
  }

  return (
    <div className="flex flex-col justify-between h-full min-h-[260px] pt-1">
      <div className="relative h-40 w-full flex items-center justify-center">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Tooltip
              content={({ active, payload }) => {
                if (active && payload && payload.length) {
                  const item = payload[0];
                  const pct =
                    total > 0 ? ((item.value / total) * 100).toFixed(0) : 0;
                  return (
                    <div className="rounded-xl border border-slate-700 bg-[#1E3A5F] p-2.5 shadow-xl text-white backdrop-blur-md">
                      <div className="flex items-center gap-2">
                        <span
                          className="h-2.5 w-2.5 rounded-full"
                          style={{
                            backgroundColor: item.payload?.fill || item.color,
                          }}
                        />
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
              outerRadius={68}
              innerRadius={44}
              paddingAngle={3}
              stroke="none"
            >
              {data.map((entry, index) => (
                <Cell
                  key={entry.name || index}
                  fill={colors[index % colors.length]}
                />
              ))}
            </Pie>
          </PieChart>
        </ResponsiveContainer>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-xl font-extrabold text-slate-900 dark:text-white font-heading">
            {total}
          </span>
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
            Total
          </span>
        </div>
      </div>

      <div className="mt-3 grid grid-cols-1 gap-1.5 pt-3 border-t border-slate-100 dark:border-slate-800">
        {data.map((entry, index) => {
          const color = colors[index % colors.length];
          const pct = total > 0 ? ((entry.value / total) * 100).toFixed(0) : 0;
          return (
            <div
              key={entry.name || index}
              className="flex items-center justify-between rounded-lg bg-slate-50 dark:bg-slate-800/60 px-2.5 py-1.5 text-xs"
            >
              <div className="flex items-center gap-2 min-w-0">
                <span
                  className="h-2.5 w-2.5 shrink-0 rounded-full"
                  style={{ backgroundColor: color }}
                />
                <span
                  className="truncate text-xs font-bold text-slate-700 dark:text-slate-200"
                  title={entry.name}
                >
                  {entry.name}
                </span>
              </div>
              <span className="shrink-0 text-xs font-extrabold text-slate-900 dark:text-white">
                {entry.value}{" "}
                <span className="text-[10px] text-slate-400 font-medium">
                  ({pct}%)
                </span>
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
};

const FinanceDashboard = () => {
  const { user } = useAuth();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [filters, setFilters] = useState({
    preset: "last30",
    groupBy: "day",
    startDate: "",
    endDate: "",
  });

  const displayName =
    `${user?.first_name ?? ""} ${user?.last_name ?? ""}`.trim() ||
    user?.name ||
    user?.email ||
    "User";

  const loadDashboard = useCallback(
    async ({ silent = false } = {}) => {
      if (!silent) setLoading(true);
      setRefreshing(silent);
      setError("");

      try {
        const response = await getFinanceHeadDashboard(filters);
        setData(response);
      } catch {
        setError(
          "Finance Head dashboard data could not be loaded. Please try again.",
        );
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [filters],
  );

  useEffect(() => {
    loadDashboard();
  }, [loadDashboard]);

  const vendorReview = data?.summary?.vendorReview ?? {};
  const payments = data?.summary?.payments ?? {};
  const employees = data?.summary?.employees ?? {};
  const vendorDistribution = Array.isArray(
    data?.charts?.vendorReviewStatusDistribution,
  )
    ? data.charts.vendorReviewStatusDistribution.filter(
        (item) => safeNumber(item.value) > 0,
      )
    : [];
  const employeeDistribution = Array.isArray(
    data?.charts?.employeeStatusDistribution,
  )
    ? data.charts.employeeStatusDistribution.filter(
        (item) => safeNumber(item.value) > 0,
      )
    : [];
  const highValuePaymentTrend = normalizeSeries(
    data?.trends?.highValuePayments,
  );

  const updateFilter = (key, value) => {
    setFilters((current) => ({ ...current, [key]: value }));
  };



  if (loading) {
    return (
      <div className="grid gap-6">
        <div className="h-32 animate-pulse rounded-[24px] border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900" />
        <div className="grid gap-4 sm:grid-cols-3">
          {Array.from({ length: 3 }).map((_, index) => (
            <div
              key={index}
              className="h-44 animate-pulse rounded-[24px] border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900"
            />
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
            {getGreeting()},{" "}
            <span className="text-[#0090B8]">{displayName}</span> 👋
          </h1>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400 font-medium">
            Live vendor-review, high-value payment, and managed employee
            analytics from database
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <FilterSelect
            className="w-44"
            value={filters.preset}
            onChange={(nextValue) => updateFilter("preset", nextValue)}
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
        <section className="rounded-[20px] border border-red-200 bg-red-50 p-4 text-red-800">
          <h2 className="text-xs font-bold">Dashboard unavailable</h2>
          <p className="mt-1 text-xs">{error}</p>
        </section>
      ) : null}

      {/* Top 3 Hero Cards (Pure DB Data) */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-5 lg:gap-6">
        <StatCard
          variant="hero"
          title="High-Value Awaiting Approval"
          value={formatCurrency(payments.awaitingAmount)}
          change={`${formatCompact(payments.awaitingApproval)} pending`}
          subtitle="Payments at or above Finance Head review threshold"
        />

        <StatCard
          title="Active Vendors"
          value={formatCompact(vendorReview.approved)}
          icon={Users}
          actionText="Currently active in system"
          actionLink="/vendors?status=approved"
        />

        <StatCard
          variant="gauge"
          title="Managed Employees"
          gaugeValue={safeNumber(employees.total)}
          gaugeSubtext={`${employees.active || 0} Active employee profiles`}
        />
      </div>

      {/* Main Bar Chart */}
      <ChartCard
        title="High-Value Payment Trend"
        subtitle="INR payments at or above the Finance Head approval threshold."
        hasData={highValuePaymentTrend.length > 0}
      >
        <div className="h-64 w-full pt-2">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={highValuePaymentTrend}>
              <defs>
                <linearGradient id="financeBarGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#0090B8" />
                  <stop offset="100%" stopColor="#1E3A5F" />
                </linearGradient>
              </defs>
              <CartesianGrid
                strokeDasharray="3 3"
                vertical={false}
                className="stroke-slate-200 dark:stroke-slate-800"
              />
              <XAxis
                dataKey="label"
                tick={{ fontSize: 11, fill: "#64748B" }}
                dy={6}
              />
              <YAxis tick={{ fontSize: 11, fill: "#64748B" }} dx={-6} />
              <Tooltip
                formatter={(value) => formatCurrency(value)}
                contentStyle={{
                  backgroundColor: "#1E3A5F",
                  borderRadius: "12px",
                  color: "#FFF",
                  fontSize: "11px",
                }}
              />
              <Bar
                dataKey="value"
                fill="url(#financeBarGrad)"
                radius={[8, 8, 0, 0]}
                barSize={32}
              />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </ChartCard>

      {/* Balanced 3-Column Chart & Overview Grid */}
      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        <ChartCard
          title="Vendor Review Status"
          subtitle="Distribution from real vendor review statuses."
          hasData={vendorDistribution.length > 0}
        >
          <CleanPieChart data={vendorDistribution} />
        </ChartCard>

        <ChartCard
          title="Managed Employee Status"
          subtitle="Excludes Super Admin and Finance Head users."
          hasData={employeeDistribution.length > 0}
        >
          <CleanPieChart data={employeeDistribution} />
        </ChartCard>

        <section className="rounded-[24px] border border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 shadow-sm">
          <h2 className="text-base font-bold text-slate-900 dark:text-slate-100 font-heading">
            Payment Overview
          </h2>
          <p className="mt-1 text-xs text-slate-400">
            High-value payment counts from your approval scope.
          </p>
          <dl className="mt-5 space-y-3">
            {[
              {
                label: "Awaiting Approval",
                value: formatCompact(payments.awaitingApproval),
                hint: formatCurrency(payments.awaitingAmount),
                tone: "cyan",
              },
              {
                label: "High-Value Payments",
                value: formatCompact(payments.highValueCount),
                hint: `≥ ${formatCurrency(payments.threshold)}`,
                tone: "navy",
              },
            ].map(({ label, value, hint, tone }) => {
              const bg =
                tone === "cyan"
                  ? "bg-sky-50 dark:bg-slate-800 text-[#0090B8] border-sky-100 dark:border-slate-700"
                  : "bg-slate-900 text-white border-slate-800";
              return (
                <div
                  key={label}
                  className={`flex items-center justify-between rounded-2xl border p-4 ${bg}`}
                >
                  <div>
                    <p className="text-xs font-bold">{label}</p>
                    {hint ? (
                      <p className="mt-0.5 text-[11px] opacity-80">{hint}</p>
                    ) : null}
                  </div>
                  <span className="text-2xl font-extrabold font-heading">
                    {value}
                  </span>
                </div>
              );
            })}
          </dl>
        </section>
      </div>
    </div>
  );
};

export default FinanceDashboard;
