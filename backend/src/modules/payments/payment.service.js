import ApiError from '../../utils/ApiError.js';
import paymentRepository from './payment.repository.js';
import invoiceRepository from '../invoices/invoice.repository.js';
import approvalRepository from '../approvals/approval.repository.js';
import notificationService from '../notifications/notification.service.js';
import { providerRegistry } from './providers/payment-provider.factory.js';
import { ROLES } from '../../zodSchema/index.js';
import { INVOICE_STATUS } from '../invoices/invoice.service.js';
import prisma from '../../config/prisma.js';
// Lazy-loaded to avoid circular dependency
let _paymentApprovalService = null;
const getPaymentApprovalService = async () => {
  if (!_paymentApprovalService) {
    const mod = await import('../payment-approvals/payment-approval.service.js');
    _paymentApprovalService = mod.default;
  }
  return _paymentApprovalService;
};

export const PAYMENT_STATUS = {
  PENDING: 'PENDING',
  INITIATED: 'INITIATED',
  PROCESSING: 'PROCESSING',
  SUCCESS: 'SUCCESS',
  FAILED: 'FAILED',
  CANCELLED: 'CANCELLED',
  RETURNED: 'RETURNED',
  REFUNDED: 'REFUNDED',
  PARTIALLY_PAID: 'PARTIALLY_PAID',
  COMPLETED: 'COMPLETED',
};

export const THREE_WAY_MATCH_STATUS = {
  PENDING: 'PENDING',
  MATCHED: 'MATCHED',
  MISMATCH: 'MISMATCH',
  FAILED: 'FAILED',
};

// ─── Dynamic Approval Limit Configurations ────────────────────────────────────
// Read limits dynamically from environment variables or system configuration defaults
export const TEAM_LEAD_PAYMENT_APPROVAL_MAX = Number(
  process.env.TEAM_LEAD_PAYMENT_APPROVAL_MAX || process.env.PAYMENT_TEAM_LEAD_APPROVAL_MAX || 10000,
);

export const FINANCE_HEAD_PAYMENT_APPROVAL_THRESHOLD = Number(
  process.env.FINANCE_HEAD_PAYMENT_APPROVAL_THRESHOLD || 100000,
);

/**
 * Determine the required approval role based on amount and currency.
 *
 * Rules:
 * - Currency non-INR -> FINANCE_HEAD
 * - Amount <= 10,000 INR -> TEAM_LEAD
 * - Amount < 100,000 INR -> MANAGER
 * - Amount >= 100,000 INR -> FINANCE_HEAD
 */
export const getRequiredPaymentApprovalRole = (amount, currency = 'INR') => {
  if (String(currency || 'INR').toUpperCase() !== 'INR') {
    return ROLES.FINANCE_HEAD;
  }

  const paymentAmount = Number(amount || 0);
  if (paymentAmount <= TEAM_LEAD_PAYMENT_APPROVAL_MAX) return ROLES.TEAM_LEAD;
  if (paymentAmount < FINANCE_HEAD_PAYMENT_APPROVAL_THRESHOLD) return ROLES.MANAGER;
  return ROLES.FINANCE_HEAD;
};

export const requiresFinanceHeadApproval = (amount, currency = 'INR') =>
  getRequiredPaymentApprovalRole(amount, currency) === ROLES.FINANCE_HEAD;

export const getPaymentApprovalBand = (amount, currency = 'INR') => {
  const role = getRequiredPaymentApprovalRole(amount, currency);
  if (role === ROLES.TEAM_LEAD) return `INR 0-${TEAM_LEAD_PAYMENT_APPROVAL_MAX.toLocaleString('en-IN')}`;
  if (role === ROLES.MANAGER)
    return `INR ${(TEAM_LEAD_PAYMENT_APPROVAL_MAX + 1).toLocaleString('en-IN')}-${(FINANCE_HEAD_PAYMENT_APPROVAL_THRESHOLD - 1).toLocaleString('en-IN')}`;
  return String(currency || 'INR').toUpperCase() === 'INR'
    ? `INR ${FINANCE_HEAD_PAYMENT_APPROVAL_THRESHOLD.toLocaleString('en-IN')}+`
    : 'Non-INR Finance Head review';
};

/**
 * Build Prisma where clause to filter payments assigned to a given approver role.
 */
export const paymentWhereForApprovalRole = (role) => {
  if (role === ROLES.TEAM_LEAD) {
    return {
      currency: 'INR',
      amount: { lte: TEAM_LEAD_PAYMENT_APPROVAL_MAX },
    };
  }
  if (role === ROLES.MANAGER) {
    return {
      currency: 'INR',
      amount: {
        gt: TEAM_LEAD_PAYMENT_APPROVAL_MAX,
        lt: FINANCE_HEAD_PAYMENT_APPROVAL_THRESHOLD,
      },
    };
  }
  if (role === ROLES.FINANCE_HEAD) {
    return {
      OR: [
        { currency: { not: 'INR' } },
        { amount: { gte: FINANCE_HEAD_PAYMENT_APPROVAL_THRESHOLD } },
      ],
    };
  }
  return undefined;
};

/**
 * Decorate payment with structured presentation data required by Task 2.
 */
const decoratePayment = (payment) => {
  if (!payment) return null;
  const amount = Number(payment.amount || 0);
  const currency = payment.currency || 'INR';
  const requiredRole = getRequiredPaymentApprovalRole(amount, currency);
  const priority =
    requiredRole === ROLES.FINANCE_HEAD || amount >= FINANCE_HEAD_PAYMENT_APPROVAL_THRESHOLD ? 'High' : 'Normal';

  const creatorName = payment.created_by
    ? `${payment.created_by.first_name || ''} ${payment.created_by.last_name || ''}`.trim() || payment.created_by.email
    : 'System';
  const approverName = payment.approved_by
    ? `${payment.approved_by.first_name || ''} ${payment.approved_by.last_name || ''}`.trim() || payment.approved_by.email
    : null;
  const processedByName = payment.processed_by
    ? `${payment.processed_by.first_name || ''} ${payment.processed_by.last_name || ''}`.trim() || payment.processed_by.email
    : null;

  // ── Installment Progress (derived from DB, not calculated on frontend) ────────
  const poInstallments = payment.purchase_order?.installments || [];
  const poPaymentType  = payment.purchase_order?.payment_type || 'ONE_TIME';
  const isInstallment  = poPaymentType === 'INSTALLMENT' || payment.payment_type === 'INSTALLMENT';
  const sortedPoInsts  = [...poInstallments].sort((a, b) => a.installment_number - b.installment_number);
  const totalInstallments     = sortedPoInsts.length;
  const paidInstallments      = sortedPoInsts.filter((i) => i.status === 'PAID' || Number(i.remaining_amount) <= 0.01).length;
  const remainingInstallments = Math.max(0, totalInstallments - paidInstallments);
  const nextPayableInst       = sortedPoInsts.find((i) => i.status !== 'PAID' && Number(i.remaining_amount ?? i.amount) > 0.01);
  const totalAmount           = payment.consolidatedTotalAmount !== undefined
    ? Number(payment.consolidatedTotalAmount)
    : Number(payment.invoice?.invoice_total || payment.purchase_order?.amount || amount);
  const totalPaidAmount       = payment.consolidatedPaidAmount !== undefined 
    ? Number(payment.consolidatedPaidAmount) 
    : (isInstallment ? sortedPoInsts.reduce((sum, i) => sum + Number(i.paid_amount || 0), 0) : Number(payment.invoice?.paid_amount ?? payment.amount ?? 0));
  const totalRemainingAmount  = payment.consolidatedRemainingAmount !== undefined 
    ? Number(payment.consolidatedRemainingAmount) 
    : (isInstallment ? sortedPoInsts.reduce((sum, i) => sum + Number(i.remaining_amount ?? i.amount ?? 0), 0) : Math.max(0, totalAmount - totalPaidAmount));

  return {
    ...payment,
    paymentNumber: payment.payment_number,
    invoiceNumber: payment.invoice?.invoice_number || payment.invoice_number || null,
    invoiceId: payment.invoice_id || null,
    purchaseOrderNumber: payment.purchase_order?.po_number || payment.po_number || null,
    vendorName: payment.vendor?.name || payment.vendor_name || null,
    vendorCode: payment.vendor?.vendor_code || payment.vendor_code || null,
    requestedAmount: amount,
    currency,
    requestedBy: creatorName,
    requestedById: payment.created_by_id,
    requestDate: payment.created_at,
    currentStatus: payment.status,
    priority,
    requiredApprovalRole: requiredRole,
    approvalBand: getPaymentApprovalBand(amount, currency),
    approvedBy: approverName,
    approvedById: payment.approved_by_id,
    approvedAt: payment.approved_at,
    processedBy: processedByName,
    processedById: payment.processed_by_id,
    // ── PO Payment Type & Installment Progress ────────────────────────────────
    poPaymentType,
    installmentId: payment.installment_id || null,
    installmentNumber: payment.installment?.installment_number || null,
    nextPayableInstallmentNumber: nextPayableInst ? nextPayableInst.installment_number : null,
    poInstallments: sortedPoInsts.map((i) => ({
      id: i.id,
      installmentNumber: i.installment_number,
      amount: Number(i.amount || 0),
      paidAmount: Number(i.paid_amount || 0),
      remainingAmount: Number(i.remaining_amount ?? i.amount ?? 0),
      status: i.status || 'PENDING',
      dueDate: i.due_date || null,
    })),
    totalAmount: payment.consolidatedTotalAmount !== undefined
      ? Number(payment.consolidatedTotalAmount)
      : Number(payment.invoice?.invoice_total || payment.purchase_order?.amount || amount),
    paidAmount: totalPaidAmount,
    remainingAmount: totalRemainingAmount,
    totalInstallments,
    paidInstallments,
    remainingInstallments,
    totalPaidAmount,
    totalRemainingAmount,
    transactions: (payment.transactions || []).map((t) => ({
      id: t.id,
      paymentNumber: t.payment_number,
      amount: Number(t.amount || 0),
      currency: t.currency || 'INR',
      status: t.status,
      paymentMethod: t.payment_method,
      providerTransactionId: t.provider_transaction_id,
      gatewayReference: t.gateway_reference,
      installmentId: t.installment_id,
      installmentNumber: t.installment?.installment_number,
      paymentDate: t.payment_date || t.created_at,
      createdAt: t.created_at,
      remarks: t.remarks,
      recordedBy: t.created_by
        ? `${t.created_by.first_name || ''} ${t.created_by.last_name || ''}`.trim() || t.created_by.email
        : null,
    })),
  };
};

