import api from "../api/axios";

export const DATE_PRESETS = [
  { label: "Today", value: "today" },
  { label: "Yesterday", value: "yesterday" },
  { label: "Last 7 days", value: "last7" },
  { label: "Last 30 days", value: "last30" },
  { label: "This month", value: "thisMonth" },
  { label: "Last month", value: "lastMonth" },
  { label: "This quarter", value: "thisQuarter" },
  { label: "This year", value: "thisYear" },
  { label: "Custom", value: "custom" },
];

export const GROUP_OPTIONS = [
  { label: "Day", value: "day" },
  { label: "Week", value: "week" },
  { label: "Month", value: "month" },
];

export const getDashboardAnalytics = async (filters = {}) => {
  const params = {
    preset: filters.preset || "last30",
    groupBy: filters.groupBy || "day",
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
  };

  if (params.preset === "custom") {
    params.startDate = filters.startDate;
    params.endDate = filters.endDate;
  }

  const res = await api.get("/v1/dashboard/analytics", { params });
  return res.data.data;
};

export const getFinanceHeadDashboard = async (filters = {}) => {
  const params = {
    preset: filters.preset || "last30",
    groupBy: filters.groupBy || "day",
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
  };

  if (params.preset === "custom") {
    params.startDate = filters.startDate;
    params.endDate = filters.endDate;
  }

  const res = await api.get("/v1/dashboard/finance-head", { params });
  return res.data.data;
};

export const getMyDashboard = async (filters = {}) => {
  const params = {
    preset: filters.preset || "last30",
    groupBy: filters.groupBy || "day",
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
  };

  if (params.preset === "custom") {
    params.startDate = filters.startDate;
    params.endDate = filters.endDate;
  }

  const res = await api.get("/v1/dashboard/me", { params });
  return res.data.data;
};
