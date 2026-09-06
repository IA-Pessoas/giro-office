DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "integracao.tasks"
    WHERE "status" IN ('Em Andamento', 'A Realizar', 'Em Espera')
    GROUP BY "organization_id", "project_id", "model_id"
    HAVING COUNT(*) > 1
  ) THEN
    RAISE EXCEPTION 'Nao e possivel aplicar uq_tasks_active_org_project_model: existem tarefas ativas duplicadas para a mesma organizacao, projeto e modelo.';
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS "uq_tasks_active_org_project_model"
  ON "integracao.tasks" ("organization_id", "project_id", "model_id")
  WHERE "status" IN ('Em Andamento', 'A Realizar', 'Em Espera');
