ALTER TABLE "invoices"
  ADD COLUMN IF NOT EXISTS "invoice_creation_method" TEXT NOT NULL DEFAULT 'MANUAL',
  ADD COLUMN IF NOT EXISTS "invoice_category" TEXT,
  ADD COLUMN IF NOT EXISTS "invoice_source" TEXT,
  ADD COLUMN IF NOT EXISTS "ocr_status" TEXT DEFAULT 'NOT_STARTED',
  ADD COLUMN IF NOT EXISTS "ocr_confidence" DECIMAL(5, 2),
  ADD COLUMN IF NOT EXISTS "ocr_extracted_data" JSONB;

CREATE TABLE IF NOT EXISTS "invoice_attachments" (
  "id" TEXT NOT NULL,
  "invoice_id" TEXT NOT NULL,
  "purchase_order_id" TEXT NOT NULL,
  "vendor_id" TEXT NOT NULL,
  "invoice_creation_method" TEXT NOT NULL DEFAULT 'MANUAL',
  "invoice_category" TEXT,
  "invoice_source" TEXT,
  "attachment_type" TEXT NOT NULL DEFAULT 'INVOICE',
  "original_file_name" TEXT NOT NULL,
  "stored_file_name" TEXT NOT NULL,
  "file_url" TEXT NOT NULL,
  "file_type" TEXT NOT NULL,
  "file_size" INTEGER NOT NULL,
  "ocr_status" TEXT NOT NULL DEFAULT 'NOT_STARTED',
  "ocr_confidence" DECIMAL(5, 2),
  "ocr_extracted_data" JSONB,
  "uploaded_by_id" TEXT,
  "uploaded_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "deleted_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "invoice_attachments_pkey" PRIMARY KEY ("id")
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'invoice_attachments_invoice_id_fkey'
  ) THEN
    ALTER TABLE "invoice_attachments"
      ADD CONSTRAINT "invoice_attachments_invoice_id_fkey"
      FOREIGN KEY ("invoice_id") REFERENCES "invoices"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'invoice_attachments_purchase_order_id_fkey'
  ) THEN
    ALTER TABLE "invoice_attachments"
      ADD CONSTRAINT "invoice_attachments_purchase_order_id_fkey"
      FOREIGN KEY ("purchase_order_id") REFERENCES "purchase_orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'invoice_attachments_vendor_id_fkey'
  ) THEN
    ALTER TABLE "invoice_attachments"
      ADD CONSTRAINT "invoice_attachments_vendor_id_fkey"
      FOREIGN KEY ("vendor_id") REFERENCES "vendors"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'invoice_attachments_uploaded_by_id_fkey'
  ) THEN
    ALTER TABLE "invoice_attachments"
      ADD CONSTRAINT "invoice_attachments_uploaded_by_id_fkey"
      FOREIGN KEY ("uploaded_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "invoice_attachments_invoice_id_idx" ON "invoice_attachments"("invoice_id");
CREATE INDEX IF NOT EXISTS "invoice_attachments_purchase_order_id_idx" ON "invoice_attachments"("purchase_order_id");
CREATE INDEX IF NOT EXISTS "invoice_attachments_vendor_id_idx" ON "invoice_attachments"("vendor_id");
CREATE INDEX IF NOT EXISTS "invoice_attachments_uploaded_by_id_idx" ON "invoice_attachments"("uploaded_by_id");
