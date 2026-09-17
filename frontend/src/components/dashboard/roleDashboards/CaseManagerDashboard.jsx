import React, { useCallback, useEffect, useState } from "react";
import { RefreshCw } from "lucide-react";
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
  getMyDashboard,
} from "../../../services/dashboardService";
import GlobalStatCard from "../StatCard";
import FilterSelect from "../../common/FilterSelect";

const COLORS = [
  "#0090B8",
  "#1E3A5F",
  "#0EA5E9",
  "#2DD4BF",
  "#F59E0B",
  "#EF4444",
];

const numberFormat = new Intl.NumberFormat("en-IN");

const safeNumber = (value) => {
  const numeric = Number(value || 0);
  return Number.isFinite(numeric) ? numeric : 0;
};

const formatNumber = (value) => numberFormat.format(safeNumber(value));

const normalizeChart = (items = []) =>
  Array.isArray(items)
    ? items.filter((item) => safeNumber(item.value) > 0)
    : [];

const getGreeting = () => {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
};

const EmptyState = ({ message = "No data available yet" }) => (
  <div className="flex min-h-36 items-center justify-center rounded-[20px] border border-dashed border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50 px-4 text-center text-xs font-medium text-slate-400">
    {message}
  </div>
);

const ChartCard = ({ children, title, hasData }) => (
  <section className="rounded-[24px] border border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 shadow-sm flex flex-col justify-between">
    <h2 className="truncate text-base font-bold text-slate-900 dark:text-slate-100 font-heading mb-2">
      {title}
    </h2>
    <div className="min-w-0 w-full flex-1">
      {hasData ? children : <EmptyState />}
    </div>
  </section>
);

/* Clean, Non-Overlapping Donut/Pie Chart Component with Formatted Legend Grid */
const PieStatusChart = ({ data }) => {
  const total = Array.isArray(data)
    ? data.reduce((sum, item) => sum + safeNumber(item.value), 0)
    : 0;

  if (!data || data.length === 0 || total === 0) {
    return <EmptyState message="No chart data available" />;
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
              isAnimationActive={true}
            >
              {data.map((entry, index) => (
                <Cell
                  key={entry.name || index}
                  fill={COLORS[index % COLORS.length]}
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
          const color = COLORS[index % COLORS.length];
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

const BarCountChart = ({ data }) => (
  <div className="h-56 w-full pt-2">
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={data}>
        <defs>
          <linearGradient id="caseBarGrad" x1="0" y1="0" x2="0" y2="1">
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
        <YAxis
          allowDecimals={false}
          tick={{ fontSize: 11, fill: "#64748B" }}
          dx={-6}
        />
        <Tooltip
          contentStyle={{
            backgroundColor: "#1E3A5F",
            borderRadius: "12px",
            color: "#FFF",
            fontSize: "11px",
          }}
        />
        <Bar
          dataKey="value"
          fill="url(#caseBarGrad)"
          radius={[8, 8, 0, 0]}
          barSize={26}
        />
      </BarChart>
    </ResponsiveContainer>
  </div>
);

const CaseManagerDashboard = () => {
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
        const result = await getMyDashboard(filters);
        setData(result);
      } catch {
        setError("Case Manager dashboard data could not be loaded.");
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

  const cards = data?.cards || {};
  const charts = data?.charts || {};

  const totalVendorsCount = safeNumber(cards.totalVendors);
  const activeVendorsCount = safeNumber(cards.activeVendors);
  const vendorRatio =
    totalVendorsCount > 0
      ? Math.round((activeVendorsCount / totalVendorsCount) * 100)
      : 0;

  if (loading) {
    return (
      <div className="grid gap-5 sm:grid-cols-3">
        {Array.from({ length: 3 }).map((_, index) => (
          <div
            key={index}
            className="h-44 animate-pulse rounded-[24px] border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900"
          />
        ))}
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
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400 font-medium"></p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <FilterSelect
            className="w-44"
            value={filters.preset}
            onChange={(nextValue) =>
              setFilters((current) => ({ ...current, preset: nextValue }))
            }
            options={DATE_PRESETS}
            ariaLabel="Dashboard date preset"
          />

          <button
            type="button"
            onClick={() => loadDashboard({ silent: true })}
            className="flex h-10 items-center gap-2 rounded-full bg-[#0090B8] hover:bg-[#007799] text-white px-5 text-xs font-bold shadow-md shadow-sky-500/20 transition cursor-pointer"
          >
            <RefreshCw size={14} className={refreshing ? "animate-spin" : ""} />
            Refresh
          </button>
        </div>
      </div>

      {error ? (
        <section className="rounded-[20px] border border-red-500/20 bg-red-50 dark:bg-red-950/30 p-4 text-xs font-bold text-red-700 dark:text-red-400">
          {error}
        </section>
      ) : null}

      {/* Top 3 Hero Cards (Pure 100% Real Database Metrics) */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-5 lg:gap-6">
        <GlobalStatCard
          variant="hero"
          title="Total Purchase Orders"
          value={formatNumber(cards.totalPurchaseOrders)}
          change="Live DB Record"
          subtitle="Total purchase order requisitions."
        />

        <GlobalStatCard
          variant="progress"
          title="Vendor Pipeline"
          value={formatNumber(cards.totalVendors)}
          change={`${cards.activeVendors || 0} Active`}
          progressPercent={vendorRatio}
          progressLabel="Active ratio"
          progressSubtext="Active vendors"
        />

        <GlobalStatCard
          variant="gauge"
          title="Total Invoices Cleared"
          gaugeValue={safeNumber(cards.totalInvoices)}
          gaugeSubtext={`${cards.approvedInvoices || 0} Approved & cleared`}
        />
      </div>

      {/* Pie & Bar Charts Grid */}
      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        <ChartCard
          title="Vendor Status"
          hasData={normalizeChart(charts.vendorStatus).length > 0}
        >
          <PieStatusChart data={normalizeChart(charts.vendorStatus)} />
        </ChartCard>
        <ChartCard
          title="Invoice Status"
          hasData={normalizeChart(charts.invoiceStatus).length > 0}
        >
          <PieStatusChart data={normalizeChart(charts.invoiceStatus)} />
        </ChartCard>
        <ChartCard
          title="Payment Status"
          hasData={normalizeChart(charts.paymentStatus).length > 0}
        >
          <PieStatusChart data={normalizeChart(charts.paymentStatus)} />
        </ChartCard>
        <ChartCard
          title="Monthly Vendor Registration"
          hasData={normalizeChart(charts.monthlyVendorRegistration).length > 0}
        >
          <BarCountChart
            data={normalizeChart(charts.monthlyVendorRegistration)}
          />
        </ChartCard>
        <ChartCard
          title="Monthly Invoice Count"
          hasData={normalizeChart(charts.monthlyInvoiceCount).length > 0}
        >
          <BarCountChart data={normalizeChart(charts.monthlyInvoiceCount)} />
        </ChartCard>
        <ChartCard
          title="Monthly Payment Count"
          hasData={normalizeChart(charts.monthlyPaymentCount).length > 0}
        >
          <BarCountChart data={normalizeChart(charts.monthlyPaymentCount)} />
        </ChartCard>
      </div>
    </div>
  );
};

export default CaseManagerDashboard;
