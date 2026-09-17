import { Filter } from "lucide-react";
import { useState } from "react";
import FilterSelect from "./FilterSelect";

const FilterBar = ({ onFilterChange, filters = [] }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [activeFilters, setActiveFilters] = useState({});

  const handleFilterChange = (filterKey, value) => {
    const updated = { ...activeFilters, [filterKey]: value };
    setActiveFilters(updated);
    onFilterChange(updated);
  };

  const handleClearAll = () => {
    setActiveFilters({});
    onFilterChange({});
  };

  const activeCount = Object.values(activeFilters).filter((v) =>
    Boolean(v),
  ).length;

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="inline-flex cursor-pointer items-center gap-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-3.5 py-2 text-sm font-semibold text-slate-700 dark:text-slate-200 shadow-2xs transition-all hover:border-[#0090B8] hover:bg-sky-50 dark:hover:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-[#0090B8]/20"
      >
        <Filter size={16} className="text-[#0090B8] dark:text-[#00E5FF]" />
        <span>Filters</span>
        {activeCount > 0 && (
          <span className="ml-1 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-[#0090B8] px-1.5 text-xs font-bold text-white shadow-xs">
            {activeCount}
          </span>
        )}
      </button>

      {isOpen && (
        <div className="absolute right-0 z-[9999] mt-2 w-72 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 shadow-xl text-slate-900 dark:text-slate-100 animate-in fade-in duration-150">
          <div className="mb-4 flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
            <h3 className="font-bold text-sm uppercase tracking-wider text-slate-900 dark:text-slate-100 font-heading">
              Filters
            </h3>
            {activeCount > 0 && (
              <button
                type="button"
                onClick={handleClearAll}
                className="cursor-pointer text-xs font-semibold text-[#0090B8] dark:text-[#00E5FF] hover:underline"
              >
                Clear all
              </button>
            )}
          </div>

          <div className="space-y-3">
            {filters.map((filter) => (
              <div key={filter.key}>
                <FilterSelect
                  label={filter.label}
                  value={activeFilters[filter.key] || ""}
                  onChange={(nextValue) =>
                    handleFilterChange(filter.key, nextValue)
                  }
                  options={[
                    { value: "", label: "All" },
                    ...(filter.options || []),
                  ]}
                  placeholder="All"
                />
              </div>
            ))}
          </div>

          <button
            type="button"
            onClick={() => setIsOpen(false)}
            className="mt-4 w-full cursor-pointer rounded-xl bg-[#0090B8] hover:bg-[#007799] py-2 text-sm font-bold text-white shadow-md transition"
          >
            Apply Filters
          </button>
        </div>
      )}
    </div>
  );
};

export default FilterBar;
