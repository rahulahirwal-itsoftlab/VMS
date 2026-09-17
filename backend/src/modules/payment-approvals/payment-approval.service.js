import ApiError from '../../utils/ApiError.js';
import paymentApprovalRepository from './payment-approval.repository.js';
import notificationService from '../notifications/notification.service.js';
import prisma from '../../config/prisma.js';
import { ROLES } from '../../zodSchema/index.js';
import {
  getRequiredPaymentApprovalRole,
  TEAM_LEAD_PAYMENT_APPROVAL_MAX,
  FINANCE_HEAD_PAYMENT_APPROVAL_THRESHOLD,
} from '../payments/payment.service.js';

// ─── Approval Status Constants ────────────────────────────────────────────────
export const PAYMENT_APPROVAL_STATUS = {
  PENDING:  'PENDING',
  APPROVED: 'APPROVED',
  REJECTED: 'REJECTED',
};

// ─── History Action Constants ─────────────────────────────────────────────────
export const APPROVAL_ACTIONS = {
  REQUESTED:         'REQUESTED',
  ASSIGNED:          'ASSIGNED',
  NOTIFICATION_SENT: 'NOTIFICATION_SENT',
  APPROVED:          'APPROVED',
  REJECTED:          'REJECTED',
};

/**
 * Find the first active user with the given role.
 * Accepts an optional Prisma transaction client so the lookup runs inside the
 * same snapshot as the surrounding transaction — preventing race conditions.
 *
 * @param {string} role - The required role string
 * @param {object|null} tx - Optional Prisma transaction client
 */
export const findEligibleApprover = async (role, tx = null) => {
  const client = tx || prisma;
  const user = await client.user.findFirst({
    where: { role, status: 'ACTIVE', deleted_at: null },
    select: { id: true, email: true, first_name: true, last_name: true, role: true },
    orderBy: { created_at: 'asc' },
  });

  return user;
};

/**
 * Decorate a PaymentApproval record for API response.
 */
