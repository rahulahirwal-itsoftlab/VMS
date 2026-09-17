import { THREE_WAY_MATCH_STATUS } from '../../utils/approval-helper.js';

const isMissing = (value) => value === undefined || value === null || value === '';
const toNumber = (value) => {
  if (isMissing(value)) return 0;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : 0;
};
const toNullableNumber = (value) => {
  if (isMissing(value)) return null;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
};
const addNullable = (current, value) => {
  const numeric = toNullableNumber(value);
  if (numeric === null) return current;
  return (current ?? 0) + numeric;
};
const norm = (value) => String(value || '').trim().toLowerCase();
const money = (value) => Math.round(toNumber(value) * 100) / 100;
const sameMoney = (a, b) => !isMissing(a) && !isMissing(b) && Math.abs(money(a) - money(b)) <= 0.01;
const matchingDebugEnabled = () => process.env.NODE_ENV !== 'production' || process.env.DEBUG_INVOICE_FLOW === 'true';
const matchingLogLabel = {
  purchase_order: '[3WAY MATCH] PO comparison',
  goods_receipt_note: '[3WAY MATCH] GRN comparison',
  delivery_challan: '[3WAY MATCH] Delivery Challan comparison',
  item: '[3WAY MATCH] Item comparison',
  quantity: '[3WAY MATCH] Quantity comparison',
  unit_price: '[3WAY MATCH] Price comparison',
  taxable_amount: '[3WAY MATCH] Taxable amount comparison',
  gst: '[3WAY MATCH] Tax comparison',
  amount: '[3WAY MATCH] Total comparison',
  line_total: '[3WAY MATCH] Total comparison',
  grn_amount: '[3WAY MATCH] Total comparison',
  delivery_challan_amount: '[3WAY MATCH] Total comparison',
};
const logMatchingDetail = (detail) => {
  if (!matchingDebugEnabled()) return;
  console.info(matchingLogLabel[detail.field] || `[3WAY MATCH] ${detail.label} comparison`, {
    field: detail.field,
    status: detail.status,
    poValue: detail.poValue ?? null,
    grnValue: detail.grnValue ?? null,
    deliveryChallanValue: detail.deliveryChallanValue ?? null,
    invoiceValue: detail.invoiceValue ?? null,
    difference: detail.difference ?? null,
    reason: detail.reason,
  });
};

const asArray = (value) => {
  if (Array.isArray(value)) return value;
  if (!value) return [];
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
  return [];
};

const stableItemKey = (item = {}) => norm(
  item.poItemId
  || item.po_item_id
  || item.itemId
  || item.item_id
  || item.productId
  || item.product_id
  || item.itemCode
  || item.item_code
  || item.sku
  || item.productCode
  || item.product_code,
);
const fallbackItemKey = (item = {}) => norm(item.itemName || item.item_name || item.name || item.description);
const itemIdentity = (item = {}) => {
  const stable = stableItemKey(item);
  if (stable) return { key: stable, type: 'stable' };
  const fallback = fallbackItemKey(item);
  return fallback ? { key: fallback, type: 'name' } : { key: '', type: 'missing' };
};
const getItemFromIndex = (index, invoiceItem) => {
  const identity = itemIdentity(invoiceItem);
  if (!identity.key) return null;
  return identity.type === 'stable'
    ? index.stable.get(identity.key) || null
    : index.name.get(identity.key) || null;
};

