# VMS Rebuild Audit And Gap Report

## 0. Actual Project Baseline

The attached rebuild prompt targets a Next.js 14 + React Query + TypeScript frontend and an Express 4 + Prisma 5 backend. The current repository is:

- Frontend: Vite, React, JavaScript/JSX, Tailwind, Axios, React Router.
- Backend: Express 5, Prisma 7 adapter-pg, PostgreSQL, JWT.
- Database: existing Prisma schema with users, vendors, purchase orders, GRN, invoices, three-way matches, payments, audit logs, approval logs, notifications.

This means the rebuild must either migrate stacks intentionally or harden the current stack first. Current work keeps the existing stack stable and moves it toward the prompt architecture without destructive schema changes.

## 1. Backend Audit

### 1.1 Route Inventory

Global middleware in `backend/src/app.js`:

- `helmet()`
- `cors()` with `FRONTEND_URL`, localhost `3000`, and Vite ports `5173-5176`
- `morgan()`
- JSON/urlencoded parsers
- cookie parser
- development request logger
- `/health`
- centralized 404 and error handler

Mounted API routes:

- `/api/v1/auth` -> `backend/src/modules/auth/auth.routes.js`
- `/api/v1/users` -> `backend/src/modules/users/user.routes.js`
- `/api/v1/vendors` -> `backend/src/modules/vendors/vendor.routes.js`
- `/api/v1/purchase-orders` -> `backend/src/modules/purchase-orders/po.routes.js`
- `/api/v1/invoices` -> `backend/src/modules/invoices/invoice.routes.js`
- `/api/v1/payments` -> `backend/src/modules/payments/payment.routes.js`
- `/api/v1/approvals` -> `backend/src/modules/approvals/approval.routes.js`
- `/api/v1/dashboard` -> `backend/src/modules/dashboard/dashboard.routes.js`
- `/api/v1/audit-logs` -> `backend/src/modules/audit-logs/audit.routes.js`
- `/api/v1/notifications` -> `backend/src/modules/notifications/notification.routes.js`
- `/api/v1/three-way-matching` -> `backend/src/modules/three-way-matching/matching.routes.js`

Representative protected endpoints:

- Auth: `POST /login`, `POST /forgot-password`, `POST /verify-otp`, `POST /reset-password`, `POST /refresh-token`, `POST /logout`, `GET /profile`, `PUT /password`
- Vendors: `POST /`, `GET /`, `GET /:id`, `PUT /:id`, `PATCH /:id/approve`, `PATCH /:id/reject`, `PATCH /:id/block`, `PATCH /:id/unblock`
- Purchase Orders: `POST /`, `GET /`, `GET /:id`, `PATCH /:id/status`
- Invoices: queue endpoints, CRUD/action endpoints, approval/rejection/cancel/admin-review/delete/restore/remark/history endpoints
- Three-Way Matching: GRN create/update/read, start match, list, by invoice, by id, admin approve/reject
- Payments: pending/completed/list/detail/create/update/delete/history/approve/reject/cancel/refund/retry
- Dashboard: overview, role dashboard, finance-head observation
- Users: CRUD, status update, admin password reset
- Audit/Approval/Notifications: list/read/update endpoints

Rate limiting is not currently configured per endpoint. CORS is global. Authorization is route-level role arrays.

### 1.2 Controller And Service Summary

Controllers are thin and generally delegate to services:

- `AuthController`: login, logout, refresh token, profile, password reset/change.
- `UserController`: internal user CRUD/status/password reset.
- `VendorController`: vendor CRUD and review statuses.
- `PurchaseOrderController`: PO create/list/detail/status.
- `InvoiceController`: invoice lifecycle, approval queues, approval actions, admin review, delete/restore, finance remarks.
- `MatchingController`: GRN and three-way matching workflow.
- `PaymentController`: payment request and payment status lifecycle.
- `DashboardController`: aggregate dashboards.
- `AuditController`, `ApprovalController`, `NotificationController`: activity and notification surfaces.

