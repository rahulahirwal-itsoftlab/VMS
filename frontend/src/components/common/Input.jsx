import React from "react";
import { ChevronDown } from "lucide-react";

export const Input = React.forwardRef(
  (
    {
      label,
      error,
      helperText,
      leftIcon: LeftIcon,
      rightIcon: RightIcon,
      className = "",
      containerClassName = "",
      id,
      ...props
    },
    ref
  ) => {
    const inputId = id || (label ? label.toLowerCase().replace(/\s+/g, "-") : undefined);

    return (
      <div className={`flex flex-col gap-1.5 ${containerClassName}`}>
        {label && (
          <label
            htmlFor={inputId}
            className="text-xs font-semibold uppercase tracking-wider text-slate-600 dark:text-slate-400"
          >
            {label}
          </label>
        )}

        <div className="relative flex items-center">
          {LeftIcon && (
            <div className="absolute left-3.5 pointer-events-none text-slate-400 dark:text-slate-500">
              <LeftIcon className="h-4 w-4" />
            </div>
          )}

          <input
            id={inputId}
            ref={ref}
            className={`w-full h-11 rounded-xl border bg-white dark:bg-slate-900 text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 transition-all duration-200 outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-600 dark:focus:border-blue-500 disabled:opacity-50 disabled:bg-slate-50 dark:disabled:bg-slate-800 ${
              LeftIcon ? "pl-10" : "pl-3.5"
            } ${RightIcon ? "pr-10" : "pr-3.5"} ${
              error
                ? "border-red-500 focus:border-red-500 focus:ring-red-500/20"
                : "border-slate-200 dark:border-slate-800"
            } ${className}`}
            {...props}
          />

          {RightIcon && (
            <div className="absolute right-3.5 text-slate-400 dark:text-slate-500">
              <RightIcon className="h-4 w-4" />
            </div>
          )}
        </div>

        {error ? (
          <p className="text-xs font-medium text-red-500 dark:text-red-400">{error}</p>
        ) : helperText ? (
          <p className="text-xs text-slate-500 dark:text-slate-400">{helperText}</p>
        ) : null}
      </div>
    );
  }
);

Input.displayName = "Input";

export const Select = React.forwardRef(
  (
    {
      label,
      error,
      children,
      className = "",
      containerClassName = "",
      id,
      ...props
    },
    ref
  ) => {
    const selectId = id || (label ? label.toLowerCase().replace(/\s+/g, "-") : undefined);

    return (
      <div className={`flex flex-col gap-1.5 ${containerClassName}`}>
        {label && (
          <label
            htmlFor={selectId}
            className="text-xs font-semibold uppercase tracking-wider text-slate-600 dark:text-slate-400"
          >
            {label}
          </label>
        )}

        <div className="relative">
          <select
            id={selectId}
            ref={ref}
            className={`w-full h-11 appearance-none rounded-xl border bg-white dark:bg-slate-950 text-sm font-medium text-slate-900 dark:text-slate-100 transition-all duration-200 outline-none hover:bg-slate-50 dark:hover:bg-slate-900 focus:ring-2 focus:ring-blue-500/20 focus:border-blue-600 dark:focus:border-blue-500 px-3.5 pr-10 shadow-sm disabled:cursor-not-allowed disabled:opacity-60 ${
              error
                ? "border-red-500 focus:border-red-500 focus:ring-red-500/20"
                : "border-slate-200 dark:border-slate-800"
            } ${className}`}
            {...props}
          >
            {children}
          </select>
          <ChevronDown className="pointer-events-none absolute right-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400 dark:text-slate-500" />
        </div>

        {error && <p className="text-xs font-medium text-red-500 dark:text-red-400">{error}</p>}
      </div>
    );
  }
);

Select.displayName = "Select";

export default Input;