const mapItems = (items) => {
  const stable = new Map();
  const name = new Map();
  for (const item of asArray(items)) {
    const stableKey = stableItemKey(item);
    const nameKey = fallbackItemKey(item);
    const key = stableKey || nameKey;
    if (!key) continue;
    const targetMap = stableKey ? stable : name;
    const existing = targetMap.get(key) || {
      itemName: item.itemName || item.item_name || item.name || '',
      itemCode: item.itemCode || item.item_code || item.sku || '',
      description: item.description || '',
      hsnCode: item.hsnCode || item.hsn_code || '',
      unit: item.unit || item.uom || '',
      quantity: null,
      receivedQuantity: null,
      deliveredQuantity: null,
      unitPrice: toNumber(item.unitPrice || item.unit_price || item.rate),
      cgst: 0,
      sgst: 0,
      igst: 0,
      gstAmount: 0,
      taxableAmount: 0,
      lineTotal: 0,
    };

    existing.quantity = addNullable(existing.quantity, item.quantity ?? item.qty);
    existing.receivedQuantity = addNullable(existing.receivedQuantity, item.receivedQuantity ?? item.received_quantity ?? item.quantity ?? item.qty);
    existing.deliveredQuantity = addNullable(existing.deliveredQuantity, item.deliveredQuantity ?? item.delivered_quantity ?? item.quantity ?? item.qty);
    existing.cgst += toNumber(item.cgst || item.cgstAmount || item.cgst_amount);
    existing.sgst += toNumber(item.sgst || item.sgstAmount || item.sgst_amount);
    existing.igst += toNumber(item.igst || item.igstAmount || item.igst_amount);
    existing.gstAmount += toNumber(item.gstAmount || item.gst_amount || item.taxAmount || item.tax_amount);
    existing.taxableAmount += toNumber(item.taxableAmount || item.taxable_amount || item.amountBeforeTax || item.amount_before_tax || (toNumber(item.quantity || item.qty) * toNumber(item.unitPrice || item.unit_price || item.rate)));
    existing.lineTotal += toNumber(item.lineTotal || item.line_total || item.total || item.amount);
    targetMap.set(key, existing);
    if (stableKey && nameKey && !name.has(nameKey)) {
      name.set(nameKey, existing);
    }
  }
  return { stable, name };
};

const documentSnapshot = ({ invoice, po, grn, deliveryChallan }) => ({
  purchaseOrder: {
    id: po.id,
    poNumber: po.po_number,
    vendorName: po.vendor?.name || '',
    vendorCode: po.vendor?.vendor_code || '',
    poDate: po.order_date,
    grandTotal: money(po.amount),
    gstAmount: money(po.gst_amount || po.tax_summary?.gstAmount),
    items: asArray(po.line_items),
  },
  goodsReceiptNote: grn ? {
    id: grn.id,
    grnNumber: grn.grn_number,
    receivedDate: grn.delivery_date,
    remarks: grn.remarks,
    grandTotal: money(grn.total_amount),
    gstAmount: money(grn.gst_amount),
    items: asArray(grn.line_items),
  } : null,
  deliveryChallan: deliveryChallan ? {
    id: deliveryChallan.id,
    deliveryChallanNumber: deliveryChallan.delivery_challan_number,
    deliveryDate: deliveryChallan.delivery_date,
    vehicleDetails: deliveryChallan.vehicle_details,
    remarks: deliveryChallan.remarks,
    vendorName: deliveryChallan.vendor_name || '',
    vendorCode: deliveryChallan.vendor_code || '',
    grandTotal: money(deliveryChallan.total_amount),
    gstAmount: money(deliveryChallan.gst_amount),
    items: asArray(deliveryChallan.line_items),
  } : null,
  invoice: {
    id: invoice.id,
    invoiceNumber: invoice.invoice_number,
    invoiceDate: invoice.invoice_date,
    vendorName: invoice.vendor?.name || '',
    vendorCode: invoice.vendor?.vendor_code || '',
    grandTotal: money(invoice.invoice_total || invoice.amount),
    gstAmount: money(invoice.tax_summary?.gstAmount),
    items: asArray(invoice.line_items),
  },
});

const diff = (invoiceValue, comparisonValue) => {
  if (isMissing(invoiceValue) || isMissing(comparisonValue)) return null;
  const invoiceNumber = Number(invoiceValue);
  const comparisonNumber = Number(comparisonValue);
  return Number.isFinite(invoiceNumber) && Number.isFinite(comparisonNumber)
    ? money(comparisonNumber - invoiceNumber)
    : null;
};

