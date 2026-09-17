# Super Admin Module Architecture Analysis And Implementation Plan

## Current Architecture

### Technology Stack

- Backend: Node.js, Express 5, Prisma 7 with `@prisma/adapter-pg`, PostgreSQL, JWT, Zod, bcryptjs.
- Frontend: Vite, React, JavaScript/JSX, React Router, Axios, Tailwind CSS, lucide-react.
- Testing: backend uses Node's built-in `node:test`; frontend has no test runner configured.
- Authentication: JWT access token plus refresh token. Tokens are stored by the frontend in localStorage or sessionStorage.

The attached request mentions "Admin" and "Vendor" as possible roles. The actual code currently defines these roles:

- `SUPER_ADMIN`
- `CASE_MANAGER`
- `TEAM_LEAD`
- `MANAGER`
- `FINANCE_HEAD`

There is no current `ADMIN` or `VENDOR` role in the Prisma `User.role` model usage or frontend role constants.

## Authentication And Login Flow

Backend files:

- `backend/src/modules/auth/auth.routes.js`
- `backend/src/modules/auth/auth.controller.js`
- `backend/src/modules/auth/auth.service.js`
- `backend/src/utils/jwt.js`
- `backend/src/middleware/auth.middleware.js`
- `backend/src/middleware/authorize.middleware.js`

Flow:

1. `POST /api/v1/auth/login` validates email/password.
2. `AuthService.login()` loads the user by email.
3. Password is verified using `bcrypt.compare`.
4. JWT access and refresh tokens are generated.
5. Refresh token and last login timestamp are stored on the user row.
6. Sanitized user data is returned to the frontend.

Current strengths:

- Passwords are hashed.
- Refresh token is persisted and rotated on refresh.
- `protect` checks user status and soft deletion on each protected request.

Current gaps:

- No login rate limiting.
- Failed login attempts are not audited.
- Successful admin login is not audited.
- Frontend stores tokens in browser storage.
- Existing seeders include fallback/default passwords in source. They are hashed before storage, but defaults should be environment-driven and not documented as credentials.

## Existing Authorization And Permissions

Current state after the recent foundation pass:

- `backend/src/modules/auth/role-permissions.js` defines permission keys and role-permission mappings.
- `backend/src/utils/jwt.js` includes computed permissions in JWT access tokens.
- `backend/src/middleware/auth.middleware.js` attaches computed permissions to `req.user`.
- `backend/src/middleware/authorize.middleware.js` accepts both legacy role arrays and permission-key arrays.
- Frontend `ProtectedRoute` and sidebar navigation check `user.permissions`.

Converted backend route families:

- Vendors
- Users
- Purchase Orders
- Payments
- Dashboard

Still requiring full permission conversion:

- Auth protected sub-routes
- Invoices
- Three-way matching
- Approvals
- Audit logs
- Notifications

## Database Structure

Prisma schema contains:

- `User`
- `Vendor`
- `PurchaseOrder`
- `GoodsReceiptNote`
- `Invoice`
- `ThreeWayMatch`
- `Payment`
- `PaymentOld`
- `AuditLog`
- `ApprovalLog`
- `Notification`

Important relationships:

- Users create vendors, purchase orders, invoices, GRNs, payments.
- Users approve invoices at Team Lead, Manager, and Finance Head stages.
- Vendors relate to purchase orders, invoices, payments, and GRNs.
- Invoices relate to vendors, purchase orders, payments, matching records, and approval/audit logs.
- Audit logs and approval logs record workflow history with actor references.

Current migration safety status:

- Existing migrations create vendor/PO/invoice/payment flow and notifications.
- No DB-backed role/permission table exists yet.
- A DB migration is needed only if we choose custom roles or persistent per-user permissions.

## Current Super Admin Functionality

Super Admin currently has access to:

- Dashboard
- Reports
- Users
- Settings
- Notifications
- System analytics/dashboard overview via backend dashboard route
- Some operational pages, depending on route mapping and prior hardcoded role arrays

