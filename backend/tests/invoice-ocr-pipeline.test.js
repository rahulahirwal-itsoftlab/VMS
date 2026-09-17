import assert from 'node:assert/strict';
import test, { after } from 'node:test';
import PDFDocument from 'pdfkit';
import { createCanvas } from '@napi-rs/canvas';
import {
  __testables,
  isMeaningfulInvoiceText,
  OCR_FIELD_EXTRACTION_MAP,
  processInvoiceOcr,
  shutdownInvoiceOcr,
} from '../src/modules/invoices/invoice.ocr.service.js';
import { createInvoiceSchema } from '../src/modules/invoices/invoice.validation.js';
import { buildInvoiceDraft, buildVendorLookupAttempts } from '../src/modules/invoices/invoice.controller.js';

after(async () => {
  await shutdownInvoiceOcr();
});

const invoiceLines = [
  'TAX INVOICE',
  'Invoice No: INV-2026-00125',
  'Invoice Date: 25/07/2026',
  'Due Date: 24/08/2026',
  'Vendor Name: ABC Industries Pvt Ltd',
  'Vendor GSTIN: 27ABCDE1234F1Z5',
  'Vendor PAN: ABCDE1234F',
  'Buyer Name: Example Buyer Pvt Ltd',
  'Buyer GSTIN: 27AAAAA1111A1Z1',
  'PO Number: PO-2026-000008',
  'GRN Number: GRN-2026-000021',
  'Delivery Challan Number: DC-2026-000034',
  'Payment Terms: Net 30',
  'Currency: INR',
  'Description HSN Qty Unit Price Taxable Amount Total',
  'Consulting Service 9983 2 1000.00 2000.00 2360.00',
  'Subtotal: INR 2000.00',
  'CGST: INR 180.00',
  'SGST: INR 180.00',
  'Tax Total: INR 360.00',
  'Grand Total: INR 2360.00',
  'Amount in Words: Rupees Two Thousand Three Hundred Sixty Only',
];

const createPdf = (pages) => new Promise((resolve, reject) => {
  const document = new PDFDocument({ autoFirstPage: false, compress: true });
  const chunks = [];
  document.on('data', (chunk) => chunks.push(chunk));
  document.on('error', reject);
  document.on('end', () => resolve(Buffer.concat(chunks)));
  pages.forEach((page) => {
    document.addPage({ size: 'A4', margin: 45 });
    if (Buffer.isBuffer(page)) {
      document.image(page, 25, 25, { fit: [545, 790], align: 'center', valign: 'center' });
    } else {
      document.font('Helvetica').fontSize(12).text(page, { lineGap: 5 });
    }
  });
  document.end();
});

const createInvoiceImage = (lines = invoiceLines) => {
  const canvas = createCanvas(1654, 2339);
  const context = canvas.getContext('2d');
  context.fillStyle = '#ffffff';
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.fillStyle = '#111111';
  context.font = '32px Arial';
  lines.forEach((line, index) => context.fillText(line, 90, 100 + (index * 70)));
  return canvas.toBuffer('image/png');
};

test('PDF internals are rejected as meaningless invoice text', () => {
  assert.equal(
    isMeaningfulInvoiceText('%PDF-1.3 3 0 obj /Type /Page /MediaBox [0 0 595 841] /Resources /Font endobj endstream'),
    false,
  );
  assert.equal(__testables.detectDocumentType(Buffer.from('%PDF-1.7\n')), 'application/pdf');
  assert.equal(__testables.detectDocumentType(Buffer.from('not a document')), null);
});

test('structured parser keeps invoice, PO, GRN, and challan identifiers separate', () => {
  const result = __testables.parseInvoice(invoiceLines.join('\n'), 'invoice.pdf', 98, [
    { pageNumber: 1, source: 'PDF_TEXT', confidence: 98 },
  ]);
  assert.ok(['SUCCESS', 'PARTIAL_SUCCESS'].includes(result.status));
  assert.equal(result.extractedData.header.invoiceNumber, 'INV-2026-00125');
  assert.equal(result.extractedData.header.invoiceDate, '2026-07-25');
  assert.equal(result.extractedData.references.poNumber, 'PO-2026-000008');
  assert.equal(result.extractedData.references.grnNumber, 'GRN-2026-000021');
  assert.equal(result.extractedData.references.deliveryChallanNumber, 'DC-2026-000034');
  assert.equal(result.extractedData.totals.grandTotal, 2360);
  assert.equal(result.extractedData.lineItems.length, 1);
  assert.equal(result.extractedData.lineItems[0].hsnSac, '9983');
});

