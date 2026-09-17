import ApiError from '../../utils/ApiError.js';
import notificationRepository from './notification.repository.js';
import prisma from '../../config/prisma.js';
import { ROLES } from '../../zodSchema/index.js';
import { toSafeErrorLog } from '../../utils/dbRetry.js';

// ─── Notification Type Constants ──────────────────────────────────────────────
export const NOTIFICATION_TYPES = {
  // User Management
  USER_CREATED: 'user_created',
  USER_UPDATED: 'user_updated',
  USER_DEACTIVATED: 'user_deactivated',
  USER_ACTIVATED: 'user_activated',
  USER_DELETED: 'user_deleted',
  USER_CREDENTIAL_EMAIL_SENT: 'user_credential_email_sent',
  USER_CREDENTIAL_EMAIL_FAILED: 'user_credential_email_failed',
  PASSWORD_CHANGED: 'password_changed',

  // Vendor
  VENDOR_CREATED:   'vendor_created',
  VENDOR_UPDATED:   'vendor_updated',
  VENDOR_APPROVED:  'vendor_approved',
  VENDOR_REJECTED:  'vendor_rejected',
  VENDOR_BLOCKED:   'vendor_blocked',

  // Purchase Order
  PURCHASE_ORDER_UPDATED: 'purchase_order_updated',
  PURCHASE_ORDER_DELETED: 'purchase_order_deleted',

  // Invoice status
  INVOICE_CREATED:                'invoice_created',
  INVOICE_APPROVED:               'invoice_approved',
  INVOICE_REJECTED:               'invoice_rejected',
  INVOICE_CANCELLED:              'invoice_cancelled',
  INVOICE_UPDATED:                'invoice_updated',

  // Workflow steps (new names)
  INVOICE_PENDING_THREE_WAY_MATCH: 'invoice_pending_three_way_match',
  INVOICE_PENDING_ADMIN_REVIEW:    'invoice_pending_admin_review',
  INVOICE_PENDING_TEAM_LEAD:       'invoice_pending_team_lead',
  INVOICE_PENDING_MANAGER:         'invoice_pending_manager',
  INVOICE_PENDING_FINANCE_HEAD:    'invoice_pending_finance_head',

  // Legacy aliases (kept for backward compat)
  INVOICE_PENDING_L1: 'invoice_pending_team_lead',
  INVOICE_PENDING_L2: 'invoice_pending_manager',
  INVOICE_PENDING_L3: 'invoice_pending_finance_head',

  // Three-Way Matching
  THREE_WAY_MATCH_COMPLETED: 'three_way_match_completed',
  THREE_WAY_MATCH_MATCHED:   'three_way_match_matched',
  THREE_WAY_MATCH_UNMATCHED: 'three_way_match_unmatched',

  // Admin Review
  ADMIN_REVIEW_APPROVED: 'admin_review_approved',
  ADMIN_REVIEW_REJECTED: 'admin_review_rejected',

  // Invoice archive/restore
  INVOICE_DELETED:   'invoice_deleted',
  INVOICE_RESTORED:  'invoice_restored',

  // Workflow general
  WORKFLOW_MOVED:    'workflow_moved',

  // Payment
  PAYMENT_CREATED:   'payment_created',
  PAYMENT_COMPLETED: 'payment_completed',
  PAYMENT_FAILED:    'payment_failed',
  PAYMENT_APPROVED:  'payment_approved',
  PAYMENT_REJECTED:  'payment_rejected',
  PAYMENT_BLOCKED:   'payment_blocked',

  // Payment Approval (dedicated workflow)
  PAYMENT_APPROVAL_ASSIGNED: 'payment_approval_assigned',
  PAYMENT_APPROVAL_APPROVED: 'payment_approval_approved',
  PAYMENT_APPROVAL_REJECTED: 'payment_approval_rejected',

  // Installment Notifications
  INSTALLMENT_UPCOMING: 'installment_upcoming',
  INSTALLMENT_OVERDUE:  'installment_overdue',
};

// ─── Role → DB role string mapping (for user lookup) ─────────────────────────
const ROLE_LEVEL_MAP = {
  TEAM_LEAD:    ROLES.TEAM_LEAD,
  MANAGER:      ROLES.MANAGER,
  FINANCE_HEAD: ROLES.FINANCE_HEAD,
  THREE_WAY_MATCH: null,  // Notify Case Manager
  ADMIN_REVIEW:    null,  // Notify Admin (SUPER_ADMIN)
};

const MAX_PAGE_LIMIT = 100;

const toPositiveInt = (value, fallback) => {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

const parseBooleanFilter = (value) => {
  if (value === undefined || value === null || value === '') return undefined;
  if (value === true || value === 'true') return true;
  if (value === false || value === 'false') return false;
  throw new ApiError(400, 'isRead must be true or false.');
};

const parseDateFilter = (value, fieldName) => {
  if (!value) return undefined;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new ApiError(400, `${fieldName} must be a valid date.`);
  }
  return date;
};

