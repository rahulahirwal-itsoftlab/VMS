import prisma from '../../config/prisma.js';

const paymentInclude = {
  invoice: {
    select: {
      id: true,
      invoice_number: true,
      invoice_date: true,
      amount: true,
      invoice_total: true,
      currency: true,
      status: true,
      payment_status: true,
      paid_amount: true,
      remaining_amount: true,
    },
  },
  vendor: {
    select: {
      id: true,
      name: true,
      vendor_code: true,
      gst_number: true,
      email: true,
    },
  },
  // Include the specific installment this payment is linked to (may be null for ONE_TIME)
  installment: {
    select: {
      id: true,
      installment_number: true,
      amount: true,
      paid_amount: true,
      remaining_amount: true,
      status: true,
      due_date: true,
    },
  },
  // Include the PO with payment_type and the full installments schedule for progress display
  purchase_order: {
    select: {
      id: true,
      po_number: true,
      order_date: true,
      amount: true,
      payment_type: true,
      installments: {
        select: {
          id: true,
          installment_number: true,
          amount: true,
          paid_amount: true,
          remaining_amount: true,
          status: true,
          due_date: true,
        },
        orderBy: { installment_number: 'asc' },
      },
    },
  },
  created_by: {
    select: { id: true, email: true, first_name: true, last_name: true, role: true },
  },
  approved_by: {
    select: { id: true, email: true, first_name: true, last_name: true, role: true },
  },
  processed_by: {
    select: { id: true, email: true, first_name: true, last_name: true, role: true },
  },
  updated_by: {
    select: { id: true, email: true, first_name: true, last_name: true, role: true },
  },
};

class PaymentRepository {
  async create(data) {
    return prisma.payment.create({ data, include: paymentInclude });
  }

  async findAll({ where, skip = 0, take = 10 }) {
    const [payments, total] = await Promise.all([
      prisma.payment.findMany({
        where,
        skip: parseInt(skip),
        take: parseInt(take),
        orderBy: { created_at: 'desc' },
        include: paymentInclude,
      }),
      prisma.payment.count({ where }),
    ]);

    return { payments, total };
  }

  /**
   * Return consolidated payment records grouped by invoice / payment plan.
   * For installment POs, all individual installment payment transactions for that invoice
   * are consolidated into ONE master row with full progress and individual transaction history.
   */
  async findConsolidatedPayments({ where, skip = 0, take = 10 }) {
    const allDistinct = await prisma.payment.findMany({
      where,
      distinct: ['invoice_id'],
      select: { invoice_id: true, created_at: true },
      orderBy: { created_at: 'desc' },
    });

    const total = allDistinct.length;
    const pagedDistinct = allDistinct.slice(parseInt(skip), parseInt(skip) + parseInt(take));
    const invoiceIds = pagedDistinct.map((d) => d.invoice_id).filter(Boolean);

    if (invoiceIds.length === 0) {
      return { payments: [], total: 0 };
    }

    const payments = await prisma.payment.findMany({
      where: { invoice_id: { in: invoiceIds } },
      orderBy: { created_at: 'desc' },
      include: paymentInclude,
    });

    const paymentsByInvoice = new Map();
    for (const id of invoiceIds) {
      paymentsByInvoice.set(id, []);
    }
    for (const payment of payments) {
      const list = paymentsByInvoice.get(payment.invoice_id);
      if (list) {
        list.push(payment);
      }
    }

    const consolidated = [];
    for (const id of invoiceIds) {
      const invoicePayments = paymentsByInvoice.get(id);
      if (!invoicePayments || invoicePayments.length === 0) continue;

      const latestPayment = invoicePayments[0];
      const po = latestPayment.purchase_order;
      const inv = latestPayment.invoice;
      const isInstallment = po?.payment_type === 'INSTALLMENT' || latestPayment.payment_type === 'INSTALLMENT';

      if (!isInstallment) {
        consolidated.push({
          ...latestPayment,
          transactions: invoicePayments,
        });
      } else {
        const poInstallments = po?.installments || [];
        const sortedPoInsts = [...poInstallments].sort((a, b) => a.installment_number - b.installment_number);
        const totalInsts = sortedPoInsts.length;
        const paidInsts = sortedPoInsts.filter((i) => i.status === 'PAID' || Number(i.remaining_amount) <= 0.01).length;
        const remInsts = Math.max(0, totalInsts - paidInsts);
        const totalPoAmt = Math.round(Number(inv?.invoice_total || po?.amount || 0) * 100) / 100;
        const totalPaidAmt = Math.round(Number(inv?.paid_amount ?? invoicePayments.reduce((s, p) => s + Number(p.amount || 0), 0)) * 100) / 100;
        const totalRemAmt = Math.max(0, Math.round((totalPoAmt - totalPaidAmt) * 100) / 100);

        const isFullyPaid = remInsts === 0 && totalRemAmt <= 0.01;
        const overallStatus = isFullyPaid ? 'SUCCESS' : (totalPaidAmt > 0 ? 'PARTIALLY_PAID' : 'PENDING');

        consolidated.push({
          ...latestPayment,
          amount: totalPoAmt,
          consolidatedTotalAmount: totalPoAmt,
          consolidatedPaidAmount: totalPaidAmt,
          consolidatedRemainingAmount: totalRemAmt,
          status: overallStatus,
          payment_status: inv?.payment_status || (isFullyPaid ? 'PAID' : (totalPaidAmt > 0 ? 'PARTIALLY_PAID' : 'UNPAID')),
          transactions: invoicePayments,
        });
      }
    }

    return { payments: consolidated, total };
  }

  async findById(id) {
    return prisma.payment.findUnique({
      where: { id },
      include: paymentInclude,
    });
  }

  async update(id, data) {
    return prisma.payment.update({
      where: { id },
      data,
      include: paymentInclude,
    });
  }

  async delete(id) {
    return prisma.payment.delete({
      where: { id },
      include: paymentInclude,
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

export default new PaymentRepository();
