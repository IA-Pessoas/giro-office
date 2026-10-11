-- Versão salva do mapa de um grupo (#1749; tb_workspace.mapas_clientes no legado). A árvore
-- editada fica como foi salva; uma versão por grupo, apagada junto com o grupo.
CREATE TABLE "regularize.group_maps" (
  "id" TEXT NOT NULL,
  "organization_id" TEXT NOT NULL,
  "group_id" TEXT NOT NULL,
  "tree" JSONB NOT NULL,
  "updated_by_user_id" TEXT NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "regularize.group_maps_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "regularize.group_maps_organization_id_fkey" FOREIGN KEY ("organization_id")
    REFERENCES "organizations" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "regularize.group_maps_group_id_fkey" FOREIGN KEY ("group_id")
    REFERENCES "clients.group" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "uq_regularize_group_map_group"
  ON "regularize.group_maps" ("organization_id", "group_id");
