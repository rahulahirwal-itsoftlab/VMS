import { Download, Eye, FileText, Loader2, Trash2, UploadCloud } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  deleteVendorDocument,
  downloadVendorDocument,
  getVendorDocuments,
  replaceVendorDocument,
  uploadVendorDocument,
} from "../../services/vendorService";
import { getErrorMessage, notify } from "../../utils/feedback";

const VENDOR_DOCUMENT_TYPES = [
  { type: "GST_CERTIFICATE", label: "GST Certificate" },
  { type: "PAN_CARD", label: "PAN Card" },
  { type: "VENDOR_AGREEMENT", label: "Vendor Agreement" },
  { type: "CANCELLED_CHEQUE", label: "Cancelled Cheque" },
  { type: "MSME_CERTIFICATE", label: "MSME Certificate" },
  { type: "BANK_PROOF", label: "Bank Proof" },
  { type: "ADDITIONAL_DOCUMENT", label: "Additional Document" },
];

const API_ORIGIN = "http://localhost:5000";
const ACCEPTED_FILE_TYPES = ".pdf,.png,.jpg,.jpeg,application/pdf,image/png,image/jpeg";

const formatSize = (bytes = 0) => {
  if (!bytes) return "-";
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

const getPreviewUrl = (document) => {
  if (!document?.fileUrl) return "";
  if (document.fileUrl.startsWith("http")) return document.fileUrl;
  return `${API_ORIGIN}${document.fileUrl}`;
};

const DocumentRow = ({ document, label, onDelete, onDownload, onReplace, progress, busy, readOnly = false }) => (
  <div className="rounded-xl border border-slate-200 dark:border-slate-800/80 bg-white dark:bg-slate-950/40 p-4">
    <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
      <div className="min-w-0">
        <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">{label}</p>
        {document ? (
          <>
            <p className="mt-1 truncate text-sm text-slate-600 dark:text-slate-300">{document.originalFileName}</p>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              {formatSize(document.fileSize)} · Uploaded {document.uploadedAt ? new Date(document.uploadedAt).toLocaleString() : "-"} by {document.uploadedBy}
            </p>
          </>
        ) : (
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">No file uploaded.</p>
        )}
        {progress > 0 && progress < 100 && (
          <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-100">
            <div className="h-full rounded-full bg-blue-600" style={{ width: `${progress}%` }} />
          </div>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {document && (
          <>
            <a
              href={getPreviewUrl(document)}
              download={document.originalFileName || document.documentName || "document"}
              className="inline-flex h-9 items-center gap-2 rounded-lg border border-slate-200 dark:border-slate-800 px-3 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-900"
            >
              <Eye size={14} />
              Preview
            </a>
            <button
              type="button"
              className="inline-flex h-9 items-center gap-2 rounded-lg border border-slate-200 dark:border-slate-800 px-3 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-900"
              onClick={onDownload}
            >
              <Download size={14} />
              Download
            </button>
          </>
        )}
        {!readOnly && (
          <label className="inline-flex h-9 cursor-pointer items-center gap-2 rounded-lg border border-blue-200 dark:border-blue-800/80 px-3 text-xs font-semibold text-blue-700 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-950/30">
            {busy ? <Loader2 className="animate-spin" size={14} /> : <UploadCloud size={14} />}
            {document ? "Replace" : "Upload"}
            <input
              className="hidden"
              type="file"
              accept={ACCEPTED_FILE_TYPES}
              disabled={busy}
              onChange={(event) => {
                const file = event.target.files?.[0];
                event.target.value = "";
                if (file) onReplace(file, document);
              }}
            />
          </label>
        )}
        {document && !readOnly && (
          <button
            type="button"
            className="inline-flex h-9 items-center gap-2 rounded-lg border border-red-200 dark:border-red-800/80 px-3 text-xs font-semibold text-red-700 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/30"
            disabled={busy}
            onClick={onDelete}
          >
            <Trash2 size={14} />
            Delete
          </button>
        )}
      </div>
    </div>
  </div>
);

const VendorDocumentsPanel = ({ vendorId, initialDocuments = [], readOnly = false }) => {
  const [documents, setDocuments] = useState(initialDocuments);
  const [loading, setLoading] = useState(Boolean(vendorId));
  const [progressByType, setProgressByType] = useState({});
  const [busyKey, setBusyKey] = useState("");

  const documentsByType = useMemo(() => {
    const grouped = new Map();
    documents.forEach((document) => {
      if (!grouped.has(document.documentType)) grouped.set(document.documentType, []);
      grouped.get(document.documentType).push(document);
    });
    return grouped;
  }, [documents]);

  const loadDocuments = useCallback(async () => {
    if (!vendorId) return;
    try {
      setLoading(true);
      setDocuments(await getVendorDocuments(vendorId));
    } catch (error) {
      notify.error(getErrorMessage(error, "Vendor documents could not be loaded."));
    } finally {
      setLoading(false);
    }
  }, [vendorId]);

  useEffect(() => {
    setDocuments(initialDocuments);
  }, [initialDocuments]);

  useEffect(() => {
    loadDocuments();
  }, [loadDocuments]);

  const validateFile = (file) => {
    const allowed = ["application/pdf", "image/png", "image/jpeg"];
    if (!allowed.includes(file.type)) {
      notify.error("Only PDF, PNG, JPG, and JPEG files are allowed.");
      return false;
    }
    if (file.size > 10 * 1024 * 1024) {
      notify.error("Document size must be 10 MB or smaller.");
      return false;
    }
    return true;
  };

  const handleUpload = async (type, label, file, existingDocument) => {
    if (!vendorId) {
      notify.warning("Create the vendor before uploading documents.");
      return;
    }
    if (!validateFile(file)) return;

    const key = existingDocument?.id || type;
    try {
      setBusyKey(key);
      const onUploadProgress = (event) => {
        const percent = event.total ? Math.round((event.loaded * 100) / event.total) : 0;
        setProgressByType((current) => ({ ...current, [key]: percent }));
      };
      if (existingDocument) {
        await replaceVendorDocument(vendorId, existingDocument.id, { file, documentType: type, documentName: label }, onUploadProgress);
        notify.success("Vendor document replaced.");
      } else {
        await uploadVendorDocument(vendorId, { file, documentType: type, documentName: label }, onUploadProgress);
        notify.success("Vendor document uploaded.");
      }
      await loadDocuments();
    } catch (error) {
      notify.error(getErrorMessage(error, "Vendor document operation failed."));
    } finally {
      setBusyKey("");
      setProgressByType((current) => ({ ...current, [key]: 0 }));
    }
  };

  const handleDelete = async (document) => {
    try {
      setBusyKey(document.id);
      await deleteVendorDocument(vendorId, document.id);
      notify.success("Vendor document deleted.");
      await loadDocuments();
    } catch (error) {
      notify.error(getErrorMessage(error, "Vendor document could not be deleted."));
    } finally {
      setBusyKey("");
    }
  };

  if (!vendorId) {
    return (
      <section className="rounded-2xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 shadow-sm dark:shadow-slate-950/40">
        <h2 className="text-xl font-semibold text-slate-900">Documents</h2>
        <p className="mt-2 text-sm text-slate-500">Documents can be uploaded after the vendor is created.</p>
      </section>
    );
  }

  return (
    <section className="rounded-2xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 shadow-sm dark:shadow-slate-950/40">
      <div className="flex items-center gap-3">
        <FileText className="text-blue-600" />
        <div>
          <h2 className="text-xl font-semibold text-slate-900">Documents</h2>
          <p className="mt-1 text-sm text-slate-500">PDF, PNG, JPG, or JPEG. Maximum file size 10 MB.</p>
        </div>
      </div>

      {loading ? (
        <div className="mt-6 flex h-32 items-center justify-center gap-2 text-slate-500">
          <Loader2 className="animate-spin" size={18} />
          Loading documents...
        </div>
      ) : (
        <div className="mt-6 space-y-3">
          {VENDOR_DOCUMENT_TYPES.map(({ type, label }) => {
            const items = documentsByType.get(type) || [];
            const primary = items[0];
            const rows = type === "ADDITIONAL_DOCUMENT" && items.length ? [...items, undefined] : [primary];
            return rows.map((document, index) => (
              <DocumentRow
                key={document?.id || `${type}-${index}`}
                label={type === "ADDITIONAL_DOCUMENT" && document ? document.documentName : label}
                document={document}
                progress={progressByType[document?.id || type] || 0}
                busy={busyKey === (document?.id || type)}
                readOnly={readOnly}
                onReplace={(file, existing) => !readOnly && handleUpload(type, label, file, existing)}
                onDelete={() => !readOnly && handleDelete(document)}
                onDownload={() => downloadVendorDocument(vendorId, document)}
              />
            ));
          })}
        </div>
      )}
    </section>
  );
};

export default VendorDocumentsPanel;