const decorateApproval = (approval) => {
  if (!approval) return null;

  const approverName = approval.approver
    ? `${approval.approver.first_name || ''} ${approval.approver.last_name || ''}`.trim() || approval.approver.email
    : null;

  const requestedByName = approval.requested_by
    ? `${approval.requested_by.first_name || ''} ${approval.requested_by.last_name || ''}`.trim() || approval.requested_by.email
    : null;

  const approvedByName = approval.approved_by
    ? `${approval.approved_by.first_name || ''} ${approval.approved_by.last_name || ''}`.trim() || approval.approved_by.email
    : null;

  const rejectedByName = approval.rejected_by
    ? `${approval.rejected_by.first_name || ''} ${approval.rejected_by.last_name || ''}`.trim() || approval.rejected_by.email
    : null;

  // Extract document snapshots from Three-Way Match if available
  const match = approval.three_way_match;
  const grnSnap = match?.grn_snapshot || match?.grnSnapshot;
  const dcSnap = match?.delivery_challan_snapshot || match?.deliveryChallanSnapshot;
  const invSnap = match?.invoice_snapshot || match?.invoiceSnapshot;

  const invoiceAmount = Number(approval.invoice?.invoice_total || approval.invoice?.amount || approval.amount || 0);
  const previouslyPaidAmount = Number(approval.invoice?.paid_amount || 0);
  const remainingPayableAmount = Math.max(0, invoiceAmount - previouslyPaidAmount);

  return {
    id: approval.id,
    paymentId: approval.payment_id,
    paymentNumber: approval.payment?.payment_number || null,
    invoiceId: approval.invoice_id,
    invoiceNumber: approval.invoice?.invoice_number || approval.payment?.invoice?.invoice_number || null,
    invoiceDate: approval.invoice?.invoice_date || invSnap?.invoiceDate || null,
    purchaseOrderId: approval.purchase_order_id,
    poNumber: approval.purchase_order?.po_number || approval.payment?.purchase_order?.po_number || null,
    poDate: approval.purchase_order?.order_date || null,
    poTotal: Number(approval.purchase_order?.amount || 0),
    vendorId: approval.vendor_id,
    vendorName: approval.vendor?.name || approval.payment?.vendor?.name || null,
    vendorCode: approval.vendor?.vendor_code || approval.payment?.vendor?.vendor_code || null,
    vendorGstin: approval.vendor?.gst_number || approval.vendor?.gstin || null,

    // GRN & Delivery Challan Details
    grnNumber: grnSnap?.grnNumber || grnSnap?.grn_number || null,
    grnDate: grnSnap?.receivedDate || grnSnap?.delivery_date || null,
    deliveryChallanNumber: dcSnap?.deliveryChallanNumber || dcSnap?.delivery_challan_number || null,
    deliveryChallanDate: dcSnap?.deliveryDate || dcSnap?.delivery_date || null,

    // Three-Way Matching Details
    threeWayMatchId: approval.three_way_match_id,
    threeWayMatchStatus: match?.status || 'MATCHED',
    threeWayMatchPercentage: match?.match_percentage || 100,
    matchedAmount: invSnap?.summary?.matchedAmount ?? invoiceAmount,
    varianceAmount: invSnap?.summary?.varianceAmount ?? 0,
    unmatchedFields: match?.unmatched_fields || [],
    warnings: match?.warnings || [],

    // Financial Balances
    amount: Number(approval.amount),
    currency: approval.currency || 'INR',
    previouslyPaidAmount,
    remainingPayableAmount,

    // Workflow & Role Details
    approvalLevel: approval.approval_level,
    requiredRole: approval.required_role,
    approverId: approval.approver_id,
    approverName,
    approverEmail: approval.approver?.email || null,
    approverEmployeeId: approval.approver?.employee_id || null,
    status: approval.status,
    requestedAmount: Number(approval.amount),
    approvalStatus: approval.status,
    assignedRole: approval.required_role,
    assignedUser: approverName,
    remarks: approval.remarks,
    rejectionReason: approval.rejection_reason,
    requestedById: approval.requested_by_id,
    requestedBy: requestedByName,
    requestedAt: approval.requested_at,
    approvedById: approval.approved_by_id,
    approvedBy: approvedByName,
    approvedAt: approval.approved_at,
    rejectedById: approval.rejected_by_id,
    rejectedBy: rejectedByName,
    rejectedAt: approval.rejected_at,
    createdAt: approval.created_at,
    updatedAt: approval.updated_at,
    history: (approval.history || []).map((h) => ({
      id: h.id,
      action: h.action,
      previousStatus: h.previous_status,
      newStatus: h.new_status,
      performedById: h.performed_by_id,
      performedBy: h.performed_by
        ? `${h.performed_by.first_name || ''} ${h.performed_by.last_name || ''}`.trim() || h.performed_by.email
        : 'System',
      performedByRole: h.performed_by?.role || null,
      remarks: h.remarks,
      createdAt: h.created_at,
    })),
  };
};

class PaymentApprovalService {

