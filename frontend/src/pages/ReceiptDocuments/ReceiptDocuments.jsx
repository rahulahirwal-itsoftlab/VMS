import { useEffect, useMemo, useState } from "react";
import { ClipboardCheck, FileText, RefreshCw, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { getPurchaseOrders } from "../../services/purchaseOrderServices";
import LoadingSpinner from "../../components/common/LoadingSpinner";
import FilterSelect from "../../components/common/FilterSelect";
import DateInput from "../../components/common/DateInput";
import {
  createDeliveryChallan,
  createGRN,
  deleteDeliveryChallan,
  deleteGRN,
  getDeliveryChallansByPO,
  getGRNsByPO,
} from "../../services/matchingService";

const input = "h-11 w-full rounded-lg border border-slate-300 dark:border-slate-800 bg-white dark:bg-slate-950 px-3 text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 outline-none transition focus:border-blue-600 dark:focus:border-blue-500 focus:ring-2 focus:ring-blue-100 dark:focus:ring-blue-900/25";
const area = "min-h-24 w-full rounded-lg border border-slate-300 dark:border-slate-800 bg-white dark:bg-slate-950 px-3 py-2 text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 outline-none transition focus:border-blue-600 dark:focus:border-blue-500 focus:ring-2 focus:ring-blue-100 dark:focus:ring-blue-900/25";
const money = (value) => `Rs. ${Number(value || 0).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
const today = () => new Date().toISOString().slice(0, 10);
const valueOrNA = (value) => (value === null || value === undefined || value === "" ? "Not Available" : value);
const moneyOrNA = (value) => (value === null || value === undefined || value === "" ? "Not Available" : money(value));
const itemQuantity = (item, isGRN) => (
  isGRN
    ? item.receivedQuantity ?? item.received_quantity ?? item.quantity
    : item.deliveredQuantity ?? item.delivered_quantity ?? item.quantity
);

const normalizeItems = (po, quantityKey) => (po?.items || []).map((item) => ({
  poItemId: item.poItemId || item.id || item.itemId || item.item_id || null,
  itemCode: item.itemCode || item.item_code || item.code || item.sku || null,
  itemName: item.itemName || item.item_name || "Item",
  description: item.description || "",
  quantity: Number(item.quantity || 0),
  [quantityKey]: Number(item.quantity || 0),
  unit: item.unit || item.uom || null,
  unitPrice: Number(item.unitPrice || item.rate || 0),
  gstAmount: Number(item.gstAmount || 0),
  lineTotal: Number(item.lineTotal || 0),
}));

const ReceiptDocuments = () => {
  const [purchaseOrders, setPurchaseOrders] = useState([]);
  const [selectedPOId, setSelectedPOId] = useState("");
  const [deliveryChallans, setDeliveryChallans] = useState([]);
  const [grns, setGrns] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    deliveryDate: today(),
    deliveryAddress: "",
    transporter: "",
    vehicleNumber: "",
    driverName: "",
    driverContact: "",
    receiverName: "",
    remarks: "",
  });

  const selectedPO = useMemo(() => purchaseOrders.find((po) => po.id === selectedPOId), [purchaseOrders, selectedPOId]);

  const loadPOs = async () => {
    setLoading(true);
    try {
      const data = await getPurchaseOrders();
      setPurchaseOrders(data);
      if (!selectedPOId && data[0]) setSelectedPOId(data[0].id);
    } catch (err) {
      toast.error(err?.response?.data?.message || "Failed to load purchase orders");
    } finally {
      setLoading(false);
    }
  };

  const loadDocuments = async (poId) => {
    if (!poId) return;
    try {
      const [dc, receiptNotes] = await Promise.all([getDeliveryChallansByPO(poId), getGRNsByPO(poId)]);
      setDeliveryChallans(dc);
      setGrns(receiptNotes);
    } catch (err) {
      toast.error(err?.response?.data?.message || "Failed to load receipt documents");
    }
  };

  useEffect(() => {
    loadPOs();
  }, []);

  useEffect(() => {
    loadDocuments(selectedPOId);
  }, [selectedPOId]);

  useEffect(() => {
    if (selectedPO) {
      setForm((prev) => ({
        ...prev,
        deliveryAddress: prev.deliveryAddress || selectedPO.deliveryAddress || "",
      }));
    }
  }, [selectedPO]);

  const handleChange = (event) => {
    const { name, value } = event.target;
    setForm((prev) => ({ ...prev, [name]: value }));
  };

  const createDC = async () => {
    if (!selectedPO) return;
    setSaving(true);
    try {
      await createDeliveryChallan({
        purchaseOrderId: selectedPO.id,
        deliveryDate: form.deliveryDate,
        deliveryAddress: form.deliveryAddress,
        transporter: form.transporter,
        vehicleNumber: form.vehicleNumber,
        driverName: form.driverName,
        driverContact: form.driverContact,
        deliveryStatus: "CREATED",
        totalAmount: selectedPO.amount,
        lineItems: normalizeItems(selectedPO, "deliveredQuantity"),
        remarks: form.remarks,
      });
      toast.success("Delivery Challan created");
      await loadDocuments(selectedPO.id);
    } catch (err) {
      toast.error(err?.response?.data?.message || "Delivery Challan creation failed");
    } finally {
      setSaving(false);
    }
  };

  const createReceiptNote = async () => {
    if (!selectedPO) return;
    const latestChallan = deliveryChallans[0];
    if (!latestChallan) {
      toast.error("Delivery Challan missing. Create a Delivery Challan before GRN.");
      return;
    }
    if (!form.receiverName.trim()) {
      toast.error("Received By is required.");
      return;
    }
    setSaving(true);
    try {
      await createGRN({
        purchaseOrderId: selectedPO.id,
        deliveryChallanId: latestChallan.id,
        deliveryChallanNo: latestChallan.delivery_challan_number,
        deliveryDate: form.deliveryDate,
        receiptDate: form.deliveryDate,
        receiverName: form.receiverName,
        receivedBy: form.receiverName,
        totalAmount: selectedPO.amount,
        lineItems: normalizeItems(selectedPO, "receivedQuantity").map((item) => ({
          ...item,
          acceptedQuantity: item.receivedQuantity,
          rejectedQuantity: 0,
        })),
        remarks: form.remarks,
      });
      toast.success("Goods Receipt Note created");
      await loadDocuments(selectedPO.id);
    } catch (err) {
      toast.error(err?.response?.data?.message || "GRN creation failed");
    } finally {
      setSaving(false);
    }
  };

  const removeDC = async (id) => {
    await deleteDeliveryChallan(id);
    toast.success("Delivery Challan deleted");
    await loadDocuments(selectedPOId);
  };

  const removeGRN = async (id) => {
    await deleteGRN(id);
    toast.success("GRN deleted");
    await loadDocuments(selectedPOId);
  };

  if (loading) {
    return (
      <div className="flex h-96 items-center justify-center">
        <LoadingSpinner size="lg" text="Loading receipt documents..." />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold text-slate-950 dark:text-slate-100">Receipt Documents</h1>
          <p className="mt-1 text-slate-500 dark:text-slate-400">Create Delivery Challans and Goods Receipt Notes from live Purchase Orders.</p>
        </div>
        <button type="button" onClick={() => loadDocuments(selectedPOId)} className="inline-flex h-10 items-center gap-2 rounded-xl border border-slate-200 dark:border-slate-800 px-4 text-sm font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-900">
          <RefreshCw size={16} /> Refresh
        </button>
      </div>

      <section className="rounded-2xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 shadow-sm">
        <label className="block">
          <span className="mb-2 block text-sm font-semibold text-slate-700 dark:text-slate-200">Purchase Order</span>
          <FilterSelect
            value={selectedPOId}
            onChange={setSelectedPOId}
            options={[
              { value: "", label: "Select Purchase Order" },
              ...purchaseOrders.map((po) => ({
                value: po.id,
                label: `${po.poNumber} | ${po.vendor || "Vendor missing"} | ${money(po.amount)}`,
              })),
            ]}
            placeholder="Select Purchase Order"
            ariaLabel="Purchase order selector"
          />
        </label>
        {selectedPO && (
          <div className="mt-4 grid gap-4 rounded-lg bg-slate-50 dark:bg-slate-900/40 p-4 md:grid-cols-4 border border-slate-100 dark:border-slate-800/60 text-slate-900 dark:text-slate-100">
            <div><span className="text-xs font-semibold uppercase text-slate-500 dark:text-slate-400">Vendor</span><p className="font-semibold">{selectedPO.vendor}</p></div>
            <div><span className="text-xs font-semibold uppercase text-slate-500 dark:text-slate-400">PO Number</span><p className="font-semibold">{selectedPO.poNumber}</p></div>
            <div><span className="text-xs font-semibold uppercase text-slate-500 dark:text-slate-400">Items</span><p className="font-semibold">{selectedPO.items.length}</p></div>
            <div><span className="text-xs font-semibold uppercase text-slate-500 dark:text-slate-400">Grand Total</span><p className="font-semibold">{money(selectedPO.amount)}</p></div>
          </div>
        )}
      </section>

      {selectedPO && (
        <div className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
          <section className="rounded-2xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 shadow-sm">
            <h2 className="mb-4 text-lg font-bold text-slate-950 dark:text-slate-100">Document Details</h2>
            <div className="grid gap-4 md:grid-cols-2">
              <label>
                <span className="mb-2 block text-sm font-semibold text-slate-700 dark:text-slate-200">Delivery / Receipt Date</span>
                <DateInput name="deliveryDate" value={form.deliveryDate} onChange={(nextValue) => handleChange({ target: { name: "deliveryDate", value: nextValue } })} ariaLabel="Delivery or receipt date" />
              </label>
              <label><span className="mb-2 block text-sm font-semibold text-slate-700 dark:text-slate-200">Received By</span><input name="receiverName" value={form.receiverName} onChange={handleChange} className={input} /></label>
              <label className="md:col-span-2"><span className="mb-2 block text-sm font-semibold text-slate-700 dark:text-slate-200">Delivery Address</span><input name="deliveryAddress" value={form.deliveryAddress} onChange={handleChange} className={input} /></label>
              <label><span className="mb-2 block text-sm font-semibold text-slate-700 dark:text-slate-200">Transporter</span><input name="transporter" value={form.transporter} onChange={handleChange} className={input} /></label>
              <label><span className="mb-2 block text-sm font-semibold text-slate-700 dark:text-slate-200">Vehicle Number</span><input name="vehicleNumber" value={form.vehicleNumber} onChange={handleChange} className={input} /></label>
              <label><span className="mb-2 block text-sm font-semibold text-slate-700 dark:text-slate-200">Driver Name</span><input name="driverName" value={form.driverName} onChange={handleChange} className={input} /></label>
              <label><span className="mb-2 block text-sm font-semibold text-slate-700 dark:text-slate-200">Driver Contact</span><input name="driverContact" value={form.driverContact} onChange={handleChange} className={input} /></label>
              <label className="md:col-span-2"><span className="mb-2 block text-sm font-semibold text-slate-700 dark:text-slate-200">Remarks</span><textarea name="remarks" value={form.remarks} onChange={handleChange} className={area} /></label>
            </div>
            <div className="mt-5 flex flex-wrap gap-3">
              <button type="button" disabled={saving} onClick={createDC} className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white">Create Delivery Challan</button>
              <button type="button" disabled={saving || !deliveryChallans.length} onClick={createReceiptNote} className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white disabled:bg-slate-300">Create GRN</button>
            </div>
          </section>

          <section className="rounded-2xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 shadow-sm">
            <h2 className="mb-4 text-lg font-bold text-slate-900 dark:text-white font-heading">PO Items</h2>
            <div className="space-y-3">
              {selectedPO.items.map((item, index) => (
                <article key={`${item.itemName}-${index}`} className="rounded-xl border border-slate-200/80 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/60 p-3.5">
                  <p className="font-semibold text-slate-900 dark:text-slate-100">{item.itemName}</p>
                  <p className="text-sm text-slate-500 dark:text-slate-400">{item.description}</p>
                  <div className="mt-2 grid grid-cols-3 gap-2 text-sm">
                    <span>Qty: <strong>{item.quantity}</strong></span>
                    <span>Rate: <strong>{money(item.unitPrice || item.rate)}</strong></span>
                    <span>Total: <strong>{money(item.lineTotal)}</strong></span>
                  </div>
                </article>
              ))}
            </div>
          </section>
        </div>
      )}

      <div className="grid gap-6 xl:grid-cols-2">
        <DocumentList title="Delivery Challans" icon={FileText} records={deliveryChallans} numberKey="delivery_challan_number" dateKey="delivery_date" onDelete={removeDC} purchaseOrder={selectedPO} />
        <DocumentList title="Goods Receipt Notes" icon={ClipboardCheck} records={grns} numberKey="grn_number" dateKey="receipt_date" onDelete={removeGRN} isGRN={true} purchaseOrder={selectedPO} />
      </div>
    </div>
  );
};

const normalizeItemKey = (value) => String(value || "").trim().replace(/\s+/g, " ").toLowerCase();
const itemKeys = (item = {}) => [
  item.poItemId,
  item.id,
  item.itemId,
  item.item_id,
  item.itemCode,
  item.item_code,
  item.code,
  item.sku,
  item.itemName,
  item.item_name,
  item.name,
  item.description,
].map(normalizeItemKey).filter(Boolean);
const findPOItem = (poItems = [], receiptItem = {}) => {
  const receiptKeys = new Set(itemKeys(receiptItem));
  return poItems.find((item) => itemKeys(item).some((key) => receiptKeys.has(key))) || null;
};

const DocumentList = ({ title, icon: Icon, records, numberKey, dateKey, onDelete, isGRN = false, purchaseOrder = null }) => (
  <section className="rounded-2xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 shadow-sm">
    <h2 className="mb-4 flex items-center gap-2 text-lg font-bold text-slate-900 dark:text-white font-heading"><Icon size={18} className="text-[#0090B8] dark:text-[#00E5FF]" /> {title}</h2>
    <div className="space-y-3">
      {records.map((record) => (
        <article key={record.id} className="rounded-xl border border-slate-200/80 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/60 p-4">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="font-bold text-[#0090B8] dark:text-[#00E5FF]">{record[numberKey]}</p>
              <p className="text-sm text-slate-500 dark:text-slate-400">{record.vendor_name || record.vendor?.name || "Vendor"} | {record[dateKey] ? new Date(record[dateKey]).toLocaleDateString("en-IN") : "Date pending"}</p>
              <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">{record.items?.length || record.line_items?.length || 0} items</p>
            </div>
          <div className="flex items-center gap-2">
            {isGRN && (
              <a
                href={`/invoices/create?poId=${record.purchase_order_id || ""}&grnId=${record.id || ""}`}
                className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-blue-700"
              >
                <FileText size={14} /> Create Invoice
              </a>
            )}
            <button type="button" onClick={() => onDelete(record.id)} className="rounded-lg border border-red-200 dark:border-red-800/80 p-2 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/30" aria-label={`Delete ${record[numberKey]}`}>
              <Trash2 size={16} />
            </button>
          </div>
          </div>
          <div className="mt-4 overflow-x-auto rounded-lg border border-slate-100 dark:border-slate-800">
            <table className="w-full min-w-[640px] text-left text-xs">
              <thead className="bg-slate-50 text-slate-500 dark:bg-slate-900/60 dark:text-slate-400">
                <tr>
                  <th className="px-3 py-2 font-semibold">Item Name</th>
                  <th className="px-3 py-2 font-semibold">Item Code</th>
                  <th className="px-3 py-2 text-right font-semibold">Quantity</th>
                  <th className="px-3 py-2 font-semibold">Unit</th>
                  <th className="px-3 py-2 text-right font-semibold">Unit Price</th>
                  <th className="px-3 py-2 text-right font-semibold">Tax</th>
                  <th className="px-3 py-2 text-right font-semibold">Total</th>
                </tr>
              </thead>
              <tbody>
                {(record.items || record.line_items || []).map((item, index) => {
                  const poItem = findPOItem(purchaseOrder?.items || [], item);
                  return (
                    <tr key={`${record.id}-${item.id || index}`} className="border-t border-slate-100 dark:border-slate-800 text-slate-700 dark:text-slate-200">
                      <td className="px-3 py-2 font-medium">{item.itemName || item.item_name || item.name || poItem?.itemName || "Item"}</td>
                      <td className="px-3 py-2">{valueOrNA(item.itemCode || item.item_code || poItem?.itemCode)}</td>
                      <td className="px-3 py-2 text-right font-semibold">{valueOrNA(itemQuantity(item, isGRN))}</td>
                      <td className="px-3 py-2">{valueOrNA(item.unit || item.uom || poItem?.unit)}</td>
                      <td className="px-3 py-2 text-right">{moneyOrNA(item.unitPrice ?? item.unit_price ?? item.rate ?? poItem?.unitPrice)}</td>
                      <td className="px-3 py-2 text-right">{moneyOrNA(item.gstAmount ?? item.gst_amount ?? item.taxAmount ?? item.tax_amount ?? poItem?.gstAmount)}</td>
                      <td className="px-3 py-2 text-right">{moneyOrNA(item.lineTotal ?? item.line_total ?? item.total ?? poItem?.lineTotal)}</td>
                    </tr>
                  );
                })}
                {!(record.items || record.line_items || []).length && (
                  <tr>
                    <td colSpan={7} className="px-3 py-5 text-center text-slate-500 dark:text-slate-400">No item details available.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </article>
      ))}
      {!records.length && <p className="rounded-lg border border-dashed border-slate-200 dark:border-slate-800 p-6 text-center text-sm text-slate-500 dark:text-slate-400">No records created.</p>}
    </div>
  </section>
);

export default ReceiptDocuments;
