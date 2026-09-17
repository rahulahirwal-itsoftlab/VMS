// This file is intentionally utility-only.
// It is used to adapt backend invoice workflow statuses into the strings
// expected by existing UI components (ApprovalTable + StatusBadge).

export function mapWorkflowStatus(status?: string | null):
  | "Pending"
  | "Approved"
  | "Rejected" {
  const s = (status || "").toUpperCase().trim();

  const PENDING = new Set([
    "UNDER_FINANCE_REVIEW",
    "PAYMENT_PENDING",
    "PENDING_FINANCE_HEAD",
    "PENDING_FINANCEHEAD",
    "PENDING",
    "PENDING_PAYMENT",
    "PENDING_ADMIN_REVIEW",
    "PENDING_TEAM_LEAD",
    "PENDING_MANAGER",
    "PENDING_THREE_WAY_MATCH",
  ]);

  const APPROVED = new Set([
    "FINANCE_APPROVED",
    "PAYMENT_RELEASED",
    "APPROVED",
    "APPROVE",
    "PAID",
  ]);

  const REJECTED = new Set([
    "REJECTED",
    "RETURNED",
    "REJECT",
    "CANCELLED",
  ]);

  if (PENDING.has(s)) return "Pending";
  if (APPROVED.has(s)) return "Approved";
  if (REJECTED.has(s)) return "Rejected";

  // Default fallback for unknown states
  return "Pending";
}