  /**
   * Create a PaymentApproval record for an invoice (pre-payment approval workflow).
   * Must be called INSIDE a Prisma transaction (tx).
   *
   * Idempotent: If a PENDING approval already exists for this invoice, returns
   * the existing one instead of creating a duplicate.
   *
   * @param {object} invoice   - The invoice record (must have id, invoice_total, amount, currency, vendor_id, purchase_order_id)
   * @param {object} requestedByUser - The user initiating (Case Manager or System)
   * @param {object} tx        - Prisma transaction client (REQUIRED)
   * @param {string|null} threeWayMatchId - The ThreeWayMatch ID to link (optional, auto-resolved if null)
   * @returns {{ approval, approver, alreadyExisted: boolean }}
   */
  async createPaymentApprovalForInvoice(invoice, requestedByUser, tx, threeWayMatchId = null) {
    // ── Idempotency Guard ────────────────────────────────────────────────────
    // Check if a PENDING approval already exists for this invoice.
    // This prevents duplicates when matching is re-run or adminApproveMatching
    // is called after startMatching already created an approval.
    const existingPending = await paymentApprovalRepository.findPendingByInvoiceId(invoice.id, tx);
    if (existingPending) {
      console.log(
        `[PaymentApprovalService] Idempotency: PENDING approval ${existingPending.id} already exists for invoice ${invoice.id}. Skipping creation.`,
      );
      // Resolve the approver from the existing record so the caller can send notification
      const existingApprover = await (tx || prisma).user.findUnique({
        where: { id: existingPending.approver_id },
        select: { id: true, email: true, first_name: true, last_name: true, role: true },
      });
      return { approval: existingPending, approver: existingApprover, alreadyExisted: true };
    }

    // ── Amount & Role Determination ──────────────────────────────────────────
    // Use invoice_total as the authoritative payable amount (set from line items).
    // Fall back to invoice.amount (the original amount field) if invoice_total is missing.
    const amount = Number(invoice.invoice_total || invoice.amount || 0);
    const currency = invoice.currency || 'INR';

    if (amount <= 0) {
      throw new ApiError(400, `Cannot create payment approval: invoice amount is ${amount}. Invoice ID: ${invoice.id}`);
    }

    // 1. Determine required role based on amount thresholds (env-driven, not hardcoded)
    const requiredRole = getRequiredPaymentApprovalRole(amount, currency);

    // 2. Find the first active user with that role (within the same tx snapshot)
    let approver = await findEligibleApprover(requiredRole, tx);
    let usedRole = requiredRole;

    if (!approver) {
      // Fallback: try FINANCE_HEAD if primary role not found
      approver = await findEligibleApprover(ROLES.FINANCE_HEAD, tx);
      if (!approver) {
        throw new ApiError(
          500,
          `No active ${requiredRole} user found to assign payment approval. ` +
          `Please ensure at least one active ${requiredRole} user exists in the system.`,
        );
      }
      console.warn(
        `[PaymentApprovalService] No active ${requiredRole} found — falling back to FINANCE_HEAD (${approver.email}) for invoice ${invoice.id}`,
      );
      usedRole = ROLES.FINANCE_HEAD;
    }

    // 3. Resolve ThreeWayMatch ID (use provided value or auto-resolve from DB)
    const resolvedMatchId = threeWayMatchId || await (async () => {
      const latestMatch = await (tx || prisma).threeWayMatch.findFirst({
        where: { invoice_id: invoice.id, status: 'MATCHED' },
        orderBy: { created_at: 'desc' },
        select: { id: true },
      });
      return latestMatch?.id || null;
    })();

    const client = tx || prisma;

    // 4. Create PaymentApproval record inside the transaction
    const approval = await client.paymentApproval.create({
      data: {
        payment_id:         null, // No payment record yet — created later when payment is initiated
        invoice_id:         invoice.id,
        purchase_order_id:  invoice.purchase_order_id,
        vendor_id:          invoice.vendor_id,
        three_way_match_id: resolvedMatchId,
        amount:             amount,
        currency:           currency,
        approval_level:     1,
        required_role:      usedRole,
        approver_id:        approver.id,
        status:             PAYMENT_APPROVAL_STATUS.PENDING,
        requested_by_id:    requestedByUser?.id || null,
        requested_at:       new Date(),
      },
    });

    // 5. Create history entries (audit trail for REQUESTED + ASSIGNED)
    await client.paymentApprovalHistory.createMany({
      data: [
        {
          payment_approval_id: approval.id,
          payment_id:          null,
          invoice_id:          invoice.id,
          action:              APPROVAL_ACTIONS.REQUESTED,
          previous_status:     null,
          new_status:          PAYMENT_APPROVAL_STATUS.PENDING,
          performed_by_id:     requestedByUser?.id || null,
          remarks:             `Payment approval requested for ${currency} ${amount.toLocaleString('en-IN')}. Required role: ${usedRole}.`,
        },
        {
          payment_approval_id: approval.id,
          payment_id:          null,
          invoice_id:          invoice.id,
          action:              APPROVAL_ACTIONS.ASSIGNED,
          previous_status:     null,
          new_status:          PAYMENT_APPROVAL_STATUS.PENDING,
          performed_by_id:     null,
          remarks:             `Approval auto-assigned to ${approver.first_name || ''} ${approver.last_name || ''} (${usedRole}) — ${approver.email}`,
        },
      ],
    });

    console.log(
      `[PaymentApprovalService] Created PaymentApproval ${approval.id} for invoice ${invoice.id}. ` +
      `Amount: ${currency} ${amount}. Role: ${usedRole}. Approver: ${approver.email}`,
    );

    return { approval, approver, alreadyExisted: false };
  }

