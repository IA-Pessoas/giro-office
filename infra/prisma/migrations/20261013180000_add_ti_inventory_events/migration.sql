-- Histórico patrimonial do inventário de TI (#1932; Historico::ti no legado). Um evento por
-- item e operação: atribuição, devolução e transferência entre pessoas e locais. Fica
-- separado dos movimentos de estoque e some junto com o item.
CREATE TABLE "tecnologia.inventoryEvents" (
  "id" TEXT NOT NULL,
  "inventory_id" TEXT NOT NULL,
  "action" TEXT NOT NULL,
  "from_user_id" TEXT,
  "from_location_id" TEXT,
  "to_user_id" TEXT,
  "to_location_id" TEXT,
  "actor_user_id" TEXT NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "organization_id" TEXT NOT NULL,
  CONSTRAINT "tecnologia.inventoryEvents_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "tecnologia.inventoryEvents_inventory_id_fkey" FOREIGN KEY ("inventory_id")
    REFERENCES "tecnologia.inventory" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "tecnologia.inventoryEvents_organization_id_fkey" FOREIGN KEY ("organization_id")
    REFERENCES "organizations" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX "idx_tecnologia_inventory_events_org_item"
  ON "tecnologia.inventoryEvents" ("organization_id", "inventory_id", "created_at");
