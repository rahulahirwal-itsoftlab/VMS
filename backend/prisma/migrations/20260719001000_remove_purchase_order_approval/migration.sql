UPDATE "purchase_orders"
SET "status" = 'created'
WHERE "status" IN ('pending', 'open');

ALTER TABLE "purchase_orders" DROP COLUMN IF EXISTS "approved_by_id";
ALTER TABLE "purchase_orders" DROP COLUMN IF EXISTS "approved_at";
ALTER TABLE "purchase_orders" DROP COLUMN IF EXISTS "approval_remarks";