  // ────────────────────────────────────────────────────────────────────────────
  // CREATE PAYMENT APPROVAL
  // Called INSIDE a Prisma transaction from payment.service.js createPayment().
  // Order: 1) Resolve approver → 2) Create record → 3) Create history → return.
  // Notification is sent OUTSIDE this transaction, AFTER commit succeeds.
  // ────────────────────────────────────────────────────────────────────────────

  /**
   * Create a PaymentApproval record for a payment.
   * Must be called INSIDE a Prisma transaction (tx).
   *
   * @param {object} payment - The payment record (must have id, invoice_id, vendor_id, purchase_order_id, amount, currency)
   * @param {object} requestedByUser - The user creating the payment (Case Manager)
   * @param {object} tx - Prisma transaction client
   * @param {string|null} threeWayMatchId - The matched ThreeWayMatch ID if available
   * @returns {PaymentApproval} The created approval record
   */
  async createPaymentApproval(payment, requestedByUser, tx, threeWayMatchId = null) {
    const amount = Number(payment.amount || 0);
    const currency = payment.currency || 'INR';

    // 1. Determine required role based on amount
    const requiredRole = getRequiredPaymentApprovalRole(amount, currency);

    // 2. Find the first active user with that role
    const approver = await findEligibleApprover(requiredRole);

    if (!approver) {
      // Fallback: try FINANCE_HEAD if primary role not found
      const fallbackApprover = await findEligibleApprover(ROLES.FINANCE_HEAD);
      if (!fallbackApprover) {
        throw new ApiError(
          500,
          `No active ${requiredRole} user found to assign payment approval. Please create an active ${requiredRole} user.`,
        );
      }
      return this._createApprovalRecord(payment, requestedByUser, fallbackApprover, ROLES.FINANCE_HEAD, 1, tx, threeWayMatchId);
    }

    return this._createApprovalRecord(payment, requestedByUser, approver, requiredRole, 1, tx, threeWayMatchId);
  }

  /**
   * Internal: creates the actual PaymentApproval and history records inside a transaction.
   */
  async _createApprovalRecord(payment, requestedByUser, approver, requiredRole, approvalLevel, tx, threeWayMatchId) {
    // 3. Create PaymentApproval record
    const approval = await tx.paymentApproval.create({
      data: {
        payment_id:        payment.id,
        invoice_id:        payment.invoice_id,
        purchase_order_id: payment.purchase_order_id,
        vendor_id:         payment.vendor_id,
        three_way_match_id: threeWayMatchId || null,
        amount:            Number(payment.amount),
        currency:          payment.currency || 'INR',
        approval_level:    approvalLevel,
        required_role:     requiredRole,
        approver_id:       approver.id,
        status:            PAYMENT_APPROVAL_STATUS.PENDING,
        requested_by_id:   requestedByUser?.id || null,
        requested_at:      new Date(),
      },
    });

    // 4. Create initial history record
    await tx.paymentApprovalHistory.create({
      data: {
        payment_approval_id: approval.id,
        payment_id:          payment.id,
        invoice_id:          payment.invoice_id,
        action:              APPROVAL_ACTIONS.REQUESTED,
        previous_status:     null,
        new_status:          PAYMENT_APPROVAL_STATUS.PENDING,
        performed_by_id:     requestedByUser?.id || null,
        remarks:             `Payment approval requested. Required role: ${requiredRole}. Assigned to: ${approver.email}.`,
      },
    });

    await tx.paymentApprovalHistory.create({
      data: {
        payment_approval_id: approval.id,
        payment_id:          payment.id,
        invoice_id:          payment.invoice_id,
        action:              APPROVAL_ACTIONS.ASSIGNED,
        previous_status:     null,
        new_status:          PAYMENT_APPROVAL_STATUS.PENDING,
        performed_by_id:     null,
        remarks:             `Approval assigned to ${approver.first_name || ''} ${approver.last_name || ''} (${approver.role}) — ${approver.email}`,
      },
    });

    return { approval, approver };
  }