const comparisonDetail = ({
  field,
  ok,
  reason,
  poValue,
  grnValue,
  invoiceValue,
  deliveryChallanValue = undefined,
  notFound = false,
  pending = false,
}) => ({
  field,
  label: field.replace(/_/g, ' '),
  status: pending || notFound ? 'PENDING' : ok ? 'MATCHED' : 'MISMATCH',
  reason: ok ? 'Matched against live database records.' : reason,
  po_value: poValue,
  grn_value: grnValue,
  delivery_challan_value: deliveryChallanValue,
  invoice_value: invoiceValue,
  poValue,
  grnValue,
  deliveryChallanValue,
  invoiceValue,
  difference: diff(invoiceValue, grnValue ?? deliveryChallanValue ?? poValue),
});

const aggregateStatus = (details) => {
  if (!details.length) return 'PENDING';
  const statuses = details.map((detail) => detail.status);
  if (statuses.every((status) => status === 'MATCHED')) return 'MATCHED';
  if (statuses.some((status) => status === 'MISMATCH')) return 'MISMATCH';
  if (statuses.some((status) => status === 'PENDING')) return 'PENDING';
  return 'MISMATCH';
};

const aggregateDetails = (results, fields, label) => {
  const grouped = results.filter((item) => fields.includes(item.field));
  if (!grouped.length) {
    return {
      field: fields[0],
      label,
      status: 'PENDING',
      reason: 'Matching check was not completed.',
    };
  }

  const status = aggregateStatus(grouped);
  const failures = grouped.filter((item) => item.status !== 'MATCHED');
  const first = failures[0] || grouped[0];
  return {
    ...first,
    field: fields[0],
    label,
    status,
    reason: status === 'MATCHED'
      ? 'Matched against live database records.'
      : failures.map((item) => item.reason).filter(Boolean).join(' ') || first.reason,
    matchedCount: grouped.filter((item) => item.status === 'MATCHED').length,
    totalCount: grouped.length,
    details: grouped,
  };
};