test('structured parser extracts compact uploaded invoice fields', () => {
  const uploadedInvoiceText = [
    'TAX INVOICE',
    'Invoice Number INV-2026-008502 Invoice Date 28 Jul 2026 Due Date 30 Jul 2026',
    'Vendor Name ashish pvt.lmt Vendor Code VND-001008 GSTIN 27ABCDE1234F1Z6 PAN PQRST5678M',
    'PO Number PO/2026/000026 PO Date 28 Jul 2026',
    'GRN Number GRN-2026-000017 Delivery Challan DC-2026-000017',
    'Payment terms Net 60',
    'Vendor bank details Bank Name HDFC Bank Branch Pune Account Holder ashish pvt.lmt Account Number 123456789012 IFSC HDFC0001234',
    'Item Code 102 Item Name Room spray Quantity 50 PCS Unit Price 500 Taxable Amount 25,000 IGST 4,500 Grand Total 29,500',
  ].join('\n');

  const result = __testables.parseInvoice(uploadedInvoiceText, 'uploaded-invoice.pdf', 98, [
    { pageNumber: 1, source: 'PDF_TEXT', confidence: 98, text: uploadedInvoiceText },
  ]);

  assert.equal(result.extractedData.header.invoiceNumber, 'INV-2026-008502');
  assert.equal(result.extractedData.header.invoiceDate, '2026-07-28');
  assert.equal(result.extractedData.header.dueDate, '2026-07-30');
  assert.equal(result.extractedData.vendor.vendorName, 'ashish pvt.lmt');
  assert.equal(result.extractedData.vendor.vendorCode, 'VND-001008');
  assert.equal(result.extractedData.vendor.gstin, '27ABCDE1234F1Z6');
  assert.equal(result.extractedData.vendor.pan, 'PQRST5678M');
  assert.equal(result.extractedData.references.poNumber, 'PO/2026/000026');
  assert.equal(result.extractedData.references.poDate, '2026-07-28');
  assert.equal(result.extractedData.references.grnNumber, 'GRN-2026-000017');
  assert.equal(result.extractedData.references.deliveryChallanNumber, 'DC-2026-000017');
  assert.equal(result.extractedData.header.paymentTerms, 'Net 60');
  assert.deepEqual(result.extractedData.invoice, {
    invoiceNumber: 'INV-2026-008502',
    invoiceDate: '2026-07-28',
    receiptDate: null,
    dueDate: '2026-07-30',
    invoiceCategory: 'TAX_INVOICE',
    currency: 'INR',
    paymentTerms: 'Net 60',
  });
  assert.equal(result.extractedData.bank.bankName, 'HDFC Bank');
  assert.equal(result.extractedData.payment.bankName, 'HDFC Bank');
  assert.equal(result.extractedData.payment.accountHolder, 'ashish pvt.lmt');
  assert.equal(result.extractedData.payment.accountNumber, '123456789012');
  assert.equal(result.extractedData.payment.ifsc, 'HDFC0001234');
  assert.equal(result.extractedData.bank.accountName, 'ashish pvt.lmt');
  assert.equal(result.extractedData.bank.accountNumber, '123456789012');
  assert.equal(result.extractedData.bank.ifscCode, 'HDFC0001234');
  assert.equal(result.extractedData.lineItems.length, 1);
  assert.equal(result.extractedData.lineItems[0].itemCode, '102');
  assert.equal(result.extractedData.lineItems[0].itemName, 'Room spray');
  assert.equal(result.extractedData.lineItems[0].quantity, 50);
  assert.equal(result.extractedData.lineItems[0].unit, 'PCS');
  assert.equal(result.extractedData.lineItems[0].unitPrice, 500);
  assert.equal(result.extractedData.lineItems[0].taxableAmount, 25000);
  assert.equal(result.extractedData.lineItems[0].igstAmount, 4500);
  assert.equal(result.extractedData.items[0].igst, 4500);
  assert.equal(result.extractedData.items[0].gstAmount, 4500);
  assert.equal(result.extractedData.totals.taxableAmount, 25000);
  assert.equal(result.extractedData.totals.igst, 4500);
  assert.equal(result.extractedData.totals.igstTotal, 4500);
  assert.equal(result.extractedData.totals.discount, null);
  assert.equal(result.extractedData.totals.grandTotal, 29500);
  assert.ok(result.confidence >= 90 && result.confidence < 100);
  assert.equal(result.extractedData.extractionSummary.confidenceBreakdown.extractionQualityConfidence, result.confidence);
  assert.equal(result.extractedData.extractionSummary.fieldsExtracted, 11);
  assert.equal(result.extractedData.extractionSummary.totalFields, 11);
  assert.equal(result.extractedData.extractionSummary.coreFieldsExtracted, 11);
  assert.equal(result.extractedData.extractionSummary.coreTotalFields, 11);
  assert.ok(result.extractedData.extractionSummary.optionalTotalFields > result.extractedData.extractionSummary.coreTotalFields);
});