/**
 * Mandatory remarks assertion for Task 3.
 */
const assertRemarks = (remarks, action) => {
  if (!String(remarks || '').trim()) {
    throw new ApiError(400, `Remarks are required to ${action} this payment request.`);
  }
};

/**
 * Strictly assert that the user role matches the required approval role for the payment amount.
 */
const assertPaymentAssignedToRole = (payment, user) => {
  if (user.role === ROLES.SUPER_ADMIN) {
    return getRequiredPaymentApprovalRole(payment.amount, payment.currency);
  }
  const requiredRole = getRequiredPaymentApprovalRole(payment.amount, payment.currency);
  if (requiredRole !== user.role) {
    throw new ApiError(
      403,
      `Payment request assigned to another approver level. Required approver: ${requiredRole}, Your role: ${user.role}.`,
    );
  }
  return requiredRole;
};

// Define valid payment status transitions
export const isValidPaymentStatusTransition = (from, to) => {
  const transitions = {
    [PAYMENT_STATUS.PENDING]: [
      PAYMENT_STATUS.INITIATED,
      PAYMENT_STATUS.CANCELLED,
      PAYMENT_STATUS.FAILED,
      PAYMENT_STATUS.RETURNED,
    ],
    [PAYMENT_STATUS.INITIATED]: [PAYMENT_STATUS.PROCESSING, PAYMENT_STATUS.CANCELLED, PAYMENT_STATUS.FAILED],
    [PAYMENT_STATUS.PROCESSING]: [PAYMENT_STATUS.SUCCESS, PAYMENT_STATUS.FAILED, PAYMENT_STATUS.CANCELLED],
    [PAYMENT_STATUS.SUCCESS]: [PAYMENT_STATUS.REFUNDED],
    [PAYMENT_STATUS.FAILED]: [PAYMENT_STATUS.INITIATED, PAYMENT_STATUS.CANCELLED],
    [PAYMENT_STATUS.RETURNED]: [PAYMENT_STATUS.PENDING, PAYMENT_STATUS.CANCELLED],
    [PAYMENT_STATUS.CANCELLED]: [],
    [PAYMENT_STATUS.REFUNDED]: [],
  };

  return (transitions[from] || []).includes(to);
};

const buildPaymentNumber = () => `PAY-${Date.now()}-${Math.floor(Math.random() * 1000)}`;

const roundMoney = (value) => Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100;
const isPositiveMoney = (value) => Number.isFinite(Number(value)) && Number(value) > 0;

const toMoney = (value) => roundMoney(value);

const summarizeInstallmentPlan = (installments = [], invoice = null) => {
  const sorted = [...installments].sort((a, b) => a.installment_number - b.installment_number);
  const current = sorted.find((inst) => {
    const remaining = Number(inst.remaining_amount ?? inst.amount ?? 0);
    return inst.status !== 'PAID' && remaining > 0.01;
  }) || null;

  const mapped = sorted.map((inst) => {
    const amount = toMoney(inst.amount);
    const paidAmount = toMoney(inst.paid_amount);
    const remainingAmount = toMoney(inst.remaining_amount ?? Math.max(0, amount - paidAmount));
    const isPaid = inst.status === 'PAID' || remainingAmount <= 0.01;
    const isCurrent = Boolean(current && current.id === inst.id && !isPaid);
    const status = isPaid ? 'PAID' : (isCurrent ? 'PAYABLE' : 'LOCKED');
    const lockedReason = !isPaid && !isCurrent && current
      ? `Pay Installment #${current.installment_number} first`
      : null;

    return {
      id: inst.id,
      installmentNumber: inst.installment_number,
      number: inst.installment_number,
      amount,
      paidAmount,
      paid: paidAmount,
      remainingAmount,
      remaining: remainingAmount,
      status,
      persistedStatus: inst.status || 'PENDING',
      dueDate: inst.due_date || null,
      payable: isCurrent,
      lockedReason,
    };
  });

  const paidInstallmentCount = mapped.filter((inst) => inst.status === 'PAID').length;
  const totalAmount = toMoney(invoice?.invoice_total ?? invoice?.amount ?? sorted.reduce((sum, inst) => sum + Number(inst.amount || 0), 0));
  const paidAmount = toMoney(invoice?.paid_amount ?? mapped.reduce((sum, inst) => sum + inst.paidAmount, 0));
  const remainingAmount = toMoney(invoice?.remaining_amount ?? Math.max(0, totalAmount - paidAmount));

  return {
    paymentType: sorted.length > 0 ? 'INSTALLMENT' : 'ONE_TIME',
    totalAmount,
    paidAmount,
    remainingAmount,
    installmentCount: mapped.length,
    paidInstallmentCount,
    remainingInstallmentCount: Math.max(0, mapped.length - paidInstallmentCount),
    currentInstallment: current ? mapped.find((inst) => inst.id === current.id) : null,
    installments: mapped,
  };
};

const VENDOR_BANK_FIELDS_REQUIRED_FOR_PAYMENT = [
  ['bank_name', 'Bank Name'],
  ['account_holder', 'Account Holder'],
  ['bank_account_no', 'Account Number'],
  ['ifsc_code', 'IFSC Code'],
  ['bank_branch', 'Bank Branch'],
];

const assertVendorBankReadyForPayment = (vendor) => {
  const missing = VENDOR_BANK_FIELDS_REQUIRED_FOR_PAYMENT
    .filter(([key]) => !String(vendor?.[key] || '').trim())
    .map(([, label]) => label);

  if (missing.length) {
    throw new ApiError(
      400,
      `Vendor bank details are incomplete. Complete these fields in Vendor Master before creating or approving a Payment: ${missing.join(', ')}.`,
    );
  }
};

