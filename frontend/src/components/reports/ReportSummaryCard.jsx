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
  colorClass = "bg-blue-50 text-blue-600",
  prefix = "",
  loading = false,
}) => {
  const displayValue = formatSummaryValue(title, value, prefix);

  if (loading) {
    return (
      <div className="min-h-[116px] rounded-2xl border border-slate-200 bg-white p-4 shadow-sm animate-pulse sm:p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="h-4 w-28 rounded bg-slate-200" />
          <div className="h-9 w-9 shrink-0 rounded-xl bg-slate-200" />
        </div>
        <div className="mt-5 h-7 w-32 max-w-full rounded bg-slate-200" />
      </div>
    );
  }

  return (
    <div className="min-h-[116px] min-w-0 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm transition-shadow hover:shadow-md sm:p-5">
      <div className="flex items-start justify-between gap-3">
        <p
          className="min-w-0 flex-1 break-words text-xs font-semibold leading-snug text-slate-500 sm:text-sm"
          title={title}
        >
          {title}
        </p>
        <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${colorClass}`}>
          <Icon size={18} />
        </div>
      </div>
      <p
        className="mt-4 max-w-full break-words text-[clamp(1.125rem,1.7vw,1.5rem)] font-bold leading-tight text-slate-900 tabular-nums"
        style={{ overflowWrap: "anywhere" }}
        title={displayValue}
      >
        {displayValue}
      </p>
    </div>
  );
};

export default ReportSummaryCard;
