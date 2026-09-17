CREATE TABLE IF NOT EXISTS "ocr_invoice_drafts" (
  "id" TEXT PRIMARY KEY,
  "source_file_name" TEXT NOT NULL,
  "file_url" TEXT,
  "mime_type" TEXT,
  "file_size" INTEGER,
  "ocr_status" TEXT NOT NULL DEFAULT 'PROCESSING',
  "ocr_confidence" DECIMAL(5, 2),
  "page_count" INTEGER,
  "draft_status" TEXT NOT NULL DEFAULT 'READY_FOR_REVIEW',
  "raw_text" TEXT,
  "raw_text_summary" TEXT,
  "structured_data" JSONB,
  "invoice_draft" JSONB,
  "extraction_summary" JSONB,
  "matching_readiness" JSONB,
  "vendor_match_conflict" JSONB,
  "duplicate_invoice" JSONB,
  "invoice_id" TEXT,
  "matched_vendor_id" TEXT,
  "matched_purchase_order_id" TEXT,
  "selected_grn_id" TEXT,
  "selected_delivery_challan_id" TEXT,
  "created_by_id" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "deleted_at" TIMESTAMP(3)
);

ALTER TABLE "ocr_invoice_drafts"
  ADD CONSTRAINT "ocr_invoice_drafts_created_by_id_fkey"
  FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "ocr_invoice_drafts"
  ADD CONSTRAINT "ocr_invoice_drafts_invoice_id_fkey"
  FOREIGN KEY ("invoice_id") REFERENCES "invoices"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "ocr_invoice_drafts"
  ADD CONSTRAINT "ocr_invoice_drafts_matched_vendor_id_fkey"
  FOREIGN KEY ("matched_vendor_id") REFERENCES "vendors"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "ocr_invoice_drafts"
  ADD CONSTRAINT "ocr_invoice_drafts_matched_purchase_order_id_fkey"
  FOREIGN KEY ("matched_purchase_order_id") REFERENCES "purchase_orders"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "ocr_invoice_drafts"
  ADD CONSTRAINT "ocr_invoice_drafts_selected_grn_id_fkey"
  FOREIGN KEY ("selected_grn_id") REFERENCES "goods_receipt_notes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "ocr_invoice_drafts"
  ADD CONSTRAINT "ocr_invoice_drafts_selected_delivery_challan_id_fkey"
  FOREIGN KEY ("selected_delivery_challan_id") REFERENCES "delivery_challans"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX IF NOT EXISTS "ocr_invoice_drafts_created_by_id_idx" ON "ocr_invoice_drafts"("created_by_id");
CREATE INDEX IF NOT EXISTS "ocr_invoice_drafts_invoice_id_idx" ON "ocr_invoice_drafts"("invoice_id");
CREATE INDEX IF NOT EXISTS "ocr_invoice_drafts_matched_vendor_id_idx" ON "ocr_invoice_drafts"("matched_vendor_id");
CREATE INDEX IF NOT EXISTS "ocr_invoice_drafts_matched_purchase_order_id_idx" ON "ocr_invoice_drafts"("matched_purchase_order_id");
CREATE INDEX IF NOT EXISTS "ocr_invoice_drafts_selected_grn_id_idx" ON "ocr_invoice_drafts"("selected_grn_id");
CREATE INDEX IF NOT EXISTS "ocr_invoice_drafts_selected_delivery_challan_id_idx" ON "ocr_invoice_drafts"("selected_delivery_challan_id");
CREATE INDEX IF NOT EXISTS "ocr_invoice_drafts_draft_status_idx" ON "ocr_invoice_drafts"("draft_status");
CREATE INDEX IF NOT EXISTS "ocr_invoice_drafts_ocr_status_idx" ON "ocr_invoice_drafts"("ocr_status");
