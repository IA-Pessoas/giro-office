-- Mudanças da resposta de licitação do cliente (#1743). NULL = não informado, distinto de Sim/Não.
CREATE TABLE "clients.licitacao_history" (
  "id" TEXT NOT NULL,
  "organization_id" TEXT NOT NULL,
  "client_id" TEXT NOT NULL,
  "previous_value" BOOLEAN,
  "new_value" BOOLEAN,
  "actor_user_id" TEXT NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "clients.licitacao_history_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "clients.licitacao_history_client_id_fkey" FOREIGN KEY ("client_id")
    REFERENCES "clients" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "clients.licitacao_history_organization_id_fkey" FOREIGN KEY ("organization_id")
    REFERENCES "organizations" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX "idx_client_licitacao_history_client"
  ON "clients.licitacao_history" ("organization_id", "client_id", "created_at");