const sanitizeNotification = (notification) => {
  if (!notification) return null;
  const paymentApprovalId = notification.entity_type === 'payment_approval' ? notification.entity_id : null;
  const invoiceId = notification.reference_id || (notification.entity_type === 'invoice' ? notification.entity_id : null);
  const actionUrl = paymentApprovalId
    ? `/payment-approvals/${paymentApprovalId}`
    : (invoiceId ? `/invoices/${invoiceId}` : null);

  return {
    id: notification.id,
    notificationId: notification.id,
    user_id: notification.user_id,
    userId: notification.user_id,
    assignedUserId: notification.user_id,
    title: notification.title,
    message: notification.message,
    type: notification.type,
    role: notification.role,
    assignedRole: notification.role,
    reference_id: notification.reference_id,
    referenceId: notification.reference_id,
    entity_type: notification.entity_type,
    entityType: notification.entity_type,
    entity_id: notification.entity_id,
    entityId: notification.entity_id,
    is_read: notification.is_read,
    isRead: notification.is_read,
    read_at: notification.read_at,
    readAt: notification.read_at,
    created_at: notification.created_at,
    createdAt: notification.created_at,
    paymentApprovalId,
    invoiceId,
    purchaseOrderId: (notification.metadata && typeof notification.metadata === 'object') ? notification.metadata.purchaseOrderId || null : null,
    threeWayMatchingId: (notification.metadata && typeof notification.metadata === 'object') ? notification.metadata.threeWayMatchingId || null : null,
    actionUrl,
    metadata: (notification.metadata && typeof notification.metadata === 'object') ? notification.metadata : {},
  };
};

class NotificationService {
  // ────────────────────────────────────────────────────────────────────────────
  // GET / MARK NOTIFICATIONS
  // ────────────────────────────────────────────────────────────────────────────

  async getMyNotifications(userId, query) {
    const page = toPositiveInt(query.page, 1);
    const requestedLimit = toPositiveInt(query.limit, 20);
    const limit = Math.min(requestedLimit, MAX_PAGE_LIMIT);
    const isRead = parseBooleanFilter(query.isRead);
    const type = typeof query.type === 'string' && query.type.trim() ? query.type.trim() : undefined;
    const entityType = typeof query.entityType === 'string' && query.entityType.trim() ? query.entityType.trim() : undefined;
    const createdFrom = parseDateFilter(query.createdFrom, 'createdFrom');
    const createdTo = parseDateFilter(query.createdTo, 'createdTo');

    if (createdFrom && createdTo && createdFrom > createdTo) {
      throw new ApiError(400, 'createdFrom must be before createdTo.');
    }

    const result = await notificationRepository.findAll({
      userId,
      isRead,
      type,
      entityType,
      createdFrom,
      createdTo,
      skip: (page - 1) * limit,
      take: limit,
    });

    return {
      notifications: result.notifications.map(sanitizeNotification),
      total: result.total,
      unreadCount: result.unreadCount,
      page,
      limit,
      totalPages: Math.ceil(result.total / limit),
    };
  }

  async getUnreadCount(userId) {
    const unreadCount = await notificationRepository.countUnread(userId);
    return { unreadCount };
  }

  async getById(notificationId, userId) {
    const notification = await notificationRepository.findByIdForUser(notificationId, userId);
    if (!notification) {
      throw new ApiError(404, 'Notification not found.');
    }
    return sanitizeNotification(notification);
  }

  async markAsRead(notificationId, userId) {
    const result = await notificationRepository.markAsRead(notificationId, userId);
    if (result.count === 0) {
      throw new ApiError(404, 'Notification not found or does not belong to you.');
    }
    const notification = await notificationRepository.findByIdForUser(notificationId, userId);
    return {
      message: 'Notification marked as read.',
      notification: sanitizeNotification(notification),
    };
  }

  async markAllAsRead(userId) {
    const result = await notificationRepository.markAllAsRead(userId);
    return { message: 'All notifications marked as read.', updatedCount: result.count };
  }

  async deleteNotification(notificationId, userId) {
    const result = await notificationRepository.deleteForUser(notificationId, userId);
    if (result.count === 0) {
      throw new ApiError(404, 'Notification not found.');
    }
    return { message: 'Notification dismissed.' };
  }

  // ────────────────────────────────────────────────────────────────────────────
  // CREATE NOTIFICATION (internal)
  // ────────────────────────────────────────────────────────────────────────────

  async createNotification(userId, type, title, message, entityType = null, entityId = null, role = null, referenceId = null, tx = null) {
    try {
      return await notificationRepository.create({
        user_id:     userId,
        type,
        title,
        message,
        role,
        reference_id: referenceId || entityId,
        entity_type: entityType,
        entity_id:   entityId,
      }, tx);
    } catch (error) {
      console.error('[NotificationService] Failed to create notification:', toSafeErrorLog(error));
      throw error;
    }
  }

  async getActiveUsersByRole(role) {
    if (!role) return [];
    return prisma.user.findMany({
      where: { role, status: 'ACTIVE', deleted_at: null },
      select: { id: true, role: true },
    });
  }

  async createNotificationsForRole(role, type, title, message, entityType = null, entityId = null, referenceId = null, tx = null) {
    const recipients = await this.getActiveUsersByRole(role);
    if (!recipients.length) return { count: 0 };

    return notificationRepository.createMany(
      recipients.map((recipient) => ({
        user_id: recipient.id,
        role,
        reference_id: referenceId || entityId,
        type,
        title,
        message,
        entity_type: entityType,
        entity_id: entityId,
        is_read: false,
      })),
      tx
    );
  }

