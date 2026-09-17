import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from "react";
import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";

const WEEKDAYS = ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"];
const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

const pad = (value) => String(value).padStart(2, "0");

const isISODate = (value) => /^\d{4}-\d{2}-\d{2}$/.test(String(value || ""));

const parseISODate = (value) => {
  if (!isISODate(value)) return null;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(year, month - 1, day);
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) return null;
  return date;
};

const toISODate = (date) => {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return "";
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
};

const formatDisplayDate = (value) => {
  const date = parseISODate(value);
  if (!date) return "";
  return `${pad(date.getDate())}-${pad(date.getMonth() + 1)}-${date.getFullYear()}`;
};

const addMonths = (date, amount) => new Date(date.getFullYear(), date.getMonth() + amount, 1);
const isSameDay = (a, b) => a && b && toISODate(a) === toISODate(b);
const compareISO = (left, right) => String(left || "").localeCompare(String(right || ""));

const buildCalendarDays = (visibleMonth) => {
  const firstOfMonth = new Date(visibleMonth.getFullYear(), visibleMonth.getMonth(), 1);
  const mondayOffset = (firstOfMonth.getDay() + 6) % 7;
  const gridStart = new Date(firstOfMonth);
  gridStart.setDate(firstOfMonth.getDate() - mondayOffset);

  return Array.from({ length: 42 }, (_, index) => {
    const date = new Date(gridStart);
    date.setDate(gridStart.getDate() + index);
    return date;
  });
};

