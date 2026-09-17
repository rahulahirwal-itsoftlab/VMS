import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import {
  PERMISSION_KEYS,
  ROLE_PERMISSIONS,
} from "../src/modules/auth/role-permissions.js";
import { ROLES } from "../src/zodSchema/index.js";
import { canTransitionVendorReviewStatus } from "../src/modules/vendors/vendor.service.js";
import { VENDOR_STATUS } from "../src/modules/vendors/vendor.constants.js";
import { requiresFinanceHeadApproval } from "../src/modules/payments/payment.service.js";
import {
  getRequiredInvoiceApprovalRole,
  INVOICE_APPROVAL_LIMITS,
} from "../src/utils/approval-helper.js";

const backendSource = (...segments) =>
  fs.readFileSync(path.resolve("src", ...segments), "utf8");

const frontendSource = (...segments) =>
  fs.readFileSync(path.resolve("..", "frontend", "src", ...segments), "utf8");

test("Finance Head permissions include three-way matching review and finance capabilities", () => {
  const permissions = ROLE_PERMISSIONS[ROLES.FINANCE_HEAD];

  assert.equal(
    permissions.includes(PERMISSION_KEYS.VIEW_THREE_WAY_MATCHING),
    true,
  );
  assert.equal(
    permissions.includes(PERMISSION_KEYS.REVIEW_THREE_WAY_MATCHING),
    true,
  );
  assert.equal(permissions.includes(PERMISSION_KEYS.VIEW_INVOICES), false);
  assert.equal(permissions.includes(PERMISSION_KEYS.MANAGE_INVOICES), false);
  assert.equal(
    permissions.includes(PERMISSION_KEYS.APPROVE_INVOICE_FINAL),
    false,
  );
  assert.equal(permissions.includes(PERMISSION_KEYS.VIEW_VENDORS), true);
  assert.equal(permissions.includes(PERMISSION_KEYS.REVIEW_VENDORS), true);
  assert.equal(
    permissions.includes(PERMISSION_KEYS.CREATE_PAYMENT_REQUEST),
    true,
  );
});

test("three-way matching routes and navigation are limited to Case Manager, Finance Head, and Super Admin", () => {
  const routes = backendSource(
    "modules",
    "three-way-matching",
    "matching.routes.js",
  );
  const permissions = frontendSource("config", "permissions.js");
  const invoiceDetails = frontendSource(
    "pages",
    "Invoices",
    "InvoiceDetails.jsx",
  );
  const financeHeadMentions = routes.match(/ROLES\.FINANCE_HEAD/g) || [];
  const rolePermissions = backendSource(
    "modules",
    "auth",
    "role-permissions.js",
  );
  const navigation = frontendSource("constants", "navigation.js");
  const teamLeadPermissions =
    rolePermissions.match(/\[ROLES\.TEAM_LEAD\]: \[[\s\S]*?\],/)?.[0] || "";
  const managerPermissions =
    rolePermissions.match(/\[ROLES\.MANAGER\]: \[[\s\S]*?\],/)?.[0] || "";

  assert.ok(financeHeadMentions.length > 0);
  assert.match(routes, /ROLES\.CASE_MANAGER/);
  assert.doesNotMatch(routes, /ROLES\.TEAM_LEAD/);
  assert.doesNotMatch(routes, /ROLES\.MANAGER/);
  assert.match(
    permissions,
    /"\/three-way-matching": PERMISSIONS\.VIEW_THREE_WAY_MATCHING/,
  );
  assert.match(invoiceDetails, /canViewMatching/);
  assert.match(navigation, /title: "Three-Way Matching"/);
  assert.match(navigation, /path: "\/three-way-matching"/);
  assert.match(
    navigation,
    /allowedRoles: \[ROLES\.CASE_MANAGER, ROLES\.FINANCE_HEAD, ROLES\.SUPER_ADMIN\]/,
  );
  assert.doesNotMatch(
    teamLeadPermissions,
    /PERMISSION_KEYS\.VIEW_THREE_WAY_MATCHING/,
  );
  assert.doesNotMatch(
    managerPermissions,
    /PERMISSION_KEYS\.VIEW_THREE_WAY_MATCHING/,
  );
});