class PaymentService {
  /**
   * Step 1: Get invoices eligible for payment creation.
   * Return only invoices where 3WM = MATCHED, Payment Approval = APPROVED, not CANCELLED, remaining_amount > 0.
   */
  async getEligibleInvoices(user) {
    const invoices = await prisma.invoice.findMany({
      where: {
        three_way_match_status: 'MATCHED',
        status: { in: ['APPROVED', 'PARTIALLY_PAID', 'PENDING_PAYMENT'] },
        deleted_at: null,
        ...(user.role === ROLES.CASE_MANAGER && { created_by_id: user.id }),
      },
      include: {
        vendor: true,
        purchase_order: {
          include: {
            installments: { orderBy: { installment_number: 'asc' } },
            grns: { where: { deleted_at: null }, orderBy: { created_at: 'desc' }, take: 1 },
            delivery_challans: { where: { deleted_at: null }, orderBy: { created_at: 'desc' }, take: 1 },
          },
        },
        three_way_matches: {
          where: { status: 'MATCHED' },
          orderBy: { created_at: 'desc' },
          take: 1,
        },
        payment_approvals: {
          where: { status: 'APPROVED' },
          orderBy: { approved_at: 'desc' },
          take: 1,
        },
        payments: {
          where: {
            status: { in: ['PENDING', 'INITIATED', 'PROCESSING', 'SUCCESS', 'COMPLETED'] },
          },
          select: { id: true, amount: true, status: true },
        },
      },
      orderBy: { updated_at: 'desc' },
    });

    const eligible = [];
    for (const inv of invoices) {
      const approvedApproval = inv.payment_approvals?.[0];
      if (!approvedApproval) continue; // MUST have APPROVED PaymentApproval!

      const invoiceTotal = Number(inv.invoice_total || inv.amount || 0);
      const paidAmount = Number(inv.paid_amount || 0);

      // Sum existing payment allocations
      const allocated = inv.payments.reduce((sum, p) => sum + Number(p.amount), 0);
      const totalPaidOrAllocated = Math.max(paidAmount, allocated);
      const remainingAmount = Math.max(0, invoiceTotal - totalPaidOrAllocated);

      if (remainingAmount <= 0.01) continue; // Skip fully paid or fully allocated invoices!

      const match = inv.three_way_matches?.[0];
      const grnSnap = match?.grn_snapshot || match?.grnSnapshot;
      const dcSnap = match?.delivery_challan_snapshot || match?.deliveryChallanSnapshot;
      const directGrn = inv.purchase_order?.grns?.[0];
      const directDc = inv.purchase_order?.delivery_challans?.[0];

      const installmentPlan = summarizeInstallmentPlan(inv.purchase_order?.installments || [], inv);
      const currentInstallment = installmentPlan.currentInstallment;

      eligible.push({
        id: inv.id,
        invoiceId: inv.id,
        invoiceNumber: inv.invoice_number,
        invoiceDate: inv.invoice_date,
        dueDate: inv.due_date,
        status: inv.status,
        threeWayMatchStatus: inv.three_way_match_status,
        paymentApprovalStatus: approvedApproval.status,
        approvedAmount: Number(approvedApproval.amount || invoiceTotal),
        approvalId: approvedApproval.id,

        // Vendor Details
        vendorId: inv.vendor_id,
        vendor: inv.vendor?.name,
        vendorName: inv.vendor?.name,
        vendorCode: inv.vendor?.vendor_code,
        vendorGst: inv.vendor?.gst_number || inv.vendor?.tax_id || null,
        gstNumber: inv.vendor?.gst_number || inv.vendor?.tax_id || null,
        vendorAddress: inv.vendor?.billing_address || inv.vendor?.address || null,
        vendorBankName: inv.vendor?.bank_name || null,
        vendorAccountHolder: inv.vendor?.account_holder || null,
        vendorBankAccountNo: inv.vendor?.bank_account_no || null,
        vendorIfscCode: inv.vendor?.ifsc_code || null,
        vendorBankBranch: inv.vendor?.bank_branch || null,

        // PO Details
        purchaseOrderId: inv.purchase_order_id,
        poNumber: inv.purchase_order?.po_number,
        poDate: inv.purchase_order?.order_date,
        poTotal: Number(inv.purchase_order?.amount || 0),
        purchaseOrderAmount: Number(inv.purchase_order?.amount || 0),
        poPaymentType: inv.purchase_order?.payment_type || 'ONE_TIME',
        paymentType: inv.purchase_order?.payment_type || 'ONE_TIME',
        nextPayableInstallmentId: currentInstallment?.id || null,
        nextPayableInstallmentNumber: currentInstallment?.installmentNumber || null,
        currentInstallment,
        installmentPlan,
        installments: installmentPlan.installments,
        totalInstallments: installmentPlan.installmentCount,
        paidInstallments: installmentPlan.paidInstallmentCount,
        remainingInstallments: installmentPlan.remainingInstallmentCount,

        // GRN & DC Details
        grnNumber: grnSnap?.grnNumber || grnSnap?.grn_number || directGrn?.grn_number || 'GRN-VERIFIED',
        grnDate: grnSnap?.receivedDate || directGrn?.received_date || null,
        deliveryChallanNumber: dcSnap?.deliveryChallanNumber || dcSnap?.delivery_challan_number || directDc?.delivery_challan_number || 'DC-VERIFIED',
        deliveryChallanDate: dcSnap?.deliveryDate || directDc?.delivery_date || null,

        // Financial Totals
        invoiceTotal,
        amount: invoiceTotal,
        paidAmount,
        outstandingAmount: remainingAmount,
        remainingPayableAmount: remainingAmount,
        currency: inv.currency || 'INR',
      });
    }

    return eligible;
  }

  async getPaymentStoreData(invoiceId, user) {
    const inv = await prisma.invoice.findUnique({
      where: { id: invoiceId },
      include: {
        vendor: true,
        purchase_order: {
          include: {
            installments: { orderBy: { installment_number: 'asc' } },
            grns: { where: { deleted_at: null }, orderBy: { created_at: 'desc' }, take: 1 },
            delivery_challans: { where: { deleted_at: null }, orderBy: { created_at: 'desc' }, take: 1 },
          },
        },
        three_way_matches: {
          where: { status: 'MATCHED' },
          orderBy: { created_at: 'desc' },
          take: 1,
        },
        payment_approvals: {
          where: { status: 'APPROVED' },
          orderBy: { approved_at: 'desc' },
          take: 1,
        },
      },
    });

    if (!inv || inv.deleted_at) {
      throw new ApiError(404, 'Invoice not found.');
    }

    if (user.role === ROLES.CASE_MANAGER && inv.created_by_id !== user.id) {
      throw new ApiError(403, 'You can only create payments for invoices created by you.');
    }

    if ((inv.status || '').toUpperCase() !== INVOICE_STATUS.APPROVED) {
      throw new ApiError(400, 'Payment can only be recorded for an approved invoice.');
    }

    if ((inv.three_way_match_status || '').toUpperCase() !== THREE_WAY_MATCH_STATUS.MATCHED) {
      throw new ApiError(400, `Payment blocked: Three-Way Matching status is ${inv.three_way_match_status || 'UNMATCHED'}.`);
    }

    const approvedApproval = inv.payment_approvals?.[0];
    if (!approvedApproval) {
      throw new ApiError(400, 'Payment cannot be created: Required Payment Approval workflow is not completed or approved.');
    }

    const invoiceTotal = toMoney(inv.invoice_total || inv.amount || 0);
    const paidAmount = toMoney(inv.paid_amount || 0);
    const remainingAmount = toMoney(inv.remaining_amount ?? Math.max(0, invoiceTotal - paidAmount));
    const installmentPlan = summarizeInstallmentPlan(inv.purchase_order?.installments || [], inv);
    const currentInstallment = installmentPlan.currentInstallment;
    const match = inv.three_way_matches?.[0];
    const grnSnap = match?.grn_snapshot || match?.grnSnapshot;
    const dcSnap = match?.delivery_challan_snapshot || match?.deliveryChallanSnapshot;
    const directGrn = inv.purchase_order?.grns?.[0];
    const directDc = inv.purchase_order?.delivery_challans?.[0];

    return {
      id: inv.id,
      invoiceId: inv.id,
      invoiceNumber: inv.invoice_number,
      invoiceDate: inv.invoice_date,
      dueDate: inv.due_date,
      status: inv.status,
      paymentStatus: inv.payment_status,
      threeWayMatchStatus: inv.three_way_match_status,
      paymentApprovalStatus: approvedApproval.status,
      approvalId: approvedApproval.id,
      approvedAmount: Number(approvedApproval.amount || invoiceTotal),
      vendorId: inv.vendor_id,
      vendor: inv.vendor?.name,
      vendorName: inv.vendor?.name,
      vendorCode: inv.vendor?.vendor_code,
      vendorGst: inv.vendor?.gst_number || inv.vendor?.tax_id || null,
      gstNumber: inv.vendor?.gst_number || inv.vendor?.tax_id || null,
      vendorAddress: inv.vendor?.billing_address || inv.vendor?.address || null,
      vendorBankName: inv.vendor?.bank_name || null,
      vendorAccountHolder: inv.vendor?.account_holder || null,
      vendorBankAccountNo: inv.vendor?.bank_account_no || null,
      vendorIfscCode: inv.vendor?.ifsc_code || null,
      vendorBankBranch: inv.vendor?.bank_branch || null,
      purchaseOrderId: inv.purchase_order_id,
      poNumber: inv.purchase_order?.po_number,
      poDate: inv.purchase_order?.order_date,
      poTotal: Number(inv.purchase_order?.amount || 0),
      purchaseOrderAmount: Number(inv.purchase_order?.amount || 0),
      poPaymentType: inv.purchase_order?.payment_type || 'ONE_TIME',
      paymentType: inv.purchase_order?.payment_type || 'ONE_TIME',
      nextPayableInstallmentId: currentInstallment?.id || null,
      nextPayableInstallmentNumber: currentInstallment?.installmentNumber || null,
      currentInstallment,
      installmentPlan,
      installments: installmentPlan.installments,
      totalInstallments: installmentPlan.installmentCount,
      paidInstallments: installmentPlan.paidInstallmentCount,
      remainingInstallments: installmentPlan.remainingInstallmentCount,
      grnNumber: grnSnap?.grnNumber || grnSnap?.grn_number || directGrn?.grn_number || 'GRN-VERIFIED',
      grnDate: grnSnap?.receivedDate || directGrn?.received_date || null,
      deliveryChallanNumber: dcSnap?.deliveryChallanNumber || dcSnap?.delivery_challan_number || directDc?.delivery_challan_number || 'DC-VERIFIED',
      deliveryChallanDate: dcSnap?.deliveryDate || directDc?.delivery_date || null,
      invoiceTotal,
      amount: invoiceTotal,
      paidAmount,
      outstandingAmount: remainingAmount,
      remainingPayableAmount: remainingAmount,
      currency: inv.currency || 'INR',
      paymentAmount: currentInstallment?.remainingAmount ?? remainingAmount,
    };
  }