  // ────────────────────────────────────────────────────────────────────────────
  // SEND NOTIFICATION (after transaction commit)
  // ────────────────────────────────────────────────────────────────────────────

  /**
   * Send a notification to the assigned approver.
   * Supports passing an optional transaction client tx.
   */
  async sendApprovalNotification(approval, approver, tx = null) {
    try {
      await notificationService.notifyPaymentApprovalAssigned(approval, approver, tx);

      // Log notification sent in history
      await paymentApprovalRepository.createHistory({
        payment_approval_id: approval.id,
        payment_id:          approval.payment_id,
        invoice_id:          approval.invoice_id,
        action:              APPROVAL_ACTIONS.NOTIFICATION_SENT,
        previous_status:     PAYMENT_APPROVAL_STATUS.PENDING,
        new_status:          PAYMENT_APPROVAL_STATUS.PENDING,
        performed_by_id:     null,
        remarks:             `Notification sent to approver ${approver.email}`,
      }, tx);
    } catch (err) {
      console.error('[PaymentApprovalService] Failed to send approval notification:', err?.message);
      throw err;
    }
  }

  // ────────────────────────────────────────────────────────────────────────────
  // GET MY APPROVALS (for logged-in approver)
  // ────────────────────────────────────────────────────────────────────────────

  /**
   * Get all PaymentApprovals assigned to or reviewable by the currently logged-in user.
   * Supports: TEAM_LEAD, MANAGER, FINANCE_HEAD, SUPER_ADMIN, CASE_MANAGER
   */
  async getMyApprovals(user, query = {}) {
    const page  = Math.max(1, parseInt(query.page  || 1));
    const limit = Math.min(100, Math.max(1, parseInt(query.limit || 20)));
    const status = query.status || null;

    let where = {};

    if (user.role === ROLES.SUPER_ADMIN) {
      // SUPER_ADMIN sees all approvals
      where = status ? { status } : {};
    } else if ([ROLES.TEAM_LEAD, ROLES.MANAGER, ROLES.FINANCE_HEAD].includes(user.role)) {
      // Approvers see approvals assigned directly to them OR matching their role
      where = {
        OR: [
          { approver_id: user.id },
          { required_role: user.role },
        ],
        ...(status && { status }),
      };
    } else {
      // Case Manager sees approvals requested by them
      where = {
        requested_by_id: user.id,
        ...(status && { status }),
      };
    }

    const result = await paymentApprovalRepository.findAll({
      where,
      skip: (page - 1) * limit,
      take: limit,
    });

    return {
      approvals: result.approvals.map(decorateApproval),
      total: result.total,
      page,
      limit,
      totalPages: Math.ceil(result.total / limit),
    };
  }

  /**
   * Get a single PaymentApproval by ID.
   * Access control: approver, required_role matching, requested_by, or SUPER_ADMIN.
   */
  async getApprovalById(id, user) {
    const approval = await paymentApprovalRepository.findById(id);
    if (!approval) throw new ApiError(404, 'Payment Approval not found.');

    // Access check
    const canView =
      user.role === ROLES.SUPER_ADMIN ||
      approval.approver_id === user.id ||
      approval.required_role === user.role ||
      approval.requested_by_id === user.id;

    if (!canView) throw new ApiError(403, 'You do not have permission to view this approval.');

    return decorateApproval(approval);
  }

  // ────────────────────────────────────────────────────────────────────────────
  // APPROVE
  // ────────────────────────────────────────────────────────────────────────────

