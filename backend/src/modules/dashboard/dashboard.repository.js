import prisma from "../../config/prisma.js";
import {
  INVOICE_APPROVAL_LIMITS,
  INVOICE_STATUS,
} from "../../utils/approval-helper.js";
import {
  VENDOR_APPROVAL_STATUS,
  VENDOR_STATUS,
} from "../vendors/vendor.constants.js";

const SUCCESS_PAYMENT_STATUSES = ["SUCCESS", "success"];
const COMPLETED_PAYMENT_STATUSES = [
  "COMPLETED",
  "completed",
  ...SUCCESS_PAYMENT_STATUSES,
];
const PENDING_PAYMENT_STATUSES = ["PENDING", "pending"];
const FAILED_PAYMENT_STATUSES = ["FAILED", "failed"];
const APPROVED_INVOICE_STATUSES = ["APPROVED", "approved"];
const REJECTED_INVOICE_STATUSES = ["REJECTED", "rejected"];
const CANCELLED_INVOICE_STATUSES = ["CANCELLED", "cancelled"];
const ACTIVE_USER_STATUS = "ACTIVE";
const DEACTIVATED_USER_STATUS = "DEACTIVATED";
const FINANCE_HEAD_MANAGED_ROLES = ["MANAGER", "TEAM_LEAD", "CASE_MANAGER"];
const TEAM_LEAD_PAYMENT_APPROVAL_MAX = Number(
  process.env.TEAM_LEAD_PAYMENT_APPROVAL_MAX ||
    process.env.PAYMENT_TEAM_LEAD_APPROVAL_MAX ||
    10000,
);
const FINANCE_HEAD_PAYMENT_APPROVAL_THRESHOLD = Number(
  process.env.FINANCE_HEAD_PAYMENT_APPROVAL_THRESHOLD || 100000,
);
const FINANCE_HEAD_INVOICE_APPROVAL_THRESHOLD =
  INVOICE_APPROVAL_LIMITS.FINANCE_HEAD_MIN;
const approvedActiveVendorWhere = {
  status: VENDOR_STATUS.ACTIVE,
  approval_status: VENDOR_APPROVAL_STATUS.APPROVED,
  is_active: true,
};

const toNumber = (value) => Number(value || 0);
const managerPaymentApprovalWhere = (extra = {}) => ({
  status: "PENDING",
  amount: {
    gt: TEAM_LEAD_PAYMENT_APPROVAL_MAX,
    lt: FINANCE_HEAD_PAYMENT_APPROVAL_THRESHOLD,
  },
  ...extra,
});

const dateRangeWhere = (field, filters) => {
  if (!filters?.startDate || !filters?.endDate) return {};
  return {
    [field]: {
      gte: filters.startDate,
      lte: filters.endDate,
    },
  };
};

const dateTruncUnit = (groupBy) => {
  if (groupBy === "week") return "week";
  if (groupBy === "month") return "month";
  return "day";
};

class DashboardRepository {
  async getUserAnalytics(filters = {}) {
    const createdAtRange = dateRangeWhere("created_at", filters);
    const [total, active, deactivated, deleted, newInPeriod] =
      await Promise.all([
        prisma.user.count({ where: { deleted_at: null } }),
        prisma.user.count({
          where: { deleted_at: null, status: ACTIVE_USER_STATUS },
        }),
        prisma.user.count({
          where: { deleted_at: null, status: DEACTIVATED_USER_STATUS },
        }),
        prisma.user.count({ where: { deleted_at: { not: null } } }),
        prisma.user.count({ where: { deleted_at: null, ...createdAtRange } }),
      ]);

    return { total, active, deactivated, deleted, newInPeriod };
  }

  async getVendorAnalytics(filters = {}) {
    const createdAtRange = dateRangeWhere("created_at", filters);
    const [total, pending, approved, rejected, blocked, newInPeriod] =
      await Promise.all([
        prisma.vendor.count({ where: { deleted_at: null } }),
        prisma.vendor.count({
          where: { deleted_at: null, status: VENDOR_STATUS.PENDING },
        }),
        prisma.vendor.count({
          where: { deleted_at: null, ...approvedActiveVendorWhere },
        }),
        prisma.vendor.count({
          where: {
            deleted_at: null,
            status: VENDOR_STATUS.INACTIVE,
            approval_status: VENDOR_APPROVAL_STATUS.REJECTED,
          },
        }),
        prisma.vendor.count({
          where: { deleted_at: null, status: VENDOR_STATUS.BLOCKED },
        }),
        prisma.vendor.count({ where: { deleted_at: null, ...createdAtRange } }),
      ]);

    return {
      total,
      pending,
      approved,
      active: approved,
      rejected,
      blocked,
      newInPeriod,
    };
  }

  async getPurchaseOrderAnalytics(filters = {}) {
    const createdAtRange = dateRangeWhere("created_at", filters);
    const [total, pending, open, closed, cancelled, value, newInPeriod] =
      await Promise.all([
        prisma.purchaseOrder.count({ where: createdAtRange }),
        prisma.purchaseOrder.count({
          where: { status: "pending", ...createdAtRange },
        }),
        prisma.purchaseOrder.count({
          where: { status: "open", ...createdAtRange },
        }),
        prisma.purchaseOrder.count({
          where: { status: "closed", ...createdAtRange },
        }),
        prisma.purchaseOrder.count({
          where: { status: "cancelled", ...createdAtRange },
        }),
        prisma.purchaseOrder.aggregate({
          where: createdAtRange,
          _sum: { amount: true },
        }),
        prisma.purchaseOrder.count({ where: createdAtRange }),
      ]);

    return {
      total,
      pending,
      open,
      closed,
      completed: closed,
      cancelled,
      totalValue: toNumber(value._sum.amount),
      newInPeriod,
    };
  }

  async getInvoiceAnalytics(filters = {}) {
    const invoiceDateRange = dateRangeWhere("invoice_date", filters);
    const nonDeleted = { deleted_at: null, ...invoiceDateRange };
    const pendingWhere = {
      deleted_at: null,
      status: {
        notIn: [
          ...APPROVED_INVOICE_STATUSES,
          ...REJECTED_INVOICE_STATUSES,
          ...CANCELLED_INVOICE_STATUSES,
        ],
      },
      ...invoiceDateRange,
    };

    const [
      total,
      totalValue,
      approved,
      rejected,
      cancelled,
      pending,
      paid,
      outstanding,
      overdue,
    ] = await Promise.all([
      prisma.invoice.count({ where: nonDeleted }),
      prisma.invoice.aggregate({
        where: nonDeleted,
        _sum: { invoice_total: true },
      }),
      prisma.invoice.count({
        where: {
          deleted_at: null,
          status: { in: APPROVED_INVOICE_STATUSES },
          ...invoiceDateRange,
        },
      }),
      prisma.invoice.count({
        where: {
          deleted_at: null,
          status: { in: REJECTED_INVOICE_STATUSES },
          ...invoiceDateRange,
        },
      }),
      prisma.invoice.count({
        where: {
          deleted_at: null,
          status: { in: CANCELLED_INVOICE_STATUSES },
          ...invoiceDateRange,
        },
      }),
      prisma.invoice.count({ where: pendingWhere }),
      prisma.invoice.count({
        where: {
          deleted_at: null,
          payment_status: { in: ["PAID", "paid"] },
          ...invoiceDateRange,
        },
      }),
      prisma.invoice.aggregate({
        where: nonDeleted,
        _sum: { remaining_amount: true },
      }),
      prisma.invoice.aggregate({
        where: {
          deleted_at: null,
          due_date: { lt: new Date() },
          remaining_amount: { gt: 0 },
          ...invoiceDateRange,
        },
        _sum: { remaining_amount: true },
      }),
    ]);

    return {
      total,
      totalValue: toNumber(totalValue._sum.invoice_total),
      approved,
      rejected,
      cancelled,
      pending,
      paid,
      outstandingAmount: toNumber(outstanding._sum.remaining_amount),
      overdueAmount: toNumber(overdue._sum.remaining_amount),
      statusDistribution: [
        { name: "Approved", value: approved },
        { name: "Pending", value: pending },
        { name: "Rejected", value: rejected },
        { name: "Cancelled", value: cancelled },
      ],
    };
  }