  /**
   * Create a new payment request against an approved invoice.
   */
  async createPayment(payload, user) {
    const paymentNumber = buildPaymentNumber();
    const paymentAmount = toMoney(payload.amount);

    if (!isPositiveMoney(paymentAmount)) {
      throw new ApiError(400, 'Payment amount must be greater than 0.');
    }

    const createdPayment = await paymentRepository.transaction(async (tx) => {
      await tx.$queryRawUnsafe('SELECT id FROM invoices WHERE id = $1 FOR UPDATE', payload.invoiceId);

      const invoice = await tx.invoice.findUnique({
        where: { id: payload.invoiceId },
        include: {
          vendor: true,
          purchase_order: {
            include: {
              installments: { orderBy: { installment_number: 'asc' } },
            },
          },
          payment_approvals: {
            where: { status: 'APPROVED' },
            orderBy: { approved_at: 'desc' },
            take: 1,
          },
        },
      });

      if (!invoice || invoice.deleted_at) {
        throw new ApiError(404, 'Invoice not found.');
      }

      if (user.role === ROLES.CASE_MANAGER && invoice.created_by_id !== user.id) {
        throw new ApiError(403, 'You can only create payments for invoices created by you.');
      }

      if ((invoice.status || '').toUpperCase() !== INVOICE_STATUS.APPROVED) {
        throw new ApiError(400, 'Payment can only be recorded for an approved invoice.');
      }

      if ((invoice.three_way_match_status || '').toUpperCase() !== THREE_WAY_MATCH_STATUS.MATCHED) {
        throw new ApiError(400, `Payment blocked: Three-Way Matching status is ${invoice.three_way_match_status || 'UNMATCHED'}.`);
      }

      assertVendorBankReadyForPayment(invoice.vendor);

      const approvedApproval = invoice.payment_approvals?.[0];
      if (!approvedApproval) {
        throw new ApiError(400, 'Payment cannot be created: Required Payment Approval workflow is not completed or approved.');
      }

      const invoiceTotal = toMoney(invoice.invoice_total || invoice.amount || 0);
      const invoiceRemaining = toMoney(invoice.remaining_amount ?? Math.max(0, invoiceTotal - Number(invoice.paid_amount || 0)));
      if (invoice.payment_status === 'PAID' || invoiceRemaining <= 0.01) {
        throw new ApiError(400, 'This invoice has already been fully paid.');
      }

      if (paymentAmount > invoiceRemaining + 0.01) {
        throw new ApiError(400, 'Payment amount cannot exceed the invoice remaining amount.');
      }

      const poPaymentType = invoice.purchase_order?.payment_type || 'ONE_TIME';
      let targetInstallment = null;

      if (poPaymentType === 'INSTALLMENT') {
        await tx.$queryRawUnsafe('SELECT id FROM installments WHERE purchase_order_id = $1 ORDER BY installment_number ASC FOR UPDATE', invoice.purchase_order_id);

        const lockedInstallments = await tx.installment.findMany({
          where: { purchase_order_id: invoice.purchase_order_id },
          orderBy: { installment_number: 'asc' },
        });

        if (!lockedInstallments.length) {
          throw new ApiError(400, 'Installment payment plan is missing for this purchase order.');
        }

        const currentInstallment = summarizeInstallmentPlan(lockedInstallments, invoice).currentInstallment;
        if (!currentInstallment) {
          throw new ApiError(400, 'All installments for this purchase order have already been fully paid.');
        }

        targetInstallment = lockedInstallments.find((inst) =>
          payload.installmentId ? inst.id === payload.installmentId : inst.id === currentInstallment.id
        );

        if (payload.installmentId && !targetInstallment) {
          throw new ApiError(400, 'Installment does not belong to this invoice/PO.');
        }

        if (!targetInstallment || targetInstallment.id !== currentInstallment.id) {
          throw new ApiError(400, 'Only the current payable installment can be paid.');
        }

        const installmentRemaining = toMoney(targetInstallment.remaining_amount);
        if (targetInstallment.status === 'PAID' || installmentRemaining <= 0.01) {
          throw new ApiError(400, 'This installment has already been fully paid.');
        }

        if (paymentAmount > installmentRemaining + 0.01) {
          throw new ApiError(400, 'Payment amount cannot exceed the installment remaining amount.');
        }
      } else if (payload.installmentId) {
        throw new ApiError(400, 'Installment payments are only allowed for installment purchase orders.');
      }

      const currency = payload.currency || invoice.currency || 'INR';

      const payment = await tx.payment.create({
        data: {
          payment_number: paymentNumber,
          invoice_id: payload.invoiceId,
          vendor_id: invoice.vendor_id,
          purchase_order_id: invoice.purchase_order_id,
          installment_id: targetInstallment ? targetInstallment.id : null,
          amount: paymentAmount,
          currency,
          status: PAYMENT_STATUS.SUCCESS,
          payment_method: payload.paymentMethod || 'NEFT',
          payment_type: targetInstallment ? 'INSTALLMENT' : (payload.paymentType || 'FULL'),
          payment_provider: payload.paymentProvider || 'MANUAL',
          provider_transaction_id: payload.referenceNo || payload.providerTransactionId || null,
          remarks: payload.remarks || payload.notes || '',
          due_date: payload.dueDate ? new Date(payload.dueDate) : (targetInstallment ? targetInstallment.due_date : null),
          payment_date: new Date(),
          created_by_id: user.id,
          updated_by_id: user.id,
        },
        select: {
          id: true,
          payment_number: true,
          invoice_id: true,
          vendor_id: true,
          purchase_order_id: true,
          installment_id: true,
          amount: true,
          currency: true,
          status: true,
          payment_method: true,
          payment_type: true,
          payment_provider: true,
          remarks: true,
          due_date: true,
          payment_date: true,
          created_by_id: true,
          updated_by_id: true,
          created_at: true,
          updated_at: true,
        },
      });

      let instStatus = 'PAID';
      if (targetInstallment) {
        const freshTarget = await tx.installment.findUnique({ where: { id: targetInstallment.id } });
        const instNewPaid = toMoney(Number(freshTarget.paid_amount || 0) + paymentAmount);
        const instNewRemaining = toMoney(Math.max(0, Number(freshTarget.amount || 0) - instNewPaid));
        instStatus = instNewRemaining <= 0.01 ? 'PAID' : 'PARTIALLY_PAID';

        await tx.installment.update({
          where: { id: targetInstallment.id },
          data: {
            paid_amount: instNewPaid,
            remaining_amount: instNewRemaining,
            status: instStatus,
            paid_date: instStatus === 'PAID' ? new Date() : null,
          },
        });
      }

      const newPaidAmount = toMoney(Number(invoice.paid_amount || 0) + paymentAmount);
      const newRemainingAmount = toMoney(Math.max(0, invoiceTotal - newPaidAmount));
      const allInstsPaid = poPaymentType !== 'INSTALLMENT' || (await tx.installment.findMany({
        where: { purchase_order_id: invoice.purchase_order_id },
      })).every((inst) =>
        inst.id === targetInstallment?.id ? instStatus === 'PAID' : (inst.status === 'PAID' || Number(inst.remaining_amount) <= 0.01)
      );
      const finalPaymentStatus = newRemainingAmount <= 0.01 && allInstsPaid ? 'PAID' : 'PARTIALLY_PAID';

      await tx.invoice.update({
        where: { id: invoice.id },
        data: {
          paid_amount: newPaidAmount,
          remaining_amount: newRemainingAmount,
          payment_status: finalPaymentStatus,
          last_payment_date: new Date(),
          last_payment_id: payment.id,
        },
      });

      if (!approvedApproval.payment_id) {
        await tx.paymentApproval.update({
          where: { id: approvedApproval.id },
          data: { payment_id: payment.id, status: 'APPROVED' },
        });
      }

      await tx.paymentApprovalHistory.create({
        data: {
          payment_approval_id: approvedApproval.id,
          payment_id: payment.id,
          invoice_id: invoice.id,
          action: targetInstallment ? `INSTALLMENT_${targetInstallment.installment_number}_PAID` : 'COMPLETED',
          previous_status: 'APPROVED',
          new_status: 'APPROVED',
          performed_by_id: user.id,
          remarks: `Payment ${payment.payment_number} created for ${currency} ${paymentAmount} against ${targetInstallment ? `Installment #${targetInstallment.installment_number}` : 'Invoice'}. Invoice payment status: ${finalPaymentStatus}.`,
        },
      });

      await Promise.all([
        tx.auditLog.create({
          data: {
            entity_type: 'payment',
            entity_id: payment.id,
            action: 'created',
            from_status: null,
            to_status: PAYMENT_STATUS.SUCCESS,
            performed_by_id: user.id,
            remarks: `Payment recorded. Status: ${PAYMENT_STATUS.SUCCESS}`,
          },
        }),
        tx.approvalLog.create({
          data: {
            entity_type: 'payment',
            entity_id: payment.id,
            action: 'created',
            from_status: null,
            to_status: PAYMENT_STATUS.SUCCESS,
            performed_by_id: user.id,
            remarks: `Payment recorded. Status: ${PAYMENT_STATUS.SUCCESS}`,
          },
        }),
      ]);

      return payment;
    }, { isolationLevel: 'Serializable' });

    return decoratePayment(await paymentRepository.findById(createdPayment.id));
  }

