import { PERMISSION_KEYS } from '../auth/role-permissions.js';

/**
 * Permission mapping for the Vendor Management module.
 *
 * CREATE: Case Manager creates vendors
 * READ:   All authenticated roles can view vendors
 * REVIEW: Finance Head reviews (approve/reject/block) vendors — merged from former FINANCE_MANAGER
 */
export const VENDOR_PERMISSIONS = {
  CREATE: [
    PERMISSION_KEYS.MANAGE_VENDORS,
  ],
  READ:   [PERMISSION_KEYS.VIEW_VENDORS],
  REVIEW: [PERMISSION_KEYS.REVIEW_VENDORS],
};
