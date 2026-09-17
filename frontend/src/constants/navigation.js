import {
  LayoutDashboard,
  ShoppingCart,
  Receipt,
  GitCompare,
  ClipboardCheck,
  Wallet,
  Users,
  Bell,
  FileBarChart2,
  History,
} from "lucide-react";

import LogoIcon from "../components/common/LogoIcon";

import { PERMISSIONS } from "../config/permissions";
import { ROLES } from "../config/permissions";

export const navigation = [
  {
    section: "MAIN",
    items: [
      {
        title: "Dashboard",
        icon: LayoutDashboard,
        path: "/dashboard",
        permission: PERMISSIONS.VIEW_DASHBOARD,
      },
    ],
  },

  {
    section: "PROCUREMENT",
    items: [
      {
        title: "Vendors",
        icon: LogoIcon,
        path: "/vendors",
        pathByRole: {
          [ROLES.FINANCE_HEAD]: "/finance-head/vendors",
        },
        activePaths: ["/vendors", "/finance-head/vendors"],
        permission: PERMISSIONS.VIEW_VENDORS,
        allowedRoles: [ROLES.CASE_MANAGER, ROLES.SUPER_ADMIN, ROLES.FINANCE_HEAD],
      },

      {
        title: "Purchase Orders",
        icon: ShoppingCart,
        path: "/purchase-orders",
        permission: PERMISSIONS.VIEW_PURCHASE_ORDERS,
        allowedRoles: [ROLES.CASE_MANAGER],
      },

      {
        title: "Receipt Documents",
        icon: ClipboardCheck,
        path: "/receipt-documents",
        permission: PERMISSIONS.VIEW_THREE_WAY_MATCHING,
        allowedRoles: [ROLES.CASE_MANAGER],
      },

      {
        title: "Invoices",
        icon: Receipt,
        path: "/invoices",
        permission: PERMISSIONS.VIEW_INVOICES,
        excludedRoles: [ROLES.FINANCE_HEAD, ROLES.TEAM_LEAD, ROLES.MANAGER],
      },

      {
        title: "Three-Way Matching",
        icon: GitCompare,
        path: "/three-way-matching",
        permission: PERMISSIONS.VIEW_THREE_WAY_MATCHING,
        allowedRoles: [ROLES.CASE_MANAGER, ROLES.FINANCE_HEAD, ROLES.SUPER_ADMIN],
        excludedRoles: [ROLES.FINANCE_HEAD],
      },

      {
        title: "Payment Approvals",
        icon: Wallet,
        path: "/approvals",
        permission: PERMISSIONS.VIEW_APPROVALS,
        allowedRoles: [ROLES.TEAM_LEAD, ROLES.MANAGER, ROLES.FINANCE_HEAD],
      },

      {
        title: "Payments",
        icon: Wallet,
        path: "/payments",
        permission: PERMISSIONS.VIEW_PAYMENTS,
        allowedRoles: [ROLES.CASE_MANAGER, ROLES.FINANCE_HEAD],
      },

      {
        title: "Reports",
        icon: FileBarChart2,
        path: "/reports",
        permission: PERMISSIONS.VIEW_REPORTS,
        allowedRoles: [],
      },
    ],
  },

  {
    // section: "SUPER ADMIN",
    items: [
      {
        title: "Reports",
        icon: FileBarChart2,
        path: "/super-admin/reports",
        permission: PERMISSIONS.VIEW_VENDOR_REPORTS,
        allowedRoles: [ROLES.SUPER_ADMIN],
      },
      {
        title: "Audit Logs",
        icon: History,
        path: "/audit-logs",
        permission: PERMISSIONS.VIEW_AUDIT_LOGS,
        allowedRoles: [ROLES.SUPER_ADMIN, ROLES.FINANCE_HEAD],
      },
    ],
  },

  {
    // section: "ADMINISTRATION",
    items: [
      {
        title: "Notifications",
        icon: Bell,
        path: "/notifications",
        permission: PERMISSIONS.VIEW_NOTIFICATIONS,
      },

      {
        title: "Users",
        icon: Users,
        path: "/users",
        permission: PERMISSIONS.MANAGE_USERS,
        allowedRoles: [ROLES.SUPER_ADMIN, ROLES.FINANCE_HEAD],
      },
    ],
  },
];