  async getPaymentAnalytics(filters = {}) {
    const createdAtRange = dateRangeWhere("created_at", filters);
    const [
      total,
      success,
      pending,
      failed,
      successAmount,
      pendingAmount,
      failedAmount,
    ] = await Promise.all([
      prisma.payment.count({ where: createdAtRange }),
      prisma.payment.count({
        where: { status: { in: SUCCESS_PAYMENT_STATUSES }, ...createdAtRange },
      }),
      prisma.payment.count({
        where: { status: { in: PENDING_PAYMENT_STATUSES }, ...createdAtRange },
      }),
      prisma.payment.count({
        where: { status: { in: FAILED_PAYMENT_STATUSES }, ...createdAtRange },
      }),
      prisma.payment.aggregate({
        where: { status: { in: SUCCESS_PAYMENT_STATUSES }, ...createdAtRange },
        _sum: { amount: true },
      }),
      prisma.payment.aggregate({
        where: { status: { in: PENDING_PAYMENT_STATUSES }, ...createdAtRange },
        _sum: { amount: true },
      }),
      prisma.payment.aggregate({
        where: { status: { in: FAILED_PAYMENT_STATUSES }, ...createdAtRange },
        _sum: { amount: true },
      }),
    ]);

    return {
      total,
      success,
      pending,
      failed,
      successfulAmount: toNumber(successAmount._sum.amount),
      pendingAmount: toNumber(pendingAmount._sum.amount),
      failedAmount: toNumber(failedAmount._sum.amount),
      recognizedRevenue: toNumber(successAmount._sum.amount),
      statusDistribution: [
        { name: "Successful", value: success },
        { name: "Pending", value: pending },
        { name: "Failed", value: failed },
      ],
    };
  }

  async getRevenueTrend(filters = {}) {
    const unit = dateTruncUnit(filters.groupBy);
    const rows = await prisma.$queryRawUnsafe(
      `
        SELECT
          date_trunc('${unit}', COALESCE(payment_date, created_at)) AS period,
          SUM(amount)::numeric AS value,
          COUNT(id)::int AS count
        FROM payments
        WHERE status IN ('SUCCESS', 'success')
          AND COALESCE(payment_date, created_at) >= $1
          AND COALESCE(payment_date, created_at) <= $2
        GROUP BY period
        ORDER BY period ASC
      `,
      filters.startDate,
      filters.endDate,
    );

    return rows.map((row) => ({
      period: row.period,
      label: new Date(row.period).toISOString().slice(0, 10),
      value: toNumber(row.value),
      count: toNumber(row.count),
    }));
  }

  async getVendorGrowthTrend(filters = {}) {
    const unit = dateTruncUnit(filters.groupBy);
    const rows = await prisma.$queryRawUnsafe(
      `
        SELECT
          date_trunc('${unit}', created_at) AS period,
          COUNT(id)::int AS value
        FROM vendors
        WHERE deleted_at IS NULL
          AND created_at >= $1
          AND created_at <= $2
        GROUP BY period
        ORDER BY period ASC
      `,
      filters.startDate,
      filters.endDate,
    );

    return rows.map((row) => ({
      period: row.period,
      label: new Date(row.period).toISOString().slice(0, 10),
      value: toNumber(row.value),
    }));
  }

  async getPurchaseOrderTrend(filters = {}) {
    const unit = dateTruncUnit(filters.groupBy);
    const rows = await prisma.$queryRawUnsafe(
      `
        SELECT
          date_trunc('${unit}', created_at) AS period,
          COUNT(id)::int AS count,
          SUM(amount)::numeric AS value
        FROM purchase_orders
        WHERE created_at >= $1
          AND created_at <= $2
        GROUP BY period
        ORDER BY period ASC
      `,
      filters.startDate,
      filters.endDate,
    );

    return rows.map((row) => ({
      period: row.period,
      label: new Date(row.period).toISOString().slice(0, 10),
      count: toNumber(row.count),
      value: toNumber(row.value),
    }));
  }

  async getTopVendorsByRevenue(filters = {}, limit = 8) {
    const rows = await prisma.$queryRawUnsafe(
      `
        SELECT
          v.id,
          v.name,
          v.vendor_code,
          v.category,
          v.approval_status,
          v.status                                                              AS vendor_status,
          COALESCE(SUM(p.amount) FILTER (WHERE p.status IN ('SUCCESS','success')),0)::numeric AS revenue,
          COUNT(DISTINCT p.id)  FILTER (WHERE p.status IN ('SUCCESS','success'))::int         AS payment_count,
          COUNT(DISTINCT po.id)::int                                            AS po_count,
          COALESCE(SUM(po.amount), 0)::numeric                                  AS po_total_value,
          COUNT(DISTINCT inv.id)::int                                            AS invoice_count,
          COALESCE(SUM(inv.amount), 0)::numeric                                 AS invoice_total_value
        FROM vendors v
        LEFT JOIN payments p
          ON p.vendor_id = v.id
          AND COALESCE(p.payment_date, p.created_at) >= $1
          AND COALESCE(p.payment_date, p.created_at) <= $2
        LEFT JOIN purchase_orders po ON po.vendor_id = v.id
        LEFT JOIN invoices inv       ON inv.vendor_id = v.id AND inv.deleted_at IS NULL
        WHERE v.deleted_at IS NULL
        GROUP BY v.id, v.name, v.vendor_code, v.category, v.approval_status, v.status
        ORDER BY revenue DESC, po_total_value DESC, po_count DESC
        LIMIT $3
      `,
      filters.startDate,
      filters.endDate,
      limit,
    );

    return rows.map((row) => ({
      id: row.id,
      name: row.name,
      vendorCode: row.vendor_code,
      category: row.category || "N/A",
      approvalStatus: row.approval_status || "PENDING",
      status: row.vendor_status || "PENDING",
      revenue: toNumber(row.revenue),
      paymentCount: toNumber(row.payment_count),
      poCount: toNumber(row.po_count),
      poTotalValue: toNumber(row.po_total_value),
      invoiceCount: toNumber(row.invoice_count),
      invoiceTotalValue: toNumber(row.invoice_total_value),
    }));
  }

  async getRecentActivityInRange(filters = {}, limit = 8) {
    return prisma.auditLog.findMany({
      where: dateRangeWhere("created_at", filters),
      orderBy: { created_at: "desc" },
      take: limit,
      select: {
        id: true,
        entity_type: true,
        entity_id: true,
        action: true,
        from_status: true,
        to_status: true,
        remarks: true,
        created_at: true,
        performed_by: {
          select: {
            id: true,
            email: true,
            employee_id: true,
            first_name: true,
            last_name: true,
            role: true,
          },
        },
      },
    });
  }

