DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'OCRProcessingStatus') THEN
    CREATE TYPE "OCRProcessingStatus" AS ENUM ('UPLOADED', 'PROCESSING', 'COMPLETED', 'PARTIAL', 'FAILED');
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'OCRStatus') THEN
    CREATE TYPE "OCRStatus" AS ENUM ('NOT_STARTED', 'PROCESSING', 'SUCCESS', 'PARTIAL_SUCCESS', 'LOW_CONFIDENCE', 'FAILED');
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'OCRDocumentType') THEN
    CREATE TYPE "OCRDocumentType" AS ENUM ('INVOICE', 'PURCHASE_ORDER', 'DELIVERY_CHALLAN', 'GOODS_RECEIPT_NOTE', 'OTHER');
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS "ocr_documents" (
  "id" TEXT PRIMARY KEY,
  "original_file_name" TEXT NOT NULL,
  "stored_file_name" TEXT,
  "file_reference" TEXT,
  "file_type" TEXT,
  "mime_type" TEXT,
  "file_size" INTEGER,
  "document_type" "OCRDocumentType" NOT NULL DEFAULT 'INVOICE',
  "processing_status" "OCRProcessingStatus" NOT NULL DEFAULT 'UPLOADED',
  "ocr_status" "OCRStatus" NOT NULL DEFAULT 'NOT_STARTED',
  "ocr_confidence" DECIMAL(5, 2),
  "processing_started_at" TIMESTAMP(3),
  "processing_completed_at" TIMESTAMP(3),
  "error_message" TEXT,
  "uploaded_by_id" TEXT,
  "uploaded_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "invoice_id" TEXT,
  "purchase_order_id" TEXT,
  "vendor_id" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "deleted_at" TIMESTAMP(3)
);

CREATE TABLE IF NOT EXISTS "ocr_extractions" (
  "id" TEXT PRIMARY KEY,
  "ocr_document_id" TEXT NOT NULL,
  "extraction_version" INTEGER NOT NULL DEFAULT 1,
  "extraction_engine" TEXT,
  "engine_version" TEXT,
  "language" TEXT,
  "page_count" INTEGER,
  "processing_status" "OCRProcessingStatus" NOT NULL DEFAULT 'PROCESSING',
  "ocr_status" "OCRStatus" NOT NULL DEFAULT 'PROCESSING',
  "ocr_confidence" DECIMAL(5, 2),
  "started_at" TIMESTAMP(3),
  "completed_at" TIMESTAMP(3),
  "error_message" TEXT,
  "invoice_number" TEXT,
  "invoice_date" TIMESTAMP(3),
  "due_date" TIMESTAMP(3),
  "invoice_type" TEXT,
  "currency" TEXT,
  "payment_terms" TEXT,
  "po_number" TEXT,
  "vendor_name" TEXT,
  "vendor_code" TEXT,
  "gst_number" TEXT,
  "pan_number" TEXT,
  "contact_person" TEXT,
  "email" TEXT,
  "phone" TEXT,
  "vendor_address" TEXT,
  "subtotal" DECIMAL(14, 2),
  "discount" DECIMAL(14, 2),
  "taxable_amount" DECIMAL(14, 2),
  "cgst" DECIMAL(14, 2),
  "sgst" DECIMAL(14, 2),
  "igst" DECIMAL(14, 2),
  "total_tax" DECIMAL(14, 2),
  "other_charges" DECIMAL(14, 2),
  "round_off" DECIMAL(14, 2),
  "grand_total" DECIMAL(14, 2),
  "raw_text" TEXT,
  "raw_text_summary" TEXT,
  "raw_ocr_response" JSONB,
  "structured_data" JSONB,
  "invoice_draft" JSONB,
  "extraction_summary" JSONB,
  "matching_readiness" JSONB,
  "vendor_match_conflict" JSONB,
  "duplicate_invoice" JSONB,
  "created_by_id" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "deleted_at" TIMESTAMP(3)
);

