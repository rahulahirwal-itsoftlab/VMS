ALTER TABLE vendors
  ADD COLUMN IF NOT EXISTS vendor_type TEXT,
  ADD COLUMN IF NOT EXISTS cin TEXT,
  ADD COLUMN IF NOT EXISTS msme_number TEXT,
  ADD COLUMN IF NOT EXISTS tax_type TEXT,
  ADD COLUMN IF NOT EXISTS contact_designation TEXT,
  ADD COLUMN IF NOT EXISTS alternate_phone TEXT,
  ADD COLUMN IF NOT EXISTS address_line1 TEXT,
  ADD COLUMN IF NOT EXISTS address_line2 TEXT,
  ADD COLUMN IF NOT EXISTS district TEXT,
  ADD COLUMN IF NOT EXISTS country TEXT,
  ADD COLUMN IF NOT EXISTS account_holder TEXT,
  ADD COLUMN IF NOT EXISTS bank_branch TEXT;

UPDATE vendors
SET
  gst_number = COALESCE(gst_number, tax_id),
  address_line1 = COALESCE(address_line1, address),
  country = COALESCE(country, 'India')
WHERE deleted_at IS NULL;
