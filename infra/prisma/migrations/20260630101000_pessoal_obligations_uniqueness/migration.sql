DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "pessoal.obrigations"
    GROUP BY "organization_id", "client_id", "competence"
    HAVING COUNT(*) > 1
  ) THEN
    RAISE EXCEPTION 'Cannot create uq_pessoal_obligations_org_client_competence: duplicate pessoal obligations exist';
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS "uq_pessoal_obligations_org_client_competence"
  ON "pessoal.obrigations" ("organization_id", "client_id", "competence");

CREATE INDEX IF NOT EXISTS "idx_pessoal_obligations_org_competence"
  ON "pessoal.obrigations" ("organization_id", "competence");
