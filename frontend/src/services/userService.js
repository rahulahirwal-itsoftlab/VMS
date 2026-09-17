import api from "../api/axios";
import { USER_ACCOUNT_STATUS } from "../constants/userAccountStatus";

const mapUser = (user) => ({
  id: user.id,
  employeeId: user.employee_id,
  email: user.email,
  firstName: user.first_name,
  lastName: user.last_name,
  name: `${user.first_name || ""} ${user.last_name || ""}`.trim() || "-",
  phone: user.phone || "",
  alternatePhone: user.alternate_phone || "",
  designation: user.designation || "",
  branch: user.branch || "",
  region: user.region || "",
  role: user.role,
  status: user.status || USER_ACCOUNT_STATUS.ACTIVE,
  lastLoginAt: user.last_login_at,
  mustChangePassword: user.must_change_password,
  temporaryPasswordExpiresAt: user.temporary_password_expires_at,
  passwordChangedAt: user.password_changed_at,
  credentialsEmailStatus: user.credentials_email_status,
  credentialsEmailSentAt: user.credentials_email_sent_at,
  createdAt: user.created_at,
  updatedAt: user.updated_at,
});

export const getUsers = async (params = {}) => {
  const res = await api.get("/v1/users", { params });
  return {
    users: (res.data.users || []).map(mapUser),
    pagination: res.data.pagination || { page: 1, pageSize: 10, totalRecords: 0, totalPages: 1 },
    summary: res.data.summary || { activeAccounts: 0, deactivatedAccounts: 0, totalAccounts: 0 },
  };
};

export const getUserById = async (id) => {
  const res = await api.get(`/v1/users/${id}`);
  return mapUser(res.data.data);
};

export const createUser = async (payload) => {
  const res = await api.post("/v1/users", payload);
  return res.data.data;
};

export const updateUser = async (id, payload) => {
  const res = await api.put(`/v1/users/${id}`, payload);
  return res.data.data;
};

export const deleteUser = async (id) => {
  const res = await api.delete(`/v1/users/${id}`);
  return res.data;
};

export const toggleUserStatus = async (id, status, remarks = "") => {
  // backend expects { status, remarks }
  const res = await api.patch(`/v1/users/${id}/status`, { status, remarks });
  return res.data.data;
};

export const adminResetPassword = async (id, newPassword) => {
  const res = await api.post(`/v1/users/${id}/reset-password`, { newPassword });
  return res.data;
};

export const resendCredentials = async (id, payload) => {
  const res = await api.post(`/v1/users/${id}/resend-credentials`, payload);
  return res.data;
};
