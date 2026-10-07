ALTER TABLE "clients"
  ADD COLUMN "created_at" TIMESTAMP(3),
  ADD COLUMN "coringa_status" TEXT,
  ADD COLUMN "tecnologia" BOOLEAN,
  ADD COLUMN "licitacao" BOOLEAN;

-- Registros antigos não têm data de criação auditável. Só novas inserções recebem o padrão.
ALTER TABLE "clients" ALTER COLUMN "created_at" SET DEFAULT CURRENT_TIMESTAMP;
