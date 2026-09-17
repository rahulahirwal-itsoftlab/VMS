import PDFDocument from 'pdfkit';
import { COMPANY_CONFIG } from '../../config/company.js';

// ─── Utilities & Formatting Helpers ───────────────────────────────────────────

const safe = (v, fallback = 'Not Available') =>
  v !== null && v !== undefined && String(v).trim() !== '' && String(v).trim() !== 'N/A'
    ? String(v)
    : fallback;

const money = (value, cur = 'INR') =>
  `${cur === 'INR' ? '₹' : cur} ${Number(value || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const fmtDate = (v) => {
  if (!v) return 'Not Available';
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return 'Not Available';
  return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
};

const maskBankAccount = (accountNo) => {
  if (!accountNo || String(accountNo).trim() === '') return 'Not Available';
  const str = String(accountNo).trim();
  if (str.length <= 4) return str;
  const visible = str.slice(-4);
  const maskedCount = Math.max(str.length - 4, 6);
  return 'X'.repeat(maskedCount) + visible;
};

// ─── Amount in Words (Indian Rupee Notation) ──────────────────────────────────

const ones = [
  '', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine',
  'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'
];
const tens = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];

const convertHundreds = (n) => {
  if (n === 0) return '';
  if (n < 20) return ones[n] + ' ';
  if (n < 100) return tens[Math.floor(n / 10)] + (n % 10 ? ' ' + ones[n % 10] : '') + ' ';
  return ones[Math.floor(n / 100)] + ' Hundred ' + convertHundreds(n % 100);
};

const amountToWords = (amount, currency = 'INR') => {
  const num = Math.round(Number(amount || 0));
  if (num === 0) return 'Rupees Zero Only';

  let parts = [];
  let n = Math.abs(num);
  if (n >= 10000000) { parts.push(convertHundreds(Math.floor(n / 10000000)).trim() + ' Crore'); n %= 10000000; }
  if (n >= 100000)   { parts.push(convertHundreds(Math.floor(n / 100000)).trim() + ' Lakh'); n %= 100000; }
  if (n >= 1000)     { parts.push(convertHundreds(Math.floor(n / 1000)).trim() + ' Thousand'); n %= 1000; }
  if (n > 0)         { parts.push(convertHundreds(n).trim()); }

  const currName = currency === 'USD' ? 'Dollars' : currency === 'EUR' ? 'Euros' : 'Rupees';
  return 'Rupees ' + parts.join(' ').replace(/\s+/g, ' ').trim() + ' Only';
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

const hLine = (doc, y, color = COLORS.border, thickness = 0.5) => {
  doc.strokeColor(color).lineWidth(thickness).moveTo(MARGIN, y).lineTo(PAGE_W - MARGIN, y).stroke();
};

const rect = (doc, x, y, w, h, fillColor, strokeColor = null) => {
  doc.rect(x, y, w, h);
  if (fillColor) doc.fill(fillColor);
  if (strokeColor) { doc.strokeColor(strokeColor).lineWidth(0.5).stroke(); }
};

const sectionLabel = (doc, label, y) => {
  doc.fillColor(COLORS.accentBlue).font('Helvetica-Bold').fontSize(7)
    .text(label.toUpperCase(), MARGIN, y, { width: CONTENT_W, characterSpacing: 0.5 });
  hLine(doc, y + 11, COLORS.accentBlue, 0.7);
  return y + 16;
};

const kvRow = (doc, label, value, x, y, lWidth = 90, vWidth = 120) => {
  doc.font('Helvetica').fontSize(7.5).fillColor(COLORS.midGray).text(label, x, y, { width: lWidth });
  doc.font('Helvetica-Bold').fontSize(7.5).fillColor(COLORS.black).text(safe(value), x + lWidth, y, { width: vWidth });
};

const drawPageFooter = (doc, invoiceNumber, pageNum, totalPages) => {
  const y = PAGE_H - 28;
  hLine(doc, y - 5, COLORS.border);
  doc.font('Helvetica').fontSize(6.5).fillColor(COLORS.lightGray)
    .text(`Invoice: ${invoiceNumber} | Page ${pageNum} of ${totalPages} | This is a system-generated invoice.`, MARGIN, y, { width: CONTENT_W, align: 'center' });
};

// ─── Table Helpers ────────────────────────────────────────────────────────────

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

  const itemNameStr = safe(item.itemName || item.item_name || item.name, 'Item');
  const itemDescStr = safe(item.description, '—');

  const nameH = doc.font('Helvetica-Bold').fontSize(7).heightOfString(itemNameStr, { width: COLS[2].width - colPad * 2 });
  const descH = doc.font('Helvetica').fontSize(6.5).heightOfString(itemDescStr, { width: COLS[3].width - colPad * 2 });
  const rowH = Math.max(MIN_ROW_H, nameH + 8, descH + 8);

  if (index % 2 === 0) {
    rect(doc, MARGIN, y, CONTENT_W, rowH, COLORS.rowEven);
  }

  hLine(doc, y + rowH, COLORS.border, 0.3);

  let cx = MARGIN + colPad;

  // Sl No
  doc.font('Helvetica').fontSize(7).fillColor(COLORS.midGray)
    .text(String(index + 1), cx, y + 5, { width: COLS[0].width - colPad, align: 'center' });
  cx += COLS[0].width;

  // Item Code
  doc.font('Helvetica').fontSize(7).fillColor(COLORS.darkGray)
    .text(safe(item.itemCode || item.code, '—'), cx, y + 5, { width: COLS[1].width - colPad, align: 'center' });
  cx += COLS[1].width;

  // Item Name (bold)
  doc.font('Helvetica-Bold').fontSize(7).fillColor(COLORS.black)
    .text(itemNameStr, cx, y + 5, { width: COLS[2].width - colPad * 2, lineBreak: false });
  cx += COLS[2].width;

  // Description
  doc.font('Helvetica').fontSize(6.5).fillColor(COLORS.darkGray)
    .text(itemDescStr, cx, y + 5, { width: COLS[3].width - colPad * 2, lineBreak: false });
  cx += COLS[3].width;

  // Qty
  doc.font('Helvetica').fontSize(7).fillColor(COLORS.black)
    .text(safe(item.quantity || item.qty, '0'), cx, y + 5, { width: COLS[4].width - colPad, align: 'center' });
  cx += COLS[4].width;

  // Unit
  doc.font('Helvetica').fontSize(7).fillColor(COLORS.black)
    .text(safe(item.unit, 'Nos'), cx, y + 5, { width: COLS[5].width - colPad, align: 'center' });
  cx += COLS[5].width;

  // Unit Price
  doc.font('Helvetica').fontSize(7).fillColor(COLORS.black)
    .text(Number(item.unitPrice || item.rate || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 }), cx, y + 5, { width: COLS[6].width - colPad, align: 'right' });
  cx += COLS[6].width;

  // Taxable Amount
  doc.font('Helvetica').fontSize(7).fillColor(COLORS.black)
    .text(Number(item.taxableAmount || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 }), cx, y + 5, { width: COLS[7].width - colPad, align: 'right' });
  cx += COLS[7].width;

  // GST%
  doc.font('Helvetica').fontSize(7).fillColor(COLORS.black)
    .text(`${safe(item.gstRate || item.gstPct || 18)}%`, cx, y + 5, { width: COLS[8].width - colPad, align: 'center' });
  cx += COLS[8].width;

  // GST Amount
  doc.font('Helvetica').fontSize(7).fillColor(COLORS.black)
    .text(Number(item.gstAmount || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 }), cx, y + 5, { width: COLS[9].width - colPad, align: 'right' });
  cx += COLS[9].width;

  // Line Total (bold)
  const lineTotalVal = Number(item.lineTotal || item.amount || Number(item.taxableAmount || 0) + Number(item.gstAmount || 0));
  doc.font('Helvetica-Bold').fontSize(7).fillColor(COLORS.black)
    .text(lineTotalVal.toLocaleString('en-IN', { maximumFractionDigits: 2 }), cx, y + 5, { width: COLS[10].width - colPad, align: 'right' });

  return y + rowH;
};

// ─── Main Invoice PDF Generator ───────────────────────────────────────────────

export const generateInvoicePdf = (invoice, customCompanyConfig = null) => {
  return new Promise((resolve, reject) => {
    try {
      const company = customCompanyConfig || COMPANY_CONFIG;

      const doc = new PDFDocument({
        size: 'A4',
        margin: MARGIN,
        bufferPages: true,
        info: {
          Title: `Invoice ${invoice.invoice_number || invoice.invoiceNumber || 'Invoice'}`,
          Author: company.name,
          Subject: 'Tax Invoice Document',
        },
      });

      const buffers = [];
      doc.on('data', (chunk) => buffers.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(buffers)));
      doc.on('error', reject);

      const items = Array.isArray(invoice.items)
        ? invoice.items
        : Array.isArray(invoice.line_items)
          ? invoice.line_items
          : Array.isArray(invoice.purchase_order?.line_items)
            ? invoice.purchase_order.line_items
            : [];
      const summary = invoice.tax_summary || invoice.taxSummary || {};
      const vendor  = invoice.vendor || {};
      const po      = invoice.purchase_order || {};
      const match   = (invoice.three_way_matches && invoice.three_way_matches[0]) || {};

      // Fields resolution
      const invoiceNumber  = invoice.invoice_number || invoice.invoiceNumber || 'INV-2026-000001';
      const invoiceDate    = invoice.invoice_date || invoice.invoiceDate;
      const dueDate        = invoice.due_date || invoice.dueDate;
      const paymentStatus  = invoice.payment_status || invoice.paymentStatus || 'UNPAID';
      const currency       = invoice.currency || po.currency || 'INR';

      // PO & References
      const poNumber     = po.po_number || invoice.poNumber || 'Not Available';
      const poDate       = po.order_date || po.po_date || invoice.poDate;
      const paymentTerms = invoice.payment_terms || po.payment_terms || vendor.payment_terms || 'Net 30';

      const grnObj    = (po.grns && po.grns[0]) || {};
      const dcObj     = (po.delivery_challans && po.delivery_challans[0]) || {};
      const grnNumber = match.grn_snapshot?.grnNumber || grnObj.grn_number || invoice.grnNumber || 'Not Available';
      const dcNumber  = match.delivery_challan_snapshot?.deliveryChallanNumber || dcObj.delivery_challan_number || invoice.deliveryChallanNumber || 'Not Available';

      // Vendor
      const vendorName    = vendor.name || invoice.vendorName || invoice.vendor || 'Vendor Master Information Missing';
      const vendorCode    = vendor.vendor_code || invoice.vendorCode || 'Not Available';
      const vendorGst     = vendor.gst_number || vendor.tax_id || invoice.vendorGst || invoice.gstNumber || 'Not Available';
      const vendorPan     = vendor.pan_number || invoice.vendorPan || 'Not Available';
      const vendorCategory= vendor.category || invoice.vendorCategory || 'Not Available';
      const vendorType    = vendor.tax_type || invoice.vendorTaxType || 'Not Available';
      const vendorContact = vendor.contact_person || invoice.vendorContactPerson || 'Not Available';
      const vendorEmail   = vendor.email || invoice.vendorEmail || 'Not Available';
      const vendorPhone   = vendor.phone || invoice.vendorPhone || 'Not Available';
      const vendorAddr    = [
        vendor.address_line1 || vendor.address,
        vendor.address_line2,
        vendor.city,
        vendor.district,
        vendor.state,
        vendor.country,
        vendor.zip_code,
      ].filter(Boolean).join(', ') || invoice.vendorAddress || 'Not Available';

      const bankName      = vendor.bank_name || invoice.vendorBankName || 'Not Available';
      const bankAccountNo = vendor.bank_account_no || invoice.vendorBankAccountNo || 'Not Available';
      const bankHolder    = vendor.account_holder || invoice.vendorAccountHolder || 'Not Available';
      const bankIfsc      = vendor.ifsc_code || invoice.vendorIfscCode || 'Not Available';
      const bankBranch    = vendor.bank_branch || invoice.vendorBankBranch || 'Not Available';

      let y = MARGIN;

      // ─── 1. COMPANY HEADER ──────────────────────────────────────────────────
      const headerTopY = y;

      // Left: ACRE Company Master Info
      doc.font('Helvetica-Bold').fontSize(14).fillColor(COLORS.black)
        .text(company.name, MARGIN, y, { width: 280 });
      y += 18;

      doc.font('Helvetica').fontSize(7.5).fillColor(COLORS.darkGray);
      doc.text(`${company.address}`, MARGIN, y, { width: 280 });
      y += 10;
      doc.text(`${company.city}, ${company.state}, ${company.country} - ${company.pinCode}`, MARGIN, y, { width: 280 });
      y += 10;
      doc.text(`Tel: ${company.phone}  |  Email: ${company.email}`, MARGIN, y, { width: 280 });
      y += 10;
      doc.text(`Web: ${company.website}`, MARGIN, y, { width: 280 });
      y += 10;
      doc.font('Helvetica-Bold').fontSize(7.5).fillColor(COLORS.midGray)
        .text(`GSTIN: ${company.gstin}  |  PAN: ${company.pan}`, MARGIN, y, { width: 280 });

      // Right: Document Title & Metadata
      const titleX = MARGIN + 290;
      doc.font('Helvetica-Bold').fontSize(22).fillColor(COLORS.accentBlue)
        .text('TAX INVOICE', titleX, headerTopY + 2, { width: CONTENT_W - 290, align: 'right' });
      doc.font('Helvetica-Bold').fontSize(9).fillColor(COLORS.black)
        .text(invoiceNumber, titleX, headerTopY + 30, { width: CONTENT_W - 290, align: 'right' });
      doc.font('Helvetica').fontSize(7.5).fillColor(COLORS.darkGray)
        .text(`Invoice Date: ${fmtDate(invoiceDate)}`, titleX, headerTopY + 42, { width: CONTENT_W - 290, align: 'right' });
      doc.font('Helvetica').fontSize(7.5).fillColor(COLORS.darkGray)
        .text(`Due Date: ${fmtDate(dueDate)}`, titleX, headerTopY + 53, { width: CONTENT_W - 290, align: 'right' });
      doc.font('Helvetica-Bold').fontSize(7.5).fillColor(COLORS.accentBlue)
        .text(`Status: ${String(paymentStatus).toUpperCase()}`, titleX, headerTopY + 64, { width: CONTENT_W - 290, align: 'right' });

      y = Math.max(y, headerTopY + 76) + 8;
      doc.strokeColor(COLORS.black).lineWidth(1.5).moveTo(MARGIN, y).lineTo(PAGE_W - MARGIN, y).stroke();
      y += 10;

      // ─── 2. BILL TO & VENDOR SECTION (2-Column) ─────────────────────────────
      y = sectionLabel(doc, 'Parties Information', y);
      const col2X = MARGIN + CONTENT_W / 2 + 10;
      const col1W = CONTENT_W / 2 - 15;
      const sec2StartY = y;

      // Left Column: BILL TO (ACRE Company)
      doc.font('Helvetica-Bold').fontSize(8).fillColor(COLORS.accentBlue)
        .text('BILL TO', MARGIN, y, { width: col1W });
      y += 12;
      doc.font('Helvetica-Bold').fontSize(8.5).fillColor(COLORS.black)
        .text(company.name, MARGIN, y, { width: col1W });
      y += 12;
      doc.font('Helvetica').fontSize(7.5).fillColor(COLORS.darkGray)
        .text(`${company.address}\n${company.city}, ${company.state} - ${company.pinCode}, ${company.country}\nGSTIN: ${company.gstin}\nPAN: ${company.pan}\nContact: ${company.phone} | ${company.email}`, MARGIN, y, { width: col1W, lineGap: 1.5 });

      // Right Column: VENDOR / SUPPLIER
      let rvY = sec2StartY;
      doc.font('Helvetica-Bold').fontSize(8).fillColor(COLORS.accentBlue)
        .text('VENDOR / SUPPLIER', col2X, rvY, { width: col1W });
      rvY += 12;
      doc.font('Helvetica-Bold').fontSize(8.5).fillColor(COLORS.black)
        .text(safe(vendorName), col2X, rvY, { width: col1W });
      rvY += 12;
      kvRow(doc, 'Code:',           vendorCode,     col2X, rvY + 0);
      kvRow(doc, 'GSTIN:',          vendorGst,      col2X, rvY + 10);
      kvRow(doc, 'PAN:',            vendorPan,      col2X, rvY + 20);
      kvRow(doc, 'Category/Type:',  `${vendorCategory} / ${vendorType}`, col2X, rvY + 30);
      kvRow(doc, 'Contact Person:', vendorContact,  col2X, rvY + 40);
      kvRow(doc, 'Phone / Email:',  `${vendorPhone} | ${vendorEmail}`, col2X, rvY + 50);

      y = Math.max(y + 60, rvY + 68);
      hLine(doc, y, COLORS.border);
      y += 10;

      // ─── 3. PROCUREMENT & RECEIPT REFERENCES ───────────────────────────────
      y = sectionLabel(doc, 'Procurement References', y);
      const refColW = CONTENT_W / 4;
      let refX = MARGIN;

      const refs = [
        { label: 'PO Number:',           value: poNumber },
        { label: 'PO Date:',             value: fmtDate(poDate) },
        { label: 'GRN Number:',          value: grnNumber },
        { label: 'Delivery Challan:',    value: dcNumber },
      ];

      refs.forEach((ref) => {
        doc.font('Helvetica').fontSize(6.5).fillColor(COLORS.midGray).text(ref.label, refX, y, { width: refColW });
        doc.font('Helvetica-Bold').fontSize(7.5).fillColor(COLORS.black).text(safe(ref.value), refX, y + 9, { width: refColW - 5 });
        refX += refColW;
      });

      y += 24;
      hLine(doc, y, COLORS.border);
      y += 10;

      // ─── 4. ITEM TABLE ─────────────────────────────────────────────────────
      y = sectionLabel(doc, 'Line Item Details', y);

      if (items.length === 0) {
        doc.font('Helvetica').fontSize(8).fillColor(COLORS.midGray)
          .text('No line item details available.', MARGIN, y + 5, { align: 'center', width: CONTENT_W });
        y += 25;
      } else {
        y = drawTableHeader(doc, y);

        items.forEach((item, index) => {
          const MIN_ROW_H = 16;
          const nameH = doc.font('Helvetica-Bold').fontSize(7).heightOfString(safe(item.itemName || item.item_name || item.name, '—'), { width: COLS[2].width - 6 });
          const descH = doc.font('Helvetica').fontSize(6.5).heightOfString(safe(item.description, '—'), { width: COLS[3].width - 6 });
          const approxRowH = Math.max(MIN_ROW_H, nameH + 8, descH + 8);

          if (y + approxRowH > PAGE_H - MARGIN - 40) {
            doc.addPage();
            y = MARGIN;
            doc.font('Helvetica').fontSize(7).fillColor(COLORS.midGray)
              .text(`${company.name}  |  Invoice ${invoiceNumber} (continued)`, MARGIN, y, { width: CONTENT_W, align: 'right' });
            y += 14;
            hLine(doc, y, COLORS.border);
            y += 8;
            y = drawTableHeader(doc, y);
          }

          y = drawTableRow(doc, item, index, y);
        });
      }

      y += 8;

      // ─── 5. FINANCIAL SUMMARY & AMOUNT IN WORDS ─────────────────────────────
      const summaryHeight = 150;
      if (y + summaryHeight > PAGE_H - MARGIN - 40) {
        doc.addPage();
        y = MARGIN;
        doc.font('Helvetica').fontSize(7).fillColor(COLORS.midGray)
          .text(`${company.name}  |  Invoice ${invoiceNumber} (continued)`, MARGIN, y, { width: CONTENT_W, align: 'right' });
        y += 14;
        hLine(doc, y, COLORS.border);
        y += 8;
      }

      hLine(doc, y, COLORS.border);
      y += 10;
      y = sectionLabel(doc, 'Tax & Amount Summary', y);

      const sumLabelX = MARGIN + CONTENT_W - 240;
      const sumValueX = MARGIN + CONTENT_W - 100;
      const sumW      = 95;

      const drawSumRow = (label, value, bold = false, bgColor = null) => {
        if (bgColor) {
          rect(doc, sumLabelX - 5, y - 2, 245, 14, bgColor);
        }
        doc.font(bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(7.5)
          .fillColor(bgColor ? COLORS.headerText : COLORS.darkGray)
          .text(label, sumLabelX, y, { width: 130 });
        doc.font('Helvetica-Bold').fontSize(7.5)
          .fillColor(bgColor ? COLORS.headerText : COLORS.black)
          .text(value, sumValueX, y, { width: sumW, align: 'right' });
        y += 13;
      };

      drawSumRow('Subtotal (Taxable Amount):', money(summary.subtotal || summary.taxableAmount, currency));
      drawSumRow('CGST Total:',  money(summary.cgstTotal, currency));
      drawSumRow('SGST Total:',  money(summary.sgstTotal, currency));
      drawSumRow('IGST Total:',  money(summary.igstTotal, currency));
      drawSumRow('Total Tax (GST):', money(summary.totalGst || (Number(summary.cgstTotal||0)+Number(summary.sgstTotal||0)+Number(summary.igstTotal||0)), currency), true);
      if (Number(summary.otherCharges || 0) > 0) {
        drawSumRow('Other Charges:', money(summary.otherCharges, currency));
      }
      if (Number(summary.roundOff || 0) !== 0) {
        drawSumRow('Round Off:', money(summary.roundOff, currency));
      }

      y += 2;
      const grandTotal = summary.grandTotal || invoice.invoice_total || invoice.amount || 0;
      rect(doc, sumLabelX - 5, y - 2, 245, 16, COLORS.totalBg);
      doc.font('Helvetica-Bold').fontSize(9).fillColor(COLORS.totalText)
        .text('TOTAL AMOUNT:', sumLabelX, y, { width: 130 });
      doc.font('Helvetica-Bold').fontSize(9).fillColor(COLORS.totalText)
        .text(money(grandTotal, currency), sumValueX, y, { width: sumW, align: 'right' });
      y += 22;

      // Amount in Words
      const wordsText = amountToWords(grandTotal, currency);
      doc.font('Helvetica').fontSize(7).fillColor(COLORS.midGray).text('Amount in Words:', MARGIN, y - 90);
      doc.font('Helvetica-Bold').fontSize(7.5).fillColor(COLORS.black)
        .text(wordsText, MARGIN + 85, y - 90, { width: CONTENT_W - 330 });

      // ─── 6. VENDOR PAYMENT DETAILS ─────────────────────────────────────────
      const bankBoxY = y - 68;
      doc.font('Helvetica-Bold').fontSize(7).fillColor(COLORS.accentBlue).text('VENDOR PAYMENT DETAILS', MARGIN, bankBoxY);
      doc.font('Helvetica').fontSize(7).fillColor(COLORS.black)
        .text(`Bank Name: ${safe(bankName)}   |   Branch: ${safe(bankBranch)}\nAccount Holder: ${safe(bankHolder)}\nAccount Number: ${maskBankAccount(bankAccountNo)}\nIFSC Code: ${safe(bankIfsc)}`, MARGIN, bankBoxY + 10, { width: CONTENT_W - 260, lineGap: 1.5 });

      hLine(doc, y, COLORS.border);
      y += 10;

      // ─── 7. TERMS AND CONDITIONS & REMARKS ──────────────────────────────────
      if (y + 70 > PAGE_H - MARGIN - 40) {
        doc.addPage();
        y = MARGIN;
      }

      const sec7StartY = y;
      doc.font('Helvetica-Bold').fontSize(7).fillColor(COLORS.accentBlue).text('TERMS AND CONDITIONS', MARGIN, y);
      y += 10;
      doc.font('Helvetica').fontSize(7).fillColor(COLORS.darkGray)
        .text(`1. Payment terms: ${safe(paymentTerms)}.\n2. All disputes subject to local jurisdiction.\n3. Interest @ 18% p.a. will be charged on delayed payments.`, MARGIN, y, { width: CONTENT_W / 2 - 15, lineGap: 1.5 });

      doc.font('Helvetica-Bold').fontSize(7).fillColor(COLORS.accentBlue).text('REMARKS', col2X, sec7StartY);
      doc.font('Helvetica').fontSize(7).fillColor(COLORS.darkGray)
        .text(safe(invoice.description, 'No custom remarks specified.'), col2X, sec7StartY + 10, { width: CONTENT_W / 2 - 15, lineGap: 1.5 });

      y = Math.max(y + 35, sec7StartY + 45);
      hLine(doc, y, COLORS.border);
      y += 10;

      // ─── 8. SIGNATURE BLOCKS ────────────────────────────────────────────────
      if (y + 55 > PAGE_H - MARGIN - 30) {
        doc.addPage();
        y = MARGIN;
      }

      const sigW = 160;
      doc.strokeColor(COLORS.black).lineWidth(0.8)
        .moveTo(MARGIN, y + 28).lineTo(MARGIN + sigW, y + 28).stroke();
      doc.font('Helvetica-Bold').fontSize(7).fillColor(COLORS.midGray)
        .text("Buyer's / Receiver's Signature", MARGIN, y + 30, { width: sigW });
      doc.font('Helvetica').fontSize(6.5).fillColor(COLORS.lightGray)
        .text('Name, Designation & Date', MARGIN, y + 40, { width: sigW });

      const sigRX = PAGE_W - MARGIN - sigW;
      doc.strokeColor(COLORS.black).lineWidth(0.8)
        .moveTo(sigRX, y + 28).lineTo(sigRX + sigW, y + 28).stroke();
      doc.font('Helvetica-Bold').fontSize(7).fillColor(COLORS.midGray)
        .text(`For ${company.name}`, sigRX, y + 30, { width: sigW, align: 'right' });
      doc.font('Helvetica').fontSize(6.5).fillColor(COLORS.lightGray)
        .text('Authorized Signatory', sigRX, y + 40, { width: sigW, align: 'right' });

      // ─── 9. Add page footers ────────────────────────────────────────────────
      const totalPages = doc.bufferedPageRange().count;
      for (let i = 0; i < totalPages; i++) {
        doc.switchToPage(i);
        drawPageFooter(doc, invoiceNumber, i + 1, totalPages);
      }

      doc.end();
    } catch (err) {
      reject(err);
    }
  });
};