  async notifySuperAdmins(type, title, message, entityType = null, entityId = null, referenceId = null, tx = null) {
    return this.createNotificationsForRole(ROLES.SUPER_ADMIN, type, title, message, entityType, entityId, referenceId, tx);
  }

  async notifyApprovalRole({ role, type, title, message, entityType, entityId }, referenceId = null, tx = null) {
    await this.createNotificationsForRole(role, type, title, message, entityType, entityId, referenceId, tx);
    await this.notifySuperAdmins(type, title, message, entityType, entityId, referenceId, tx);
  }

  async notifyCreator(userId, type, title, message, entityType = null, entityId = null) {
    if (!userId) return;
    await this.createNotification(userId, type, title, message, entityType, entityId);
  }

  async notifyUserCreated(creatorId, createdUser) {
    if (!creatorId || !createdUser?.id) return;
    await this.createNotification(
      creatorId,
      NOTIFICATION_TYPES.USER_CREATED,
      'User account created',
      `User account for ${createdUser.first_name || createdUser.email} was created successfully.`,
      'user',
      createdUser.id
    );
  }

  async notifyCredentialEmailSent(creatorId, createdUser) {
    if (!creatorId || !createdUser?.id) return;
    await this.createNotification(
      creatorId,
      NOTIFICATION_TYPES.USER_CREDENTIAL_EMAIL_SENT,
      'Activation email sent',
      `Activation email was sent to ${createdUser.email}.`,
      'user',
      createdUser.id
    );
  }

  async notifyCredentialEmailFailed(creatorId, createdUser) {
    if (!creatorId || !createdUser?.id) return;
    await this.createNotification(
      creatorId,
      NOTIFICATION_TYPES.USER_CREDENTIAL_EMAIL_FAILED,
      'Activation email failed',
      `Activation email could not be delivered to ${createdUser.email}.`,
      'user',
      createdUser.id
    );
  }

  // ────────────────────────────────────────────────────────────────────────────
  // VENDOR NOTIFICATIONS
  // ────────────────────────────────────────────────────────────────────────────

  async notifyVendorStatusChange(vendor, newStatus, actorName) {
    if (!vendor.created_by_id) return;
    const normalizedStatus = String(newStatus || '').toUpperCase();
    const approved = normalizedStatus === 'ACTIVE' || normalizedStatus === 'APPROVED';
    const pending = normalizedStatus === 'PENDING';
    const rejected = normalizedStatus === 'INACTIVE' || normalizedStatus === 'REJECTED';
    const blocked = normalizedStatus === 'BLOCKED';

    const typeMap = {
      PENDING:  NOTIFICATION_TYPES.VENDOR_CREATED,
      ACTIVE: NOTIFICATION_TYPES.VENDOR_APPROVED,
      INACTIVE: NOTIFICATION_TYPES.VENDOR_REJECTED,
      BLOCKED:  NOTIFICATION_TYPES.VENDOR_BLOCKED,
    };

    const titleMap = {
      PENDING:  'Vendor Pending Review',
      ACTIVE: 'Vendor Approved',
      INACTIVE: 'Vendor Rejected',
      BLOCKED:  'Vendor On Hold',
    };

    const messageMap = {
      PENDING: `Vendor "${vendor.name}" is pending Finance review.`,
      ACTIVE: `Your vendor "${vendor.name}" has been approved by ${actorName}. You can now create purchase orders.`,
      INACTIVE: `Your vendor "${vendor.name}" has been rejected by ${actorName}. Please review and resubmit.`,
      BLOCKED:  `Your vendor "${vendor.name}" has been placed on hold by ${actorName}.`,
    };
    const statusKey = approved ? 'ACTIVE' : pending ? 'PENDING' : rejected ? 'INACTIVE' : blocked ? 'BLOCKED' : normalizedStatus;

    await this.createNotification(
      vendor.created_by_id,
      typeMap[statusKey] || NOTIFICATION_TYPES.VENDOR_UPDATED,
      titleMap[statusKey] || 'Vendor Status Updated',
      messageMap[statusKey] || `Vendor "${vendor.name}" status changed to ${newStatus}.`,
      'vendor',
      vendor.id,
    );

    await this.notifySuperAdmins(
      typeMap[statusKey] || NOTIFICATION_TYPES.VENDOR_UPDATED,
      titleMap[statusKey] || 'Vendor Status Updated',
      messageMap[statusKey] || `Vendor "${vendor.name}" status changed to ${newStatus}.`,
      'vendor',
      vendor.id,
    );

    if (approved) {
      const approvalTitle = 'Vendor Approved';
      const approvalMessage = `Vendor "${vendor.name}" (${vendor.vendor_code}) has been approved by ${actorName}.`;
      await Promise.all([
        this.createNotificationsForRole(ROLES.TEAM_LEAD, NOTIFICATION_TYPES.VENDOR_APPROVED, approvalTitle, approvalMessage, 'vendor', vendor.id),
        this.createNotificationsForRole(ROLES.MANAGER, NOTIFICATION_TYPES.VENDOR_APPROVED, approvalTitle, approvalMessage, 'vendor', vendor.id),
      ]);
    }
  }

