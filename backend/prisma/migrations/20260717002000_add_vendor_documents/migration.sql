ALTER TABLE "vendors"
ADD COLUMN IF NOT EXISTS "pan_number" TEXT,
ADD COLUMN IF NOT EXISTS "bank_name" TEXT;

CREATE TABLE IF NOT EXISTS "vendor_documents" (
  "id" TEXT NOT NULL,
  "vendor_id" TEXT NOT NULL,
  "document_name" TEXT NOT NULL,
  "original_file_name" TEXT NOT NULL,
  "file_url" TEXT NOT NULL,
  "storage_path" TEXT NOT NULL,
  "document_type" TEXT NOT NULL,
  "mime_type" TEXT NOT NULL,
  "file_size" INTEGER NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'ACTIVE',
  "uploaded_by_id" TEXT,
  "uploaded_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "deleted_at" TIMESTAMP(3),
  "deleted_by_id" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "vendor_documents_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "vendor_documents_vendor_id_fkey" FOREIGN KEY ("vendor_id") REFERENCES "vendors"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "vendor_documents_uploaded_by_id_fkey" FOREIGN KEY ("uploaded_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "vendor_documents_vendor_id_idx" ON "vendor_documents"("vendor_id");
CREATE INDEX IF NOT EXISTS "vendor_documents_document_type_idx" ON "vendor_documents"("document_type");
CREATE INDEX IF NOT EXISTS "vendor_documents_uploaded_by_id_idx" ON "vendor_documents"("uploaded_by_id");
CREATE UNIQUE INDEX IF NOT EXISTS "vendors_pan_number_key" ON "vendors"("pan_number");