export const compareThreeWayDocuments = ({ invoice, purchaseOrder, grn, deliveryChallan }) => {
  const po = purchaseOrder;
  const poItems = mapItems(po?.line_items || po?.items);
  const grnItems = mapItems(grn?.line_items || grn?.items);
  const challanItems = mapItems(deliveryChallan?.line_items || deliveryChallan?.items);
  const invoiceItems = mapItems(invoice.line_items || invoice.items);
  const unmatched = [];
  const matched = [];
  const results = [];
  const warnings = [];

  const check = (field, ok, reason, poValue, grnValue, invoiceValue, deliveryChallanValue = undefined, options = {}) => {
    const detail = comparisonDetail({
      field,
      ok,
      reason,
      poValue,
      grnValue,
      invoiceValue,
      deliveryChallanValue,
      notFound: options.notFound,
      pending: options.pending,
    });
    results.push(detail);
    logMatchingDetail(detail);
    if (detail.status === 'MATCHED') matched.push(field);
    else unmatched.push(detail);
    return detail;
  };

  check(
    'purchase_order',
    Boolean(po?.id) && invoice.purchase_order_id === po.id,
    'Purchase Order record not found or invoice is linked to a different Purchase Order.',
    po?.po_number,
    grn?.purchase_order?.po_number,
    invoice.purchase_order_id,
    deliveryChallan?.purchase_order?.po_number,
    { pending: !po?.id },
  );

  check(
    'vendor',
    Boolean(po?.vendor_id) && invoice.vendor_id === po.vendor_id && (!grn || grn.vendor_id === po.vendor_id) && (!deliveryChallan || deliveryChallan.vendor_id === po.vendor_id),
    'Vendor does not match across Purchase Order, Delivery Challan, GRN, and Invoice.',
    po?.vendor?.vendor_code,
    grn?.vendor_code,
    invoice.vendor?.vendor_code,
    deliveryChallan?.vendor_code,
  );

  check(
    'goods_receipt_note',
    Boolean(grn?.id),
    'GRN record not found.',
    po?.po_number,
    grn?.grn_number,
    invoice.invoice_number,
    deliveryChallan?.delivery_challan_number,
    { pending: !grn?.id },
  );

  check(
    'delivery_challan',
    Boolean(deliveryChallan?.id),
    'Delivery Challan is required and no Delivery Challan record was found.',
    po?.po_number,
    grn?.grn_number,
    invoice.invoice_number,
    deliveryChallan?.delivery_challan_number,
    { pending: !deliveryChallan?.id },
  );

  for (const rawInvoiceItem of asArray(invoice.line_items || invoice.items)) {
    const invoiceItem = getItemFromIndex(invoiceItems, rawInvoiceItem);
    if (!invoiceItem) {
      check('item', false, 'Invoice item is missing a stable identifier or normalized name.', null, null, rawInvoiceItem?.itemCode || rawInvoiceItem?.itemName || rawInvoiceItem?.description, null);
      continue;
    }
    const identity = itemIdentity(rawInvoiceItem);
    const poItem = getItemFromIndex(poItems, rawInvoiceItem);
    const grnItem = getItemFromIndex(grnItems, rawInvoiceItem);
    const challanItem = getItemFromIndex(challanItems, rawInvoiceItem);
    const itemLabel = invoiceItem.itemCode || invoiceItem.itemName || identity.key;
    check('item', Boolean(poItem), `Invoice item "${itemLabel}" is not present on the Purchase Order by ${identity.type === 'stable' ? 'stable item identifier' : 'normalized item name'}.`, poItem?.itemCode || poItem?.itemName, grnItem?.itemCode || grnItem?.itemName, invoiceItem.itemCode || invoiceItem.itemName, challanItem?.itemCode || challanItem?.itemName, { pending: !poItem });
    if (!poItem) continue;

    check('quantity', sameMoney(invoiceItem.quantity, poItem.quantity) && (!deliveryChallan || sameMoney(invoiceItem.quantity, challanItem?.deliveredQuantity)) && (!grn || sameMoney(invoiceItem.quantity, grnItem?.receivedQuantity)), 'Invoice quantity does not match Purchase Order, Delivery Challan, or GRN quantity.', poItem.quantity, grnItem?.receivedQuantity, invoiceItem.quantity, challanItem?.deliveredQuantity);
    check('unit_price', sameMoney(invoiceItem.unitPrice, poItem.unitPrice), 'Invoice unit price differs from Purchase Order.', poItem.unitPrice, grnItem?.unitPrice, invoiceItem.unitPrice, challanItem?.unitPrice);
    check('taxable_amount', sameMoney(invoiceItem.taxableAmount, poItem.taxableAmount), 'Invoice taxable amount differs from Purchase Order.', poItem.taxableAmount, grnItem?.taxableAmount, invoiceItem.taxableAmount, challanItem?.taxableAmount);
    check('gst', sameMoney(invoiceItem.gstAmount, poItem.gstAmount), 'GST differs from Purchase Order.', poItem.gstAmount, grnItem?.gstAmount, invoiceItem.gstAmount, challanItem?.gstAmount);
    check('line_total', sameMoney(invoiceItem.lineTotal, poItem.lineTotal), 'Invoice line amount differs from Purchase Order line amount.', poItem.lineTotal, grnItem?.lineTotal, invoiceItem.lineTotal, challanItem?.lineTotal);
  }

  for (const [key, poItem] of poItems.stable.entries()) {
    if (!invoiceItems.stable.has(key)) {
      warnings.push(`Purchase Order item "${poItem.itemName || key}" is not present on the Invoice.`);
    }
  }
  for (const [key, poItem] of poItems.name.entries()) {
    if (!invoiceItems.name.has(key) && !poItem.itemCode) {
      warnings.push(`Purchase Order item "${poItem.itemName || key}" is not present on the Invoice.`);
    }
  }

  const poAmount = money(po.amount);
  const grnAmount = money(grn?.total_amount);
  const challanAmount = money(deliveryChallan?.total_amount);
  const invoiceAmount = money(invoice.invoice_total || invoice.amount);
  check('amount', invoiceAmount <= poAmount && sameMoney(invoiceAmount, poAmount), 'Invoice amount exceeds or differs from Purchase Order.', poAmount, grnAmount, invoiceAmount);
  if (grn && grnAmount > 0) {
    check('grn_amount', sameMoney(invoiceAmount, grnAmount), 'Invoice amount differs from GRN amount.', poAmount, grnAmount, invoiceAmount);
  }
  if (deliveryChallan && challanAmount > 0) {
    check('delivery_challan_amount', sameMoney(invoiceAmount, challanAmount), 'Invoice amount differs from Delivery Challan amount.', poAmount, grnAmount, invoiceAmount, challanAmount);
  }

  const totalFields = Math.max(matched.length + unmatched.length, 1);
  const matchedCount = matched.length;
  const matchPercentage = Math.round((matchedCount / totalFields) * 10000) / 100;
  const varianceAmount = money(invoiceAmount - Math.min(poAmount, grnAmount || poAmount, challanAmount || poAmount));
  const status = unmatched.length === 0
    ? THREE_WAY_MATCH_STATUS.MATCHED
    : matched.length > 0
      ? THREE_WAY_MATCH_STATUS.PARTIAL_MATCH
      : THREE_WAY_MATCH_STATUS.MISMATCH;

  return {
    status,
    matched_fields: matched,
    unmatched_fields: unmatched,
    comparison_results: results,
    warnings,
    matched_fields_count: matchedCount,
    total_fields_count: totalFields,
    match_percentage: matchPercentage,
    approval_recommendation: status === THREE_WAY_MATCH_STATUS.MATCHED ? 'APPROVE' : status === THREE_WAY_MATCH_STATUS.PARTIAL_MATCH ? 'REVIEW' : 'REJECT',
    summary: {
      poAmount,
      grnAmount,
      deliveryChallanAmount: challanAmount,
      invoiceAmount,
      matchedAmount: status === THREE_WAY_MATCH_STATUS.MATCHED ? invoiceAmount : Math.max(0, invoiceAmount - Math.max(0, varianceAmount)),
      varianceAmount,
      variancePercentage: poAmount > 0 ? Math.round((Math.abs(varianceAmount) / poAmount) * 10000) / 100 : 0,
    },
    matching: {
      vendorMatch: aggregateDetails(results, ['vendor'], 'Vendor Match'),
      poMatch: aggregateDetails(results, ['purchase_order'], 'PO Match'),
      grnMatch: aggregateDetails(results, ['goods_receipt_note'], 'GRN Match'),
      deliveryChallanMatch: aggregateDetails(results, ['delivery_challan'], 'Delivery Challan Match'),
      itemMatch: aggregateDetails(results, ['item'], 'Item Match'),
      quantityMatch: aggregateDetails(results, ['quantity'], 'Quantity Match'),
      unitPriceMatch: aggregateDetails(results, ['unit_price'], 'Price Match'),
      taxMatch: aggregateDetails(results, ['gst'], 'Tax Match'),
      totalMatch: aggregateDetails(results, ['amount', 'taxable_amount', 'line_total', 'grn_amount', 'delivery_challan_amount'], 'Total Match'),
      overallStatus: status,
      matchingScore: matchPercentage,
    },
    snapshots: documentSnapshot({ invoice, po, grn, deliveryChallan }),
  };
};
