CREATE TABLE "notification.task_operational" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "recipient_id" TEXT NOT NULL,
    "task_id" TEXT NOT NULL,
    "event_key" VARCHAR(191) NOT NULL,
    "type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "read_at" TIMESTAMP(3),
    "archived_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "task_operational_notification_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "uq_task_operational_notification_event"
  ON "notification.task_operational"("organization_id", "recipient_id", "task_id", "event_key");
CREATE INDEX "idx_task_operational_notification_inbox"
  ON "notification.task_operational"("organization_id", "recipient_id", "archived_at", "read_at", "created_at");
CREATE INDEX "idx_task_operational_notification_retention"
  ON "notification.task_operational"("archived_at", "created_at");

ALTER TABLE "notification.task_operational"
  ADD CONSTRAINT "task_operational_notification_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "notification.task_operational"
  ADD CONSTRAINT "task_operational_notification_recipient_id_fkey"
  FOREIGN KEY ("recipient_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
