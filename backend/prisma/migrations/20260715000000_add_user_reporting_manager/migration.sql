ALTER TABLE "users"
ADD COLUMN IF NOT EXISTS "reporting_manager_id" TEXT;

CREATE INDEX IF NOT EXISTS "users_reporting_manager_id_idx"
ON "users"("reporting_manager_id");

ALTER TABLE "users"
ADD CONSTRAINT "users_reporting_manager_id_fkey"
FOREIGN KEY ("reporting_manager_id")
REFERENCES "users"("id")
ON DELETE SET NULL
ON UPDATE CASCADE;

ALTER TABLE "users"
ADD CONSTRAINT "users_reporting_manager_not_self_check"
CHECK ("reporting_manager_id" IS NULL OR "reporting_manager_id" <> "id");
