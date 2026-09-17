-- Create payment_approvals table
CREATE TABLE IF NOT EXISTS "payment_approvals" (
    "id"                TEXT NOT NULL,
    "payment_id"        TEXT,
    "invoice_id"        TEXT NOT NULL,
    "purchase_order_id" TEXT NOT NULL,
    "vendor_id"         TEXT NOT NULL,
    "three_way_match_id" TEXT,
    "amount"            DECIMAL(14,2) NOT NULL,
    "currency"          TEXT NOT NULL DEFAULT 'INR',
    "approval_level"    INTEGER NOT NULL DEFAULT 1,
    "required_role"     TEXT NOT NULL,
    "approver_id"       TEXT NOT NULL,
    "status"            TEXT NOT NULL DEFAULT 'PENDING',
    "remarks"           TEXT,
    "rejection_reason"  TEXT,
    "requested_by_id"   TEXT,
    "requested_at"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "approved_by_id"    TEXT,
    "approved_at"       TIMESTAMP(3),
    "rejected_by_id"    TEXT,
    "rejected_at"       TIMESTAMP(3),
    "created_at"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payment_approvals_pkey" PRIMARY KEY ("id")
);

-- Create payment_approval_history table
CREATE TABLE IF NOT EXISTS "payment_approval_history" (
    "id"                    TEXT NOT NULL,
    "payment_approval_id"   TEXT NOT NULL,
    "payment_id"            TEXT,
    "invoice_id"            TEXT,
    "action"                TEXT NOT NULL,
    "previous_status"       TEXT,
    "new_status"            TEXT,
    "performed_by_id"       TEXT,
    "remarks"               TEXT,
    "created_at"            TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payment_approval_history_pkey" PRIMARY KEY ("id")
);

-- Add foreign keys for payment_approvals
ALTER TABLE "payment_approvals" ADD CONSTRAINT "payment_approvals_payment_id_fkey"
    FOREIGN KEY ("payment_id") REFERENCES "payments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "payment_approvals" ADD CONSTRAINT "payment_approvals_invoice_id_fkey"
    FOREIGN KEY ("invoice_id") REFERENCES "invoices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "payment_approvals" ADD CONSTRAINT "payment_approvals_purchase_order_id_fkey"
    FOREIGN KEY ("purchase_order_id") REFERENCES "purchase_orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "payment_approvals" ADD CONSTRAINT "payment_approvals_vendor_id_fkey"
    FOREIGN KEY ("vendor_id") REFERENCES "vendors"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "payment_approvals" ADD CONSTRAINT "payment_approvals_three_way_match_id_fkey"
    FOREIGN KEY ("three_way_match_id") REFERENCES "three_way_matches"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "payment_approvals" ADD CONSTRAINT "payment_approvals_approver_id_fkey"
    FOREIGN KEY ("approver_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "payment_approvals" ADD CONSTRAINT "payment_approvals_requested_by_id_fkey"
    FOREIGN KEY ("requested_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "payment_approvals" ADD CONSTRAINT "payment_approvals_approved_by_id_fkey"
    FOREIGN KEY ("approved_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "payment_approvals" ADD CONSTRAINT "payment_approvals_rejected_by_id_fkey"
    FOREIGN KEY ("rejected_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Add foreign keys for payment_approval_history
ALTER TABLE "payment_approval_history" ADD CONSTRAINT "payment_approval_history_payment_approval_id_fkey"
    FOREIGN KEY ("payment_approval_id") REFERENCES "payment_approvals"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "payment_approval_history" ADD CONSTRAINT "payment_approval_history_performed_by_id_fkey"
    FOREIGN KEY ("performed_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Create indexes for payment_approvals
CREATE INDEX IF NOT EXISTS "payment_approvals_payment_id_idx"      ON "payment_approvals"("payment_id");
CREATE INDEX IF NOT EXISTS "payment_approvals_approver_status_idx" ON "payment_approvals"("approver_id", "status");
CREATE INDEX IF NOT EXISTS "payment_approvals_invoice_id_idx"       ON "payment_approvals"("invoice_id");
CREATE INDEX IF NOT EXISTS "payment_approvals_status_idx"           ON "payment_approvals"("status");
CREATE INDEX IF NOT EXISTS "payment_approvals_requested_at_idx"     ON "payment_approvals"("requested_at");

-- Create indexes for payment_approval_history
CREATE INDEX IF NOT EXISTS "payment_approval_history_approval_id_idx" ON "payment_approval_history"("payment_approval_id");
CREATE INDEX IF NOT EXISTS "payment_approval_history_payment_id_idx"  ON "payment_approval_history"("payment_id");
CREATE INDEX IF NOT EXISTS "payment_approval_history_created_at_idx"  ON "payment_approval_history"("created_at");

-- Also ensure payments table has the payment_approvals relation column if it doesn't exist
-- (The Payment model already exists but may need the relation to payment_approvals accessible)
-- No schema changes needed on payments table for the relation — it's handled by payment_approvals.payment_id FK above.
