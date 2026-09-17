ALTER TABLE "ocr_extractions"
  ADD COLUMN IF NOT EXISTS "grn_number" TEXT,
  ADD COLUMN IF NOT EXISTS "delivery_challan_number" TEXT;

CREATE INDEX IF NOT EXISTS "ocr_extractions_grn_number_idx" ON "ocr_extractions"("grn_number");
CREATE INDEX IF NOT EXISTS "ocr_extractions_delivery_challan_number_idx" ON "ocr_extractions"("delivery_challan_number");