  /**
   * Approve a PaymentApproval.
   * Verifies: auth → authorized role → status PENDING → 3WM MATCHED → updates DB & Invoice.
   */
  async approvePaymentApproval(approvalId, user, remarks = '') {
    const approval = await paymentApprovalRepository.findById(approvalId);
    if (!approval) throw new ApiError(404, 'Payment Approval not found.');

    if (approval.status !== PAYMENT_APPROVAL_STATUS.PENDING) {
      throw new ApiError(400, `This approval is already ${approval.status}. Only PENDING approvals can be approved.`);
    }

    // Role-based authorization assertion (Step 8):
    // CASE_MANAGER cannot approve. TEAM_LEAD can only approve TEAM_LEAD level, etc.
    if (user.role === ROLES.CASE_MANAGER) {
      throw new ApiError(403, 'Case Managers are not authorized to approve payment requests.');
    }

    const isAuthorizedApprover =
      user.role === ROLES.SUPER_ADMIN ||
      approval.approver_id === user.id ||
      approval.required_role === user.role;

    if (!isAuthorizedApprover) {
      throw new ApiError(403, `You are not authorized to approve this payment request. Required role: ${approval.required_role}, Your role: ${user.role}.`);
    }

    // Three-Way Matching verification: Must be MATCHED
    const matchStatus = approval.three_way_match?.status;
    if (matchStatus && matchStatus !== 'MATCHED') {
      throw new ApiError(400, `Cannot approve: Three-Way Matching status is ${matchStatus}. Only MATCHED invoices can be approved.`);
    }

    // Verify Invoice exists and is not CANCELLED or PAID
    const linkedInvoice = approval.invoice;
    if (!linkedInvoice) {
      throw new ApiError(404, 'Linked invoice not found for this approval.');
    }
    if (linkedInvoice.status === 'CANCELLED') {
      throw new ApiError(400, 'Cannot approve payment: linked invoice is CANCELLED.');
    }
    if (linkedInvoice.status === 'PAID') {
      throw new ApiError(400, 'Cannot approve payment: linked invoice is already PAID.');
    }

    const now = new Date();
    const finalRemarks = String(remarks || '').trim() || `Approved by ${user.first_name || ''} ${user.last_name || ''} (${user.role})`;

    await paymentApprovalRepository.transaction(async (tx) => {
      // 1. Update PaymentApproval
      await tx.paymentApproval.update({
        where: { id: approvalId },
        data: {
          status:        PAYMENT_APPROVAL_STATUS.APPROVED,
          approved_by_id: user.id,
          approved_at:   now,
          remarks:       finalRemarks,
        },
      });

      // 2. Update Invoice status to APPROVED (eligible for payment creation)
      await tx.invoice.update({
        where: { id: approval.invoice_id },
        data: {
          status:                 'APPROVED',
          current_approval_level: null,
          final_approved_at:      now,
          ...(user.role === ROLES.TEAM_LEAD && { team_lead_approver_id: user.id, team_lead_approved_at: now }),
          ...(user.role === ROLES.MANAGER && { manager_approver_id: user.id, manager_approved_at: now }),
          ...(user.role === ROLES.FINANCE_HEAD && { finance_head_approver_id: user.id, finance_head_approved_at: now }),
        },
      });

      // 3. Update related Payment approval_status (if linked)
      if (approval.payment_id) {
        await tx.payment.update({
          where: { id: approval.payment_id },
          data: {
            approval_status: 'APPROVED',
            approved_by_id:  user.id,
            approved_at:     now,
            ...(approval.payment?.status === 'PENDING_APPROVAL' && { status: 'PENDING' }),
          },
        });
      }

      // 4. Create audit log
      await tx.auditLog.create({
        data: {
          entity_type:     'payment_approval',
          entity_id:       approvalId,
          action:          'payment_approval_approved',
          from_status:     PAYMENT_APPROVAL_STATUS.PENDING,
          to_status:       PAYMENT_APPROVAL_STATUS.APPROVED,
          performed_by_id: user.id,
          remarks:         finalRemarks,
        },
      });

      // 5. Create history
      await tx.paymentApprovalHistory.create({
        data: {
          payment_approval_id: approvalId,
          payment_id:          approval.payment_id,
          invoice_id:          approval.invoice_id,
          action:              APPROVAL_ACTIONS.APPROVED,
          previous_status:     PAYMENT_APPROVAL_STATUS.PENDING,
          new_status:          PAYMENT_APPROVAL_STATUS.APPROVED,
          performed_by_id:     user.id,
          remarks:             finalRemarks,
        },
      });
    });

    // 6. Send notification to stakeholders (Case Manager & original requester) — after transaction
    const fullApproval = await paymentApprovalRepository.findById(approvalId);
    notificationService.notifyPaymentApprovalResult(fullApproval, 'APPROVED', user).catch(() => {});

    return decorateApproval(fullApproval);
  }

