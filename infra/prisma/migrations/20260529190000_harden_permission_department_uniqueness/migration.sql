DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "permissions"
    GROUP BY "user_id", "organization_id"
    HAVING COUNT(*) > 1
  ) THEN
    RAISE EXCEPTION 'Nao e possivel aplicar uq_permissions_user_org: existem permissoes duplicadas para o mesmo usuario e organizacao.';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM "departments"
    GROUP BY "organization_id", "name"
    HAVING COUNT(*) > 1
  ) THEN
    RAISE EXCEPTION 'Nao e possivel aplicar uq_departments_org_name: existem departamentos duplicados para a mesma organizacao e nome.';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM "departments"
    GROUP BY "organization_id", lower("name")
    HAVING COUNT(*) > 1
  ) THEN
    RAISE EXCEPTION 'Nao e possivel aplicar uq_departments_org_lower_name: existem departamentos duplicados por nome case-insensitive na mesma organizacao.';
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS "uq_permissions_user_org"
  ON "permissions" ("user_id", "organization_id");

CREATE UNIQUE INDEX IF NOT EXISTS "uq_departments_org_name"
  ON "departments" ("organization_id", "name");

CREATE UNIQUE INDEX IF NOT EXISTS "uq_departments_org_lower_name"
  ON "departments" ("organization_id", lower("name"));