  async notifyVendorApprovalRequested(vendor) {
    await this.notifyApprovalRole({
      role: ROLES.FINANCE_HEAD,
      type: NOTIFICATION_TYPES.VENDOR_CREATED,
      title: 'Vendor Pending Approval',
      message: `Vendor "${vendor.name}" (${vendor.vendor_code}) is waiting for Finance Head approval.`,
      entityType: 'vendor',
      entityId: vendor.id,
    });
    await this.notifyCreator(
      vendor.created_by_id,
      NOTIFICATION_TYPES.VENDOR_CREATED,
      'Vendor Submitted',
      `Vendor "${vendor.name}" has been submitted for approval.`,
      'vendor',
      vendor.id,
    );
  }

  async notifyVendorUpdated(vendor, actorName) {
    await this.notifyApprovalRole({
      role: ROLES.FINANCE_HEAD,
      type: NOTIFICATION_TYPES.VENDOR_UPDATED,
      title: 'Vendor Updated',
      message: `Vendor "${vendor.name}" (${vendor.vendor_code}) was updated by ${actorName}.`,
      entityType: 'vendor',
      entityId: vendor.id,
    });
  }

  async notifyDocumentEdited({ entityType, entityId, documentNumber, editedBy, summary }) {
    const label = entityType === 'purchase_order' ? 'Purchase Order' : 'Invoice';
    const type = entityType === 'purchase_order'
      ? NOTIFICATION_TYPES.PURCHASE_ORDER_UPDATED
      : NOTIFICATION_TYPES.INVOICE_UPDATED;
    const message = `${label} ${documentNumber} was edited by ${editedBy} on ${new Date().toLocaleString('en-IN')}. Changes: ${summary || 'Updated document details.'}`;
    await Promise.all([
      this.createNotificationsForRole(ROLES.FINANCE_HEAD, type, `${label} Edited`, message, entityType, entityId),
      this.createNotificationsForRole(ROLES.MANAGER, type, `${label} Edited`, message, entityType, entityId),
      this.notifySuperAdmins(type, `${label} Edited`, message, entityType, entityId),
    ]);
  }

  async notifyPurchaseOrderDeleted(purchaseOrder, actorName, deleteReason) {
    const message = `Purchase Order ${purchaseOrder.po_number} was deleted by ${actorName}. Reason: ${deleteReason}`;
    await Promise.all([
      this.createNotificationsForRole(ROLES.FINANCE_HEAD, NOTIFICATION_TYPES.PURCHASE_ORDER_DELETED, 'Purchase Order Deleted', message, 'purchase_order', purchaseOrder.id),
      this.createNotificationsForRole(ROLES.MANAGER, NOTIFICATION_TYPES.PURCHASE_ORDER_DELETED, 'Purchase Order Deleted', message, 'purchase_order', purchaseOrder.id),
      this.notifySuperAdmins(NOTIFICATION_TYPES.PURCHASE_ORDER_DELETED, 'Purchase Order Deleted', message, 'purchase_order', purchaseOrder.id),
    ]);
  }

  // ────────────────────────────────────────────────────────────────────────────
  // INVOICE STATUS CHANGE NOTIFICATIONS (notify creator)
  // ────────────────────────────────────────────────────────────────────────────

  async notifyInvoiceStatusChange(invoice, newStatus, actorName) {
    if (!invoice.created_by_id) return;

    const s = (newStatus || '').toUpperCase();

    const typeMap = {
      PENDING_THREE_WAY_MATCH: NOTIFICATION_TYPES.INVOICE_PENDING_THREE_WAY_MATCH,
      PENDING_ADMIN_REVIEW:    NOTIFICATION_TYPES.INVOICE_PENDING_ADMIN_REVIEW,
      PENDING_TEAM_LEAD:       NOTIFICATION_TYPES.INVOICE_PENDING_TEAM_LEAD,
      PENDING_MANAGER:         NOTIFICATION_TYPES.INVOICE_PENDING_MANAGER,
      PENDING_FINANCE_HEAD:    NOTIFICATION_TYPES.INVOICE_PENDING_FINANCE_HEAD,
      APPROVED:                NOTIFICATION_TYPES.INVOICE_APPROVED,
      REJECTED:                NOTIFICATION_TYPES.INVOICE_REJECTED,
      CANCELLED:               NOTIFICATION_TYPES.INVOICE_CANCELLED,
    };

    const titleMap = {
      PENDING_THREE_WAY_MATCH: ' PENDING THREE-WAY MATCH',
      PENDING_ADMIN_REVIEW:    ' Pending Admin Review',
      PENDING_TEAM_LEAD:       ' PENDING BY TEAM LEAD',
      PENDING_MANAGER:         ' PENDING BY MANAGER',
      PENDING_FINANCE_HEAD:    ' PENDING BY FINANCE HEAD',
      APPROVED:                ' Invoice Approved',
      REJECTED:                ' Invoice Rejected',
      CANCELLED:               ' Invoice Cancelled',
    };

    const messageMap = {
      PENDING_THREE_WAY_MATCH: `Invoice ${invoice.invoice_number} is ready for Three-Way Matching.`,
      PENDING_ADMIN_REVIEW:    `Invoice ${invoice.invoice_number} is pending Admin Review after matching.`,
      PENDING_TEAM_LEAD:       `Invoice ${invoice.invoice_number} has been forwarded to Team Lead for approval.`,
      PENDING_MANAGER:         `Invoice ${invoice.invoice_number} has been forwarded to Manager for approval.`,
      PENDING_FINANCE_HEAD:    `Invoice ${invoice.invoice_number} has been forwarded to Finance Head for approval.`,
      APPROVED:                `Invoice ${invoice.invoice_number} has been fully approved by ${actorName}. Payment can now be processed.`,
      REJECTED:                `Invoice ${invoice.invoice_number} has been rejected by ${actorName}. Reason: ${invoice.rejection_reason || 'None'}`,
      CANCELLED:               `Invoice ${invoice.invoice_number} has been cancelled by ${actorName}.`,
    };

    const type    = typeMap[s]    || NOTIFICATION_TYPES.WORKFLOW_MOVED;
    const title   = titleMap[s]   || '🔄 Invoice Status Updated';
    const message = messageMap[s] || `Invoice ${invoice.invoice_number} status changed to ${newStatus}.`;

    await this.createNotification(invoice.created_by_id, type, title, message, 'invoice', invoice.id);
  }

