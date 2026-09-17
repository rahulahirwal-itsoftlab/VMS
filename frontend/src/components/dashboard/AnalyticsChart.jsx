import React from "react";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip,
} from "recharts";

const defaultData = [
  { month: "Jan", po: 25 },
  { month: "Feb", po: 40 },
  { month: "Mar", po: 35 },
  { month: "Apr", po: 55 },
  { month: "May", po: 48 },
  { month: "Jun", po: 70 },
  { month: "Jul", po: 82 },
];

const AnalyticsChart = ({
  data = defaultData,
  dataKey = "po",
  categoryKey = "month",
  color = "#2563EB",
}) => {
  if (!data || data.length === 0) {
    return (
      <div className="flex h-[300px] w-full items-center justify-center rounded-2xl border border-dashed border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50 text-sm font-medium text-slate-400">
        No analytics data available
      </div>
    );
  }

  return (
    <div className="h-[320px] w-full">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
          <defs>
            <linearGradient id={`chartGradient-${dataKey}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity={0.4} />
              <stop offset="100%" stopColor={color} stopOpacity={0.0} />
            </linearGradient>
          </defs>

          <CartesianGrid strokeDasharray="3 3" vertical={false} className="stroke-slate-200 dark:stroke-slate-800" />

          <XAxis
            dataKey={categoryKey}
            tickLine={false}
            axisLine={false}
            tick={{ fill: "#64748B", fontSize: 12, fontWeight: 500 }}
            dy={8}
          />

          <YAxis
            tickLine={false}
            axisLine={false}
            tick={{ fill: "#64748B", fontSize: 12, fontWeight: 500 }}
            dx={-8}
          />

          <Tooltip
            contentStyle={{
              backgroundColor: "#0F172A",
              borderColor: "#1E293B",
              borderRadius: "14px",
              color: "#F8FAFC",
              fontSize: "12px",
              fontWeight: 600,
              boxShadow: "0 20px 25px -5px rgba(0, 0, 0, 0.3)",
              padding: "10px 14px",
            }}
            itemStyle={{ color: color }}
          />

          <Area
            type="monotone"
            dataKey={dataKey}
            stroke={color}
            strokeWidth={3}
            fill={`url(#chartGradient-${dataKey})`}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
};

export default AnalyticsChart;