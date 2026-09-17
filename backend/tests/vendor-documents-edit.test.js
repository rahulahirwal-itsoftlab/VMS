import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const root = path.resolve(process.cwd(), '..');
const read = (...parts) => fs.readFileSync(path.join(root, ...parts), 'utf8');
const backend = (...parts) => read('backend', ...parts);
const frontend = (...parts) => read('frontend', ...parts);

test('vendor document model, migration, upload middleware, and routes are implemented', () => {
  const schema = backend('prisma', 'schema.prisma');
  const migration = backend('prisma', 'migrations', '20260717002000_add_vendor_documents', 'migration.sql');
  const routes = backend('src', 'modules', 'vendors', 'vendor.routes.js');
  const upload = backend('src', 'modules', 'vendors', 'vendor-document.upload.js');
  const service = backend('src', 'modules', 'vendors', 'vendor.service.js');

  assert.match(schema, /model VendorDocument/);
  assert.match(schema, /documents\s+VendorDocument\[\]/);
  assert.match(schema, /pan_number\s+String\?/);
  assert.match(schema, /bank_name\s+String\?/);
  assert.match(migration, /CREATE TABLE IF NOT EXISTS "vendor_documents"/);
  assert.match(routes, /\/:id\/documents/);
  assert.match(routes, /\/:id\/documents\/:documentId\/download/);
  assert.match(upload, /application\/pdf/);
  assert.match(upload, /image\/png/);
  assert.match(upload, /image\/jpeg/);
  assert.match(upload, /10 \* 1024 \* 1024/);
  assert.match(service, /vendor_document_uploaded/);
  assert.match(service, /vendor_document_replaced/);
  assert.match(service, /vendor_document_deleted/);
});

test('vendor validation supports GST, PAN, phone, and document types without vendorCode edits', () => {
  const validation = backend('src', 'modules', 'vendors', 'vendor.validation.js');

  assert.match(validation, /gstRegex/);
  assert.match(validation, /panRegex/);
  assert.match(validation, /phoneRegex/);
  assert.match(validation, /GST_CERTIFICATE/);
  assert.match(validation, /PAN_CARD/);
  assert.match(validation, /VENDOR_AGREEMENT/);
  assert.doesNotMatch(validation, /vendorCode/);
});

test('frontend exposes edit vendor route and document management panel', () => {
  const routes = frontend('src', 'routes', 'AppRoutes.jsx');
  const form = frontend('src', 'pages', 'Vendors', 'AddVendor.jsx');
  const panel = frontend('src', 'components', 'vendors', 'VendorDocumentsPanel.jsx');
  const vendorService = frontend('src', 'services', 'vendorService.js');

  assert.match(routes, /\/vendors\/:id\/edit/);
  assert.match(form, /useParams/);
  assert.match(form, /getVendorById/);
  assert.match(form, /updateVendor/);
  assert.match(form, /readOnly/);
  assert.match(panel, /Upload/);
  assert.match(panel, /Preview/);
  assert.match(panel, /Download/);
  assert.match(panel, /Replace/);
  assert.match(panel, /Delete/);
  assert.match(panel, /10 MB/);
  assert.match(vendorService, /multipart\/form-data/);
  assert.match(vendorService, /responseType: "blob"/);
});

test('vendor master data flows from schema through API mapping to details cards', () => {
  const schema = backend('prisma', 'schema.prisma');
  const migration = backend('prisma', 'migrations', '20260720006000_vendor_master_data_fields', 'migration.sql');
  const validation = backend('src', 'modules', 'vendors', 'vendor.validation.js');
  const service = backend('src', 'modules', 'vendors', 'vendor.service.js');
  const vendorService = frontend('src', 'services', 'vendorService.js');
  const form = frontend('src', 'pages', 'Vendors', 'AddVendor.jsx');
  const detail = frontend('src', 'pages', 'Vendors', 'VendorDetails.jsx');

  for (const field of ['vendor_type', 'cin', 'msme_number', 'tax_type', 'contact_designation', 'alternate_phone', 'address_line1', 'address_line2', 'district', 'country', 'account_holder', 'bank_branch']) {
    assert.match(schema, new RegExp(`${field}\\s+String\\?`));
    assert.match(migration, new RegExp(`ADD COLUMN IF NOT EXISTS ${field}`));
  }

  assert.match(validation, /vendorType/);
  assert.match(validation, /taxType/);
  assert.match(validation, /accountHolder/);
  assert.match(service, /gst_number: data\.gstNumber \|\| data\.taxId/);
  assert.match(service, /address_line1: data\.addressLine1 \|\| data\.address/);
  assert.match(vendorService, /gst: vendor\.gst_number \|\| vendor\.tax_id/);
  assert.match(vendorService, /vendorType: vendor\.vendor_type/);
  assert.match(form, /name="vendorType"/);
  assert.match(form, /name="taxType"/);
  assert.match(form, /name="accountHolder"/);
  assert.match(detail, /General Information/);
  assert.match(detail, /Business Information/);
  assert.match(detail, /Contact Information/);
  assert.match(detail, /Business Address/);
  assert.match(detail, /Banking Details/);
});

test('document placeholders are removed from production vendor review pages', () => {
  const vendorList = frontend('src', 'pages', 'Vendors', 'VendorList.jsx');
  const financeReview = frontend('src', 'pages', 'Vendors', 'FinanceHeadVendorReview.jsx');

  assert.doesNotMatch(vendorList, /document database model before files can be displayed/i);
  assert.doesNotMatch(financeReview, /No file uploaded/);
  assert.match(vendorList, /VendorDocumentsPanel/);
  assert.match(financeReview, /VendorDocumentsPanel/);
});
