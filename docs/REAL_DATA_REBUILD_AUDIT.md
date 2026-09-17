# VMS Real Data Rebuild Audit

Date: 2026-07-15

Scope: This document answers the attached rebuild prompt before implementation. It inspects the current VMS codebase and records how every major frontend area should flow through backend APIs into PostgreSQL/Prisma, where fake/static/browser-only business data still exists, and which files must be changed to make the project production-ready without skipping any part of the prompt.

## 1. Architecture Summary

The current project is a Vite React frontend and an Express/Prisma backend, not a Next.js frontend. The production source of truth is PostgreSQL through Prisma.

Current backend API root:

- `/api/v1/auth`
- `/api/v1/users`
- `/api/v1/vendors`
- `/api/v1/purchase-orders`
- `/api/v1/invoices`
- `/api/v1/payments`
- `/api/v1/approvals`
- `/api/v1/dashboard`
- `/api/v1/audit-logs`
- `/api/v1/notifications`
- `/api/v1/three-way-matching`
- `/api/v1/reports`

Main Prisma models:

- `User`
- `Vendor`
- `PurchaseOrder`
- `GoodsReceiptNote`
- `Invoice`
- `ThreeWayMatch`
- `Payment`
- `PaymentOld` legacy/migration safety
- `AuditLog`
- `ApprovalLog` legacy compatibility
- `Notification`

Current frontend architecture:

- `frontend/src/api/axios.js` owns API transport and auth token attachment.
- `frontend/src/services/*.js` maps React pages to backend APIs.
- `frontend/src/routes/AppRoutes.jsx` maps app routes to pages.
- `frontend/src/config/permissions.js` and `frontend/src/components/auth/ProtectedRoute.jsx` guard route access.
- Role dashboards render through `frontend/src/pages/Dashboard/Dashboard.jsx` and `frontend/src/components/dashboard/roleDashboards/*`.

Important current state:

- Most CRUD service files already call backend APIs.
- A new `reports` backend module exists and is Prisma-backed, with summary/detail/export endpoints.
- Some older pages still compute business totals in the browser from loaded lists.
- Some dashboard components still contain deterministic dummy values and static chart data.
- Mock/localStorage files still exist in the frontend tree and must be removed or quarantined from production.

## 2. Frontend To Backend To Database Mapping

