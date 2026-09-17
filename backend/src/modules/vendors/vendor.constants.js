export const VENDOR_STATUS = {
  PENDING: 'PENDING',
  ACTIVE: 'ACTIVE',
  APPROVED: 'ACTIVE',
  INACTIVE: 'INACTIVE',
  REJECTED: 'INACTIVE',
  BLOCKED: 'BLOCKED',
};

export const VENDOR_APPROVAL_STATUS = {
  DRAFT: 'DRAFT',
  PENDING: 'PENDING',
  PENDING_APPROVAL: 'PENDING_APPROVAL',
  UNDER_REVIEW: 'UNDER_REVIEW',
  PENDING_INFORMATION: 'PENDING_INFORMATION',
  CHANGES_REQUESTED: 'CHANGES_REQUESTED',
  APPROVED: 'APPROVED',
  REJECTED: 'REJECTED',
  BLOCKED: 'BLOCKED',
};

export const VENDOR_PENDING_CHANGE_STATUS = {
  PENDING_APPROVAL: 'PENDING_APPROVAL',
  UNDER_REVIEW: 'UNDER_REVIEW',
  CHANGES_REQUESTED: 'CHANGES_REQUESTED',
  APPROVED: 'APPROVED',
  REJECTED: 'REJECTED',
};

export const LEGACY_VENDOR_STATUS = {
  PENDING: 'pending',
  APPROVED: 'approved',
  REJECTED: 'rejected',
  BLOCKED: 'blocked',
};

export const VENDOR_REVIEW_ACTION = {
  APPROVE: 'approve',
  REJECT: 'reject',
  HOLD: 'hold',
  BLOCK: 'block',
  RETURN_TO_PENDING: 'return_to_pending',
  UNBLOCK: 'unblock',
};

export const VENDOR_REVIEW_STATUS_LABELS = {
  [VENDOR_STATUS.PENDING]: 'Pending Review',
  [VENDOR_STATUS.ACTIVE]: 'Active',
  [VENDOR_STATUS.INACTIVE]: 'Inactive',
  [VENDOR_STATUS.BLOCKED]: 'On Hold',
};

export const VENDOR_FILTER_STATUS_MAP = {
  pending: {
    status: VENDOR_STATUS.PENDING,
    approval_status: { in: [VENDOR_APPROVAL_STATUS.PENDING, VENDOR_APPROVAL_STATUS.PENDING_APPROVAL, VENDOR_APPROVAL_STATUS.PENDING_INFORMATION] },
  },
  PENDING: {
    status: VENDOR_STATUS.PENDING,
    approval_status: { in: [VENDOR_APPROVAL_STATUS.PENDING, VENDOR_APPROVAL_STATUS.PENDING_APPROVAL, VENDOR_APPROVAL_STATUS.PENDING_INFORMATION] },
  },
  approved: {
    status: VENDOR_STATUS.ACTIVE,
    approval_status: VENDOR_APPROVAL_STATUS.APPROVED,
    is_active: true,
  },
  active: {
    status: VENDOR_STATUS.ACTIVE,
    approval_status: VENDOR_APPROVAL_STATUS.APPROVED,
    is_active: true,
  },
  ACTIVE: {
    status: VENDOR_STATUS.ACTIVE,
    approval_status: VENDOR_APPROVAL_STATUS.APPROVED,
    is_active: true,
  },
  APPROVED: {
    status: VENDOR_STATUS.ACTIVE,
    approval_status: VENDOR_APPROVAL_STATUS.APPROVED,
    is_active: true,
  },
  rejected: {
    status: VENDOR_STATUS.INACTIVE,
    approval_status: VENDOR_APPROVAL_STATUS.REJECTED,
  },
  inactive: {
    status: VENDOR_STATUS.INACTIVE,
    approval_status: VENDOR_APPROVAL_STATUS.REJECTED,
  },
  INACTIVE: {
    status: VENDOR_STATUS.INACTIVE,
    approval_status: VENDOR_APPROVAL_STATUS.REJECTED,
  },
  REJECTED: {
    status: VENDOR_STATUS.INACTIVE,
    approval_status: VENDOR_APPROVAL_STATUS.REJECTED,
  },
  blocked: {
    status: VENDOR_STATUS.BLOCKED,
    approval_status: VENDOR_APPROVAL_STATUS.BLOCKED,
  },
  BLOCKED: {
    status: VENDOR_STATUS.BLOCKED,
    approval_status: VENDOR_APPROVAL_STATUS.BLOCKED,
  },
};

export const normalizeVendorStatusFilter = (status) => {
  if (!status) return null;
  return VENDOR_FILTER_STATUS_MAP[status] || VENDOR_FILTER_STATUS_MAP[String(status).toUpperCase()] || null;
};

export const isVendorApprovedAndActive = (vendor) => {
  if (!vendor || vendor.deleted_at) return false;
  const status = String(vendor.status || '').toUpperCase();
  const approvalStatus = String(vendor.approval_status || '').toUpperCase();
  const legacyApproved = String(vendor.status || '').toLowerCase() === LEGACY_VENDOR_STATUS.APPROVED;

  return Boolean(
    vendor.is_active &&
    (
      (status === VENDOR_STATUS.ACTIVE && approvalStatus === VENDOR_APPROVAL_STATUS.APPROVED) ||
      legacyApproved
    ),
  );
};

export const VENDOR_MESSAGES = {
  CREATED: 'Vendor created successfully.',
  UPDATED: 'Vendor updated successfully.',
  APPROVED: 'Vendor approved successfully.',
  REJECTED: 'Vendor rejected successfully.',
  BLOCKED: 'Vendor blocked successfully.',
  UNBLOCKED: 'Vendor unblocked successfully.',
  NOT_FOUND: 'Vendor not found.',
  ONLY_APPROVED_FOR_PO: 'Only approved vendors can be used to create purchase orders.',
  DUPLICATE: 'Vendor with the same code, email, or tax ID already exists.',
};

export const VENDOR_REQUIRED_APPROVAL_FIELDS = [
  { key: 'name', label: 'legal name' },
  { key: 'email', label: 'email' },
  { key: 'phone', label: 'phone' },
  { key: 'address', label: 'address' },
  { key: 'tax', label: 'tax information' },
  { key: 'contact_person', label: 'primary contact' },
  { key: 'bank_account_no', label: 'bank account' },
  { key: 'ifsc_code', label: 'IFSC code' },
  { key: 'payment_terms', label: 'payment terms' },
];

export const VENDOR_REQUIRED_DOCUMENT_TYPES = [
  { type: 'GST_CERTIFICATE', label: 'GST Certificate' },
  { type: 'PAN_CARD', label: 'PAN Card' },
  { type: 'VENDOR_AGREEMENT', label: 'Vendor Agreement' },
];