  async getCaseManagerDashboard(userId, filters = {}) {
    const vendorWhere = { deleted_at: null, created_by_id: userId };
    const poWhere = { created_by_id: userId };
    const invoiceWhere = { deleted_at: null, created_by_id: userId };
    const paymentWhere = { created_by_id: userId };

    const [
      totalVendors,
      activeVendors,
      inactiveVendors,
      pendingVendors,
      totalPurchaseOrders,
      pendingPurchaseOrders,
      approvedPurchaseOrders,
      totalInvoices,
      draftInvoices,
      submittedInvoices,
      pendingInvoices,
      approvedInvoices,
      rejectedInvoices,
      totalPayments,
      pendingPayments,
      completedPayments,
      vendorStatus,
      invoiceStatus,
      paymentStatus,
      monthlyVendorRegistration,
      monthlyInvoiceCount,
      monthlyPaymentCount,
      topVendors,
      recentActivity,
      recentNotifications,
      latestVendors,
      latestPurchaseOrders,
      latestInvoices,
      latestPayments,
    ] = await Promise.all([
      prisma.vendor.count({ where: vendorWhere }),
      prisma.vendor.count({
        where: { ...vendorWhere, ...approvedActiveVendorWhere },
      }),
      prisma.vendor.count({
        where: {
          ...vendorWhere,
          OR: [
            { is_active: false },
            { status: { in: [VENDOR_STATUS.BLOCKED, VENDOR_STATUS.INACTIVE] } },
          ],
        },
      }),
      prisma.vendor.count({
        where: { ...vendorWhere, status: VENDOR_STATUS.PENDING },
      }),
      prisma.purchaseOrder.count({ where: poWhere }),
      prisma.purchaseOrder.count({ where: { ...poWhere, status: "pending" } }),
      prisma.purchaseOrder.count({
        where: { ...poWhere, status: { in: ["approved", "open", "closed"] } },
      }),
      prisma.invoice.count({ where: invoiceWhere }),
      prisma.invoice.count({ where: { ...invoiceWhere, status: "DRAFT" } }),
      prisma.invoice.count({
        where: {
          ...invoiceWhere,
          status: {
            in: [
              "SUBMITTED",
              "PENDING_MATCHING",
              "MATCHED",
              "PENDING_APPROVAL",
              "PENDING_APPROVAL_L1",
              "PENDING_APPROVAL_L2",
            ],
          },
        },
      }),
      prisma.invoice.count({
        where: {
          ...invoiceWhere,
          status: {
            notIn: [
              ...APPROVED_INVOICE_STATUSES,
              ...REJECTED_INVOICE_STATUSES,
              ...CANCELLED_INVOICE_STATUSES,
              "DRAFT",
            ],
          },
        },
      }),
      prisma.invoice.count({
        where: { ...invoiceWhere, status: { in: APPROVED_INVOICE_STATUSES } },
      }),
      prisma.invoice.count({
        where: { ...invoiceWhere, status: { in: REJECTED_INVOICE_STATUSES } },
      }),
      prisma.payment.count({ where: paymentWhere }),
      prisma.payment.count({
        where: { ...paymentWhere, status: { in: PENDING_PAYMENT_STATUSES } },
      }),
      prisma.payment.count({
        where: { ...paymentWhere, status: { in: COMPLETED_PAYMENT_STATUSES } },
      }),
      this.groupCaseManagerStatuses(
        "vendors",
        userId,
        "status",
        "created_by_id",
        "deleted_at",
      ),
      this.groupCaseManagerStatuses(
        "invoices",
        userId,
        "status",
        "created_by_id",
        "deleted_at",
      ),
      this.groupCaseManagerStatuses(
        "payments",
        userId,
        "status",
        "created_by_id",
      ),
      this.getCaseManagerMonthlyCount(
        "vendors",
        userId,
        filters,
        "created_at",
        "created_by_id",
        "deleted_at",
      ),
      this.getCaseManagerMonthlyCount(
        "invoices",
        userId,
        filters,
        "created_at",
        "created_by_id",
        "deleted_at",
      ),
      this.getCaseManagerMonthlyCount(
        "payments",
        userId,
        filters,
        "created_at",
        "created_by_id",
      ),
      this.getCaseManagerTopVendors(userId, filters, 5),
      this.getCaseManagerRecentActivity(userId, 8),
      this.getCaseManagerRecentNotifications(userId, 8),
      this.getCaseManagerLatestVendors(userId, 5),
      this.getCaseManagerLatestPurchaseOrders(userId, 5),
      this.getCaseManagerLatestInvoices(userId, 5),
      this.getCaseManagerLatestPayments(userId, 5),
    ]);

    return {
      filters: {
        preset: filters.preset,
        groupBy: filters.groupBy,
        timezone: filters.timezone,
        startDate: filters.startDate?.toISOString(),
        endDate: filters.endDate?.toISOString(),
      },
      cards: {
        totalVendors,
        activeVendors,
        inactiveVendors,
        pendingVendors,
        totalPurchaseOrders,
        pendingPurchaseOrders,
        approvedPurchaseOrders,
        totalInvoices,
        draftInvoices,
        submittedInvoices,
        pendingInvoices,
        approvedInvoices,
        rejectedInvoices,
        totalPayments,
        pendingPayments,
        completedPayments,
      },
      charts: {
        vendorStatus,
        invoiceStatus,
        paymentStatus,
        monthlyVendorRegistration,
        monthlyInvoiceCount,
        monthlyPaymentCount,
        topVendors,
      },
      recentActivity,
      recentNotifications,
      tables: {
        latestVendors,
        latestPurchaseOrders,
        latestInvoices,
        latestPayments,
      },
    };
  }

  async groupCaseManagerStatuses(
    tableName,
    userId,
    statusColumn,
    ownerColumn,
    deletedColumn = null,
  ) {
    const deletedClause = deletedColumn ? `AND ${deletedColumn} IS NULL` : "";
    const rows = await prisma.$queryRawUnsafe(
      `
        SELECT ${statusColumn} AS name, COUNT(id)::int AS value
        FROM ${tableName}
        WHERE ${ownerColumn} = $1
          ${deletedClause}
        GROUP BY ${statusColumn}
        ORDER BY value DESC
      `,
      userId,
    );

    return rows.map((row) => ({
      name: row.name || "Unknown",
      value: toNumber(row.value),
    }));
  }

  async getCaseManagerMonthlyCount(
    tableName,
    userId,
    filters = {},
    dateColumn = "created_at",
    ownerColumn = "created_by_id",
    deletedColumn = null,
  ) {
    const unit = dateTruncUnit(filters.groupBy);
    const deletedClause = deletedColumn ? `AND ${deletedColumn} IS NULL` : "";
    const rows = await prisma.$queryRawUnsafe(
      `
        SELECT date_trunc('${unit}', ${dateColumn}) AS period, COUNT(id)::int AS value
        FROM ${tableName}
        WHERE ${ownerColumn} = $1
          AND ${dateColumn} >= $2
          AND ${dateColumn} <= $3
          ${deletedClause}
        GROUP BY period
        ORDER BY period ASC
      `,
      userId,
      filters.startDate,
      filters.endDate,
    );

    return rows.map((row) => ({
      period: row.period,
      label: new Date(row.period).toISOString().slice(0, 10),
      value: toNumber(row.value),
    }));
  }

  async getCaseManagerTopVendors(userId, filters = {}, limit = 5) {
    const rows = await prisma.$queryRawUnsafe(
      `
        SELECT
          v.id,
          v.name,
          v.vendor_code,
          COALESCE(SUM(p.amount), 0)::numeric AS value,
          COUNT(p.id)::int AS count
        FROM vendors v
        LEFT JOIN payments p ON p.vendor_id = v.id
          AND p.created_at >= $2
          AND p.created_at <= $3
        WHERE v.created_by_id = $1
          AND v.deleted_at IS NULL
        GROUP BY v.id, v.name, v.vendor_code
        ORDER BY value DESC, count DESC, v.created_at DESC
        LIMIT $4
      `,
      userId,
      filters.startDate,
      filters.endDate,
      limit,
    );

    return rows.map((row) => ({
      id: row.id,
      name: row.name,
      vendorCode: row.vendor_code,
      value: toNumber(row.value),
      count: toNumber(row.count),
    }));
  }

