import type {
  ApprovalTableRow,
  FinancePendingInvoice,
} from "./types";

import { mapWorkflowStatus } from "./mapInvoiceWorkflowStatus";

export function mapFinanceHeadPendingInvoices(
  invoices: FinancePendingInvoice[]
): ApprovalTableRow[] {
  return (invoices || []).map((inv) => {
    const vendorName = inv.vendor?.name || inv.vendor?.vendor_code || "—";

    return {
      id: String(inv.id),
      invoiceNo: inv.invoice_number || "—",
      vendor: vendorName,
      amount: typeof inv.amount === "number" ? inv.amount : Number(inv.amount || 0),
      priority: "High",
      status: mapWorkflowStatus(inv.status),
      assignedTo: "FINANCE_HEAD",
    };
  });
}

