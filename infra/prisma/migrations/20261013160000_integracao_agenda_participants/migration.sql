-- Compromissos de Integração compartilham a tabela, mas têm escopo próprio.
-- Os campos antigos ficam nulos para eventos dos demais módulos.
ALTER TABLE "agenda"
  ADD COLUMN "module" TEXT,
  ADD COLUMN "participant_id_4" TEXT,
  ADD COLUMN "department_id_2" TEXT,
  ADD COLUMN "department_id_3" TEXT,
  ADD COLUMN "department_id_4" TEXT;

ALTER TABLE "agenda"
  ADD CONSTRAINT "agenda_participant_id_4_fkey"
  FOREIGN KEY ("participant_id_4") REFERENCES "users"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "idx_agenda_org_module_date"
  ON "agenda"("organization_id", "module", "date");
