import { ChevronLeft, ChevronRight } from "lucide-react";

/**
 * Pagination — server-side aware.
 *
 * Props:
 *   currentPage  – active 1-indexed page
 *   totalPages   – total number of pages
 *   totalItems   – total record count (for "Showing X–Y of Z" label)
 *   itemsPerPage – page size
 *   onPageChange – (newPage: number) => void
 *   isLoading    – disable buttons while a request is in-flight
 *   label        – entity label shown in summary (default "records")
 */
const Pagination = ({
  currentPage,
  totalPages,
  totalItems,
  itemsPerPage = 10,
  onPageChange,
  isLoading = false,
  label = "records",
}) => {
  if (!totalPages || totalPages < 1) return null;

  const from = totalItems > 0 ? (currentPage - 1) * itemsPerPage + 1 : 0;
  const to = Math.min(currentPage * itemsPerPage, totalItems ?? 0);

  const pages = [];
  const maxVisible = 5;
  let start = Math.max(1, currentPage - Math.floor(maxVisible / 2));
  let end = Math.min(totalPages, start + maxVisible - 1);
  if (end - start < maxVisible - 1) {
    start = Math.max(1, end - maxVisible + 1);
  }
  for (let i = start; i <= end; i++) {
    pages.push(i);
  }

  const btnBase =
    "inline-flex items-center justify-center rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-3 py-2 text-xs font-semibold text-slate-700 dark:text-slate-200 transition shadow-2xs hover:border-[#0090B8] hover:bg-sky-50 dark:hover:bg-slate-800 hover:text-[#0090B8] dark:hover:text-[#00E5FF] disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-white dark:disabled:hover:bg-slate-900 disabled:hover:border-slate-200 dark:disabled:hover:border-slate-800 disabled:hover:text-slate-700 dark:disabled:hover:text-slate-200";

  const numBase =
    "inline-flex items-center justify-center rounded-xl border px-2.5 py-2 text-xs font-semibold transition shadow-2xs";

  return (
    <div className="flex flex-col items-center gap-3 sm:flex-row sm:items-center sm:justify-between rounded-2xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 px-4 py-3 shadow-sm">
      {/* Summary label */}
      <p className="text-xs text-slate-500 dark:text-slate-400 text-center sm:text-left">
        {totalItems != null && totalItems > 0 ? (
          <>
            Showing{" "}
            <span className="font-semibold text-slate-800 dark:text-slate-200">{from}</span>
            {"–"}
            <span className="font-semibold text-slate-800 dark:text-slate-200">{to}</span>
            {" of "}
            <span className="font-semibold text-slate-800 dark:text-slate-200">{totalItems}</span>
            {" "}{label}
          </>
        ) : (
          <>
            Page{" "}
            <span className="font-semibold text-slate-800 dark:text-slate-200">{currentPage}</span>
            {" of "}
            <span className="font-semibold text-slate-800 dark:text-slate-200">{totalPages}</span>
          </>
        )}
      </p>

      {/* Page controls */}
      <div className="flex flex-wrap items-center justify-center gap-1">
        {/* Previous */}
        <button
          type="button"
          onClick={() => onPageChange(currentPage - 1)}
          disabled={currentPage === 1 || isLoading}
          className={`${btnBase} gap-1`}
          aria-label="Previous page"
        >
          <ChevronLeft size={14} />
          <span className="hidden sm:inline">Previous</span>
        </button>

        {start > 1 && (
          <>
            <button
              type="button"
              onClick={() => onPageChange(1)}
              disabled={isLoading}
              className={`${numBase} border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 hover:border-[#0090B8] hover:text-[#0090B8] dark:hover:text-[#00E5FF]`}
            >
              1
            </button>
            {start > 2 && (
              <span className="px-1 text-xs text-slate-400 dark:text-slate-500 select-none">{"…"}</span>
            )}
          </>
        )}

        {pages.map((page) => (
          <button
            key={page}
            type="button"
            onClick={() => onPageChange(page)}
            disabled={isLoading}
            className={`${numBase} ${
              page === currentPage
                ? "border-[#0090B8] bg-[#0090B8] text-white dark:border-[#00E5FF] dark:bg-[#00E5FF] dark:text-slate-900 font-bold shadow-sm"
                : "border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 hover:border-[#0090B8] hover:text-[#0090B8] dark:hover:text-[#00E5FF]"
            }`}
            aria-current={page === currentPage ? "page" : undefined}
          >
            {page}
          </button>
        ))}

        {end < totalPages && (
          <>
            {end < totalPages - 1 && (
              <span className="px-1 text-xs text-slate-400 dark:text-slate-500 select-none">{"…"}</span>
            )}
            <button
              type="button"
              onClick={() => onPageChange(totalPages)}
              disabled={isLoading}
              className={`${numBase} border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 hover:border-[#0090B8] hover:text-[#0090B8] dark:hover:text-[#00E5FF]`}
            >
              {totalPages}
            </button>
          </>
        )}

        {/* Next */}
        <button
          type="button"
          onClick={() => onPageChange(currentPage + 1)}
          disabled={currentPage === totalPages || isLoading}
          className={`${btnBase} gap-1`}
          aria-label="Next page"
        >
          <span className="hidden sm:inline">Next</span>
          <ChevronRight size={14} />
        </button>
      </div>
    </div>
  );
};

export default Pagination;