| Frontend area | Current frontend service | Backend route | Prisma source | Current status | Rebuild requirement |
| --- | --- | --- | --- | --- | --- |
| Login/profile/logout | `authService.js` | `/api/v1/auth` | `User` | API-backed | Keep; remove demo credential UI before production. |
| User management | `userService.js` | `/api/v1/users` | `User` | API-backed | Keep; ensure no static role lists conflict with backend roles. |
| Vendor list/create/detail/actions | `vendorService.js` | `/api/v1/vendors` | `Vendor`, `User`, related counts | API-backed, but page computes stats locally | Move stats and filters to backend summary/report endpoints or add vendor summary API. |
| Vendor report | `reportService.js` | `/api/v1/reports/vendors` | `Vendor`, `PurchaseOrder`, `Invoice`, `Payment` | API-backed | Keep; use this pattern for non-SuperAdmin report page too. |
| Purchase order list/create/detail/status | `purchaseOrderServices.js` | `/api/v1/purchase-orders` | `PurchaseOrder`, `Vendor`, `Invoice`, `Payment` | API-backed, but page computes stats/export locally | Move stats/export to reports API or add PO summary API. |
| PO report | `reportService.js` | `/api/v1/reports/purchase-orders` | `PurchaseOrder`, `Vendor`, counts | API-backed | Keep; make legacy PO export use backend export. |
| Invoice list/create/detail/approval | `invoiceService.js` | `/api/v1/invoices` | `Invoice`, `Vendor`, `PurchaseOrder`, `Payment`, `ThreeWayMatch`, `AuditLog` | API-backed, but browser generates invoice numbers and hard-coded stats | Generate invoice numbers server-side; replace local stats with backend summary. |
| Invoice report | `reportService.js` | `/api/v1/reports/invoices` | `Invoice`, `Vendor`, `PurchaseOrder`, `User` | API-backed | Keep; use for list summary/export where appropriate. |
| Payments | `paymentService.js` | `/api/v1/payments` | `Payment`, `Invoice`, `Vendor`, `PurchaseOrder`, `User` | API-backed | Keep; replace row download console action with backend receipt/export endpoint if required. |
| Payment report | `reportService.js` | `/api/v1/reports/payments` | `Payment`, related entities | API-backed | Keep. |
| Approvals | `approvalService.js` | `/api/v1/approvals` plus invoice actions | `AuditLog`/`ApprovalLog`, `Invoice` | API-backed now | Remove old mock approval module. |
| Dashboard | direct `api.get` in `DashboardOverview.jsx` | `/api/v1/dashboard/me`, `/finance-head/observation` | Aggregates from `Vendor`, `PurchaseOrder`, `Invoice`, `Payment`, `ThreeWayMatch`, `AuditLog` | Partially API-backed but has dummy fallback and hard-coded KPI values | Add real chart/summary fields in backend and remove all dummy fallbacks. |
| Three-way matching | `matchingService.js` | `/api/v1/three-way-matching` | `ThreeWayMatch`, `GoodsReceiptNote`, `Invoice`, `PurchaseOrder` | API-backed | Keep; ensure ticket page uses explicit backend ticket/discrepancy endpoint instead of filtering all matches in frontend. |
| Tickets | `matchingService.js` | `/api/v1/three-way-matching` | `ThreeWayMatch`, `Invoice` | Real data, but derived in browser | Add backend ticket/discrepancy list API or report endpoint. |
| Notifications | `notificationService.js` | `/api/v1/notifications` | `Notification` | API-backed | Keep. |
| Reports legacy page | direct CRUD services | `/vendors`, `/purchase-orders`, `/invoices`, `/payments` | Multiple models | Real records but frontend aggregates/export | Replace with `/api/v1/reports/*/summary` and `/export`. |
| Settings | none | none | none | Static unsaved UI | Either wire to backend settings/profile APIs or remove from production navigation until implemented. |

## 3. Fake Data And Static Business Data Audit

