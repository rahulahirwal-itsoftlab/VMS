ALTER TABLE "purchase_orders"
  ADD COLUMN IF NOT EXISTS "updated_by_id" TEXT,
  ADD COLUMN IF NOT EXISTS "deleted_at" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "deleted_by_id" TEXT,
  ADD COLUMN IF NOT EXISTS "delete_reason" TEXT;

CREATE INDEX IF NOT EXISTS "purchase_orders_deleted_at_idx" ON "purchase_orders"("deleted_at");
CREATE INDEX IF NOT EXISTS "purchase_orders_updated_by_id_idx" ON "purchase_orders"("updated_by_id");
CREATE INDEX IF NOT EXISTS "purchase_orders_deleted_by_id_idx" ON "purchase_orders"("deleted_by_id");
