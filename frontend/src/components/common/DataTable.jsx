import React, { useState, useMemo } from "react";
import {
  ChevronUp,
  ChevronDown,
  Search,
  ArrowUpDown,
  Inbox,
} from "lucide-react";
import Pagination from "./Pagination";

const DataTable = ({
  columns,
  data = [],
  onRowClick,
  rowActions,
  searchableFields = [],
  itemsPerPage = 10,
  isLoading = false,
  emptyMessage = "No data available",
  extraHeaderContent,
}) => {
  const [currentPage, setCurrentPage] = useState(1);
  const [searchTerm, setSearchTerm] = useState("");
  const [sortConfig, setSortConfig] = useState({ key: null, direction: "asc" });

  const filteredData = useMemo(() => {
    if (!searchTerm) return data;

    return data.filter((row) =>
      searchableFields.some((field) =>
        String(row[field] || "")
          .toLowerCase()
          .includes(searchTerm.toLowerCase()),
      ),
    );
  }, [data, searchTerm, searchableFields]);

  const sortedData = useMemo(() => {
    const sorted = [...filteredData];
    if (!sortConfig.key) return sorted;

    sorted.sort((a, b) => {
      const aVal = a[sortConfig.key];
      const bVal = b[sortConfig.key];

      if (aVal == null) return 1;
      if (bVal == null) return -1;

      if (aVal < bVal) return sortConfig.direction === "asc" ? -1 : 1;
      if (aVal > bVal) return sortConfig.direction === "asc" ? 1 : -1;
      return 0;
    });

    return sorted;
  }, [filteredData, sortConfig]);

  const totalPages = Math.ceil(sortedData.length / itemsPerPage);
  const paginatedData = useMemo(() => {
    const start = (currentPage - 1) * itemsPerPage;
    return sortedData.slice(start, start + itemsPerPage);
  }, [sortedData, currentPage, itemsPerPage]);

  const handleSort = (key) => {
    setSortConfig((prev) => ({
      key,
      direction: prev.key === key && prev.direction === "asc" ? "desc" : "asc",
    }));
  };

  const SortIcon = ({ columnKey }) => {
    if (sortConfig.key !== columnKey)
      return (
        <ArrowUpDown className="h-3.5 w-3.5 opacity-40 hover:opacity-100 transition" />
      );
    return sortConfig.direction === "asc" ? (
      <ChevronUp className="h-3.5 w-3.5 text-blue-600 dark:text-blue-400 font-bold" />
    ) : (
      <ChevronDown className="h-3.5 w-3.5 text-blue-600 dark:text-blue-400 font-bold" />
    );
  };

  return (
    <div className="space-y-4">
      {(searchableFields.length > 0 || extraHeaderContent) && (
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 sm:gap-4">
          {searchableFields.length > 0 && (
            <div className="relative w-full max-w-md flex-1">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 dark:text-slate-500" />
              <input
                type="text"
                placeholder="Search records..."
                value={searchTerm}
                onChange={(e) => {
                  setSearchTerm(e.target.value);
                  setCurrentPage(1);
                }}
                className="w-full h-10 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 pl-10 pr-4 text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all shadow-sm"
              />
            </div>
          )}
          {extraHeaderContent && (
            <div className="flex flex-wrap items-center gap-2 sm:gap-3">{extraHeaderContent}</div>
          )}
        </div>
      )}

      <div className="overflow-hidden rounded-2xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm">
        <div className="overflow-x-auto custom-scrollbar">
          <table className="w-full text-left text-sm border-collapse min-w-[600px] sm:min-w-full">
            <thead className="sticky top-0 z-10 border-b border-slate-200/80 dark:border-slate-800 bg-slate-50/80 dark:bg-slate-800/80 backdrop-blur-md">
              <tr>
                {columns.map((col) => (
                  <th
                    key={col.key || col.label}
                    onClick={() => col.sortable && handleSort(col.key)}
                    className={`px-3 py-3 sm:px-5 sm:py-3.5 text-xs font-semibold uppercase tracking-wider text-slate-600 dark:text-slate-400 ${
                      col.sortable
                        ? "cursor-pointer select-none hover:text-slate-900 dark:hover:text-white"
                        : ""
                    }`}
                  >
                    <div className="flex items-center gap-1.5">
                      <span>{col.label}</span>
                      {col.sortable && <SortIcon columnKey={col.key} />}
                    </div>
                  </th>
                ))}
                {rowActions && (
                  <th className="px-3 py-3 sm:px-5 sm:py-3.5 text-right text-xs font-semibold uppercase tracking-wider text-slate-600 dark:text-slate-400">
                    Actions
                  </th>
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60">
              {isLoading ? (
                Array.from({ length: 5 }).map((_, idx) => (
                  <tr key={idx} className="animate-pulse">
                    {columns.map((_, colIdx) => (
                      <td key={colIdx} className="px-3 py-3 sm:px-5 sm:py-4">
                        <div className="h-4 w-3/4 bg-slate-200 dark:bg-slate-800 rounded-lg" />
                      </td>
                    ))}
                    {rowActions && (
                      <td className="px-3 py-3 sm:px-5 sm:py-4 text-right">
                        <div className="h-8 w-8 bg-slate-200 dark:bg-slate-800 rounded-lg ml-auto" />
                      </td>
                    )}
                  </tr>
                ))
              ) : paginatedData.length > 0 ? (
                paginatedData.map((row, idx) => (
                  <tr
                    key={row.id || idx}
                    onClick={() => onRowClick && onRowClick(row)}
                    className={`group transition-all duration-150 ${
                      onRowClick
                        ? "cursor-pointer hover:bg-blue-50/40 dark:hover:bg-blue-950/20"
                        : "hover:bg-slate-50/60 dark:hover:bg-slate-800/40"
                    }`}
                  >
                    {columns.map((col) => (
                      <td
                        key={col.key}
                        className="px-3 py-3 sm:px-5 sm:py-4 text-slate-700 dark:text-slate-300 font-medium"
                      >
                        {col.render
                          ? col.render(row[col.key], row)
                          : (row[col.key] ?? "-")}
                      </td>
                    ))}
                    {rowActions && (
                      <td
                        className="px-3 py-3 sm:px-5 sm:py-4 text-right"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <div className="flex items-center justify-end gap-1.5">
                          {rowActions(row)}
                        </div>
                      </td>
                    )}
                  </tr>
                ))
              ) : (
                <tr>
                  <td
                    colSpan={columns.length + (rowActions ? 1 : 0)}
                    className="py-12 text-center"
                  >
                    <div className="flex flex-col items-center justify-center gap-2">
                      <div className="h-12 w-12 rounded-2xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-slate-400">
                        <Inbox className="h-6 w-6" />
                      </div>
                      <p className="text-sm font-medium text-slate-500 dark:text-slate-400">
                        {emptyMessage}
                      </p>
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {totalPages > 1 && (
        <Pagination
          currentPage={currentPage}
          totalPages={totalPages}
          totalItems={sortedData.length}
          itemsPerPage={itemsPerPage}
          onPageChange={setCurrentPage}
        />
      )}
    </div>
  );
};

export default DataTable;
