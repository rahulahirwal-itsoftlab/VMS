import 'dotenv/config';
import prisma from '../src/config/prisma.js';

const args = Object.fromEntries(
  process.argv.slice(2).map((arg) => {
    const [key, ...valueParts] = arg.replace(/^--/, '').split('=');
    return [key, valueParts.join('=') || true];
  }),
);

const uuidLike = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const first = (rows) => Array.isArray(rows) && rows.length ? rows[0] : null;
const pass = (label, details = {}) => ({ label, ok: true, details });
const fail = (label, details = {}) => ({ label, ok: false, details });

const usage = () => {
  console.log([
    'Usage:',
    '  npm run verify:ocr-invoice -- --invoice-id=<uuid>',
    '  npm run verify:ocr-invoice -- --ocr-document-id=<uuid>',
    '  npm run verify:ocr-invoice -- --draft-id=<uuid>',
    '  npm run verify:ocr-invoice -- --latest',
    '',
    'This is read-only. It verifies persisted OCR invoice records in PostgreSQL via Prisma.',
  ].join('\n'));
};

const requireUuid = (name, value) => {
  if (!value) return null;
  if (!uuidLike.test(String(value))) {
    throw new Error(`${name} must be a UUID.`);
  }
  return String(value);
};

const normalizeLineItems = (value) => {
  if (Array.isArray(value)) return value;
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

const main = async () => {
  const input = {
    invoiceId: requireUuid('invoice-id', args['invoice-id']),
    ocrDocumentId: requireUuid('ocr-document-id', args['ocr-document-id']),
    draftId: requireUuid('draft-id', args['draft-id']),
    latest: Boolean(args.latest),
  };

  if (!input.invoiceId && !input.ocrDocumentId && !input.draftId && !input.latest) {
    usage();
    return;
  }

  let invoiceId = input.invoiceId;
  let ocrDocumentId = input.ocrDocumentId;
  let draft = null;

  if (input.latest && !invoiceId && !ocrDocumentId && !input.draftId) {
    const latest = first(await prisma.$queryRawUnsafe(
      `SELECT id, invoice_id
         FROM ocr_documents
        WHERE invoice_id IS NOT NULL
          AND deleted_at IS NULL
        ORDER BY updated_at DESC
        LIMIT 1`,
    ));
    invoiceId = latest?.invoice_id || null;
    ocrDocumentId = latest?.id || null;
  }

  if (input.draftId) {
    draft = first(await prisma.$queryRawUnsafe(
      `SELECT id, invoice_id, ocr_document_id, matched_purchase_order_id, matched_vendor_id, draft_status, ocr_status
         FROM ocr_invoice_drafts
        WHERE id = $1
          AND deleted_at IS NULL`,
      input.draftId,
    ));
    invoiceId ||= draft?.invoice_id || null;
    ocrDocumentId ||= draft?.ocr_document_id || null;
  }

  if (ocrDocumentId && !invoiceId) {
    const docRef = first(await prisma.$queryRawUnsafe(
      `SELECT invoice_id
         FROM ocr_documents
        WHERE id = $1
          AND deleted_at IS NULL`,
      ocrDocumentId,
    ));
    invoiceId = docRef?.invoice_id || null;
  }

  if (invoiceId && !ocrDocumentId) {
    const docRef = first(await prisma.$queryRawUnsafe(
      `SELECT id
         FROM ocr_documents
        WHERE invoice_id = $1
          AND deleted_at IS NULL
        ORDER BY updated_at DESC
        LIMIT 1`,
      invoiceId,
    ));
    ocrDocumentId = docRef?.id || null;
  }

  const [invoice, ocrDocument] = await Promise.all([
    invoiceId ? prisma.$queryRawUnsafe(
      `SELECT i.id,
              i.invoice_number,
              i.invoice_creation_method,
              i.invoice_source,
              i.ocr_status,
              i.ocr_confidence,
              i.purchase_order_id,
              i.vendor_id,
              i.line_items,
              i.status,
              i.required_approval_role,
              i.current_approval_level,
              i.three_way_match_status,
              i.three_way_match_percentage,
              po.po_number,
              po.vendor_id AS po_vendor_id,
              v.vendor_code,
              v.name AS vendor_name
         FROM invoices i
         JOIN purchase_orders po ON po.id = i.purchase_order_id
         JOIN vendors v ON v.id = i.vendor_id
        WHERE i.id = $1
          AND i.deleted_at IS NULL`,
      invoiceId,
    ) : [],
    ocrDocumentId ? prisma.$queryRawUnsafe(
      `SELECT id,
              original_file_name,
              processing_status,
              ocr_status,
              ocr_confidence,
              invoice_id,
              purchase_order_id,
              vendor_id
         FROM ocr_documents
        WHERE id = $1
          AND deleted_at IS NULL`,
      ocrDocumentId,
    ) : [],
  ]);

  const invoiceRecord = first(invoice);
  const documentRecord = first(ocrDocument);
  invoiceId ||= invoiceRecord?.id || documentRecord?.invoice_id || null;
  ocrDocumentId ||= documentRecord?.id || null;

  const [extractions, extractionItemCounts, drafts, matches, approvals] = await Promise.all([
    ocrDocumentId ? prisma.$queryRawUnsafe(
      `SELECT id, invoice_number, po_number, grn_number, delivery_challan_number, grand_total, processing_status, ocr_status, ocr_confidence
         FROM ocr_extractions
        WHERE ocr_document_id = $1
          AND deleted_at IS NULL
        ORDER BY extraction_version DESC, created_at DESC`,
      ocrDocumentId,
    ) : [],
    ocrDocumentId ? prisma.$queryRawUnsafe(
      `SELECT e.id AS extraction_id, COUNT(item.id)::int AS item_count
         FROM ocr_extractions e
         LEFT JOIN ocr_extraction_items item ON item.ocr_extraction_id = e.id
        WHERE e.ocr_document_id = $1
          AND e.deleted_at IS NULL
        GROUP BY e.id
        ORDER BY MAX(e.created_at) DESC`,
      ocrDocumentId,
    ) : [],
    ocrDocumentId ? prisma.$queryRawUnsafe(
      `SELECT id, invoice_id, ocr_document_id, matched_purchase_order_id, matched_vendor_id, draft_status, ocr_status
         FROM ocr_invoice_drafts
        WHERE ocr_document_id = $1
          AND deleted_at IS NULL
        ORDER BY updated_at DESC`,
      ocrDocumentId,
    ) : [],
    invoiceId ? prisma.$queryRawUnsafe(
      `SELECT id,
              invoice_id,
              purchase_order_id,
              grn_id,
              delivery_challan_id,
              status,
              match_percentage,
              vendor_match,
              po_match,
              item_match,
              quantity_match,
              price_match,
              tax_match,
              total_match,
              mismatch_details
         FROM three_way_matches
        WHERE invoice_id = $1
        ORDER BY created_at DESC`,
      invoiceId,
    ) : [],
    invoiceId ? prisma.$queryRawUnsafe(
      `SELECT id, invoice_id, three_way_match_id, status, approval_status, required_role
         FROM payment_approvals
        WHERE invoice_id = $1
        ORDER BY created_at DESC`,
      invoiceId,
    ) : [],
  ]);

  const latestExtraction = first(extractions);
  const latestDraft = draft || first(drafts);
  const latestMatch = first(matches);
  const invoiceItems = normalizeLineItems(invoiceRecord?.line_items);
  const latestExtractionItemCount = first(extractionItemCounts)?.item_count || 0;

  const checks = [
    documentRecord ? pass('OCRDocument exists', {
      id: documentRecord.id,
      processingStatus: documentRecord.processing_status,
      ocrStatus: documentRecord.ocr_status,
      invoiceId: documentRecord.invoice_id,
    }) : fail('OCRDocument exists', { ocrDocumentId }),
    latestExtraction ? pass('OCRExtraction exists', {
      id: latestExtraction.id,
      invoiceNumber: latestExtraction.invoice_number,
      poNumber: latestExtraction.po_number,
      grnNumber: latestExtraction.grn_number,
      deliveryChallanNumber: latestExtraction.delivery_challan_number,
      ocrStatus: latestExtraction.ocr_status,
    }) : fail('OCRExtraction exists', { ocrDocumentId }),
    latestExtractionItemCount > 0 ? pass('OCRExtractionItem rows exist', {
      extractionId: latestExtraction?.id,
      itemCount: latestExtractionItemCount,
    }) : fail('OCRExtractionItem rows exist', { extractionId: latestExtraction?.id || null, itemCount: latestExtractionItemCount }),
    invoiceRecord ? pass('Invoice exists', {
      id: invoiceRecord.id,
      invoiceNumber: invoiceRecord.invoice_number,
      method: invoiceRecord.invoice_creation_method,
      status: invoiceRecord.status,
    }) : fail('Invoice exists', { invoiceId }),
    invoiceItems.length > 0 ? pass('Invoice item data exists in invoices.line_items JSON', {
      itemCount: invoiceItems.length,
    }) : fail('Invoice item data exists in invoices.line_items JSON', { itemCount: invoiceItems.length }),
    invoiceRecord?.purchase_order_id ? pass('Invoice is linked to PurchaseOrder', {
      purchaseOrderId: invoiceRecord.purchase_order_id,
      poNumber: invoiceRecord.po_number,
    }) : fail('Invoice is linked to PurchaseOrder'),
    invoiceRecord?.vendor_id ? pass('Invoice is linked to Vendor', {
      vendorId: invoiceRecord.vendor_id,
      vendorCode: invoiceRecord.vendor_code,
      vendorName: invoiceRecord.vendor_name,
    }) : fail('Invoice is linked to Vendor'),
    documentRecord?.invoice_id === invoiceRecord?.id ? pass('OCRDocument is linked to Invoice', {
      ocrDocumentId: documentRecord?.id,
      invoiceId: invoiceRecord?.id,
    }) : fail('OCRDocument is linked to Invoice', {
      ocrDocumentInvoiceId: documentRecord?.invoice_id || null,
      invoiceId: invoiceRecord?.id || null,
    }),
    latestDraft?.invoice_id === invoiceRecord?.id ? pass('OCRInvoiceDraft is linked to Invoice', {
      draftId: latestDraft?.id,
      invoiceId: invoiceRecord?.id,
    }) : fail('OCRInvoiceDraft is linked to Invoice', {
      draftId: latestDraft?.id || null,
      draftInvoiceId: latestDraft?.invoice_id || null,
      invoiceId: invoiceRecord?.id || null,
    }),
    latestMatch ? pass('3-Way Matching relationship exists', {
      matchId: latestMatch.id,
      status: latestMatch.status,
      purchaseOrderId: latestMatch.purchase_order_id,
      grnId: latestMatch.grn_id,
      deliveryChallanId: latestMatch.delivery_challan_id,
    }) : fail('3-Way Matching relationship exists', { invoiceId }),
    latestMatch ? pass('3-Way Matching flags are stored', {
      vendorMatch: latestMatch.vendor_match,
      poMatch: latestMatch.po_match,
      itemMatch: latestMatch.item_match,
      quantityMatch: latestMatch.quantity_match,
      priceMatch: latestMatch.price_match,
      taxMatch: latestMatch.tax_match,
      totalMatch: latestMatch.total_match,
    }) : fail('3-Way Matching flags are stored'),
    pass('Approval workflow state is inspectable', {
      invoiceStatus: invoiceRecord?.status || null,
      requiredApprovalRole: invoiceRecord?.required_approval_role || null,
      currentApprovalLevel: invoiceRecord?.current_approval_level || null,
      paymentApprovalCount: approvals.length,
    }),
  ];

  const ok = checks.every((check) => check.ok);
  console.log(JSON.stringify({
    success: ok,
    input,
    resolved: { invoiceId, ocrDocumentId, draftId: latestDraft?.id || input.draftId || null },
    checks,
    counts: {
      ocrExtractions: extractions.length,
      ocrExtractionItems: latestExtractionItemCount,
      ocrInvoiceDrafts: drafts.length || (draft ? 1 : 0),
      threeWayMatches: matches.length,
      paymentApprovals: approvals.length,
      invoiceItems: invoiceItems.length,
    },
  }, null, 2));

  if (!ok) process.exitCode = 1;
};

main()
  .catch((error) => {
    console.error('[OCR Verify] Failed:', {
      name: error?.name,
      code: error?.code,
      message: error?.message,
    });
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
