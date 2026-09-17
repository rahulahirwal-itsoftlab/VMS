import { Download, Loader2, FileSpreadsheet, FileText } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { triggerBlobDownload } from "../../services/reportService";

/**
 * ExportButton — handles export fetch, file download, and loading state.
 *
 * Props:
 *   onExport   - async function(format) => { data: Blob, format: string }
 *   filename   - base filename without extension (e.g. "vendor-report-2025-01-01-to-all")
 *   label      - button label
 *   disabled   - disables button
 */
const ExportButton = ({
  onExport,
  filename = "report",
  label = "Export",
  disabled = false,
}) => {
  const [loading, setLoading] = useState(false);
  const [showMenu, setShowMenu] = useState(false);

  const handleExport = async (format) => {
    setShowMenu(false);
    setLoading(true);
    try {
      const result = await onExport(format);
      const ext = result.format || format;
      triggerBlobDownload(result.data, `${filename}.${ext}`);
      toast.success(`Report exported as ${ext.toUpperCase()}`);
    } catch (err) {
      const msg = err?.response?.data?.message || "Export failed. Please try again.";
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setShowMenu((v) => !v)}
        disabled={disabled || loading}
        className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition"
      >
        {loading ? (
          <Loader2 size={15} className="animate-spin" />
        ) : (
          <Download size={15} />
        )}
        {loading ? "Exporting…" : label}
      </button>

      {showMenu && !loading && (
        <div className="absolute right-0 top-10 z-50 w-44 rounded-2xl border border-slate-200 bg-white shadow-xl">
          <button
            type="button"
            onClick={() => handleExport("xlsx")}
            className="flex w-full items-center gap-3 px-4 py-3 text-sm text-slate-700 hover:bg-blue-50 hover:text-blue-700 transition rounded-t-2xl"
          >
            <FileSpreadsheet size={15} className="text-green-600" />
            Excel (.xlsx)
          </button>
          <button
            type="button"
            onClick={() => handleExport("csv")}
            className="flex w-full items-center gap-3 px-4 py-3 text-sm text-slate-700 hover:bg-blue-50 hover:text-blue-700 transition rounded-b-2xl border-t border-slate-100"
          >
            <FileText size={15} className="text-blue-600" />
            CSV (.csv)
          </button>
        </div>
      )}
    </div>
  );
};

export default ExportButton;