test("Finance Head dashboard API and UI use live role-specific analytics without invoice widgets", () => {
  const routes = backendSource("modules", "dashboard", "dashboard.routes.js");
  const service = backendSource("modules", "dashboard", "dashboard.service.js");
  const repository = backendSource(
    "modules",
    "dashboard",
    "dashboard.repository.js",
  );
  const frontend = frontendSource(
    "components",
    "dashboard",
    "roleDashboards",
    "FinanceDashboard.jsx",
  );
  const client = frontendSource("services", "dashboardService.js");

  assert.match(routes, /'\/finance-head'/);
  assert.doesNotMatch(routes, /APPROVE_INVOICE_FINAL/);
  assert.match(routes, /PERMISSION_KEYS\.REVIEW_VENDORS/);
  assert.match(routes, /PERMISSION_KEYS\.EXECUTE_PAYMENT/);
  assert.match(service, /getFinanceHeadDashboard/);
  assert.match(repository, /getFinanceHeadVendorReviewAnalytics/);
  assert.match(repository, /getFinanceHeadPaymentAnalytics/);
  assert.doesNotMatch(
    service,
    /getFinanceHeadInvoiceApprovalAnalytics|getFinanceHeadInvoiceApprovalTrend/,
  );
  assert.match(client, /\/v1\/dashboard\/finance-head/);
  assert.match(frontend, /Vendor Review Status/);
  assert.match(frontend, /High-Value Payment Trend/);
  assert.doesNotMatch(
    frontend,
    /Invoice Approvals|Invoices >= Threshold|Approved Invoices|Rejected Invoices|Invoice Approval Trend/,
  );
  assert.doesNotMatch(frontend, /three[- ]?way|matching/i);
});

test("Finance Head invoice approval threshold includes exactly 100000 INR", () => {
  const threshold = Number(
    process.env.FINANCE_HEAD_INVOICE_APPROVAL_THRESHOLD || 100000,
  );
  assert.equal(INVOICE_APPROVAL_LIMITS.FINANCE_HEAD_MIN, threshold);
  assert.equal(threshold, 100000);
  assert.equal(getRequiredInvoiceApprovalRole(threshold - 1), ROLES.MANAGER);
  assert.equal(getRequiredInvoiceApprovalRole(threshold), ROLES.FINANCE_HEAD);
  assert.equal(
    getRequiredInvoiceApprovalRole(threshold + 1),
    ROLES.FINANCE_HEAD,
  );
});

