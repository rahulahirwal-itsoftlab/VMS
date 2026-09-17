import { AlertTriangle } from "lucide-react";

export const RequiredLabel = ({ children, helper }) => (
  <span className="mb-2 flex items-center gap-1.5 text-sm font-semibold text-slate-700 dark:text-slate-200">
    <span>
      {children} <span className="text-red-600">*</span>
    </span>
    {helper && (
      <span className="group relative inline-flex cursor-help text-slate-400 hover:text-slate-500">
        <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
        <span className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 hidden w-64 rounded-lg bg-slate-800 p-2 text-center text-xs font-normal text-white shadow-lg group-hover:block z-50 normal-case whitespace-normal leading-normal">
          {helper}
          <span className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-slate-800" />
        </span>
      </span>
    )}
  </span>
);

export const ValidationSummary = ({ title = "Cannot save record.", errors = [], onSelect }) => {
  if (!errors.length) return null;
  return (
    <section
      tabIndex={-1}
      className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800"
      aria-live="polite"
    >
      <div className="flex items-start gap-3">
        <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" />
        <div>
          <p className="font-bold">{title}</p>
          <p className="mt-1 font-medium">Please complete:</p>
          <div className="mt-3 flex flex-wrap gap-2">
            {errors.map((error) => (
              <button
                key={`${error.field}-${error.message}`}
                type="button"
                onClick={() => onSelect?.(error.field)}
                className="rounded-full border border-red-200 bg-white px-3 py-1 text-xs font-semibold text-red-700 hover:bg-red-100 focus:outline-none focus:ring-2 focus:ring-red-500"
              >
                {error.label}
              </button>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
};
