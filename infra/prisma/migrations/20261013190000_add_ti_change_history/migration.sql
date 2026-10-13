-- Histórico de alterações de TI (#1936; `tb_historico.tecnologia` e Historico::ti no legado).
-- Uma linha por campo alterado de um item de TI, com valor anterior e novo. Fica separado do
-- histórico patrimonial (`tecnologia.inventoryEvents`), dos movimentos de estoque e dos logs
-- de acesso. Valor de credencial não deve ser gravado aqui; o serviço também o oculta na leitura.
CREATE TABLE "tecnologia.changeHistory" (
  "id" TEXT NOT NULL,
  "item_type" TEXT NOT NULL,
  "item_id" TEXT NOT NULL,
  "field" TEXT NOT NULL,
  "before" TEXT,
  "after" TEXT,
  "note" TEXT,
  "actor_user_id" TEXT NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "organization_id" TEXT NOT NULL,
  CONSTRAINT "tecnologia.changeHistory_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "tecnologia.changeHistory_organization_id_fkey" FOREIGN KEY ("organization_id")
    REFERENCES "organizations" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX "idx_tecnologia_change_history_org_date"
  ON "tecnologia.changeHistory" ("organization_id", "created_at" DESC);

CREATE INDEX "idx_tecnologia_change_history_org_item"
  ON "tecnologia.changeHistory" ("organization_id", "item_type", "item_id");
