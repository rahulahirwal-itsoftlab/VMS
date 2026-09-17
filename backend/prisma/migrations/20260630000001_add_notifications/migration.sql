-- Create notifications table
CREATE TABLE "notifications" (
  "id"          TEXT NOT NULL,
  "user_id"     TEXT NOT NULL,
  "title"       TEXT NOT NULL,
  "message"     TEXT NOT NULL,
  "type"        TEXT NOT NULL,
  "entity_type" TEXT,
  "entity_id"   TEXT,
  "is_read"     BOOLEAN NOT NULL DEFAULT false,
  "read_at"     TIMESTAMP(3),
  "created_at"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- Indices for efficient querying by user
CREATE INDEX "notifications_user_id_is_read_idx" ON "notifications"("user_id", "is_read");
CREATE INDEX "notifications_user_id_created_at_idx" ON "notifications"("user_id", "created_at" DESC);

-- Foreign key to users table
ALTER TABLE "notifications"
  ADD CONSTRAINT "notifications_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "users"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

-- Add indices to approval_logs for efficient filtering
CREATE INDEX IF NOT EXISTS "approval_logs_entity_type_entity_id_idx"
  ON "approval_logs"("entity_type", "entity_id");

CREATE INDEX IF NOT EXISTS "approval_logs_performed_by_id_idx"
  ON "approval_logs"("performed_by_id");
