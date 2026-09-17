import { useEffect, useId, useMemo, useRef, useState } from "react";
import { Check, ChevronDown } from "lucide-react";

const MENU_GAP = 6;

const normalizeOptions = (options = []) =>
  options.map((option) => (
    typeof option === "string"
      ? { value: option, label: option }
      : { value: option.value ?? "", label: option.label ?? option.name ?? option.value ?? "" }
  ));

const FilterSelect = ({
  label,
  value,
  options = [],
  onChange,
  placeholder = "Select",
  disabled = false,
  className = "",
  menuClassName = "",
  ariaLabel,
}) => {
  const id = useId();
  const buttonRef = useRef(null);
  const menuRef = useRef(null);
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const [menuStyle, setMenuStyle] = useState({});
  const normalizedOptions = useMemo(() => normalizeOptions(options), [options]);
  const selectedIndex = normalizedOptions.findIndex((option) => option.value === value);
  const selectedOption = selectedIndex >= 0 ? normalizedOptions[selectedIndex] : null;

  const updateMenuPosition = () => {
    const rect = buttonRef.current?.getBoundingClientRect();
    if (!rect) return;
    const viewportPadding = 12;
    const width = Math.max(rect.width, 192);
    const maxLeft = window.innerWidth - width - viewportPadding;
    setMenuStyle({
      left: Math.max(viewportPadding, Math.min(rect.left, maxLeft)),
      top: Math.min(rect.bottom + MENU_GAP, window.innerHeight - viewportPadding),
      width,
    });
  };

  useEffect(() => {
    if (!open) return undefined;
    setActiveIndex(selectedIndex >= 0 ? selectedIndex : 0);
    updateMenuPosition();

    const handlePointerDown = (event) => {
      if (
        buttonRef.current?.contains(event.target) ||
        menuRef.current?.contains(event.target)
      ) {
        return;
      }
      setOpen(false);
    };

    window.addEventListener("resize", updateMenuPosition);
    window.addEventListener("scroll", updateMenuPosition, true);
    document.addEventListener("mousedown", handlePointerDown);
    return () => {
      window.removeEventListener("resize", updateMenuPosition);
      window.removeEventListener("scroll", updateMenuPosition, true);
      document.removeEventListener("mousedown", handlePointerDown);
    };
  }, [open, selectedIndex]);

  const chooseOption = (option) => {
    onChange?.(option.value);
    setOpen(false);
    buttonRef.current?.focus();
  };

  const handleKeyDown = (event) => {
    if (disabled) return;

    if (!open && ["ArrowDown", "ArrowUp", "Enter", " "].includes(event.key)) {
      event.preventDefault();
      setOpen(true);
      return;
    }

    if (!open) return;

    if (event.key === "Escape") {
      event.preventDefault();
      setOpen(false);
      return;
    }

    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveIndex((index) => Math.min(index + 1, normalizedOptions.length - 1));
      return;
    }

    if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex((index) => Math.max(index - 1, 0));
      return;
    }

    if (event.key === "Home") {
      event.preventDefault();
      setActiveIndex(0);
      return;
    }

    if (event.key === "End") {
      event.preventDefault();
      setActiveIndex(Math.max(normalizedOptions.length - 1, 0));
      return;
    }

    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      const option = normalizedOptions[activeIndex];
      if (option) chooseOption(option);
    }
  };

  return (
    <div className={`min-w-0 ${className}`}>
      {label && (
        <label
          id={`${id}-label`}
          className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400"
        >
          {label}
        </label>
      )}
      <button
        ref={buttonRef}
        type="button"
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-labelledby={label ? `${id}-label ${id}-button` : undefined}
        aria-label={!label ? ariaLabel || placeholder : undefined}
        id={`${id}-button`}
        onClick={() => !disabled && setOpen((current) => !current)}
        onKeyDown={handleKeyDown}
        className="flex h-10 w-full min-w-0 items-center justify-between gap-2 rounded-xl border border-slate-200 bg-white px-3.5 text-left text-sm font-medium text-slate-800 shadow-sm outline-none transition-all hover:border-slate-300 hover:bg-slate-50 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 disabled:cursor-not-allowed disabled:opacity-60 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-100 dark:hover:border-slate-700 dark:hover:bg-slate-900"
      >
        <span className={`block min-w-0 flex-1 truncate ${selectedOption ? "" : "text-slate-400 dark:text-slate-500"}`}>
          {selectedOption?.label || placeholder}
        </span>
        <ChevronDown
          className={`h-4 w-4 shrink-0 text-slate-400 transition-transform dark:text-slate-500 ${open ? "rotate-180" : ""}`}
        />
      </button>

      {open && (
        <div
          ref={menuRef}
          role="listbox"
          aria-labelledby={label ? `${id}-label` : undefined}
          className={`fixed z-[1000] max-h-64 overflow-auto rounded-xl border border-slate-200 bg-white p-1.5 shadow-xl shadow-slate-950/10 outline-none dark:border-slate-800 dark:bg-slate-950 dark:shadow-slate-950/60 ${menuClassName}`}
          style={menuStyle}
        >
          {normalizedOptions.map((option, index) => {
            const selected = option.value === value;
            const active = index === activeIndex;
            return (
              <button
                key={`${option.value}-${index}`}
                type="button"
                role="option"
                aria-selected={selected}
                onMouseEnter={() => setActiveIndex(index)}
                onClick={() => chooseOption(option)}
                className={`flex min-h-9 w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-sm transition ${
                  selected
                    ? "bg-blue-50 font-semibold text-blue-700 dark:bg-blue-950/40 dark:text-blue-300"
                    : active
                      ? "bg-slate-100 text-slate-900 dark:bg-slate-800 dark:text-slate-100"
                      : "text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-800"
                }`}
              >
                <Check className={`h-4 w-4 shrink-0 ${selected ? "opacity-100" : "opacity-0"}`} />
                <span className="min-w-0 truncate">{option.label}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default FilterSelect;
