import React from "react";
import { Loader2 } from "lucide-react";

const variants = {
  primary:
    "bg-blue-600 hover:bg-blue-700 text-white shadow-md shadow-blue-600/20 active:scale-[0.98]",
  secondary:
    "bg-sky-500 hover:bg-sky-600 text-white shadow-md shadow-sky-500/20 active:scale-[0.98]",
  outline:
    "border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700/60 shadow-sm active:scale-[0.98]",
  ghost:
    "bg-transparent text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-white active:scale-[0.98]",
  danger:
    "bg-red-500 hover:bg-red-600 text-white shadow-md shadow-red-500/20 active:scale-[0.98]",
  subtle:
    "bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400 hover:bg-blue-100 dark:hover:bg-blue-900/60 active:scale-[0.98]",
};

const sizes = {
  sm: "h-8 px-3 text-xs rounded-xl gap-1.5",
  md: "h-10 px-4 text-sm font-medium rounded-xl gap-2",
  lg: "h-12 px-6 text-base font-semibold rounded-2xl gap-2.5",
  icon: "h-10 w-10 p-0 rounded-xl justify-center items-center",
};

export const Button = React.forwardRef(
  (
    {
      children,
      variant = "primary",
      size = "md",
      isLoading = false,
      isDisabled = false,
      leftIcon: LeftIcon,
      rightIcon: RightIcon,
      className = "",
      type = "button",
      ...props
    },
    ref
  ) => {
    const baseClasses =
      "inline-flex items-center justify-center font-medium transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 disabled:opacity-50 disabled:pointer-events-none cursor-pointer select-none";

    return (
      <button
        ref={ref}
        type={type}
        disabled={isDisabled || isLoading}
        className={`${baseClasses} ${variants[variant] || variants.primary} ${sizes[size] || sizes.md} ${className}`}
        {...props}
      >
        {isLoading ? (
          <Loader2 className="h-4 w-4 animate-spin text-current shrink-0" />
        ) : LeftIcon ? (
          <LeftIcon className="h-4 w-4 shrink-0" />
        ) : null}
        
        {children && <span>{children}</span>}

        {!isLoading && RightIcon && (
          <RightIcon className="h-4 w-4 shrink-0" />
        )}
      </button>
    );
  }
);

Button.displayName = "Button";
export default Button;
