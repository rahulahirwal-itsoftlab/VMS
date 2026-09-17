import { ROLES } from "./permissions";

export const ROLE_DASHBOARD_PATHS = {
  [ROLES.SUPER_ADMIN]: "/dashboard",
  [ROLES.FINANCE_HEAD]: "/dashboard",
  [ROLES.MANAGER]: "/dashboard",
  [ROLES.TEAM_LEAD]: "/dashboard",
  [ROLES.CASE_MANAGER]: "/dashboard",
};

export const getDashboardPathForRole = (role) =>
  ROLE_DASHBOARD_PATHS[role] || "/dashboard";
