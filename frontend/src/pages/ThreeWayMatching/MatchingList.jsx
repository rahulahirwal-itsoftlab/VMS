import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Eye, Filter, GitCompare, Play } from "lucide-react";
import { toast } from "sonner";
import DataTable from "../../components/common/DataTable";
import StatusBadge from "../../components/common/StatusBadge";
import { getInvoices } from "../../services/invoiceService";
import {
  createDeliveryChallan,
  createGRN,
  getDeliveryChallansByPO,
  getGRNsByPO,
  getMatches,
  startMatching,
} from "../../services/matchingService";
import { useAuth } from "../../context/AuthContext";
import { ROLES } from "../../config/permissions";
import { ValidationSummary } from "../../components/common/FormValidation";
import {
  fieldErrorClass,
  focusValidationField,
  validateRequiredFields,
} from "../../utils/validationMatrix";
import LoadingSpinner from "../../components/common/LoadingSpinner";
import FilterSelect from "../../components/common/FilterSelect";
import ViewDetailsButton from "../../components/common/ViewDetailsButton";

const formatCurrency = (value) => `Rs. ${Number(value || 0).toLocaleString()}`;
const formatDate = (value) =>
  value ? new Date(value).toLocaleDateString() : "-";

const MatchingList = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [matches, setMatches] = useState([]);
  const [pendingInvoices, setPendingInvoices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState("reports");
  const [selectedInvoiceId, setSelectedInvoiceId] = useState("");
  const [poDocuments, setPoDocuments] = useState({
    grns: [],
    deliveryChallans: [],
  });
  const [documentLoading, setDocumentLoading] = useState(false);
  const [receiverName, setReceiverName] = useState(user?.first_name || "");
  const [remarks, setRemarks] = useState("");
  const [validationErrors, setValidationErrors] = useState([]);
  const [statusFilter, setStatusFilter] = useState("");
  const errorsByField = validationErrors.reduce(
    (acc, error) => ({ ...acc, [error.field]: error.message }),
    {},
  );
  const canRunMatching = [ROLES.CASE_MANAGER, ROLES.SUPER_ADMIN].includes(
    user?.role,
  );

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      const [matchesData, invoicesData] = await Promise.all([
        getMatches(statusFilter ? { status: statusFilter } : {}),
        canRunMatching ? getInvoices() : Promise.resolve([]),
      ]);
      setMatches(matchesData);
      setPendingInvoices(
        invoicesData.filter(
          (invoice) => invoice.status === "PENDING_THREE_WAY_MATCH",
        ),
      );
    } catch (err) {
      console.error(err);
      toast.error("Failed to load matching data");
    } finally {
      setLoading(false);
    }
  }, [canRunMatching, statusFilter]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const selectedInvoice = pendingInvoices.find(
    (invoice) => invoice.id === selectedInvoiceId,
  );

  const loadPODocuments = useCallback(async (purchaseOrderId) => {
    if (!purchaseOrderId) {
      setPoDocuments({ grns: [], deliveryChallans: [] });
      return;
    }
    try {
      setDocumentLoading(true);
      const [grns, deliveryChallans] = await Promise.all([
        getGRNsByPO(purchaseOrderId),
        getDeliveryChallansByPO(purchaseOrderId),
      ]);
      setPoDocuments({ grns, deliveryChallans });
    } catch (err) {
      console.error(err);
      toast.error("Failed to load PO receipt documents");
    } finally {
      setDocumentLoading(false);
    }
  }, []);

  useEffect(() => {
    loadPODocuments(selectedInvoice?.purchaseOrderId);
  }, [selectedInvoice?.purchaseOrderId, loadPODocuments]);

  const buildReceiptItems = (quantityKey) =>
    (selectedInvoice?.items || []).map((item) => ({
      itemName: item.itemName || item.name || item.description || "Item",
      description: item.description || "",
      quantity: Number(item.quantity || 0),
      [quantityKey]: Number(item.quantity || 0),
      unitPrice: Number(item.unitPrice || 0),
      gstAmount: Number(item.gstAmount || 0),
      lineTotal: Number(item.lineTotal || 0),
    }));

  const selectedSummary = {
    subtotal: Number(selectedInvoice?.subtotal || selectedInvoice?.amount || 0),
    gstAmount: Number(selectedInvoice?.gstAmount || 0),
    totalAmount: Number(selectedInvoice?.amount || 0),
  };

  const handleRunAudit = async (invoiceId) => {
    try {
      toast.info("Running three-way matching rules...");
      const result = await startMatching(
        invoiceId,
        poDocuments.grns[0]?.id,
        poDocuments.deliveryChallans[0]?.id,
      );
      toast.success("Matching report created successfully");
      navigate(`/three-way-matching/${result.match.id}`);
    } catch (err) {
      console.error(err);
      toast.error(err?.response?.data?.message || "Matching process failed.");
    }
  };

  const handleCreateDeliveryChallan = async () => {
    if (!selectedInvoice?.purchaseOrderId) return;
    const payloadForValidation = {
      purchaseOrderId: selectedInvoice.purchaseOrderId,
      lineItems: buildReceiptItems("deliveredQuantity"),
      receiverName: "Delivery challan",
    };
    const errors = validateRequiredFields(
      "receiptDocument",
      payloadForValidation,
    ).filter((error) => error.field !== "receiverName");
    setValidationErrors(errors);
    if (errors.length) {
      toast.error(
        "Cannot save Delivery Challan. Please complete the highlighted fields.",
      );
      window.setTimeout(() => focusValidationField(errors[0].field), 0);
      return;
    }
    try {
      await createDeliveryChallan({
        purchaseOrderId: selectedInvoice.purchaseOrderId,
        deliveryDate: new Date().toISOString(),
        subtotal: selectedSummary.subtotal,
        gstAmount: selectedSummary.gstAmount,
        totalAmount: selectedSummary.totalAmount,
        lineItems: buildReceiptItems("deliveredQuantity"),
        remarks,
      });
      toast.success("Delivery Challan created");
      await loadPODocuments(selectedInvoice.purchaseOrderId);
    } catch (err) {
      console.error(err);
      toast.error(
        err?.response?.data?.message || "Delivery Challan creation failed",
      );
    }
  };

  const handleCreateGRN = async () => {
    if (!selectedInvoice?.purchaseOrderId) return;
    const payloadForValidation = {
      purchaseOrderId: selectedInvoice.purchaseOrderId,
      receiverName,
      lineItems: buildReceiptItems("receivedQuantity"),
    };
    const errors = validateRequiredFields(
      "receiptDocument",
      payloadForValidation,
    );
    setValidationErrors(errors);
    if (errors.length) {
      toast.error("Cannot save GRN. Please complete the highlighted fields.");
      window.setTimeout(() => focusValidationField(errors[0].field), 0);
      return;
    }
    try {
      await createGRN({
        purchaseOrderId: selectedInvoice.purchaseOrderId,
        deliveryChallanNo:
          poDocuments.deliveryChallans[0]?.delivery_challan_number,
        deliveryDate: new Date().toISOString(),
        receiverName,
        subtotal: selectedSummary.subtotal,
        gstAmount: selectedSummary.gstAmount,
        totalAmount: selectedSummary.totalAmount,
        lineItems: buildReceiptItems("receivedQuantity"),
        remarks,
      });
      toast.success("Goods Receipt Note created");
      await loadPODocuments(selectedInvoice.purchaseOrderId);
    } catch (err) {
      console.error(err);
      toast.error(err?.response?.data?.message || "GRN creation failed");
    }
  };

  const reportColumns = [
    {
      key: "id",
      label: "Matching ID",
      sortable: true,
      render: (value) => (
        <span className="block max-w-[120px] truncate">{value}</span>
      ),
    },
    { key: "poNumber", label: "Purchase Order Number", sortable: true },
    { key: "invoiceNumber", label: "Invoice Number", sortable: true },
    { key: "vendor", label: "Vendor", sortable: true },
    {
      key: "status",
      label: "Matching Status",
      sortable: true,
      render: (value) => <StatusBadge status={value} />,
    },
    {
      key: "amount",
      label: "Invoice Amount",
      sortable: true,
      render: (value) => (
        <span className="font-semibold text-slate-800">
          {formatCurrency(value)}
        </span>
      ),
    },
    {
      key: "createdAt",
      label: "Created Date",
      sortable: true,
      render: (value) => <span>{formatDate(value)}</span>,
    },
    {
      key: "actions",
      label: "Actions",
      render: (_, row) => (
        <ViewDetailsButton
          size="sm"
          onClick={() => navigate(`/three-way-matching/${row.id}`)}
          title={`View details for matching ${row.id}`}
        />
      ),
    },
  ];

  const pendingColumns = [
    {
      key: "invoiceNumber",
      label: "Invoice Number",
      sortable: true,
      render: (value) => <span className="font-semibold">{value}</span>,
    },
    { key: "vendor", label: "Vendor", sortable: true },
    {
      key: "amount",
      label: "Invoice Amount",
      sortable: true,
      render: (value) => <span>{formatCurrency(value)}</span>,
    },
    {
      key: "status",
      label: "Workflow Status",
      sortable: true,
      render: (value) => <StatusBadge status={value} />,
    },
    {
      key: "actions",
      label: "Matching Reconciliation",
      render: (_, row) => (
        <button
          type="button"
          onClick={() => handleRunAudit(row.id)}
          className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-xs font-semibold text-white transition hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
        >
          <Play size={12} /> Run Match
        </button>
      ),
    },
  ];

  if (loading) {
    return (
      <div className="flex h-96 items-center justify-center">
        <LoadingSpinner size="lg" text="Loading matching dashboard..." />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-extrabold tracking-tight text-slate-900 dark:text-slate-100 font-heading sm:text-3xl">
            <GitCompare className="text-blue-600 dark:text-blue-400" />
            Three-Way Matching
          </h1>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400 sm:text-sm">
            Reconcile invoices against purchase orders and goods receipt notes.
          </p>
        </div>
      </div>

      <div className="border-b border-slate-200 dark:border-slate-800">
        <nav className="flex space-x-8">
          <button
            type="button"
            onClick={() => setActiveTab("reports")}
            className={`border-b-2 px-1 py-4 text-sm font-medium transition-colors ${
              activeTab === "reports"
                ? "border-blue-600 text-blue-600 dark:text-blue-400"
                : "border-transparent text-slate-500 dark:text-slate-400 hover:border-slate-300 dark:hover:border-slate-700 hover:text-slate-700 dark:hover:text-slate-200"
            }`}
          >
            Matching Reports ({matches.length})
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("pending")}
            hidden={!canRunMatching}
            className={`border-b-2 px-1 py-4 text-sm font-medium transition-colors ${
              activeTab === "pending"
                ? "border-blue-600 text-blue-600 dark:text-blue-400"
                : "border-transparent text-slate-500 dark:text-slate-400 hover:border-slate-300 dark:hover:border-slate-700 hover:text-slate-700 dark:hover:text-slate-200"
            }`}
          >
            Awaiting Match Calculation ({pendingInvoices.length})
          </button>
        </nav>
      </div>

      <div className="rounded-2xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 shadow-sm dark:shadow-slate-950/40">
        {activeTab === "reports" ? (
          <DataTable
            columns={reportColumns}
            data={matches}
            searchableFields={[
              "id",
              "invoiceNumber",
              "poNumber",
              "vendor",
              "status",
            ]}
            itemsPerPage={10}
            extraHeaderContent={
              <div className="flex items-center gap-2">
                <Filter className="h-4 w-4 text-slate-400" />
                <FilterSelect
                  value={statusFilter}
                  onChange={setStatusFilter}
                  options={[
                    { value: "", label: "All Statuses" },
                    { value: "MATCHED", label: "Matched" },
                    { value: "MISMATCH", label: "Mismatched" },
                    { value: "PENDING", label: "Pending" },
                  ]}
                  placeholder="All Statuses"
                  className="w-48"
                />
              </div>
            }
          />
        ) : (
          <div className="space-y-5">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-900/60 p-4">
              <div className="flex-1 max-w-xl">
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 dark:text-slate-400 mb-1.5">
                  Select Invoice to Reconcile
                </label>
                <FilterSelect
                  value={selectedInvoiceId}
                  onChange={setSelectedInvoiceId}
                  options={[
                    {
                      value: "",
                      label: "Choose an invoice pending three-way matching",
                    },
                    ...pendingInvoices.map((invoice) => ({
                      value: invoice.id,
                      label: `${invoice.invoiceNumber} | ${invoice.poNumber || "PO N/A"} | ${invoice.vendor || "Vendor N/A"} | ${formatCurrency(invoice.amount)}`,
                    })),
                  ]}
                  placeholder="Choose an invoice pending three-way matching"
                />
              </div>
              <button
                type="button"
                onClick={() =>
                  selectedInvoiceId && handleRunAudit(selectedInvoiceId)
                }
                disabled={!selectedInvoiceId}
                className="inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-blue-600 px-5 text-xs font-semibold text-white transition hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:bg-slate-300 dark:disabled:bg-slate-800 shrink-0 self-end sm:self-auto"
              >
                <Play size={14} /> Run Match
              </button>
            </div>
            {selectedInvoice && (
              <div className="grid gap-4 rounded-lg border border-slate-200 bg-white p-4 lg:grid-cols-3">
                <div className="lg:col-span-3">
                  <ValidationSummary
                    title="Cannot save receipt document."
                    errors={validationErrors}
                    onSelect={(field) => focusValidationField(field)}
                  />
                </div>
                <div>
                  <p className="text-xs font-semibold uppercase text-slate-500">
                    Purchase Order
                  </p>
                  <p className="mt-1 font-semibold text-slate-900">
                    {selectedInvoice.poNumber || "Not Available"}
                  </p>
                  <p className="mt-1 text-sm text-slate-600">
                    {selectedInvoice.vendor || "Vendor Not Available"}
                  </p>
                </div>
                <div className="space-y-2">
                  <p className="text-xs font-semibold uppercase text-slate-500">
                    Receipt Documents
                  </p>
                  <p className="text-sm text-slate-700">
                    Delivery Challans:{" "}
                    <strong>
                      {documentLoading
                        ? "Loading..."
                        : poDocuments.deliveryChallans.length}
                    </strong>
                  </p>
                  <p className="text-sm text-slate-700">
                    GRNs:{" "}
                    <strong>
                      {documentLoading ? "Loading..." : poDocuments.grns.length}
                    </strong>
                  </p>
                </div>
                <div className="space-y-3">
                  <input
                    value={receiverName}
                    onChange={(event) => setReceiverName(event.target.value)}
                    placeholder="Receiver name"
                    name="receiverName"
                    className={`h-10 w-full rounded-md border border-slate-300 px-3 text-sm outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-100 ${fieldErrorClass(errorsByField.receiverName)}`}
                  />
                  <textarea
                    value={remarks}
                    onChange={(event) => setRemarks(event.target.value)}
                    placeholder="Receipt remarks"
                    className="min-h-20 w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-100"
                  />
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={handleCreateDeliveryChallan}
                      disabled={documentLoading}
                      className="rounded-md border border-blue-200 px-3 py-2 text-xs font-semibold text-blue-700 hover:bg-blue-50 disabled:opacity-60"
                    >
                      Create Delivery Challan
                    </button>
                    <button
                      type="button"
                      onClick={handleCreateGRN}
                      disabled={
                        documentLoading ||
                        poDocuments.deliveryChallans.length === 0
                      }
                      className="rounded-md border border-green-200 px-3 py-2 text-xs font-semibold text-green-700 hover:bg-green-50 disabled:opacity-60"
                    >
                      Create GRN
                    </button>
                  </div>
                </div>
              </div>
            )}
            <DataTable
              columns={pendingColumns}
              data={pendingInvoices}
              searchableFields={["invoiceNumber", "vendor"]}
              itemsPerPage={10}
            />
          </div>
        )}
      </div>
    </div>
  );
};

export default MatchingList;
export { MatchingList };
