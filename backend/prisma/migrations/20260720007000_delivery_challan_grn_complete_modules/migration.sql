CREATE SEQUENCE IF NOT EXISTS grn_number_seq START WITH 1 INCREMENT BY 1;
CREATE SEQUENCE IF NOT EXISTS delivery_challan_number_seq START WITH 1 INCREMENT BY 1;

ALTER TABLE delivery_challans
  ADD COLUMN IF NOT EXISTS delivery_address TEXT,
  ADD COLUMN IF NOT EXISTS transporter TEXT,
  ADD COLUMN IF NOT EXISTS vehicle_number TEXT,
  ADD COLUMN IF NOT EXISTS driver_name TEXT,
  ADD COLUMN IF NOT EXISTS driver_contact TEXT,
  ADD COLUMN IF NOT EXISTS delivery_status TEXT NOT NULL DEFAULT 'CREATED',
  ADD COLUMN IF NOT EXISTS document_url TEXT,
  ADD COLUMN IF NOT EXISTS document_name TEXT;

ALTER TABLE goods_receipt_notes
  ADD COLUMN IF NOT EXISTS receipt_date TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS delivery_challan_id TEXT,
  ADD COLUMN IF NOT EXISTS received_by TEXT,
  ADD COLUMN IF NOT EXISTS attachment_url TEXT,
  ADD COLUMN IF NOT EXISTS attachment_name TEXT;

CREATE TABLE IF NOT EXISTS delivery_challan_items (
  id TEXT NOT NULL,
  delivery_challan_id TEXT NOT NULL,
  purchase_order_id TEXT NOT NULL,
  item_name TEXT NOT NULL,
  description TEXT,
  ordered_quantity DECIMAL(14,3) NOT NULL DEFAULT 0,
  delivered_quantity DECIMAL(14,3) NOT NULL DEFAULT 0,
  unit_price DECIMAL(14,2) NOT NULL DEFAULT 0,
  gst_amount DECIMAL(14,2) NOT NULL DEFAULT 0,
  line_total DECIMAL(14,2) NOT NULL DEFAULT 0,
  remarks TEXT,
  created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT delivery_challan_items_pkey PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS goods_receipt_items (
  id TEXT NOT NULL,
  goods_receipt_note_id TEXT NOT NULL,
  purchase_order_id TEXT NOT NULL,
  item_name TEXT NOT NULL,
  description TEXT,
  ordered_quantity DECIMAL(14,3) NOT NULL DEFAULT 0,
  received_quantity DECIMAL(14,3) NOT NULL DEFAULT 0,
  accepted_quantity DECIMAL(14,3) NOT NULL DEFAULT 0,
  rejected_quantity DECIMAL(14,3) NOT NULL DEFAULT 0,
  unit_price DECIMAL(14,2) NOT NULL DEFAULT 0,
  gst_amount DECIMAL(14,2) NOT NULL DEFAULT 0,
  line_total DECIMAL(14,2) NOT NULL DEFAULT 0,
  remarks TEXT,
  created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT goods_receipt_items_pkey PRIMARY KEY (id)
);

CREATE INDEX IF NOT EXISTS delivery_challan_items_delivery_challan_id_idx ON delivery_challan_items(delivery_challan_id);
CREATE INDEX IF NOT EXISTS delivery_challan_items_purchase_order_id_idx ON delivery_challan_items(purchase_order_id);
CREATE INDEX IF NOT EXISTS goods_receipt_items_goods_receipt_note_id_idx ON goods_receipt_items(goods_receipt_note_id);
CREATE INDEX IF NOT EXISTS goods_receipt_items_purchase_order_id_idx ON goods_receipt_items(purchase_order_id);
CREATE INDEX IF NOT EXISTS goods_receipt_notes_delivery_challan_id_idx ON goods_receipt_notes(delivery_challan_id);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'delivery_challan_items_delivery_challan_id_fkey'
      AND table_name = 'delivery_challan_items'
  ) THEN
    ALTER TABLE delivery_challan_items
      ADD CONSTRAINT delivery_challan_items_delivery_challan_id_fkey
      FOREIGN KEY (delivery_challan_id) REFERENCES delivery_challans(id) ON UPDATE CASCADE ON DELETE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'delivery_challan_items_purchase_order_id_fkey'
      AND table_name = 'delivery_challan_items'
  ) THEN
    ALTER TABLE delivery_challan_items
      ADD CONSTRAINT delivery_challan_items_purchase_order_id_fkey
      FOREIGN KEY (purchase_order_id) REFERENCES purchase_orders(id) ON UPDATE CASCADE ON DELETE RESTRICT;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'goods_receipt_items_goods_receipt_note_id_fkey'
      AND table_name = 'goods_receipt_items'
  ) THEN
    ALTER TABLE goods_receipt_items
      ADD CONSTRAINT goods_receipt_items_goods_receipt_note_id_fkey
      FOREIGN KEY (goods_receipt_note_id) REFERENCES goods_receipt_notes(id) ON UPDATE CASCADE ON DELETE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'goods_receipt_items_purchase_order_id_fkey'
      AND table_name = 'goods_receipt_items'
  ) THEN
    ALTER TABLE goods_receipt_items
      ADD CONSTRAINT goods_receipt_items_purchase_order_id_fkey
      FOREIGN KEY (purchase_order_id) REFERENCES purchase_orders(id) ON UPDATE CASCADE ON DELETE RESTRICT;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'goods_receipt_notes_delivery_challan_id_fkey'
      AND table_name = 'goods_receipt_notes'
  ) THEN
    ALTER TABLE goods_receipt_notes
      ADD CONSTRAINT goods_receipt_notes_delivery_challan_id_fkey
      FOREIGN KEY (delivery_challan_id) REFERENCES delivery_challans(id) ON UPDATE CASCADE ON DELETE SET NULL;
  END IF;
END $$;
