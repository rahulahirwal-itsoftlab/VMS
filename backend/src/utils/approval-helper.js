import { ROLES } from '../zodSchema/index.js';

// ─── Invoice Workflow Statuses ───────────────────────────────────────────────
export const INVOICE_STATUS = {
  DRAFT:                   'DRAFT',
  SUBMITTED:               'SUBMITTED',

  // Step 1 — Case Manager initiates Three-Way Matching
  PENDING_THREE_WAY_MATCH: 'PENDING_THREE_WAY_MATCH',

  // Step 2 — Admin reviews the matching report
  PENDING_ADMIN_REVIEW:    'PENDING_ADMIN_REVIEW',

  // Step 3 — Team Lead approval (all invoices)
  PENDING_TEAM_LEAD:       'PENDING_TEAM_LEAD',

  // Step 4 — Manager approval (invoices > ₹10,000)
  PENDING_MANAGER:         'PENDING_MANAGER',

  // Step 5 — Finance Head approval (invoices > ₹1,00,000)
  PENDING_FINANCE_HEAD:    'PENDING_FINANCE_HEAD',

  // Terminal States
  APPROVED:                'APPROVED',
  REJECTED:                'REJECTED',
  PAID:                    'PAID',
  CANCELLED:               'CANCELLED',
};

// ─── Three-Way Matching Statuses ─────────────────────────────────────────────
export const THREE_WAY_MATCH_STATUS = {
  PENDING:       'PENDING',
  MATCHED:       'MATCHED',
  PARTIAL_MATCH: 'PARTIAL_MATCH',
  MISMATCH:      'MISMATCH',
  UNMATCHED:     'UNMATCHED',
  SKIPPED:       'SKIPPED',
};

// ─── Admin Review Statuses ────────────────────────────────────────────────────
export const ADMIN_REVIEW_STATUS = {
  PENDING:  'PENDING',
  APPROVED: 'APPROVED',
  REJECTED: 'REJECTED',
  RETURNED: 'RETURNED',
};

// ─── Invoice Approval Amount Thresholds ──────────────────────────────────────
export const INVOICE_APPROVAL_LIMITS = {
  TEAM_LEAD_MAX: 10000,    // ≤ ₹10,000 → Team Lead only
  FINANCE_HEAD_MIN: Number(process.env.FINANCE_HEAD_INVOICE_APPROVAL_THRESHOLD || 100000),
  // > ₹1,00,000 → Team Lead + Manager + Finance Head
};

/**
 * Determine the highest approval role required for a given invoice amount.
 *
 * Amount ≤ ₹10,000     → TEAM_LEAD  (stops after Team Lead)
 * Amount ≤ ₹1,00,000   → MANAGER    (stops after Manager)
 * Amount > ₹1,00,000   → FINANCE_HEAD (all three levels required)
 */
export const getRequiredInvoiceApprovalRole = (amount) => {
  const invoiceAmount = Number(amount || 0);

  if (invoiceAmount <= INVOICE_APPROVAL_LIMITS.TEAM_LEAD_MAX) {
    return ROLES.TEAM_LEAD;
  }

  if (invoiceAmount < INVOICE_APPROVAL_LIMITS.FINANCE_HEAD_MIN) {
    return ROLES.MANAGER;
  }

  return ROLES.FINANCE_HEAD;
};

/**
 * Alias for getRequiredInvoiceApprovalRole.
 */
export const getRequiredApprovalLevel = (amount) => {
  return getRequiredInvoiceApprovalRole(amount);
};

/**
 * Determine the current human-readable approval level from an invoice status.
 * Handles all new status strings plus legacy backward compatibility.
 */
export const getCurrentApprovalLevel = (status) => {
  const s = (status || '').toUpperCase();

  // New workflow statuses
  if (s === INVOICE_STATUS.PENDING_THREE_WAY_MATCH || s === INVOICE_STATUS.PENDING_ADMIN_REVIEW) {
    return 'TEAM_LEAD';
  }
  if (s === INVOICE_STATUS.PENDING_TEAM_LEAD) return 'TEAM_LEAD';
  if (s === INVOICE_STATUS.PENDING_MANAGER)   return 'MANAGER';
  if (s === INVOICE_STATUS.PENDING_FINANCE_HEAD) return 'FINANCE_HEAD';

  // Legacy backward compat
  if (s === 'PENDING_L1' || s === 'PENDING' || s === 'pending') return 'TEAM_LEAD';
  if (s === 'PENDING_L2') return 'MANAGER';
  if (s === 'PENDING_L3') return 'FINANCE_HEAD';

  return null;
};

