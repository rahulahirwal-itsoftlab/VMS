import { useState, useEffect } from "react";
import { FileBarChart, Download, FileSpreadsheet, Users, ShoppingCart, Receipt, IndianRupee } from "lucide-react";
import { getInvoices } from "../../services/invoiceService";
import { getPurchaseOrders } from "../../services/purchaseOrderServices";
import { getPayments } from "../../services/paymentService";
import { getVendors } from "../../services/vendorService";
import { toast } from "sonner";
import LoadingSpinner from "../../components/common/LoadingSpinner";
import FilterSelect from "../../components/common/FilterSelect";

const Reports = () => {
  const [vendors, setVendors] = useState([]);
  const [pos, setPos] = useState([]);
  const [invoices, setInvoices] = useState([]);
  const [payments, setPayments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [reportType, setReportType] = useState("Vendor Report");

  useEffect(() => {
    loadReportData();
  }, []);

  const loadReportData = async () => {
    try {
      setLoading(true);
      const [vendorsList, posList, invoicesList, paymentsList] = await Promise.all([
        getVendors(),
        getPurchaseOrders(),
        getInvoices(),
        getPayments(),
      ]);
      setVendors(vendorsList);
      setPos(posList);
      setInvoices(invoicesList);
      setPayments(paymentsList);
    } catch (err) {
      console.error(err);
      toast.error("Failed to load analytics data");
    } finally {
      setLoading(false);
    }
  };

  const handleExportExcel = async () => {
    let dataToExport = [];
    let fileName = "";

    if (reportType === "Vendor Report") {
      if (vendors.length === 0) {
        toast.warning("No vendor data available");
        return;
      }
      dataToExport = vendors.map((v) => ({
        "Company Name": v.companyName,
        "Vendor Code": v.vendorCode,
        Email: v.email,
        Phone: v.phone,
        Category: v.category,
        Status: v.status,
        "Billing Address": v.address,
      }));
      fileName = "VMS_Vendors_Report";
    } else if (reportType === "Invoice Report") {
      if (invoices.length === 0) {
        toast.warning("No invoice data available");
        return;
      }
      dataToExport = invoices.map((inv) => ({
        "Invoice Number": inv.invoiceNumber,
        "PO Linked": inv.poNumber,
        Supplier: inv.vendor,
        Value: inv.amount,
        Status: inv.status,
        "Payment status": inv.paymentStatus,
        "Due Date": inv.dueDate ? new Date(inv.dueDate).toLocaleDateString() : "-",
      }));
      fileName = "VMS_Invoices_Report";
    } else if (reportType === "Purchase Order Report") {
      if (pos.length === 0) {
        toast.warning("No PO data available");
        return;
      }
      dataToExport = pos.map((p) => ({
        "PO Number": p.poNumber,
        Supplier: p.vendor,
        Amount: p.amount,
        Currency: p.currency,
        Status: p.status,
        "Order Date": p.orderDate ? new Date(p.orderDate).toLocaleDateString() : "-",
      }));
      fileName = "VMS_Purchase_Orders_Report";
    } else if (reportType === "Payment Report") {
      if (payments.length === 0) {
        toast.warning("No payment data available");
        return;
      }
      dataToExport = payments.map((pay) => ({
        "Payment ID": pay.paymentNumber,
        "Invoice Reference": pay.invoiceNumber,
        Vendor: pay.vendor,
        Amount: pay.amount,
        "Payment Method": pay.paymentMethod,
        Status: pay.status,
        "Payment Date": pay.paymentDate ? new Date(pay.paymentDate).toLocaleDateString() : "-",
      }));
      fileName = "VMS_Payments_Report";
    }

    const XLSX = await import("xlsx");
    const worksheet = XLSX.utils.json_to_sheet(dataToExport);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Sheet1");
    XLSX.writeFile(workbook, `${fileName}_${new Date().toISOString().split("T")[0]}.xlsx`);
    toast.success("Excel report exported successfully!");
  };

  const totalPOAmount = pos.reduce((sum, p) => sum + p.amount, 0);
  const totalPaidOutflow = payments
    .filter((p) => p.status?.toLowerCase() === "approved")
    .reduce((sum, p) => sum + p.amount, 0);

  const stats = [
    {
      title: "Total Vendors",
      value: vendors.length,
      icon: Users,
    },
    {
      title: "Purchase Orders",
      value: pos.length,
      icon: ShoppingCart,
    },
    {
      title: "Active Invoices",
      value: invoices.length,
      icon: Receipt,
    },
    {
      title: "Cash Outflow",
      value: `₹ ${totalPaidOutflow.toLocaleString()}`,
      icon: IndianRupee,
    },
  ];

  if (loading) {
    return (
      <div className="flex h-96 items-center justify-center">
        <LoadingSpinner size="lg" text="Loading Reports &amp; Aggregates..." />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-slate-900">Reports & Analytics</h1>
          <p className="mt-1 text-slate-500">
            Analyze vendor compliance, purchase commitments, and transaction audit trails
          </p>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-4">
        {stats.map((item) => {
          const Icon = item.icon;
          return (
            <div key={item.title} className="rounded-2xl border bg-white p-6 shadow-sm">
              <div className="mb-4 flex items-center justify-between">
                <Icon className="text-blue-600" />
                <FileBarChart className="text-slate-300" />
              </div>
              <h3 className="text-sm text-slate-500">{item.title}</h3>
              <p className="mt-2 text-3xl font-bold">{item.value}</p>
            </div>
          );
        })}
      </div>

      {/* Report Generator */}
      <div className="rounded-2xl border bg-white p-6 shadow-sm">
        <h2 className="mb-6 text-xl font-semibold">Generate Reports Sheet</h2>
        <div className="grid gap-4 md:grid-cols-3">
          <FilterSelect
            value={reportType}
            onChange={setReportType}
            options={[
              { value: "Vendor Report", label: "Vendor Report" },
              { value: "Invoice Report", label: "Invoice Report" },
              { value: "Purchase Order Report", label: "Purchase Order Report" },
              { value: "Payment Report", label: "Payment Report" },
            ]}
            ariaLabel="Report type selector"
          />

          <button
            onClick={handleExportExcel}
            className="rounded-xl bg-blue-600 text-white font-semibold text-sm hover:bg-blue-700 transition flex items-center justify-center gap-2"
          >
            <FileSpreadsheet size={16} /> Export Excel / CSV Sheet
          </button>
        </div>
      </div>
    </div>
  );
};

export default Reports;
export { Reports };
