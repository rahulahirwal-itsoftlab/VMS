import PDFDocument from 'pdfkit';
import { COMPANY_CONFIG } from '../../config/company.js';

// ─── Utilities ────────────────────────────────────────────────────────────────

const safe = (v, fallback = 'Not Available') =>
  v !== null && v !== undefined && String(v).trim() !== '' ? String(v) : fallback;

const money = (value, cur = 'INR') =>
  `${cur} ${Number(value || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const fmtDate = (v) => {
  if (!v) return 'N/A';
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return 'N/A';
  return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
};

// ─── Amount in Words ──────────────────────────────────────────────────────────

const ones = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine',
  'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
const tens = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];

const convertHundreds = (n) => {
  if (n === 0) return '';
  if (n < 20) return ones[n] + ' ';
  if (n < 100) return tens[Math.floor(n / 10)] + (n % 10 ? ' ' + ones[n % 10] : '') + ' ';
  return ones[Math.floor(n / 100)] + ' Hundred ' + convertHundreds(n % 100);
};

const amountToWords = (amount, currency = 'INR') => {
  const num = Math.round(Number(amount || 0));
  if (num === 0) return 'Zero Only';

  let parts = [];
  let n = num;
  if (n >= 10000000) { parts.push(convertHundreds(Math.floor(n / 10000000)) + 'Crore'); n %= 10000000; }
  if (n >= 100000)   { parts.push(convertHundreds(Math.floor(n / 100000)) + 'Lakh'); n %= 100000; }
  if (n >= 1000)     { parts.push(convertHundreds(Math.floor(n / 1000)) + 'Thousand'); n %= 1000; }
  if (n > 0)         { parts.push(convertHundreds(n)); }

  const currName = currency === 'USD' ? 'Dollars' : currency === 'EUR' ? 'Euros' : 'Rupees';
  return parts.join(' ').replace(/\s+/g, ' ').trim() + ' ' + currName + ' Only';
};

// ─── Drawing Helpers ──────────────────────────────────────────────────────────

const COLORS = {
  black:      '#0f172a',
  darkGray:   '#334155',
  midGray:    '#64748b',
  lightGray:  '#94a3b8',
  border:     '#cbd5e1',
  rowEven:    '#f8fafc',
  rowOdd:     '#ffffff',
  headerBg:   '#1e293b',
  headerText: '#ffffff',
  accentBlue: '#1d4ed8',
  totalBg:    '#0f172a',
  totalText:  '#ffffff',
};

const MARGIN = 40;
const PAGE_W = 595.28;
const PAGE_H = 841.89;
const CONTENT_W = PAGE_W - MARGIN * 2;

/**
 * @param {PDFDocument} doc
 * @param {string} text
 * @param {number} x
 * @param {number} y
 * @param {object} opts  width, align, color, font, size, lineBreak
 */
const drawText = (doc, text, x, y, opts = {}) => {
  const {
    width = CONTENT_W,
    align = 'left',
    color = COLORS.black,
    font = 'Helvetica',
    size = 8,
    lineBreak = false,
  } = opts;
  doc.font(font).fontSize(size).fillColor(color).text(text, x, y, { width, align, lineBreak });
};

const hLine = (doc, y, color = COLORS.border, thickness = 0.5) => {
  doc.strokeColor(color).lineWidth(thickness).moveTo(MARGIN, y).lineTo(PAGE_W - MARGIN, y).stroke();
};

const vLine = (doc, x, y1, y2, color = COLORS.border) => {
  doc.strokeColor(color).lineWidth(0.5).moveTo(x, y1).lineTo(x, y2).stroke();
};

const rect = (doc, x, y, w, h, fillColor, strokeColor = null) => {
  doc.rect(x, y, w, h);
  if (fillColor) doc.fill(fillColor);
  if (strokeColor) { doc.strokeColor(strokeColor).lineWidth(0.5).stroke(); }
};

// ─── Section Label ────────────────────────────────────────────────────────────

const sectionLabel = (doc, label, y) => {
  doc.fillColor(COLORS.accentBlue).font('Helvetica-Bold').fontSize(7)
    .text(label.toUpperCase(), MARGIN, y, { width: CONTENT_W, characterSpacing: 0.5 });
  hLine(doc, y + 11, COLORS.accentBlue, 0.7);
  return y + 16;
};

// ─── Two-Column KV Row Helpers ─────────────────────────────────────────────────

const kvRow = (doc, label, value, x, y, lWidth = 90) => {
  doc.font('Helvetica').fontSize(7.5).fillColor(COLORS.midGray).text(label, x, y, { width: lWidth });
  doc.font('Helvetica-Bold').fontSize(7.5).fillColor(COLORS.black).text(safe(value), x + lWidth, y, { width: 120 });
};

// ─── Page Footer ─────────────────────────────────────────────────────────────

const drawPageFooter = (doc, poNumber, pageNum, totalPages) => {
  const y = PAGE_H - 28;
  hLine(doc, y - 5, COLORS.border);
  doc.font('Helvetica').fontSize(6.5).fillColor(COLORS.lightGray)
    .text(`Purchase Order: ${poNumber} | Page ${pageNum} of ${totalPages}`, MARGIN, y, { width: CONTENT_W, align: 'center' });
};

// ─── Table Helpers ────────────────────────────────────────────────────────────

// Column definitions (widths must sum to CONTENT_W = 515)
const COLS = [
  { key: 'sl',      label: '#',           width: 18,  align: 'center' },
  { key: 'code',    label: 'Item Code',   width: 50,  align: 'center' },
  { key: 'name',    label: 'Item Name',   width: 88,  align: 'left'   },
  { key: 'desc',    label: 'Description', width: 88,  align: 'left'   },
  { key: 'qty',     label: 'Qty',         width: 26,  align: 'center' },
  { key: 'unit',    label: 'Unit',        width: 26,  align: 'center' },
  { key: 'rate',    label: 'Unit Price',  width: 50,  align: 'right'  },
  { key: 'taxable', label: 'Taxable Amt', width: 50,  align: 'right'  },
  { key: 'gstPct',  label: 'GST%',        width: 24,  align: 'center' },
  { key: 'gstAmt',  label: 'GST Amt',     width: 48,  align: 'right'  },
  { key: 'total',   label: 'Line Total',  width: 47,  align: 'right'  },
];

const drawTableHeader = (doc, y) => {
  const ROW_H = 16;
  rect(doc, MARGIN, y, CONTENT_W, ROW_H, COLORS.headerBg);
  let cx = MARGIN + 3;
  COLS.forEach((col) => {
    doc.font('Helvetica-Bold').fontSize(6.5).fillColor(COLORS.headerText)
      .text(col.label, cx, y + 4, { width: col.width - 3, align: col.align });
    cx += col.width;
  });
  return y + ROW_H;
};

const drawTableRow = (doc, item, index, y) => {
  const MIN_ROW_H = 16;
  const colPad = 3;

  // Measure max content height for this row
  const nameH = doc.font('Helvetica-Bold').fontSize(7).heightOfString(safe(item.itemName, '—'), { width: COLS[2].width - colPad * 2 });
  const descH = doc.font('Helvetica').fontSize(6.5).heightOfString(safe(item.description, '—'), { width: COLS[3].width - colPad * 2 });
  const rowH = Math.max(MIN_ROW_H, nameH + 8, descH + 8);

  // Alternate row background
  if (index % 2 === 0) {
    rect(doc, MARGIN, y, CONTENT_W, rowH, COLORS.rowEven);
  }

  // Draw bottom border
  hLine(doc, y + rowH, COLORS.border, 0.3);

  let cx = MARGIN + colPad;

  // Sl No
  doc.font('Helvetica').fontSize(7).fillColor(COLORS.midGray)
    .text(String(index + 1), cx, y + 5, { width: COLS[0].width - colPad, align: 'center' });
  cx += COLS[0].width;

  // Item Code
  doc.font('Helvetica').fontSize(7).fillColor(COLORS.darkGray)
    .text(safe(item.itemCode, '—'), cx, y + 5, { width: COLS[1].width - colPad, align: 'center' });
  cx += COLS[1].width;

  // Item Name (bold)
  doc.font('Helvetica-Bold').fontSize(7).fillColor(COLORS.black)
    .text(safe(item.itemName, '—'), cx, y + 5, { width: COLS[2].width - colPad * 2, lineBreak: false });
  cx += COLS[2].width;

  // Description
  doc.font('Helvetica').fontSize(6.5).fillColor(COLORS.darkGray)
    .text(safe(item.description, '—'), cx, y + 5, { width: COLS[3].width - colPad * 2, lineBreak: false });
  cx += COLS[3].width;

  // Qty
  doc.font('Helvetica').fontSize(7).fillColor(COLORS.black)
    .text(safe(item.quantity), cx, y + 5, { width: COLS[4].width - colPad, align: 'center' });
  cx += COLS[4].width;

  // Unit
  doc.font('Helvetica').fontSize(7).fillColor(COLORS.black)
    .text(safe(item.unit, '—'), cx, y + 5, { width: COLS[5].width - colPad, align: 'center' });
  cx += COLS[5].width;

  // Unit Price
  doc.font('Helvetica').fontSize(7).fillColor(COLORS.black)
    .text(Number(item.unitPrice || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 }), cx, y + 5, { width: COLS[6].width - colPad, align: 'right' });
  cx += COLS[6].width;

  // Taxable Amount
  doc.font('Helvetica').fontSize(7).fillColor(COLORS.black)
    .text(Number(item.taxableAmount || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 }), cx, y + 5, { width: COLS[7].width - colPad, align: 'right' });
  cx += COLS[7].width;

  // GST%
  doc.font('Helvetica').fontSize(7).fillColor(COLORS.black)
    .text(`${safe(item.gstRate, '0')}%`, cx, y + 5, { width: COLS[8].width - colPad, align: 'center' });
  cx += COLS[8].width;

  // GST Amount
  doc.font('Helvetica').fontSize(7).fillColor(COLORS.black)
    .text(Number(item.gstAmount || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 }), cx, y + 5, { width: COLS[9].width - colPad, align: 'right' });
  cx += COLS[9].width;

  // Line Total (bold)
  doc.font('Helvetica-Bold').fontSize(7).fillColor(COLORS.black)
    .text(Number(item.lineTotal || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 }), cx, y + 5, { width: COLS[10].width - colPad, align: 'right' });

  return y + rowH;
};

// ─── Main PDF Generator ───────────────────────────────────────────────────────

export const generatePurchaseOrderPdf = (po) => {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({
        size: 'A4',
        margin: MARGIN,
        bufferPages: true,  // Enable page buffering so we can add page numbers at the end
        info: {
          Title: `Purchase Order ${po.poNumber || 'PO'}`,
          Author: COMPANY_CONFIG.name,
          Subject: 'Purchase Order Document',
        },
      });

      const buffers = [];
      doc.on('data', (chunk) => buffers.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(buffers)));
      doc.on('error', reject);

      const items = Array.isArray(po.line_items) ? po.line_items : (Array.isArray(po.items) ? po.items : []);
      const summary = po.tax_summary || po.taxSummary || {};
      const vendor = po.vendor || {};

      // Resolve all PO field aliases
      const poNumber       = po.po_number || po.poNumber || 'N/A';
      const orderDate      = po.order_date || po.orderDate;
      const expectedDate   = po.expected_delivery_date || po.expectedDelivery;
      const deliveryAddr   = po.delivery_address || po.deliveryAddress;
      const billingAddr    = po.billing_address || po.billingAddress;
      const paymentTerms   = po.payment_terms || po.paymentTerms;
      const currency       = po.currency || 'INR';
      const poType         = po.po_type || po.poType || 'STANDARD';
      const poStatus       = po.status || 'created';
      const description    = po.description;
      const prNumber       = po.purchase_requisition_number || po.purchaseRequisitionNumber;
      const department     = po.department;
      const costCenter     = po.cost_center || po.costCenter;
      const requester      = po.requester;
      const buyer          = po.buyer;
      const quotDate       = po.quotation_date || po.quotationDate;
      const createdAt      = po.created_at || po.createdAt;
      const createdByUser  = po.created_by;

      // Vendor fields (prefer db snake_case, fall back to mapped camelCase on po)
      const vendorName       = vendor.name        || po.vendorName    || po.vendor;
      const vendorCode       = vendor.vendor_code || po.vendorCode;
      const vendorPhone      = vendor.phone        || po.vendorPhone;
      const vendorEmail      = vendor.email        || po.vendorEmail;
      const vendorGst        = vendor.gst_number   || vendor.tax_id   || po.vendorGst || po.gstNumber;
      const vendorPan        = vendor.pan_number   || po.vendorPan;
      const vendorTaxType    = vendor.tax_type     || po.vendorTaxType;
      const vendorContact    = vendor.contact_person || po.vendorContactPerson;
      const vendorDesig      = vendor.contact_designation || po.vendorContactDesignation;
      const vendorAddr = [
        vendor.address_line1 || vendor.address,
        vendor.address_line2,
        vendor.city,
        vendor.district,
        vendor.state,
        vendor.country,
        vendor.zip_code,
      ].filter(Boolean).join(', ') || po.vendorAddress || 'Not Available';

      let y = MARGIN;

      // ─── SECTION 1: COMPANY HEADER ─────────────────────────────────────────
      const headerTopY = y;

      // Left: Company Info
      doc.font('Helvetica-Bold').fontSize(14).fillColor(COLORS.black)
        .text(COMPANY_CONFIG.name, MARGIN, y, { width: 280 });
      y += 18;

      doc.font('Helvetica').fontSize(7.5).fillColor(COLORS.darkGray);
      doc.text(`${COMPANY_CONFIG.address}`, MARGIN, y, { width: 280 });
      y += 10;
      doc.text(`${COMPANY_CONFIG.city}, ${COMPANY_CONFIG.state}, ${COMPANY_CONFIG.country} - ${COMPANY_CONFIG.pinCode}`, MARGIN, y, { width: 280 });
      y += 10;
      doc.text(`Tel: ${COMPANY_CONFIG.phone}  |  Email: ${COMPANY_CONFIG.email}`, MARGIN, y, { width: 280 });
      y += 10;
      doc.text(`Web: ${COMPANY_CONFIG.website}`, MARGIN, y, { width: 280 });
      y += 10;
      doc.font('Helvetica-Bold').fontSize(7.5).fillColor(COLORS.midGray)
        .text(`GSTIN: ${COMPANY_CONFIG.gstin}  |  PAN: ${COMPANY_CONFIG.pan}`, MARGIN, y, { width: 280 });

      // Right: Document Title + PO Number
      const titleX = MARGIN + 290;
      doc.font('Helvetica-Bold').fontSize(20).fillColor(COLORS.black)
        .text('PURCHASE ORDER', titleX, headerTopY + 4, { width: CONTENT_W - 290, align: 'right' });
      doc.font('Helvetica-Bold').fontSize(9).fillColor(COLORS.accentBlue)
        .text(poNumber, titleX, headerTopY + 32, { width: CONTENT_W - 290, align: 'right' });
      doc.font('Helvetica').fontSize(7.5).fillColor(COLORS.darkGray)
        .text(`Date: ${fmtDate(orderDate)}`, titleX, headerTopY + 44, { width: CONTENT_W - 290, align: 'right' });
      doc.font('Helvetica').fontSize(7.5).fillColor(COLORS.darkGray)
        .text(`Status: ${String(poStatus).toUpperCase()}`, titleX, headerTopY + 54, { width: CONTENT_W - 290, align: 'right' });

      y = Math.max(y, headerTopY + 68) + 6;

      // Thick divider
      doc.strokeColor(COLORS.black).lineWidth(1.5).moveTo(MARGIN, y).lineTo(PAGE_W - MARGIN, y).stroke();
      y += 10;

      // ─── SECTION 2: SHIPMENT + PO INFO (2-column) ─────────────────────────
      y = sectionLabel(doc, 'Shipment & Order Details', y);
      const col2X = MARGIN + CONTENT_W / 2 + 10;
      const col1W = CONTENT_W / 2 - 15;

      // Left: Shipment / Delivery Address
      const sec2StartY = y;
      doc.font('Helvetica-Bold').fontSize(7.5).fillColor(COLORS.darkGray)
        .text('SHIP TO / DELIVERY ADDRESS', MARGIN, y, { width: col1W });
      y += 12;
      doc.font('Helvetica').fontSize(7.5).fillColor(COLORS.black)
        .text(safe(deliveryAddr), MARGIN, y, { width: col1W });

      if (billingAddr) {
        const delivAddrH = doc.font('Helvetica').fontSize(7.5).heightOfString(safe(deliveryAddr), { width: col1W });
        const billingY = y + delivAddrH + 6;
        doc.font('Helvetica-Bold').fontSize(7).fillColor(COLORS.midGray)
          .text('BILLING ADDRESS:', MARGIN, billingY, { width: col1W });
        doc.font('Helvetica').fontSize(7).fillColor(COLORS.darkGray)
          .text(safe(billingAddr), MARGIN, billingY + 9, { width: col1W });
      }

      // Right: PO Key Details
      const kvY = sec2StartY;
      kvRow(doc, 'PO Type:',            poType,         col2X, kvY + 0);
      kvRow(doc, 'Currency:',           currency,       col2X, kvY + 12);
      kvRow(doc, 'Payment Terms:',      paymentTerms,   col2X, kvY + 24);
      kvRow(doc, 'Expected Delivery:',  fmtDate(expectedDate), col2X, kvY + 36);
      kvRow(doc, 'Order Date:',         fmtDate(orderDate),    col2X, kvY + 48);

      y = kvY + 68;
      hLine(doc, y, COLORS.border);
      y += 10;

      // ─── SECTION 3: VENDOR INFORMATION ────────────────────────────────────
      y = sectionLabel(doc, 'Vendor / Supplier Details', y);
      const sec3StartY = y;

      // Left: Vendor Identity & Address
      doc.font('Helvetica-Bold').fontSize(9).fillColor(COLORS.black)
        .text(safe(vendorName, 'Vendor information not available'), MARGIN, y, { width: col1W });
      y += 13;
      doc.font('Helvetica-Bold').fontSize(7.5).fillColor(COLORS.accentBlue)
        .text(`Code: ${safe(vendorCode)}`, MARGIN, y, { width: col1W });
      y += 11;
      doc.font('Helvetica').fontSize(7.5).fillColor(COLORS.darkGray)
        .text(vendorAddr, MARGIN, y, { width: col1W });

      // Right: Compliance & Contact
      let rvY = sec3StartY;
      kvRow(doc, 'Contact Person:',  vendorContact,  col2X, rvY + 0);
      kvRow(doc, 'Designation:',     vendorDesig,    col2X, rvY + 11);
      kvRow(doc, 'Phone:',           vendorPhone,    col2X, rvY + 22);
      kvRow(doc, 'Email:',           vendorEmail,    col2X, rvY + 33);
      kvRow(doc, 'GSTIN:',           vendorGst,      col2X, rvY + 44);
      kvRow(doc, 'PAN:',             vendorPan,      col2X, rvY + 55);
      kvRow(doc, 'Tax Reg. Type:',   vendorTaxType,  col2X, rvY + 66);

      y = Math.max(y + 15, rvY + 80);
      hLine(doc, y, COLORS.border);
      y += 10;

      // ─── SECTION 4: PROCUREMENT REFERENCES ────────────────────────────────
      const refs = [
        { label: 'Purchase Requisition:', value: prNumber },
        { label: 'Department:',           value: department },
        { label: 'Cost Center:',          value: costCenter },
        { label: 'Requester:',            value: requester },
        { label: 'Buyer:',                value: buyer },
        { label: 'Quotation Date:',       value: fmtDate(quotDate) !== 'N/A' ? fmtDate(quotDate) : null },
      ].filter((r) => r.value && String(r.value).trim() !== '' && String(r.value) !== 'N/A');

      if (refs.length > 0) {
        y = sectionLabel(doc, 'Procurement References', y);
        const refColW = CONTENT_W / 4;
        let refX = MARGIN;
        let refRow = 0;
        refs.forEach((ref, i) => {
          if (i > 0 && i % 4 === 0) {
            refRow++;
            refX = MARGIN;
            y += 22;
          }
          doc.font('Helvetica').fontSize(6.5).fillColor(COLORS.midGray)
            .text(ref.label, refX, y, { width: refColW });
          doc.font('Helvetica-Bold').fontSize(7.5).fillColor(COLORS.black)
            .text(String(ref.value), refX, y + 9, { width: refColW - 5 });
          refX += refColW;
          if ((i + 1) % 4 === 0) refX = MARGIN;
        });
        y += 26;
        hLine(doc, y, COLORS.border);
        y += 10;
      }

      // ─── SECTION 5: ITEMS TABLE ────────────────────────────────────────────
      y = sectionLabel(doc, 'Line Item Details', y);

      if (items.length === 0) {
        doc.font('Helvetica').fontSize(8).fillColor(COLORS.midGray)
          .text('No item details available.', MARGIN, y + 5, { align: 'center', width: CONTENT_W });
        y += 25;
      } else {
        y = drawTableHeader(doc, y);

        items.forEach((item, index) => {
          // Check if we need a new page (leave 120pt for summary)
          const MIN_ROW_H = 16;
          const nameH = doc.font('Helvetica-Bold').fontSize(7).heightOfString(safe(item.itemName, '—'), { width: COLS[2].width - 6 });
          const descH = doc.font('Helvetica').fontSize(6.5).heightOfString(safe(item.description, '—'), { width: COLS[3].width - 6 });
          const approxRowH = Math.max(MIN_ROW_H, nameH + 8, descH + 8);

          if (y + approxRowH > PAGE_H - MARGIN - 40) {
            doc.addPage();
            y = MARGIN;
            // Continuation header
            doc.font('Helvetica').fontSize(7).fillColor(COLORS.midGray)
              .text(`${COMPANY_CONFIG.name}  |  ${poNumber} (continued)`, MARGIN, y, { width: CONTENT_W, align: 'right' });
            y += 14;
            hLine(doc, y, COLORS.border);
            y += 8;
            y = drawTableHeader(doc, y);
          }

          y = drawTableRow(doc, item, index, y);
        });
      }

      y += 8;

      // ─── SECTION 6: TAX SUMMARY ────────────────────────────────────────────
      // Ensure summary fits on current page; if not, push to new page
      const summaryHeight = 140;
      if (y + summaryHeight > PAGE_H - MARGIN - 40) {
        doc.addPage();
        y = MARGIN;
        doc.font('Helvetica').fontSize(7).fillColor(COLORS.midGray)
          .text(`${COMPANY_CONFIG.name}  |  ${poNumber} (continued)`, MARGIN, y, { width: CONTENT_W, align: 'right' });
        y += 14;
        hLine(doc, y, COLORS.border);
        y += 8;
      }

      hLine(doc, y, COLORS.border);
      y += 10;
      y = sectionLabel(doc, 'Financial Summary', y);

      const sumLabelX  = MARGIN + CONTENT_W - 250;
      const sumValueX  = MARGIN + CONTENT_W - 110;
      const sumW       = 105;

      const drawSumRow = (label, value, bold = false, bgColor = null) => {
        if (bgColor) {
          rect(doc, sumLabelX - 5, y - 2, 255, 14, bgColor);
        }
        doc.font(bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(7.5)
          .fillColor(bgColor ? COLORS.headerText : COLORS.darkGray)
          .text(label, sumLabelX, y, { width: 130 });
        doc.font('Helvetica-Bold').fontSize(7.5)
          .fillColor(bgColor ? COLORS.headerText : COLORS.black)
          .text(value, sumValueX, y, { width: sumW, align: 'right' });
        y += 13;
      };

      drawSumRow('Subtotal (Taxable Amount):', money(summary.taxableAmount || summary.subtotal, currency));
      drawSumRow('CGST Total:',  money(summary.cgstTotal, currency));
      drawSumRow('SGST Total:',  money(summary.sgstTotal, currency));
      drawSumRow('IGST Total:',  money(summary.igstTotal, currency));
      drawSumRow('Total Tax (GST):', money(summary.totalGst, currency), true);
      if (Number(summary.otherCharges || 0) > 0) {
        drawSumRow('Other Charges:', money(summary.otherCharges, currency));
      }
      if (Number(summary.roundOff || 0) !== 0) {
        drawSumRow('Round Off:', money(summary.roundOff, currency));
      }

      y += 2;
      const grandTotal = summary.grandTotal || po.amount || 0;
      rect(doc, sumLabelX - 5, y - 2, 255, 16, COLORS.totalBg);
      doc.font('Helvetica-Bold').fontSize(9).fillColor(COLORS.totalText)
        .text('NET PO AMOUNT:', sumLabelX, y, { width: 130 });
      doc.font('Helvetica-Bold').fontSize(9).fillColor(COLORS.totalText)
        .text(money(grandTotal, currency), sumValueX, y, { width: sumW, align: 'right' });
      y += 22;

      // Amount in Words
      const wordsText = amountToWords(grandTotal, currency);
      doc.font('Helvetica').fontSize(7).fillColor(COLORS.midGray)
        .text('Amount in Words: ', MARGIN, y);
      doc.font('Helvetica-Bold').fontSize(7.5).fillColor(COLORS.black)
        .text(wordsText, MARGIN + 85, y, { width: CONTENT_W - 90 });
      y += 16;

      hLine(doc, y, COLORS.border);
      y += 10;

      // ─── SECTION 7: PAYMENT TERMS & CONDITIONS ────────────────────────────
      const paymentType = po.payment_type || po.paymentType || 'ONE_TIME';
      const isInstallment = paymentType === 'INSTALLMENT';
      const installments = Array.isArray(po.installments) ? po.installments : [];

      const requiredSec7Height = isInstallment ? 120 + installments.length * 15 : 90;
      if (y + requiredSec7Height > PAGE_H - MARGIN - 40) {
        doc.addPage();
        y = MARGIN;
      }

      const col1End = MARGIN + CONTENT_W / 2 - 10;
      const sec7StartY = y;

      // Left: Payment Conditions
      doc.font('Helvetica-Bold').fontSize(7).fillColor(COLORS.accentBlue)
        .text('PAYMENT CONDITIONS', MARGIN, y);
      y += 12;
      doc.font('Helvetica-Bold').fontSize(7.5).fillColor(COLORS.black)
        .text(`Payment Type: ${isInstallment ? 'Installment Payment' : 'One-Time Payment'}`, MARGIN, y, { width: col1End - MARGIN });
      y += 11;
      doc.font('Helvetica').fontSize(7.5).fillColor(COLORS.black)
        .text(`Payment Terms: ${safe(paymentTerms)}`, MARGIN, y, { width: col1End - MARGIN });
      y += 11;
      doc.text(`Currency: ${safe(currency)}`, MARGIN, y, { width: col1End - MARGIN });
      y += 11;
      doc.text(`Expected Delivery: ${fmtDate(expectedDate)}`, MARGIN, y, { width: col1End - MARGIN });
      y += 14;

      if (isInstallment && installments.length > 0) {
        doc.font('Helvetica-Bold').fontSize(7.5).fillColor(COLORS.black)
          .text(`Installment Duration: ${installments.length} Months`, MARGIN, y, { width: col1End - MARGIN });
        y += 11;
        const monthlyAmt = installments[0]?.amount || (grandTotal / installments.length);
        doc.font('Helvetica-Bold').fontSize(7.5).fillColor(COLORS.accentBlue)
          .text(`Monthly Installment: ${money(monthlyAmt, currency)}`, MARGIN, y, { width: col1End - MARGIN });
        y += 14;
      }

      // Right: Terms and Conditions
      doc.font('Helvetica-Bold').fontSize(7).fillColor(COLORS.accentBlue)
        .text('TERMS AND CONDITIONS', col2X, sec7StartY);
      doc.font('Helvetica').fontSize(7).fillColor(COLORS.darkGray)
        .text(
          description || 'No terms and conditions specified.',
          col2X, sec7StartY + 12,
          { width: CONTENT_W / 2, lineGap: 1.5 }
        );

      y = Math.max(y, sec7StartY + 50);

      // Render Installment Schedule Table on PDF if Installment Payment
      if (isInstallment && installments.length > 0) {
        y += 8;
        y = sectionLabel(doc, 'Installment Schedule', y);

        const instCols = [
          { label: 'No.',      width: 40,  align: 'center' },
          { label: 'Due Date', width: 150, align: 'center' },
          { label: 'Amount',   width: 150, align: 'right'  },
        ];

        // Header
        rect(doc, MARGIN, y, 340, 15, COLORS.headerBg);
        let ix = MARGIN + 5;
        instCols.forEach((col) => {
          doc.font('Helvetica-Bold').fontSize(7).fillColor(COLORS.headerText)
            .text(col.label, ix, y + 3, { width: col.width, align: col.align });
          ix += col.width;
        });
        y += 15;

        // Rows
        installments.forEach((inst, idx) => {
          if (idx % 2 === 0) rect(doc, MARGIN, y, 340, 14, COLORS.rowEven);
          hLine(doc, y + 14, COLORS.border, 0.3);

          let rX = MARGIN + 5;
          doc.font('Helvetica-Bold').fontSize(7).fillColor(COLORS.accentBlue)
            .text(String(inst.installment_number || inst.installmentNumber || idx + 1), rX, y + 3, { width: instCols[0].width, align: 'center' });
          rX += instCols[0].width;

          doc.font('Helvetica').fontSize(7).fillColor(COLORS.black)
            .text(fmtDate(inst.due_date || inst.dueDate), rX, y + 3, { width: instCols[1].width, align: 'center' });
          rX += instCols[1].width;

          doc.font('Helvetica-Bold').fontSize(7).fillColor(COLORS.black)
            .text(money(inst.amount, currency), rX, y + 3, { width: instCols[2].width, align: 'right' });

          y += 14;
        });
      }

      hLine(doc, y, COLORS.border);
      y += 10;

      // ─── SECTION 8: AUDIT / DOCUMENT INFO ─────────────────────────────────
      if (y + 50 > PAGE_H - MARGIN - 40) {
        doc.addPage();
        y = MARGIN;
      }

      const creatorName = createdByUser
        ? `${createdByUser.first_name || ''} ${createdByUser.last_name || ''}`.trim() || createdByUser.email
        : safe(po.createdBy, 'System');

      doc.font('Helvetica').fontSize(6.5).fillColor(COLORS.midGray)
        .text(`Created By: ${creatorName}`, MARGIN, y)
        .text(`Created Date: ${fmtDate(createdAt)}`, MARGIN + 160, y)
        .text(`Document Status: ${String(poStatus).toUpperCase()}`, MARGIN + 310, y);
      y += 20;

      // ─── SECTION 9: SIGNATURE BLOCKS ─────────────────────────────────────
      if (y + 55 > PAGE_H - MARGIN - 30) {
        doc.addPage();
        y = MARGIN;
      }

      hLine(doc, y, COLORS.border);
      y += 14;

      const sigW = 160;
      // Vendor signature (left)
      doc.strokeColor(COLORS.black).lineWidth(0.8)
        .moveTo(MARGIN, y + 28).lineTo(MARGIN + sigW, y + 28).stroke();
      doc.font('Helvetica-Bold').fontSize(7).fillColor(COLORS.midGray)
        .text('Vendor Acceptance', MARGIN, y + 30, { width: sigW });
      doc.font('Helvetica').fontSize(6.5).fillColor(COLORS.lightGray)
        .text('Name, Designation & Date', MARGIN, y + 40, { width: sigW });

      // Company signature (right)
      const sigRX = PAGE_W - MARGIN - sigW;
      doc.strokeColor(COLORS.black).lineWidth(0.8)
        .moveTo(sigRX, y + 28).lineTo(sigRX + sigW, y + 28).stroke();
      doc.font('Helvetica-Bold').fontSize(7).fillColor(COLORS.midGray)
        .text(`For ${COMPANY_CONFIG.name}`, sigRX, y + 30, { width: sigW, align: 'right' });
      doc.font('Helvetica').fontSize(6.5).fillColor(COLORS.lightGray)
        .text('Authorized Signatory & Stamp', sigRX, y + 40, { width: sigW, align: 'right' });

      // ─── Add page footers to every page ───────────────────────────────────
      const totalPages = doc.bufferedPageRange().count;
      for (let i = 0; i < totalPages; i++) {
        doc.switchToPage(i);
        drawPageFooter(doc, poNumber, i + 1, totalPages);
      }

      doc.end();
    } catch (err) {
      reject(err);
    }
  });
};
