ALTER TABLE "regularize.proceduralGuidances"
  ADD COLUMN "target_type" TEXT NOT NULL DEFAULT 'SEM_CLIENTE',
  ADD COLUMN "client_pj_id" TEXT,
  ADD COLUMN "client_pf_id" TEXT,
  ADD COLUMN "target_snapshot" JSONB NOT NULL DEFAULT '{"version":1,"source":"manual"}'::jsonb,
  ADD COLUMN "branch_data" JSONB;

ALTER TABLE "regularize.proceduralGuidances"
  ALTER COLUMN "process_id" DROP NOT NULL;

ALTER TABLE "regularize.proceduralGuidances"
  ADD CONSTRAINT "procedural_guidances_client_pj_id_fkey"
    FOREIGN KEY ("client_pj_id") REFERENCES "clients"("id"),
  ADD CONSTRAINT "procedural_guidances_client_pf_id_fkey"
    FOREIGN KEY ("client_pf_id") REFERENCES "clients.pf"("id"),
  ADD CONSTRAINT "procedural_guidances_target_type_check"
    CHECK ("target_type" IN ('PJ', 'PF', 'SEM_CLIENTE'));

CREATE TABLE "regularize.proceduralGuidanceChecklistItems" (
  "id" TEXT NOT NULL,
  "guidance_id" TEXT NOT NULL,
  "code" TEXT NOT NULL,
  "label" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'Pendente',
  "observation" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "proceduralGuidanceChecklistItems_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "proceduralGuidanceChecklistItems_guidance_id_code_key" UNIQUE ("guidance_id", "code"),
  CONSTRAINT "proceduralGuidanceChecklistItems_guidance_id_fkey"
    FOREIGN KEY ("guidance_id") REFERENCES "regularize.proceduralGuidances"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

UPDATE "regularize.proceduralGuidances" AS guidance
SET "target_type" = CASE
  WHEN process."client_pj_id" IS NOT NULL AND process."client_pf_id" IS NOT NULL THEN 'SEM_CLIENTE'
  WHEN process."client_pj_id" IS NOT NULL THEN 'PJ'
  WHEN process."client_pf_id" IS NOT NULL THEN 'PF'
  ELSE 'SEM_CLIENTE'
END
FROM "regularize.process" AS process
WHERE guidance."process_id" = process."id"
  AND guidance."organization_id" = process."organization_id";

UPDATE "regularize.proceduralGuidances" AS guidance
SET
  "client_pj_id" = CASE
    WHEN guidance."target_type" = 'PJ' THEN client_pj."id"
    ELSE NULL
  END,
  "client_pf_id" = CASE
    WHEN guidance."target_type" = 'PF' THEN client_pf."id"
    ELSE NULL
  END
FROM "regularize.process" AS process
LEFT JOIN "clients" AS client_pj
  ON client_pj."id" = process."client_pj_id"
  AND client_pj."organization_id" = process."organization_id"
LEFT JOIN "clients.pf" AS client_pf
  ON client_pf."id" = process."client_pf_id"
  AND client_pf."organization_id" = process."organization_id"
WHERE guidance."process_id" = process."id"
  AND guidance."organization_id" = process."organization_id";

UPDATE "regularize.proceduralGuidances" AS guidance
SET "target_snapshot" = jsonb_strip_nulls(jsonb_build_object('version', 1,
  'source', CASE guidance."target_type"
    WHEN 'PJ' THEN 'client_pj'
    WHEN 'PF' THEN 'client_pf'
    ELSE 'manual'
  END,
  'name', CASE
    WHEN guidance."target_type" = 'SEM_CLIENTE' THEN COALESCE(
      guidance."company_name",
      guidance."trade_name",
      guidance."type",
      'Registro legado'
    )
    ELSE NULL
  END,
  'type', guidance."type",
  'request', guidance."request",
  'framework_obs', guidance."framework_obs",
  'legal_nature', guidance."legal_nature",
  'company_name', guidance."company_name",
  'trade_name', guidance."trade_name",
  'cpf_cnpj', guidance."cpf_cnpj",
  'share_capital', guidance."share_capital",
  'iptu', guidance."iptu",
  'address', guidance."address",
  'comporate_purpose', guidance."comporate_purpose",
  'carryng', guidance."carryng",
  'regime', guidance."regime",
  'legal_representative', guidance."legal_representative",
  'economic_activities', guidance."economic_activities",
  'partners', guidance."partners",
  'status', guidance."status"
));

INSERT INTO "regularize.proceduralGuidanceChecklistItems" (
  "id",
  "guidance_id",
  "code",
  "label",
  "status"
)
SELECT
  gen_random_uuid()::text,
  guidance."id",
  checklist.code,
  checklist.label,
  'Pendente'
FROM "regularize.proceduralGuidances" AS guidance
CROSS JOIN (VALUES
  ('type', 'Tipo de orientação'),
  ('request', 'Solicitação'),
  ('framework_obs', 'Observações de enquadramento'),
  ('legal_nature', 'Natureza jurídica'),
  ('company_name', 'Razão social'),
  ('trade_name', 'Nome fantasia'),
  ('cpf_cnpj', 'CPF/CNPJ'),
  ('share_capital', 'Capital social'),
  ('iptu', 'IPTU'),
  ('address', 'Endereço'),
  ('comporate_purpose', 'Objeto social'),
  ('carryng', 'Porte'),
  ('regime', 'Regime tributário'),
  ('legal_representative', 'Representante legal'),
  ('economic_activities', 'Atividades econômicas'),
  ('partners', 'Sócios'),
  ('branch', 'Filial')
) AS checklist(code, label)
ON CONFLICT DO NOTHING;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "regularize.proceduralGuidances"
    WHERE "process_id" IS NOT NULL
      AND "status" = 'Em andamento'
    GROUP BY "organization_id", "process_id"
    HAVING COUNT(*) > 1
  ) THEN
    RAISE EXCEPTION 'Cannot create procedural_guidance_active_process_unique: duplicate active procedural guidances exist';
  END IF;
END $$;

CREATE UNIQUE INDEX "procedural_guidance_active_process_unique"
ON "regularize.proceduralGuidances" ("organization_id", "process_id")
WHERE "process_id" IS NOT NULL AND "status" = 'Em andamento';
