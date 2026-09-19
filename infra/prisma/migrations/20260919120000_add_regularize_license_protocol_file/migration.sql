ALTER TABLE "regularize.license"
  ADD COLUMN "protocol_file_path" TEXT,
  ADD COLUMN "protocol_file_original_name" TEXT,
  ADD COLUMN "protocol_file_mime_type" TEXT,
  ADD COLUMN "protocol_file_size_bytes" INTEGER,
  ADD COLUMN "protocol_file_uploaded_at" TIMESTAMP(3),
  ADD COLUMN "protocol_file_uploaded_by_user_id" TEXT;