test('structured parser searches invoice aliases across all major sections', () => {
  const aliasInvoiceText = [
    'TAX INVOICE',
    'Tax Invoice No INV-ALIAS-009 Bill Date 28 Jul 2026 Payment Due 30 Jul 2026',
    'Supplier Zenith Components Company Vendor No VND-ALIAS-77 GST Number 27ABCDE1234F1Z6 PAN Number PQRST5678M',
    'Purchase Order Number PO/2026/000026 Date 28 Jul 2026',
    'Goods Receipt GRN-2026-000017 DC Number DC-2026-000017',
    'Credit Days Net 60 Currency INR',
    'Bank Name Axis Bank IFSC UTIB0001234 Account 998877665544 Branch Mumbai',
    'Item Code 102 Item Name Room spray Description Room spray freshener Quantity 50 PCS Price 500 GST 18% Taxable Amount 25,000 IGST 4,500 Discount 0 Round Off 0 Line Total 29,500 Grand Total 29,500',
  ].join('\n');

  const result = __testables.parseInvoice(aliasInvoiceText, 'Invoice.pdf', 98, [
    { pageNumber: 1, source: 'PDF_TEXT', confidence: 98, text: aliasInvoiceText },
  ]);

  assert.equal(result.extractedData.header.invoiceNumber, 'INV-ALIAS-009');
  assert.equal(result.extractedData.header.invoiceDate, '2026-07-28');
  assert.equal(result.extractedData.header.dueDate, '2026-07-30');
  assert.equal(result.extractedData.header.currency, 'INR');
  assert.equal(result.extractedData.header.paymentTerms, 'Net 60');
  assert.equal(result.extractedData.vendor.vendorName, 'Zenith Components');
  assert.equal(result.extractedData.vendor.vendorCode, 'VND-ALIAS-77');
  assert.equal(result.extractedData.vendor.gstin, '27ABCDE1234F1Z6');
  assert.equal(result.extractedData.vendor.pan, 'PQRST5678M');
  assert.equal(result.extractedData.references.poNumber, 'PO/2026/000026');
  assert.equal(result.extractedData.references.poDate, '2026-07-28');
  assert.equal(result.extractedData.references.grnNumber, 'GRN-2026-000017');
  assert.equal(result.extractedData.references.deliveryChallanNumber, 'DC-2026-000017');
  assert.equal(result.extractedData.bank.bankName, 'Axis Bank');
  assert.equal(result.extractedData.bank.ifscCode, 'UTIB0001234');
  assert.equal(result.extractedData.bank.accountNumber, '998877665544');
  assert.equal(result.extractedData.bank.branch, 'Mumbai');
  assert.equal(result.extractedData.totals.taxableAmount, 25000);
  assert.equal(result.extractedData.totals.igstTotal, 4500);
  assert.equal(result.extractedData.totals.totalDiscount, 0);
  assert.equal(result.extractedData.totals.roundOff, 0);
  assert.equal(result.extractedData.totals.grandTotal, 29500);
  assert.equal(result.extractedData.lineItems.length, 1);
  assert.equal(result.extractedData.lineItems[0].itemCode, '102');
  assert.equal(result.extractedData.lineItems[0].itemName, 'Room spray');
  assert.equal(result.extractedData.lineItems[0].description, 'Room spray freshener');
  assert.equal(result.extractedData.lineItems[0].quantity, 50);
  assert.equal(result.extractedData.lineItems[0].unit, 'PCS');
  assert.equal(result.extractedData.lineItems[0].unitPrice, 500);
  assert.equal(result.extractedData.lineItems[0].taxRate, 18);
  assert.equal(result.extractedData.lineItems[0].lineTotal, 29500);
  assert.ok(result.extractedData.extractionSummary.fieldsExtracted > 4);
});