| File | Finding | Classification | Required fix |
| --- | --- | --- | --- |
| `frontend/src/mock/approvals.js` | Contains hard-coded invoice approval records such as `INV-1001`, vendor names, amounts, priorities, and dates. | Fake business data | Delete or move under test fixtures. Production approvals must come from `/api/v1/approvals`. |
| `frontend/src/mock/vendors.js` | Contains hard-coded vendor records, GST values, cities, statuses. | Fake business data | Delete or move under test fixtures. Production vendors must come from `/api/v1/vendors` or `/api/v1/reports/vendors`. |
| `frontend/src/services/vendorStorage.js` | Implements a localStorage vendor database with `saveVendor`, `deleteVendor`, and `updateVendor`. | Browser-only fake persistence | Remove from production source; ensure all imports use `vendorService.js`. |
| `frontend/src/pages/Auth/Login.jsx` | Shows demo credentials (`demo@company.com`, `demo123`). | Demo UI | Remove or guard behind development-only flag. |
| `frontend/src/components/dashboard/AnalyticsChart.jsx` | Uses a static monthly PO dataset. | Static analytics | Replace with backend dashboard/report chart endpoint. |
| `frontend/src/components/dashboard/roleDashboards/DashboardOverview.jsx` | Contains explicit dummy fallback chart logic, dummy status split, fake activity timeline, fake pending task rows. | Fake dashboard data | Backend must return chart datasets and empty states; frontend must render empty state instead of invented values. |
| `frontend/src/components/dashboard/roleDashboards/DashboardOverview.jsx` | KPI values currently ignore backend variables in places, e.g. hard-coded vendor/PO/invoice/payment counts and pending approvals. | Hard-coded business metrics | Use `summary` and `pendingActions` returned by backend only. |
| `frontend/src/pages/Invoices/InvoiceCreate.jsx` | Generates invoice number with `Math.random()`. | Client-generated business identifier | Backend must generate/validate unique invoice numbers. Frontend should leave blank or show server-generated result. |
| `frontend/src/pages/PurchaseOrders/PurchaseOrderCreate.jsx` | Generates PO number with `Math.random()`. | Client-generated business identifier | Backend must generate/validate unique PO numbers. Frontend should not invent production numbers. |
| `frontend/src/pages/Invoices/InvoiceList.jsx` | Stats include hard-coded text such as monthly count, pending amount, and overdue invoice count. | Static business metrics | Replace with `/api/v1/reports/invoices/summary` or dedicated invoice summary endpoint. |
| `frontend/src/pages/Invoices/InvoiceList.jsx` | Export prints data to console and shows an alert. | Non-production export | Use backend export endpoint or real client download from API blob. |
| `frontend/src/pages/PurchaseOrders/PurchaseOrderList.jsx` | Computes total value, average, filters, and CSV export from currently loaded frontend array. | Frontend-only aggregation/export | Move summary/export to `/api/v1/reports/purchase-orders`. |
| `frontend/src/pages/Vendors/VendorList.jsx` | Computes vendor counts/categories locally and has duplicate `All Status` option. | Frontend-only aggregation / UI defect | Use backend summary for counts; sanitize filter options. |
| `frontend/src/pages/Reports/Reports.jsx` | Loads all vendors/POs/invoices/payments then computes totals/export in browser. | Frontend-only reporting | Replace with report endpoints and server-generated exports. |
| `frontend/src/pages/Tickets/TicketList.jsx` | Loads all matches and treats unmatched records as support tickets in frontend. | Derived business workflow in browser | Create/use backend discrepancy-ticket endpoint with pagination and permissions. |
| `backend/src/modules/payments/providers/payment-provider.factory.js` | Registers payment providers to a mock processor with random success and references. | Simulated integration | Acceptable only for dev/test. Production must use manual provider or real gateway adapters controlled by config. |
| `backend/src/utils/seedDevUsers.js` and `backend/src/utils/seedAdmin.js` | Seeds development users and logs seeded credentials/process. | Development seed data | Keep only in dev/test path; never seed production automatically. |
| `backend/src/utils/email.js`, `backend/src/modules/auth/*`, `backend/src/app.js`, service files | Several debug `console.log` statements include request bodies, OTPs, SMTP details, payloads. | Production logging/security issue | Replace with structured logger and redact secrets/PII. |

Not fake data but still production concerns:

- UI option arrays such as status lists, role lists, table columns, and date presets are acceptable static UI configuration if they match backend constants.
- Empty-state text and input placeholders are not fake business data.
- Seed users are acceptable only when explicitly development-only.

## 4. Existing Backend Strengths

The backend already has the right foundations for a real-data rebuild:

- Prisma schema models the core VMS workflow end to end.
- Dashboard repository already performs real counts and sums for vendors, POs, invoices, payments, matching, and audit activity.
- Reports module already provides DB-level summaries, paginated lists, details, and exports for vendors, purchase orders, invoices, and payments.
- Approval history is API-backed through `approvalService.js` and no longer needs the old approval mock.
- Permission-key based authorization is in progress and matches the production requirement better than route-only role checks.

## 5. Missing Backend/API Work

These gaps block full compliance with "every frontend value comes from database":

1. Dashboard chart datasets are not returned by the backend.
   - Add monthly vendor growth, PO value/count by month, invoice status distribution, payment status distribution, and recent activity DTOs.

2. List-page summary cards do not consistently have backend summary endpoints.
   - Reuse reports summaries or add lightweight `/summary` routes for vendors, POs, invoices, payments, tickets.

3. Business identifiers are still generated in the browser.
   - Add server-side `po_number`, `invoice_number`, `payment_number`, `grn_number` generation with collision-safe DB constraints.

4. Browser exports remain in legacy pages.
   - Use `/api/v1/reports/*/export` endpoints and blob download.

5. Settings is not persisted.
   - Either implement `OrganizationSetting`/`UserPreference` models and APIs or remove the page from production navigation.