  async getCaseManagerRecentActivity(userId, limit = 8) {
    return prisma.auditLog.findMany({
      where: {
        performed_by_id: userId,
        entity_type: { in: ["vendor", "purchase_order", "invoice", "payment"] },
      },
      orderBy: { created_at: "desc" },
      take: limit,
      select: {
        id: true,
        entity_type: true,
        action: true,
        created_at: true,
        performed_by: {
          select: {
            id: true,
            first_name: true,
            last_name: true,
            email: true,
            role: true,
          },
        },
      },
    });
  }

  async getCaseManagerRecentNotifications(userId, limit = 8) {
    return prisma.notification.findMany({
      where: { user_id: userId },
      orderBy: { created_at: "desc" },
      take: limit,
      select: {
        id: true,
        title: true,
        message: true,
        type: true,
        entity_type: true,
        entity_id: true,
        is_read: true,
        created_at: true,
      },
    });
  }

  async getCaseManagerLatestVendors(userId, limit = 5) {
    return prisma.vendor.findMany({
      where: { created_by_id: userId, deleted_at: null },
      orderBy: { created_at: "desc" },
      take: limit,
      select: {
        id: true,
        name: true,
        vendor_code: true,
        status: true,
        email: true,
        created_at: true,
      },
    });
  }

  async getCaseManagerLatestPurchaseOrders(userId, limit = 5) {
    return prisma.purchaseOrder.findMany({
      where: { created_by_id: userId },
      orderBy: { created_at: "desc" },
      take: limit,
      select: {
        id: true,
        po_number: true,
        amount: true,
        currency: true,
        status: true,
        created_at: true,
        vendor: { select: { name: true, vendor_code: true } },
      },
    });
  }

  async getCaseManagerLatestInvoices(userId, limit = 5) {
    return prisma.invoice.findMany({
      where: { created_by_id: userId, deleted_at: null },
      orderBy: { created_at: "desc" },
      take: limit,
      select: {
        id: true,
        invoice_number: true,
        amount: true,
        currency: true,
        status: true,
        payment_status: true,
        created_at: true,
        vendor: { select: { name: true, vendor_code: true } },
      },
    });
  }

  async getCaseManagerLatestPayments(userId, limit = 5) {
    return prisma.payment.findMany({
      where: { created_by_id: userId },
      orderBy: { created_at: "desc" },
      take: limit,
      select: {
        id: true,
        payment_number: true,
        amount: true,
        currency: true,
        status: true,
        created_at: true,
        vendor: { select: { name: true, vendor_code: true } },
        invoice: { select: { invoice_number: true } },
      },
    });
  }