test('structured parser tolerates fuzzy OCR keyword labels for core fields', () => {
  const fuzzyInvoiceText = [
    'TAX INVOICE',
    'lnvo1ce N0: INV-FUZZY-501',
    'Bill Date: 28 Jul 2026',
    'Vendor C0de: VND-FUZZ-77',
    'Purchse Order Ref: PO/2026/000026',
    'G00ds Receipt Number: GRN-2026-000017',
    'Dellvery Chalan No: DC-2026-000017',
    'Bas1c Amount: INR 25,000',
    'Inv0ice Amount: INR 29,500',
  ].join('\n');

  const result = __testables.parseInvoice(fuzzyInvoiceText, 'fuzzy-invoice.pdf', 98, [
    { pageNumber: 1, source: 'OCR', confidence: 98, text: fuzzyInvoiceText },
  ]);

  assert.equal(result.extractedData.header.invoiceNumber, 'INV-FUZZY-501');
  assert.equal(result.extractedData.vendor.vendorCode, 'VND-FUZZ-77');
  assert.equal(result.extractedData.references.poNumber, 'PO/2026/000026');
  assert.equal(result.extractedData.references.grnNumber, 'GRN-2026-000017');
  assert.equal(result.extractedData.references.deliveryChallanNumber, 'DC-2026-000017');
  assert.equal(result.extractedData.totals.subtotal, 25000);
  assert.equal(result.extractedData.totals.grandTotal, 29500);
});

