import { TrendingUp } from "lucide-react";

const moneyTitlePattern = /amount|value|paid|outstanding|invoiced/i;

const formatSummaryValue = (title, value, prefix = "") => {
  if (value === null || value === undefined || value === "") return "N/A";

  if (typeof value !== "number") {
    return `${prefix}${value}`;
  }

  const shouldFormatMoney = Boolean(prefix) || moneyTitlePattern.test(title || "");
  if (shouldFormatMoney) {
    return `INR ${value.toLocaleString("en-IN", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}`;
  }

  return value.toLocaleString("en-IN");
};

/**
 * Summary stat card used in all report pages.
 *
 * Props:
 *   title      - Card label
 *   value      - Displayed value (number or string)
 *   icon       - Lucide icon component
 *   colorClass - Tailwind bg + text color classes
 *   prefix     - Optional prefix symbol
 *   loading    - Show skeleton when true
 */
const ReportSummaryCard = ({
  title,
  value,
  icon: Icon = TrendingUp,
  colorClass = "bg-blue-50 text-blue-600 dark:bg-blue-950/60 dark:text-blue-400",
  prefix = "",
  loading = false,
}) => {
  const displayValue = formatSummaryValue(title, value, prefix);

  if (loading) {
    return (
      <div className="min-h-[104px] sm:min-h-[112px] rounded-2xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 p-3 sm:p-3.5 xl:p-4 shadow-sm animate-pulse">
        <div className="flex items-start justify-between gap-2 sm:gap-3">
          <div className="h-4 w-20 sm:w-24 rounded bg-slate-200 dark:bg-slate-800" />
          <div className="h-8 w-8 sm:h-9 sm:w-9 shrink-0 rounded-xl bg-slate-200 dark:bg-slate-800" />
        </div>
        <div className="mt-3 sm:mt-4 h-6 w-16 sm:w-20 rounded bg-slate-200 dark:bg-slate-800" />
      </div>
    );
  }

  return (
    <div className="min-h-[104px] sm:min-h-[112px] min-w-0 rounded-2xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 p-3 sm:p-3.5 xl:p-4 shadow-sm transition hover:shadow-md dark:shadow-slate-950/40 flex flex-col justify-between">
      <div className="flex items-start justify-between gap-2 sm:gap-3">
        <p
          className="min-w-0 flex-1 break-words text-xs font-semibold leading-tight text-slate-500 dark:text-slate-400"
          title={title}
        >
          {title}
        </p>
        <div className={`flex h-8 w-8 sm:h-9 sm:w-9 shrink-0 items-center justify-center rounded-xl ${colorClass}`}>
          <Icon size={17} />
        </div>
      </div>
      <p
        className="mt-2.5 sm:mt-3 text-lg sm:text-xl xl:text-2xl font-bold font-mono tracking-tight text-slate-900 dark:text-slate-100 tabular-nums truncate"
        title={displayValue}
      >
        {displayValue}
      </p>
    </div>
  );
};

export default ReportSummaryCard;
