ALTER TABLE "purchase_orders"
ADD COLUMN IF NOT EXISTS "approved_by_id" TEXT,
ADD COLUMN IF NOT EXISTS "approved_at" TIMESTAMP(3),
ADD COLUMN IF NOT EXISTS "approval_remarks" TEXT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'purchase_orders_approved_by_id_fkey'
  ) THEN
    ALTER TABLE "purchase_orders"
    ADD CONSTRAINT "purchase_orders_approved_by_id_fkey"
    FOREIGN KEY ("approved_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "purchase_orders_approved_by_id_idx" ON "purchase_orders"("approved_by_id");

ALTER TABLE "payments"
ADD COLUMN IF NOT EXISTS "approved_at" TIMESTAMP(3);
