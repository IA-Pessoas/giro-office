ALTER TABLE "regularize.process"
  ADD COLUMN IF NOT EXISTS "client_notice_date" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "financial_status" TEXT;

UPDATE "regularize.process"
SET "financial_status" = 'Pendente'
WHERE "financial_status" IS NULL;

ALTER TABLE "regularize.process"
  ALTER COLUMN "financial_status" SET DEFAULT 'Pendente',
  ALTER COLUMN "financial_status" SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS "regularize_process_identity_unique"
ON "regularize.process" (
  "organization_id",
  COALESCE("client_pj_id", ''),
  COALESCE("client_pf_id", ''),
  "cpf_cnpj",
  "process_type",
  "status"
);
