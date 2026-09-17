import prisma from '../../config/prisma.js';

class MatchingRepository {
  /**
   * Find ThreeWayMatch by ID.
   */
  async findById(id) {
    return prisma.threeWayMatch.findUnique({
      where: { id },
      include: {
        invoice:       { include: { vendor: true, purchase_order: true } },
        purchase_order: { include: { vendor: true } },
        grn:           true,
        delivery_challan: true,
        completed_by:  { select: { id: true, first_name: true, last_name: true, role: true } },
        admin_reviewed_by: { select: { id: true, first_name: true, last_name: true, role: true } },
      },
    });
  }

  /**
   * Find all ThreeWayMatch records for an invoice.
   */
  async findByInvoiceId(invoiceId) {
    return prisma.threeWayMatch.findMany({
      where:   { invoice_id: invoiceId },
      orderBy: { created_at: 'desc' },
      include: {
        completed_by: { select: { id: true, first_name: true, last_name: true } },
        grn:          true,
        delivery_challan: true,
      },
    });
  }

  /**
   * Create a new ThreeWayMatch record.
   */
  async create(data) {
    return prisma.threeWayMatch.create({
      data,
      include: {
        invoice:        { include: { vendor: true, purchase_order: true } },
        purchase_order: true,
        grn:            true,
        delivery_challan: true,
      },
    });
  }

  /**
   * Update a ThreeWayMatch record.
   */
  async update(id, data) {
    return prisma.threeWayMatch.update({
      where: { id },
      data,
      include: {
        invoice:        { include: { vendor: true, purchase_order: true } },
        purchase_order: true,
        grn:            true,
        delivery_challan: true,
      },
    });
  }

  /**
   * Get the latest match for an invoice.
   */
  async findLatestByInvoiceId(invoiceId) {
    return prisma.threeWayMatch.findFirst({
      where:   { invoice_id: invoiceId },
      orderBy: { created_at: 'desc' },
      include: {
        grn:          true,
        delivery_challan: true,
        completed_by: { select: { id: true, first_name: true, last_name: true } },
      },
    });
  }

  /**
   * List all matches with filters and pagination.
   */
  async findAll({ where = {}, skip = 0, take = 20 } = {}) {
    const [matches, total] = await Promise.all([
      prisma.threeWayMatch.findMany({
        where,
        skip,
        take,
        orderBy: { created_at: 'desc' },
        include: {
          invoice:        { select: { id: true, invoice_number: true, amount: true, invoice_total: true, status: true, vendor: { select: { id: true, name: true, vendor_code: true } } } },
          purchase_order: { select: { id: true, po_number: true, amount: true } },
          grn:            { select: { id: true, grn_number: true } },
          delivery_challan: { select: { id: true, delivery_challan_number: true } },
          completed_by:   { select: { id: true, first_name: true, last_name: true } },
        },
      }),
      prisma.threeWayMatch.count({ where }),
    ]);
    return { matches, total };
  }

  /**
   * Transaction wrapper.
   */
  async transaction(fn, options = {}) {
    return prisma.$transaction(fn, {
      maxWait: 10000,
      timeout: 30000,
      ...options,
    });
  }
}

export default new MatchingRepository();