  /**
   * Update details of a PENDING payment request.
   */
  async updatePayment(id, payload, user) {
    const payment = await paymentRepository.findById(id);
    if (!payment) {
      throw new ApiError(404, 'Payment not found.');
    }

    if (payment.status !== PAYMENT_STATUS.PENDING && payment.status !== PAYMENT_STATUS.RETURNED) {
      throw new ApiError(400, 'Only pending or returned payment requests can be modified.');
    }

    if (user.role === ROLES.CASE_MANAGER && payment.created_by_id !== user.id) {
      throw new ApiError(403, 'You do not have permission to modify this payment request.');
    }

    const updateData = {
      payment_method: payload.paymentMethod || payment.payment_method,
      payment_type: payload.paymentType || payment.payment_type,
      payment_provider: payload.paymentProvider || payment.payment_provider,
      remarks: payload.remarks || payment.remarks,
      provider_transaction_id: payload.providerTransactionId || payment.provider_transaction_id,
      gateway_reference: payload.gatewayReference || payment.gateway_reference,
      due_date: payload.dueDate ? new Date(payload.dueDate) : payment.due_date,
      payment_date: payload.paymentDate ? new Date(payload.paymentDate) : payment.payment_date,
      updated_by_id: user.id,
      // If payment was RETURNED, resubmitting moves status back to PENDING
      ...(payment.status === PAYMENT_STATUS.RETURNED && { status: PAYMENT_STATUS.PENDING }),
    };

    if (payload.amount && Number(payload.amount) !== Number(payment.amount)) {
      const invoice = await invoiceRepository.findById(payment.invoice_id);
      const existingPayments = await paymentRepository.findAll({
        where: {
          invoice_id: payment.invoice_id,
          id: { not: id },
          status: { in: [PAYMENT_STATUS.PENDING, PAYMENT_STATUS.INITIATED, PAYMENT_STATUS.PROCESSING, PAYMENT_STATUS.SUCCESS] },
        },
        take: 100,
      });

      const totalAllocated = existingPayments.payments.reduce((sum, p) => sum + Number(p.amount), 0);
      const remainingAllocated = Number(invoice.invoice_total) - totalAllocated;
      const newAmount = Number(payload.amount);

      if (newAmount > remainingAllocated + 0.01) {
        throw new ApiError(
          400,
          `Updated amount exceeds remaining invoice balance. Max allowed: INR ${remainingAllocated.toFixed(2)}`,
        );
      }
      updateData.amount = newAmount;
    }

    const updatedPayment = await paymentRepository.update(id, updateData);

    await prisma.auditLog.create({
      data: {
        entity_type: 'payment',
        entity_id: id,
        action: 'updated',
        from_status: payment.status,
        to_status: updatedPayment.status,
        performed_by_id: user.id,
        remarks: payload.remarks || 'Payment request details updated',
      },
    });

    return decoratePayment(updatedPayment);
  }

  /**
   * Delete a pending/cancelled payment.
   */
  async deletePayment(id, user) {
    const payment = await paymentRepository.findById(id);
    if (!payment) {
      throw new ApiError(404, 'Payment not found.');
    }

    const allowedDeleteStatuses = [PAYMENT_STATUS.PENDING, PAYMENT_STATUS.CANCELLED, PAYMENT_STATUS.RETURNED];
    if (!allowedDeleteStatuses.includes(payment.status)) {
      throw new ApiError(400, 'Only pending, returned, or cancelled payments can be deleted.');
    }

    if (user.role !== ROLES.SUPER_ADMIN && user.role !== ROLES.FINANCE_HEAD) {
      throw new ApiError(403, 'Unauthorized access.');
    }

    return paymentRepository.delete(id);
  }