  // ────────────────────────────────────────────────────────────────────────────
  // REJECT
  // ────────────────────────────────────────────────────────────────────────────

  /**
   * Reject a PaymentApproval.
   * Rejection reason is REQUIRED.
   */
  async rejectPaymentApproval(approvalId, user, rejectionReason = '') {
    if (!rejectionReason?.trim()) {
      throw new ApiError(400, 'Rejection reason is required to reject a payment approval.');
    }

    const approval = await paymentApprovalRepository.findById(approvalId);
    if (!approval) throw new ApiError(404, 'Payment Approval not found.');

    if (approval.status !== PAYMENT_APPROVAL_STATUS.PENDING) {
      throw new ApiError(400, `This approval is already ${approval.status}. Only PENDING approvals can be rejected.`);
    }

    // Role-based authorization assertion
    if (user.role === ROLES.CASE_MANAGER) {
      throw new ApiError(403, 'Case Managers are not authorized to reject payment requests.');
    }

    const isAuthorizedApprover =
      user.role === ROLES.SUPER_ADMIN ||
      approval.approver_id === user.id ||
      approval.required_role === user.role;

    if (!isAuthorizedApprover) {
      throw new ApiError(403, `You are not authorized to reject this payment request. Required role: ${approval.required_role}, Your role: ${user.role}.`);
    }

    const now = new Date();
    const cleanReason = rejectionReason.trim();

    await paymentApprovalRepository.transaction(async (tx) => {
      // 1. Update PaymentApproval
      await tx.paymentApproval.update({
        where: { id: approvalId },
        data: {
          status:           PAYMENT_APPROVAL_STATUS.REJECTED,
          rejected_by_id:   user.id,
          rejected_at:      now,
          rejection_reason: cleanReason,
        },
      });

      // 2. Update Invoice status to REJECTED
      await tx.invoice.update({
        where: { id: approval.invoice_id },
        data: {
          status:           'REJECTED',
          rejection_reason: cleanReason,
        },
      });

      // 3. Update related Payment approval_status to REJECTED (if linked)
      if (approval.payment_id) {
        await tx.payment.update({
          where: { id: approval.payment_id },
          data: {
            approval_status: 'REJECTED',
            status:          'FAILED',
          },
        });
      }

      // 4. Create audit log
      await tx.auditLog.create({
        data: {
          entity_type:     'payment_approval',
          entity_id:       approvalId,
          action:          'payment_approval_rejected',
          from_status:     PAYMENT_APPROVAL_STATUS.PENDING,
          to_status:       PAYMENT_APPROVAL_STATUS.REJECTED,
          performed_by_id: user.id,
          remarks:         `Rejected: ${cleanReason}`,
        },
      });

      // 5. Create history
      await tx.paymentApprovalHistory.create({
        data: {
          payment_approval_id: approvalId,
          payment_id:          approval.payment_id,
          invoice_id:          approval.invoice_id,
          action:              APPROVAL_ACTIONS.REJECTED,
          previous_status:     PAYMENT_APPROVAL_STATUS.PENDING,
          new_status:          PAYMENT_APPROVAL_STATUS.REJECTED,
          performed_by_id:     user.id,
          remarks:             cleanReason,
        },
      });
    });

    // 6. Send notification to payment requester — after transaction
    const fullApproval = await paymentApprovalRepository.findById(approvalId);
    notificationService.notifyPaymentApprovalResult(fullApproval, 'REJECTED', user).catch(() => {});

    return decorateApproval(fullApproval);
  }

  // ────────────────────────────────────────────────────────────────────────────
  // GET APPROVAL HISTORY
  // ────────────────────────────────────────────────────────────────────────────