This is partly incorrect for the requested separation. The prompt says Super Admin should have platform control, monitoring, reporting, user administration, auditing, and analytics, but not ordinary operational procurement work unless explicitly allowed by permission.

## Current Case Manager Functionality

Case Manager currently has access to:

- Dashboard
- Vendors
- Purchase Orders
- Invoices
- Three-way matching
- Payment request creation/tracking
- Tickets/notifications where permitted

Correct Case Manager responsibilities:

- Operational vendor/PO/invoice/GRN/matching/payment-request work.
- No user management.
- No platform settings.
- No role management.
- No global audit/log administration.
- No payment execution.
- No final approval.

Incorrect or risky assignments found:

- Historically, frontend navigation exposed broad admin/operational overlap by role arrays.
- Purchase-order creation had allowed `FINANCE_HEAD` and `SUPER_ADMIN`; converted route access now uses `MANAGE_PURCHASE_ORDERS`, assigned only to Case Manager.
- Payment create had allowed `FINANCE_HEAD`; converted route access now uses `CREATE_PAYMENT_REQUEST`, assigned to Case Manager.
- Super Admin previously saw operational procurement features in frontend role arrays; permission navigation removes those unless permissions are deliberately assigned.
- Approval frontend was mock-backed; now it calls backend approval/audit history APIs.

## Existing User Management

Backend files:

- `backend/src/modules/users/user.routes.js`
- `backend/src/modules/users/user.controller.js`
- `backend/src/modules/users/user.service.js`
- `backend/src/modules/users/user.repository.js`
- `backend/src/zodSchema/user.schema.js`

Current capabilities:

- Create users.
- List/search users with pagination.
- Get user by id.
- Update user fields.
- Soft delete user.
- Update user status.
- Admin reset password.

Gaps:

- No final-active-Super-Admin protection.
- No privilege-escalation guard beyond route authorization.
- No per-user activity detail endpoint.
- No created_by/updated_by relation fields beyond string metadata.
- No role matrix UI.
- No direct permission assignment model.

## Existing Dashboards, Reports, Logs, Analytics

Backend:

- `dashboard.repository.js` aggregates vendor, PO, invoice, payment, matching, recent activity, role-specific pending counts.
- `audit.repository.js` can read `AuditLog` and fallback/merge with `ApprovalLog`.
- `approval.repository.js` provides approval/audit history.

Frontend:

- `Dashboard.jsx` switches by role and uses role dashboard components.
- `Reports.jsx` loads vendors, POs, invoices, and payments client-side.
- `ApprovalsList.jsx` now calls backend approval logs but is not yet a true approval queue.
- Audit logs page is not yet a dedicated Super Admin interface.

Gaps:

- Super Admin dashboard does not yet have full date filtering.
- Revenue calculations need explicit formulas based on `Payment.status` and/or `Invoice.payment_status`.
- Some frontend reports calculate in browser instead of optimized backend aggregates.
- No failed login or suspicious admin activity panel.

## Frontend Routing And Layout

Files:

- `frontend/src/routes/AppRoutes.jsx`
- `frontend/src/layouts/DashboardLayout.jsx`
- `frontend/src/components/layout/Sidebar.jsx`
- `frontend/src/components/auth/ProtectedRoute.jsx`
- `frontend/src/constants/navigation.js`
- `frontend/src/config/permissions.js`

Current routes use one shared dashboard layout. There is no separate `/super-admin/*` route group yet. The request asks for a Super Admin prefix such as:

- `/super-admin/dashboard`
- `/super-admin/users`
- `/super-admin/vendors`
- `/super-admin/roles`
- `/super-admin/logs`
- `/super-admin/analytics`
- `/super-admin/settings`

Recommendation: add a Super Admin route group using the existing auth system and a specialized layout/navigation, not a separate authentication system.

## Seeder And Credentials

Files:

- `backend/src/utils/seedDevUsers.js`
- `backend/src/utils/seedAdmin.js`
- `backend/src/server.js`

Current state:

- `server.js` now uses the dev seeder path.
- Seeder is idempotent by checking user email.
- Passwords are hashed.
- Default password fallback still exists in source for dev users.

Required changes:

