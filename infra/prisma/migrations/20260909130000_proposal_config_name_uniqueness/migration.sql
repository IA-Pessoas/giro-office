DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "proposal.config"
    GROUP BY "organization_id", "name"
    HAVING COUNT(*) > 1
  ) THEN
    RAISE EXCEPTION 'Nao e possivel aplicar uq_proposal_config_org_name: existem configuracoes duplicadas para a mesma organizacao e nome.';
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS "uq_proposal_config_org_name"
  ON "proposal.config" ("organization_id", "name");
