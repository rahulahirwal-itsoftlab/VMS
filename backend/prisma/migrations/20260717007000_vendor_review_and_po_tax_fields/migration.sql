ALTER TABLE "vendors"
ADD COLUMN IF NOT EXISTS "pending_changes" JSONB,
ADD COLUMN IF NOT EXISTS "pending_change_status" TEXT,
ADD COLUMN IF NOT EXISTS "pending_change_requested_by_id" TEXT,
ADD COLUMN IF NOT EXISTS "pending_change_requested_at" TIMESTAMP(3);

CREATE INDEX IF NOT EXISTS "vendors_pending_change_status_idx" ON "vendors"("pending_change_status");

ALTER TABLE "purchase_orders"
ADD COLUMN IF NOT EXISTS "tax_summary" JSONB;
