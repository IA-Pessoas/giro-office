DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "stock.categories"
    WHERE "status" = true
    GROUP BY
      "organization_id",
      "department_id",
      lower(btrim(regexp_replace("name", '[[:space:]]+', ' ', 'g')))
    HAVING COUNT(*) > 1
  ) THEN
    RAISE EXCEPTION 'Nao e possivel aplicar uq_stock_categories_active_normalized_name: existem categorias ativas duplicadas para a mesma organizacao e departamento.';
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS "uq_stock_categories_active_normalized_name"
  ON "stock.categories" (
    "organization_id",
    "department_id",
    lower(btrim(regexp_replace("name", '[[:space:]]+', ' ', 'g')))
  )
  WHERE "status" = true;
