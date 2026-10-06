import { Suspense, lazy } from "react";
import { Navigate, Route, Routes } from "react-router-dom";

import DashboardLayout from "../layouts/DashboardLayout";

import ProtectedRoute from "../components/auth/ProtectedRoute";
import { AUTH_STATUS, useAuth } from "../context/AuthContext";
import { getDashboardPathForRole } from "../config/roleDashboard";
import LoadingSpinner from "../components/common/LoadingSpinner";

const lazyWithRetry = (componentImport) =>
  lazy(async () => {
    const storageKey = "vms_route_chunk_reload";
    try {
      const component = await componentImport();
      sessionStorage.removeItem(storageKey);
      return component;
    } catch (error) {
      console.warn("[ROUTER] Dynamic import error detected:", error);
      const hasReloaded = sessionStorage.getItem(storageKey);
      if (!hasReloaded) {
        sessionStorage.setItem(storageKey, "true");
        window.location.reload();
      }
      throw error;
    }
  });

const Dashboard = lazyWithRetry(() => import("../pages/Dashboard/Dashboard"));
const NotFound = lazyWithRetry(() => import("../pages/NotFound/NotFound"));
const Forbidden = lazyWithRetry(() => import("../pages/Forbidden/Forbidden"));

const VendorList = lazyWithRetry(() => import("../pages/Vendors/VendorList"));
const AddVendor = lazyWithRetry(() => import("../pages/Vendors/AddVendor"));
const FinanceHeadVendorReview = lazyWithRetry(() => import("../pages/Vendors/FinanceHeadVendorReview"));

const PurchaseOrderList = lazyWithRetry(() => import("../pages/PurchaseOrders/PurchaseOrderList"));
const PurchaseOrderCreate = lazyWithRetry(() => import("../pages/PurchaseOrders/PurchaseOrderCreate"));
const PurchaseOrderDetails = lazyWithRetry(() => import("../pages/PurchaseOrders/PurchaseOrderDetails"));

const InvoiceList = lazyWithRetry(() => import("../pages/Invoices/InvoiceList"));
const InvoiceDetails = lazyWithRetry(() => import("../pages/Invoices/InvoiceDetails"));
const InvoiceCreate = lazyWithRetry(() => import("../pages/Invoices/InvoiceCreate"));
const InvoiceCreateEntry = lazyWithRetry(() => import("../pages/Invoices/InvoiceCreateEntry"));

const ApprovalsList = lazyWithRetry(() => import("../pages/Approvals/ApprovalsList"));
const PaymentApprovalDetails = lazyWithRetry(() => import("../pages/Approvals/PaymentApprovalDetails"));

const PaymentsList = lazyWithRetry(() => import("../pages/Payments/PaymentsList"));
const PaymentCreate = lazyWithRetry(() => import("../pages/Payments/PaymentCreate"));

const MatchingList = lazyWithRetry(() => import("../pages/ThreeWayMatching/MatchingList"));
const MatchingDetail = lazyWithRetry(() => import("../pages/ThreeWayMatching/MatchingDetail"));
const ReceiptDocuments = lazyWithRetry(() => import("../pages/ReceiptDocuments/ReceiptDocuments"));

const NotificationsList = lazyWithRetry(() => import("../pages/Notifications/NotificationsList"));

const UsersList = lazyWithRetry(() => import("../pages/Users/UsersList"));
const UserCreate = lazyWithRetry(() => import("../pages/Users/UserCreate"));

const Reports = lazyWithRetry(() => import("../pages/Reports/Reports"));

const SuperAdminReportsHome = lazyWithRetry(() => import("../pages/SuperAdminReports/SuperAdminReportsHome"));
const VendorReport = lazyWithRetry(() => import("../pages/SuperAdminReports/VendorReport"));
const POReport = lazyWithRetry(() => import("../pages/SuperAdminReports/POReport"));
const InvoiceReport = lazyWithRetry(() => import("../pages/SuperAdminReports/InvoiceReport"));
const PaymentReport = lazyWithRetry(() => import("../pages/SuperAdminReports/PaymentReport"));
const AuditLogsList = lazyWithRetry(() => import("../pages/SuperAdminReports/AuditLogsList"));