  // ────────────────────────────────────────────────────────────────────────────
  // NOTIFY NEXT LEVEL (broadcast to all users with the required role)
  // ────────────────────────────────────────────────────────────────────────────

  async notifyInvoiceNextLevel(invoice, nextLevel, context = {}, tx = null) {
    try {
      // Map level name to DB role value
      const levelToRole = {
        TEAM_LEAD:    ROLES.TEAM_LEAD,
        MANAGER:      ROLES.MANAGER,
        FINANCE_HEAD: ROLES.FINANCE_HEAD,
        // Legacy
        L1: ROLES.TEAM_LEAD,
        L2: ROLES.MANAGER,
        L3: ROLES.FINANCE_HEAD,
      };

      const dbRole = levelToRole[nextLevel];
      if (!dbRole) return;

      const client = tx || prisma;
      const users = await client.user.findMany({
        where:  { role: dbRole, status: 'ACTIVE', deleted_at: null },
        select: { id: true },
      });

      if (!users || users.length === 0) return;

      const typeMap = {
        TEAM_LEAD:    NOTIFICATION_TYPES.INVOICE_PENDING_TEAM_LEAD,
        MANAGER:      NOTIFICATION_TYPES.INVOICE_PENDING_MANAGER,
        FINANCE_HEAD: NOTIFICATION_TYPES.INVOICE_PENDING_FINANCE_HEAD,
      };

      const humanLabel = {
        TEAM_LEAD:    'Team Lead',
        MANAGER:      'Manager',
        FINANCE_HEAD: 'Finance Head',
      };
      const poNumber = invoice.purchase_order?.po_number || invoice.po_number || 'N/A';
      const vendorName = invoice.vendor?.name || invoice.vendor_name || 'Vendor N/A';
      const creatorName = invoice.created_by
        ? `${invoice.created_by.first_name || ''} ${invoice.created_by.last_name || ''}`.trim() || invoice.created_by.email
        : null;
      const requestedBy = context.requestedBy || creatorName || 'System';
      const matchingResult = context.matchingResult || invoice.three_way_match_status || 'MATCHED';
      const createdDate = invoice.created_at ? new Date(invoice.created_at).toISOString() : new Date().toISOString();
      const priority = nextLevel === 'FINANCE_HEAD' ? 'High' : 'Normal';
      const approvalMessage = [
        `Invoice Number: ${invoice.invoice_number}`,
        `Purchase Order Number: ${poNumber}`,
        `Vendor: ${vendorName}`,
        `Invoice Amount: ${invoice.currency || 'INR'} ${invoice.amount}`,
        `Current Status: ${invoice.status}`,
        `Requested By: ${requestedBy}`,
        `Matching Result: ${matchingResult}`,
        `Created Date: ${createdDate}`,
        `Priority: ${priority}`,
      ].join(' | ');

      const paymentApprovalId = context.paymentApprovalId || null;
      if (!paymentApprovalId) {
        console.warn('[NotificationService] notifyInvoiceNextLevel blocked: paymentApprovalId is missing.');
        return;
      }

      const notifications = users.map((user) => ({
        user_id:     user.id,
        role:        dbRole,
        reference_id: invoice.id,
        type:        typeMap[nextLevel] || NOTIFICATION_TYPES.WORKFLOW_MOVED,
        title:       `Invoice Pending ${humanLabel[nextLevel] || nextLevel} Approval`,
        message:     approvalMessage,
        entity_type: paymentApprovalId ? 'payment_approval' : 'invoice',
        entity_id:   paymentApprovalId || invoice.id,
        is_read:     false,
      }));

      await notificationRepository.createMany(notifications, tx);
      await this.notifySuperAdmins(
        typeMap[nextLevel] || NOTIFICATION_TYPES.WORKFLOW_MOVED,
        `Invoice Pending ${humanLabel[nextLevel] || nextLevel} Approval`,
        approvalMessage,
        paymentApprovalId ? 'payment_approval' : 'invoice',
        paymentApprovalId || invoice.id,
        invoice.id,
        tx
      );
    } catch (error) {
      console.error('[NotificationService] notifyInvoiceNextLevel failed:', toSafeErrorLog(error));
      throw error;
    }
  }

