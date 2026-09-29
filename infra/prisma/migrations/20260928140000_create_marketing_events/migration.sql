CREATE TABLE "mtk.events" (
  "id" TEXT NOT NULL,
  "organization_id" TEXT NOT NULL,
  "name" VARCHAR(50) NOT NULL,
  "name_key" VARCHAR(50) NOT NULL,
  "legacy_id" INTEGER,
  "logo" VARCHAR(100) NOT NULL DEFAULT '',
  "status" VARCHAR(25) NOT NULL DEFAULT 'Novo',
  "priority" VARCHAR(15) NOT NULL,
  "objective" TEXT NOT NULL DEFAULT '',
  "audience" TEXT NOT NULL DEFAULT '',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "mtk.events_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "mtk.events_status_check"
    CHECK ("status" IN ('Novo', 'Em andamento', 'Concluído', 'Descontinuado')),
  CONSTRAINT "mtk.events_priority_check"
    CHECK ("priority" IN ('Baixa', 'Média', 'Alta')),
  CONSTRAINT "mtk.events_organization_id_fkey"
    FOREIGN KEY ("organization_id") REFERENCES "organizations"("id")
    ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "mtk.events_organization_name_key_unique"
  ON "mtk.events" ("organization_id", "name_key");

CREATE UNIQUE INDEX "mtk.events_organization_legacy_id_unique"
  ON "mtk.events" ("organization_id", "legacy_id");

CREATE INDEX "mtk.events_organization_status_idx"
  ON "mtk.events" ("organization_id", "status");
