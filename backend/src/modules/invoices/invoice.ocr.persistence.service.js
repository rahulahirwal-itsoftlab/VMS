import { randomUUID } from 'crypto';
import prisma from '../../config/prisma.js';

// ─── Structured OCR log helper ─────────────────────────────────────────────────
const OCR_DEBUG_ENABLED = () =>
  process.env.NODE_ENV !== 'production' ||
  process.env.DEBUG_INVOICE_FLOW === 'true' ||
  process.env.DEBUG_OCR_FLOW === 'true';
/**
 * [OCR DB] channel logger — safe, never logs passwords / JWT / OTP / secrets.
 */
const ocrLog = (stage, details = {}) => {
  if (!OCR_DEBUG_ENABLED()) return;
  const safe = { ...details };
  if (safe.email !== undefined) safe.email = '[REDACTED]';
  if (safe.phone !== undefined) safe.phone = '[REDACTED]';
  if (safe.password !== undefined) safe.password = '[REDACTED]';
  if (safe.token !== undefined) safe.token = '[REDACTED]';
  if (safe.otp !== undefined) safe.otp = '[REDACTED]';
  console.info('[OCR DB]', stage, safe);
};
// ───────────────────────────────────────────────────────────────────────────────

const toJsonParam = (value) => (value === undefined ? null : JSON.stringify(value));
const OCR_STATUS_VALUES = new Set(['NOT_STARTED', 'PROCESSING', 'SUCCESS', 'PARTIAL_SUCCESS', 'LOW_CONFIDENCE', 'FAILED']);
const OCR_DOCUMENT_TYPE_VALUES = new Set(['INVOICE', 'PURCHASE_ORDER', 'DELIVERY_CHALLAN', 'GOODS_RECEIPT_NOTE', 'OTHER']);

const normalizeOcrStatus = (status) => {
  const normalized = String(status || '').toUpperCase();
  if (normalized === 'PARTIAL_DATA') return 'PARTIAL_SUCCESS';
  return OCR_STATUS_VALUES.has(normalized) ? normalized : 'FAILED'; 
};

const normalizeDocumentType = (type) => {
  const normalized = String(type || 'INVOICE').toUpperCase();
  return OCR_DOCUMENT_TYPE_VALUES.has(normalized) ? normalized : 'OTHER'; 
};

const processingStatusFromOcr = (status) => {
  const normalized = normalizeOcrStatus(status);
  if (normalized === 'SUCCESS') return 'COMPLETED';
  if (normalized === 'PARTIAL_SUCCESS' || normalized === 'LOW_CONFIDENCE') return 'PARTIAL';
  if (normalized === 'FAILED') return 'FAILED';
  return 'PROCESSING';
};

