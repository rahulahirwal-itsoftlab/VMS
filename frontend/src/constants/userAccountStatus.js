export const USER_ACCOUNT_STATUS = Object.freeze({
  ACTIVE: "ACTIVE",
  DEACTIVATED: "INACTIVE",
});

export const USER_ACCOUNT_STATUS_OPTIONS = Object.freeze([
  { value: USER_ACCOUNT_STATUS.ACTIVE, label: "Active" },
  { value: USER_ACCOUNT_STATUS.DEACTIVATED, label: "Deactivated" },
]);

export const USER_ACCOUNT_STATUS_LABELS = Object.freeze({
  [USER_ACCOUNT_STATUS.ACTIVE]: "Active",
  [USER_ACCOUNT_STATUS.DEACTIVATED]: "Deactivated",
});

export const getUserAccountStatusLabel = (status) =>
  USER_ACCOUNT_STATUS_LABELS[status] || status || "-";
