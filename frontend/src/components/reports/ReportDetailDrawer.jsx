import { X, ExternalLink } from "lucide-react";
import { useEffect } from "react";

/**
 * Read-only slide-over drawer for report detail views.
 *
 * Props:
 *   open     - boolean
 *   onClose  - () => void
 *   title    - drawer heading
 *   children - drawer body content
 */
const ReportDetailDrawer = ({ open, onClose, title = "Record Details", children }) => {
  // Close on Escape key
  useEffect(() => {
    if (!open) return;
    const handler = (e) => { if (e.key === "Escape") onClose?.(); };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-40 bg-black/30 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Drawer */}
      <aside className="fixed inset-y-0 right-0 z-50 flex w-full max-w-xl flex-col bg-white shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">{title}</h2>
            <p className="mt-0.5 text-xs text-slate-400 flex items-center gap-1">
              <ExternalLink size={11} /> Read-only view
            </p>
          </div>
          <button
            onClick={onClose}
            className="rounded-xl p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition"
            aria-label="Close drawer"
          >
            <X size={18} />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-4">
          {children}
        </div>
      </aside>
    </>
  );
};

/**
 * Small helper: renders a labeled field row inside the drawer.
 */
export const DetailField = ({ label, value, mono = false }) => (
  <div className="mb-4">
    <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-400">{label}</p>
    <p className={`text-sm text-slate-800 ${mono ? "font-mono" : ""}`}>
      {value !== null && value !== undefined && value !== "" ? String(value) : "—"}
    </p>
  </div>
);

/**
 * Separator inside the drawer.
 */
export const DetailSection = ({ title }) => (
  <div className="mb-4 mt-6 border-b border-slate-200 pb-1">
    <p className="text-xs font-bold uppercase tracking-widest text-slate-500">{title}</p>
  </div>
);

export default ReportDetailDrawer;