CREATE TABLE IF NOT EXISTS "ocr_extraction_items" (
  "id" TEXT PRIMARY KEY,
  "ocr_extraction_id" TEXT NOT NULL,
  "line_number" INTEGER NOT NULL,
  "item_name" TEXT,
  "item_code" TEXT,
  "description" TEXT,
  "hsn_code" TEXT,
  "quantity" DECIMAL(14, 3),
  "uom" TEXT,
  "unit_price" DECIMAL(14, 2),
  "discount" DECIMAL(14, 2),
  "taxable_amount" DECIMAL(14, 2),
  "tax_rate" DECIMAL(5, 2),
  "cgst" DECIMAL(14, 2),
  "sgst" DECIMAL(14, 2),
  "igst" DECIMAL(14, 2),
  "line_total" DECIMAL(14, 2),
  "confidence" DECIMAL(5, 2),
  "source_text" TEXT,
  "bounding_box" JSONB,
  "raw_item" JSONB,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

ALTER TABLE "ocr_invoice_drafts"
  ADD COLUMN IF NOT EXISTS "ocr_document_id" TEXT;

ALTER TABLE "ocr_extractions"
  ADD COLUMN IF NOT EXISTS "invoice_number" TEXT,
  ADD COLUMN IF NOT EXISTS "invoice_date" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "due_date" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "invoice_type" TEXT,
  ADD COLUMN IF NOT EXISTS "currency" TEXT,
  ADD COLUMN IF NOT EXISTS "payment_terms" TEXT,
  ADD COLUMN IF NOT EXISTS "po_number" TEXT,
  ADD COLUMN IF NOT EXISTS "vendor_name" TEXT,
  ADD COLUMN IF NOT EXISTS "vendor_code" TEXT,
  ADD COLUMN IF NOT EXISTS "gst_number" TEXT,
  ADD COLUMN IF NOT EXISTS "pan_number" TEXT,
  ADD COLUMN IF NOT EXISTS "contact_person" TEXT,
  ADD COLUMN IF NOT EXISTS "email" TEXT,
  ADD COLUMN IF NOT EXISTS "phone" TEXT,
  ADD COLUMN IF NOT EXISTS "vendor_address" TEXT,
  ADD COLUMN IF NOT EXISTS "subtotal" DECIMAL(14, 2),
  ADD COLUMN IF NOT EXISTS "discount" DECIMAL(14, 2),
  ADD COLUMN IF NOT EXISTS "taxable_amount" DECIMAL(14, 2),
  ADD COLUMN IF NOT EXISTS "cgst" DECIMAL(14, 2),
  ADD COLUMN IF NOT EXISTS "sgst" DECIMAL(14, 2),
  ADD COLUMN IF NOT EXISTS "igst" DECIMAL(14, 2),
  ADD COLUMN IF NOT EXISTS "total_tax" DECIMAL(14, 2),
  ADD COLUMN IF NOT EXISTS "other_charges" DECIMAL(14, 2),
  ADD COLUMN IF NOT EXISTS "round_off" DECIMAL(14, 2),
  ADD COLUMN IF NOT EXISTS "grand_total" DECIMAL(14, 2),
  ADD COLUMN IF NOT EXISTS "raw_ocr_response" JSONB;

ALTER TABLE "ocr_extraction_items"
  ADD COLUMN IF NOT EXISTS "item_name" TEXT,
  ADD COLUMN IF NOT EXISTS "item_code" TEXT,
  ADD COLUMN IF NOT EXISTS "hsn_code" TEXT,
  ADD COLUMN IF NOT EXISTS "uom" TEXT,
  ADD COLUMN IF NOT EXISTS "tax_rate" DECIMAL(5, 2),
  ADD COLUMN IF NOT EXISTS "line_total" DECIMAL(14, 2);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ocr_documents_uploaded_by_id_fkey') THEN
    ALTER TABLE "ocr_documents"
      ADD CONSTRAINT "ocr_documents_uploaded_by_id_fkey"
      FOREIGN KEY ("uploaded_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ocr_documents_invoice_id_fkey') THEN
    ALTER TABLE "ocr_documents"
      ADD CONSTRAINT "ocr_documents_invoice_id_fkey"
      FOREIGN KEY ("invoice_id") REFERENCES "invoices"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ocr_documents_purchase_order_id_fkey') THEN
    ALTER TABLE "ocr_documents"
      ADD CONSTRAINT "ocr_documents_purchase_order_id_fkey"
      FOREIGN KEY ("purchase_order_id") REFERENCES "purchase_orders"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ocr_documents_vendor_id_fkey') THEN
    ALTER TABLE "ocr_documents"
      ADD CONSTRAINT "ocr_documents_vendor_id_fkey"
      FOREIGN KEY ("vendor_id") REFERENCES "vendors"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ocr_extractions_ocr_document_id_fkey') THEN
    ALTER TABLE "ocr_extractions"
      ADD CONSTRAINT "ocr_extractions_ocr_document_id_fkey"
      FOREIGN KEY ("ocr_document_id") REFERENCES "ocr_documents"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ocr_extractions_created_by_id_fkey') THEN
    ALTER TABLE "ocr_extractions"
      ADD CONSTRAINT "ocr_extractions_created_by_id_fkey"
      FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ocr_extraction_items_ocr_extraction_id_fkey') THEN
    ALTER TABLE "ocr_extraction_items"
      ADD CONSTRAINT "ocr_extraction_items_ocr_extraction_id_fkey"
      FOREIGN KEY ("ocr_extraction_id") REFERENCES "ocr_extractions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ocr_invoice_drafts_ocr_document_id_fkey') THEN
    ALTER TABLE "ocr_invoice_drafts"
      ADD CONSTRAINT "ocr_invoice_drafts_ocr_document_id_fkey"
      FOREIGN KEY ("ocr_document_id") REFERENCES "ocr_documents"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS "ocr_extractions_ocr_document_id_extraction_version_key" ON "ocr_extractions"("ocr_document_id", "extraction_version");
CREATE INDEX IF NOT EXISTS "ocr_documents_uploaded_by_id_idx" ON "ocr_documents"("uploaded_by_id");
CREATE INDEX IF NOT EXISTS "ocr_documents_invoice_id_idx" ON "ocr_documents"("invoice_id");
CREATE INDEX IF NOT EXISTS "ocr_documents_purchase_order_id_idx" ON "ocr_documents"("purchase_order_id");
CREATE INDEX IF NOT EXISTS "ocr_documents_vendor_id_idx" ON "ocr_documents"("vendor_id");
CREATE INDEX IF NOT EXISTS "ocr_documents_document_type_idx" ON "ocr_documents"("document_type");
CREATE INDEX IF NOT EXISTS "ocr_documents_processing_status_idx" ON "ocr_documents"("processing_status");
CREATE INDEX IF NOT EXISTS "ocr_documents_ocr_status_idx" ON "ocr_documents"("ocr_status");
CREATE INDEX IF NOT EXISTS "ocr_documents_uploaded_at_idx" ON "ocr_documents"("uploaded_at");
CREATE INDEX IF NOT EXISTS "ocr_extractions_ocr_document_id_idx" ON "ocr_extractions"("ocr_document_id");
CREATE INDEX IF NOT EXISTS "ocr_extractions_created_by_id_idx" ON "ocr_extractions"("created_by_id");
CREATE INDEX IF NOT EXISTS "ocr_extractions_processing_status_idx" ON "ocr_extractions"("processing_status");
CREATE INDEX IF NOT EXISTS "ocr_extractions_ocr_status_idx" ON "ocr_extractions"("ocr_status");
CREATE INDEX IF NOT EXISTS "ocr_extractions_created_at_idx" ON "ocr_extractions"("created_at");
CREATE INDEX IF NOT EXISTS "ocr_extraction_items_ocr_extraction_id_idx" ON "ocr_extraction_items"("ocr_extraction_id");
CREATE INDEX IF NOT EXISTS "ocr_extraction_items_line_number_idx" ON "ocr_extraction_items"("line_number");
CREATE INDEX IF NOT EXISTS "ocr_invoice_drafts_ocr_document_id_idx" ON "ocr_invoice_drafts"("ocr_document_id");
