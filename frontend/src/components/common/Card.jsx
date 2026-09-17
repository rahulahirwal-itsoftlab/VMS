import React from "react";

export const Card = ({
  children,
  className = "",
  header,
  title,
  subtitle,
  action,
  footer,
  hoverable = false,
  padding = "p-6",
  ...props
}) => {
  return (
    <div
      className={`rounded-2xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900/90 shadow-sm dark:shadow-slate-950/40 backdrop-blur-md transition-all duration-300 ${
        hoverable ? "hover:shadow-xl hover:-translate-y-0.5 hover:border-slate-300 dark:hover:border-slate-700" : ""
      } ${className}`}
      {...props}
    >
      {(header || title || action) && (
        <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 px-6 py-4">
          <div>
            {title && (
              <h3 className="text-base font-semibold tracking-tight text-slate-900 dark:text-slate-100">
                {title}
              </h3>
            )}
            {subtitle && (
              <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                {subtitle}
              </p>
            )}
            {header}
          </div>
          {action && <div className="flex items-center gap-2">{action}</div>}
        </div>
      )}

      <div className={padding}>{children}</div>

      {footer && (
        <div className="border-t border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50 px-6 py-3.5 rounded-b-2xl">
          {footer}
        </div>
      )}
    </div>
  );
};

export default Card;