Services contain most business logic and use repositories for Prisma access. Invoice, matching, and payment services use transactions for workflow transitions and audit logging.

### 1.3 Data Access And Schema

Prisma models:

- `User` mapped to `users`
- `Vendor` mapped to `vendors`
- `PurchaseOrder` mapped to `purchase_orders`
- `GoodsReceiptNote` mapped to `goods_receipt_notes`
- `Invoice` mapped to `invoices`
- `ThreeWayMatch` mapped to `three_way_matches`
- `Payment` mapped to `payments`
- `PaymentOld` mapped to `payments_old`
- `AuditLog` mapped to `audit_logs`
- `ApprovalLog` mapped to `approval_logs`
- `Notification` mapped to `notifications`

Indexes exist for common status/entity access paths, including vendor status, PO vendor/status, invoice status/vendor/PO/approval role/deleted flag, match invoice/status, payment status/invoice/vendor/PO, audit entity/user/date, notifications user/read/date.

### 1.4 Middleware And Security

Current middleware:

- `authenticate.middleware.js`: verifies JWT and sets `req.user`.
- `auth.middleware.js`: alternate protect middleware used by most routes.
- `authorize.middleware.js`: role-array authorization.
- `validate.middleware.js`: Zod request validation.
- `asyncHandler.middleware.js`: async controller wrapper.
- `audit.middleware.js`: available audit helper.
- `error.middleware.js`: central error handling exists but app also defines inline error handler.

Security gaps:

- JWT previously carried only role; now it also carries backend-derived permissions.
- Backend route authorization is still mostly role-array based.
- No DB-backed permission tables yet.
- No per-endpoint rate limiting.
- Secrets exist in `.env`; rotate before production.

### 1.5 Current Permission System

Before this pass:

- Backend: role arrays in route files.
- Frontend: hardcoded role-to-path arrays and navigation item roles.
- JWT: user id + role only.

After this pass:

- Backend: `role-permissions.js` defines permission keys and role-permission mappings.
- JWT/profile/login responses include `permissions`.
- Frontend sidebar and route guard consume `user.permissions`.
- `protect` attaches fresh computed permissions to `req.user`.
- `authorize()` supports both legacy role arrays and permission-key arrays.
- Vendor, user, purchase-order, payment, and dashboard routes now use permission-key authorization.

Remaining gap: invoice, matching, approvals, audit, notifications, and auth protected sub-routes still need full permission-key conversion.

### 1.6 Workflow Rules

Coded invoice approval helper:

- Amount <= 10000 -> Team Lead final approval.
- 10000 < amount <= 100000 -> Team Lead then Manager.
- amount > 100000 -> Team Lead, Manager, Finance Head.

This aligns with Phase 4 threshold intent. Existing code also includes three-way matching and admin review stages before approval in parts of the invoice workflow.

Payment workflow:

- Case Manager can create payment requests.
- Finance Head can approve/process/retry/refund through payment routes and service checks.
- Provider execution is mock/manual provider based.

## 2. Frontend Audit

### 2.1 Navigation And Protection

Files:

- `frontend/src/constants/navigation.js`
- `frontend/src/components/layout/Sidebar.jsx`
- `frontend/src/components/auth/ProtectedRoute.jsx`
- `frontend/src/routes/AppRoutes.jsx`

Before this pass, visibility was role-array based. It now uses permission keys from backend-provided `user.permissions`.

### 2.2 Page Inventory

Core pages:

- Auth: `Login.jsx`
- Dashboard: `Dashboard.jsx`, role dashboard components
- Vendors: list/add/edit/detail
- Users: list/create
- Purchase Orders: list/create
- Invoices: list/create/details
- Three-Way Matching: list/detail
- Payments: list/create
- Approvals: list
- Reports, Settings, Notifications, Tickets, NotFound, Forbidden

### 2.3 Data Fetching

Current pattern is Axios services plus `useEffect/useState`. React Query is not installed or used. Loading states exist in many pages but are inconsistent and often plain text rather than skeletons.

Axios configuration:

- `frontend/src/api/axios.js`
- Base URL from `VITE_API_BASE_URL`, fallback likely localhost.
- Auth token attached from local/session storage.

### 2.4 Mock/Static Data

Known mock/static data:

- `frontend/src/mock/approvals.js` was used by `approvalService`; this has been replaced with backend API calls.
- `frontend/src/mock/vendors.js` still exists and must be checked for active imports.
- `frontend/src/services/vendorStorage.js` uses localStorage and should be removed if unused.
- Several pages still contain static card copy and fake trend text.
- Debug `console.log` calls remain in vendor, PO, invoice services/pages.

### 2.5 Frontend Security Gaps

- Tokens are stored in local/session storage; prompt target prefers secure storage/session handling.
- Route protection is client-side only because Vite has no Next middleware.
- No refresh-token interceptor flow yet.
- Some action buttons still use role checks directly instead of permission checks.

## 3. Gap Analysis

| Area | Backend Reality | Frontend Reality | Severity | Fix |
| --- | --- | --- | --- | --- |
| Stack | Express 5/Prisma 7 | Vite React JS | High | Decide whether to migrate to prompt stack or harden current stack |
| Permissions | Role arrays + new computed permissions | Now permission-based nav/route guard | High | Add backend permission middleware per endpoint |
| Vendor CRUD | Real endpoints | Mostly wired, debug logs remain | Medium | Remove logs, add permission action gates |
| PO CRUD | Real create/list/detail/status | Wired, some debug logs/static stats | Medium | Tighten action permissions |
| Invoice Approval | Multi-stage service exists | Wired list/details, needs richer approval UI | High | Align all buttons with permission keys |
| Approvals | Audit history backend | Now calls backend, still not true live queue UI | High | Build queue-specific endpoint/UI |
| Three-Way Matching | Real GRN/matching endpoints | Wired list/detail | Medium | Add accept/hold action semantics for Case Manager |
| Payments | Real lifecycle + provider mock | Wired | High | Split request vs execution UI permissions |
| Dashboard | Role aggregations exist | Wired with role dashboards | Medium | Replace static card copy and add skeletons |
| React Query | Not used | Not installed | High | Install and migrate services/hooks gradually |
| Testing | Backend node:test only | No frontend tests | High | Add module tests as features are migrated |
| API Docs | No Swagger surface confirmed | N/A | Medium | Add OpenAPI generation |

## 4. Target Architecture Decision

To avoid skipping the prompt while respecting its guardrails:

1. Complete docs and safe foundation changes first.
2. Avoid database migrations until explicitly approved.
3. Avoid approval/payment logic rewrites until explicitly approved.
4. Migrate feature modules in the prompt order.

## 5. Execution Plan

### Completed In This Pass

- Root scripts repaired.
- Backend test script repaired.
- Backend dev seeding deduplicated.
- Frontend build/lint runtime errors fixed.
- Backend-derived permissions added to JWT/profile/login.
- Frontend sidebar and route guard changed to permission-based filtering.
- Approval service moved from mock data to backend endpoints.
- Backend `protect`/`authorize` made permission-aware.
- Vendor, user, purchase-order, payment, and dashboard route authorization moved to permission keys.

### Next Required Changes

- Finish converting invoice, matching, approvals, audit, notifications, and auth protected routes from role arrays to permission keys.
- Add `/api/v1/auth/permissions` or include richer permission metadata in `/profile`.
- Replace direct role checks in page action buttons with `hasPermission`.
- Remove active console logs and static fake statistics.
- Add React Query and migrate services screen-by-screen.
- Add skeleton/error/empty states consistently.
- Add OpenAPI documentation.
- Add backend integration tests for auth, vendors, PO, invoices, payments.

## 6. Guarded Items Needing Explicit Approval

The prompt says to stop before:

- Database schema changes.
- Permission model DB tables.
- Approval logic changes.
- Payment logic changes.
- Major restructuring.

Those items remain intentionally unexecuted until approval because they can change production data and business behavior.