const DateInput = forwardRef(({
  value = "",
  onChange,
  name,
  placeholder = "DD-MM-YYYY",
  disabled = false,
  required = false,
  min,
  max,
  className = "",
  invalid = false,
  ariaLabel,
}, ref) => {
  const buttonRef = useRef(null);
  const menuRef = useRef(null);
  const [open, setOpen] = useState(false);
  const [menuStyle, setMenuStyle] = useState({});
  const selectedDate = useMemo(() => parseISODate(value), [value]);
  const [visibleMonth, setVisibleMonth] = useState(selectedDate || new Date());
  const displayValue = formatDisplayDate(value);
  const today = useMemo(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), now.getDate());
  }, []);
  const days = useMemo(() => buildCalendarDays(visibleMonth), [visibleMonth]);

  useImperativeHandle(ref, () => ({
    focus: () => buttonRef.current?.focus(),
  }));

  useEffect(() => {
    if (selectedDate) setVisibleMonth(new Date(selectedDate.getFullYear(), selectedDate.getMonth(), 1));
  }, [selectedDate]);

  useEffect(() => {
    if (!open) return undefined;

    const updatePosition = () => {
      const rect = buttonRef.current?.getBoundingClientRect();
      if (!rect) return;
      const popupWidth = 284;
      const popupHeight = 332;
      const viewportPadding = 12;
      const spaceBelow = window.innerHeight - rect.bottom;
      const openUp = spaceBelow < popupHeight + viewportPadding && rect.top > popupHeight;
      const left = Math.min(Math.max(viewportPadding, rect.left), window.innerWidth - popupWidth - viewportPadding);
      const top = openUp
        ? Math.max(viewportPadding, rect.top - popupHeight - 8)
        : Math.max(viewportPadding, Math.min(rect.bottom + 8, window.innerHeight - popupHeight - viewportPadding));
      setMenuStyle({ left, top, width: popupWidth });
    };

    const handlePointerDown = (event) => {
      if (buttonRef.current?.contains(event.target) || menuRef.current?.contains(event.target)) return;
      setOpen(false);
    };

    updatePosition();
    document.addEventListener("mousedown", handlePointerDown);
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);

    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
    };
  }, [open]);

  const isDisabledDate = (date) => {
    const iso = toISODate(date);
    if (min && compareISO(iso, min) < 0) return true;
    if (max && compareISO(iso, max) > 0) return true;
    return false;
  };

  const selectDate = (date) => {
    if (isDisabledDate(date)) return;
    onChange?.(toISODate(date));
    setOpen(false);
    buttonRef.current?.focus();
  };

  const handleKeyDown = (event) => {
    if (disabled) return;
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      setOpen((current) => !current);
    }
    if (event.key === "Escape") {
      setOpen(false);
    }
    if (event.key === "Backspace" || event.key === "Delete") {
      event.preventDefault();
      onChange?.("");
      setOpen(false);
    }
  };

  return (
    <div className={`relative min-w-0 ${className}`}>
      {name ? <input type="hidden" name={name} value={isISODate(value) ? value : ""} /> : null}
      <button
        ref={buttonRef}
        type="button"
        disabled={disabled}
        aria-label={ariaLabel || placeholder}
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-invalid={invalid || undefined}
        aria-required={required || undefined}
        onClick={() => setOpen((current) => !current)}
        onKeyDown={handleKeyDown}
        className={`flex h-10 w-full min-w-0 items-center gap-2 rounded-xl border bg-white dark:bg-slate-950 px-3.5 text-left text-sm font-medium shadow-sm outline-none transition-all disabled:cursor-not-allowed disabled:opacity-60 ${
          invalid
            ? "border-red-400 dark:border-red-500 focus:border-red-500 focus:ring-2 focus:ring-red-500/20"
            : "border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-900 focus:border-blue-500 dark:focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
        }`}
      >
        <span className={`min-w-0 flex-1 truncate ${displayValue ? "text-slate-800 dark:text-slate-100" : "text-slate-400 dark:text-slate-500"}`}>
          {displayValue || placeholder}
        </span>
        <CalendarDays size={16} className="shrink-0 text-slate-400 dark:text-slate-500" />
      </button>

      {open ? (
        <div
          ref={menuRef}
          role="dialog"
          aria-label="Calendar"
          className="fixed z-[1000] rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 p-3 shadow-2xl dark:shadow-slate-950/70"
          style={menuStyle}
        >
          <div className="mb-3 flex items-center justify-between gap-2">
            <button
              type="button"
              aria-label="Previous month"
              onClick={() => setVisibleMonth((current) => addMonths(current, -1))}
              className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
            >
              <ChevronLeft size={17} />
            </button>
            <div className="text-center text-sm font-bold text-slate-900 dark:text-slate-100">
              {MONTHS[visibleMonth.getMonth()]} {visibleMonth.getFullYear()}
            </div>
            <button
              type="button"
              aria-label="Next month"
              onClick={() => setVisibleMonth((current) => addMonths(current, 1))}
              className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
            >
              <ChevronRight size={17} />
            </button>
          </div>

          <div className="grid grid-cols-7 gap-1 text-center text-[11px] font-bold uppercase tracking-wide text-slate-400 dark:text-slate-500">
            {WEEKDAYS.map((day) => <div key={day} className="h-7 leading-7">{day}</div>)}
          </div>
          <div className="grid grid-cols-7 gap-1">
            {days.map((date) => {
              const iso = toISODate(date);
              const muted = date.getMonth() !== visibleMonth.getMonth();
              const selected = isSameDay(date, selectedDate);
              const currentDay = isSameDay(date, today);
              const unavailable = isDisabledDate(date);
              return (
                <button
                  key={iso}
                  type="button"
                  disabled={unavailable}
                  aria-pressed={selected}
                  onClick={() => selectDate(date)}
                  className={`flex h-8 items-center justify-center rounded-lg text-sm font-semibold outline-none transition focus:ring-2 focus:ring-blue-500/20 disabled:cursor-not-allowed disabled:opacity-35 ${
                    selected
                      ? "bg-blue-600 text-white shadow-sm"
                      : currentDay
                        ? "bg-blue-50 dark:bg-blue-950/50 text-blue-700 dark:text-blue-300"
                        : muted
                          ? "text-slate-300 dark:text-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800"
                          : "text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800"
                  }`}
                >
                  {date.getDate()}
                </button>
              );
            })}
          </div>
        </div>
      ) : null}
    </div>
  );
});

DateInput.displayName = "DateInput";

export default DateInput;
