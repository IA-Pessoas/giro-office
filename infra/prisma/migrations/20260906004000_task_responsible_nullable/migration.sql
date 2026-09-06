-- Expansão sem backfill: modelos e vínculos existentes permanecem inalterados.
ALTER TABLE "integracao.tasks" ALTER COLUMN "responsible_id" DROP NOT NULL;