export const getPendingQueueStatuses = (role) => {
  if (role === ROLES.TEAM_LEAD) {
    return [INVOICE_STATUS.PENDING_TEAM_LEAD, 'PENDING_L1', 'PENDING', 'pending'];
  }

  if (role === ROLES.MANAGER) {
    return [INVOICE_STATUS.PENDING_MANAGER, 'PENDING_L2'];
  }

  if (role === ROLES.FINANCE_HEAD) {
    return [INVOICE_STATUS.PENDING_FINANCE_HEAD, 'PENDING_L3'];
  }

  return [];
};

/**
 * Get the next status in the approval workflow after a given level approves.
 * Applies amount-based routing:
 *   - TEAM_LEAD approval: if amount ≤ ₹10K → APPROVED; else → PENDING_MANAGER
 *   - MANAGER approval:   if amount ≤ ₹1L  → APPROVED; else → PENDING_FINANCE_HEAD
 *   - FINANCE_HEAD:       always → APPROVED
 */
export const getNextApprovalStatus = (amount, currentStatus) => {
  const invoiceAmount = Number(amount || 0);
  const s = (currentStatus || '').toUpperCase();

  // New workflow - bypass the old matching/admin-review gate and move directly
  // to the first role-based approval state for the invoice amount.
  if (s === INVOICE_STATUS.PENDING_THREE_WAY_MATCH || s === INVOICE_STATUS.PENDING_ADMIN_REVIEW) {
    if (invoiceAmount <= INVOICE_APPROVAL_LIMITS.TEAM_LEAD_MAX) {
      return INVOICE_STATUS.PENDING_TEAM_LEAD;
    }
    if (invoiceAmount < INVOICE_APPROVAL_LIMITS.FINANCE_HEAD_MIN) {
      return INVOICE_STATUS.PENDING_MANAGER;
    }
    return INVOICE_STATUS.PENDING_FINANCE_HEAD;
  }

  if (s === INVOICE_STATUS.PENDING_TEAM_LEAD) {
    if (invoiceAmount <= INVOICE_APPROVAL_LIMITS.TEAM_LEAD_MAX) {
      return INVOICE_STATUS.APPROVED;
    }
    return INVOICE_STATUS.PENDING_MANAGER;
  }

  if (s === INVOICE_STATUS.PENDING_MANAGER) {
    if (invoiceAmount < INVOICE_APPROVAL_LIMITS.FINANCE_HEAD_MIN) {
      return INVOICE_STATUS.APPROVED;
    }
    return INVOICE_STATUS.PENDING_FINANCE_HEAD;
  }

  if (s === INVOICE_STATUS.PENDING_FINANCE_HEAD) {
    return INVOICE_STATUS.APPROVED;
  }

  // Legacy backward compat
  if (s === 'PENDING_L1' || s === 'PENDING' || s === 'pending') {
    if (invoiceAmount <= INVOICE_APPROVAL_LIMITS.TEAM_LEAD_MAX) {
      return INVOICE_STATUS.APPROVED;
    }
    return INVOICE_STATUS.PENDING_MANAGER;
  }
  if (s === 'PENDING_L2') {
    if (invoiceAmount < INVOICE_APPROVAL_LIMITS.FINANCE_HEAD_MIN) {
      return INVOICE_STATUS.APPROVED;
    }
    return INVOICE_STATUS.PENDING_FINANCE_HEAD;
  }
  if (s === 'PENDING_L3') {
    return INVOICE_STATUS.APPROVED;
  }

  return currentStatus;
};

/**
 * Validate whether a status transition is permitted in the workflow.
 * All transitions are defined explicitly to prevent privilege escalation.
 */
