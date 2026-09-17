import { useState } from "react";
import { ChevronUp, ChevronDown } from "lucide-react";
import Pagination from "../common/Pagination";

/**
 * ReportTable — server-side aware data table.
 *
 * Props:
 *   columns      - [{ key, label, sortable?, render? }]
 *   data         - array of row objects
 *   total        - total record count (server-side)
 *   page         - current page number
 *   totalPages   - total page count
 *   limit        - records per page
 *   sortField    - current sort field
 *   sortOrder    - 'asc' | 'desc'
 *   loading      - show skeleton rows
 *   onSort       - (field, order) => void
 *   onPageChange - (page) => void
 *   onRowClick   - (row) => void  (opens detail drawer)
 *   emptyMessage - custom empty state message
 */
const ReportTable = ({
  columns = [],
  data = [],
  total = 0,
  page = 1,
  totalPages = 1,
  limit = 20,
  sortField,
  sortOrder = "desc",
  loading = false,
  onSort,
  onPageChange,
  onRowClick,
  emptyMessage = "No records found for the selected filters.",
}) => {
  const handleSort = (key) => {
    if (!onSort) return;
    const newOrder = sortField === key && sortOrder === "asc" ? "desc" : "asc";
    onSort(key, newOrder);
  };

  const SortIcon = ({ colKey }) => {
    if (sortField !== colKey) return <div className="w-3" />;
    return sortOrder === "asc"
      ? <ChevronUp size={13} className="text-blue-600" />
      : <ChevronDown size={13} className="text-blue-600" />;
  };

  // ── Skeleton rows ──────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white">
        <table className="w-full">
          <thead className="border-b border-slate-200 bg-slate-50">
            <tr>
              {columns.map((col) => (
                <th key={col.key} className="px-4 py-3 text-left text-xs font-semibold text-slate-500">
                  {col.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: 5 }).map((_, i) => (
              <tr key={i} className="border-b border-slate-100 animate-pulse">
                {columns.map((col) => (
                  <td key={col.key} className="px-4 py-3">
                    <div className="h-4 rounded bg-slate-100" />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  // ── Empty state ────────────────────────────────────────────────────────────
  if (!loading && data.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-slate-300 bg-white py-16 text-slate-400">
        <svg className="mb-3 h-12 w-12 opacity-40" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
        </svg>
        <p className="text-sm font-medium">{emptyMessage}</p>
      </div>
    );
  }

  // ── Table ──────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-4">
      {/* Record count */}
      <p className="text-sm text-slate-500">
        Showing{" "}
        <span className="font-semibold text-slate-700">
          {(page - 1) * limit + 1}–{Math.min(page * limit, total)}
        </span>{" "}
        of <span className="font-semibold text-slate-700">{total.toLocaleString()}</span> records
      </p>

      <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white">
        <table className="w-full min-w-160">
          <thead className="border-b border-slate-200 bg-slate-50">
            <tr>
              {columns.map((col) => (
                <th
                  key={col.key}
                  onClick={() => col.sortable && handleSort(col.key)}
                  className={`px-4 py-3 text-left text-xs font-semibold text-slate-600 whitespace-nowrap ${
                    col.sortable ? "cursor-pointer hover:bg-slate-100 select-none" : ""
                  }`}
                >
                  <div className="flex items-center gap-1">
                    {col.label}
                    {col.sortable && <SortIcon colKey={col.key} />}
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.map((row, idx) => (
              <tr
                key={row.id || idx}
                onClick={() => onRowClick?.(row)}
                className={`border-b border-slate-100 text-sm transition last:border-0 ${
                  onRowClick ? "cursor-pointer hover:bg-blue-50/40" : ""
                }`}
              >
                {columns.map((col) => (
                  <td key={col.key} className="px-4 py-3 text-slate-700">
                    {col.render ? col.render(row[col.key], row) : (row[col.key] ?? "—")}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <Pagination
          currentPage={page}
          totalPages={totalPages}
          totalItems={total}
          itemsPerPage={limit}
          onPageChange={(newPage) => onPageChange?.(newPage)}
          label="records"
        />
      )}
    </div>
  );
};

export default ReportTable;