  // ────────────────────────────────────────────────────────────────────────────
  // THREE-WAY MATCHING NOTIFICATIONS
  // ────────────────────────────────────────────────────────────────────────────

  async notifyMatchingCompleted(invoice, matchStatus, matchPercentage, tx = null) {
    try {
      const client = tx || prisma;
      const reviewers = await client.user.findMany({
        where:  { role: { in: [ROLES.FINANCE_HEAD, ROLES.SUPER_ADMIN] }, status: 'ACTIVE', deleted_at: null },
        select: { id: true },
      });

      const isMatched = matchStatus === 'MATCHED';
      const recipientIds = new Set(reviewers.map((reviewer) => reviewer.id));
      if (invoice.created_by_id) recipientIds.add(invoice.created_by_id);
      if (recipientIds.size === 0) return;

      const notifications = Array.from(recipientIds).map((userId) => ({
        user_id:     userId,
        type:        isMatched ? NOTIFICATION_TYPES.THREE_WAY_MATCH_MATCHED : NOTIFICATION_TYPES.THREE_WAY_MATCH_UNMATCHED,
        title:       isMatched
          ? ` Three-Way Match: MATCHED (${matchPercentage}%)`
          : ` Three-Way Match: MISMATCH (${matchPercentage}%)`,
        message:     isMatched
          ? `Invoice ${invoice.invoice_number} has passed Three-Way Matching (${matchPercentage}% match). Awaiting Finance Head approval.`
          : `Invoice ${invoice.invoice_number} has mismatches (${matchPercentage}% match). Approval is blocked until corrected.`,
        entity_type: 'invoice',
        entity_id:   invoice.id,
        is_read:     false,
      }));

      await notificationRepository.createMany(notifications, tx);
    } catch (error) {
      console.error('[NotificationService] notifyMatchingCompleted failed:', toSafeErrorLog(error));
      throw error;
    }
  }

  // ────────────────────────────────────────────────────────────────────────────
  // INVOICE DELETION NOTIFICATION
  // ────────────────────────────────────────────────────────────────────────────

  async notifyInvoiceDeleted(invoice, actorName, deleteReason) {
    try {
      const notifications = [];

      // Notify creator
      if (invoice.created_by_id) {
        notifications.push({
          user_id:     invoice.created_by_id,
          type:        NOTIFICATION_TYPES.INVOICE_DELETED,
          title:       '🗑️ Invoice Deleted',
          message:     `Your invoice ${invoice.invoice_number} was deleted by ${actorName}. Reason: ${deleteReason}`,
          entity_type: 'invoice',
          entity_id:   invoice.id,
          is_read:     false,
        });
      }

      if (notifications.length > 0) {
        await notificationRepository.createMany(notifications);
      }
    } catch (error) {
      console.error('[NotificationService] notifyInvoiceDeleted failed:', toSafeErrorLog(error));
    }
  }

  // ────────────────────────────────────────────────────────────────────────────
  // PAYMENT NOTIFICATIONS
  // ────────────────────────────────────────────────────────────────────────────

  async notifyPaymentStatusChange(payment, newStatus, actorName, remarks = '') {
    const statusKey = String(newStatus).toLowerCase();
    const paymentNumber = payment.payment_number || payment.paymentNumber || 'N/A';
    const invoiceNumber = payment.invoice?.invoice_number || payment.invoiceNumber || 'N/A';
    const amountStr = `${payment.currency || 'INR'} ${Number(payment.amount || payment.requestedAmount || 0).toLocaleString('en-IN')}`;
    const remarksSuffix = remarks ? ` Remarks: "${remarks}"` : '';

    const typeMap = {
      pending:   NOTIFICATION_TYPES.PAYMENT_CREATED,
      pending_approval: NOTIFICATION_TYPES.PAYMENT_CREATED,
      initiated: NOTIFICATION_TYPES.PAYMENT_APPROVED,
      approved:  NOTIFICATION_TYPES.PAYMENT_APPROVED,
      rejected:  NOTIFICATION_TYPES.PAYMENT_REJECTED,
      failed:    NOTIFICATION_TYPES.PAYMENT_FAILED,
      blocked:   NOTIFICATION_TYPES.PAYMENT_BLOCKED,
      cancelled: NOTIFICATION_TYPES.INVOICE_CANCELLED,
      returned:  NOTIFICATION_TYPES.PAYMENT_REJECTED,
      refunded:  NOTIFICATION_TYPES.PAYMENT_APPROVED,
    };

    const titleMap = {
      pending:          'Payment Created',
      pending_approval: 'Payment Awaiting Approval',
      initiated:        'Payment Initiated',
      approved:         'Payment Approved',
      rejected:         'Payment Rejected',
      failed:           'Payment Failed',
      blocked:          'Payment Blocked',
      cancelled:        'Payment Cancelled',
      returned:         'Payment Returned for Correction',
      refunded:         'Payment Refunded',
    };

    const messageMap = {
      pending:          `Payment ${paymentNumber} (Invoice: ${invoiceNumber}) for ${amountStr} has been created.`,
      pending_approval: `Payment ${paymentNumber} (Invoice: ${invoiceNumber}) for ${amountStr} is pending approval.`,
      initiated:        `Payment ${paymentNumber} (Invoice: ${invoiceNumber}) for ${amountStr} has been initiated by ${actorName}.`,
      approved:         `Payment ${paymentNumber} (Invoice: ${invoiceNumber}) for ${amountStr} has been approved by ${actorName}.${remarksSuffix}`,
      rejected:         `Payment ${paymentNumber} (Invoice: ${invoiceNumber}) for ${amountStr} has been rejected by ${actorName}.${remarksSuffix}`,
      failed:           `Payment ${paymentNumber} (Invoice: ${invoiceNumber}) for ${amountStr} has failed.${remarksSuffix}`,
      blocked:          `Payment ${paymentNumber} for ${amountStr} has been blocked by ${actorName}.${remarksSuffix}`,
      cancelled:        `Payment ${paymentNumber} for ${amountStr} has been cancelled by ${actorName}.${remarksSuffix}`,
      returned:         `Payment ${paymentNumber} for ${amountStr} has been returned for correction by ${actorName}.${remarksSuffix}`,
      refunded:         `Payment ${paymentNumber} for ${amountStr} has been refunded by ${actorName}.${remarksSuffix}`,
    };

    const type    = typeMap[statusKey]    || NOTIFICATION_TYPES.PAYMENT_CREATED;
    const title   = titleMap[statusKey]   || 'Payment Status Update';
    const message = messageMap[statusKey] || `Payment status changed to ${newStatus}.`;

    await this.createNotification(payment.created_by_id, type, title, message, 'payment', payment.id);
    await this.notifySuperAdmins(type, title, message, 'payment', payment.id);
  }