  /**
   * List payments with role-based filtering (Task 2 & Task 6).
   */
  async listPayments(query, user) {
    const page = Number(query.page || 1);
    const limit = Number(query.limit || 10);
    const search = (query.search || '').trim();

    // Construct role-specific where filter
    let roleClause = {};
    if (query.status === 'PENDING_APPROVAL') {
      console.log("--------------------------------------",query.status, user.role)
      if ([ROLES.TEAM_LEAD, ROLES.MANAGER, ROLES.FINANCE_HEAD].includes(user.role)) {
        roleClause = paymentWhereForApprovalRole(user.role) || {};
      }
    }

    const conditions = [];

    if (user.role === ROLES.CASE_MANAGER) {
      conditions.push({ created_by_id: user.id });
    }

    if (query.status) {
      if (query.status === 'PARTIALLY_PAID') {
        conditions.push({
          invoice: { payment_status: 'PARTIALLY_PAID' },
        });
      } else if (query.status === 'PAID') {
        conditions.push({
          OR: [
            { status: 'SUCCESS', invoice: { payment_status: 'PAID' } },
            { status: 'SUCCESS', purchase_order: { payment_type: 'ONE_TIME' } },
          ],
        });
      } else {
        conditions.push({ status: query.status });
      }
    }
    if (query.invoiceId) {
      conditions.push({ invoice_id: query.invoiceId });
    }
    if (query.vendorId) {
      conditions.push({ vendor_id: query.vendorId });
    }
    if (query.purchaseOrderId) {
      conditions.push({ purchase_order_id: query.purchaseOrderId });
    }
    if (query.paymentMethod) {
      conditions.push({ payment_method: query.paymentMethod });
    }
    if (query.paymentType) {
      conditions.push({
        OR: [
          { payment_type: query.paymentType },
          { purchase_order: { payment_type: query.paymentType } },
        ],
      });
    }
    if (query.paymentProvider) {
      conditions.push({ payment_provider: query.paymentProvider });
    }

    if (Object.keys(roleClause).length > 0) {
      conditions.push(roleClause);
    }

    if (search) {
      conditions.push({
        OR: [
          { payment_number: { contains: search, mode: 'insensitive' } },
          { vendor: { name: { contains: search, mode: 'insensitive' } } },
          { vendor: { vendor_code: { contains: search, mode: 'insensitive' } } },
          { invoice: { invoice_number: { contains: search, mode: 'insensitive' } } },
          { purchase_order: { po_number: { contains: search, mode: 'insensitive' } } },
        ],
      });
    }

    const where = conditions.length > 0 ? { AND: conditions } : {};

    const result = await paymentRepository.findConsolidatedPayments({
      where,
      skip: (page - 1) * limit,
      take: limit,
    });

    return {
      payments: result.payments.map(decoratePayment),
      total: result.total,
      page,
      limit,
      totalPages: Math.ceil(result.total / limit),
    };
  }

  /**
   * Get pending payments for current user role's approval queue (Task 2).
   */
  async getPendingPayments(query, user) {
    return this.listPayments({ ...query, status: PAYMENT_STATUS.PENDING }, user);
  }

  /**
   * Get completed payments queue.
   */
  async getCompletedPayments(query, user) {
    return this.listPayments({ ...query, status: PAYMENT_STATUS.SUCCESS }, user);
  }

  async getPaymentById(id, user) {
    const payment = await paymentRepository.findById(id);
    if (!payment) {
      throw new ApiError(404, 'Payment not found.');
    }

    if (user.role === ROLES.CASE_MANAGER && payment.created_by_id !== user.id) {
      throw new ApiError(403, 'You do not have permission to view this payment details.');
    }

    return decoratePayment(payment);
  }

  /**
   * TASK 3 — Approve Payment Request.
   * Mandates remarks and enforces amount-based RBAC assignment.
   */
  async approvePayment(id, user, remarks, referenceNo) {
    assertRemarks(remarks, 'approve');

    const payment = await paymentRepository.findById(id);
    if (!payment) {
      throw new ApiError(404, 'Payment not found.');
    }

    if (payment.status !== PAYMENT_STATUS.PENDING) {
      throw new ApiError(400, 'Only pending payment requests can be approved.');
    }

    if (![ROLES.TEAM_LEAD, ROLES.MANAGER, ROLES.FINANCE_HEAD, ROLES.SUPER_ADMIN].includes(user.role)) {
      throw new ApiError(403, 'Approval permission denied.');
    }

    assertPaymentAssignedToRole(payment, user);
    assertVendorBankReadyForPayment(payment.vendor);

    const updatedPayment = await paymentRepository.transaction(async (tx) => {
      const updated = await tx.payment.update({
        where: { id },
        data: {
          status: PAYMENT_STATUS.INITIATED,
          approved_by_id: user.id,
          approved_at: new Date(),
          processed_by_id: user.id,
          remarks: remarks.trim(),
          provider_transaction_id: referenceNo?.trim() || null,
          updated_by_id: user.id,
        },
      });

      // Write to both AuditLog and ApprovalLog
      await Promise.all([
        tx.auditLog.create({
          data: {
            entity_type: 'payment',
            entity_id: id,
            action: 'approved',
            from_status: PAYMENT_STATUS.PENDING,
            to_status: PAYMENT_STATUS.INITIATED,
            performed_by_id: user.id,
            remarks: remarks.trim(),
          },
        }),
        tx.approvalLog.create({
          data: {
            entity_type: 'payment',
            entity_id: id,
            action: 'approved',
            from_status: PAYMENT_STATUS.PENDING,
            to_status: PAYMENT_STATUS.INITIATED,
            performed_by_id: user.id,
            remarks: remarks.trim(),
          },
        }),
      ]);

      const actorName = `${user.first_name || ''} ${user.last_name || ''}`.trim() || user.role;
      notificationService.notifyPaymentStatusChange(updated, PAYMENT_STATUS.INITIATED, actorName, remarks).catch(() => {});

      return decoratePayment(updated);
    });

    // Asynchronously process gateway transaction after database commit
    this.processGatewayPayment(id).catch(console.error);

    return updatedPayment;
  }

  /**
   * TASK 3 — Reject Payment Request.
   * Mandates remarks and enforces amount-based RBAC assignment.
   */
  async rejectPayment(id, user, remarks) {
    assertRemarks(remarks, 'reject');

    const payment = await paymentRepository.findById(id);
    if (!payment) {
      throw new ApiError(404, 'Payment not found.');
    }

    if (payment.status !== PAYMENT_STATUS.PENDING) {
      throw new ApiError(400, 'Only pending payments can be rejected.');
    }

    if (![ROLES.TEAM_LEAD, ROLES.MANAGER, ROLES.FINANCE_HEAD, ROLES.SUPER_ADMIN].includes(user.role)) {
      throw new ApiError(403, 'Approval permission denied.');
    }

    assertPaymentAssignedToRole(payment, user);

    return paymentRepository.transaction(async (tx) => {
      const updatedPayment = await tx.payment.update({
        where: { id },
        data: {
          status: PAYMENT_STATUS.FAILED,
          remarks: remarks.trim(),
          approved_by_id: user.id,
          updated_by_id: user.id,
        },
      });

      await Promise.all([
        tx.auditLog.create({
          data: {
            entity_type: 'payment',
            entity_id: id,
            action: 'rejected',
            from_status: PAYMENT_STATUS.PENDING,
            to_status: PAYMENT_STATUS.FAILED,
            performed_by_id: user.id,
            remarks: remarks.trim(),
          },
        }),
        tx.approvalLog.create({
          data: {
            entity_type: 'payment',
            entity_id: id,
            action: 'rejected',
            from_status: PAYMENT_STATUS.PENDING,
            to_status: PAYMENT_STATUS.FAILED,
            performed_by_id: user.id,
            remarks: remarks.trim(),
          },
        }),
      ]);

      const actorName = `${user.first_name || ''} ${user.last_name || ''}`.trim() || user.role;
      notificationService.notifyPaymentStatusChange(updatedPayment, PAYMENT_STATUS.FAILED, actorName, remarks).catch(() => {});

      return decoratePayment(updatedPayment);
    });
  }

  /**
   * TASK 3 — Return Payment Request for Correction.
   * Mandates remarks and enforces amount-based RBAC assignment.
   */
  async returnPaymentForCorrection(id, user, remarks) {
    assertRemarks(remarks, 'return for correction');

    const payment = await paymentRepository.findById(id);
    if (!payment) {
      throw new ApiError(404, 'Payment request not found.');
    }

    if (payment.status !== PAYMENT_STATUS.PENDING) {
      throw new ApiError(400, 'Only pending payment requests can be returned for correction.');
    }

    if (![ROLES.TEAM_LEAD, ROLES.MANAGER, ROLES.FINANCE_HEAD, ROLES.SUPER_ADMIN].includes(user.role)) {
      throw new ApiError(403, 'Approval permission denied.');
    }

    assertPaymentAssignedToRole(payment, user);

    return paymentRepository.transaction(async (tx) => {
      const updatedPayment = await tx.payment.update({
        where: { id },
        data: {
          status: PAYMENT_STATUS.RETURNED,
          remarks: remarks.trim(),
          updated_by_id: user.id,
        },
      });

      await Promise.all([
        tx.auditLog.create({
          data: {
            entity_type: 'payment',
            entity_id: id,
            action: 'returned_for_correction',
            from_status: PAYMENT_STATUS.PENDING,
            to_status: PAYMENT_STATUS.RETURNED,
            performed_by_id: user.id,
            remarks: remarks.trim(),
          },
        }),
        tx.approvalLog.create({
          data: {
            entity_type: 'payment',
            entity_id: id,
            action: 'returned_for_correction',
            from_status: PAYMENT_STATUS.PENDING,
            to_status: PAYMENT_STATUS.RETURNED,
            performed_by_id: user.id,
            remarks: remarks.trim(),
          },
        }),
      ]);

      const actorName = `${user.first_name || ''} ${user.last_name || ''}`.trim() || user.role;
      notificationService.notifyPaymentStatusChange(updatedPayment, PAYMENT_STATUS.RETURNED, actorName, remarks).catch(() => {});

      return decoratePayment(updatedPayment);
    });
  }

