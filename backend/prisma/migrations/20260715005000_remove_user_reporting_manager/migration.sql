ALTER TABLE "users"
DROP CONSTRAINT IF EXISTS "users_reporting_manager_not_self_check";

ALTER TABLE "users"
DROP CONSTRAINT IF EXISTS "users_reporting_manager_id_fkey";

DROP INDEX IF EXISTS "users_reporting_manager_id_idx";

ALTER TABLE "users"
DROP COLUMN IF EXISTS "reporting_manager_id";
