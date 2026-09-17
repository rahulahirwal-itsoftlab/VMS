CREATE SEQUENCE IF NOT EXISTS vendor_code_seq START WITH 1 INCREMENT BY 1;

DO $$
DECLARE
  max_vendor_code bigint;
BEGIN
  SELECT COALESCE(MAX((regexp_match(vendor_code, '^VND-([0-9]+)$'))[1]::bigint), 0)
  INTO max_vendor_code
  FROM vendors
  WHERE vendor_code ~ '^VND-[0-9]+$';

  IF max_vendor_code > 0 THEN
    PERFORM setval('vendor_code_seq', max_vendor_code, true);
  ELSE
    PERFORM setval('vendor_code_seq', 1, false);
  END IF;
END $$;