const nullableNumber = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const nullableDate = (value) => {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const uploadedFileMeta = (file = {}) => {
  const fileReference = file.filename ? `/uploads/invoices/${file.filename}` : null;
  return {
    originalFileName: file.originalname || 'Uploaded Invoice',
    storedFileName: file.filename || null,
    fileReference,
    fileType: file.mimetype || null,
    mimeType: file.mimetype || null,
    fileSize: file.size || null,
  };
};

class InvoiceOcrPersistenceService {
  async createProcessingDocument({ file, user }) {
    const id = randomUUID();
    const meta = uploadedFileMeta(file);
    ocrLog('createProcessingDocument started', {
      ocrDocumentId: id,
      originalFileName: meta.originalFileName,
      fileType: meta.fileType,
      fileSize: meta.fileSize,
      uploadedById: user?.id || null,
    });

    await prisma.$executeRawUnsafe(
      `INSERT INTO ocr_documents (
        id, original_file_name, stored_file_name, file_reference, file_type, mime_type, file_size,
        document_type, processing_status, ocr_status, uploaded_by_id,
        uploaded_at, created_at, updated_at
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7,
        'INVOICE'::"OCRDocumentType", 'UPLOADED'::"OCRProcessingStatus", 'NOT_STARTED'::"OCRStatus",
        $8, NOW(), NOW(), NOW()
      )`,
      id,
      meta.originalFileName,
      meta.storedFileName,
      meta.fileReference,
      meta.fileType,
      meta.mimeType,
      meta.fileSize,
      user?.id || null,
    );

    ocrLog('createProcessingDocument done', { ocrDocumentId: id, status: 'UPLOADED' });
    return {
      id,
      fileName: meta.originalFileName,
      storedFileName: meta.storedFileName,
      fileReference: meta.fileReference,
      fileType: meta.fileType,
      mimeType: meta.mimeType,
      fileSize: meta.fileSize,
      status: 'UPLOADED',
      confidence: null,
    };
  }

  async markDocumentProcessing({ ocrDocumentId }) {
    if (!ocrDocumentId) return;
    ocrLog('markDocumentProcessing', { ocrDocumentId });
    await prisma.$executeRawUnsafe(
      `UPDATE ocr_documents
          SET processing_status = 'PROCESSING'::"OCRProcessingStatus",
              ocr_status = 'PROCESSING'::"OCRStatus",
              processing_started_at = COALESCE(processing_started_at, NOW()),
              updated_at = NOW()
        WHERE id = $1
          AND processing_status = 'UPLOADED'::"OCRProcessingStatus"`,
      ocrDocumentId,
    );
  }

  async markDocumentFailed({ ocrDocumentId, errorMessage }) {
    if (!ocrDocumentId) return;
    ocrLog('markDocumentFailed', { ocrDocumentId, errorMessage: String(errorMessage || '').slice(0, 200) });
    await prisma.$executeRawUnsafe(
      `UPDATE ocr_documents
          SET processing_status = 'FAILED'::"OCRProcessingStatus",
              ocr_status = 'FAILED'::"OCRStatus",
              processing_completed_at = NOW(),
              error_message = $1,
              updated_at = NOW()
        WHERE id = $2
          AND processing_status NOT IN ('COMPLETED'::"OCRProcessingStatus", 'PARTIAL'::"OCRProcessingStatus")`,
      String(errorMessage || 'OCR processing failed.').slice(0, 2000),
      ocrDocumentId,
    );
  }

  async completeDocumentWithExtraction({
    ocrDocumentId,
    file,
    user,
    ocrResult,
    extracted,
    invoiceDraft,
    extractionSummary,
    matchingReadiness,
    matchedVendor,
    matchedPurchaseOrder,
    matchedGrn,
    matchedDeliveryChallan,
    duplicateInvoice,
    vendorMatchConflict,
  }) {
    const draftId = randomUUID();
    const ocrExtractionId = randomUUID();
    const meta = uploadedFileMeta(file);
    const pageCount = Number(extracted.document?.pageCount || extracted.extractionSummary?.totalPages || 0) || null;
    const ocrStatus = normalizeOcrStatus(ocrResult.status);
    const processingStatus = processingStatusFromOcr(ocrStatus);
    const documentType = normalizeDocumentType(extracted.document?.documentType || 'INVOICE');
    const header = invoiceDraft.header || extracted.header || {};
    const references = invoiceDraft.references || extracted.references || {};
    const vendor = invoiceDraft.vendor || extracted.vendor || {};
    const totals = invoiceDraft.totals || extracted.totals || {};
    const terms = invoiceDraft.terms || extracted.terms || {};
    const draftStatus = ocrResult.status === 'FAILED'
      ? 'FAILED'
      : extractionSummary?.missingOptionalFields?.length
        ? 'REQUIRES_MANUAL_INPUT'
        : 'READY_FOR_REVIEW';

    ocrLog('completeDocumentWithExtraction started', {
      ocrDocumentId,
      ocrExtractionId,
      draftId,
      ocrStatus,
      processingStatus,
      draftStatus,
      vendorId: matchedVendor?.id || null,
      vendorCode: matchedVendor?.vendor_code || null,
      purchaseOrderId: matchedPurchaseOrder?.id || null,
      poNumber: matchedPurchaseOrder?.po_number || null,
      grnId: matchedGrn?.id || null,
      dcId: matchedDeliveryChallan?.id || null,
      hasDuplicate: Boolean(duplicateInvoice),
    });

    await prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(
        `UPDATE ocr_documents
            SET document_type = $1::"OCRDocumentType",
                processing_status = $2::"OCRProcessingStatus",
                ocr_status = $3::"OCRStatus",
                ocr_confidence = $4,
                processing_completed_at = NOW(),
                error_message = $5,
                purchase_order_id = $6,
                vendor_id = $7,
                updated_at = NOW()
          WHERE id = $8`,
        documentType,
        processingStatus,
        ocrStatus,
        nullableNumber(ocrResult.confidence),
        extracted.reason || null,
        matchedPurchaseOrder?.id || null,
        matchedVendor?.id || null,
        ocrDocumentId,
      );

      await tx.$executeRawUnsafe(
        `INSERT INTO ocr_extractions (
          id, ocr_document_id, extraction_version, extraction_engine, language, page_count,
          processing_status, ocr_status, ocr_confidence, started_at, completed_at, error_message,
          invoice_number, invoice_date, due_date, invoice_type, currency, payment_terms,
          po_number, grn_number, delivery_challan_number, vendor_name, vendor_code, gst_number, pan_number, contact_person,
          email, phone, vendor_address, subtotal, discount, taxable_amount, cgst, sgst,
          igst, total_tax, other_charges, round_off, grand_total,
          raw_text, raw_text_summary, raw_ocr_response, structured_data, invoice_draft,
          extraction_summary, matching_readiness, vendor_match_conflict, duplicate_invoice, created_by_id,
          created_at, updated_at
        ) VALUES (
          $1, $2, 1, $3, $4, $5,
          $6::"OCRProcessingStatus", $7::"OCRStatus", $8, NOW(), NOW(), $9,
          $10, $11, $12, $13, $14, $15,
          $16, $17, $18, $19, $20, $21, $22, $23,
          $24, $25, $26, $27, $28, $29, $30, $31,
          $32, $33, $34, $35, $36,
          $37, $38, $39::jsonb, $40::jsonb, $41::jsonb,
          $42::jsonb, $43::jsonb, $44::jsonb, $45::jsonb, $46,
          NOW(), NOW()
        )`,
        ocrExtractionId,
        ocrDocumentId,
        'pdfjs-dist+tesseract.js',
        'eng',
        pageCount,
        processingStatus,
        ocrStatus,
        nullableNumber(ocrResult.confidence),
        extracted.reason || null,
        header.invoiceNumber || null,
        nullableDate(header.invoiceDate),
        nullableDate(header.dueDate),
        header.invoiceCategory || header.invoiceType || null,
        header.currency || totals.currency || 'INR',
        terms.paymentTerms || vendor.paymentTerms || matchedPurchaseOrder?.payment_terms || null,
        references.poNumber || matchedPurchaseOrder?.po_number || null,
        references.grnNumber || matchedGrn?.grn_number || null,
        references.deliveryChallanNumber || matchedDeliveryChallan?.delivery_challan_number || null,
        vendor.vendorName || vendor.name || matchedVendor?.name || null,
        vendor.vendorCode || matchedVendor?.vendor_code || null,
        vendor.gstin || vendor.gstNumber || matchedVendor?.gst_number || matchedVendor?.tax_id || null,
        vendor.pan || vendor.panNumber || matchedVendor?.pan_number || null,
        vendor.contactPerson || matchedVendor?.contact_person || null,
        vendor.email || matchedVendor?.email || null,
        vendor.phone || matchedVendor?.phone || null,
        vendor.address || vendor.vendorAddress || matchedVendor?.address || null,
        nullableNumber(totals.subtotal),
        nullableNumber(totals.discount || totals.totalDiscount),
        nullableNumber(totals.taxableAmount),
        nullableNumber(totals.cgst || totals.cgstTotal),
        nullableNumber(totals.sgst || totals.sgstTotal),
        nullableNumber(totals.igst || totals.igstTotal),
        nullableNumber(totals.totalTax || totals.taxTotal || (Number(totals.cgst || totals.cgstTotal || 0) + Number(totals.sgst || totals.sgstTotal || 0) + Number(totals.igst || totals.igstTotal || 0))),
        nullableNumber(totals.otherCharges),
        nullableNumber(totals.roundOff),
        nullableNumber(totals.grandTotal || totals.total),
        extracted.rawText || null,
        extracted.rawTextSummary || null,
        toJsonParam(ocrResult),
        toJsonParam(extracted),
        toJsonParam(invoiceDraft),
        toJsonParam(extractionSummary),
        toJsonParam(matchingReadiness),
        toJsonParam(vendorMatchConflict),
        toJsonParam(duplicateInvoice),
        user?.id || null,
      );

      for (const [index, item] of (Array.isArray(invoiceDraft.lineItems) ? invoiceDraft.lineItems : []).entries()) {
        await tx.$executeRawUnsafe(
          `INSERT INTO ocr_extraction_items (
            id, ocr_extraction_id, line_number, item_name, item_code, description, hsn_code, quantity, uom,
            unit_price, discount, taxable_amount, tax_rate, cgst, sgst, igst, line_total,
            confidence, source_text, bounding_box, raw_item, created_at, updated_at
          ) VALUES (
            $1, $2, $3, $4, $5, $6, $7, $8, $9,
            $10, $11, $12, $13, $14, $15, $16, $17,
            $18, $19, $20::jsonb, $21::jsonb, NOW(), NOW()
          )`,
          randomUUID(),
          ocrExtractionId,
          index + 1,
          item.itemName || item.name || null,
          item.itemCode || item.code || item.sku || null,
          item.description || item.itemName || null,
          item.hsnCode || item.hsnSac || item.hsn_sac || null,
          nullableNumber(item.quantity),
          item.uom || item.unit || null,
          nullableNumber(item.unitPrice || item.unit_price || item.price),
          nullableNumber(item.discount),
          nullableNumber(item.taxableAmount || item.taxable_amount),
          nullableNumber(item.taxRate || item.tax_rate || item.gstRate || item.gst_rate),
          nullableNumber(item.cgst),
          nullableNumber(item.sgst),
          nullableNumber(item.igst),
          nullableNumber(item.total || item.lineTotal || item.line_total),
          nullableNumber(item.confidence),
          item.sourceText || item.source_text || null,
          toJsonParam(item.boundingBox || item.bounding_box || null),
          toJsonParam(item),
        );
      }

      await tx.$executeRawUnsafe(
        `INSERT INTO ocr_invoice_drafts (
          id, ocr_document_id, source_file_name, file_url, mime_type, file_size, ocr_status, ocr_confidence,
          page_count, draft_status, raw_text, raw_text_summary, structured_data, invoice_draft,
          extraction_summary, matching_readiness, vendor_match_conflict, duplicate_invoice,
          matched_vendor_id, matched_purchase_order_id, selected_grn_id, selected_delivery_challan_id,
          created_by_id, created_at, updated_at
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8,
          $9, $10, $11, $12, $13::jsonb, $14::jsonb,
          $15::jsonb, $16::jsonb, $17::jsonb, $18::jsonb,
          $19, $20, $21, $22,
          $23, NOW(), NOW()
        )`,
        draftId,
        ocrDocumentId,
        meta.originalFileName,
        meta.fileReference,
        meta.mimeType,
        meta.fileSize,
        ocrResult.status,
        Number(ocrResult.confidence || 0),
        pageCount,
        draftStatus,
        extracted.rawText || null,
        extracted.rawTextSummary || null,
        toJsonParam(extracted),
        toJsonParam(invoiceDraft),
        toJsonParam(extractionSummary),
        toJsonParam(matchingReadiness),
        toJsonParam(vendorMatchConflict),
        toJsonParam(duplicateInvoice),
        matchedVendor?.id || null,
        matchedPurchaseOrder?.id || null,
        matchedGrn?.id || null,
        matchedDeliveryChallan?.id || null,
        user?.id || null,
      );
    });

    const result = {
      id: draftId,
      ocrDocumentId,
      ocrExtractionId,
      sourceFileName: meta.originalFileName,
      fileUrl: meta.fileReference,
      mimeType: meta.mimeType,
      fileSize: meta.fileSize,
      ocrStatus: ocrResult.status,
      ocrConfidence: Number(ocrResult.confidence || 0),
      pageCount,
      draftStatus,
    };
    ocrLog('completeDocumentWithExtraction done', {
      ocrDocumentId,
      draftId,
      draftStatus,
      ocrStatus,
    });
    return result;
  }

  async getDraftRecord(draftId, user) {
    const rows = await prisma.$queryRawUnsafe(
      `SELECT * FROM ocr_invoice_drafts
       WHERE id = $1
         AND deleted_at IS NULL
         AND ($2::text IS NULL OR created_by_id = $2 OR $3::text IN ('SUPER_ADMIN','FINANCE_HEAD'))
       LIMIT 1`,
      draftId,
      user?.id || null,
      user?.role || null,
    );
    return rows?.[0] || null;
  }

  async getDraftRecordByOcrDocumentId(ocrDocumentId, user) {
    const rows = await prisma.$queryRawUnsafe(
      `SELECT * FROM ocr_invoice_drafts
       WHERE ocr_document_id = $1
         AND deleted_at IS NULL
         AND ($2::text IS NULL OR created_by_id = $2 OR $3::text IN ('SUPER_ADMIN','FINANCE_HEAD'))
       ORDER BY created_at DESC
       LIMIT 1`,
      ocrDocumentId,
      user?.id || null,
      user?.role || null,
    );
    return rows?.[0] || null;
  }

  async getDocumentRecord(ocrDocumentId, user) {
    const rows = await prisma.$queryRawUnsafe(
      `SELECT *
         FROM ocr_documents
        WHERE id = $1
          AND deleted_at IS NULL
          AND ($2::text IS NULL OR uploaded_by_id = $2 OR $3::text IN ('SUPER_ADMIN','FINANCE_HEAD'))
        LIMIT 1`,
      ocrDocumentId,
      user?.id || null,
      user?.role || null,
    );
    return rows?.[0] || null;
  }
}

export default new InvoiceOcrPersistenceService();
