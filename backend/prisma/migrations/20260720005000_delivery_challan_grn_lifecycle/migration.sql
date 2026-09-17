CREATE SEQUENCE IF NOT EXISTS grn_number_seq START WITH 1 INCREMENT BY 1;
CREATE SEQUENCE IF NOT EXISTS delivery_challan_number_seq START WITH 1 INCREMENT BY 1;

ALTER TABLE goods_receipt_notes
  ADD COLUMN IF NOT EXISTS receiver_name TEXT,
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS deleted_by_id TEXT,
  ADD COLUMN IF NOT EXISTS delete_reason TEXT;

CREATE TABLE IF NOT EXISTS delivery_challans (
  id TEXT NOT NULL,
  delivery_challan_number TEXT NOT NULL,
  vendor_id TEXT NOT NULL,
  purchase_order_id TEXT NOT NULL,
  created_by_id TEXT,
  status TEXT NOT NULL DEFAULT 'created',
  vendor_name TEXT,
  vendor_code TEXT,
  gst_number TEXT,
  delivery_date TIMESTAMP(3),
  vehicle_details TEXT,
  currency TEXT NOT NULL DEFAULT 'INR',
  subtotal DECIMAL(14,2) NOT NULL DEFAULT 0,
  gst_amount DECIMAL(14,2) NOT NULL DEFAULT 0,
  total_amount DECIMAL(14,2) NOT NULL DEFAULT 0,
  line_items JSONB,
  remarks TEXT,
  deleted_at TIMESTAMP(3),
  deleted_by_id TEXT,
  delete_reason TEXT,
  created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT delivery_challans_pkey PRIMARY KEY (id)
);

CREATE UNIQUE INDEX IF NOT EXISTS delivery_challans_delivery_challan_number_key ON delivery_challans(delivery_challan_number);
CREATE INDEX IF NOT EXISTS delivery_challans_vendor_id_idx ON delivery_challans(vendor_id);
CREATE INDEX IF NOT EXISTS delivery_challans_purchase_order_id_idx ON delivery_challans(purchase_order_id);
CREATE INDEX IF NOT EXISTS delivery_challans_status_idx ON delivery_challans(status);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'delivery_challans_vendor_id_fkey'
      AND table_name = 'delivery_challans'
  ) THEN
    ALTER TABLE delivery_challans
      ADD CONSTRAINT delivery_challans_vendor_id_fkey
      FOREIGN KEY (vendor_id) REFERENCES vendors(id) ON UPDATE CASCADE ON DELETE RESTRICT;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'delivery_challans_purchase_order_id_fkey'
      AND table_name = 'delivery_challans'
  ) THEN
    ALTER TABLE delivery_challans
      ADD CONSTRAINT delivery_challans_purchase_order_id_fkey
      FOREIGN KEY (purchase_order_id) REFERENCES purchase_orders(id) ON UPDATE CASCADE ON DELETE RESTRICT;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'delivery_challans_created_by_id_fkey'
      AND table_name = 'delivery_challans'
  ) THEN
    ALTER TABLE delivery_challans
      ADD CONSTRAINT delivery_challans_created_by_id_fkey
      FOREIGN KEY (created_by_id) REFERENCES users(id) ON UPDATE CASCADE ON DELETE SET NULL;
  END IF;
END $$;

ALTER TABLE three_way_matches
  ADD COLUMN IF NOT EXISTS delivery_challan_id TEXT,
  ADD COLUMN IF NOT EXISTS delivery_challan_snapshot JSONB;

CREATE INDEX IF NOT EXISTS three_way_matches_delivery_challan_id_idx ON three_way_matches(delivery_challan_id);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'three_way_matches_delivery_challan_id_fkey'
      AND table_name = 'three_way_matches'
  ) THEN
    ALTER TABLE three_way_matches
      ADD CONSTRAINT three_way_matches_delivery_challan_id_fkey
      FOREIGN KEY (delivery_challan_id) REFERENCES delivery_challans(id) ON UPDATE CASCADE ON DELETE SET NULL;
  END IF;
END $$;
