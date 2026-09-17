import prisma from './src/config/prisma.js';

async function check() {
  try {
    const allApprovals = await prisma.paymentApproval.findMany({
      select: {
        id: true,
        amount: true,
        status: true,
        required_role: true,
        approver_id: true,
        requested_at: true,
        invoice: { select: { invoice_number: true, status: true } },
      },
    });
    console.log('ALL PAYMENT APPROVALS IN DB:', JSON.stringify(allApprovals, null, 2));

    const pendingInvoices = await prisma.invoice.findMany({
      where: { deleted_at: null, status: { in: ['PENDING_MANAGER', 'PENDING_THREE_WAY_MATCH', 'SUBMITTED', 'PENDING_TEAM_LEAD', 'PENDING_FINANCE_HEAD'] } },
      select: { id: true, invoice_number: true, invoice_total: true, status: true, required_approval_role: true },
    });
    console.log('PENDING INVOICES IN DB:', JSON.stringify(pendingInvoices, null, 2));
  } catch (err) {
    console.error('Error:', err);
  } finally {
    await prisma.$disconnect();
    process.exit(0);
  }
}

check();