export const isValidStatusTransition = (fromStatus, toStatus) => {
  const from = (fromStatus || '').toUpperCase();
  const to   = (toStatus || '').toUpperCase();

  // Normalize legacy statuses
  const normalizedFrom = (() => {
    if (from === 'PENDING' || from === 'pending') return INVOICE_STATUS.PENDING_TEAM_LEAD;
    if (from === 'PENDING_L1') return INVOICE_STATUS.PENDING_TEAM_LEAD;
    if (from === 'PENDING_L2') return INVOICE_STATUS.PENDING_MANAGER;
    if (from === 'PENDING_L3') return INVOICE_STATUS.PENDING_FINANCE_HEAD;
    if (from === INVOICE_STATUS.PENDING_THREE_WAY_MATCH || from === INVOICE_STATUS.PENDING_ADMIN_REVIEW) {
      return INVOICE_STATUS.PENDING_TEAM_LEAD;
    }
    return from;
  })();

  const transitions = {
    [INVOICE_STATUS.DRAFT]: [
      INVOICE_STATUS.SUBMITTED,
      INVOICE_STATUS.CANCELLED,
    ],
    [INVOICE_STATUS.SUBMITTED]: [
      INVOICE_STATUS.PENDING_THREE_WAY_MATCH,
      INVOICE_STATUS.CANCELLED,
    ],
    [INVOICE_STATUS.PENDING_THREE_WAY_MATCH]: [
      INVOICE_STATUS.PENDING_ADMIN_REVIEW,
      INVOICE_STATUS.REJECTED,
      INVOICE_STATUS.CANCELLED,
    ],
    [INVOICE_STATUS.PENDING_ADMIN_REVIEW]: [
      INVOICE_STATUS.PENDING_TEAM_LEAD,
      INVOICE_STATUS.REJECTED,
      INVOICE_STATUS.PENDING_THREE_WAY_MATCH, // Send back for re-matching
      INVOICE_STATUS.CANCELLED,
    ],
    [INVOICE_STATUS.PENDING_TEAM_LEAD]: [
      INVOICE_STATUS.PENDING_MANAGER,
      INVOICE_STATUS.APPROVED,
      INVOICE_STATUS.REJECTED,
      INVOICE_STATUS.CANCELLED,
    ],
    [INVOICE_STATUS.PENDING_MANAGER]: [
      INVOICE_STATUS.PENDING_FINANCE_HEAD,
      INVOICE_STATUS.APPROVED,
      INVOICE_STATUS.REJECTED,
      INVOICE_STATUS.CANCELLED,
    ],
    [INVOICE_STATUS.PENDING_FINANCE_HEAD]: [
      INVOICE_STATUS.APPROVED,
      INVOICE_STATUS.REJECTED,
      INVOICE_STATUS.CANCELLED,
    ],
    [INVOICE_STATUS.APPROVED]:   [],
    [INVOICE_STATUS.REJECTED]:   [],
    [INVOICE_STATUS.PAID]:       [],
    [INVOICE_STATUS.CANCELLED]:  [],
  };

  return (transitions[normalizedFrom] || []).includes(to);
};

/**
 * Human-readable label for a given invoice status (for UI display).
 */
export const getStatusLabel = (status) => {
  const labels = {
    [INVOICE_STATUS.DRAFT]:                   'Draft',
    [INVOICE_STATUS.SUBMITTED]:               'Submitted',
    [INVOICE_STATUS.PENDING_THREE_WAY_MATCH]: 'PENDING THREE-WAY MATCH',
    [INVOICE_STATUS.PENDING_ADMIN_REVIEW]:    'Pending Admin Review',
    [INVOICE_STATUS.PENDING_TEAM_LEAD]:       'PENDING BY TEAM LEAD',
    [INVOICE_STATUS.PENDING_MANAGER]:         'PENDING BY MANAGER',
    [INVOICE_STATUS.PENDING_FINANCE_HEAD]:    'PENDING BY FINANCE HEAD',
    [INVOICE_STATUS.APPROVED]:                'Approved',
    [INVOICE_STATUS.REJECTED]:                'Rejected',
    [INVOICE_STATUS.PAID]:                    'Paid',
    [INVOICE_STATUS.CANCELLED]:               'Cancelled',
    // Legacy
    PENDING_L1:   'Pending Team Lead Approval',
    PENDING_L2:   'Pending Manager Approval',
    PENDING_L3:   'Pending Finance Head Approval',
    pending:      'Pending Team Lead Approval',
    PENDING:      'Pending Team Lead Approval',
  };
  return labels[status] || status;
};