- Split production-safe Super Admin seed from dev demo users.
- Read `SUPER_ADMIN_EMAIL` and `SUPER_ADMIN_PASSWORD` from environment.
- Refuse production seeding if password env is missing or weak.
- Avoid logging credentials.
- Audit seeder-created/updated Super Admin without sensitive fields.

## Proposed Permission Matrix

System permissions should use stable string names. Current permission keys are uppercase; the request examples are dotted lower-case. To avoid churn, either can work if centralized. For long-term clarity, dotted lower-case is better.

Minimum target permissions:

- `users.view`
- `users.create`
- `users.edit`
- `users.activate`
- `users.deactivate`
- `users.delete`
- `users.assign_roles`
- `roles.view`
- `roles.manage`
- `vendors.view`
- `vendors.manage`
- `cases.view`
- `cases.manage`
- `reports.view`
- `analytics.view`
- `logs.view`
- `settings.view`
- `settings.manage`

Recommended mapping:

| Role | Main Permissions |
| --- | --- |
| Super Admin | users, roles, logs, analytics, reports, settings, platform vendor inspection |
| Case Manager | cases/operations, vendors operational work, PO/GRN/invoice creation, matching execution, payment request creation |
| Team Lead | L1 approval queue/history, invoice read, matching read |
| Manager | L2 approval queue/history, invoice read, matching read |
| Finance Head | final approval, payment execution, finance reports, audit read |

## File-By-File Implementation Plan

### Backend Foundation

1. `backend/src/modules/auth/role-permissions.js`
   - Rename/extend permission keys to dotted names or provide aliases.
   - Add route-level policy metadata.

2. `backend/src/middleware/authorize.middleware.js`
   - Keep permission-aware authorization.
   - Add stricter error metadata without leaking sensitive data.

3. `backend/src/middleware/auth.middleware.js`
   - Keep account status checks.
   - Add request correlation id later if logging system supports it.

4. `backend/src/modules/auth/auth.service.js`
   - Record successful and failed login attempts.
   - Add admin-login audit events.
   - Avoid OTP/password logs.

5. `backend/src/modules/auth/auth.routes.js`
   - Add optional `/super-admin/login` alias using same auth service.
   - Add rate limiting middleware to login/forgot/reset routes.

### Seeder

1. `backend/src/utils/seedSuperAdmin.js`
   - Create production-safe idempotent Super Admin seeder.
   - Use env variables only.
   - Hash password.
   - Validate minimum password strength.

2. `backend/src/server.js`
   - Run Super Admin seed safely.
   - Keep dev demo users only in non-production.

### Super Admin Backend APIs

1. `backend/src/modules/super-admin/super-admin.routes.js`
   - Route prefix `/api/v1/super-admin`.

2. `backend/src/modules/super-admin/super-admin.controller.js`
   - Dashboard, user overview, vendor overview, role matrix, audit log wrappers.

3. `backend/src/modules/super-admin/super-admin.service.js`
   - Business logic and permission checks.

4. `backend/src/modules/super-admin/super-admin.repository.js`
   - Optimized aggregate queries.
   - Date range filters.
   - Pagination.

5. `backend/src/modules/super-admin/super-admin.validation.js`
   - Zod schemas for filters, date ranges, user actions, exports.

### User Management

1. `backend/src/modules/users/user.service.js`
   - Prevent deactivation/deletion of final active Super Admin.
   - Prevent unauthorized privilege escalation.
   - Record audit events for create/update/status/role/password-reset.

2. `backend/src/modules/users/user.repository.js`
   - Add filters for role, status, created date.
   - Select limited columns.

3. `frontend/src/pages/SuperAdmin/Users/*`
   - User list, filters, details, create/edit, status actions, reset flow.

### Role And Permission Management

Because no DB-backed custom roles exist, first implementation should be a fixed system-role permission matrix.

1. Backend endpoint: `GET /api/v1/super-admin/roles`
   - Return system roles, permissions, user counts.

2. Frontend:
   - `frontend/src/pages/SuperAdmin/Roles/RoleMatrix.jsx`
   - Read-only initially unless a DB migration for custom roles is approved.

