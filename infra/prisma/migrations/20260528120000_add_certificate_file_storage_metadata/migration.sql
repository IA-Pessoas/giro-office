ALTER TABLE "certificate.pj"
  ADD COLUMN "file_original_name" TEXT,
  ADD COLUMN "file_mime_type" TEXT,
  ADD COLUMN "file_size_bytes" INTEGER,
  ADD COLUMN "file_sha256" TEXT,
  ADD COLUMN "file_uploaded_at" TIMESTAMP(3),
  ADD COLUMN "file_uploaded_by_user_id" TEXT,
  ADD COLUMN "file_storage_provider" TEXT,
  ADD COLUMN "file_storage_bucket" TEXT,
  ADD COLUMN "file_encryption_iv" TEXT,
  ADD COLUMN "file_encryption_tag" TEXT,
  ADD COLUMN "file_encryption_key_version" TEXT;

ALTER TABLE "certificate.pf"
  ADD COLUMN "file_original_name" TEXT,
  ADD COLUMN "file_mime_type" TEXT,
  ADD COLUMN "file_size_bytes" INTEGER,
  ADD COLUMN "file_sha256" TEXT,
  ADD COLUMN "file_uploaded_at" TIMESTAMP(3),
  ADD COLUMN "file_uploaded_by_user_id" TEXT,
  ADD COLUMN "file_storage_provider" TEXT,
  ADD COLUMN "file_storage_bucket" TEXT,
  ADD COLUMN "file_encryption_iv" TEXT,
  ADD COLUMN "file_encryption_tag" TEXT,
  ADD COLUMN "file_encryption_key_version" TEXT;
