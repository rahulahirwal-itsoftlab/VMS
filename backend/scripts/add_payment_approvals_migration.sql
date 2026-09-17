-- ============================================================
-- MIGRATION: add_payment_approvals_module
-- Run this against your PostgreSQL database
-- ============================================================

-- Add three_way_match_id and approval_status columns to payments table
ALTER TABLE payments ADD COLUMN IF NOT EXISTS three_way_match_id TEXT;
ALTER TABLE payments ADD COLUMN IF NOT EXISTS approval_status TEXT NOT NULL DEFAULT 'PENDING';

-- Add foreign key for three_way_match_id on payments (deferred so it doesn't block existing data)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints 
    WHERE constraint_name = 'fk_payments_three_way_match'
  ) THEN
    ALTER TABLE payments ADD CONSTRAINT fk_payments_three_way_match 
      FOREIGN KEY (three_way_match_id) REFERENCES three_way_matches(id) ON DELETE SET NULL DEFERRABLE INITIALLY DEFERRED;
  END IF;
END $$;

-- Add index for approval_status on payments
CREATE INDEX IF NOT EXISTS payments_approval_status_idx ON payments(approval_status);

-- ============================================================
-- Create payment_approvals table
-- ============================================================
CREATE TABLE IF NOT EXISTS payment_approvals (
  id                  TEXT NOT NULL PRIMARY KEY DEFAULT gen_random_uuid()::text,
  payment_id          TEXT,
  invoice_id          TEXT NOT NULL,
  purchase_order_id   TEXT NOT NULL,
  vendor_id           TEXT NOT NULL,
  three_way_match_id  TEXT,
  amount              DECIMAL(14, 2) NOT NULL,
  currency            TEXT NOT NULL DEFAULT 'INR',
  approval_level      INTEGER NOT NULL DEFAULT 1,
  required_role       TEXT NOT NULL,
  approver_id         TEXT NOT NULL,
  status              TEXT NOT NULL DEFAULT 'PENDING',
  remarks             TEXT,
  rejection_reason    TEXT,
  requested_by_id     TEXT,
  requested_at        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  approved_by_id      TEXT,
  approved_at         TIMESTAMP(3),
  rejected_by_id      TEXT,
  rejected_at         TIMESTAMP(3),
  created_at          TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at          TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- payment_approvals foreign keys (use DO blocks to avoid errors if already exist)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'fk_pa_payment') THEN
    ALTER TABLE payment_approvals ADD CONSTRAINT fk_pa_payment FOREIGN KEY (payment_id) REFERENCES payments(id) ON DELETE SET NULL DEFERRABLE INITIALLY DEFERRED;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'fk_pa_invoice') THEN
    ALTER TABLE payment_approvals ADD CONSTRAINT fk_pa_invoice FOREIGN KEY (invoice_id) REFERENCES invoices(id) ON DELETE RESTRICT DEFERRABLE INITIALLY DEFERRED;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'fk_pa_purchase_order') THEN
    ALTER TABLE payment_approvals ADD CONSTRAINT fk_pa_purchase_order FOREIGN KEY (purchase_order_id) REFERENCES purchase_orders(id) ON DELETE RESTRICT DEFERRABLE INITIALLY DEFERRED;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'fk_pa_vendor') THEN
    ALTER TABLE payment_approvals ADD CONSTRAINT fk_pa_vendor FOREIGN KEY (vendor_id) REFERENCES vendors(id) ON DELETE RESTRICT DEFERRABLE INITIALLY DEFERRED;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'fk_pa_three_way_match') THEN
    ALTER TABLE payment_approvals ADD CONSTRAINT fk_pa_three_way_match FOREIGN KEY (three_way_match_id) REFERENCES three_way_matches(id) ON DELETE SET NULL DEFERRABLE INITIALLY DEFERRED;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'fk_pa_approver') THEN
    ALTER TABLE payment_approvals ADD CONSTRAINT fk_pa_approver FOREIGN KEY (approver_id) REFERENCES users(id) ON DELETE RESTRICT DEFERRABLE INITIALLY DEFERRED;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'fk_pa_requested_by') THEN
    ALTER TABLE payment_approvals ADD CONSTRAINT fk_pa_requested_by FOREIGN KEY (requested_by_id) REFERENCES users(id) ON DELETE SET NULL DEFERRABLE INITIALLY DEFERRED;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'fk_pa_approved_by') THEN
    ALTER TABLE payment_approvals ADD CONSTRAINT fk_pa_approved_by FOREIGN KEY (approved_by_id) REFERENCES users(id) ON DELETE SET NULL DEFERRABLE INITIALLY DEFERRED;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'fk_pa_rejected_by') THEN
    ALTER TABLE payment_approvals ADD CONSTRAINT fk_pa_rejected_by FOREIGN KEY (rejected_by_id) REFERENCES users(id) ON DELETE SET NULL DEFERRABLE INITIALLY DEFERRED;
  END IF;
END $$;

-- payment_approvals indexes
CREATE INDEX IF NOT EXISTS payment_approvals_payment_id_idx ON payment_approvals(payment_id);
CREATE INDEX IF NOT EXISTS payment_approvals_approver_status_idx ON payment_approvals(approver_id, status);
CREATE INDEX IF NOT EXISTS payment_approvals_invoice_id_idx ON payment_approvals(invoice_id);
CREATE INDEX IF NOT EXISTS payment_approvals_status_idx ON payment_approvals(status);
CREATE INDEX IF NOT EXISTS payment_approvals_requested_at_idx ON payment_approvals(requested_at);

-- ============================================================
-- Create payment_approval_history table
-- ============================================================
CREATE TABLE IF NOT EXISTS payment_approval_history (
  id                    TEXT NOT NULL PRIMARY KEY DEFAULT gen_random_uuid()::text,
  payment_approval_id   TEXT NOT NULL,
  payment_id            TEXT,
  invoice_id            TEXT,
  action                TEXT NOT NULL,
  previous_status       TEXT,
  new_status            TEXT,
  performed_by_id       TEXT,
  remarks               TEXT,
  created_at            TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- payment_approval_history foreign keys
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'fk_pah_payment_approval') THEN
    ALTER TABLE payment_approval_history ADD CONSTRAINT fk_pah_payment_approval FOREIGN KEY (payment_approval_id) REFERENCES payment_approvals(id) ON DELETE CASCADE DEFERRABLE INITIALLY DEFERRED;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'fk_pah_performed_by') THEN
    ALTER TABLE payment_approval_history ADD CONSTRAINT fk_pah_performed_by FOREIGN KEY (performed_by_id) REFERENCES users(id) ON DELETE SET NULL DEFERRABLE INITIALLY DEFERRED;
  END IF;
END $$;

-- payment_approval_history indexes
CREATE INDEX IF NOT EXISTS payment_approval_history_approval_id_idx ON payment_approval_history(payment_approval_id);
CREATE INDEX IF NOT EXISTS payment_approval_history_payment_id_idx ON payment_approval_history(payment_id);
CREATE INDEX IF NOT EXISTS payment_approval_history_created_at_idx ON payment_approval_history(created_at);