  async getManagerDashboard(userId, filters = {}) {
    const now = new Date();
    const startOfToday = new Date(now);
    startOfToday.setHours(0, 0, 0, 0);

    const startOfWeek = new Date(startOfToday);
    startOfWeek.setDate(startOfToday.getDate() - startOfToday.getDay());

    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    const managerScopeWhere = {
      OR: [
        { approver_id: userId },
        { required_role: "MANAGER" },
        {
          amount: {
            gt: TEAM_LEAD_PAYMENT_APPROVAL_MAX,
            lt: FINANCE_HEAD_PAYMENT_APPROVAL_THRESHOLD,
          },
        },
      ],
    };

    // 1. Pending PaymentApproval & Invoice records
    const [pendingPAList, pendingInvoicesList] = await Promise.all([
      prisma.paymentApproval.findMany({
        where: {
          ...managerScopeWhere,
          status: "PENDING",
        },
        orderBy: { requested_at: "desc" },
        include: {
          payment: { select: { payment_number: true } },
          invoice: {
            select: {
              id: true,
              invoice_number: true,
              three_way_match_status: true,
            },
          },
          purchase_order: { select: { po_number: true } },
          vendor: { select: { name: true, vendor_code: true } },
          requested_by: {
            select: {
              first_name: true,
              last_name: true,
              email: true,
              role: true,
            },
          },
        },
      }),
      prisma.invoice.findMany({
        where: {
          deleted_at: null,
          status: "PENDING_MANAGER",
        },
        orderBy: { created_at: "desc" },
        include: {
          purchase_order: { select: { po_number: true } },
          vendor: { select: { name: true, vendor_code: true } },
          created_by: {
            select: {
              first_name: true,
              last_name: true,
              email: true,
              role: true,
            },
          },
        },
      }),
    ]);

    const paInvoiceIds = new Set(
      pendingPAList.map((pa) => pa.invoice_id).filter(Boolean),
    );
    const uniquePendingInvoices = pendingInvoicesList.filter(
      (inv) => !paInvoiceIds.has(inv.id),
    );

    const pendingCount = pendingPAList.length + uniquePendingInvoices.length;
    const pendingAmount =
      pendingPAList.reduce((acc, item) => acc + toNumber(item.amount), 0) +
      uniquePendingInvoices.reduce(
        (acc, item) => acc + toNumber(item.invoice_total || item.amount),
        0,
      );

    // 2. Approved PaymentApproval & Invoice records
    const [approvedPAList, approvedInvoicesList] = await Promise.all([
      prisma.paymentApproval.findMany({
        where: {
          OR: [
            { approved_by_id: userId },
            { ...managerScopeWhere, status: "APPROVED" },
          ],
        },
        select: { id: true, amount: true, invoice_id: true },
      }),
      prisma.invoice.findMany({
        where: {
          deleted_at: null,
          manager_approver_id: userId,
          status: { in: ["APPROVED", "PAID", "approved", "paid"] },
        },
        select: { id: true, invoice_total: true, amount: true },
      }),
    ]);

    const approvedPAIds = new Set(
      approvedPAList.map((a) => a.invoice_id).filter(Boolean),
    );
    const uniqueApprovedInvoices = approvedInvoicesList.filter(
      (inv) => !approvedPAIds.has(inv.id),
    );

    const approvedCount = approvedPAList.length + uniqueApprovedInvoices.length;
    const approvedAmount =
      approvedPAList.reduce((acc, item) => acc + toNumber(item.amount), 0) +
      uniqueApprovedInvoices.reduce(
        (acc, item) => acc + toNumber(item.invoice_total || item.amount),
        0,
      );

    // 3. Rejected PaymentApproval & Invoice records
    const [rejectedPAList, rejectedInvoicesList] = await Promise.all([
      prisma.paymentApproval.findMany({
        where: {
          OR: [
            { rejected_by_id: userId },
            { ...managerScopeWhere, status: "REJECTED" },
          ],
        },
        select: { id: true, amount: true, invoice_id: true },
      }),
      prisma.invoice.findMany({
        where: {
          deleted_at: null,
          rejected_by_id: userId,
          status: { in: ["REJECTED", "rejected"] },
        },
        select: { id: true, invoice_total: true, amount: true },
      }),
    ]);

    const rejectedPAIds = new Set(
      rejectedPAList.map((r) => r.invoice_id).filter(Boolean),
    );
    const uniqueRejectedInvoices = rejectedInvoicesList.filter(
      (inv) => !rejectedPAIds.has(inv.id),
    );

    const rejectedCount = rejectedPAList.length + uniqueRejectedInvoices.length;
    const rejectedAmount =
      rejectedPAList.reduce((acc, item) => acc + toNumber(item.amount), 0) +
      uniqueRejectedInvoices.reduce(
        (acc, item) => acc + toNumber(item.invoice_total || item.amount),
        0,
      );

    // 4. Requests created Today, Week, Month
    const [todaysPAList, todaysInvoicesList] = await Promise.all([
      prisma.paymentApproval.findMany({
        where: { ...managerScopeWhere, requested_at: { gte: startOfToday } },
        select: { id: true, amount: true, invoice_id: true },
      }),
      prisma.invoice.findMany({
        where: {
          deleted_at: null,
          status: "PENDING_MANAGER",
          created_at: { gte: startOfToday },
        },
        select: { id: true, invoice_total: true, amount: true },
      }),
    ]);

    const todaysPAIds = new Set(
      todaysPAList.map((t) => t.invoice_id).filter(Boolean),
    );
    const uniqueTodaysInvoices = todaysInvoicesList.filter(
      (inv) => !todaysPAIds.has(inv.id),
    );
    const todayCount = todaysPAList.length + uniqueTodaysInvoices.length;
    const todayAmount =
      todaysPAList.reduce((acc, item) => acc + toNumber(item.amount), 0) +
      uniqueTodaysInvoices.reduce(
        (acc, item) => acc + toNumber(item.invoice_total || item.amount),
        0,
      );

    const [weeksPAList, weeksInvoicesList] = await Promise.all([
      prisma.paymentApproval.findMany({
        where: { ...managerScopeWhere, requested_at: { gte: startOfWeek } },
        select: { id: true, amount: true, invoice_id: true },
      }),
      prisma.invoice.findMany({
        where: {
          deleted_at: null,
          status: "PENDING_MANAGER",
          created_at: { gte: startOfWeek },
        },
        select: { id: true, invoice_total: true, amount: true },
      }),
    ]);

    const weeksPAIds = new Set(
      weeksPAList.map((w) => w.invoice_id).filter(Boolean),
    );
    const uniqueWeeksInvoices = weeksInvoicesList.filter(
      (inv) => !weeksPAIds.has(inv.id),
    );
    const weekCount = weeksPAList.length + uniqueWeeksInvoices.length;
    const weekAmount =
      weeksPAList.reduce((acc, item) => acc + toNumber(item.amount), 0) +
      uniqueWeeksInvoices.reduce(
        (acc, item) => acc + toNumber(item.invoice_total || item.amount),
        0,
      );

    const [monthsPAList, monthsInvoicesList] = await Promise.all([
      prisma.paymentApproval.findMany({
        where: { ...managerScopeWhere, requested_at: { gte: startOfMonth } },
        select: { id: true, amount: true, invoice_id: true },
      }),
      prisma.invoice.findMany({
        where: {
          deleted_at: null,
          status: "PENDING_MANAGER",
          created_at: { gte: startOfMonth },
        },
        select: { id: true, invoice_total: true, amount: true },
      }),
    ]);

    const monthsPAIds = new Set(
      monthsPAList.map((m) => m.invoice_id).filter(Boolean),
    );
    const uniqueMonthsInvoices = monthsInvoicesList.filter(
      (inv) => !monthsPAIds.has(inv.id),
    );
    const monthCount = monthsPAList.length + uniqueMonthsInvoices.length;
    const monthAmount =
      monthsPAList.reduce((acc, item) => acc + toNumber(item.amount), 0) +
      uniqueMonthsInvoices.reduce(
        (acc, item) => acc + toNumber(item.invoice_total || item.amount),
        0,
      );

    // Combine Assigned Payment Approvals List
    const combinedPaymentApprovals = [
      ...pendingPAList.map((approval) => ({
        id: approval.id,
        paymentNumber:
          approval.payment?.payment_number ||
          (approval.invoice?.invoice_number
            ? `PMT-${approval.invoice.invoice_number}`
            : `PA-${approval.id.slice(0, 8)}`),
        invoiceNumber: approval.invoice?.invoice_number || null,
        purchaseOrderNumber: approval.purchase_order?.po_number || null,
        vendorName: approval.vendor?.name || null,
        vendorCode: approval.vendor?.vendor_code || null,
        requestedAmount: toNumber(approval.amount),
        currency: approval.currency || "INR",
        requestedBy: approval.requested_by
          ? `${approval.requested_by.first_name || ""} ${approval.requested_by.last_name || ""}`.trim() ||
            approval.requested_by.email
          : "System",
        requestDate: approval.requested_at,
        currentStatus: approval.status,
        priority: "Normal",
        matchingResult: approval.invoice?.three_way_match_status || null,
      })),
      ...uniquePendingInvoices.map((inv) => ({
        id: inv.id,
        paymentNumber: `PMT-${inv.invoice_number}`,
        invoiceNumber: inv.invoice_number,
        purchaseOrderNumber: inv.purchase_order?.po_number || null,
        vendorName: inv.vendor?.name || null,
        vendorCode: inv.vendor?.vendor_code || null,
        requestedAmount: toNumber(inv.invoice_total || inv.amount),
        currency: inv.currency || "INR",
        requestedBy: inv.created_by
          ? `${inv.created_by.first_name || ""} ${inv.created_by.last_name || ""}`.trim() ||
            inv.created_by.email
          : "System",
        requestDate: inv.created_at,
        currentStatus: inv.status,
        priority: "Normal",
        matchingResult: inv.three_way_match_status || null,
      })),
    ];

    // History & notifications
    const [approvalHistory, notifications] = await Promise.all([
      prisma.paymentApprovalHistory.findMany({
        where: {
          OR: [
            { performed_by_id: userId },
            { payment_approval: managerScopeWhere },
          ],
        },
        orderBy: { created_at: "desc" },
        take: 10,
        include: {
          performed_by: {
            select: {
              first_name: true,
              last_name: true,
              email: true,
              role: true,
            },
          },
        },
      }),
      prisma.notification.findMany({
        where: { user_id: userId },
        orderBy: { created_at: "desc" },
        take: 8,
      }),
    ]);

    return {
      role: "MANAGER",
      approvalLimits: {
        teamLeadMax: TEAM_LEAD_PAYMENT_APPROVAL_MAX,
        managerMin: TEAM_LEAD_PAYMENT_APPROVAL_MAX + 1,
        managerMax: FINANCE_HEAD_PAYMENT_APPROVAL_THRESHOLD - 1,
        financeHeadMin: FINANCE_HEAD_PAYMENT_APPROVAL_THRESHOLD,
      },
      summary: {
        pendingPaymentApprovals: pendingCount,
        pendingAmount,
        approvedPayments: approvedCount,
        approvedAmount,
        rejectedPayments: rejectedCount,
        rejectedAmount,
        todaysRequests: todayCount,
        todayAmount,
        weeksRequests: weekCount,
        weekAmount,
        monthsRequests: monthCount,
        monthAmount,
      },
      pendingApprovals: { count: pendingCount, amount: pendingAmount },
      approvedPayments: { count: approvedCount, amount: approvedAmount },
      rejectedPayments: { count: rejectedCount, amount: rejectedAmount },
      todayRequests: { count: todayCount, amount: todayAmount },
      thisWeekRequests: { count: weekCount, amount: weekAmount },
      thisMonthRequests: { count: monthCount, amount: monthAmount },
      paymentApprovals: combinedPaymentApprovals.slice(0, 10),
      approvalHistory: approvalHistory.map((h) => ({
        id: h.id,
        action: h.action,
        remarks: h.remarks || "No remarks",
        created_at: h.created_at,
        performed_by: h.performed_by,
      })),
      notifications,
    };
  }

