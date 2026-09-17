import React from "react";
import { FolderOpen } from "lucide-react";

export const EmptyState = ({
  icon: Icon = FolderOpen,
  title = "No items found",
  description = "There are no records to display at this moment.",
  action,
  className = "",
}) => {
  return (
    <div className={`flex flex-col items-center justify-center p-12 text-center rounded-2xl border border-dashed border-slate-200 dark:border-slate-800 bg-white/50 dark:bg-slate-900/50 backdrop-blur-sm ${className}`}>
      <div className="relative mb-5 flex h-16 w-16 items-center justify-center rounded-2xl bg-blue-50 dark:bg-blue-950/50 text-blue-600 dark:text-blue-400 ring-8 ring-blue-50/50 dark:ring-blue-950/20">
        <Icon className="h-8 w-8" />
      </div>

      <h3 className="text-base font-bold text-slate-900 dark:text-slate-100 tracking-tight">
        {title}
      </h3>

      <p className="mt-1.5 max-w-sm text-sm text-slate-500 dark:text-slate-400">
        {description}
      </p>

      {action && <div className="mt-6">{action}</div>}
    </div>
  );
};

export default EmptyState;