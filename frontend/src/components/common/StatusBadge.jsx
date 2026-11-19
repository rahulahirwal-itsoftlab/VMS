import { X, CheckCircle2, AlertCircle, Clock, RefreshCw, Ban, Sparkles } from "lucide-react";

const normalizeStatus = (status = "") => {
  const s = String(status || "").toLowerCase().trim();
  const map = {
    pending: "Pending",
    initiated: "Under Review",
    processing: "Under Review",
    under_review: "Under Review",
    approved: "Approved",
    rejected: "Rejected",
    failed: "Rejected",
    returned: "Returned for Correction",
    returned_for_correction: "Returned for Correction",
    paid: "Paid",
    completed: "Paid",
    success: "Paid",
    cancelled: "Cancelled",
    created: "Created",
    blocked: "Inactive",
    active: "Active",
    inactive: "Deactivated",
    draft: "Draft",
    overdue: "Overdue",
    matched: "Matched",
    partially_matched: "Partially Matched",
    mismatched: "Mismatched",
    unmatched: "Unmatched",
    unpaid: "Unpaid",
    partially_paid: "Partially Paid",
  };

  if (map[s]) return map[s];

  if (s.startsWith("pending_")) {
    const rolePart = s
      .replace("pending_", "")
      .replaceAll("_", " ")
      .split(" ")
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
      .join(" ");
    return `Pending by ${rolePart}`;
  }

  return status;
};

const statusConfig = {
  Active: {
    badgeClass: "badge-success",
    dotClass: "bg-emerald-500",
    icon: CheckCircle2,
  },
  Approved: {
    badgeClass: "badge-success",
    dotClass: "bg-emerald-500",
    icon: CheckCircle2,
  },
  Matched: {
    badgeClass: "badge-success",
    dotClass: "bg-emerald-500",
    icon: CheckCircle2,
  },
  Paid: {
    badgeClass: "badge-info",
    dotClass: "bg-blue-500",
    icon: CheckCircle2,
  },
  Pending: {
    badgeClass: "badge-warning",
    dotClass: "bg-amber-500",
    icon: Clock,
  },
  "Under Review": {
    badgeClass: "bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border border-indigo-500/20",
    dotClass: "bg-indigo-500",
    icon: RefreshCw,
  },
  "Returned for Correction": {
    badgeClass: "badge-warning",
    dotClass: "bg-orange-500",
    icon: AlertCircle,
  },
  "Partially Matched": {
    badgeClass: "badge-warning",
    dotClass: "bg-amber-500",
    icon: AlertCircle,
  },
  "Partially Paid": {
    badgeClass: "badge-warning",
    dotClass: "bg-amber-500",
    icon: Clock,
  },
  Unpaid: {
    badgeClass: "badge-neutral",
    dotClass: "bg-slate-400",
    icon: Clock,
  },
  Rejected: {
    badgeClass: "badge-danger",
    dotClass: "bg-red-500",
    icon: X,
  },
  Mismatched: {
    badgeClass: "badge-danger",
    dotClass: "bg-red-500",
    icon: AlertCircle,
  },
  Unmatched: {
    badgeClass: "badge-neutral",
    dotClass: "bg-slate-400",
    icon: Ban,
  },
  Overdue: {
    badgeClass: "badge-danger",
    dotClass: "bg-red-500",
    icon: AlertCircle,
  },
  Cancelled: {
    badgeClass: "badge-neutral",
    dotClass: "bg-slate-400",
    icon: Ban,
  },
  Inactive: {
    badgeClass: "badge-neutral",
    dotClass: "bg-slate-400",
    icon: Ban,
  },
  Deactivated: {
    badgeClass: "badge-neutral",
    dotClass: "bg-slate-400",
    icon: Ban,
  },
  Created: {
    badgeClass: "badge-info",
    dotClass: "bg-blue-500",
    icon: Sparkles,
  },
  Draft: {
    badgeClass: "badge-neutral",
    dotClass: "bg-slate-400",
    icon: Clock,
  },
};

export const StatusBadge = ({ status, className = "", showDot = true }) => {
  const normalized = normalizeStatus(status);
  let config = statusConfig[normalized];

  if (!config) {
    const upper = String(normalized || "").toUpperCase();
    if (upper.includes("PENDING")) {
      config = {
        badgeClass: "badge-warning",
        dotClass: "bg-amber-500",
        icon: Clock,
      };
    } else if (upper.includes("MATCHED") || upper.includes("APPROV") || upper.includes("SUCCESS")) {
      config = {
        badgeClass: "badge-success",
        dotClass: "bg-emerald-500",
        icon: CheckCircle2,
      };
    } else if (upper.includes("REJECT") || upper.includes("FAIL") || upper.includes("MISMATCH") || upper.includes("OVERDUE")) {
      config = {
        badgeClass: "badge-danger",
        dotClass: "bg-red-500",
        icon: AlertCircle,
      };
    } else {
      config = {
        badgeClass: "badge-neutral",
        dotClass: "bg-slate-400",
        icon: Clock,
      };
    }
  }

  const Icon = config.icon;

  return (
    <span
      className={`inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold tracking-wide transition-all ${config.badgeClass} ${className}`}
    >
      {showDot ? (
        <span className={`h-1.5 w-1.5 rounded-full shrink-0 animate-pulse ${config.dotClass}`} />
      ) : (
        <Icon size={13} className="shrink-0" />
      )}
      <span>{normalized}</span>
    </span>
  );
};

export default StatusBadge;