6. Tickets are not a first-class backend resource.
   - Add a discrepancy/ticket API backed by `ThreeWayMatch` or add a `Ticket` model if lifecycle states differ from matching states.

7. Mock payment provider is not production-ready.
   - Gate it behind `NODE_ENV !== 'production'` and explicit `PAYMENT_PROVIDER=MOCK`, or implement real adapters.

8. Logging leaks too much data.
   - Remove OTP, SMTP, headers, full request bodies, and payload debug logs from production.

## 6. File-By-File Implementation Plan

### Phase 1: Remove Mock Sources And Client-Generated Identifiers

1. `frontend/src/mock/approvals.js`
   - Delete or move to `frontend/src/test-fixtures/approvals.js`.
   - Confirm no production imports.

2. `frontend/src/mock/vendors.js`
   - Delete or move to test fixtures.
   - Confirm no production imports.

3. `frontend/src/services/vendorStorage.js`
   - Delete after confirming all code imports `vendorService.js`.

4. `frontend/src/pages/Auth/Login.jsx`
   - Remove demo credentials from production UI or show only when `import.meta.env.DEV`.

5. `frontend/src/pages/Invoices/InvoiceCreate.jsx`
   - Remove `Math.random()` invoice number creation.
   - Submit invoice data without client-generated ID.
   - Render server-returned `invoiceNumber`.

6. `frontend/src/pages/PurchaseOrders/PurchaseOrderCreate.jsx`
   - Remove `Math.random()` PO number creation.
   - Let backend generate `po_number`.

7. `backend/src/modules/invoices/invoice.service.js`
   - Generate invoice numbers server-side before create.
   - Use DB uniqueness and retry on collision.

8. `backend/src/modules/purchase-orders/po.service.js`
   - Generate PO numbers server-side before create.
   - Normalize status constants.

### Phase 2: Make Dashboard Fully Database-Driven

1. `backend/src/modules/dashboard/dashboard.repository.js`
   - Add DB aggregate functions for monthly trends and distributions.
   - Add role-scoped recent activity and pending queue data.

2. `backend/src/modules/dashboard/dashboard.service.js`
   - Shape a stable dashboard DTO:
     - `summary`
     - `pendingActions`
     - `charts.vendorGrowth`
     - `charts.purchaseOrdersByMonth`
     - `charts.invoiceStatusDistribution`
     - `charts.paymentStatusDistribution`
     - `recentActivity`

3. `backend/src/modules/dashboard/dashboard.routes.js`
   - Keep permission-key authorization.
   - Add validation for date range/period if charts support filters.

4. `frontend/src/components/dashboard/roleDashboards/DashboardOverview.jsx`
   - Remove all dummy fallback builders.
   - Use backend `charts` data only.
   - Render empty states when arrays are empty.
   - Remove hard-coded KPI values and fake task/activity fallback rows.

5. `frontend/src/components/dashboard/AnalyticsChart.jsx`
   - Replace static dataset with props from real dashboard data or remove if unused.

### Phase 3: Make List Pages Use Backend Summaries And Exports

1. `frontend/src/pages/Vendors/VendorList.jsx`
   - Load table rows from `getVendors`.
   - Load counts from `/api/v1/reports/vendors/summary` or a vendor summary endpoint.
   - Move filters/search to backend params for large datasets.
   - Remove console logging and duplicate status option.

2. `frontend/src/pages/PurchaseOrders/PurchaseOrderList.jsx`
   - Load summary from `getPOReportSummary`.
   - Replace frontend CSV builder with `exportPOReport`.
   - Use backend pagination/filter params.
   - Remove console logging.

3. `frontend/src/pages/Invoices/InvoiceList.jsx`
   - Load summary from `getInvoiceReportSummary`.
   - Remove hard-coded monthly/pending/overdue text.
   - Replace console export with `exportInvoiceReport`.
   - Move role/status/payment filters into API params when possible.

4. `frontend/src/pages/Payments/PaymentsList.jsx`
   - Replace download console action with real receipt/export behavior.
   - Load payment summary from `getPaymentReportSummary` if cards are present.