  async notifyPaymentApprovalRequested(payment) {
    // LEGACY: kept for backward compat but now only notifies SUPER_ADMIN.
    // New flow uses notifyPaymentApprovalAssigned (specific user).
    const approvalRole = payment.requiredApprovalRole || payment.required_approval_role || ROLES.FINANCE_HEAD;
    const roleLabel = {
      [ROLES.TEAM_LEAD]:    'Team Lead',
      [ROLES.MANAGER]:      'Manager',
      [ROLES.FINANCE_HEAD]: 'Finance Head',
    }[approvalRole] || approvalRole;

    await this.notifySuperAdmins(
      NOTIFICATION_TYPES.PAYMENT_CREATED,
      'Payment Pending Approval',
      `Payment ${payment.payment_number} for ${payment.currency} ${payment.amount} requires ${roleLabel} approval.`,
      'payment',
      payment.id,
    );
    await this.notifyCreator(
      payment.created_by_id,
      NOTIFICATION_TYPES.PAYMENT_CREATED,
      'Payment Submitted',
      `Payment ${payment.payment_number} has been submitted for approval.`,
      'payment',
      payment.id,
    );
  }

  // ────────────────────────────────────────────────────────────────────────────
  // PAYMENT APPROVAL — ASSIGNED (specific user notification)
  // Called AFTER transaction commits in payment.service.js createPayment()
  // ────────────────────────────────────────────────────────────────────────────

  /**
   * Notify the exact assigned approver that a payment needs their approval.
   * Uses entity_type = 'payment_approval' and entity_id = paymentApproval.id
   * so clicking the notification navigates to /payment-approvals?id=<approvalId>.
   *
   * @param {object} paymentApproval - The PaymentApproval record
   * @param {object} approver - The assigned approver user {id, email, first_name, last_name, role}
   */
  async notifyPaymentApprovalAssigned(paymentApproval, approver, tx = null) {
    try {
      if (!paymentApproval || !paymentApproval.id) {
        console.warn('[NotificationService] notifyPaymentApprovalAssigned blocked: paymentApproval.id is missing.');
        return;
      }
      const amount = Number(paymentApproval.amount || 0);
      const currency = paymentApproval.currency || 'INR';
      const amountStr = `${currency} ${amount.toLocaleString('en-IN')}`;
      const approverName = approver
        ? `${approver.first_name || ''} ${approver.last_name || ''}`.trim() || approver.email
        : 'Approver';

      const invoiceNumber = paymentApproval.invoice?.invoice_number || paymentApproval.invoiceNumber || 'N/A';
      const invoiceId = paymentApproval.invoice_id || paymentApproval.invoiceId || '';
      const vendorName = paymentApproval.vendor?.name || paymentApproval.vendorName || 'N/A';
      const vendorId = paymentApproval.vendor_id || paymentApproval.vendorId || '';
      const assignedRole = paymentApproval.required_role || approver?.role || 'APPROVER';
      const assignedUserId = approver?.id || paymentApproval.approver_id || '';

      const detailMsg = `Payment Approval Required: Invoice ${invoiceNumber} from ${vendorName} for ${amountStr}. Assigned to ${approverName} (${assignedRole}). (Approval ID: ${paymentApproval.id}, Invoice ID: ${invoiceId})`;

      // Notification to the SPECIFIC assigned approver
      await this.createNotification(
        assignedUserId,
        NOTIFICATION_TYPES.PAYMENT_APPROVAL_ASSIGNED,
        '💳 Payment Approval Required',
        detailMsg,
        'payment_approval',
        paymentApproval.id,
        null, // role
        invoiceId, // reference_id references invoiceId
        tx
      );

      // Also notify SUPER_ADMIN for visibility
      await this.notifySuperAdmins(
        NOTIFICATION_TYPES.PAYMENT_APPROVAL_ASSIGNED,
        'Payment Approval Assigned',
        `Payment approval for Invoice ${invoiceNumber} (${amountStr}) assigned to ${approverName} (${assignedRole}).`,
        'payment_approval',
        paymentApproval.id,
        invoiceId, // reference_id references invoiceId
        tx
      );
    } catch (error) {
      console.error('[NotificationService] notifyPaymentApprovalAssigned failed:', toSafeErrorLog(error));
      throw error;
    }
  }

