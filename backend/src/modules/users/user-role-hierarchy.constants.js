import { ROLES } from '../../zodSchema/auth.model.js';

export const ROLE_HIERARCHY = Object.freeze({
  [ROLES.SUPER_ADMIN]: 5,
  [ROLES.FINANCE_HEAD]: 4,
  [ROLES.MANAGER]: 3,
  [ROLES.TEAM_LEAD]: 2,
  [ROLES.CASE_MANAGER]: 1,
});
