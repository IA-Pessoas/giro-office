ALTER TABLE "reports.models"
  ADD COLUMN "created_by_user_id" TEXT;

CREATE UNIQUE INDEX "model_versions_report_model_id_version_key"
  ON "reports.model_versions"("report_model_id", "version");
