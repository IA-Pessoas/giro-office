CREATE TABLE "integracao.task_financeiro_commands" (
  "id" TEXT NOT NULL,
  "organization_id" TEXT NOT NULL,
  "idempotency_key" VARCHAR(255) NOT NULL,
  "command_hash" CHAR(64) NOT NULL,
  "response_snapshot" JSONB NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "task_financeiro_commands_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "uq_task_financeiro_command_org_key"
ON "integracao.task_financeiro_commands"("organization_id", "idempotency_key");

CREATE INDEX "idx_task_financeiro_command_org"
ON "integracao.task_financeiro_commands"("organization_id");

CREATE TABLE "integracao.department_collectors" (
  "id" TEXT NOT NULL,
  "organization_id" TEXT NOT NULL,
  "department_id" TEXT NOT NULL,
  "user_id" TEXT NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "department_collectors_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "uq_department_collector"
ON "integracao.department_collectors"("organization_id", "department_id", "user_id");

CREATE INDEX "idx_department_collector_user"
ON "integracao.department_collectors"("organization_id", "user_id");

ALTER TABLE "integracao.department_collectors"
ADD CONSTRAINT "department_collectors_department_id_fkey"
FOREIGN KEY ("department_id") REFERENCES "departments"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "integracao.department_collectors"
ADD CONSTRAINT "department_collectors_user_id_fkey"
FOREIGN KEY ("user_id") REFERENCES "users"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
