import { ArrowLeft, Search, AlertCircle, CheckCircle, FileText, User, ShoppingBag, Receipt, Lock } from "lucide-react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useState, useEffect } from "react";
import { getInvoices } from "../../services/invoiceService";
import { createPayment, getPaymentCreationStats, getEligibleInvoices, getPaymentStoreData } from "../../services/paymentService";
import { toast } from "sonner";
import { RequiredLabel, ValidationSummary } from "../../components/common/FormValidation";
import { fieldErrorClass, focusValidationField, validateRequiredFields } from "../../utils/validationMatrix";

const input = "w-full rounded-xl border border-slate-300 bg-white px-4 py-3 outline-none transition focus:border-blue-600 focus:ring-2 focus:ring-blue-100";

const getInstRemaining = (inst) => {
  if (!inst) return 0; 
  let rem = 0;
  if (inst.remainingAmount !== undefined && inst.remainingAmount !== null) {
    rem = Number(inst.remainingAmount);
  } else if (inst.remaining_amount !== undefined && inst.remaining_amount !== null) {
    rem = Number(inst.remaining_amount);
  } else if (inst.remaining !== undefined && inst.remaining !== null) {
    rem = Number(inst.remaining);
  } else {
    const amt = Number(inst.amount || 0);
    const paid = Number(inst.paidAmount || inst.paid_amount || inst.paid || 0);
    rem = Math.max(0, amt - paid);
  }
  return Math.max(0, Math.round(rem * 100) / 100);
};

const getCurrentInstallment = (invoice) => {
  if (!invoice) return null;
  if (invoice.currentInstallment?.id) return invoice.currentInstallment;
  const planCurrent = invoice.installmentPlan?.currentInstallment;
  if (planCurrent?.id) return planCurrent;
  return invoice.installments?.find((inst) => inst.payable) || null;
};

