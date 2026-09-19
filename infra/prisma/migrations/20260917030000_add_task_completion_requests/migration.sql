CREATE TABLE "integracao.task_completion_requests" (
    "id" TEXT NOT NULL,
    "task_id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "requester_id" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "reason" TEXT,
    "decision_reason" TEXT,
    "decided_by" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolved_at" TIMESTAMP(3),
    CONSTRAINT "task_completion_requests_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "idx_task_completion_requests_org_task_created"
  ON "integracao.task_completion_requests"("organization_id", "task_id", "created_at");
CREATE INDEX "idx_task_completion_requests_org_requester_created"
  ON "integracao.task_completion_requests"("organization_id", "requester_id", "created_at");
CREATE UNIQUE INDEX "uq_task_completion_requests_pending_task"
  ON "integracao.task_completion_requests"("task_id") WHERE "status" = 'pending';

ALTER TABLE "integracao.task_completion_requests"
  ADD CONSTRAINT "task_completion_requests_task_id_fkey"
  FOREIGN KEY ("task_id") REFERENCES "integracao.tasks"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "integracao.task_completion_requests"
  ADD CONSTRAINT "task_completion_requests_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