const Login = lazyWithRetry(() => import("../pages/Auth/Login"));
const ForgotPassword = lazyWithRetry(() => import("../pages/Auth/ForgotPassword"));
const ResetPassword = lazyWithRetry(() => import("../pages/Auth/ResetPassword"));
const ActivateAccount = lazyWithRetry(() => import("../pages/Auth/ActivateAccount"));
const ChangeTemporaryPassword = lazyWithRetry(() => import("../pages/Auth/ChangeTemporaryPassword"));

const RouteLoader = ({ text = "Loading page..." }) => (
  <div className="flex h-96 items-center justify-center">
    <LoadingSpinner size="lg" text={text} />
  </div>
);

const renderLazyRoute = (Component, text) => (
  <Suspense fallback={<RouteLoader text={text} />}>
    <Component />
  </Suspense>
);

const RootRedirect = () => {
  const { user, status, isAuthenticated, bootstrapping } = useAuth();

  if (status === AUTH_STATUS.INITIALIZING || bootstrapping) {
    return (
      <div className="flex h-screen items-center justify-center">
        <LoadingSpinner size="lg" text="Checking session..." />
      </div>
    );
  }

  return <Navigate to={isAuthenticated && user ? getDashboardPathForRole(user.role) : "/login"} replace />;
};

/* OCR temporarily disabled
const LegacyOcrReviewRedirect = () => {
  const { draftId } = useParams();
  return <Navigate to={`/invoices/create/ocr/${draftId}`} replace />;
};
*/

