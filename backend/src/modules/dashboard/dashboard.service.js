import dashboardRepository from "./dashboard.repository.js";
import ApiError from "../../utils/ApiError.js";

const PRESETS = new Set([
  "today",
  "yesterday",
  "last7",
  "last30",
  "thisMonth",
  "lastMonth",
  "thisQuarter",
  "thisYear",
]);

const GROUP_BY = new Set(["day", "week", "month"]);

const startOfDay = (date) =>
  new Date(date.getFullYear(), date.getMonth(), date.getDate(), 0, 0, 0, 0);
const endOfDay = (date) =>
  new Date(
    date.getFullYear(),
    date.getMonth(),
    date.getDate(),
    23,
    59,
    59,
    999,
  );
const addDays = (date, days) =>
  new Date(date.getFullYear(), date.getMonth(), date.getDate() + days);
const startOfMonth = (date) =>
  new Date(date.getFullYear(), date.getMonth(), 1, 0, 0, 0, 0);
const endOfMonth = (date) =>
  new Date(date.getFullYear(), date.getMonth() + 1, 0, 23, 59, 59, 999);
const startOfQuarter = (date) =>
  new Date(
    date.getFullYear(),
    Math.floor(date.getMonth() / 3) * 3,
    1,
    0,
    0,
    0,
    0,
  );
const parseDateOnly = (value) => {
  if (!value) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value))) {
    throw new ApiError(400, "Dates must use YYYY-MM-DD format.");
  }

  const date = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime())) {
    throw new ApiError(400, "Invalid dashboard date filter.");
  }

  return date;
};

function resolveDateRange(query = {}) {
  const now = new Date();
  const preset = query.preset || "last30";

  if (preset === "custom") {
    const start = parseDateOnly(query.startDate);
    const end = parseDateOnly(query.endDate);
    if (!start || !end) {
      throw new ApiError(
        400,
        "Custom dashboard range requires startDate and endDate.",
      );
    }

    const startDate = startOfDay(start);
    const endDate = endOfDay(end);
    if (startDate > endDate) {
      throw new ApiError(400, "Dashboard start date must be before end date.");
    }

    return { preset, startDate, endDate };
  }

  if (!PRESETS.has(preset)) {
    throw new ApiError(400, "Unsupported dashboard date preset.");
  }

  if (preset === "today")
    return { preset, startDate: startOfDay(now), endDate: endOfDay(now) };
  if (preset === "yesterday") {
    const yesterday = addDays(now, -1);
    return {
      preset,
      startDate: startOfDay(yesterday),
      endDate: endOfDay(yesterday),
    };
  }
  if (preset === "last7")
    return {
      preset,
      startDate: startOfDay(addDays(now, -6)),
      endDate: endOfDay(now),
    };
  if (preset === "last30")
    return {
      preset,
      startDate: startOfDay(addDays(now, -29)),
      endDate: endOfDay(now),
    };
  if (preset === "thisMonth")
    return { preset, startDate: startOfMonth(now), endDate: endOfDay(now) };
  if (preset === "lastMonth") {
    const previousMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    return {
      preset,
      startDate: startOfMonth(previousMonth),
      endDate: endOfMonth(previousMonth),
    };
  }
  if (preset === "thisQuarter")
    return { preset, startDate: startOfQuarter(now), endDate: endOfDay(now) };
  if (preset === "thisYear")
    return {
      preset,
      startDate: new Date(now.getFullYear(), 0, 1, 0, 0, 0, 0),
      endDate: endOfDay(now),
    };

  return {
    preset: "last30",
    startDate: startOfDay(addDays(now, -29)),
    endDate: endOfDay(now),
  };
}

class DashboardService {
  parseAnalyticsFilters(query = {}) {
    const range = resolveDateRange(query);
    const groupBy = GROUP_BY.has(query.groupBy) ? query.groupBy : "day";
    const timezone = query.timezone || "UTC";

    return {
      ...range,
      groupBy,
      timezone,
    };
  }