  /**
   * Cancel a payment request.
   */
  async cancelPayment(id, user, remarks) {
    const payment = await paymentRepository.findById(id);
    if (!payment) {
      throw new ApiError(404, 'Payment not found.');
    }

    const allowedCancel = [PAYMENT_STATUS.PENDING, PAYMENT_STATUS.INITIATED, PAYMENT_STATUS.RETURNED];
    if (!allowedCancel.includes(payment.status)) {
      throw new ApiError(400, 'Cannot cancel payment after processing has started.');
    }

    if (user.role === ROLES.CASE_MANAGER && payment.created_by_id !== user.id) {
      throw new ApiError(403, 'You can only cancel payment requests created by you.');
    }

    return paymentRepository.transaction(async (tx) => {
      const updatedPayment = await tx.payment.update({
        where: { id },
        data: {
          status: PAYMENT_STATUS.CANCELLED,
          remarks: remarks || 'Cancelled by user.',
          updated_by_id: user.id,
        },
      });

      await Promise.all([
        tx.auditLog.create({
          data: {
            entity_type: 'payment',
            entity_id: id,
            action: 'cancelled',
            from_status: payment.status,
            to_status: PAYMENT_STATUS.CANCELLED,
            performed_by_id: user.id,
            remarks: remarks || 'Cancelled by user.',
          },
        }),
        tx.approvalLog.create({
          data: {
            entity_type: 'payment',
            entity_id: id,
            action: 'cancelled',
            from_status: payment.status,
            to_status: PAYMENT_STATUS.CANCELLED,
            performed_by_id: user.id,
            remarks: remarks || 'Cancelled by user.',
          },
        }),
      ]);

      const actorName = `${user.first_name || ''} ${user.last_name || ''}`.trim() || user.role;
      notificationService.notifyPaymentStatusChange(updatedPayment, PAYMENT_STATUS.CANCELLED, actorName, remarks).catch(() => {});

      return decoratePayment(updatedPayment);
    });
  }

  /**
   * Refund a successful payment.
   */
  async refundPayment(id, user, remarks) {
    assertRemarks(remarks, 'refund');
    const payment = await paymentRepository.findById(id);
    if (!payment) {
      throw new ApiError(404, 'Payment not found.');
    }

    if (payment.status !== PAYMENT_STATUS.SUCCESS) {
      throw new ApiError(400, 'Only successful payments can be refunded.');
    }

    if (![ROLES.FINANCE_HEAD, ROLES.SUPER_ADMIN].includes(user.role)) {
      throw new ApiError(403, 'Unauthorized refund access.');
    }

    return paymentRepository.transaction(async (tx) => {
      const updatedPayment = await tx.payment.update({
        where: { id },
        data: {
          status: PAYMENT_STATUS.REFUNDED,
          remarks: remarks.trim(),
          updated_by_id: user.id,
        },
      });

      await Promise.all([
        tx.auditLog.create({
          data: {
            entity_type: 'payment',
            entity_id: id,
            action: 'refunded',
            from_status: PAYMENT_STATUS.SUCCESS,
            to_status: PAYMENT_STATUS.REFUNDED,
            performed_by_id: user.id,
            remarks: remarks.trim(),
          },
        }),
        tx.approvalLog.create({
          data: {
            entity_type: 'payment',
            entity_id: id,
            action: 'refunded',
            from_status: PAYMENT_STATUS.SUCCESS,
            to_status: PAYMENT_STATUS.REFUNDED,
            performed_by_id: user.id,
            remarks: remarks.trim(),
          },
        }),
      ]);

      const invoice = await tx.invoice.findUnique({ where: { id: payment.invoice_id } });
      const refundAmount = Number(payment.amount);
      const newPaid = Math.max(0, Number(invoice.paid_amount) - refundAmount);
      const newRemaining = Math.max(0, Number(invoice.invoice_total) - newPaid);
      let newPaymentStatus = 'PARTIALLY_PAID';
      if (newPaid <= 0.01) {
        newPaymentStatus = 'UNPAID';
      }

      await tx.invoice.update({
        where: { id: payment.invoice_id },
        data: {
          paid_amount: newPaid,
          remaining_amount: newRemaining,
          payment_status: newPaymentStatus,
        },
      });

      const actorName = `${user.first_name || ''} ${user.last_name || ''}`.trim() || user.role;
      notificationService.createNotification(
        payment.created_by_id,
        'payment_refunded',
        '🔄 Payment Refunded',
        `Payment ${payment.payment_number} of ${payment.currency} ${payment.amount} has been refunded by ${actorName}. Remarks: ${remarks}`,
        'payment',
        payment.id,
      ).catch(() => {});

      return decoratePayment(updatedPayment);
    });
  }

  /**
   * Retry a failed payment.
   */
  async retryPayment(id, user) {
    const payment = await paymentRepository.findById(id);
    if (!payment) {
      throw new ApiError(404, 'Payment not found.');
    }

    if (payment.status !== PAYMENT_STATUS.FAILED) {
      throw new ApiError(400, 'Only failed payments can be retried.');
    }

    const updatedPayment = await paymentRepository.transaction(async (tx) => {
      const updated = await tx.payment.update({
        where: { id },
        data: {
          status: PAYMENT_STATUS.INITIATED,
          gateway_status: null,
          response_message: 'Retrying payment...',
          provider_transaction_id: null,
          gateway_reference: null,
          updated_by_id: user.id,
        },
      });

      await tx.auditLog.create({
        data: {
          entity_type: 'payment',
          entity_id: id,
          action: 'retried',
          from_status: PAYMENT_STATUS.FAILED,
          to_status: PAYMENT_STATUS.INITIATED,
          performed_by_id: user.id,
          remarks: 'Payment retry initiated.',
        },
      });

      return updated;
    });

    this.processGatewayPayment(id).catch(console.error);
    return decoratePayment(updatedPayment);
  }