test('structured parser extracts all available enterprise invoice fields', () => {
  const fullInvoiceText = [
    'TAX INVOICE',
    'Invoice Number: INV-FULL-2026-001',
    'Invoice Date: 28 Jul 2026',
    'Due Date: 30 Jul 2026',
    'Status: Pending',
    'Priority: High',
    'Currency: INR',
    'Payment Terms: Net 60',
    'Invoice Category: Tax Invoice',
    'Vendor Name: Ashish Pvt Ltd',
    'Vendor Code: VND-001008',
    'Vendor Category: MSME',
    'Vendor Type: Manufacturer',
    'GSTIN: 27ABCDE1234F1Z6',
    'PAN: PQRST5678M',
    'Contact Person: Ashish Kumar',
    'Phone: 9876543210',
    'Email: ashish@example.com',
    'Vendor Address: Pune Maharashtra 411001',
    'PO Number: PO/2026/000026',
    'PO Date: 28 Jul 2026',
    'GRN Number: GRN-2026-000017',
    'Delivery Challan Number: DC-2026-000017',
    'Bank Name: HDFC Bank',
    'Branch: Pune',
    'Account Holder: Ashish Pvt Ltd',
    'Account Number: 123456789012',
    'IFSC: HDFC0001234',
    'Item Code Item Name Description Quantity UOM Unit Price GST % GST Amount Taxable Amount Line Total',
    '102 Room Spray Room freshener 50 PCS 500 18% 4500 25000 29500',
    '103 Cleaner Floor cleaner 10 PCS 100 18% 180 1000 1180',
    'Subtotal: INR 26000',
    'Discount: INR 0',
    'Taxable Amount: INR 26000',
    'CGST: INR 0',
    'SGST: INR 0',
    'IGST: INR 4680',
    'GST Total: INR 4680',
    'Round Off: INR 0',
    'Grand Total: INR 30680',
    'Amount in Words: Rupees Thirty Thousand Six Hundred Eighty Only',
    'Remarks: Verified against PO and GRN',
  ].join('\n');

  const result = __testables.parseInvoice(fullInvoiceText, 'enterprise-invoice.pdf', 98, [
    { pageNumber: 1, source: 'PDF_TEXT', confidence: 98, text: fullInvoiceText },
  ]);

  assert.equal(result.extractedData.header.invoiceNumber, 'INV-FULL-2026-001');
  assert.equal(result.extractedData.header.invoiceDate, '2026-07-28');
  assert.equal(result.extractedData.header.dueDate, '2026-07-30');
  assert.equal(result.extractedData.header.status, 'PENDING');
  assert.equal(result.extractedData.header.priority, 'HIGH');
  assert.equal(result.extractedData.header.currency, 'INR');
  assert.equal(result.extractedData.header.paymentTerms, 'Net 60');
  assert.equal(result.extractedData.header.invoiceCategory, 'TAX_INVOICE');
  assert.equal(result.extractedData.vendor.vendorName, 'Ashish Pvt Ltd');
  assert.equal(result.extractedData.vendor.vendorCode, 'VND-001008');
  assert.equal(result.extractedData.vendor.vendorCategory, 'MSME');
  assert.equal(result.extractedData.vendor.vendorType, 'Manufacturer');
  assert.equal(result.extractedData.vendor.gstin, '27ABCDE1234F1Z6');
  assert.equal(result.extractedData.vendor.pan, 'PQRST5678M');
  assert.equal(result.extractedData.vendor.contactPerson, 'Ashish Kumar');
  assert.equal(result.extractedData.vendor.phone, '9876543210');
  assert.equal(result.extractedData.vendor.email, 'ashish@example.com');
  assert.equal(result.extractedData.vendor.address, 'Pune Maharashtra 411001');
  assert.equal(result.extractedData.references.poNumber, 'PO/2026/000026');
  assert.equal(result.extractedData.references.poDate, '2026-07-28');
  assert.equal(result.extractedData.references.grnNumber, 'GRN-2026-000017');
  assert.equal(result.extractedData.references.deliveryChallanNumber, 'DC-2026-000017');
  assert.equal(result.extractedData.bank.bankName, 'HDFC Bank');
  assert.equal(result.extractedData.bank.branch, 'Pune');
  assert.equal(result.extractedData.bank.accountHolder, 'Ashish Pvt Ltd');
  assert.equal(result.extractedData.bank.accountNumber, '123456789012');
  assert.equal(result.extractedData.bank.ifscCode, 'HDFC0001234');
  assert.equal(result.extractedData.lineItems.length, 2);
  assert.equal(result.extractedData.lineItems[0].itemCode, '102');
  assert.equal(result.extractedData.lineItems[0].itemName, 'Room Spray Room freshener');
  assert.equal(result.extractedData.lineItems[0].quantity, 50);
  assert.equal(result.extractedData.lineItems[0].unit, 'PCS');
  assert.equal(result.extractedData.lineItems[0].unitPrice, 500);
  assert.equal(result.extractedData.lineItems[0].taxRate, 18);
  assert.equal(result.extractedData.lineItems[0].gstAmount, 4500);
  assert.equal(result.extractedData.lineItems[0].taxableAmount, 25000);
  assert.equal(result.extractedData.lineItems[0].lineTotal, 29500);
  assert.equal(result.extractedData.totals.subtotal, 26000);
  assert.equal(result.extractedData.totals.totalDiscount, 0);
  assert.equal(result.extractedData.totals.taxableAmount, 26000);
  assert.equal(result.extractedData.totals.cgstTotal, 0);
  assert.equal(result.extractedData.totals.sgstTotal, 0);
  assert.equal(result.extractedData.totals.igstTotal, 4680);
  assert.equal(result.extractedData.totals.taxTotal, 4680);
  assert.equal(result.extractedData.totals.roundOff, 0);
  assert.equal(result.extractedData.totals.grandTotal, 30680);
  assert.equal(result.extractedData.totals.amountInWords, 'Rupees Thirty Thousand Six Hundred Eighty Only');
  assert.equal(result.extractedData.terms.remarks, 'Verified against PO and GRN');
});

