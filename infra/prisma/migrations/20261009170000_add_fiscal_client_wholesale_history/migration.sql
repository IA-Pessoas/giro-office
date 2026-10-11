-- Condição de atacadista do cliente: trilha append-only; o valor atual é a última linha
-- (sem linha = não atacadista). A sequência única transforma alterações simultâneas em conflito.
CREATE TABLE "fiscal.client_wholesale_history" (
  "id" TEXT NOT NULL,
  "organization_id" TEXT NOT NULL,
  "client_id" TEXT NOT NULL,
  "sequence" INTEGER NOT NULL,
  "previous_value" BOOLEAN NOT NULL,
  "new_value" BOOLEAN NOT NULL,
  "actor_user_id" TEXT NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "fiscal.client_wholesale_history_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "fiscal.client_wholesale_history_sequence_check" CHECK ("sequence" >= 1),
  CONSTRAINT "fiscal.client_wholesale_history_change_check" CHECK ("previous_value" <> "new_value")
);

CREATE UNIQUE INDEX "uq_fiscal_client_wholesale_history_client_sequence"
  ON "fiscal.client_wholesale_history" ("client_id", "sequence");
CREATE INDEX "idx_fiscal_client_wholesale_history_org_client_seq"
  ON "fiscal.client_wholesale_history" ("organization_id", "client_id", "sequence");
