import { Eye } from "lucide-react";

const ViewDetailsButton = ({
  onClick,
  label = "View Details",
  iconOnly = false,
  className = "",
  size = "md",
  disabled = false,
  title = "View Details",
}) => {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title || label}
      aria-label={title || label}
      className={`inline-flex cursor-pointer items-center justify-center gap-1.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 font-semibold text-slate-700 dark:text-slate-200 shadow-2xs transition-all hover:border-[#0090B8] hover:bg-sky-50 hover:text-[#0090B8] dark:hover:border-[#0090B8] dark:hover:bg-sky-950/40 dark:hover:text-[#00E5FF] focus:outline-none focus:ring-2 focus:ring-[#0090B8]/20 disabled:cursor-not-allowed disabled:opacity-50 ${
        size === "sm"
          ? "h-8 px-2.5 text-xs"
          : "h-9 px-3.5 text-xs sm:text-sm"
      } ${iconOnly ? "px-2! py-0! w-8 h-8 sm:w-9 sm:h-9" : ""} ${className}`}
    >
      <Eye className={`${size === "sm" ? "h-3.5 w-3.5" : "h-4 w-4"} text-[#0090B8] dark:text-[#00E5FF] shrink-0`} />
      {!iconOnly && <span>{label}</span>}
    </button>
  );
};

export default ViewDetailsButton;
