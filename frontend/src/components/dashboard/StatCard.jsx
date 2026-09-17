import React from "react";
import { TrendingUp, TrendingDown, ArrowRight, MoreHorizontal } from "lucide-react";
import { Link } from "react-router-dom";

const StatCard = ({
  title,
  value,
  subtitle,
  change,
  isPositive = true,
  actionLink,
  actionText = "View details",
  color = "bg-[#0090B8]",
  icon: Icon,
  variant = "default", // 'default' | 'hero' | 'progress' | 'gauge'
  progressPercent = 65,
  progressLabel = "Checking totally",
  progressSubtext = "+210 today",
  gaugeValue = 0,
  gaugeSubtext = "",
  gaugeLabel = "",
  gaugePercent = null,
}) => {
  const valueTitle = value === null || value === undefined ? "" : String(value);
  const valueTextClass = "max-w-full break-words leading-tight tabular-nums";
  const wrappingStyle = { overflowWrap: "anywhere" };

  // Hero Card — clean white surface matching the default card style
  if (variant === "hero") {
    return (
      <div className="group relative flex min-w-0 flex-col justify-between rounded-[24px] border border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 sm:p-6 shadow-sm dark:shadow-slate-950/40 transition-all duration-300 hover:-translate-y-1 hover:shadow-xl hover:border-[#0090B8]/30">
        <div>
          <div className="flex items-start justify-between gap-3">
            <span className="min-w-0 break-words text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              {title}
            </span>
            <button
              type="button"
              className="text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 transition-colors p-1 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800"
            >
              <MoreHorizontal size={18} />
            </button>
          </div>

          <div className="mt-4 flex min-w-0 flex-wrap items-baseline gap-3">
            <h2
              className={`${valueTextClass} text-[clamp(1.5rem,3vw,2.25rem)] font-extrabold tracking-tight text-slate-900 dark:text-slate-100 font-heading`}
              style={wrappingStyle}
              title={valueTitle}
            >
              {value}
            </h2>
            {change && (
              <span className="inline-flex min-w-0 items-center gap-1 rounded-full bg-emerald-50 dark:bg-emerald-950/40 px-3 py-1 text-xs font-bold text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                <TrendingUp size={13} className="text-emerald-500 dark:text-emerald-400" />
                <span className="break-words" style={wrappingStyle}>{change}</span>
              </span>
            )}
          </div>
        </div>

        {subtitle && (
          <p className="mt-4 text-xs font-medium text-slate-500 dark:text-slate-400">
            {subtitle}
          </p>
        )}

        {actionLink && (
          <div className="mt-5 border-t border-slate-100 dark:border-slate-800/80 pt-3">
            <Link
              to={actionLink}
              className="inline-flex items-center gap-1.5 text-xs font-bold text-[#0090B8] hover:text-[#007799] transition-colors"
            >
              <span>{actionText}</span>
              <ArrowRight size={14} className="transition-transform group-hover:translate-x-1" />
            </Link>
          </div>
        )}
      </div>
    );
  }


  // Progress Bar Card (Matching Screenshot Card 2: User Growth)
  if (variant === "progress") {
    return (
      <div className="group relative flex min-w-0 flex-col justify-between rounded-[24px] border border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 sm:p-6 shadow-sm transition-all duration-300 hover:-translate-y-1 hover:shadow-xl">
        <div>
          <div className="flex items-start justify-between gap-3">
            <span className="min-w-0 break-words text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              {title}
            </span>
          </div>

          <div className="mt-4 flex min-w-0 flex-wrap items-baseline justify-between gap-3">
            <h2
              className={`${valueTextClass} text-[clamp(1.25rem,2vw,1.875rem)] font-extrabold tracking-tight text-slate-900 dark:text-slate-100 font-heading`}
              style={wrappingStyle}
              title={valueTitle}
            >
              {value}
            </h2>
            {change && (
              <span className="inline-flex min-w-0 items-center gap-1 rounded-full bg-emerald-50 dark:bg-emerald-950/40 px-2.5 py-1 text-xs font-bold text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                <span className="break-words" style={wrappingStyle}>+{change}</span>
              </span>
            )}
          </div>
        </div>

        {/* Cyan-Teal Horizontal Progress Bar */}
        <div className="mt-5 space-y-2">
          <div className="h-4 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800 p-0.5 shadow-inner">
            <div
              className="h-full rounded-full bg-gradient-to-r from-[#0090B8] via-[#0EA5E9] to-[#2DD4BF] transition-all duration-500 shadow-sm"
              style={{ width: `${Math.min(100, Math.max(10, progressPercent))}%` }}
            />
          </div>
          <div className="flex min-w-0 flex-wrap items-center justify-between gap-2 text-xs font-semibold text-slate-500 dark:text-slate-400">
            <span className="break-words" style={wrappingStyle}>{progressLabel}</span>
            <span className="break-words text-emerald-600 dark:text-emerald-400 font-bold" style={wrappingStyle}>{progressSubtext}</span>
          </div>
        </div>
      </div>
    );
  }

  // Semi-Gauge Radial Card (Matching Screenshot & Enterprise Aesthetics)
  if (variant === "gauge") {
    const displayLabel =
      gaugeLabel ||
      (title?.toLowerCase().includes("invoice")
        ? "Cleared"
        : title?.toLowerCase().includes("payment")
        ? "Processed"
        : title?.toLowerCase().includes("employee")
        ? "Active"
        : "Total");

    // Math for 180° semi-circle arc:
    // Center: (80, 75), Radius: 55, Stroke: 12
    // Path: start at (25, 75), top at (80, 20), end at (135, 75)
    // Arc circumference = PI * 55 ≈ 172.78
    const numValue = Number(gaugeValue) || 0;
    const computedPercent =
      gaugePercent != null
        ? Math.min(100, Math.max(0, gaugePercent))
        : numValue > 0
        ? 85
        : 0;
    const circumference = 172.78;
    const dashOffset = circumference - (circumference * computedPercent) / 100;

    return (
      <div className="group relative flex min-w-0 flex-col justify-between rounded-[24px] border border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 sm:p-6 shadow-sm dark:shadow-slate-950/40 transition-all duration-300 hover:shadow-xl hover:-translate-y-1 hover:border-[#0090B8]/30">
        <div className="flex items-start justify-between gap-3">
          <span className="min-w-0 break-words text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
            {title}
          </span>
          <button
            type="button"
            className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors p-1 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800"
          >
            <MoreHorizontal size={18} />
          </button>
        </div>

        {/* Semi-Arc Gauge SVG Visualization with Zero Clipping */}
        <div className="relative my-3 flex flex-col items-center justify-center">
          <svg className="w-48 h-28 overflow-visible" viewBox="0 0 160 90">
            {/* Background Track Arc */}
            <path
              d="M 25 75 A 55 55 0 0 1 135 75"
              fill="none"
              stroke="currentColor"
              className="text-slate-100 dark:text-slate-800"
              strokeWidth="12"
              strokeLinecap="round"
            />
            {/* Gradient Progress Arc */}
            <path
              d="M 25 75 A 55 55 0 0 1 135 75"
              fill="none"
              stroke="url(#gaugeCyanGradient)"
              strokeWidth="12"
              strokeLinecap="round"
              strokeDasharray={circumference}
              strokeDashoffset={dashOffset}
              className="transition-all duration-700 ease-out"
            />
            <defs>
              <linearGradient id="gaugeCyanGradient" x1="0%" y1="0%" x2="100%" y2="0%">
                <stop offset="0%" stopColor="#0090B8" />
                <stop offset="50%" stopColor="#0EA5E9" />
                <stop offset="100%" stopColor="#2DD4BF" />
              </linearGradient>
            </defs>
          </svg>

          {/* Central Value & Label - Dead Center Aligned */}
          <div className="absolute bottom-2 flex flex-col items-center justify-center text-center">
            <span
              className={`${valueTextClass} text-center text-2xl sm:text-3xl font-extrabold tracking-tight text-slate-900 dark:text-slate-100 font-heading leading-none`}
              style={wrappingStyle}
              title={String(gaugeValue ?? "")}
            >
              {gaugeValue}
            </span>
            <span className="mt-1 text-[11px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">
              {displayLabel}
            </span>
          </div>
        </div>

        {/* Bottom Callout Badge */}
        {gaugeSubtext && (
          <div className="flex items-center justify-center">
            <span className="inline-flex min-w-0 items-center gap-1.5 break-words rounded-full bg-emerald-50 dark:bg-emerald-950/40 px-3 py-1 text-center text-xs font-bold text-emerald-600 dark:text-emerald-400 border border-emerald-500/20" style={wrappingStyle}>
              {gaugeSubtext}
            </span>
          </div>
        )}
      </div>
    );
  }

  // Default Crisp White Card
  return (
    <div className="group relative flex min-h-[132px] min-w-0 flex-col justify-between rounded-[24px] border border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 sm:p-6 shadow-sm dark:shadow-slate-950/40 transition-all duration-300 hover:shadow-xl hover:-translate-y-1 hover:border-[#0090B8]/30">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <p className="break-words text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
            {title}
          </p>

          <h2
            className={`mt-2 ${valueTextClass} text-[clamp(1.25rem,2vw,1.875rem)] font-extrabold tracking-tight text-slate-900 dark:text-slate-100 font-heading`}
            style={wrappingStyle}
            title={valueTitle}
          >
            {value}
          </h2>

          {subtitle && (
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              {subtitle}
            </p>
          )}

          {change && (
            <div className="mt-3 inline-flex min-w-0 items-center gap-1.5 rounded-full bg-emerald-50 dark:bg-emerald-950/40 px-2.5 py-1 text-xs font-bold text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
              {isPositive ? (
                <TrendingUp size={14} className="shrink-0" />
              ) : (
                <TrendingDown size={14} className="shrink-0 text-red-500" />
              )}
              <span className="break-words" style={wrappingStyle}>{change}</span>
            </div>
          )}
        </div>

        {Icon && (
          <div className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl ${color} text-white shadow-md shadow-sky-500/20 group-hover:scale-110 transition-transform duration-300`}>
            <Icon size={22} />
          </div>
        )}
      </div>

      {actionLink && (
        <div className="mt-5 border-t border-slate-100 dark:border-slate-800/80 pt-3.5">
          <Link
            to={actionLink}
            className="inline-flex items-center gap-1.5 text-xs font-bold text-[#0090B8] hover:text-[#007799] transition-colors"
          >
            <span>{actionText}</span>
            <ArrowRight size={14} className="transition-transform group-hover:translate-x-1" />
          </Link>
        </div>
      )}
    </div>
  );
};

export default StatCard;
