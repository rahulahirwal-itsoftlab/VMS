import api from "../api/axios";

export const NOTIFICATIONS_CHANGED_EVENT = "vms:notifications-changed";

const mapNotification = (n) => ({
  id: n.id,
  userId: n.user_id,
  title: n.title,
  message: n.message,
  type: n.type,
  role: n.role,
  referenceId: n.reference_id,
  entityType: n.entity_type,
  entityId: n.entity_id,
  isRead: n.is_read,
  readAt: n.read_at,
  createdAt: n.created_at,
});

export const emitNotificationsChanged = () => {
  window.dispatchEvent(new Event(NOTIFICATIONS_CHANGED_EVENT));
};

export const getNotifications = async (params = {}) => {
  const res = await api.get("/v1/notifications", { params });
  return {
    notifications: (res.data.notifications || []).map(mapNotification),
    total: res.data.total || 0,
    unreadCount: res.data.unreadCount || 0,
    page: res.data.page || 1,
    limit: res.data.limit || 20,
    totalPages: res.data.totalPages || 1,
  };
};

export const getUnreadCount = async () => {
  const res = await api.get("/v1/notifications/unread-count");
  return res.data.unreadCount || 0;
};

export const getNotification = async (id) => {
  const res = await api.get(`/v1/notifications/${id}`);
  return mapNotification(res.data.notification || res.data.data);
};

export const markAllRead = async () => {
  const res = await api.patch("/v1/notifications/read-all");
  emitNotificationsChanged();
  return res.data;
};

export const markRead = async (id) => {
  const res = await api.patch(`/v1/notifications/${id}/read`);
  emitNotificationsChanged();
  return res.data;
};

export const deleteNotification = async (id) => {
  const res = await api.delete(`/v1/notifications/${id}`);
  emitNotificationsChanged();
  return res.data;
};
