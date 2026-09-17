import { useState, useEffect, useCallback } from "react";
import { History, X, RefreshCw, Eye } from "lucide-react";
import { getAuditLogs, getAuditLogById } from "../../services/auditService";
import { getManagersLookup } from "../../services/lookupService";
import { toast } from "sonner";
import LoadingSpinner from "../../components/common/LoadingSpinner";
import Pagination from "../../components/common/Pagination";
import { formatEnumLabel, formatRoleLabel } from "../../utils/displayFormatters";
import FilterSelect from "../../components/common/FilterSelect";
import DateInput from "../../components/common/DateInput";


const AuditLogsList = () => {
  // ── States ────────────────────────────────────────────────────────────────
  const [logs, setLogs] = useState([]);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // ── Filters State ─────────────────────────────────────────────────────────
  const [filters, setFilters] = useState({
    entityType: "",
    action: "",
    performedById: "",
    dateFrom: "",
    dateTo: "",
    page: 1,
    limit: 15,
  });

  // ── Active Lookups & Detail Drawer States ──────────────────────────────────
  const [actorsList, setActorsList] = useState([]);
  const [selectedLog, setSelectedLog] = useState(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [drawerLoading, setDrawerLoading] = useState(false);

  // ── Fetch Audit Logs ───────────────────────────────────────────────────────
  const loadLogs = useCallback(async (params) => {
    try {
      setLoading(true);
      setError(null);
      
      const query = { ...params };
      if (!query.entityType) delete query.entityType;
      if (!query.action) delete query.action;
      if (!query.performedById) delete query.performedById;
      if (!query.dateFrom) delete query.dateFrom;
      if (!query.dateTo) delete query.dateTo;

      const res = await getAuditLogs(query);
      setLogs(res.logs || []);
      setTotal(res.total || 0);
      setTotalPages(res.totalPages || 1);
    } catch (err) {
      console.error(err);
      const msg = err?.response?.data?.message || "Failed to retrieve system audit records.";
      setError(msg);
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadLogs(filters);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters.page, filters.entityType, filters.action, filters.performedById, filters.dateFrom, filters.dateTo, loadLogs]);

  // Load actors lookup cache once
  useEffect(() => {
    const fetchActors = async () => {
      try {
        const managers = await getManagersLookup();
        setActorsList(managers);
      } catch (err) {
        console.error(err);
      }
    };
    fetchActors();
  }, []);

  const handleFilterChange = (key, val) => {
    setFilters((prev) => ({ ...prev, [key]: val, page: 1 }));
  };

  const resetFilters = () => {
    setFilters({
      entityType: "",
      action: "",
      performedById: "",
      dateFrom: "",
      dateTo: "",
      page: 1,
      limit: 15,
    });
  };

  // ── Open Detail Drawer ─────────────────────────────────────────────────────
  const openDrawer = async (logId) => {
    try {
      setDrawerLoading(true);
      setDrawerOpen(true);
      const log = await getAuditLogById(logId);
      setSelectedLog(log);
    } catch (err) {
      console.error(err);
      toast.error("Failed to load audit entry details.");
      setDrawerOpen(false);
    } finally {
      setDrawerLoading(false);
    }
  };

  const getActorName = (log) => {
    if (!log.performed_by) return "System Override";
    const name = `${log.performed_by.first_name || ""} ${log.performed_by.last_name || ""}`.trim();
    return name || log.performed_by.email;
  };

  return (
    <div className="space-y-6 relative select-none">
      {/* Navigation Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <History size={28} className="text-slate-600" />
          <div>
            <h1 className="text-3xl font-bold text-slate-900 dark:text-slate-100">Operational Audit Logs</h1>
            <p className="mt-1 text-slate-500">Read-only historical trail of system modifications and administrative events</p>
          </div>
        </div>
      </div>

      {/* Filters Toolbar */}
      <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 shadow-sm dark:shadow-slate-950/40 space-y-4">
        <div className="flex flex-wrap gap-4 items-center">
          {/* Entity Type Filter */}
          <div className="flex flex-col">
            <label className="text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1">Entity Scope</label>
            <FilterSelect
              value={filters.entityType}
              onChange={(nextValue) => handleFilterChange("entityType", nextValue)}
              options={[
                { value: "", label: "All Entities" },
                { value: "user", label: "User Accounts" },
                { value: "vendor", label: "Vendors" },
                { value: "purchase_order", label: "Purchase Orders" },
                { value: "invoice", label: "Invoices" },
                { value: "payment", label: "Payments" },
                { value: "three_way_match", label: "3-Way Match" },
              ]}
              placeholder="All Entities"
              className="w-48"
            />
          </div>

          {/* Action Filter */}
          <div className="flex flex-col">
            <label className="text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1">Operation Type</label>
            <FilterSelect
              value={filters.action}
              onChange={(nextValue) => handleFilterChange("action", nextValue)}
              options={[
                { value: "", label: "All Actions" },
                { value: "user_created", label: "User Created" },
                { value: "user_updated", label: "User Updated" },
                { value: "user_deleted", label: "User Deleted" },
                { value: "password_reset", label: "Password Reset" },
                { value: "vendor_created", label: "Vendor Created" },
                { value: "vendor_approved", label: "Vendor Approved" },
                { value: "invoice_approved", label: "Invoice Approved" },
                { value: "payment_processed", label: "Payment Processed" },
              ]}
              placeholder="All Actions"
              className="w-48"
            />
          </div>

          {/* Actor Select Filter */}
          <div className="flex flex-col">
            <label className="text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1">Performed By</label>
            <FilterSelect
              value={filters.performedById}
              onChange={(nextValue) => handleFilterChange("performedById", nextValue)}
              options={[
                { value: "", label: "All Administrators" },
                ...actorsList.map((actor) => ({ value: actor.value, label: actor.name })),
              ]}
              placeholder="All Administrators"
              className="w-56"
            />
          </div>

          {/* Date Range Filters */}
          <div className="flex flex-col">
            <label className="text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1">Date From</label>
            <DateInput
              value={filters.dateFrom}
              max={filters.dateTo || undefined}
              onChange={(nextValue) => handleFilterChange("dateFrom", nextValue)}
              ariaLabel="Audit log date from"
            />
          </div>

          <div className="flex flex-col">
            <label className="text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1">Date To</label>
            <DateInput
              value={filters.dateTo}
              min={filters.dateFrom || undefined}
              onChange={(nextValue) => handleFilterChange("dateTo", nextValue)}
              ariaLabel="Audit log date to"
            />
          </div>

          {/* Buttons */}
          <div className="flex items-end gap-2.5 h-full pt-5">
            <button
              onClick={() => loadLogs(filters)}
              className="inline-flex items-center gap-1.5 rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-sm text-slate-600 hover:bg-slate-50 transition"
              title="Refresh log feed"
            >
              <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
              Refresh
            </button>
            <button
              onClick={resetFilters}
              className="rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-sm text-slate-600 hover:bg-slate-50 transition"
            >
              Reset Filters
            </button>
          </div>
        </div>
      </div>

      {/* Error Panel */}
      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* Log Feed Table Grid */}
      <div className="rounded-xl border border-slate-200 bg-white overflow-hidden shadow-sm">
        {loading ? (
          <div className="flex h-64 items-center justify-center">
            <LoadingSpinner size="lg" text="Querying Database Logs..." />
          </div>
        ) : logs.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full min-w-200">
              <thead className="border-b border-slate-200 bg-slate-50 text-xs font-semibold text-slate-600">
                <tr>
                  <th className="px-5 py-4 text-left">Event Timestamp</th>
                  <th className="px-5 py-4 text-left">Scope / Entity</th>
                  <th className="px-5 py-4 text-left">Action Trigger</th>
                  <th className="px-5 py-4 text-left">Actor (Operator)</th>
                  <th className="px-5 py-4 text-left">Remarks Summary</th>
                  <th className="px-5 py-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-sm text-slate-700">
                {logs.map((log) => (
                  <tr key={log.id} className="hover:bg-slate-50/50 transition">
                    <td className="px-5 py-4 font-mono text-xs text-slate-500">
                      {new Date(log.created_at).toLocaleString("en-IN")}
                    </td>
                    <td className="px-5 py-4">
                      <span className="inline-block rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-semibold text-slate-700 border border-slate-200">
                        {formatEnumLabel(log.entity_type)}
                      </span>
                    </td>
                    <td className="px-5 py-4 font-mono text-xs font-bold text-slate-900">
                      {formatEnumLabel(log.action)}
                    </td>
                    <td className="px-5 py-4">
                      <p className="font-semibold text-slate-900">{getActorName(log)}</p>
                      <p className="text-xs text-slate-500 font-medium">{formatRoleLabel(log.performed_by?.role) || "System"}</p>
                    </td>
                    <td className="px-5 py-4 text-slate-500 text-xs max-w-xs truncate">
                      {log.remarks}
                    </td>
                    <td className="px-5 py-4 text-right">
                      <button
                        onClick={() => openDrawer(log.id)}
                        className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition"
                        title="View Detailed Payload Difference"
                      >
                        <Eye size={16} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center py-20 text-slate-400">
            <History size={40} className="text-slate-300 mb-2" />
            <p className="text-sm font-semibold">No operational audit records found</p>
            <p className="text-xs mt-1 text-slate-500">Try loosening your date range or scoping filters.</p>
          </div>
        )}
      </div>

      {/* Pagination Footer */}
      {!loading && totalPages > 1 && (
        <Pagination
          currentPage={filters.page}
          totalPages={totalPages}
          totalItems={total}
          itemsPerPage={filters.limit}
          onPageChange={(page) => setFilters((p) => ({ ...p, page }))}
          isLoading={loading}
          label="audit logs"
        />
      )}

      {/* ── Detail Drawer (Safe Details Difference view) ────────────────────── */}
      {drawerOpen && (
        <div className="fixed inset-0 z-50 overflow-hidden">
          <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-xs transition-opacity" onClick={() => setDrawerOpen(false)} />
          
          <div className="absolute inset-y-0 right-0 max-w-full flex pl-10">
            <div className="w-screen max-w-2xl bg-white shadow-xl flex flex-col">
              
              {/* Drawer Header */}
              <div className="px-6 py-5 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
                <div>
                  <h2 className="text-lg font-bold text-slate-900">Audit Entry Payload Difference</h2>
                  {selectedLog && (
                    <p className="text-xs text-slate-500 mt-1">UUID: {selectedLog.id}</p>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => setDrawerOpen(false)}
                  className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition"
                >
                  <X size={20} />
                </button>
              </div>

              {/* Drawer Body */}
              <div className="flex-1 overflow-y-auto px-6 py-6 space-y-6">
                {drawerLoading ? (
                  <div className="flex h-64 items-center justify-center text-slate-400 animate-pulse font-medium">
                    Retrieving detailed differences payload...
                  </div>
                ) : selectedLog ? (
                  <div className="space-y-6">
                    {/* Event metadata card */}
                    <div className="rounded-xl border border-slate-100 bg-slate-50 p-4 space-y-3.5 text-sm text-slate-600">
                      <div className="flex justify-between border-b border-slate-200/60 pb-2">
                        <span className="font-semibold">Action Trigger</span>
                        <span className="font-mono text-slate-950 font-bold">{selectedLog.action}</span>
                      </div>
                      <div className="flex justify-between border-b border-slate-200/60 pb-2">
                        <span className="font-semibold">Operator Actor</span>
                        <span className="text-slate-950 font-bold">{getActorName(selectedLog)}</span>
                      </div>
                      <div className="flex justify-between border-b border-slate-200/60 pb-2">
                        <span className="font-semibold">Client Connection</span>
                        <span className="text-slate-950 font-mono text-xs">{selectedLog.ip_address || "Internal process"}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="font-semibold">Timestamp</span>
                        <span className="text-slate-950 font-mono text-xs">{new Date(selectedLog.created_at).toLocaleString("en-IN")}</span>
                      </div>
                    </div>

                    {/* Remarks summary */}
                    <div className="space-y-2">
                      <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Remarks Summary</h4>
                      <p className="text-sm bg-slate-50 p-3 rounded-xl border border-slate-200/60 text-slate-700 leading-relaxed font-semibold">
                        {selectedLog.remarks}
                      </p>
                    </div>

                    {/* Client Browser User Agent */}
                    {selectedLog.user_agent && (
                      <div className="space-y-2">
                        <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Browser User Agent</h4>
                        <p className="text-xs font-mono bg-slate-50 p-3 rounded-xl border border-slate-200/60 text-slate-600 wrap-break-word">
                          {selectedLog.user_agent}
                        </p>
                      </div>
                    )}
                  </div>
                ) : null}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AuditLogsList;
export { AuditLogsList };