5. `frontend/src/pages/Reports/Reports.jsx`
   - Replace direct full-list loading with the existing `reportService.js`.
   - Use backend summary endpoints for cards.
   - Use backend export endpoints for files.
   - Keep the SuperAdmin report pages as the preferred pattern.

6. `frontend/src/services/reportService.js`
   - Keep current API-backed functions.
   - Add helpers for legacy report page migration if needed.

### Phase 4: Backend Reporting And Tickets Completion

1. `backend/src/modules/reports/report.service.js`
   - Keep Prisma aggregations.
   - Add missing status normalization and role scoping if required by permissions.

2. `backend/src/modules/reports/report.export.service.js`
   - Confirm all exports use DB queries and audit export actions.
   - Apply export limits consistently.

3. `backend/src/modules/reports/report.validation.js`
   - Validate all filter/sort fields against allowlists.

4. `backend/src/modules/three-way-matching/*`
   - Add endpoint for unresolved discrepancy tickets or support queue.
   - Return paginated rows instead of forcing the frontend to load all matches.

5. `frontend/src/pages/Tickets/TicketList.jsx`
   - Replace `getMatches()` + frontend filter with the new tickets/discrepancy endpoint.

### Phase 5: Production Hardening

1. `backend/src/modules/payments/providers/payment-provider.factory.js`
   - Disable mock random providers in production unless explicitly configured.
   - Add real/manual provider adapters with deterministic statuses.

2. `backend/src/utils/email.js`
   - Remove SMTP and OTP debug logs.
   - Use structured logging and redaction.

3. `backend/src/modules/auth/auth.controller.js`
   - Remove login/body/token debug logs.

4. `backend/src/modules/auth/auth.service.js`
   - Stop logging OTPs.
   - Ensure OTPs are stored hashed if security requirement allows.

5. `backend/src/middleware/validate.middleware.js`
   - Remove full request body/header/user logging in production.

6. `backend/src/app.js`
   - Keep request logging through `morgan`/structured logger only.

7. `backend/src/utils/seedDevUsers.js`
   - Ensure seeding is dev/test only and never runs in production.

8. `frontend/src/services/vendorService.js` and `frontend/src/services/purchaseOrderServices.js`
   - Remove console logs.

9. `frontend/src/pages/*`
   - Remove debug console logs that print business data.

### Phase 6: Settings Decision

1. `frontend/src/pages/Settings/Settings.jsx`
   - If settings are required, add backend models and APIs for organization profile, notification preferences, and appearance settings.
   - If settings are not required for MVP, remove the route/nav item until implemented.

2. `backend/prisma/schema.prisma`
   - Add `OrganizationSetting` and/or `UserPreference` only if persisted settings are in scope.

3. `backend/src/modules/settings/*`
   - Create routes/controller/service/validation if settings stay in production navigation.

## 7. Verification Checklist

After implementation, run:

- Backend tests: `npm.cmd test` in `backend`
- Frontend build: `npm.cmd run build` in `frontend`
- Frontend lint: `npm.cmd run lint` in `frontend`
- Search audit:
  - `rg -n -i "mock|fake|dummy|demo|sample|Math\\.random|localStorage|console\\.log" frontend\\src backend\\src`
  - Review any remaining matches as either valid UI placeholders/dev-only fixtures or remove them.
- Manual UI verification:
  - Login as each role.
  - Dashboard shows DB-derived cards/charts or empty states.
  - Vendor, PO, invoice, payment, approval, reports, tickets pages work with database records.
  - Exports download files from backend endpoints.
  - Creating PO/invoice returns server-generated numbers.

## 8. Implementation Order Recommendation

Do the rebuild in this order:

1. Remove/quarantine mock/localStorage/demo sources.
2. Move PO/invoice number generation to backend.
3. Complete dashboard backend chart DTOs and remove dummy dashboard fallbacks.
4. Migrate legacy list/report pages to backend summaries and exports.
5. Add ticket/discrepancy backend endpoint.
6. Harden production logging, payment provider behavior, and dev seeding.
7. Decide and implement or remove settings persistence.

This order removes fake data first, then closes correctness gaps, then hardens production behavior.