  async getAnalyticsDashboard(query = {}) {
    const filters = this.parseAnalyticsFilters(query);

    const [
      users,
      vendors,
      purchaseOrders,
      invoices,
      payments,
      threeWayMatching,
      revenueTrend,
      vendorGrowth,
      purchaseOrderTrend,
      topVendors,
      recentActivity,
    ] = await Promise.all([
      dashboardRepository.getUserAnalytics(filters),
      dashboardRepository.getVendorAnalytics(filters),
      dashboardRepository.getPurchaseOrderAnalytics(filters),
      dashboardRepository.getInvoiceAnalytics(filters),
      dashboardRepository.getPaymentAnalytics(filters),
      dashboardRepository.getThreeWayMatchStats(),
      dashboardRepository.getRevenueTrend(filters),
      dashboardRepository.getVendorGrowthTrend(filters),
      dashboardRepository.getPurchaseOrderTrend(filters),
      dashboardRepository.getTopVendorsByRevenue(filters, 5),
      dashboardRepository.getRecentActivityInRange(filters, 8),
    ]);

    return {
      filters: {
        preset: filters.preset,
        groupBy: filters.groupBy,
        timezone: filters.timezone,
        startDate: filters.startDate.toISOString(),
        endDate: filters.endDate.toISOString(),
      },
      summary: {
        users,
        vendors,
        purchaseOrders,
        invoices,
        payments,
        threeWayMatching,
        revenue: {
          recognized: payments.recognizedRevenue,
          pendingAmount: payments.pendingAmount,
          failedAmount: payments.failedAmount,
        },
      },
      trends: {
        revenue: revenueTrend,
        vendorGrowth,
        purchaseOrders: purchaseOrderTrend,
      },
      charts: {
        invoiceStatusDistribution: invoices.statusDistribution,
        paymentStatusDistribution: payments.statusDistribution,
      },
      topVendors,
      recentActivity,
    };
  }

  /**
   * Get full system-wide dashboard metrics (SUPER_ADMIN only).
   */
  async getOverviewDashboard() {
    const [
      vendors,
      purchaseOrders,
      invoices,
      payments,
      threeWayMatching,
      recentActivity,
    ] = await Promise.all([
      dashboardRepository.getVendorStats(),
      dashboardRepository.getPurchaseOrderStats(),
      dashboardRepository.getInvoiceStats(),
      dashboardRepository.getPaymentStats(),
      dashboardRepository.getThreeWayMatchStats(),
      dashboardRepository.getRecentActivity(10),
    ]);

    return {
      vendors,
      purchaseOrders,
      invoices,
      payments,
      threeWayMatching,
      recentActivity,
    };
  }

  /**
   * Get role-specific dashboard for logged-in user.
   * Returns role-relevant metrics + overall summary.
   */
  async getRoleDashboard(user, query = {}) {
    if (user.role === "CASE_MANAGER") {
      const filters = this.parseAnalyticsFilters(query);
      return dashboardRepository.getCaseManagerDashboard(user.id, filters);
    }

    if (user.role === "MANAGER") {
      const filters = this.parseAnalyticsFilters(query);
      return dashboardRepository.getManagerDashboard(user.id, filters);
    }

    const [
      vendors,
      purchaseOrders,
      invoices,
      payments,
      threeWayMatching,
      recentActivity,
      pendingCounts,
    ] = await Promise.all([
      dashboardRepository.getVendorStats(),
      dashboardRepository.getPurchaseOrderStats(),
      dashboardRepository.getInvoiceStats(),
      dashboardRepository.getPaymentStats(),
      dashboardRepository.getThreeWayMatchStats(),
      dashboardRepository.getRecentActivity(5),
      dashboardRepository.getPendingCountsForRole(user.role, user.id),
    ]);

    return {
      summary: {
        vendors,
        purchaseOrders,
        invoices,
        payments,
        threeWayMatching,
      },
      pendingActions: pendingCounts,
      recentActivity,
    };
  }

  /**
   * Finance Head Observation Dashboard.
   * Comprehensive view of invoice observations with workflow tracking.
   */
  async getFinanceHeadObservationDashboard() {
    const stats = await dashboardRepository.getFinanceHeadObservationStats();
    return stats;
  }

  async getFinanceHeadDashboard(query = {}) {
    const filters = this.parseAnalyticsFilters(query);
    const [vendorReview, payments, employees, paymentTrend, recentActivity] =
      await Promise.all([
        dashboardRepository.getFinanceHeadVendorReviewAnalytics(filters),
        dashboardRepository.getFinanceHeadPaymentAnalytics(filters),
        dashboardRepository.getFinanceHeadManagedEmployeeAnalytics(filters),
        dashboardRepository.getFinanceHeadPaymentTrend(filters),
        dashboardRepository.getFinanceHeadRecentActivity(filters, 8),
      ]);

    return {
      filters: {
        preset: filters.preset,
        groupBy: filters.groupBy,
        timezone: filters.timezone,
        startDate: filters.startDate.toISOString(),
        endDate: filters.endDate.toISOString(),
      },
      summary: {
        vendorReview,
        payments,
        employees,
      },
      charts: {
        vendorReviewStatusDistribution: vendorReview.statusDistribution,
        employeeStatusDistribution: employees.statusDistribution,
      },
      trends: {
        highValuePayments: paymentTrend,
      },
      recentActivity,
    };
  }
}

export default new DashboardService();
