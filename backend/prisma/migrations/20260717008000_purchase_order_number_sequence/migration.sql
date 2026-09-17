CREATE SEQUENCE IF NOT EXISTS purchase_order_number_seq START WITH 1 INCREMENT BY 1;

DO $$
DECLARE
  max_po_number bigint;
BEGIN
  SELECT COALESCE(MAX((regexp_match(po_number, '^PO-[0-9]{4}-([0-9]+)$'))[1]::bigint), 0)
  INTO max_po_number
  FROM purchase_orders
  WHERE po_number ~ '^PO-[0-9]{4}-[0-9]+$';

  IF max_po_number > 0 THEN
    PERFORM setval('purchase_order_number_seq', max_po_number, true);
  ELSE
    PERFORM setval('purchase_order_number_seq', 1, false);
  END IF;
END $$;
