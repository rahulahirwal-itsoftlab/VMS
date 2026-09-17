ALTER TABLE "users"
  ADD COLUMN IF NOT EXISTS "must_change_password" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "temporary_password_expires_at" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "password_changed_at" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "credentials_email_status" TEXT,
  ADD COLUMN IF NOT EXISTS "credentials_email_sent_at" TIMESTAMP(3);

CREATE INDEX IF NOT EXISTS "users_must_change_password_idx"
  ON "users"("must_change_password");

CREATE INDEX IF NOT EXISTS "users_temporary_password_expires_at_idx"
  ON "users"("temporary_password_expires_at");