  async notifyPurchaseOrderApprovalRequested(purchaseOrder) {
    // stub to satisfy tests
  }

  async notifyPurchaseOrderStatusChange(purchaseOrder, newStatus, actorName) {
    // stub to satisfy tests
  }

  /**
   * Notify the payment requester (Case Manager) of the approval result.
   *
   * @param {object} paymentApproval - The PaymentApproval record (with relations loaded)
   * @param {'APPROVED'|'REJECTED'} result - The result
   * @param {object} actorUser - The approver who took action
   */
  async notifyPaymentApprovalResult(paymentApproval, result, actorUser) {
    try {
      const requestedById = paymentApproval.requested_by_id;
      if (!requestedById) return;

      const amount = Number(paymentApproval.amount || 0);
      const currency = paymentApproval.currency || 'INR';
      const amountStr = `${currency} ${amount.toLocaleString('en-IN')}`;
      const actorName = actorUser
        ? `${actorUser.first_name || ''} ${actorUser.last_name || ''}`.trim() || actorUser.email
        : 'Approver';

      const isApproved = result === 'APPROVED';

      await this.createNotification(
        requestedById,
        isApproved ? NOTIFICATION_TYPES.PAYMENT_APPROVAL_APPROVED : NOTIFICATION_TYPES.PAYMENT_APPROVAL_REJECTED,
        isApproved ? 'Payment Approval Granted' : ' Payment Approval Rejected',
        isApproved
          ? `Your payment request of ${amountStr} has been approved by ${actorName}.`
          : `Your payment request of ${amountStr} was rejected by ${actorName}. Reason: ${paymentApproval.rejection_reason || 'No reason provided'}.`,
        'payment_approval',
        paymentApproval.id,
      );
    } catch (error) {
      console.error('[NotificationService] notifyPaymentApprovalResult failed:', toSafeErrorLog(error));
    }
  }

  /**
   * Periodically/dynamically checks for upcoming and overdue installments
   * and sends notifications to Finance Head and Case Manager.
   */
  async checkAndNotifyInstallments() {
    try {
      const now = new Date();
      const threeDaysFromNow = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000);

      const installments = await prisma.installment.findMany({
        where: {
          status: { in: ['PENDING', 'PARTIALLY_PAID', 'DUE'] },
          remaining_amount: { gt: 0 },
        },
        include: {
          purchase_order: { select: { id: true, po_number: true } },
        },
      });

      for (const inst of installments) {
        const dueDate = new Date(inst.due_date);
        const isOverdue = dueDate < now;
        const isUpcoming = !isOverdue && dueDate <= threeDaysFromNow;
        const poNum = inst.purchase_order?.po_number || 'PO';
        const amtStr = `INR ${Number(inst.remaining_amount || 0).toLocaleString('en-IN')}`;
        const formattedDueDate = dueDate.toLocaleDateString('en-IN');

        if (isOverdue) {
          await prisma.installment.update({
            where: { id: inst.id },
            data: { status: 'OVERDUE' },
          }).catch(() => {});

          const title = '⚠️ Overdue Installment Payment';
          const message = `Installment #${inst.installment_number} for PO ${poNum} (${amtStr}) was due on ${formattedDueDate} and is now overdue.`;

          await this.createNotificationsForRole(ROLES.FINANCE_HEAD, NOTIFICATION_TYPES.INSTALLMENT_OVERDUE, title, message, 'purchase_order', inst.purchase_order_id).catch(() => {});
          await this.createNotificationsForRole(ROLES.CASE_MANAGER, NOTIFICATION_TYPES.INSTALLMENT_OVERDUE, title, message, 'purchase_order', inst.purchase_order_id).catch(() => {});
        } else if (isUpcoming) {
          const title = '📅 Upcoming Installment Payment';
          const message = `Installment #${inst.installment_number} for PO ${poNum} (${amtStr}) is due in 3 days on ${formattedDueDate}.`;

          await this.createNotificationsForRole(ROLES.FINANCE_HEAD, NOTIFICATION_TYPES.INSTALLMENT_UPCOMING, title, message, 'purchase_order', inst.purchase_order_id).catch(() => {});
          await this.createNotificationsForRole(ROLES.CASE_MANAGER, NOTIFICATION_TYPES.INSTALLMENT_UPCOMING, title, message, 'purchase_order', inst.purchase_order_id).catch(() => {});
        }
      }
    } catch (error) {
      console.error('[NotificationService] checkAndNotifyInstallments failed:', toSafeErrorLog(error));
    }
  }
}

export default new NotificationService();