test('text PDF extracts visible page text rather than PDF object syntax', { timeout: 120_000 }, async () => {
  const buffer = await createPdf([invoiceLines.join('\n')]);
  const result = await processInvoiceOcr({
    buffer,
    mimetype: 'application/pdf',
    originalname: 'text-invoice.pdf',
  });
  assert.notEqual(result.status, 'FAILED');
  assert.equal(result.extractedData.header.invoiceNumber, 'INV-2026-00125');
  assert.equal(result.extractedData.document.pages[0].source, 'PDF_TEXT');
  assert.doesNotMatch(result.extractedData.rawTextSummary, /\/MediaBox|endobj|\/BaseFont/);
});

test('multi-page text PDF processes every page and combines fields', { timeout: 120_000 }, async () => {
  const buffer = await createPdf([
    invoiceLines.slice(0, 10).join('\n'),
    invoiceLines.slice(10).join('\n'),
  ]);
  const result = await processInvoiceOcr({
    buffer,
    mimetype: 'application/pdf',
    originalname: 'multi-page-text-invoice.pdf',
  });
  assert.equal(result.extractedData.document.pageCount, 2);
  assert.equal(result.extractedData.document.pagesProcessed, 2);
  assert.equal(result.extractedData.document.pageCoverage, 100);
  assert.equal(result.extractedData.references.deliveryChallanNumber, 'DC-2026-000034');
  assert.equal(result.extractedData.totals.grandTotal, 2360);
});

test('image invoice uses OCR and extracts real invoice fields', { timeout: 180_000 }, async () => {
  const result = await processInvoiceOcr({
    buffer: createInvoiceImage(),
    mimetype: 'image/png',
    originalname: 'image-invoice.png',
  });
  assert.notEqual(result.status, 'FAILED');
  assert.equal(result.extractedData.document.pages[0].source, 'OCR');
  assert.equal(result.extractedData.header.invoiceNumber, 'INV-2026-00125');
  assert.equal(result.extractedData.references.poNumber, 'PO-2026-000008');
});

test('scanned and mixed multi-page PDFs use OCR only on pages without meaningful text', { timeout: 240_000 }, async () => {
  const image = createInvoiceImage(invoiceLines.slice(3));
  const scannedPdf = await createPdf([createInvoiceImage()]);
  const scannedResult = await processInvoiceOcr({
    buffer: scannedPdf,
    mimetype: 'application/pdf',
    originalname: 'scanned-invoice.pdf',
  });
  assert.notEqual(scannedResult.status, 'FAILED');
  assert.equal(scannedResult.extractedData.document.pages[0].source, 'OCR');
  assert.equal(scannedResult.extractedData.header.invoiceNumber, 'INV-2026-00125');

  const mixedPdf = await createPdf([
    invoiceLines.slice(0, 3).join('\n'),
    image,
  ]);
  const mixedResult = await processInvoiceOcr({
    buffer: mixedPdf,
    mimetype: 'application/pdf',
    originalname: 'mixed-multipage-invoice.pdf',
  });
  assert.notEqual(mixedResult.status, 'FAILED');
  assert.equal(mixedResult.extractedData.document.pages.length, 2);
  assert.ok(mixedResult.extractedData.document.pages.every((page) => ['PDF_TEXT', 'OCR'].includes(page.source)));
  assert.equal(mixedResult.extractedData.document.pageCount, 2);
  assert.equal(mixedResult.extractedData.references.poNumber, 'PO-2026-000008');
});

test('multi-page scanned PDF OCRs every page', { timeout: 240_000 }, async () => {
  const scannedPdf = await createPdf([
    createInvoiceImage(invoiceLines.slice(0, 11)),
    createInvoiceImage(invoiceLines.slice(11)),
  ]);
  const result = await processInvoiceOcr({
    buffer: scannedPdf,
    mimetype: 'application/pdf',
    originalname: 'multi-page-scanned-invoice.pdf',
  });
  assert.equal(result.extractedData.document.pageCount, 2);
  assert.deepEqual(result.extractedData.document.pages.map((page) => page.source), ['OCR', 'OCR']);
  assert.equal(result.extractedData.references.poNumber, 'PO-2026-000008');
  assert.equal(result.extractedData.totals.grandTotal, 2360);
});

