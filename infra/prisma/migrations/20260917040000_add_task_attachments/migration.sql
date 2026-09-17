CREATE TABLE "integracao.task_attachments" (
    "id" TEXT NOT NULL,
    "task_id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "uploaded_by" TEXT NOT NULL,
    "original_name" TEXT NOT NULL,
    "mime_type" TEXT NOT NULL,
    "size_bytes" INTEGER NOT NULL,
    "object_path" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" TIMESTAMP(3),
    "deleted_by" TEXT,
    CONSTRAINT "task_attachments_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "task_attachments_object_path_key"
  ON "integracao.task_attachments"("object_path");
CREATE INDEX "idx_task_attachments_org_task_visible"
  ON "integracao.task_attachments"("organization_id", "task_id", "deleted_at", "created_at");

ALTER TABLE "integracao.task_attachments"
  ADD CONSTRAINT "task_attachments_task_id_fkey"
  FOREIGN KEY ("task_id") REFERENCES "integracao.tasks"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "integracao.task_attachments"
  ADD CONSTRAINT "task_attachments_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
