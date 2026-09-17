export interface FinancePendingInvoice {
  id: string;
  invoice_number: string;
  vendor?: {
    name?: string | null;
    vendor_code?: string | null;
  } | null;
  amount: number;
  status?: string | null;
  created_at?: string | null;
}

export interface ApprovalTableRow {
  id: string;
  invoiceNo: string;
  vendor: string;
  amount: number;
  priority: string;
  status: "Pending" | "Approved" | "Rejected" | string;
  assignedTo: string;
}

