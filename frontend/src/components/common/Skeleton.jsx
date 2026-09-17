import React from "react";

export const Skeleton = ({ className = "", ...props }) => {
  return (
    <div
      className={`animate-pulse rounded-xl bg-slate-200/80 dark:bg-slate-800 ${className}`}
      {...props}
    />
  );
};

export const CardSkeleton = () => {
  return (
    <div className="rounded-2xl border border-slate-200 dark:border-slate-800 p-6 bg-white dark:bg-slate-900 space-y-4">
      <div className="flex items-center justify-between">
        <Skeleton className="h-5 w-1/3" />
        <Skeleton className="h-8 w-8 rounded-full" />
      </div>
      <Skeleton className="h-9 w-1/2" />
      <Skeleton className="h-4 w-2/3" />
    </div>
  );
};

export default Skeleton;
