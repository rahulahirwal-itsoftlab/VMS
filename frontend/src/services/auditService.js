import api from "../api/axios";

/**
 * Fetch paginated audit logs from the backend.
 * @param {object} params - { entityType, entityId, action, performedById, dateFrom, dateTo, page, limit, source }
 */
export const getAuditLogs = async (params = {}) => {
  const res = await api.get("/v1/audit-logs", { params });
  return {
    logs: res.data.logs || [],
    total: res.data.total || 0,
    page: res.data.page || 1,
    limit: res.data.limit || 50,
    totalPages: res.data.totalPages || 1,
  };
};

/**
 * Fetch a single audit log entry details.
 * @param {string} id
 */
export const getAuditLogById = async (id) => {
  const res = await api.get(`/v1/audit-logs/${id}`);
  return res.data.data;
};