test('purchase order and invoice document types are identified from content', () => {
  const poText = [
    'PURCHASE ORDER',
    'PO Number: PO-2026-000008',
    'PO Date: 25/07/2026',
    'Vendor Name: ABC Industries Pvt Ltd',
    'Vendor GSTIN: 27ABCDE1234F1Z5',
    'Description HSN Qty Rate Amount',
    'Product A 8471 10 500 5000',
    'Grand Total: INR 5000',
  ].join('\n');
  const poResult = __testables.parseInvoice(poText, 'po.pdf', 98, [
    { pageNumber: 1, source: 'PDF_TEXT', confidence: 98, text: poText },
  ]);
  const invoiceText = invoiceLines.join('\n');
  const invoiceResult = __testables.parseInvoice(invoiceText, 'invoice.pdf', 98, [
    { pageNumber: 1, source: 'PDF_TEXT', confidence: 98, text: invoiceText },
  ]);
  assert.equal(poResult.extractedData.documentType, 'PURCHASE_ORDER');
  assert.equal(poResult.extractedData.header.invoiceNumber, null);
  assert.equal(poResult.extractedData.references.poNumber, 'PO-2026-000008');
  assert.equal(invoiceResult.extractedData.documentType, 'TAX_INVOICE');
});

test('large and continued line-item tables are combined across pages', () => {
  const header = 'Description HSN Qty Rate Taxable Amount Total';
  const pageOneRows = Array.from({ length: 15 }, (_, index) =>
    `Product Page One ${index + 1} 8471 ${index + 1} 100.00 ${(index + 1) * 100}.00 ${(index + 1) * 118}.00`
  );
  const pageTwoRows = Array.from({ length: 15 }, (_, index) =>
    `Product Page Two ${index + 1} 8471 ${index + 1} 200.00 ${(index + 1) * 200}.00 ${(index + 1) * 236}.00`
  );
  const firstPage = [
    'TAX INVOICE',
    'Invoice No: INV-LARGE-001',
    'Invoice Date: 25/07/2026',
    header,
    ...pageOneRows,
  ].join('\n');
  const secondPage = [
    ...pageTwoRows,
    'Grand Total: INR 63720.00',
  ].join('\n');
  const result = __testables.parseInvoice(`${firstPage}\n${secondPage}`, 'large.pdf', 98, [
    { pageNumber: 1, source: 'PDF_TEXT', confidence: 98, text: firstPage },
    { pageNumber: 2, source: 'PDF_TEXT', confidence: 98, text: secondPage },
  ]);
  assert.equal(result.extractedData.lineItems.length, 30);
  assert.equal(result.extractedData.extractionSummary.lineItemsExtracted, 30);
  assert.equal(result.extractedData.lineItems[29].description, 'Product Page Two 15');
});

test('OCR invoice creation allows the existing backend sequence to generate a missing invoice number', () => {
  const parsed = createInvoiceSchema.safeParse({
    body: {
      purchaseOrderId: '11111111-1111-4111-8111-111111111111',
      invoiceCreationMethod: 'OCR',
      ocrDocumentId: '22222222-2222-4222-8222-222222222222',
      invoiceSource: 'UPLOADED_PDF',
      invoiceCategory: 'TAX_INVOICE',
      invoiceDate: '2026-07-25',
      dueDate: '2026-08-24',
      lineItems: JSON.stringify([{ description: 'Verified service', quantity: 1, unitPrice: 100, total: 118 }]),
    },
  });
  assert.equal(parsed.success, true);
  assert.equal(parsed.data.body.invoiceNumber, undefined);
});