const PaymentCreate = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  // When navigated from Payment List ("N Remaining" button), this holds the invoice ID to pre-select
  const preselectedInvoiceId = searchParams.get("invoiceId");
  const isStoreContinuation = Boolean(preselectedInvoiceId);

  const [approvedInvoices, setApprovedInvoices] = useState([]);
  const [creationStats, setCreationStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [validationErrors, setValidationErrors] = useState([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedInstallmentId, setSelectedInstallmentId] = useState("");
  const [formData, setFormData] = useState({
    invoiceId: "",
    paymentMethod: "",
    amount: "",
    referenceNo: "",
    notes: "",
  });

  const errorsByField = validationErrors.reduce((acc, error) => ({ ...acc, [error.field]: error.message }), {});
  const selectedInvoice = approvedInvoices.find((invoice) => invoice.id === formData.invoiceId);
  const selectedIsInstallment = selectedInvoice?.paymentType === "INSTALLMENT" || selectedInvoice?.poPaymentType === "INSTALLMENT";
  const currentInstallment = selectedIsInstallment ? getCurrentInstallment(selectedInvoice) : null;

  useEffect(() => {
    loadInvoices();
    if (!isStoreContinuation) loadStats();
  }, []);

  useEffect(() => {
    if (!preselectedInvoiceId || !approvedInvoices.length) return;
    const match = approvedInvoices.find((inv) => inv.id === preselectedInvoiceId);
    if (match) hydrateSelectedInvoice(match);
  }, [preselectedInvoiceId, approvedInvoices]);

  const hydrateSelectedInvoice = (invoice) => {
    const isInstallment = invoice.paymentType === "INSTALLMENT" || invoice.poPaymentType === "INSTALLMENT";
    const payableInst = isInstallment ? getCurrentInstallment(invoice) : null;
    setSelectedInstallmentId(payableInst?.id || "");
    setFormData((prev) => ({
      ...prev,
      invoiceId: invoice.id,
      amount: String(payableInst ? getInstRemaining(payableInst) : (invoice.outstandingAmount ?? invoice.invoiceTotal ?? invoice.amount ?? "")),
    }));
  };

  const loadStats = async () => {
    try {
      const stats = await getPaymentCreationStats();
      setCreationStats(stats);
    } catch (err) {
      console.error("Failed to load creation stats", err);
    }
  };

  const loadInvoices = async () => {
    try {
      setLoading(true);
      if (preselectedInvoiceId) {
        const storeInvoice = await getPaymentStoreData(preselectedInvoiceId);
        const invoices = storeInvoice ? [storeInvoice] : [];
        setApprovedInvoices(invoices);
        if (storeInvoice) hydrateSelectedInvoice(storeInvoice);
        return;
      }
      let invoices = await getEligibleInvoices();
      if (!invoices || invoices.length === 0) invoices = await getInvoices({ eligibleForPayment: true });
      setApprovedInvoices(invoices || []);
    } catch (err) {
      console.error(err);
      toast.error("Failed to load approved invoices list");
    } finally {
      setLoading(false);
    }
  };

  const handleChange = (e) => {
    const { name, value } = e.target;
    
    if (name === "invoiceId") {
      const selected = approvedInvoices.find((i) => i.id === value);
      let initialAmount = "";
      let firstPendingInstId = "";

      if (selected) {
        const isInstallment = selected.paymentType === "INSTALLMENT" || selected.poPaymentType === "INSTALLMENT";
        if (isInstallment && selected.installments?.length) {
          const payableInst = getCurrentInstallment(selected);
          if (payableInst) {
            firstPendingInstId = payableInst.id;
            initialAmount = String(getInstRemaining(payableInst));
          }
        } else {
          initialAmount = String(selected.outstandingAmount || selected.invoiceTotal || selected.amount || "");
        }
      }

      setSelectedInstallmentId(firstPendingInstId);
      setFormData((prev) => ({
        ...prev,
        invoiceId: value,
        amount: initialAmount,
      }));
      setValidationErrors([]);
    } else {
      setFormData((prev) => ({
        ...prev,
        [name]: value,
      }));
    }
  };

  // Filter approved invoices dynamically by search term
  const filteredInvoices = approvedInvoices.filter((inv) => {
    const query = searchTerm.toLowerCase();
    return (
      (inv.invoiceNumber || "").toLowerCase().includes(query) ||
      (inv.vendor || "").toLowerCase().includes(query) ||
      (inv.vendorCode || "").toLowerCase().includes(query) ||
      (inv.poNumber || "").toLowerCase().includes(query)
    );
  });

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!selectedInvoice) {
      toast.error("Please select a valid invoice first.");
      return;
    }

    // 1. Verify Three-Way Matching Status
    const matchStatus = (selectedInvoice.threeWayMatchStatus || "").toUpperCase();
    if (matchStatus !== "MATCHED") {
      toast.error(`Payment blocked: Three-Way Matching status is ${selectedInvoice.threeWayMatchStatus || "UNMATCHED"}.`);
      return;
    }

    // 2. Verify Vendor Bank Details
    const missingBankFields = [];
    if (!selectedInvoice.vendorBankName) missingBankFields.push("Bank Name");
    if (!selectedInvoice.vendorAccountHolder) missingBankFields.push("Account Holder");
    if (!selectedInvoice.vendorBankAccountNo) missingBankFields.push("Account Number");
    if (!selectedInvoice.vendorIfscCode) missingBankFields.push("IFSC Code");

    if (missingBankFields.length > 0) {
      toast.error("Payment cannot be recorded: Vendor bank information is incomplete. Please complete the Vendor Master before creating payment.");
      setValidationErrors([
        {
          field: "invoiceId",
          message: "Vendor information is incomplete. Please complete the Vendor Master before creating payment.",
        },
      ]);
      return;
    }

    // 3. Sequential & Amount Validations
    const payAmount = Number(formData.amount);
    const isInstallment = selectedIsInstallment;
    const selectedInst = isInstallment && selectedInstallmentId
      ? selectedInvoice.installments?.find((inst) => inst.id === selectedInstallmentId)
      : null;

    if (isInstallment && selectedInvoice.installments?.length) {
      const nextPayable = getCurrentInstallment(selectedInvoice);

      if (selectedInst && nextPayable && selectedInst.id !== nextPayable.id) {
        toast.error(`Installment #${nextPayable.installmentNumber || nextPayable.number} must be fully paid before paying Installment #${selectedInst.installmentNumber || selectedInst.number}.`);
        return;
      }
    }

    const limit = selectedInst
      ? getInstRemaining(selectedInst)
      : Number(selectedInvoice.outstandingAmount || selectedInvoice.invoiceTotal || selectedInvoice.amount || 0);

    if (isNaN(payAmount) || payAmount <= 0) {
      toast.error("Payment amount must be a positive number greater than zero.");
      return;
    }

    if (payAmount > limit + 0.01) {
      toast.error(`Payment amount cannot exceed the remaining payable amount of ₹ ${limit.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}.`);
      return;
    }

    const errors = validateRequiredFields("payment", formData);
    if (errors.length) {
      setValidationErrors(errors);
      toast.error("Please fill in all required fields.");
      window.setTimeout(() => focusValidationField(errors[0].field), 0);
      return;
    }

    try {
      const payload = {
        invoiceId: formData.invoiceId,
        installmentId: selectedInstallmentId || undefined,
        amount: payAmount,
        currency: "INR",
        paymentMethod: formData.paymentMethod,
        referenceNo: formData.referenceNo,
        notes: formData.notes,
      };
      await createPayment(payload);
      toast.success("Payment request recorded successfully!");
      if (isStoreContinuation) {
        await loadInvoices();
        setFormData((prev) => ({ ...prev, paymentMethod: "", referenceNo: "", notes: "" }));
      } else {
        navigate("/payments");
      }
    } catch (err) {
      console.error(err);
      toast.error(err?.response?.data?.message || "Failed to record payment");
    }
  };

  if (loading) {
    return (
      <div className="flex h-96 items-center justify-center">
        <div className="text-center space-y-4">
          <div className="h-10 w-10 animate-spin rounded-full border-4 border-blue-600 border-t-transparent mx-auto"></div>
          <p className="text-slate-500 font-medium">Loading Approved Invoices...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-6xl mx-auto pb-12">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Link to="/payments">
          <button className="rounded-lg p-2 hover:bg-slate-100 transition">
            <ArrowLeft size={20} className="text-slate-600" />
          </button>
        </Link>
        <div>
          <h1 className="text-3xl font-bold text-slate-900">
            {isStoreContinuation ? "Payment Store" : "Create Payment"}
          </h1>
          <p className="mt-1 text-slate-500">
            {isStoreContinuation
              ? "Continue the persisted installment payment plan"
              : "Record a new vendor payment payout request from approved invoices"}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Input Form Column */}
        <div className="lg:col-span-2 space-y-6">
          <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
            <ValidationSummary
              title="Cannot record Payment."
              errors={validationErrors}
              onSelect={(field) => focusValidationField(field)}
            />
            
            <form onSubmit={handleSubmit} className="space-y-6">
              {!isStoreContinuation && (
              <div>
                <h2 className="mb-4 text-lg font-semibold text-slate-900 flex items-center gap-2">
                  <FileText className="text-blue-600" size={20} /> Select Invoice
                </h2>
                
                {/* Search Input */}
                <div className="relative mb-4">
                  <Search size={18} className="absolute left-4 top-3.5 text-slate-400" />
                  <input
                    type="text"
                    placeholder="Search by Invoice No, Vendor Name/Code, or PO Number..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="w-full rounded-xl border border-slate-300 bg-slate-50/50 pl-12 pr-4 py-3 outline-none transition focus:border-blue-600 focus:bg-white"
                  />
                </div>

                <RequiredLabel>Invoice Number</RequiredLabel>
                <select
                  name="invoiceId"
                  value={formData.invoiceId}
                  onChange={handleChange}
                  className={`${input} ${fieldErrorClass(errorsByField.invoiceId)}`}
                  required
                >
                  <option value="">Select Approved Invoice</option>
                  {filteredInvoices.map((inv) => (
                    <option key={inv.id} value={inv.id}>
                      {inv.invoiceNumber} — {inv.vendor} (Remaining: ₹ {Number(inv.outstandingAmount || inv.invoiceTotal).toLocaleString('en-IN')})
                    </option>
                  ))}
                </select>
                {approvedInvoices.length === 0 ? (
                  <div className="flex items-start gap-2.5 p-3.5 rounded-lg bg-amber-50 border border-amber-200 mt-2 animate-pulse">
                    <AlertCircle className="text-amber-600 mt-0.5 flex-shrink-0" size={18} />
                    <p className="text-sm font-medium text-amber-800">
                      No approved invoices are currently available for payment.
                    </p>
                  </div>
                ) : null}
                {filteredInvoices.length === 0 && searchTerm && (
                  <p className="text-xs text-rose-500 mt-1">No matching approved invoices found.</p>
                )}
              </div>
              )}

              {selectedInvoice && (selectedInvoice.paymentType === "INSTALLMENT" || selectedInvoice.poPaymentType === "INSTALLMENT") && selectedInvoice.installments?.length > 0 && (() => {
                const insts = selectedInvoice.installments;
                const totalCount = insts.length;
                const paidCount = Number(selectedInvoice.paidInstallments ?? selectedInvoice.installmentPlan?.paidInstallmentCount ?? insts.filter(i => i.status === "PAID").length);
                const totalPoAmt = Number(selectedInvoice.invoiceTotal || selectedInvoice.poTotal || selectedInvoice.amount || 0);
                const paidSum = Number(selectedInvoice.paidAmount ?? selectedInvoice.installmentPlan?.paidAmount ?? 0);
                const remSum = Number(selectedInvoice.outstandingAmount ?? selectedInvoice.installmentPlan?.remainingAmount ?? 0);
                const pct = Math.round((paidCount / totalCount) * 100);
                const nextDueInst = getCurrentInstallment(selectedInvoice);

                return (
                  <div className="rounded-xl border border-blue-200 bg-blue-50/40 p-4 space-y-4">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <h3 className="text-sm font-bold text-slate-900">Installment Plan ({paidCount} / {totalCount} Paid — {pct}% Completed)</h3>
                        <p className="text-xs text-slate-500">
                          {isStoreContinuation ? "Current installment is selected by backend from the saved payment plan." : "Select an eligible installment below to process payout."}
                        </p>
                      </div>
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800 border border-emerald-200">
                          Invoice Approval: APPROVED
                        </span>
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold bg-blue-100 text-blue-800 border border-blue-200">
                          Payment: {paidSum > 0 ? (remSum <= 0.01 ? 'PAID' : 'PARTIALLY_PAID') : 'UNPAID'}
                        </span>
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold bg-indigo-100 text-indigo-800 border border-indigo-200">
                          Installment Payment
                        </span>
                      </div>
                    </div>

                    {/* Progress Bar */}
                    <div className="w-full bg-slate-200 rounded-full h-2 overflow-hidden">
                      <div className="bg-blue-600 h-2 rounded-full transition-all duration-300" style={{ width: `${pct}%` }} />
                    </div>

                    {/* Summary Metrics Grid */}
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                      <div className="p-2.5 rounded-lg bg-white border border-slate-200">
                        <span className="text-slate-500 font-medium">PO Total</span>
                        <div className="text-sm font-bold text-slate-900 mt-0.5">₹ {totalPoAmt.toLocaleString('en-IN')}</div>
                      </div>
                      <div className="p-2.5 rounded-lg bg-white border border-slate-200">
                        <span className="text-slate-500 font-medium">Total Paid</span>
                        <div className="text-sm font-bold text-emerald-600 mt-0.5">₹ {paidSum.toLocaleString('en-IN')}</div>
                      </div>
                      <div className="p-2.5 rounded-lg bg-white border border-slate-200">
                        <span className="text-slate-500 font-medium">Total Remaining</span>
                        <div className="text-sm font-bold text-amber-600 mt-0.5">₹ {remSum.toLocaleString('en-IN')}</div>
                      </div>
                      <div className="p-2.5 rounded-lg bg-white border border-slate-200">
                        <span className="text-slate-500 font-medium">Next Due</span>
                        <div className="text-sm font-bold text-blue-600 mt-0.5">
                          {nextDueInst ? `#${nextDueInst.installmentNumber || nextDueInst.installment_number}` : 'None'}
                        </div>
                      </div>
                    </div>

                  <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
                    <table className="w-full text-left text-xs border-collapse">
                      <thead>
                        <tr className="bg-slate-100 text-[10px] uppercase font-bold text-slate-600">
                          <th className="py-2 px-2 text-center">#</th>
                          <th className="py-2 px-3 text-right">Amount</th>
                          <th className="py-2 px-3 text-center">Due Date</th>
                          <th className="py-2 px-3 text-right">Paid</th>
                          <th className="py-2 px-3 text-right">Remaining</th>
                          <th className="py-2 px-3 text-center">Status</th>
                          {!isStoreContinuation && <th className="py-2 px-3 text-center">Action</th>}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {selectedInvoice.installments.map((inst, idx) => {
                          const amt = Number(inst.amount || 0);
                          const paid = Number(inst.paidAmount || inst.paid_amount || inst.paid || 0);
                          const rem = getInstRemaining(inst);
                          const isSelected = selectedInstallmentId === inst.id;
                          const isPaid = inst.status === "PAID" || rem <= 0.01;
                          const isPayable = Boolean(inst.payable ?? (!isPaid && inst.id === nextDueInst?.id));
                          const isLocked = !isPaid && !isPayable;
                          const lockedReason = inst.lockedReason || (nextDueInst ? `Pay Installment #${nextDueInst.installmentNumber || nextDueInst.installment_number} first` : "Locked");

                          return (
                            <tr
                              key={inst.id || idx}
                              className={`transition ${
                                isSelected
                                  ? "bg-blue-50/80 font-bold"
                                  : isLocked
                                  ? "opacity-75 bg-slate-50/40"
                                  : "hover:bg-slate-50"
                              }`}
                            >
                              <td className="py-2.5 px-2 text-center font-bold text-blue-600">#{inst.installmentNumber || inst.installment_number || idx + 1}</td>
                              <td className="py-2.5 px-3 text-right font-semibold">₹ {amt.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                              <td className="py-2.5 px-3 text-center">{inst.dueDate || inst.due_date ? new Date(inst.dueDate || inst.due_date).toLocaleDateString('en-IN') : '—'}</td>
                              <td className="py-2.5 px-3 text-right font-medium text-emerald-600">₹ {paid.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                              <td className="py-2.5 px-3 text-right font-medium text-amber-600">₹ {rem.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                              <td className="py-2.5 px-3 text-center">
                                <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold ${
                                  isPaid
                                    ? 'bg-emerald-100 text-emerald-800'
                                    : isPayable
                                    ? 'bg-blue-100 text-blue-800 border border-blue-200'
                                    : 'bg-slate-100 text-slate-500'
                                }`}>
                                  {isPaid ? 'PAID' : isPayable ? 'PAYABLE' : 'LOCKED'}
                                </span>
                              </td>
                              {!isStoreContinuation && <td className="py-2.5 px-3 text-center">
                                {isPaid ? (
                                  <button
                                    type="button"
                                    disabled
                                    className="px-3 py-1 rounded-lg text-xs font-bold bg-slate-100 text-slate-400 cursor-not-allowed"
                                  >
                                    Paid
                                  </button>
                                ) : isPayable ? (
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setSelectedInstallmentId(inst.id);
                                      setFormData((prev) => ({ ...prev, amount: String(rem) }));
                                    }}
                                    className={`px-3 py-1 rounded-lg text-xs font-bold transition ${
                                      isSelected
                                        ? "bg-blue-600 text-white shadow-sm"
                                        : "bg-blue-50 text-blue-700 hover:bg-blue-600 hover:text-white border border-blue-200"
                                    }`}
                                  >
                                    {isSelected ? "Selected" : "Pay Installment"}
                                  </button>
                                ) : (
                                  <div className="flex flex-col items-center">
                                    <button
                                      type="button"
                                      disabled
                                      title={lockedReason}
                                      className="px-2.5 py-1 rounded-lg text-xs font-semibold bg-slate-100 text-slate-400 cursor-not-allowed inline-flex items-center gap-1"
                                    >
                                      <Lock size={12} /> Locked
                                    </button>
                                    <span className="text-[10px] text-slate-400 mt-0.5 max-w-32.5 truncate" title={lockedReason}>
                                      {lockedReason}
                                    </span>
                                  </div>
                                )}
                              </td>}
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              );
            })()}

              {selectedInvoice && selectedIsInstallment && currentInstallment && (
                <div className="rounded-xl border border-emerald-200 bg-emerald-50/50 p-4">
                  <h3 className="mb-3 text-sm font-bold uppercase tracking-wide text-emerald-900">Current Payment</h3>
                  <div className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-2 lg:grid-cols-5">
                    <div>
                      <span className="block text-xs font-semibold text-slate-500">Current Installment</span>
                      <strong className="text-slate-900">#{currentInstallment.installmentNumber || currentInstallment.number}</strong>
                    </div>
                    <div>
                      <span className="block text-xs font-semibold text-slate-500">Installment Amount</span>
                      <strong className="text-slate-900">₹ {Number(currentInstallment.amount || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong>
                    </div>
                    <div>
                      <span className="block text-xs font-semibold text-slate-500">Already Paid</span>
                      <strong className="text-emerald-700">₹ {Number(currentInstallment.paidAmount || currentInstallment.paid || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong>
                    </div>
                    <div>
                      <span className="block text-xs font-semibold text-slate-500">Remaining</span>
                      <strong className="text-amber-700">₹ {getInstRemaining(currentInstallment).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong>
                    </div>
                    <div>
                      <span className="block text-xs font-semibold text-slate-500">Due Date</span>
                      <strong className="text-slate-900">{currentInstallment.dueDate ? new Date(currentInstallment.dueDate).toLocaleDateString("en-IN") : "—"}</strong>
                    </div>
                  </div>
                </div>
              )}

              {selectedInvoice && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <RequiredLabel>Amount to Pay (INR)</RequiredLabel>
                    <input
                      type="number"
                      name="amount"
                      value={formData.amount}
                      onChange={handleChange}
                      placeholder="0.00"
                      className={`${input} ${fieldErrorClass(errorsByField.amount)}`}
                      required
                    />
                    <span className="text-xs text-slate-500 mt-1 block">
                      Max Remaining Payable Amount: <strong>₹ {Number(
                        selectedInstallmentId && selectedInvoice.installments?.find(i => i.id === selectedInstallmentId)
                          ? getInstRemaining(selectedInvoice.installments.find(i => i.id === selectedInstallmentId))
                          : (selectedInvoice.outstandingAmount || selectedInvoice.invoiceTotal || selectedInvoice.amount)
                      ).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong>
                    </span>
                  </div>

                  <div>
                    <RequiredLabel>Payment Method</RequiredLabel>
                    <select
                      name="paymentMethod"
                      value={formData.paymentMethod}
                      onChange={handleChange}
                      className={`${input} ${fieldErrorClass(errorsByField.paymentMethod)}`}
                      required
                    >
                      <option value="">Select Payment Method</option>
                      <option value="NEFT">NEFT</option>
                      <option value="RTGS">RTGS</option>
                      <option value="UPI">UPI</option>
                      <option value="CHEQUE">CHEQUE</option>
                    </select>
                  </div>

                  <div className="md:col-span-2">
                    <label className="block text-sm font-medium text-slate-700 mb-2">
                      Reference / Transaction ID (Cheque / UTR No.)
                    </label>
                    <input
                      type="text"
                      name="referenceNo"
                      value={formData.referenceNo}
                      onChange={handleChange}
                      placeholder="e.g. UTR123456789 or Cheque reference"
                      className={input}
                    />
                  </div>
                </div>
              )}

              {/* Notes */}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">
                  Remarks / Additional Notes
                </label>
                <textarea
                  name="notes"
                  value={formData.notes}
                  onChange={handleChange}
                  placeholder="Record any remarks for this payment payout request"
                  rows="3"
                  className={`${input} resize-none`}
                />
              </div>

              {/* Submit / Action buttons */}
              <div className="flex gap-4 pt-4 border-t border-slate-100">
                <button
                  type="submit"
                  disabled={!selectedInvoice || (selectedInvoice.threeWayMatchStatus || "").toUpperCase() !== "MATCHED"}
                  className="flex-1 rounded-lg bg-blue-600 py-3 text-center font-medium text-white transition hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isStoreContinuation && selectedInvoice?.poPaymentType === "INSTALLMENT" ? "Pay Installment" : "Record Payment Payout"}
                </button>
                <button
                  type="button"
                  onClick={() => navigate("/payments")}
                  className="flex-1 rounded-lg border border-slate-300 py-3 text-center font-medium text-slate-700 transition hover:bg-slate-50"
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>

        {/* Selected Invoice Details Column */}
        <div className="space-y-6">
          {/* Status/Counts Summary Card */}
          {creationStats && (
            <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm space-y-4">
              <h3 className="font-semibold text-slate-800 text-xs uppercase tracking-wider text-slate-400">Invoice & Payout Overview</h3>
              <div className="grid grid-cols-2 gap-3">
                <div className="p-3 bg-slate-50 rounded-lg text-center border border-slate-100">
                  <span className="block text-[10px] text-slate-500 font-semibold uppercase">Pending Approval</span>
                  <strong className="text-lg text-amber-600 mt-1 block font-bold">{creationStats.pendingApproval}</strong>
                </div>
                <div className="p-3 bg-slate-50 rounded-lg text-center border border-slate-100">
                  <span className="block text-[10px] text-slate-500 font-semibold uppercase">Rejected Requests</span>
                  <strong className="text-lg text-rose-600 mt-1 block font-bold">{creationStats.rejected}</strong>
                </div>
                <div className="p-3 bg-slate-50 rounded-lg text-center border border-slate-100">
                  <span className="block text-[10px] text-slate-500 font-semibold uppercase">Matched & Approved</span>
                  <strong className="text-lg text-blue-600 mt-1 block font-bold">{creationStats.matchedApproved}</strong>
                </div>
                <div className="p-3 bg-slate-50 rounded-lg text-center border border-slate-100">
                  <span className="block text-[10px] text-slate-500 font-semibold uppercase">Already Paid</span>
                  <strong className="text-lg text-emerald-600 mt-1 block font-bold">{creationStats.alreadyPaid}</strong>
                </div>
              </div>
              <div className="p-3 bg-blue-50/50 border border-blue-100 rounded-lg flex items-center justify-between">
                <span className="text-xs text-blue-800 font-semibold">Eligible for Payment:</span>
                <strong className="text-sm bg-blue-600 text-white px-2.5 py-0.5 rounded-full font-bold">{creationStats.eligibleForPayment}</strong>
              </div>
            </div>
          )}

          {selectedInvoice ? (
            <>
              {/* Validation Cards */}
              <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm space-y-4">
                <h3 className="font-semibold text-slate-900 text-sm uppercase tracking-wider text-slate-500">Validation Checks</h3>
                
                {/* 3-Way Matching Check */}
                <div className="flex items-start gap-3 p-3 rounded-lg bg-slate-50">
                  {(selectedInvoice.threeWayMatchStatus || "").toUpperCase() === "MATCHED" ? (
                    <CheckCircle className="text-emerald-600 mt-0.5" size={18} />
                  ) : (
                    <AlertCircle className="text-rose-600 mt-0.5" size={18} />
                  )}
                  <div>
                    <span className="block text-sm font-medium text-slate-900">Three-Way Matching Status</span>
                    <strong className={`text-xs uppercase px-2 py-0.5 rounded-full inline-block mt-1 ${
                      (selectedInvoice.threeWayMatchStatus || "").toUpperCase() === "MATCHED" 
                        ? "bg-emerald-100 text-emerald-800" 
                        : "bg-rose-100 text-rose-800"
                    }`}>
                      {selectedInvoice.threeWayMatchStatus || "UNMATCHED"}
                    </strong>
                    {(selectedInvoice.threeWayMatchStatus || "").toUpperCase() !== "MATCHED" && (
                      <p className="text-xs text-rose-600 mt-1.5 font-medium">
                        Payment blocked. Three-Way Matching must be MATCHED.
                      </p>
                    )}
                  </div>
                </div>

                {/* Bank Check */}
                <div className="flex items-start gap-3 p-3 rounded-lg bg-slate-50">
                  {selectedInvoice.vendorBankAccountNo ? (
                    <CheckCircle className="text-emerald-600 mt-0.5" size={18} />
                  ) : (
                    <AlertCircle className="text-rose-600 mt-0.5" size={18} />
                  )}
                  <div>
                    <span className="block text-sm font-medium text-slate-900">Vendor Bank Details</span>
                    <span className="text-xs text-slate-500 mt-0.5 block">
                      {selectedInvoice.vendorBankAccountNo 
                        ? `Bank Master complete.` 
                        : "Vendor information is incomplete. Please complete the Vendor Master before creating payment."
                      }
                    </span>
                  </div>
                </div>
              </div>

              {/* Financial Summary */}
              <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm space-y-4">
                <h3 className="font-semibold text-slate-900 text-sm uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
                  <Receipt size={16} /> Invoice Summary
                </h3>
                <div className="space-y-2.5 text-sm">
                  <div className="flex justify-between">
                    <span className="text-slate-500">Invoice Number:</span>
                    <strong className="text-slate-800">{selectedInvoice.invoiceNumber}</strong>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">Invoice Date:</span>
                    <span className="text-slate-800">{selectedInvoice.invoiceDate ? new Date(selectedInvoice.invoiceDate).toLocaleDateString() : "-"}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">Due Date:</span>
                    <span className="text-slate-800">{selectedInvoice.dueDate ? new Date(selectedInvoice.dueDate).toLocaleDateString() : "-"}</span>
                  </div>
                  <hr className="border-slate-100" />
                  <div className="flex justify-between">
                    <span className="text-slate-500">Invoice Total:</span>
                    <span className="font-medium text-slate-900">₹ {Number(selectedInvoice.invoiceTotal || selectedInvoice.amount).toLocaleString('en-IN')}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">Paid Till Date:</span>
                    <span className="text-slate-600">₹ {Number(selectedInvoice.paidAmount || 0).toLocaleString('en-IN')}</span>
                  </div>
                  <hr className="border-slate-100" />
                  <div className="flex justify-between bg-blue-50/50 p-2 rounded-lg">
                    <span className="text-blue-900 font-semibold">Remaining Payable:</span>
                    <span className="font-bold text-blue-900">₹ {Number(selectedInvoice.outstandingAmount || selectedInvoice.invoiceTotal).toLocaleString('en-IN')}</span>
                  </div>
                </div>
              </div>

              {/* Vendor Bank Panel */}
              <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm space-y-4">
                <h3 className="font-semibold text-slate-900 text-sm uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
                  <User size={16} /> Vendor & Bank Info
                </h3>
                <div className="space-y-3 text-sm">
                  <div>
                    <span className="block text-xs text-slate-400">Vendor Name & Code:</span>
                    <strong className="text-slate-800">{selectedInvoice.vendor} ({selectedInvoice.vendorCode || "N/A"})</strong>
                  </div>
                  <div>
                    <span className="block text-xs text-slate-400">GST Registration No:</span>
                    <span className="text-slate-700">{selectedInvoice.gstNumber || "N/A"}</span>
                  </div>
                  <hr className="border-slate-100" />
                  <div>
                    <span className="block text-xs text-slate-400">Bank Name:</span>
                    <strong className="text-slate-800">{selectedInvoice.vendorBankName || "-"}</strong>
                  </div>
                  <div>
                    <span className="block text-xs text-slate-400">Account Number:</span>
                    <strong className="text-slate-800">{selectedInvoice.vendorBankAccountNo || "-"}</strong>
                  </div>
                  <div>
                    <span className="block text-xs text-slate-400">IFSC & Branch:</span>
                    <span className="text-slate-700">{selectedInvoice.vendorIfscCode} — {selectedInvoice.vendorBankBranch || "-"}</span>
                  </div>
                </div>
              </div>

              {/* Purchase Order & DC Panel */}
              <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm space-y-4">
                <h3 className="font-semibold text-slate-900 text-sm uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
                  <ShoppingBag size={16} /> PO & Receipts
                </h3>
                <div className="space-y-3 text-sm">
                  <div className="flex justify-between">
                    <div>
                      <span className="block text-xs text-slate-400">PO Number:</span>
                      <strong className="text-slate-800">{selectedInvoice.poNumber || "-"}</strong>
                    </div>
                    <div className="text-right">
                      <span className="block text-xs text-slate-400">PO Total:</span>
                      <strong className="text-slate-800">₹ {Number(selectedInvoice.purchaseOrderAmount || 0).toLocaleString('en-IN')}</strong>
                    </div>
                  </div>
                  <div className="flex justify-between">
                    <div>
                      <span className="block text-xs text-slate-400">GRN Receipt No:</span>
                      <strong className="text-slate-800">{selectedInvoice.grnNumber || "Pending"}</strong>
                    </div>
                    <div className="text-right">
                      <span className="block text-xs text-slate-400">Delivery Challan:</span>
                      <strong className="text-slate-800">{selectedInvoice.deliveryChallanNumber || "Pending"}</strong>
                    </div>
                  </div>
                </div>
              </div>
            </>
          ) : (
            <div className="rounded-xl border-2 border-dashed border-slate-200 bg-slate-50/50 p-8 text-center text-slate-400">
              {isStoreContinuation ? "Loading payment plan details..." : "Select an approved invoice to view summary, bank details, and validation checks."}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default PaymentCreate;