  async getFinanceHeadVendorReviewAnalytics(filters = {}) {
    const createdAtRange = dateRangeWhere("created_at", filters);
    const [
      pending,
      onHold,
      approved,
      rejected,
      approvedInPeriod,
      rejectedInPeriod,
    ] = await Promise.all([
      prisma.vendor.count({
        where: { deleted_at: null, status: VENDOR_STATUS.PENDING },
      }),
      prisma.vendor.count({
        where: { deleted_at: null, status: VENDOR_STATUS.BLOCKED },
      }),
      prisma.vendor.count({
        where: { deleted_at: null, ...approvedActiveVendorWhere },
      }),
      prisma.vendor.count({
        where: {
          deleted_at: null,
          status: VENDOR_STATUS.INACTIVE,
          approval_status: VENDOR_APPROVAL_STATUS.REJECTED,
        },
      }),
      prisma.vendor.count({
        where: {
          deleted_at: null,
          ...approvedActiveVendorWhere,
          ...createdAtRange,
        },
      }),
      prisma.vendor.count({
        where: {
          deleted_at: null,
          status: VENDOR_STATUS.INACTIVE,
          approval_status: VENDOR_APPROVAL_STATUS.REJECTED,
          ...createdAtRange,
        },
      }),
    ]);

    return {
      pending,
      onHold,
      approved,
      rejected,
      approvedInPeriod,
      rejectedInPeriod,
      statusDistribution: [
        { name: "Pending Review", value: pending },
        { name: "On Hold", value: onHold },
        { name: "Approved", value: approved },
        { name: "Rejected", value: rejected },
      ],
    };
  }

  async getFinanceHeadPaymentAnalytics(filters = {}) {
    const createdAtRange = dateRangeWhere("created_at", filters);
    const highValueWhere = {
      currency: "INR",
      amount: { gte: FINANCE_HEAD_PAYMENT_APPROVAL_THRESHOLD },
    };
    const [
      awaitingApproval,
      awaitingAmount,
      highValueCount,
      approvedInPeriod,
      rejectedInPeriod,
      failed,
      scheduled,
    ] = await Promise.all([
      prisma.payment.count({ where: { status: "PENDING", ...highValueWhere } }),
      prisma.payment.aggregate({
        where: { status: "PENDING", ...highValueWhere },
        _sum: { amount: true },
      }),
      prisma.payment.count({ where: highValueWhere }),
      prisma.payment.aggregate({
        where: {
          status: { in: ["INITIATED", "PROCESSING", "SUCCESS"] },
          ...highValueWhere,
          ...createdAtRange,
        },
        _sum: { amount: true },
      }),
      prisma.payment.count({
        where: { status: "FAILED", ...highValueWhere, ...createdAtRange },
      }),
      prisma.payment.count({
        where: { status: "FAILED", ...highValueWhere, ...createdAtRange },
      }),
      prisma.payment.count({
        where: { status: "INITIATED", ...highValueWhere, ...createdAtRange },
      }),
    ]);

    return {
      threshold: FINANCE_HEAD_PAYMENT_APPROVAL_THRESHOLD,
      awaitingApproval,
      awaitingAmount: toNumber(awaitingAmount._sum.amount),
      highValueCount,
      approvedAmountInPeriod: toNumber(approvedInPeriod._sum.amount),
      rejectedInPeriod,
      failed,
      scheduled,
    };
  }

  financeHeadInvoiceApprovalWhere(extra = {}) {
    return {
      deleted_at: null,
      status: INVOICE_STATUS.PENDING_FINANCE_HEAD,
      current_approval_level: "FINANCE_HEAD",
      currency: "INR",
      amount: { gte: FINANCE_HEAD_INVOICE_APPROVAL_THRESHOLD },
      finance_head_approver_id: null,
      cancelled_at: null,
      ...extra,
    };
  }

  async getFinanceHeadInvoiceApprovalAnalytics(filters = {}) {
    const approvedAtRange = dateRangeWhere("finance_head_approved_at", filters);
    const rejectedAtRange = dateRangeWhere("rejected_at", filters);
    const awaitingWhere = this.financeHeadInvoiceApprovalWhere();
    const today = new Date();

    const [
      awaitingApproval,
      thresholdInvoices,
      awaitingAmount,
      approvedInPeriod,
      rejectedInPeriod,
      overdueApproved,
    ] = await Promise.all([
      prisma.invoice.count({ where: awaitingWhere }),
      prisma.invoice.count({
        where: {
          deleted_at: null,
          currency: "INR",
          amount: { gte: FINANCE_HEAD_INVOICE_APPROVAL_THRESHOLD },
          status: {
            notIn: [INVOICE_STATUS.CANCELLED, INVOICE_STATUS.REJECTED],
          },
          cancelled_at: null,
        },
      }),
      prisma.invoice.aggregate({
        where: awaitingWhere,
        _sum: { amount: true, invoice_total: true },
      }),
      prisma.invoice.count({
        where: {
          deleted_at: null,
          currency: "INR",
          amount: { gte: FINANCE_HEAD_INVOICE_APPROVAL_THRESHOLD },
          status: INVOICE_STATUS.APPROVED,
          finance_head_approver_id: { not: null },
          ...approvedAtRange,
        },
      }),
      prisma.invoice.count({
        where: {
          deleted_at: null,
          currency: "INR",
          amount: { gte: FINANCE_HEAD_INVOICE_APPROVAL_THRESHOLD },
          status: INVOICE_STATUS.REJECTED,
          rejected_by_id: { not: null },
          ...rejectedAtRange,
        },
      }),
      prisma.invoice.count({
        where: {
          deleted_at: null,
          currency: "INR",
          amount: { gte: FINANCE_HEAD_INVOICE_APPROVAL_THRESHOLD },
          status: INVOICE_STATUS.APPROVED,
          payment_status: { not: "PAID" },
          due_date: { lt: today },
        },
      }),
    ]);

    return {
      threshold: FINANCE_HEAD_INVOICE_APPROVAL_THRESHOLD,
      awaitingApproval,
      thresholdInvoices,
      awaitingAmount: toNumber(awaitingAmount._sum.amount),
      awaitingInvoiceTotal: toNumber(awaitingAmount._sum.invoice_total),
      approvedInPeriod,
      rejectedInPeriod,
      onHold: 0,
      overdueApproved,
      statusDistribution: [
        { name: "Awaiting Finance Head", value: awaitingApproval },
        { name: "Approved", value: approvedInPeriod },
        { name: "Rejected", value: rejectedInPeriod },
        { name: "Overdue Approved", value: overdueApproved },
      ],
    };
  }

  async getFinanceHeadInvoiceApprovalTrend(filters = {}) {
    const unit = dateTruncUnit(filters.groupBy);
    const rows = await prisma.$queryRawUnsafe(
      `
        SELECT
          date_trunc('${unit}', created_at) AS period,
          SUM(amount)::numeric AS value,
          COUNT(id)::int AS count
        FROM invoices
        WHERE deleted_at IS NULL
          AND status = $1
          AND current_approval_level = 'FINANCE_HEAD'
          AND currency = 'INR'
          AND amount >= $2
          AND finance_head_approver_id IS NULL
          AND cancelled_at IS NULL
          AND created_at >= $3
          AND created_at <= $4
        GROUP BY period
        ORDER BY period ASC
      `,
      INVOICE_STATUS.PENDING_FINANCE_HEAD,
      FINANCE_HEAD_INVOICE_APPROVAL_THRESHOLD,
      filters.startDate,
      filters.endDate,
    );

    return rows.map((row) => ({
      period: row.period,
      label: new Date(row.period).toISOString().slice(0, 10),
      value: toNumber(row.value),
      count: toNumber(row.count),
    }));
  }

  async getFinanceHeadManagedEmployeeAnalytics(filters = {}) {
    const createdAtRange = dateRangeWhere("created_at", filters);
    const scopedRoles = { role: { in: FINANCE_HEAD_MANAGED_ROLES } };
    const [total, active, deactivated, newInPeriod] = await Promise.all([
      prisma.user.count({ where: { deleted_at: null, ...scopedRoles } }),
      prisma.user.count({
        where: { deleted_at: null, status: ACTIVE_USER_STATUS, ...scopedRoles },
      }),
      prisma.user.count({
        where: {
          deleted_at: null,
          status: DEACTIVATED_USER_STATUS,
          ...scopedRoles,
        },
      }),
      prisma.user.count({
        where: { deleted_at: null, ...createdAtRange, ...scopedRoles },
      }),
    ]);

    return {
      total,
      active,
      deactivated,
      newInPeriod,
      statusDistribution: [
        { name: "Active", value: active },
        { name: "Deactivated", value: deactivated },
      ],
    };
  }

