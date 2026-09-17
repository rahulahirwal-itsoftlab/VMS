CREATE SEQUENCE IF NOT EXISTS invoice_number_seq START WITH 1 INCREMENT BY 1;

DO $$
DECLARE
  max_existing_number bigint;
BEGIN
  SELECT COALESCE(MAX((regexp_match(invoice_number, '^INV-[0-9]{4}-([0-9]+)$'))[1]::bigint), 0)
    INTO max_existing_number
  FROM invoices
  WHERE invoice_number ~ '^INV-[0-9]{4}-[0-9]+$';

  IF max_existing_number >= 1 THEN
    PERFORM setval('invoice_number_seq', max_existing_number, true);
  END IF;
END $$;
