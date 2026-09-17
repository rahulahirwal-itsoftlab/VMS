import { useState, useCallback } from "react";
import { CalendarDays, Check, ChevronDown } from "lucide-react";
import DateInput from "../common/DateInput";

const PRESETS = [
  { label: "Today",         value: "today" },
  { label: "Yesterday",     value: "yesterday" },
  { label: "Last 7 Days",   value: "last7" },
  { label: "Last 30 Days",  value: "last30" },
  { label: "This Month",    value: "thisMonth" },
  { label: "Last Month",    value: "lastMonth" },
  { label: "This Quarter",  value: "thisQuarter" },
  { label: "This Year",     value: "thisYear" },
  { label: "Custom Range",  value: "custom" },
];

const toISO = (d) => d.toISOString().slice(0, 10);

const computePreset = (preset) => {
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth();
  const d = now.getDate();

  switch (preset) {
    case "today":
      return { startDate: toISO(new Date(y, m, d)), endDate: toISO(new Date(y, m, d)) };
    case "yesterday":
      return { startDate: toISO(new Date(y, m, d - 1)), endDate: toISO(new Date(y, m, d - 1)) };
    case "last7":
      return { startDate: toISO(new Date(y, m, d - 6)), endDate: toISO(new Date(y, m, d)) };
    case "last30":
      return { startDate: toISO(new Date(y, m, d - 29)), endDate: toISO(new Date(y, m, d)) };
    case "thisMonth":
      return { startDate: toISO(new Date(y, m, 1)), endDate: toISO(new Date(y, m + 1, 0)) };
    case "lastMonth":
      return { startDate: toISO(new Date(y, m - 1, 1)), endDate: toISO(new Date(y, m, 0)) };
    case "thisQuarter": {
      const qStart = Math.floor(m / 3) * 3;
      return { startDate: toISO(new Date(y, qStart, 1)), endDate: toISO(new Date(y, qStart + 3, 0)) };
    }
    case "thisYear":
      return { startDate: toISO(new Date(y, 0, 1)), endDate: toISO(new Date(y, 11, 31)) };
    default:
      return { startDate: "", endDate: "" };
  }
};

/**
 * DateRangePicker
 *
 * Props:
 *   startDate   - controlled value (YYYY-MM-DD string)
 *   endDate     - controlled value (YYYY-MM-DD string)
 *   onChange    - (startDate, endDate) => void
 */
const DateRangePicker = ({ startDate = "", endDate = "", onChange }) => {
  const [showPresets, setShowPresets] = useState(false);
  const [activePreset, setActivePreset] = useState(null);
  const [dateError, setDateError] = useState("");

  const applyPreset = useCallback((preset) => {
    if (preset === "custom") {
      setActivePreset("custom");
      setShowPresets(false);
      return;
    }
    const { startDate: s, endDate: e } = computePreset(preset);
    setActivePreset(preset);
    setDateError("");
    setShowPresets(false);
    onChange?.(s, e);
  }, [onChange]);

  const handleCustomDate = (field, value) => {
    let newStart = field === "start" ? value : startDate;
    let newEnd   = field === "end"   ? value : endDate;

    if (newStart && newEnd && newStart > newEnd) {
      setDateError("Start date cannot be after end date");
      return;
    }
    setDateError("");
    onChange?.(newStart, newEnd);
  };

  const activePresetLabel = PRESETS.find((p) => p.value === activePreset)?.label;

  return (
    <div className="relative min-w-0">
      {/* Preset selector */}
      <div className="flex items-center gap-2 flex-wrap">
        <button
          type="button"
          onClick={() => setShowPresets((v) => !v)}
          aria-expanded={showPresets}
          className="inline-flex h-10 min-w-40 max-w-full items-center gap-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 px-3 text-sm font-medium text-slate-800 dark:text-slate-100 shadow-sm outline-none transition-all hover:border-slate-300 dark:hover:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-900 focus:border-blue-500 dark:focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
        >
          <CalendarDays size={15} className="text-blue-600" />
          <span className="min-w-0 flex-1 truncate text-left">{activePresetLabel || "Date Range"}</span>
          <ChevronDown size={14} className={`shrink-0 transition-transform ${showPresets ? "rotate-180" : ""}`} />
        </button>

        {/* Custom date inputs */}
        {(activePreset === "custom" || (!activePreset && (startDate || endDate))) && (
          <div className="flex items-center gap-1">
            <DateInput
              value={startDate}
              max={endDate || undefined}
              onChange={(nextValue) => handleCustomDate("start", nextValue)}
              className="w-40"
              ariaLabel="Start date"
            />
            <span className="text-slate-400 dark:text-slate-500 text-sm">to</span>
            <DateInput
              value={endDate}
              min={startDate || undefined}
              onChange={(nextValue) => handleCustomDate("end", nextValue)}
              className="w-40"
              ariaLabel="End date"
            />
          </div>
        )}

        {(startDate || endDate) && (
          <button
            type="button"
            onClick={() => { setActivePreset(null); setDateError(""); onChange?.("", ""); }}
            className="text-xs text-slate-400 hover:text-red-500 transition"
          >
            Clear dates
          </button>
        )}
      </div>

      {dateError && <p className="mt-1 text-xs text-red-500">{dateError}</p>}

      {/* Dropdown presets */}
      {showPresets && (
        <div className="absolute left-0 top-11 z-50 w-48 overflow-hidden rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 p-1 shadow-xl dark:shadow-slate-950/60">
          {PRESETS.map((p) => (
            <button
              key={p.value}
              type="button"
              onClick={() => applyPreset(p.value)}
              className={`flex h-9 w-full items-center gap-2 rounded-lg px-3 text-left text-sm transition ${
                activePreset === p.value
                  ? "bg-blue-50 dark:bg-blue-950/50 text-blue-700 dark:text-blue-300 font-semibold"
                  : "text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800"
              }`}
            >
              <Check size={14} className={activePreset === p.value ? "opacity-100" : "opacity-0"} />
              <span className="truncate">{p.label}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

export default DateRangePicker;
