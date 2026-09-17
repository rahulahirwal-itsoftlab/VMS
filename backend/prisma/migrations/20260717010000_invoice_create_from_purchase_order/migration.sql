CREATE SEQUENCE IF NOT EXISTS invoice_number_seq START WITH 1 INCREMENT BY 1;

DO $$
DECLARE
  max_invoice_number bigint;
BEGIN
  SELECT COALESCE(MAX((regexp_match(invoice_number, '^INV-[0-9]{4}-([0-9]+)$'))[1]::bigint), 0)
  INTO max_invoice_number
  FROM invoices
  WHERE invoice_number ~ '^INV-[0-9]{4}-[0-9]+$';

  IF max_invoice_number > 0 THEN
    PERFORM setval('invoice_number_seq', max_invoice_number, true);
  ELSE
    PERFORM setval('invoice_number_seq', 1, false);
  END IF;
END $$;

ALTER TABLE "invoices"
  ADD COLUMN IF NOT EXISTS "line_items" JSONB,
  ADD COLUMN IF NOT EXISTS "tax_summary" JSONB,
  ADD COLUMN IF NOT EXISTS "file_url" TEXT,
  ADD COLUMN IF NOT EXISTS "file_name" TEXT,
  ADD COLUMN IF NOT EXISTS "file_mime" TEXT,
  ADD COLUMN IF NOT EXISTS "file_size" INTEGER;
