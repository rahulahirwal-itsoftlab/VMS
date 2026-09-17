-- AlterTable
ALTER TABLE "purchase_orders"
  DROP COLUMN IF EXISTS "project_code",
  DROP COLUMN IF EXISTS "quotation_reference",
  DROP COLUMN IF EXISTS "contract_reference";