  async getFinanceHeadPaymentTrend(filters = {}) {
    const unit = dateTruncUnit(filters.groupBy);
    const rows = await prisma.$queryRawUnsafe(
      `
        SELECT
          date_trunc('${unit}', created_at) AS period,
          SUM(amount)::numeric AS value,
          COUNT(id)::int AS count
        FROM payments
        WHERE currency = 'INR'
          AND amount >= $1
          AND created_at >= $2
          AND created_at <= $3
        GROUP BY period
        ORDER BY period ASC
      `,
      FINANCE_HEAD_PAYMENT_APPROVAL_THRESHOLD,
      filters.startDate,
      filters.endDate,
    );

    return rows.map((row) => ({
      period: row.period,
      label: new Date(row.period).toISOString().slice(0, 10),
      value: toNumber(row.value),
      count: toNumber(row.count),
    }));
  }

  async getFinanceHeadRecentActivity(filters = {}, limit = 8) {
    const actorIds = await this.getFinanceHeadActivityActorIds();
    const managedEmployeeIds = actorIds.managedEmployeeIds;

    return prisma.auditLog.findMany({
      where: {
        ...dateRangeWhere("created_at", filters),
        OR: [
          { performed_by_id: { in: actorIds.actorIds } },
          { entity_type: "user", entity_id: { in: managedEmployeeIds } },
          { entity_type: { in: ["vendor", "payment"] } },
        ],
      },
      orderBy: { created_at: "desc" },
      take: limit,
      select: {
        id: true,
        entity_type: true,
        entity_id: true,
        action: true,
        from_status: true,
        to_status: true,
        remarks: true,
        created_at: true,
        performed_by: {
          select: {
            id: true,
            email: true,
            employee_id: true,
            first_name: true,
            last_name: true,
            role: true,
          },
        },
      },
    });
  }

  async getFinanceHeadActivityActorIds() {
    const users = await prisma.user.findMany({
      where: {
        deleted_at: null,
        role: { in: ["FINANCE_HEAD", ...FINANCE_HEAD_MANAGED_ROLES] },
      },
      select: { id: true, role: true },
    });

    return {
      actorIds: users.map((user) => user.id),
      managedEmployeeIds: users
        .filter((user) => FINANCE_HEAD_MANAGED_ROLES.includes(user.role))
        .map((user) => user.id),
    };
  }

  async getManagedEmployeeIds() {
    const users = await prisma.user.findMany({
      where: { deleted_at: null, role: { in: FINANCE_HEAD_MANAGED_ROLES } },
      select: { id: true },
    });
    return users.map((user) => user.id);
  }

  /**
   * Get vendor counts grouped by status.
   */
  async getVendorStats() {
    const [total, pending, approved, rejected, blocked] = await Promise.all([
      prisma.vendor.count({ where: { deleted_at: null } }),
      prisma.vendor.count({
        where: { deleted_at: null, status: VENDOR_STATUS.PENDING },
      }),
      prisma.vendor.count({
        where: { deleted_at: null, ...approvedActiveVendorWhere },
      }),
      prisma.vendor.count({
        where: {
          deleted_at: null,
          status: VENDOR_STATUS.INACTIVE,
          approval_status: VENDOR_APPROVAL_STATUS.REJECTED,
        },
      }),
      prisma.vendor.count({
        where: { deleted_at: null, status: VENDOR_STATUS.BLOCKED },
      }),
    ]);
    return { total, pending, approved, rejected, blocked };
  }

  /**
   * Get purchase order counts grouped by status + total value.
   */
  async getPurchaseOrderStats() {
    const [total, pending, open, closed, cancelled, totalValue] =
      await Promise.all([
        prisma.purchaseOrder.count(),
        prisma.purchaseOrder.count({ where: { status: "pending" } }),
        prisma.purchaseOrder.count({ where: { status: "open" } }),
        prisma.purchaseOrder.count({ where: { status: "closed" } }),
        prisma.purchaseOrder.count({ where: { status: "cancelled" } }),
        prisma.purchaseOrder.aggregate({ _sum: { amount: true } }),
      ]);
    return {
      total,
      pending,
      open,
      closed,
      cancelled,
      totalValue: Number(totalValue._sum.amount || 0),
    };
  }

  /**
   * Get invoice counts for all workflow stages.
   */
  async getInvoiceStats() {
    const [
      total,
      pendingThreeWayMatch,
      pendingAdminReview,
      pendingTeamLead,
      pendingManager,
      pendingFinanceHead,
      approved,
      rejected,
      cancelled,
      totalInvoiceAmount,
      totalPaidAmount,
      remainingOutstanding,
      partiallyPaidInvoices,
      threeWayMatchMatched,
      threeWayMatchUnmatched,
    ] = await Promise.all([
      prisma.invoice.count({ where: { deleted_at: null } }),
      prisma.invoice.count({
        where: { deleted_at: null, status: "PENDING_THREE_WAY_MATCH" },
      }),
      prisma.invoice.count({
        where: { deleted_at: null, status: "PENDING_ADMIN_REVIEW" },
      }),
      prisma.invoice.count({
        where: { deleted_at: null, status: "PENDING_TEAM_LEAD" },
      }),
      prisma.invoice.count({
        where: { deleted_at: null, status: "PENDING_MANAGER" },
      }),
      prisma.invoice.count({
        where: { deleted_at: null, status: "PENDING_FINANCE_HEAD" },
      }),
      prisma.invoice.count({
        where: { deleted_at: null, status: { in: ["APPROVED", "approved"] } },
      }),
      prisma.invoice.count({
        where: { deleted_at: null, status: { in: ["REJECTED", "rejected"] } },
      }),
      prisma.invoice.count({
        where: { deleted_at: null, status: "CANCELLED" },
      }),
      prisma.invoice.aggregate({ _sum: { invoice_total: true } }),
      prisma.invoice.aggregate({ _sum: { paid_amount: true } }),
      prisma.invoice.aggregate({ _sum: { remaining_amount: true } }),
      prisma.invoice.count({
        where: { deleted_at: null, payment_status: "PARTIALLY_PAID" },
      }),
      prisma.invoice.count({
        where: { deleted_at: null, three_way_match_status: "MATCHED" },
      }),
      prisma.invoice.count({
        where: { deleted_at: null, three_way_match_status: "UNMATCHED" },
      }),
    ]);

    return {
      total,
      byWorkflowStage: {
        pendingThreeWayMatch,
        pendingAdminReview,
        pendingTeamLead,
        pendingManager,
        pendingFinanceHead,
        approved,
        rejected,
        cancelled,
      },
      // Legacy compat
      pending:
        pendingTeamLead +
        pendingManager +
        pendingFinanceHead +
        pendingThreeWayMatch +
        pendingAdminReview,
      approved,
      rejected,
      totalInvoiceAmount: Number(totalInvoiceAmount._sum.invoice_total || 0),
      totalPaidAmount: Number(totalPaidAmount._sum.paid_amount || 0),
      remainingOutstanding: Number(
        remainingOutstanding._sum.remaining_amount || 0,
      ),
      partiallyPaidInvoices,
      threeWayMatching: {
        matched: threeWayMatchMatched,
        unmatched: threeWayMatchUnmatched,
      },
    };
  }

