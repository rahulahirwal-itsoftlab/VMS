import React, { useEffect, useRef } from "react";
import { AlertTriangle, Loader2, X } from "lucide-react";
import Button from "./Button";

const variantClasses = {
  default: {
    iconBg: "bg-blue-50 text-blue-600 dark:bg-blue-950/60 dark:text-blue-400 ring-8 ring-blue-50/50 dark:ring-blue-950/20",
    btnVariant: "primary",
  },
  warning: {
    iconBg: "bg-amber-50 text-amber-600 dark:bg-amber-950/60 dark:text-amber-400 ring-8 ring-amber-50/50 dark:ring-amber-950/20",
    btnVariant: "secondary",
  },
  destructive: {
    iconBg: "bg-red-50 text-red-600 dark:bg-red-950/60 dark:text-red-400 ring-8 ring-red-50/50 dark:ring-red-950/20",
    btnVariant: "danger",
  },
};

const ConfirmationModal = ({
  open,
  title,
  description,
  children,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  variant = "default",
  loading = false,
  disabled = false,
  onCancel,
  onConfirm,
  ariaLabel,
}) => {
  const dialogRef = useRef(null);
  const cancelButtonRef = useRef(null);
  const styles = variantClasses[variant] || variantClasses.default;

  useEffect(() => {
    if (!open) return undefined;

    const previousActiveElement = document.activeElement;
    const focusTimer = window.setTimeout(() => {
      cancelButtonRef.current?.focus();
    }, 0);

    const handleKeyDown = (event) => {
      if (event.key === "Escape" && !loading) {
        onCancel?.();
        return;
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    document.body.style.overflow = "hidden";

    return () => {
      window.clearTimeout(focusTimer);
      document.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = "";
      previousActiveElement?.focus?.();
    };
  }, [loading, onCancel, open]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center overflow-y-auto p-3 sm:p-6 animate-in fade-in duration-200">
      <button
        type="button"
        className="fixed inset-0 bg-slate-950/60 backdrop-blur-md transition-opacity"
        aria-label="Close modal background"
        onClick={() => {
          if (!loading) onCancel?.();
        }}
      />

      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label={ariaLabel || title}
        className="relative z-10 w-full max-w-lg overflow-hidden rounded-2xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-2xl transition-all scale-in-95 duration-200"
      >
        <div className="p-4 sm:p-7">
          <div className="flex items-start gap-3 sm:gap-4">
            <div className={`flex h-10 w-10 sm:h-12 sm:w-12 shrink-0 items-center justify-center rounded-2xl ${styles.iconBg}`}>
              <AlertTriangle className="h-5 w-5 sm:h-6 sm:w-6" aria-hidden="true" />
            </div>

            <div className="min-w-0 flex-1">
              <div className="flex items-center justify-between gap-2">
                <h2 className="text-base sm:text-lg font-bold tracking-tight text-slate-900 dark:text-slate-100">
                  {title}
                </h2>
                <button
                  type="button"
                  onClick={onCancel}
                  disabled={loading}
                  className="rounded-xl p-1 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-600 dark:hover:text-slate-200 transition"
                  aria-label="Close dialog"
                >
                  <X size={18} />
                </button>
              </div>

              {description && (
                <p className="mt-1.5 sm:mt-2 text-xs sm:text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
                  {description}
                </p>
              )}
            </div>
          </div>

          {children && <div className="mt-4 sm:mt-5">{children}</div>}
        </div>

        <div className="flex flex-col-reverse gap-2 border-t border-slate-100 dark:border-slate-800/80 bg-slate-50/60 dark:bg-slate-900/60 px-4 py-3 sm:px-6 sm:py-4 sm:flex-row sm:justify-end">
          <Button
            ref={cancelButtonRef}
            variant="outline"
            onClick={onCancel}
            isDisabled={loading}
          >
            {cancelLabel}
          </Button>

          <Button
            variant={styles.btnVariant}
            onClick={onConfirm}
            isLoading={loading}
            isDisabled={disabled}
          >
            {confirmLabel}
          </Button>
        </div>
      </div>
    </div>
  );
};

export default ConfirmationModal;