### Vendor Management

1. Backend:
   - Add Super Admin vendor analytics endpoints using real vendor/payment/PO/invoice data.
   - Use only existing DB fields.

2. Frontend:
   - `frontend/src/pages/SuperAdmin/Vendors/VendorOverview.jsx`
   - KPI cards, table, date filters, status filters.

### Audit Logs

1. Backend:
   - Extend audit filters: actor, role, action, entity type, date range, source.
   - Add audit writes for login/user/role/vendor/settings/export events.

2. Frontend:
   - `frontend/src/pages/SuperAdmin/Logs/AuditLogs.jsx`
   - Search, filters, detail drawer/modal, pagination.

### Analytical Dashboard

1. Backend:
   - `GET /api/v1/super-admin/dashboard`
   - Date range parser with timezone-safe day boundaries.
   - Metrics:
     - Total users: count `users` excluding deleted.
     - Active users: `status = ACTIVE`.
     - Inactive users: non-active or deleted, clearly defined.
     - Total vendors: count `vendors` excluding deleted.
     - Active vendors: approved/active status according to current status values.
     - New vendors: `created_at` in range.
     - Case managers: users with `role = CASE_MANAGER`.
     - Total operations: use invoices/POs/payments counts; label precisely.
     - Revenue: sum completed/success payment amounts only.
     - Average revenue per vendor: completed revenue divided by vendors with completed payments.

2. Frontend:
   - `frontend/src/pages/SuperAdmin/Dashboard/SuperAdminDashboard.jsx`
   - Date range filter, KPI grid, charts, recent activity.

### Frontend Super Admin Routing

1. `frontend/src/routes/AppRoutes.jsx`
   - Add `/super-admin/*` routes.

2. `frontend/src/layouts/SuperAdminLayout.jsx`
   - Dedicated Super Admin sidebar and header.

3. `frontend/src/constants/superAdminNavigation.js`
   - Permission-driven navigation.

4. `frontend/src/components/auth/ProtectedRoute.jsx`
   - Already supports permission checks; extend route map for `/super-admin/*`.

## Testing Plan

Backend tests:

- Super Admin seed creates one user.
- Login succeeds with valid Super Admin.
- Login fails with bad password.
- Disabled Super Admin cannot login.
- Case Manager cannot access `/api/v1/super-admin/*`.
- Super Admin can access `/api/v1/super-admin/*`.
- Cannot deactivate/delete final active Super Admin.
- User status changes write audit logs.
- Dashboard aggregates use completed payments only.
- Date range filters produce expected boundaries.
- Pagination metadata is correct.

Frontend tests need a test framework decision; none is currently configured.

## Security And Performance Plan

Security:

- Add rate limiting to auth endpoints.
- Remove sensitive auth logs.
- Rotate any exposed secrets in `.env`.
- Keep backend authorization on every Super Admin endpoint.
- Never trust frontend route hiding.
- Avoid mass assignment by mapping allowed fields.

Performance:

- Use Prisma `count`, `aggregate`, and `groupBy`.
- Use pagination on users/vendors/logs.
- Select only required columns.
- Add indexes only through safe migrations if filter performance requires it.

## Implementation Order

1. Finish permission conversion for remaining route families.
2. Add secure Super Admin seeder.
3. Add auth audit/rate limiting.
4. Add Super Admin backend module.
5. Add Super Admin frontend layout/routes.
6. Build user management.
7. Build role matrix.
8. Build vendor management.
9. Build audit logs.
10. Build analytical dashboard.
11. Add tests.
12. Run backend tests, frontend lint, frontend build, backend route smoke checks.

## Assumptions And Decisions Needed

1. There is no current Vendor user role. Confirm whether to add it.
2. There is no current Admin role. Confirm whether to add it or keep only Super Admin.
3. Custom roles require database tables and migrations. Approval is needed before implementing.
4. `/super-admin/login` can reuse the same auth service and simply restrict successful access to Super Admin users.
5. Revenue should be calculated from `payments.amount` with successful/completed status, unless you define another business rule.