const AppRoutes = () => {
  return (
    <Routes>
      {/* Auth Routes */}
      <Route path="/login" element={renderLazyRoute(Login, "Loading login...")} />
      <Route path="/api/health" element={JSON.stringify(
        {
          status:"ok",
          message:"Service is Running",
          time:new Date(),
          
        }
      )} />
      <Route path="/forgot-password" element={renderLazyRoute(ForgotPassword, "Loading password reset...")} />
      <Route path="/reset-password" element={renderLazyRoute(ResetPassword, "Loading password reset...")} />
      <Route path="/activate-account" element={renderLazyRoute(ActivateAccount, "Loading activation...")} />
      <Route path="/change-temporary-password" element={renderLazyRoute(ChangeTemporaryPassword, "Loading password update...")} />


      {/* Root Redirect */}
      <Route path="/" element={<RootRedirect />} />

      {/* Dashboard Layout Routes */}
      <Route
        element={
          <ProtectedRoute>
            <DashboardLayout />
          </ProtectedRoute>
        }
      >
        <Route path="/dashboard" element={renderLazyRoute(Dashboard, "Loading dashboard...")} />

        {/* Vendors */}
        <Route path="/vendors" element={renderLazyRoute(VendorList, "Loading vendors...")} />
        <Route path="/vendors/new" element={renderLazyRoute(AddVendor, "Loading vendor form...")} />
        <Route path="/vendors/:id/edit" element={renderLazyRoute(AddVendor, "Loading vendor form...")} />
        <Route path="/finance-head/vendors" element={renderLazyRoute(VendorList, "Loading vendors...")} />
        <Route path="/finance-head/vendor-reviews" element={<Navigate to="/finance-head/vendors" replace />} />
        <Route path="/finance-head/vendors/:vendorId/review" element={renderLazyRoute(FinanceHeadVendorReview, "Loading vendor review...")} />

        {/* Purchase Orders */}
        <Route path="/purchase-orders" element={renderLazyRoute(PurchaseOrderList, "Loading purchase orders...")} />
        <Route path="/purchase-orders/new" element={renderLazyRoute(PurchaseOrderCreate, "Loading purchase order form...")} />
        <Route path="/purchase-orders/create" element={renderLazyRoute(PurchaseOrderCreate, "Loading purchase order form...")} />
        <Route path="/purchase-orders/:id" element={renderLazyRoute(PurchaseOrderDetails, "Loading purchase order...")} />
        <Route path="/purchase-orders/:id/edit" element={renderLazyRoute(PurchaseOrderCreate, "Loading purchase order form...")} />

        {/* Invoices */}
        <Route path="/invoices" element={renderLazyRoute(InvoiceList, "Loading invoices...")} />
        <Route path="/invoices/new" element={renderLazyRoute(InvoiceCreateEntry, "Loading invoice options...")} />
        <Route path="/invoices/create" element={renderLazyRoute(InvoiceCreate, "Loading invoice form...")} />
        {/* OCR routes temporarily disabled; redirecting to manual invoice creation */}
        <Route path="/invoices/create/ocr" element={<Navigate to="/invoices/create" replace />} />
        <Route path="/invoices/create/ocr/:draftId" element={<Navigate to="/invoices/create" replace />} />
        <Route path="/invoices/ocr/review/:draftId" element={<Navigate to="/invoices/create" replace />} />
        <Route path="/invoices/ocr" element={<Navigate to="/invoices/create" replace />} />
        <Route path="/invoices/:id" element={renderLazyRoute(InvoiceDetails, "Loading invoice...")} />
        <Route path="/invoices/:id/edit" element={renderLazyRoute(InvoiceCreate, "Loading invoice form...")} />
        <Route path="/invoices/:id/preview" element={renderLazyRoute(InvoiceDetails, "Loading invoice...")} />
        <Route path="/finance-head/invoice-approvals" element={<Navigate to="/403" replace />} />

        {/* Three-Way Matching */}
        <Route path="/three-way-matching" element={renderLazyRoute(MatchingList, "Loading matching queue...")} />
        <Route path="/three-way-matching/:id" element={renderLazyRoute(MatchingDetail, "Loading matching detail...")} />
        <Route path="/receipt-documents" element={renderLazyRoute(ReceiptDocuments, "Loading receipt documents...")} />

        {/* Notifications */}
        <Route path="/notifications" element={renderLazyRoute(NotificationsList, "Loading notifications...")} />

        {/* Approvals */}
        <Route path="/approvals" element={renderLazyRoute(ApprovalsList, "Loading approvals...")} />
        <Route path="/payment-approvals" element={renderLazyRoute(ApprovalsList, "Loading approvals...")} />
        <Route path="/payment-approvals/:id" element={renderLazyRoute(PaymentApprovalDetails, "Loading payment approval...")} />

        {/* Payments */}
        <Route path="/payments" element={renderLazyRoute(PaymentsList, "Loading payments...")} />
        <Route path="/payment-history" element={renderLazyRoute(PaymentsList, "Loading payments...")} />
        <Route path="/payments/new" element={renderLazyRoute(PaymentCreate, "Loading payment store...")} />

        {/* Users */}
        <Route path="/users" element={renderLazyRoute(UsersList, "Loading users...")} />
        <Route path="/users/new" element={renderLazyRoute(UserCreate, "Loading user form...")} />

        {/* Reports */}
        <Route path="/reports" element={renderLazyRoute(Reports, "Loading reports...")} />

        {/* ── Super Admin Reports ──────────────────────────────────────── */}
        <Route path="/super-admin/reports" element={renderLazyRoute(SuperAdminReportsHome, "Loading reports...")} />
        <Route path="/super-admin/reports/vendors" element={renderLazyRoute(VendorReport, "Loading vendor report...")} />
        <Route path="/super-admin/reports/purchase-orders" element={renderLazyRoute(POReport, "Loading purchase order report...")} />
        <Route path="/super-admin/reports/invoices" element={renderLazyRoute(InvoiceReport, "Loading invoice report...")} />
        <Route path="/super-admin/reports/payments" element={renderLazyRoute(PaymentReport, "Loading payment report...")} />
        <Route path="/audit-logs" element={renderLazyRoute(AuditLogsList, "Loading audit logs...")} />
        <Route path="/finance-head/audit-logs" element={renderLazyRoute(AuditLogsList, "Loading audit logs...")} />
        <Route path="/super-admin/audit-logs" element={renderLazyRoute(AuditLogsList, "Loading audit logs...")} />
      </Route>

      {/* 403 */}
      <Route path="/403" element={renderLazyRoute(Forbidden, "Loading page...")} />

      {/* 404 */}
      <Route path="*" element={renderLazyRoute(NotFound, "Loading page...")} />
    </Routes>
  );
};

export default AppRoutes;
