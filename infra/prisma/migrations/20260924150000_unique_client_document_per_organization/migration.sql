-- A deduplicação manual de #1374 precisa ser revisada e aplicada antes desta migration.
-- Documentos vazios, placeholders repetidos e valores com tamanho inválido permanecem
-- fora do índice para não transformar dados legados incompletos em uma colisão global.
DO $$
DECLARE
  duplicate_documents text;
BEGIN
  SELECT string_agg(organization_id || ':' || document || ' (' || total || ')', ', ')
  INTO duplicate_documents
  FROM (
    SELECT
      organization_id,
      upper(regexp_replace(cpf_cnpj, '[^A-Za-z0-9]', '', 'g')) AS document,
      count(*) AS total
    FROM "clients"
    WHERE NULLIF(btrim(cpf_cnpj), '') IS NOT NULL
      AND length(regexp_replace(cpf_cnpj, '[^A-Za-z0-9]', '', 'g')) IN (11, 14)
      AND regexp_replace(cpf_cnpj, '[^A-Za-z0-9]', '', 'g') !~ '^([0-9])\1*$'
    GROUP BY organization_id, upper(regexp_replace(cpf_cnpj, '[^A-Za-z0-9]', '', 'g'))
    HAVING count(*) > 1
  ) duplicates;

  IF duplicate_documents IS NOT NULL THEN
    RAISE EXCEPTION
      'Clientes duplicados por organizacao e CPF/CNPJ normalizado; rode o reparo #1374 antes da migration: %',
      duplicate_documents;
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS "uq_clients_organization_document_normalized"
  ON "clients" (
    "organization_id",
    (upper(regexp_replace("cpf_cnpj", '[^A-Za-z0-9]', '', 'g')))
  )
  WHERE NULLIF(btrim("cpf_cnpj"), '') IS NOT NULL
    AND length(regexp_replace("cpf_cnpj", '[^A-Za-z0-9]', '', 'g')) IN (11, 14)
    AND regexp_replace("cpf_cnpj", '[^A-Za-z0-9]', '', 'g') !~ '^([0-9])\1*$';
