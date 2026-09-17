import { useNavigate } from "react-router-dom";
import {
  Building2, ShoppingCart, Receipt, Wallet,
  ArrowRight, FileBarChart2,
} from "lucide-react";

const REPORT_CARDS = [
  {
    title: "Vendor Report",
    description: "View all vendor registrations, statuses, categories, and activity summaries across the entire platform.",
    icon: Building2,
    path: "/super-admin/reports/vendors",
    color: "bg-violet-50 text-violet-600",
    border: "border-violet-100",
  },
  {
    title: "Purchase Order Report",
    description: "Analyze all purchase orders — amounts, statuses, vendor associations, and date-based summaries.",
    icon: ShoppingCart,
    path: "/super-admin/reports/purchase-orders",
    color: "bg-blue-50 text-blue-600",
    border: "border-blue-100",
  },
  {
    title: "Invoice Report",
    description: "Monitor invoice approvals, rejections, outstanding balances, overdue counts, and payment statuses.",
    icon: Receipt,
    path: "/super-admin/reports/invoices",
    color: "bg-amber-50 text-amber-600",
    border: "border-amber-100",
  },
  {
    title: "Payment Report",
    description: "Track all payment transactions — completed, pending, failed, and refunded amounts by vendor.",
    icon: Wallet,
    path: "/super-admin/reports/payments",
    color: "bg-emerald-50 text-emerald-600",
    border: "border-emerald-100",
  },
];

const SuperAdminReportsHome = () => {
  const navigate = useNavigate();

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-start gap-4">
        <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-600 text-white shadow-lg">
          <FileBarChart2 size={22} />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Super Admin Reports</h1>
          <p className="mt-1 text-sm text-slate-500">
            Read-only reporting across the entire VMS platform. Filter, analyze, and export data.
          </p>
        </div>
      </div>

      {/* Alert: read-only */}
      <div className="flex items-center gap-3 rounded-2xl border border-blue-100 bg-blue-50 px-5 py-4 text-sm text-blue-700">
        <svg className="h-4 w-4 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
          <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
        </svg>
        <span>
          These reports are <strong>read-only</strong>. You can view, filter, search, and export data but cannot create, edit, or delete any operational records.
        </span>
      </div>

      {/* Report Cards */}
      <div className="grid gap-5 sm:grid-cols-2">
        {REPORT_CARDS.map((card) => {
          const Icon = card.icon;
          return (
            <button
              key={card.path}
              onClick={() => navigate(card.path)}
              className={`group flex items-start gap-4 rounded-2xl border ${card.border} bg-white p-6 text-left shadow-sm hover:shadow-md transition-all hover:-translate-y-0.5`}
            >
              <div className={`flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-2xl ${card.color}`}>
                <Icon size={20} />
              </div>
              <div className="flex-1">
                <h3 className="font-semibold text-slate-900 group-hover:text-blue-700 transition">
                  {card.title}
                </h3>
                <p className="mt-1 text-sm text-slate-500 leading-relaxed">
                  {card.description}
                </p>
              </div>
              <ArrowRight
                size={16}
                className="mt-1 flex-shrink-0 text-slate-300 group-hover:text-blue-600 group-hover:translate-x-1 transition-all"
              />
            </button>
          );
        })}
      </div>
    </div>
  );
};

export default SuperAdminReportsHome;
