import prisma from '../../config/prisma.js';
import { EXPORT_LIMIT, DEFAULT_PAGE_SIZE } from './report.constants.js';
import {
  VENDOR_APPROVAL_STATUS,
  VENDOR_STATUS,
  normalizeVendorStatusFilter,
} from '../vendors/vendor.constants.js';

const approvedActiveVendorWhere = {
  status: VENDOR_STATUS.ACTIVE,
  approval_status: VENDOR_APPROVAL_STATUS.APPROVED,
  is_active: true,
};

// ─── Shared date range WHERE helper ──────────────────────────────────────────

/**
 * Build a Prisma date-range filter clause.
 * End date is extended to end-of-day (23:59:59.999 UTC).
 */
const buildDateRange = (field, startDate, endDate) => {
  if (!startDate && !endDate) return {};
  const clause = {};
  if (startDate) clause.gte = new Date(startDate);
  if (endDate) {
    const end = new Date(endDate);
    end.setUTCHours(23, 59, 59, 999);
    clause.lte = end;
  }
  return { [field]: clause };
};

// ─── ReportService ────────────────────────────────────────────────────────────

class ReportService {
  // ──────────────────────────────────────────────────────────────────────────
  // VENDOR REPORT
  // ──────────────────────────────────────────────────────────────────────────