test("Finance Head invoice routes and APIs are blocked from Finance Head", () => {
  const routes = backendSource("modules", "invoices", "invoice.routes.js");
  const appRoutes = frontendSource("routes", "AppRoutes.jsx");
  const navigation = frontendSource("constants", "navigation.js");
  const permissions = frontendSource("config", "permissions.js");

  assert.match(routes, /\/pending\/finance-head/);
  assert.match(
    routes,
    /const READ_ROLES\s*=\s*\[ROLES\.SUPER_ADMIN, ROLES\.CASE_MANAGER, ROLES\.TEAM_LEAD, ROLES\.MANAGER\]/,
  );
  assert.match(
    routes,
    /const APPROVER_ROLES\s*=\s*\[ROLES\.TEAM_LEAD, ROLES\.MANAGER\]/,
  );
  assert.match(
    routes,
    /router\.get\('\/pending\/finance-head',\s*authorize\(\[ROLES\.SUPER_ADMIN\]\)/,
  );
  assert.match(
    routes,
    /router\.post\('\/:id\/remark',\s*authorize\(\[ROLES\.SUPER_ADMIN\]\)/,
  );
  assert.match(
    routes,
    /router\.post\('\/:id\/restore',\s*authorize\(\[ROLES\.SUPER_ADMIN\]\)/,
  );
  assert.match(
    appRoutes,
    /path="\/finance-head\/invoice-approvals" element=\{<Navigate to="\/403" replace \/>/,
  );
  assert.doesNotMatch(navigation, /Invoice Approvals|invoice-approvals/);
  assert.doesNotMatch(permissions, /"\/finance-head\/invoice-approvals"/);
});

test("Shared invoice functionality remains available for authorized non-Finance Head roles", () => {
  const service = frontendSource("services", "invoiceService.js");
  const routes = frontendSource("routes", "AppRoutes.jsx");
  const backendRoutes = backendSource(
    "modules",
    "invoices",
    "invoice.routes.js",
  );
  const rolePermissions = backendSource(
    "modules",
    "auth",
    "role-permissions.js",
  );

  assert.match(routes, /path="\/invoices" element=\{<InvoiceList \/>/);
  assert.match(routes, /path="\/invoices\/new" element=\{<InvoiceCreate \/>/);
  assert.match(routes, /path="\/invoices\/:id" element=\{<InvoiceDetails \/>/);
  assert.match(service, /\/v1\/invoices\/approved-purchase-orders/);
  assert.match(service, /createInvoice/);
  assert.match(
    backendRoutes,
    /const CREATE_ROLES = \[ROLES\.CASE_MANAGER, ROLES\.SUPER_ADMIN\]/,
  );
  assert.match(backendRoutes, /authorize\(CREATE_ROLES\)/);
  assert.match(
    rolePermissions,
    /\[ROLES\.CASE_MANAGER\]:[\s\S]*PERMISSION_KEYS\.VIEW_INVOICES[\s\S]*PERMISSION_KEYS\.MANAGE_INVOICES[\s\S]*PERMISSION_KEYS\.SUBMIT_INVOICES/,
  );
  assert.match(
    rolePermissions,
    /\[ROLES\.TEAM_LEAD\]:[\s\S]*PERMISSION_KEYS\.VIEW_INVOICES[\s\S]*PERMISSION_KEYS\.APPROVE_INVOICE_L1/,
  );
  assert.match(
    rolePermissions,
    /\[ROLES\.MANAGER\]:[\s\S]*PERMISSION_KEYS\.VIEW_INVOICES[\s\S]*PERMISSION_KEYS\.APPROVE_INVOICE_L2/,
  );
});

test("Finance Head audit logs are scoped and sanitized", () => {
  const service = backendSource("modules", "audit-logs", "audit.service.js");
  const controller = backendSource(
    "modules",
    "audit-logs",
    "audit.controller.js",
  );
  const routes = frontendSource("routes", "AppRoutes.jsx");
  const navigation = frontendSource("constants", "navigation.js");

  assert.match(service, /buildFinanceHeadAuditScope/);
  assert.match(service, /SAFE_VALUE_BLOCKLIST/);
  assert.match(service, /bank_account_no/);
  assert.match(service, /auditRepository\.findFirst/);
  assert.match(controller, /getAuditLogs\(req\.query, req\.user\)/);
  assert.match(controller, /getAuditLogById\(req\.params\.id, req\.user\)/);
  assert.match(routes, /\/finance-head\/audit-logs/);
  assert.match(navigation, /path: "\/audit-logs"/);
  assert.match(
    frontendSource("config", "permissions.js"),
    /"\/finance-head\/audit-logs":\s+PERMISSIONS\.VIEW_AUDIT_LOGS/,
  );
  assert.match(
    frontendSource("config", "permissions.js"),
    /"\/audit-logs":\s+PERMISSIONS\.VIEW_AUDIT_LOGS/,
  );
});

test("Finance Head vendor review supports approved, rejected, on-hold, and pending transitions", () => {
  assert.equal(
    canTransitionVendorReviewStatus(
      VENDOR_STATUS.PENDING,
      VENDOR_STATUS.APPROVED,
    ),
    true,
  );
  assert.equal(
    canTransitionVendorReviewStatus(
      VENDOR_STATUS.PENDING,
      VENDOR_STATUS.REJECTED,
    ),
    true,
  );
  assert.equal(
    canTransitionVendorReviewStatus(
      VENDOR_STATUS.PENDING,
      VENDOR_STATUS.BLOCKED,
    ),
    true,
  );
  assert.equal(
    canTransitionVendorReviewStatus(
      VENDOR_STATUS.BLOCKED,
      VENDOR_STATUS.PENDING,
    ),
    true,
  );
  assert.equal(
    canTransitionVendorReviewStatus(
      VENDOR_STATUS.REJECTED,
      VENDOR_STATUS.PENDING,
    ),
    true,
  );
  assert.equal(
    canTransitionVendorReviewStatus(
      VENDOR_STATUS.APPROVED,
      VENDOR_STATUS.PENDING,
    ),
    false,
  );
});

test("vendor review frontend uses modal/toast flow and does not use browser alerts", () => {
  const vendorList = frontendSource("pages", "Vendors", "VendorList.jsx");
  const vendorService = frontendSource("services", "vendorService.js");

  assert.match(vendorList, /ConfirmationModal/);
  assert.match(vendorList, /notify\.success/);
  assert.match(vendorList, /notify\.error/);
  assert.match(vendorList, /returnVendorToPending/);
  assert.match(vendorService, /\/v1\/vendors\/\$\{id\}\/pending/);
  assert.doesNotMatch(
    vendorList,
    /\balert\s*\(|window\.alert|confirm\s*\(|window\.confirm/,
  );
});

test("Finance Head payment approval is threshold based", () => {
  assert.equal(requiresFinanceHeadApproval(100000, "INR"), true);
  assert.equal(requiresFinanceHeadApproval(99999, "INR"), false);
  assert.equal(requiresFinanceHeadApproval(100000, "USD"), false);

  const service = backendSource("modules", "payments", "payment.service.js");
  assert.match(service, /FINANCE_HEAD_PAYMENT_APPROVAL_THRESHOLD/);
  assert.match(service, /ROLES\.FINANCE_HEAD/);
  assert.doesNotMatch(service, /ROLES\.FINANCE_MANAGER/);
});