  /**
   * Background payment provider execution logic.
   */
  async processGatewayPayment(paymentId, paymentObj = null) {
    const payment = paymentObj || (await paymentRepository.findById(paymentId));
    if (!payment) return;
    if (payment.status !== PAYMENT_STATUS.INITIATED) return;

    try {
      await paymentRepository.update(paymentId, { status: PAYMENT_STATUS.PROCESSING });

      const provider = providerRegistry.get(payment.payment_provider);
      const gatewayResponse = await provider.process(
        Number(payment.amount),
        payment.currency,
        payment.payment_number,
      );

      await paymentRepository.transaction(async (tx) => {
        const statusMap = {
          SUCCESS: PAYMENT_STATUS.SUCCESS,
          FAILED: PAYMENT_STATUS.FAILED,
        };

        const finalStatus = statusMap[gatewayResponse.status] || PAYMENT_STATUS.FAILED;

        const updatedPayment = await tx.payment.update({
          where: { id: paymentId },
          data: {
            status: finalStatus,
            provider_transaction_id: gatewayResponse.transactionId,
            gateway_reference: gatewayResponse.gatewayReference,
            payment_gateway_response: gatewayResponse.response,
            gateway_status: gatewayResponse.status,
            response_message: gatewayResponse.message,
            payment_date: finalStatus === PAYMENT_STATUS.SUCCESS ? new Date() : null,
          },
        });

        await tx.auditLog.create({
          data: {
            entity_type: 'payment',
            entity_id: paymentId,
            action: finalStatus.toLowerCase(),
            from_status: PAYMENT_STATUS.PROCESSING,
            to_status: finalStatus,
            remarks: `Gateway execution completed. Response: ${gatewayResponse.message}`,
          },
        });

        const invoice = await tx.invoice.findUnique({ where: { id: payment.invoice_id } });
        const successfulPayments = await tx.payment.findMany({
          where: { invoice_id: payment.invoice_id, status: PAYMENT_STATUS.SUCCESS },
        });

        const totalPaid = successfulPayments.reduce((sum, p) => sum + Number(p.amount), 0);
        const remainingAmount = Math.max(0, Number(invoice.invoice_total) - totalPaid);

        let paymentStatus = 'UNPAID';
        if (remainingAmount <= 0.01 && totalPaid > 0) {
          paymentStatus = 'PAID';
        } else if (totalPaid > 0) {
          paymentStatus = 'PARTIALLY_PAID';
        } else if (finalStatus === PAYMENT_STATUS.FAILED && Number(invoice.paid_amount) === 0) {
          paymentStatus = 'PAYMENT_FAILED';
        } else {
          paymentStatus = invoice.payment_status;
        }

        await tx.invoice.update({
          where: { id: payment.invoice_id },
          data: {
            paid_amount: totalPaid,
            remaining_amount: remainingAmount,
            payment_status: paymentStatus,
            last_payment_date: finalStatus === PAYMENT_STATUS.SUCCESS ? new Date() : invoice.last_payment_date,
            last_payment_id: finalStatus === PAYMENT_STATUS.SUCCESS ? paymentId : invoice.last_payment_id,
          },
        });

        notificationService
          .createNotification(
            payment.created_by_id,
            finalStatus === PAYMENT_STATUS.SUCCESS ? 'payment_completed' : 'payment_failed',
            finalStatus === PAYMENT_STATUS.SUCCESS ? ' Payment Success' : ' Payment Failed',
            `Payment request ${payment.payment_number} for amount ${payment.currency} ${payment.amount} has ${finalStatus.toLowerCase()}.`,
            'payment',
            paymentId,
          )
          .catch(() => {});
      });
    } catch (error) {
      console.error(`[PaymentService] Gateway process crash for payment ID ${paymentId}:`, error.message);
      await paymentRepository
        .update(paymentId, {
          status: PAYMENT_STATUS.FAILED,
          response_message: `Gateway execution failed: ${error.message}`,
        })
        .catch(console.error);
    }
  }

  /**
   * TASK 3 — Get Approval & Audit History for a Payment.
   * Merges audit_logs and approval_logs and returns complete timeline.
   */
  async getPaymentHistory(paymentId) {
    const [auditLogs, approvalLogs] = await Promise.all([
      prisma.auditLog.findMany({
        where: { entity_type: 'payment', entity_id: paymentId },
        orderBy: { created_at: 'asc' },
        include: {
          performed_by: {
            select: { id: true, email: true, first_name: true, last_name: true, role: true },
          },
        },
      }),
      approvalRepository.findByEntity('payment', paymentId),
    ]);

    const combined = [...auditLogs, ...approvalLogs].sort(
      (a, b) => new Date(a.created_at) - new Date(b.created_at),
    );

    // Deduplicate entries by timestamp + action
    const seen = new Set();
    const history = [];

    for (const item of combined) {
      const key = `${item.action}-${new Date(item.created_at).getTime()}-${item.performed_by_id}`;
      if (!seen.has(key)) {
        seen.add(key);
        const performer = item.performed_by || item.performedBy;
        const performerName = performer
          ? `${performer.first_name || ''} ${performer.last_name || ''}`.trim() || performer.email
          : 'System';

        history.push({
          id: item.id,
          action: item.action,
          fromStatus: item.from_status || item.fromStatus || null,
          toStatus: item.to_status || item.toStatus || null,
          performedBy: performerName,
          performedById: item.performed_by_id || item.performedById || null,
          role: performer?.role || null,
          remarks: item.remarks || null,
          ipAddress: item.ip_address || null,
          userAgent: item.user_agent || null,
          createdAt: item.created_at,
        });
      }
    }

    return history;
  }

  /**
   * TASK 5 — Live Dashboard Statistics from PostgreSQL.
   * Returns live counts and sums for pending, approved, rejected, today's, and monthly requests.
   */
  async getPaymentStats(user) {
    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    let roleWhere = {};
    if (user.role === ROLES.CASE_MANAGER) {
      roleWhere = { created_by_id: user.id };
    } else if ([ROLES.TEAM_LEAD, ROLES.MANAGER, ROLES.FINANCE_HEAD].includes(user.role)) {
      roleWhere = paymentWhereForApprovalRole(user.role) || {};
    }

    const pendingWhere = {
      ...roleWhere,
      status: PAYMENT_STATUS.PENDING,
    };

    const approvedWhere = {
      ...roleWhere,
      status: { in: [PAYMENT_STATUS.INITIATED, PAYMENT_STATUS.PROCESSING, PAYMENT_STATUS.SUCCESS] },
    };

    const rejectedWhere = {
      ...roleWhere,
      status: { in: [PAYMENT_STATUS.FAILED, PAYMENT_STATUS.RETURNED, PAYMENT_STATUS.CANCELLED] },
    };

    const todayWhere = {
      ...roleWhere,
      created_at: { gte: startOfToday },
    };

    const monthlyWhere = {
      ...roleWhere,
      created_at: { gte: startOfMonth },
    };

    const [pending, approved, rejected, todayRequests, monthlyRequests, pendingSum, totalSum] = await Promise.all([
      prisma.payment.count({ where: pendingWhere }),
      prisma.payment.count({ where: approvedWhere }),
      prisma.payment.count({ where: rejectedWhere }),
      prisma.payment.count({ where: todayWhere }),
      prisma.payment.count({ where: monthlyWhere }),
      prisma.payment.aggregate({ where: pendingWhere, _sum: { amount: true } }),
      prisma.payment.aggregate({ where: roleWhere, _sum: { amount: true } }),
    ]);

    return {
      pending,
      approved,
      rejected,
      todayRequests,
      monthlyRequests,
      pendingAmount: Number(pendingSum._sum.amount || 0),
      totalAmount: Number(totalSum._sum.amount || 0),
      approvalLimits: {
        teamLeadMax: TEAM_LEAD_PAYMENT_APPROVAL_MAX,
        financeHeadMin: FINANCE_HEAD_PAYMENT_APPROVAL_THRESHOLD,
      },
    };
  }

  async getPaymentCreationStats(user) {
    const [pendingApprovals, rejectedApprovals, matchedAndApproved, alreadyPaid, eligible] = await Promise.all([
      prisma.paymentApproval.count({
        where: {
          status: 'PENDING',
          ...(user.role === ROLES.CASE_MANAGER && { requested_by_id: user.id }),
        },
      }),
      prisma.paymentApproval.count({
        where: {
          status: 'REJECTED',
          ...(user.role === ROLES.CASE_MANAGER && { requested_by_id: user.id }),
        },
      }),
      prisma.invoice.count({
        where: {
          status: 'APPROVED',
          three_way_match_status: 'MATCHED',
          deleted_at: null,
          ...(user.role === ROLES.CASE_MANAGER && { created_by_id: user.id }),
        },
      }),
      prisma.invoice.count({
        where: {
          payment_status: 'PAID',
          deleted_at: null,
          ...(user.role === ROLES.CASE_MANAGER && { created_by_id: user.id }),
        },
      }),
      prisma.invoice.count({
        where: {
          status: 'APPROVED',
          three_way_match_status: 'MATCHED',
          payment_status: { not: 'PAID' },
          remaining_amount: { gt: 0 },
          deleted_at: null,
          payment_approvals: {
            some: {
              status: 'APPROVED',
            },
          },
          ...(user.role === ROLES.CASE_MANAGER && { created_by_id: user.id }),
        },
      }),
    ]);

    return {
      pendingApproval: pendingApprovals,
      rejected: rejectedApprovals,
      matchedApproved: matchedAndApproved,
      alreadyPaid: alreadyPaid,
      eligibleForPayment: eligible,
    };
  }
}

export default new PaymentService();

// approved_at: new Date()
// notifyPaymentApprovalRequested


