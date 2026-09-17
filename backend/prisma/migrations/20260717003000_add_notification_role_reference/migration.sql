ALTER TABLE "notifications"
ADD COLUMN IF NOT EXISTS "role" TEXT,
ADD COLUMN IF NOT EXISTS "reference_id" TEXT;

UPDATE "notifications"
SET "reference_id" = "entity_id"
WHERE "reference_id" IS NULL
  AND "entity_id" IS NOT NULL;

CREATE INDEX IF NOT EXISTS "notifications_role_is_read_idx" ON "notifications"("role", "is_read");
CREATE INDEX IF NOT EXISTS "notifications_reference_id_idx" ON "notifications"("reference_id");
