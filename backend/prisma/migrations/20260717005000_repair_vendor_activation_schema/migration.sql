ALTER TABLE "vendors"
ADD COLUMN IF NOT EXISTS "pan_number" TEXT,
ADD COLUMN IF NOT EXISTS "bank_name" TEXT,
ADD COLUMN IF NOT EXISTS "approval_status" TEXT NOT NULL DEFAULT 'PENDING',
ADD COLUMN IF NOT EXISTS "approval_remarks" TEXT,
ADD COLUMN IF NOT EXISTS "activated_at" TIMESTAMP(3);

CREATE UNIQUE INDEX IF NOT EXISTS "vendors_pan_number_key" ON "vendors"("pan_number");
CREATE INDEX IF NOT EXISTS "vendors_approval_status_idx" ON "vendors"("approval_status");
CREATE INDEX IF NOT EXISTS "vendors_status_approval_status_is_active_idx" ON "vendors"("status", "approval_status", "is_active");

UPDATE "vendors"
SET
  "approval_status" = CASE
    WHEN UPPER("status") IN ('APPROVED', 'ACTIVE') THEN 'APPROVED'
    WHEN UPPER("status") IN ('REJECTED', 'INACTIVE') THEN 'REJECTED'
    WHEN UPPER("status") IN ('BLOCKED', 'ON_HOLD', 'HOLD') THEN 'BLOCKED'
    ELSE 'PENDING'
  END,
  "activated_at" = CASE
    WHEN UPPER("status") IN ('APPROVED', 'ACTIVE') THEN COALESCE("activated_at", "approved_at", "updated_at")
    ELSE "activated_at"
  END,
  "status" = CASE
    WHEN UPPER("status") IN ('APPROVED', 'ACTIVE') THEN 'ACTIVE'
    WHEN UPPER("status") IN ('REJECTED', 'INACTIVE') THEN 'INACTIVE'
    WHEN UPPER("status") IN ('BLOCKED', 'ON_HOLD', 'HOLD') THEN 'BLOCKED'
    ELSE 'PENDING'
  END,
  "is_active" = CASE
    WHEN UPPER("status") IN ('APPROVED', 'ACTIVE') THEN true
    ELSE false
  END
WHERE UPPER("status") IN ('PENDING', 'APPROVED', 'ACTIVE', 'REJECTED', 'INACTIVE', 'BLOCKED', 'ON_HOLD', 'HOLD')
  OR "approval_status" IS NULL;
