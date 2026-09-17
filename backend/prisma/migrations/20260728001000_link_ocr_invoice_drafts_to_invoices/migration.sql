ALTER TABLE "ocr_invoice_drafts"
  ADD COLUMN IF NOT EXISTS "invoice_id" TEXT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'ocr_invoice_drafts_invoice_id_fkey'
  ) THEN
    ALTER TABLE "ocr_invoice_drafts"
      ADD CONSTRAINT "ocr_invoice_drafts_invoice_id_fkey"
      FOREIGN KEY ("invoice_id") REFERENCES "invoices"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "ocr_invoice_drafts_invoice_id_idx" ON "ocr_invoice_drafts"("invoice_id");
