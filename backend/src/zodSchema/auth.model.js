export const USER_TABLE = 'users';

/**
 * System-wide Role constants.
 * ─────────────────────────────────────────────────────────────────────
 * SUPER_ADMIN    → System administrator (full access)
 * CASE_MANAGER   → Creates vendors, POs, invoices; initiates 3-way matching
 * TEAM_LEAD      → Approves invoices ≤ ₹10,000 (formerly L1)
 * MANAGER        → Approves invoices ₹10,001–₹1,00,000 (formerly L2)
 * FINANCE_HEAD   → Approves invoices > ₹1,00,000; Vendor review; Payment approval (merged L3 + FINANCE_MANAGER)
 * ─────────────────────────────────────────────────────────────────────
 */
export const ROLES = {
  SUPER_ADMIN:   'SUPER_ADMIN',
  CASE_MANAGER:  'CASE_MANAGER',
  TEAM_LEAD:     'TEAM_LEAD',
  MANAGER:       'MANAGER',
  FINANCE_HEAD:  'FINANCE_HEAD',
};

export const AUTH_STATUS = {
  ACTIVE:    'ACTIVE',
  INACTIVE:  'INACTIVE',
  SUSPENDED: 'SUSPENDED',
  LOCKED:    'LOCKED',
  PENDING:   'PENDING',
  DISABLED:  'DISABLED',
};

export const USER_COLUMNS = {
  ID:                         'id',
  EMPLOYEE_ID:                'employee_id',
  EMAIL:                      'email',
  PASSWORD:                   'password',
  ROLE:                       'role',
  FIRST_NAME:                 'first_name',
  LAST_NAME:                  'last_name',
  PHONE:                      'phone',
  ALTERNATE_PHONE:            'alternate_phone',
  DESIGNATION:                'designation',
  BRANCH:                     'branch',
  REGION:                     'region',
  STATUS:                     'status',
  STATUS_CHANGED_AT:          'status_changed_at',
  STATUS_CHANGED_BY:          'status_changed_by',
  UPDATED_BY:                 'updated_by',
  DELETED_AT:                 'deleted_at',
  DELETED_BY_ID:              'deleted_by_id',
  LAST_LOGIN_AT:              'last_login_at',
  REFRESH_TOKEN:              'refresh_token',
  PASSWORD_RESET_OTP:         'password_reset_otp',
  PASSWORD_RESET_OTP_EXPIRES: 'password_reset_otp_expires',
  ACTIVATION_TOKEN_HASH:      'activation_token_hash',
  ACTIVATION_TOKEN_EXPIRES_AT: 'activation_token_expires_at',
  ACTIVATION_TOKEN_USED_AT:   'activation_token_used_at',
  ACTIVATION_SENT_AT:         'activation_sent_at',
  ACTIVATION_LAST_SENT_AT:    'activation_last_sent_at',
  ACTIVATION_RESEND_COUNT:    'activation_resend_count',
  ACTIVATED_AT:               'activated_at',
  PASSWORD_SET_AT:            'password_set_at',
  MUST_CHANGE_PASSWORD:       'must_change_password',
  TEMPORARY_PASSWORD_EXPIRES_AT: 'temporary_password_expires_at',
  PASSWORD_CHANGED_AT:        'password_changed_at',
  CREDENTIALS_EMAIL_STATUS:   'credentials_email_status',
  CREDENTIALS_EMAIL_SENT_AT:  'credentials_email_sent_at',
  FAILED_LOGIN_ATTEMPTS:      'failed_login_attempts',
  LOCKED_UNTIL:               'locked_until',
  CREATED_AT:                 'created_at',
  UPDATED_AT:                 'updated_at',
};

export const USER_DEFAULTS = {
  ROLE:      ROLES.TEAM_LEAD,
};

export const UserEntity = {
  table:   USER_TABLE,
  columns: USER_COLUMNS,
};
