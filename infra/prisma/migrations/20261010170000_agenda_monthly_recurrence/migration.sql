-- Recorrência mensal da agenda compartilhada (#1700).
-- A regra guarda a última competência gerada; a ocorrência aponta para a regra e a
-- competência, e o índice único garante uma ocorrência por regra e mês.
ALTER TABLE "agenda.recurring" ADD COLUMN "generated_through" TEXT;

ALTER TABLE "agenda"
  ADD COLUMN "recurring_agenda_id" TEXT,
  ADD COLUMN "recurrence_month" TEXT;

ALTER TABLE "agenda"
  ADD CONSTRAINT "agenda_recurring_agenda_id_fkey"
  FOREIGN KEY ("recurring_agenda_id") REFERENCES "agenda.recurring"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

CREATE UNIQUE INDEX "uq_agenda_recurrence_occurrence"
  ON "agenda"("recurring_agenda_id", "recurrence_month");
