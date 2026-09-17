import prisma from '../../config/prisma.js';

const poInclude = {
  vendor: true,
  grns: {
    where: { deleted_at: null },
    include: {
      items: { orderBy: { created_at: 'asc' } },
      delivery_challan: {
        include: {
          items: { orderBy: { created_at: 'asc' } },
        },
      },
    },
    orderBy: { created_at: 'desc' },
    take: 5,
  },
  delivery_challans: {
    where: { deleted_at: null },
    include: {
      items: { orderBy: { created_at: 'asc' } },
    },
    orderBy: { created_at: 'desc' },
    take: 5,
  },
  invoices: { where: { deleted_at: null }, select: { id: true, invoice_number: true, amount: true, status: true } },
  installments: { orderBy: { installment_number: 'asc' } },
  created_by: {
    select: { id: true, email: true, first_name: true, last_name: true, role: true },
  },
};

class PurchaseOrderRepository {
  async create(data) {
    return prisma.purchaseOrder.create({ data, include: poInclude });
  }

  async findAll({ where, skip, take }) {
    const [purchaseOrders, total, aggregate, availableCount] = await Promise.all([
      prisma.purchaseOrder.findMany({
        where,
        skip,
        take,
        orderBy: { created_at: 'desc' },
        include: poInclude,
      }),
      prisma.purchaseOrder.count({ where }),
      prisma.purchaseOrder.aggregate({
        where,
        _sum: { amount: true },
      }),
      prisma.purchaseOrder.count({
        where: {
          ...where,
          status: { not: 'cancelled' },
        },
      }),
    ]);

    return {
      purchaseOrders,
      total,
      totalValue: Number(aggregate._sum.amount || 0),
      availableCount,
    };
  }

  async findById(id) {
    return prisma.purchaseOrder.findUnique({
      where: { id },
      include: poInclude,
    });
  }

  async update(id, data) {
    return prisma.purchaseOrder.update({
      where: { id },
      data,
      include: poInclude,
    });
  }

  async transaction(callback, options = {}) {
    return prisma.$transaction(callback, {
      maxWait: 10000,
      timeout: 30000,
      ...options,
    });
  }
}

export default new PurchaseOrderRepository();