test('invoice draft enriches missing OCR fields from matched database records and records provenance', () => {
  const draft = buildInvoiceDraft({
    extracted: {
      documentType: 'PURCHASE_ORDER',
      header: { invoiceNumber: null, invoiceDate: null, dueDate: null, paymentTerms: null },
      vendor: { phone: '9999999727' },
      references: { poNumber: 'PO-2026-000008' },
      lineItems: [],
      totals: {},
    },
    matchedVendor: {
      name: 'Database Vendor Pvt Ltd',
      vendor_code: 'VEN-000123',
      gst_number: '27ABCDE1234F1Z5',
      pan_number: 'ABCDE1234F',
      email: 'accounts@example.test',
      phone: '9999999727',
      address: 'Verified database address',
      payment_terms: 'Net 45',
      bank_name: 'Verified Bank',
      bank_account_no: '123456789012',
      ifsc_code: 'ABCD0123456',
    },
    matchedPurchaseOrder: {
      po_number: 'PO-2026-000008',
      order_date: new Date('2026-07-01T00:00:00.000Z'),
      currency: 'INR',
      amount: 1180,
      payment_terms: 'Net 45',
      line_items: [{ description: 'Database item', quantity: 1, unitPrice: 1000, lineTotal: 1180 }],
      tax_summary: { subtotal: 1000, totalGst: 180, grandTotal: 1180 },
    },
    matchedGrn: { grn_number: 'GRN-2026-000021' },
    matchedDeliveryChallan: { delivery_challan_number: 'DC-2026-000034' },
  });
  assert.equal(draft.header.invoiceNumber, null);
  assert.equal(draft.fieldSources.header.invoiceNumber, 'SYSTEM_GENERATED');
  assert.equal(draft.header.paymentTerms, 'Net 45');
  assert.equal(draft.vendor.vendorName, 'Database Vendor Pvt Ltd');
  assert.equal(draft.fieldSources.vendor.vendorName, 'DATABASE_MATCHED');
  assert.equal(draft.lineItems.length, 1);
  assert.equal(draft.fieldSources.lineItems[0], 'DATABASE_MATCHED');
  assert.equal(draft.references.grnNumber, 'GRN-2026-000021');
  assert.equal(draft.totals.grandTotal, 1180);
});

test('vendor enrichment lookup uses prioritized OCR identifiers before company name', () => {
  const attempts = buildVendorLookupAttempts({
    vendorCode: 'VND-001008',
    vendorId: '4d1b9b74-8bb4-4c2b-a4f0-3fb9ce6d2a10',
    gstin: '27ABCDE1234F1Z6',
    pan: 'PQRST5678M',
    email: 'accounts@ashish.example',
    phone: '+91 98765 43210',
    vendorName: 'Ashish Pvt Ltd',
  });

  assert.deepEqual(attempts.map((attempt) => attempt.method), [
    'VENDOR_CODE',
    'GST',
    'VENDOR_ID',
    'COMPANY_NAME',
    'PAN',
    'EMAIL',
    'PHONE',
    'COMPANY_NAME_CONTAINS',
  ]);
  assert.equal(attempts[0].where.OR[0].vendor_code.equals, 'VND-001008');
  assert.equal(attempts[1].where.OR[0].gst_number.equals, '27ABCDE1234F1Z6');
  assert.equal(attempts[2].where.OR[0].id, '4d1b9b74-8bb4-4c2b-a4f0-3fb9ce6d2a10');
  assert.equal(attempts[3].where.name.equals, 'Ashish Pvt Ltd');
  assert.equal(attempts[4].where.pan_number.equals, 'PQRST5678M');
  assert.equal(attempts[5].where.email.equals, 'accounts@ashish.example');
});

test('OCR field extraction map groups invoice business aliases by semantic section', () => {
  assert.ok(OCR_FIELD_EXTRACTION_MAP.invoice.invoiceNumber.includes('Tax Invoice No'));
  assert.ok(OCR_FIELD_EXTRACTION_MAP.vendor.vendorCode.includes('Supplier Code'));
  assert.ok(OCR_FIELD_EXTRACTION_MAP.references.deliveryChallanNumber.includes('Delivery Challan Number'));
  assert.ok(OCR_FIELD_EXTRACTION_MAP.items.unitPrice.includes('Rate'));
  assert.ok(OCR_FIELD_EXTRACTION_MAP.payment.ifsc.includes('IFSC'));
});
