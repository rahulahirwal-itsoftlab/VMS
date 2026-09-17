export const USER_ACCOUNT_STATUS = Object.freeze({
  ACTIVE: 'ACTIVE',
  DEACTIVATED: 'INACTIVE',
});

export const USER_ACCOUNT_STATUS_FILTER_VALUES = Object.freeze([
  USER_ACCOUNT_STATUS.ACTIVE,
  USER_ACCOUNT_STATUS.DEACTIVATED,
]);

export const USER_ACCOUNT_STATUS_LABELS = Object.freeze({
  [USER_ACCOUNT_STATUS.ACTIVE]: 'Active',
  [USER_ACCOUNT_STATUS.DEACTIVATED]: 'Deactivated',
});

export const isAllowedUserAccountStatus = (status) =>
  USER_ACCOUNT_STATUS_FILTER_VALUES.includes(status);