  /**
   * List vendors with filters, pagination, and sorting.
   * SUPER_ADMIN sees ALL vendors (no created_by_id scoping).
   */
  async getVendorReport(query) {
    const page  = Number(query.page  || 1);
    const limit = Number(query.limit || DEFAULT_PAGE_SIZE);
    const skip  = (page - 1) * limit;

    const where = {
      deleted_at: null,
      ...buildDateRange('created_at', query.startDate, query.endDate),
      ...(query.status && (normalizeVendorStatusFilter(query.status) || { status: query.status })),
      ...(query.category && { category: query.category }),
      ...(query.createdById && { created_by_id: query.createdById }),
      ...(query.search && {
        OR: [
          { name:        { contains: query.search, mode: 'insensitive' } },
          { vendor_code: { contains: query.search, mode: 'insensitive' } },
          { email:       { contains: query.search, mode: 'insensitive' } },
          { contact_person: { contains: query.search, mode: 'insensitive' } },
        ],
      }),
    };

    const sortField = query.sortField || 'created_at';
    const sortOrder = query.sortOrder || 'desc';

    const [vendors, total] = await Promise.all([
      prisma.vendor.findMany({
        where,
        skip,
        take: limit,
        orderBy: { [sortField]: sortOrder },
        select: {
          id:             true,
          vendor_code:    true,
          name:           true,
          email:          true,
          phone:          true,
          category:       true,
          contact_person: true,
          tax_id:         true,
          status:         true,
          is_active:      true,
          city:           true,
          state:          true,
          payment_terms:  true,
          created_at:     true,
          approved_at:    true,
          rejected_at:    true,
          blocked_at:     true,
          created_by: {
            select: { id: true, first_name: true, last_name: true, email: true, role: true },
          },
          approved_by: {
            select: { id: true, first_name: true, last_name: true, email: true, role: true },
          },
          _count: {
            select: { purchase_orders: true, invoices: true },
          },
        },
      }),
      prisma.vendor.count({ where }),
    ]);

    return {
      vendors,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  /**
   * Aggregate summary cards for the Vendor Report.
   * All calculations happen at the DB level.
   */
  async getVendorReportSummary(query) {
    const dateFilter = buildDateRange('created_at', query.startDate, query.endDate);
    const baseWhere  = { deleted_at: null };

    const [
      totalAll,
      totalInPeriod,
      activeCount,
      pendingCount,
      rejectedCount,
      blockedCount,
    ] = await Promise.all([
      prisma.vendor.count({ where: baseWhere }),
      prisma.vendor.count({ where: { ...baseWhere, ...dateFilter } }),
      prisma.vendor.count({ where: { ...baseWhere, ...approvedActiveVendorWhere } }),
      prisma.vendor.count({ where: { ...baseWhere, status: VENDOR_STATUS.PENDING } }),
      prisma.vendor.count({ where: { ...baseWhere, status: VENDOR_STATUS.INACTIVE, approval_status: VENDOR_APPROVAL_STATUS.REJECTED } }),
      prisma.vendor.count({ where: { ...baseWhere, status: VENDOR_STATUS.BLOCKED } }),
    ]);

    return {
      totalVendors:       totalAll,
      newInPeriod:        totalInPeriod,
      activeVendors:      activeCount,
      pendingVendors:     pendingCount,
      inactiveVendors:    rejectedCount + blockedCount,
      rejectedVendors:    rejectedCount,
      blockedVendors:     blockedCount,
    };
  }

  // ──────────────────────────────────────────────────────────────────────────
  // PURCHASE ORDER REPORT
  // ──────────────────────────────────────────────────────────────────────────

  async getPOReport(query) {
    const page  = Number(query.page  || 1);
    const limit = Number(query.limit || DEFAULT_PAGE_SIZE);
    const skip  = (page - 1) * limit;

    const where = {
      ...buildDateRange('order_date', query.startDate, query.endDate),
      ...(query.status   && { status:    query.status }),
      ...(query.vendorId && { vendor_id: query.vendorId }),
      ...(query.currency && { currency:  query.currency }),
      ...(query.createdById && { created_by_id: query.createdById }),
      ...(query.minAmount !== undefined && { amount: { gte: query.minAmount } }),
      ...(query.maxAmount !== undefined && { amount: { ...( query.minAmount !== undefined ? { gte: query.minAmount } : {}), lte: query.maxAmount } }),
      ...(query.search && {
        OR: [
          { po_number:   { contains: query.search, mode: 'insensitive' } },
          { description: { contains: query.search, mode: 'insensitive' } },
          { vendor:      { name: { contains: query.search, mode: 'insensitive' } } },
        ],
      }),
    };

    // Rebuild amount clause cleanly
    if (query.minAmount !== undefined || query.maxAmount !== undefined) {
      const amountClause = {};
      if (query.minAmount !== undefined) amountClause.gte = query.minAmount;
      if (query.maxAmount !== undefined) amountClause.lte = query.maxAmount;
      where.amount = amountClause;
    }

    const sortField = query.sortField || 'order_date';
    const sortOrder = query.sortOrder || 'desc';

    const [purchaseOrders, total] = await Promise.all([
      prisma.purchaseOrder.findMany({
        where,
        skip,
        take: limit,
        orderBy: { [sortField]: sortOrder },
        select: {
          id:                    true,
          po_number:             true,
          amount:                true,
          currency:              true,
          status:                true,
          description:           true,
          order_date:            true,
          expected_delivery_date: true,
          closed_at:             true,
          cancelled_at:          true,
          created_at:            true,
          updated_at:            true,
          vendor: {
            select: { id: true, vendor_code: true, name: true, category: true },
          },
          created_by: {
            select: { id: true, first_name: true, last_name: true, email: true, role: true },
          },
          _count: {
            select: { invoices: true, payments: true },
          },
        },
      }),
      prisma.purchaseOrder.count({ where }),
    ]);

    return {
      purchaseOrders,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  async getPOReportSummary(query) {
    const where = {
      ...buildDateRange('order_date', query.startDate, query.endDate),
    };

    const [
      totalCount,
      aggregates,
      openAgg,
      pendingAgg,
      closedCount,
      cancelledCount,
    ] = await Promise.all([
      prisma.purchaseOrder.count({ where }),
      prisma.purchaseOrder.aggregate({ where, _sum: { amount: true }, _avg: { amount: true } }),
      prisma.purchaseOrder.aggregate({ where: { ...where, status: 'open' },    _sum: { amount: true } }),
      prisma.purchaseOrder.aggregate({ where: { ...where, status: 'pending' }, _sum: { amount: true } }),
      prisma.purchaseOrder.count({ where: { ...where, status: 'closed' } }),
      prisma.purchaseOrder.count({ where: { ...where, status: 'cancelled' } }),
    ]);

    return {
      totalPurchaseOrders:  totalCount,
      totalPOValue:         Number(aggregates._sum.amount || 0).toFixed(2),
      openPOValue:          Number(openAgg._sum.amount    || 0).toFixed(2),
      pendingPOValue:       Number(pendingAgg._sum.amount || 0).toFixed(2),
      completedPOs:         closedCount,
      cancelledPOs:         cancelledCount,
      averagePOValue:       Number(aggregates._avg.amount || 0).toFixed(2),
    };
  }

  // ──────────────────────────────────────────────────────────────────────────
  // INVOICE REPORT
  // ──────────────────────────────────────────────────────────────────────────

  async getInvoiceReport(query) {
    const page  = Number(query.page  || 1);
    const limit = Number(query.limit || DEFAULT_PAGE_SIZE);
    const skip  = (page - 1) * limit;

    const now = new Date();
    const where = {
      deleted_at: null,
      ...buildDateRange('invoice_date', query.startDate, query.endDate),
      ...(query.status        && { status:         query.status }),
      ...(query.paymentStatus && { payment_status: query.paymentStatus }),
      ...(query.vendorId      && { vendor_id:       query.vendorId }),
      ...(query.poId          && { purchase_order_id: query.poId }),
      ...(query.createdById   && { created_by_id:   query.createdById }),
      ...(query.overdueOnly   && { due_date: { lt: now }, payment_status: { not: 'PAID' } }),
    };

    if (query.minAmount !== undefined || query.maxAmount !== undefined) {
      const amountClause = {};
      if (query.minAmount !== undefined) amountClause.gte = query.minAmount;
      if (query.maxAmount !== undefined) amountClause.lte = query.maxAmount;
      where.invoice_total = amountClause;
    }

    if (query.search) {
      where.OR = [
        { invoice_number: { contains: query.search, mode: 'insensitive' } },
        { vendor:         { name: { contains: query.search, mode: 'insensitive' } } },
        { purchase_order: { po_number: { contains: query.search, mode: 'insensitive' } } },
      ];
    }

    const sortField = query.sortField || 'invoice_date';
    const sortOrder = query.sortOrder || 'desc';

    const [invoices, total] = await Promise.all([
      prisma.invoice.findMany({
        where,
        skip,
        take: limit,
        orderBy: { [sortField]: sortOrder },
        select: {
          id:                 true,
          invoice_number:     true,
          amount:             true,
          currency:           true,
          invoice_total:      true,
          paid_amount:        true,
          remaining_amount:   true,
          status:             true,
          payment_status:     true,
          invoice_date:       true,
          due_date:           true,
          final_approved_at:  true,
          rejected_at:        true,
          cancelled_at:       true,
          rejection_reason:   true,
          created_at:         true,
          updated_at:         true,
          vendor: {
            select: { id: true, vendor_code: true, name: true },
          },
          purchase_order: {
            select: { id: true, po_number: true },
          },
          created_by: {
            select: { id: true, first_name: true, last_name: true, email: true, role: true },
          },
          finance_head_approver: {
            select: { id: true, first_name: true, last_name: true, email: true, role: true },
          },
          rejected_by: {
            select: { id: true, first_name: true, last_name: true, email: true, role: true },
          },
        },
      }),
      prisma.invoice.count({ where }),
    ]);

    return {
      invoices,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  async getInvoiceReportSummary(query) {
    const now = new Date();
    const where = {
      deleted_at: null,
      ...buildDateRange('invoice_date', query.startDate, query.endDate),
    };

    const [
      totalCount,
      totalAgg,
      approvedAgg,
      paidAgg,
      remainingAgg,
      rejectedCount,
      overdueCount,
    ] = await Promise.all([
      prisma.invoice.count({ where }),
      prisma.invoice.aggregate({ where, _sum: { invoice_total: true } }),
      prisma.invoice.aggregate({ where: { ...where, status: 'APPROVED' }, _sum: { invoice_total: true } }),
      prisma.invoice.aggregate({ where, _sum: { paid_amount: true } }),
      prisma.invoice.aggregate({ where, _sum: { remaining_amount: true } }),
      prisma.invoice.count({ where: { ...where, status: 'REJECTED' } }),
      prisma.invoice.count({ where: { ...where, due_date: { lt: now }, payment_status: { not: 'PAID' } } }),
    ]);

    // Pending = all non-terminal statuses
    const pendingStatuses = [
      'PENDING_THREE_WAY_MATCH', 'PENDING_ADMIN_REVIEW',
      'PENDING_TEAM_LEAD', 'PENDING_MANAGER', 'PENDING_FINANCE_HEAD',
      'DRAFT', 'SUBMITTED',
    ];
    const pendingAgg = await prisma.invoice.aggregate({
      where: { ...where, status: { in: pendingStatuses } },
      _sum:  { invoice_total: true },
    });

    return {
      totalInvoices:       totalCount,
      totalInvoicedAmount: Number(totalAgg._sum.invoice_total   || 0).toFixed(2),
      approvedAmount:      Number(approvedAgg._sum.invoice_total || 0).toFixed(2),
      pendingAmount:       Number(pendingAgg._sum.invoice_total  || 0).toFixed(2),
      totalPaidAmount:     Number(paidAgg._sum.paid_amount       || 0).toFixed(2),
      outstandingAmount:   Number(remainingAgg._sum.remaining_amount || 0).toFixed(2),
      rejectedInvoices:    rejectedCount,
      overdueInvoices:     overdueCount,
    };
  }

  // ──────────────────────────────────────────────────────────────────────────
  // PAYMENT REPORT
  // ──────────────────────────────────────────────────────────────────────────

  async getPaymentReport(query) {
    const page  = Number(query.page  || 1);
    const limit = Number(query.limit || DEFAULT_PAGE_SIZE);
    const skip  = (page - 1) * limit;

    const where = {
      ...buildDateRange('payment_date', query.startDate, query.endDate),
      ...(query.status        && { status:          query.status }),
      ...(query.paymentMethod && { payment_method:  query.paymentMethod }),
      ...(query.vendorId      && { vendor_id:        query.vendorId }),
      ...(query.invoiceId     && { invoice_id:       query.invoiceId }),
      ...(query.poId          && { purchase_order_id: query.poId }),
      ...(query.currency      && { currency:         query.currency }),
      ...(query.processedById && { processed_by_id:  query.processedById }),
    };

    if (query.minAmount !== undefined || query.maxAmount !== undefined) {
      const amountClause = {};
      if (query.minAmount !== undefined) amountClause.gte = query.minAmount;
      if (query.maxAmount !== undefined) amountClause.lte = query.maxAmount;
      where.amount = amountClause;
    }

    if (query.search) {
      where.OR = [
        { payment_number:          { contains: query.search, mode: 'insensitive' } },
        { provider_transaction_id: { contains: query.search, mode: 'insensitive' } },
        { gateway_reference:       { contains: query.search, mode: 'insensitive' } },
        { vendor:   { name: { contains: query.search, mode: 'insensitive' } } },
        { invoice:  { invoice_number: { contains: query.search, mode: 'insensitive' } } },
      ];
    }

    const sortField = query.sortField || 'payment_date';
    const sortOrder = query.sortOrder || 'desc';

    const [payments, total] = await Promise.all([
      prisma.payment.findMany({
        where,
        skip,
        take: limit,
        orderBy: { [sortField]: sortOrder },
        select: {
          id:                     true,
          payment_number:         true,
          amount:                 true,
          currency:               true,
          status:                 true,
          payment_method:         true,
          payment_type:           true,
          payment_provider:       true,
          provider_transaction_id: true,
          gateway_reference:      true,
          gateway_status:         true,
          response_message:       true,
          payment_date:           true,
          due_date:               true,
          remarks:                true,
          created_at:             true,
          updated_at:             true,
          vendor: {
            select: { id: true, vendor_code: true, name: true },
          },
          invoice: {
            select: { id: true, invoice_number: true },
          },
          purchase_order: {
            select: { id: true, po_number: true },
          },
          created_by: {
            select: { id: true, first_name: true, last_name: true, email: true, role: true },
          },
          processed_by: {
            select: { id: true, first_name: true, last_name: true, email: true, role: true },
          },
          approved_by: {
            select: { id: true, first_name: true, last_name: true, email: true, role: true },
          },
        },
      }),
      prisma.payment.count({ where }),
    ]);

    return {
      payments,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  async getPaymentReportSummary(query) {
    const where = {
      ...buildDateRange('payment_date', query.startDate, query.endDate),
    };

    const [
      totalCount,
      successAgg,
      pendingAgg,
      failedAgg,
      refundedAgg,
      completedCount,
      pendingCount,
      failedCount,
    ] = await Promise.all([
      prisma.payment.count({ where }),
      prisma.payment.aggregate({ where: { ...where, status: 'SUCCESS' },   _sum: { amount: true } }),
      prisma.payment.aggregate({ where: { ...where, status: 'PENDING' },   _sum: { amount: true } }),
      prisma.payment.aggregate({ where: { ...where, status: 'FAILED' },    _sum: { amount: true } }),
      prisma.payment.aggregate({ where: { ...where, status: 'REFUNDED' },  _sum: { amount: true } }),
      prisma.payment.count({ where: { ...where, status: { in: ['SUCCESS', 'COMPLETED'] } } }),
      prisma.payment.count({ where: { ...where, status: 'PENDING' } }),
      prisma.payment.count({ where: { ...where, status: 'FAILED' } }),
    ]);

    return {
      totalPayments:       totalCount,
      successfulAmount:    Number(successAgg._sum.amount  || 0).toFixed(2),
      pendingAmount:       Number(pendingAgg._sum.amount  || 0).toFixed(2),
      failedAmount:        Number(failedAgg._sum.amount   || 0).toFixed(2),
      refundedAmount:      Number(refundedAgg._sum.amount || 0).toFixed(2),
      completedPayments:   completedCount,
      pendingPayments:     pendingCount,
      failedPayments:      failedCount,
    };
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Fetch single record for read-only detail view
  // ──────────────────────────────────────────────────────────────────────────

  async getVendorReportDetail(id) {
    return prisma.vendor.findFirst({
      where: { id, deleted_at: null },
      select: {
        id: true, vendor_code: true, name: true, email: true, phone: true,
        category: true, contact_person: true, tax_id: true, gst_number: true,
        status: true, is_active: true, city: true, state: true, zip_code: true,
        address: true, payment_terms: true, created_at: true, updated_at: true,
        approved_at: true, rejected_at: true, blocked_at: true,
        created_by: { select: { id: true, first_name: true, last_name: true, email: true, role: true } },
        approved_by: { select: { id: true, first_name: true, last_name: true, email: true, role: true } },
        _count: { select: { purchase_orders: true, invoices: true, payments: true } },
      },
    });
  }

  async getPOReportDetail(id) {
    return prisma.purchaseOrder.findUnique({
      where: { id },
      select: {
        id: true, po_number: true, amount: true, currency: true, status: true,
        description: true, delivery_terms: true, payment_terms: true,
        billing_address: true, delivery_address: true, order_date: true,
        expected_delivery_date: true, closed_at: true, cancelled_at: true,
        created_at: true, updated_at: true, line_items: true,
        vendor: { select: { id: true, vendor_code: true, name: true, category: true } },
        created_by: { select: { id: true, first_name: true, last_name: true, email: true, role: true } },
        _count: { select: { invoices: true, payments: true } },
      },
    });
  }

  async getInvoiceReportDetail(id) {
    return prisma.invoice.findUnique({
      where: { id },
      select: {
        id: true, invoice_number: true, amount: true, currency: true,
        invoice_total: true, paid_amount: true, remaining_amount: true,
        status: true, payment_status: true, required_approval_role: true,
        current_approval_level: true, invoice_date: true, due_date: true,
        description: true, final_approved_at: true, rejected_at: true,
        rejection_reason: true, cancelled_at: true, created_at: true, updated_at: true,
        three_way_match_status: true, three_way_match_percentage: true,
        admin_review_status: true, team_lead_approved_at: true,
        manager_approved_at: true, finance_head_approved_at: true,
        vendor: { select: { id: true, vendor_code: true, name: true, category: true } },
        purchase_order: { select: { id: true, po_number: true, amount: true } },
        created_by: { select: { id: true, first_name: true, last_name: true, email: true, role: true } },
        team_lead_approver: { select: { id: true, first_name: true, last_name: true, email: true } },
        manager_approver: { select: { id: true, first_name: true, last_name: true, email: true } },
        finance_head_approver: { select: { id: true, first_name: true, last_name: true, email: true } },
        rejected_by: { select: { id: true, first_name: true, last_name: true, email: true } },
      },
    });
  }

  async getPaymentReportDetail(id) {
    return prisma.payment.findUnique({
      where: { id },
      select: {
        id: true, payment_number: true, amount: true, currency: true,
        status: true, payment_method: true, payment_type: true,
        payment_provider: true, provider_transaction_id: true,
        gateway_reference: true, gateway_status: true, response_message: true,
        payment_date: true, due_date: true, remarks: true,
        created_at: true, updated_at: true,
        vendor: { select: { id: true, vendor_code: true, name: true } },
        invoice: { select: { id: true, invoice_number: true, invoice_total: true } },
        purchase_order: { select: { id: true, po_number: true } },
        created_by: { select: { id: true, first_name: true, last_name: true, email: true, role: true } },
        processed_by: { select: { id: true, first_name: true, last_name: true, email: true, role: true } },
        approved_by: { select: { id: true, first_name: true, last_name: true, email: true, role: true } },
      },
    });
  }
}

export default new ReportService();
