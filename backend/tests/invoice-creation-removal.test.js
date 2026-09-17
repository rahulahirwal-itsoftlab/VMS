import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const backendSource = (...segments) =>
  fs.readFileSync(path.resolve('src', ...segments), 'utf8');

const frontendSource = (...segments) =>
  fs.readFileSync(path.resolve('..', 'frontend', 'src', ...segments), 'utf8');

test('invoice creation uses available purchase orders without a purchase-order approval workflow', () => {
  const routes = frontendSource('routes', 'AppRoutes.jsx');
  const invoiceList = frontendSource('pages', 'Invoices', 'InvoiceList.jsx');
  const invoiceCreate = frontendSource('pages', 'Invoices', 'InvoiceCreate.jsx');
  const invoiceDetails = frontendSource('pages', 'Invoices', 'InvoiceDetails.jsx');
  const purchaseOrderCreate = frontendSource('pages', 'PurchaseOrders', 'PurchaseOrderCreate.jsx');
  const purchaseOrderList = frontendSource('pages', 'PurchaseOrders', 'PurchaseOrderList.jsx');
  const client = frontendSource('services', 'invoiceService.js');
  const poClient = frontendSource('services', 'purchaseOrderServices.js');

  assert.match(routes, /import InvoiceCreate/);
  assert.match(routes, /path="\/invoices\/new" element=\{<InvoiceCreate \/>/);
  assert.match(invoiceList, /to="\/invoices\/new"/);
  assert.match(invoiceList, /Create Invoice/);
  assert.match(invoiceCreate, /getApprovedPurchaseOrdersForInvoice/);
  assert.match(invoiceCreate, /getPurchaseOrderForInvoice/);
  assert.match(invoiceCreate, /createInvoice/);
  assert.match(invoiceCreate, /Invoice Creation Method/);
  assert.match(invoiceCreate, /Manual Entry/);
  assert.match(invoiceCreate, /Upload Invoice \(OCR\)/);
  assert.match(invoiceCreate, /Invoice Attachment <span className="font-medium text-slate-400">\(Optional\)<\/span>/);
  assert.match(invoiceCreate, /Invoice Summary/);
  assert.match(invoiceCreate, /Generated automatically after submission/);
  assert.match(invoiceCreate, /Cannot create Invoice/);
  assert.match(invoiceCreate, /validateBeforeSubmit/);
  assert.match(invoiceCreate, /focusValidationTarget/);
  assert.match(invoiceCreate, /applyServerValidationErrors/);
  assert.match(invoiceCreate, /previewInvoiceFile/);
  assert.match(invoiceCreate, /downloadInvoiceFile/);
  assert.match(invoiceCreate, /<article key=\{`\$\{item\.lineNumber/);
  assert.doesNotMatch(invoiceCreate, /<table/);
  assert.doesNotMatch(invoiceCreate, /HSN Code|<Field label="Unit"\s|item\.unit\b/);
  assert.doesNotMatch(purchaseOrderCreate, /HSN Code|label="Unit"|unit: "Nos"|item\.unit/);
  assert.doesNotMatch(purchaseOrderList, /label="HSN"|item\.hsnCode|label="Unit"/);
  assert.doesNotMatch(client, /hsnCode|unit: first\(item\.unit/);
  assert.doesNotMatch(poClient, /hsnCode: item\.hsnCode|unit: item\.unit/);
  assert.match(invoiceDetails, /View Invoice/);
  assert.match(invoiceDetails, /Download PDF/);
  assert.match(invoiceDetails, /Print Invoice/);
  assert.match(invoiceDetails, /companyLogo/);
  assert.match(invoiceDetails, /Delivery Challan Number/);
  assert.match(invoiceDetails, /handleDownloadPdf/);
  assert.match(invoiceDetails, /Not Available|Not Provided|Not Uploaded|Awaiting Data/);
  assert.doesNotMatch(invoiceDetails, /OCR Confidence|Validation Owner|GL Code|IRN|E-Way Bill|Internal Cost Center|Source File Name/);
  assert.doesNotMatch(invoiceDetails, /HSN Code|<Detail label="Unit"\s|item\.unit\b/);
  assert.doesNotMatch(invoiceCreate, /Math\.random|mock|fake|placeholderData/);
  assert.doesNotMatch(invoiceCreate, /approved purchase orders|approved purchase order/i);
  assert.match(client, /export const createInvoice/);
  assert.match(client, /export const getPurchaseOrderForInvoice/);
  assert.match(client, /\/v1\/purchase-orders\/\$\{purchaseOrderId\}/);
  assert.doesNotMatch(client, /formData\.append\("invoiceNumber"/);
  assert.match(client, /formData\.append\("invoiceCreationMethod"/);
  assert.match(client, /multipart\/form-data/);
  assert.match(client, /\/v1\/invoices\/approved-purchase-orders/);
});

test('invoice creation backend uses PO source of truth with optional attachments and manual or OCR method', () => {
  const routes = backendSource('modules', 'invoices', 'invoice.routes.js');
  const controller = backendSource('modules', 'invoices', 'invoice.controller.js');
  const repository = backendSource('modules', 'invoices', 'invoice.repository.js');
  const service = backendSource('modules', 'invoices', 'invoice.service.js');
  const validation = backendSource('modules', 'invoices', 'invoice.validation.js');
  const schema = backendSource('..', 'prisma', 'schema.prisma');
  const createSchema = validation.slice(
    validation.indexOf('export const createInvoiceSchema'),
    validation.indexOf('export const approvedPurchaseOrdersForInvoiceSchema'),
  );

  assert.match(routes, /uploadInvoiceFile\.fields/);
  assert.match(routes, /invoiceController\.createInvoice/);
  assert.match(routes, /approved-purchase-orders/);
  assert.match(controller, /createInvoice\s*=/);
  assert.match(controller, /getApprovedPurchaseOrdersForInvoice\s*=/);
  assert.doesNotMatch(service, /Invoice Attachment is required/);
  assert.match(service, /generateInvoiceNumber/);
  assert.match(service, /INV-\$\{year\}-\$\{String\(nextValue\)\.padStart\(6, '0'\)\}/);
  assert.doesNotMatch(service, /payload\.invoiceNumber\.trim\(\)/);
  assert.match(service, /invoice_number: invoiceNumber/);
  assert.match(service, /invoice_creation_method: invoiceCreationMethod/);
  assert.match(service, /file_url: invoiceFileUrl/);
  assert.match(service, /if \(attachmentRows\.length > 0\)/);
  assert.match(service, /An invoice with this invoice number already exists/);
  assert.match(service, /Cannot create an invoice from a cancelled Purchase Order/);
  assert.match(service, /BUSINESS_VALIDATION_ERROR/);
  assert.match(service, /Invoice Amount cannot exceed the Purchase Order amount/);
  assert.match(service, /status: 'created'/);
  assert.match(service, /purchaseOrder\.status !== 'created'/);
  assert.doesNotMatch(service, /Purchase Order Pending Approval|notifyPurchaseOrderApprovalRequested/);
  assert.match(service, /isVendorApprovedAndActive/);
  assert.match(service, /line_items: purchaseOrder\.line_items/);
  assert.match(service, /tax_summary: purchaseOrder\.tax_summary/);
  assert.match(repository, /delivery_challans/);
  assert.match(repository, /grns/);
  assert.match(validation, /createInvoiceSchema/);
  assert.doesNotMatch(createSchema, /Invoice number is required/);
  assert.doesNotMatch(createSchema, /invoiceNumber/);
  assert.match(validation, /INVOICE_CREATION_METHODS = \['MANUAL', 'OCR'\]/);
  assert.match(createSchema, /Due Date is required/);
  assert.doesNotMatch(createSchema, /Remarks are required/);
  assert.match(service, /throwInvoiceValidationError/);
  assert.match(service, /Purchase Order item details are missing/);
  assert.match(service, /GST details and Grand Total are missing/);
  assert.match(schema, /invoice_creation_method String @default\("MANUAL"\)/);
  assert.match(schema, /ocr_status\s+String\? @default\("NOT_STARTED"\)/);
  assert.match(schema, /line_items\s+Json\?/);
  assert.match(schema, /tax_summary\s+Json\?/);
  assert.match(schema, /file_url\s+String\?/);
});

test('invoice number sequence migration is idempotent and preserves existing generated numbers', () => {
  const migration = fs.readFileSync(
    path.resolve('prisma', 'migrations', '20260719004000_invoice_number_sequence', 'migration.sql'),
    'utf8',
  );

  assert.match(migration, /CREATE SEQUENCE IF NOT EXISTS invoice_number_seq/);
  assert.match(migration, /regexp_match\(invoice_number, '\^INV-\[0-9\]\{4\}-\(\[0-9\]\+\)\$'\)/);
  assert.match(migration, /setval\('invoice_number_seq', max_existing_number, true\)/);
});
