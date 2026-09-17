
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
  };

  if (map[s]) return map[s];

  if (s.startsWith("pending_")) {
    const rolePart = s.replace("pending_", "").replaceAll("_", " ");
    return `PENDING BY ${rolePart.toUpperCase()}`;
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
  Rejected: {
    badgeClass: "badge-danger",
    dotClass: "bg-red-500",
    icon: X,
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
    if (normalized.startsWith("Pending By")) {
      config = {
        badgeClass: "badge-warning",
        dotClass: "bg-amber-500",
        icon: Clock,
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
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold tracking-wide transition-all ${config.badgeClass} ${className}`}
    >
      {showDot ? (
        <span className={`h-1.5 w-1.5 rounded-full animate-pulse ${config.dotClass}`} />
      ) : (
        <Icon size={13} className="shrink-0" />
      )}
      <span>{normalized}</span>
    </span>
  );
};

export default StatusBadge;
