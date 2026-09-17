import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { canTransitionVendorReviewStatus, canTransitionVendorStatus } from '../src/modules/vendors/vendor.service.js';
import { VENDOR_STATUS } from '../src/modules/vendors/vendor.constants.js';

const testDir = path.dirname(fileURLToPath(import.meta.url));
const backendRoot = path.resolve(testDir, '..');
const repoRoot = path.resolve(backendRoot, '..');

const backendSource = (...segments) =>
  fs.readFileSync(path.resolve(backendRoot, 'src', ...segments), 'utf8');

const frontendSource = (...segments) =>
  fs.readFileSync(path.resolve(repoRoot, 'frontend', 'src', ...segments), 'utf8');

test('vendor review status transitions are centralized and reject duplicates', () => {
  assert.equal(canTransitionVendorStatus(VENDOR_STATUS.PENDING, VENDOR_STATUS.APPROVED), true);
  assert.equal(canTransitionVendorReviewStatus(VENDOR_STATUS.PENDING, VENDOR_STATUS.APPROVED), true);
  assert.equal(canTransitionVendorReviewStatus(VENDOR_STATUS.PENDING, VENDOR_STATUS.REJECTED), true);
  assert.equal(canTransitionVendorReviewStatus(VENDOR_STATUS.PENDING, VENDOR_STATUS.BLOCKED), true);
  assert.equal(canTransitionVendorReviewStatus(VENDOR_STATUS.APPROVED, VENDOR_STATUS.BLOCKED), true);
  assert.equal(canTransitionVendorReviewStatus(VENDOR_STATUS.REJECTED, VENDOR_STATUS.PENDING), true);
  assert.equal(canTransitionVendorReviewStatus(VENDOR_STATUS.APPROVED, VENDOR_STATUS.APPROVED), false);
  assert.equal(canTransitionVendorReviewStatus(VENDOR_STATUS.BLOCKED, VENDOR_STATUS.APPROVED), false);
});