  async getApprovalHistory(approvalId, user) {
    const approval = await paymentApprovalRepository.findById(approvalId);
    if (!approval) throw new ApiError(404, 'Payment Approval not found.');

    const canView =
      user.role === ROLES.SUPER_ADMIN ||
      approval.approver_id === user.id ||
      approval.requested_by_id === user.id ||
      [ROLES.TEAM_LEAD, ROLES.MANAGER, ROLES.FINANCE_HEAD].includes(user.role);

    if (!canView) throw new ApiError(403, 'Access denied.');

    const history = await paymentApprovalRepository.findHistory(approvalId);
    return history.map((h) => ({
      id:              h.id,
      action:          h.action,
      previousStatus:  h.previous_status,
      newStatus:       h.new_status,
      performedById:   h.performed_by_id,
      performedBy:     h.performed_by
        ? `${h.performed_by.first_name || ''} ${h.performed_by.last_name || ''}`.trim() || h.performed_by.email
        : 'System',
      performedByRole: h.performed_by?.role || null,
      remarks:         h.remarks,
      createdAt:       h.created_at,
    }));
  }

  // ────────────────────────────────────────────────────────────────────────────
  // GET APPROVALS BY PAYMENT
  // ────────────────────────────────────────────────────────────────────────────

  async getApprovalsByPaymentId(paymentId) {
    const approvals = await paymentApprovalRepository.findByPaymentId(paymentId);
    return approvals.map(decorateApproval);
  }

  // ────────────────────────────────────────────────────────────────────────────
  // GET APPROVALS BY INVOICE ID
  // Allows frontend to load payment approvals from an invoice detail page
  // without hardcoding any IDs.
  // ────────────────────────────────────────────────────────────────────────────

  /**
   * Get all PaymentApprovals linked to an invoice.
   * Access: SUPER_ADMIN sees all; approver/requester sees their own; TEAM_LEAD/MANAGER/FINANCE_HEAD see all.
   */
  async getApprovalsByInvoiceId(invoiceId, user) {
    const canViewAll =
      user.role === ROLES.SUPER_ADMIN ||
      [ROLES.TEAM_LEAD, ROLES.MANAGER, ROLES.FINANCE_HEAD].includes(user.role);

    const where = {
      invoice_id: invoiceId,
      ...(!canViewAll && {
        OR: [
          { approver_id: user.id },
          { requested_by_id: user.id },
        ],
      }),
    };

    const result = await paymentApprovalRepository.findAll({ where, skip: 0, take: 50 });
    return result.approvals.map(decorateApproval);
  }

  // ────────────────────────────────────────────────────────────────────────────
  // GET APPROVAL CONFIGURATION
  // Returns env-driven thresholds so the frontend never needs to hardcode them.
  // ────────────────────────────────────────────────────────────────────────────

  /**
   * Return the current approval routing thresholds from environment config.
   */
  getApprovalConfig() {
    const teamLeadMax = Number(process.env.TEAM_LEAD_PAYMENT_APPROVAL_MAX || 10000);
    const financeHeadMin = Number(process.env.FINANCE_HEAD_PAYMENT_APPROVAL_THRESHOLD || 100000);
    return {
      currency: 'INR',
      tiers: [
        {
          role: ROLES.TEAM_LEAD,
          label: 'Team Lead',
          minAmount: 0,
          maxAmount: teamLeadMax,
          description: `Up to ₹${teamLeadMax.toLocaleString('en-IN')}`,
        },
        {
          role: ROLES.MANAGER,
          label: 'Manager',
          minAmount: teamLeadMax + 1,
          maxAmount: financeHeadMin - 1,
          description: `₹${(teamLeadMax + 1).toLocaleString('en-IN')} – ₹${(financeHeadMin - 1).toLocaleString('en-IN')}`,
        },
        {
          role: ROLES.FINANCE_HEAD,
          label: 'Finance Head',
          minAmount: financeHeadMin,
          maxAmount: null,
          description: `₹${financeHeadMin.toLocaleString('en-IN')} and above`,
        },
      ],
      teamLeadMax,
      financeHeadMin,
    };
  }
}

export default new PaymentApprovalService();
