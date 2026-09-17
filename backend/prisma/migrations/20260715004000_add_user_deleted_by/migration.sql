ALTER TABLE "users"
ADD COLUMN IF NOT EXISTS "deleted_by_id" TEXT;

CREATE INDEX IF NOT EXISTS "users_deleted_by_id_idx"
ON "users"("deleted_by_id");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'users_deleted_by_id_fkey'
  ) THEN
    ALTER TABLE "users"
    ADD CONSTRAINT "users_deleted_by_id_fkey"
    FOREIGN KEY ("deleted_by_id")
    REFERENCES "users"("id")
    ON DELETE SET NULL
    ON UPDATE CASCADE;
  END IF;
END $$;