  /**
   * Get payment counts grouped by status.
   */
  async getPaymentStats() {
    const [total, pending, success, failed, cancelled, refunded] =
      await Promise.all([
        prisma.payment.count(),
        prisma.payment.count({
          where: { status: { in: ["pending", "PENDING"] } },
        }),
        prisma.payment.count({
          where: { status: { in: ["success", "SUCCESS"] } },
        }),
        prisma.payment.count({
          where: { status: { in: ["failed", "FAILED"] } },
        }),
        prisma.payment.count({
          where: { status: { in: ["cancelled", "CANCELLED"] } },
        }),
        prisma.payment.count({
          where: { status: { in: ["refunded", "REFUNDED"] } },
        }),
      ]);
    return { total, pending, success, failed, cancelled, refunded };
  }

  /**
   * Get Three-Way Matching statistics.
   */
  async getThreeWayMatchStats() {
    const [total, matched, unmatched, pending, adminPending] =
      await Promise.all([
        prisma.threeWayMatch.count(),
        prisma.threeWayMatch.count({ where: { status: "MATCHED" } }),
        prisma.threeWayMatch.count({ where: { status: "UNMATCHED" } }),
        prisma.threeWayMatch.count({ where: { status: "PENDING" } }),
        prisma.threeWayMatch.count({
          where: { admin_review_status: "PENDING" },
        }),
      ]);
    return { total, matched, unmatched, pending, adminPending };
  }

  /**
   * Get recent audit log activity feed.
   */
  async getRecentActivity(limit = 10) {
    // Try new AuditLog first, fall back to ApprovalLog
    try {
      return await prisma.auditLog.findMany({
        orderBy: { created_at: "desc" },
        take: limit,
        include: {
          performed_by: {
            select: {
              id: true,
              email: true,
              first_name: true,
              last_name: true,
              role: true,
            },
          },
        },
      });
    } catch {
      return prisma.approvalLog.findMany({
        orderBy: { created_at: "desc" },
        take: limit,
        include: {
          performed_by: {
            select: {
              id: true,
              email: true,
              first_name: true,
              last_name: true,
              role: true,
            },
          },
        },
      });
    }
  }

  /**
   * Get pending item counts scoped to a specific user/role.
   * Updated for new role names.
   */
  async getPendingCountsForRole(role, userId) {
    const counts = {};

    if (role === "CASE_MANAGER") {
      const [myVendors, myPOs, myInvoices, myPayments, myPendingMatching] =
        await Promise.all([
          prisma.vendor.count({
            where: {
              created_by_id: userId,
              status: VENDOR_STATUS.PENDING,
              deleted_at: null,
            },
          }),
          prisma.purchaseOrder.count({
            where: { created_by_id: userId, status: "pending" },
          }),
          prisma.invoice.count({
            where: {
              created_by_id: userId,
              deleted_at: null,
              status: { in: ["PENDING_THREE_WAY_MATCH", "pending", "PENDING"] },
            },
          }),
          prisma.payment.count({
            where: { created_by_id: userId, status: "pending" },
          }),
          prisma.invoice.count({
            where: {
              created_by_id: userId,
              deleted_at: null,
              status: "PENDING_THREE_WAY_MATCH",
            },
          }),
        ]);
      counts.myPendingVendors = myVendors;
      counts.myPendingPOs = myPOs;
      counts.myPendingInvoices = myInvoices;
      counts.myPendingPayments = myPayments;
      counts.myPendingMatching = myPendingMatching;
    }

    // Finance Head gets vendor approvals and payment approvals.
    if (role === "FINANCE_HEAD") {
      const [pendingVendors, pendingPayments] = await Promise.all([
        prisma.vendor.count({
          where: { status: VENDOR_STATUS.PENDING, deleted_at: null },
        }),
        prisma.payment.count({ where: { status: "pending" } }),
      ]);
      counts.pendingVendorApprovals = pendingVendors;
      counts.pendingPaymentApprovals = pendingPayments;
    }

    // Team Lead (formerly L1)
    if (role === "TEAM_LEAD") {
      const pendingInvoices = await prisma.invoice.count({
        where: { deleted_at: null, status: "PENDING_TEAM_LEAD" },
      });
      counts.pendingInvoiceApprovals = pendingInvoices;
    }

    // Manager (formerly L2)
    if (role === "MANAGER") {
      const [pendingInvoices, pendingPayments] = await Promise.all([
        prisma.invoice.count({
          where: { deleted_at: null, status: "PENDING_MANAGER" },
        }),
        prisma.payment.count({ where: managerPaymentApprovalWhere() }),
      ]);
      counts.pendingInvoiceApprovals = pendingInvoices;
      counts.pendingPaymentApprovals = pendingPayments;
    }

    // Super Admin gets all pending items
    if (role === "SUPER_ADMIN") {
      const [pendingAdminReview, pendingVendors, pendingPayments] =
        await Promise.all([
          prisma.invoice.count({
            where: { deleted_at: null, status: "PENDING_ADMIN_REVIEW" },
          }),
          prisma.vendor.count({
            where: { status: VENDOR_STATUS.PENDING, deleted_at: null },
          }),
          prisma.payment.count({ where: { status: "pending" } }),
        ]);
      counts.pendingAdminReviewInvoices = pendingAdminReview;
      counts.pendingVendorApprovals = pendingVendors;
      counts.pendingPaymentApprovals = pendingPayments;
    }

    return counts;
  }

  /**
   * Finance Head Observation — Comprehensive overview.
   */
  async getFinanceHeadObservationStats() {
    const [
      totalInvoices,
      pendingByStage,
      approved,
      rejected,
      totalMatchStats,
      recentApprovals,
      paymentsPending,
    ] = await Promise.all([
      prisma.invoice.count({ where: { deleted_at: null } }),
      // Pending by each stage
      Promise.all([
        prisma.invoice.count({
          where: { deleted_at: null, status: "PENDING_THREE_WAY_MATCH" },
        }),
        prisma.invoice.count({
          where: { deleted_at: null, status: "PENDING_ADMIN_REVIEW" },
        }),
        prisma.invoice.count({
          where: { deleted_at: null, status: "PENDING_TEAM_LEAD" },
        }),
        prisma.invoice.count({
          where: { deleted_at: null, status: "PENDING_MANAGER" },
        }),
        prisma.invoice.count({
          where: { deleted_at: null, status: "PENDING_FINANCE_HEAD" },
        }),
      ]),
      prisma.invoice.count({
        where: { deleted_at: null, status: { in: ["APPROVED", "approved"] } },
      }),
      prisma.invoice.count({
        where: { deleted_at: null, status: { in: ["REJECTED", "rejected"] } },
      }),
      prisma.threeWayMatch.groupBy({ by: ["status"], _count: { id: true } }),
      prisma.invoice.findMany({
        where: { deleted_at: null, status: { in: ["APPROVED", "approved"] } },
        orderBy: { final_approved_at: "desc" },
        take: 5,
        include: {
          vendor: { select: { name: true, vendor_code: true } },
        },
      }),
      prisma.payment.count({
        where: { status: { in: ["pending", "PENDING"] } },
      }),
    ]);

    const matchStatMap = {};
    for (const stat of totalMatchStats) {
      matchStatMap[stat.status] = stat._count.id;
    }

    return {
      totalInvoices,
      byStage: {
        pendingThreeWayMatch: pendingByStage[0],
        pendingAdminReview: pendingByStage[1],
        pendingTeamLead: pendingByStage[2],
        pendingManager: pendingByStage[3],
        pendingFinanceHead: pendingByStage[4],
        approved,
        rejected,
      },
      threeWayMatching: {
        matched: matchStatMap["MATCHED"] || 0,
        unmatched: matchStatMap["UNMATCHED"] || 0,
        pending: matchStatMap["PENDING"] || 0,
      },
      recentApprovals,
      paymentsPending,
    };
  }
}

export default new DashboardRepository();
