CREATE TABLE IF NOT EXISTS "user_sessions" (
  "id" TEXT NOT NULL,
  "user_id" TEXT NOT NULL,
  "token_hash" TEXT NOT NULL,
  "expires_at" TIMESTAMP(3) NOT NULL,
  "revoked_at" TIMESTAMP(3),
  "replaced_by" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "user_agent" TEXT,
  "ip_address" TEXT,

  CONSTRAINT "user_sessions_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "user_sessions_token_hash_key" ON "user_sessions"("token_hash");
CREATE INDEX IF NOT EXISTS "user_sessions_user_id_idx" ON "user_sessions"("user_id");
CREATE INDEX IF NOT EXISTS "user_sessions_token_hash_idx" ON "user_sessions"("token_hash");
CREATE INDEX IF NOT EXISTS "user_sessions_expires_at_idx" ON "user_sessions"("expires_at");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'user_sessions_user_id_fkey'
  ) THEN
    ALTER TABLE "user_sessions"
      ADD CONSTRAINT "user_sessions_user_id_fkey"
      FOREIGN KEY ("user_id") REFERENCES "users"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