test('vendor approval validates real required database fields before approval', () => {
  const service = backendSource('modules', 'vendors', 'vendor.service.js');
  const constants = backendSource('modules', 'vendors', 'vendor.constants.js');

  assert.match(constants, /VENDOR_REQUIRED_APPROVAL_FIELDS/);
  assert.match(service, /getVendorApprovalReadiness/);
  assert.match(service, /requireVendorApprovalReadiness/);
  assert.match(service, /requireVendorApprovalReadiness\(vendor\)/);
  assert.match(service, /bank_account_no/);
  assert.match(service, /ifsc_code/);
  assert.match(service, /payment_terms/);
  assert.match(constants, /GST_CERTIFICATE/);
  assert.match(constants, /PAN_CARD/);
  assert.match(constants, /VENDOR_AGREEMENT/);
  assert.match(service, /documents:\s*\{\s*supported:\s*true/);
  assert.match(service, /bankVerification/);
  assert.match(service, /Vendor cannot be approved until required information is complete/);
});

test('vendor review APIs support history, hold, block, return, audit, and notifications', () => {
  const routes = backendSource('modules', 'vendors', 'vendor.routes.js');
  const controller = backendSource('modules', 'vendors', 'vendor.controller.js');
  const service = backendSource('modules', 'vendors', 'vendor.service.js');
  const validation = backendSource('modules', 'vendors', 'vendor.validation.js');
  const notifications = backendSource('modules', 'notifications', 'notification.service.js');

  assert.match(routes, /\/:id\/history/);
  assert.match(routes, /\/:id\/hold/);
  assert.match(routes, /\/:id\/block/);
  assert.match(routes, /\/:id\/pending/);
  assert.match(routes, /authorize\(VENDOR_PERMISSIONS\.REVIEW\)/);
  assert.match(controller, /getVendorHistory/);
  assert.match(controller, /holdVendor/);
  assert.match(controller, /returnVendorToPending/);
  assert.match(controller, /blockVendor/);
  assert.match(service, /canTransitionVendorStatus/);
  assert.match(service, /tx\.auditLog\.create/);
  assert.match(service, /tx\.approvalLog\.create/);
  assert.match(service, /getVendorReviewHistory/);
  assert.match(service, /Rejection reason is required/);
  assert.match(service, /Hold reason is required/);
  assert.match(service, /Corrective action is required before placing a vendor on hold/);
  assert.match(service, /Block reason is required/);
  assert.match(service, /blockCategory/);
  assert.match(validation, /blockCategory/);
  assert.match(notifications, /Vendor Pending Review/);
  assert.match(notifications, /Vendor On Hold/);
});

test('Finance Head vendor review frontend uses real APIs and safe UI states', () => {
  const vendorList = frontendSource('pages', 'Vendors', 'VendorList.jsx');
  const detail = frontendSource('pages', 'Vendors', 'FinanceHeadVendorReview.jsx');
  const service = frontendSource('services', 'vendorService.js');
  const routes = frontendSource('routes', 'AppRoutes.jsx');
  const navigation = frontendSource('constants', 'navigation.js');
  const permissions = frontendSource('config', 'permissions.js');

  assert.match(service, /\/v1\/vendors\/\$\{id\}\/history/);
  assert.match(service, /holdVendor/);
  assert.match(detail, /VendorDocumentsPanel/);
  assert.match(detail, /maskedBankAccountNo/);
  assert.match(detail, /getVendorReviewHistory/);
  assert.match(vendorList, /ConfirmationModal/);
  assert.match(vendorList, /notify\.success/);
  assert.match(vendorList, /hasPermission\(user, PERMISSIONS\.REVIEW_VENDORS\)/);
  assert.match(vendorList, /correctiveAction/);
  assert.match(vendorList, /followUpDate/);
  assert.match(vendorList, /blockCategory/);
  assert.match(vendorList, /canShowApproveAction/);
  assert.match(vendorList, /approvalReadiness\?\.ready/);
  assert.match(detail, /canApproveVendor/);
  assert.match(detail, /readiness\.ready/);
  assert.match(vendorList, /Reason \*/);
  assert.match(vendorList, /Corrective action \*/);
  assert.match(vendorList, /await loadVendors\(\)/);
  assert.match(vendorList, /emitNotificationsChanged\(\)/);
  assert.match(detail, /await loadVendor\(\)/);
  assert.match(detail, /hasPermission\(user, PERMISSIONS\.REVIEW_VENDORS\)/);
  assert.match(detail, /getVendorReviewHistory/);
  assert.match(detail, /Review History/);
  assert.match(detail, /emitNotificationsChanged\(\)/);
  assert.match(detail, /Bank Verification/);
  assert.match(detail, /Documents:/);
  assert.match(routes, /\/finance-head\/vendors/);
  assert.match(routes, /\/finance-head\/vendor-reviews" element=\{<Navigate to="\/finance-head\/vendors" replace \/>/);
  assert.match(routes, /\/finance-head\/vendors\/:vendorId\/review/);
  assert.match(navigation, /title: "Vendors"/);
  assert.match(navigation, /pathByRole/);
  assert.match(navigation, /\/finance-head\/vendors/);
  assert.doesNotMatch(navigation, /Vendor Reviews/);
  assert.match(permissions, /"\/finance-head\/vendors": PERMISSIONS\.REVIEW_VENDORS/);
  assert.doesNotMatch(permissions, /"\/finance-head\/vendor-reviews"/);
  assert.doesNotMatch(`${vendorList}\n${detail}`, /\balert\s*\(|window\.alert|confirm\s*\(|window\.confirm/);
  assert.doesNotMatch(`${vendorList}\n${detail}`, /Orion Manufacturer|VC-1012|mockVendor|fakeVendor|sampleVendor|dummyVendor|staticVendor|fallbackData/);
});

test('vendor action API client sends structured review payloads', () => {
  const service = frontendSource('services', 'vendorService.js');

  assert.match(service, /buildActionPayload/);
  assert.match(service, /\/v1\/vendors\/\$\{id\}\/approve/);
  assert.match(service, /\/v1\/vendors\/\$\{id\}\/reject/);
  assert.match(service, /\/v1\/vendors\/\$\{id\}\/hold/);
  assert.match(service, /\/v1\/vendors\/\$\{id\}\/block/);
  assert.match(service, /\/v1\/vendors\/\$\{id\}\/pending/);
  assert.match(service, /action: "hold"/);
  assert.match(service, /action: "block"/);
  assert.doesNotMatch(service, /mock|fake|Math\.random|setTimeout|Promise\.resolve\(\{[^}]*success/i);
});

test('Finance Head sidebar has one canonical Vendors item and nested review routes stay active', () => {
  const navigation = frontendSource('constants', 'navigation.js');
  const sidebar = frontendSource('components', 'layout', 'Sidebar.jsx');
  const sidebarItem = frontendSource('components', 'layout', 'SidebarItem.jsx');
  const detail = frontendSource('pages', 'Vendors', 'FinanceHeadVendorReview.jsx');

  const vendorTitleMatches = navigation.match(/title: "Vendors"/g) || [];
  assert.equal(vendorTitleMatches.length, 1);
  assert.doesNotMatch(navigation, /Vendor Reviews/);
  assert.match(navigation, /activePaths: \["\/vendors", "\/finance-head\/vendors"\]/);
  assert.match(sidebar, /pathByRole\?\.\[user\?\.role\]/);
  assert.match(sidebarItem, /startsWith\(`\$\{activePath\}\/`\)/);
  assert.match(detail, /to="\/finance-head\/vendors"/);
});

test('Finance Head vendor list uses one text details action without redundant eye icons', () => {
  const vendorList = frontendSource('pages', 'Vendors', 'VendorList.jsx');

  assert.doesNotMatch(vendorList, /\bEye\b/);
  assert.doesNotMatch(vendorList, /<Eye\s/);
  assert.doesNotMatch(vendorList, /EyeIcon/);
  assert.doesNotMatch(vendorList, /leadingIcon|startIcon/);
  assert.doesNotMatch(vendorList, /vendor-row|vendor-card/);
  assert.doesNotMatch(vendorList, /title="View details"/);
  assert.doesNotMatch(vendorList, /<tr[^>]*onClick/);
  assert.doesNotMatch(vendorList, /tabIndex=\{?0\}?/);
  assert.match(vendorList, /<th className="px-5 py-4">Vendor<\/th>/);
  assert.match(vendorList, /<td className="px-5 py-4">\s*<p className="font-semibold text-slate-900">\{vendor\.companyName\}<\/p>\s*<p className="mt-1 text-xs text-slate-500">\{vendor\.vendorCode\}<\/p>\s*<\/td>/);
  assert.match(vendorList, /<td className="px-5 py-4"><StatusBadge status=\{vendor\.status === "blocked" \? "on hold" : vendor\.status\} \/><\/td>/);
  assert.match(vendorList, /to=\{`\/finance-head\/vendors\/\$\{vendor\.id\}\/review`\}/);
  assert.match(vendorList, /aria-label=\{`View details for \$\{vendor\.companyName\}`\}/);
  assert.match(vendorList, />\s*View Details\s*<\/Link>/);
  assert.match(vendorList, />\s*View Details\s*<\/button>/);
  assert.match(vendorList, /focus-visible:outline/);
  assert.match(vendorList, /className="inline-flex h-9 items-center justify-center rounded-lg border border-blue-200 px-3 text-xs font-semibold text-blue-700/);
});

test('vendor detail components do not expose full bank account numbers', () => {
  const detail = frontendSource('pages', 'Vendors', 'VendorDetails.jsx');
  const review = frontendSource('pages', 'Vendors', 'FinanceHeadVendorReview.jsx');

  assert.match(detail, /maskedBankAccountNo/);
  assert.match(review, /maskedBankAccountNo/);
  assert.doesNotMatch(detail, /value=\{vendor\.bankAccountNo\}/);
});
