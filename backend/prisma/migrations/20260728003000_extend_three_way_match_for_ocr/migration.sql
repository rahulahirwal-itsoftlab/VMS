ALTER TABLE "three_way_matches"
  ADD COLUMN IF NOT EXISTS "vendor_match" BOOLEAN,
  ADD COLUMN IF NOT EXISTS "po_match" BOOLEAN,
  ADD COLUMN IF NOT EXISTS "item_match" BOOLEAN,
  ADD COLUMN IF NOT EXISTS "quantity_match" BOOLEAN,
  ADD COLUMN IF NOT EXISTS "price_match" BOOLEAN,
  ADD COLUMN IF NOT EXISTS "tax_match" BOOLEAN,
  ADD COLUMN IF NOT EXISTS "total_match" BOOLEAN,
  ADD COLUMN IF NOT EXISTS "mismatch_details" JSONB;

CREATE INDEX IF NOT EXISTS "three_way_matches_purchase_order_id_idx" ON "three_way_matches"("purchase_order_id");
CREATE INDEX IF NOT EXISTS "three_way_matches_grn_id_idx" ON "three_way_matches"("grn_id");
