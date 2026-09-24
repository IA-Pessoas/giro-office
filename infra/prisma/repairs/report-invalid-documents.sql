-- Relatorio de CPF/CNPJ invalidos ou mascarados por tabela (#1375). Somente leitura.
-- Mesma regra de app/src/shared/utils/documentIssue.ts, que sinaliza os registros na UI.
--
--   psql "$DATABASE_URL" -X -f infra/prisma/repairs/report-invalid-documents.sql
--
-- Correcao: com a fonte legada, ou pela tela do registro (o selo "Revisar documento" some
-- quando o documento fica valido). Documento vazio nao entra no relatorio.
\set ON_ERROR_STOP on

-- Nao usa READ ONLY porque cria funcoes e tabela temporarias; so grava em pg_temp e termina em ROLLBACK.
BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ;
SET LOCAL search_path = pg_catalog, public;

CREATE FUNCTION pg_temp.check_digit(vals int[], first_weight int) RETURNS int
LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE
  total int := 0;
  weight int := first_weight;
  v int;
BEGIN
  FOREACH v IN ARRAY vals LOOP
    total := total + v * weight;
    weight := CASE WHEN weight = 2 THEN 9 ELSE weight - 1 END;
  END LOOP;
  RETURN CASE WHEN total % 11 < 2 THEN 0 ELSE 11 - total % 11 END;
END
$$;

-- Motivo da pendencia, ou NULL quando valido ou vazio. CNPJ alfanumerico: ASCII - 48.
CREATE FUNCTION pg_temp.document_issue(raw text) RETURNS text
LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE
  doc text := upper(regexp_replace(coalesce(raw, ''), '[^a-zA-Z0-9]', '', 'g'));
  vals int[];
  base int[];
  fw int;
  d1 int;
BEGIN
  IF coalesce(raw, '') !~ '\S' THEN
    RETURN NULL;
  END IF;
  IF raw LIKE '%*%' THEN
    RETURN 'Documento mascarado';
  END IF;
  IF doc !~ '^\d{11}$' AND doc !~ '^[A-Z0-9]{12}\d{2}$' THEN
    RETURN 'Tamanho inválido';
  END IF;
  IF doc ~ '^(.)\1*$' THEN
    RETURN 'Dígito verificador inválido';
  END IF;
  SELECT array_agg(ascii(c) - 48 ORDER BY i) INTO vals
  FROM unnest(string_to_array(doc, NULL)) WITH ORDINALITY AS t(c, i);
  base := vals[1:cardinality(vals) - 2];
  fw := CASE WHEN length(doc) = 11 THEN 10 ELSE 5 END;
  d1 := pg_temp.check_digit(base, fw);
  IF vals[cardinality(vals) - 1] = d1
     AND vals[cardinality(vals)] = pg_temp.check_digit(base || d1, fw + 1) THEN
    RETURN NULL;
  END IF;
  RETURN 'Dígito verificador inválido';
END
$$;

CREATE TEMP TABLE invalid_documents (
  table_name text, column_name text, id text, organization_id text, value text, issue text
);

DO $scan$
DECLARE
  target record;
  org_col text;
BEGIN
  FOR target IN
    SELECT * FROM (VALUES
      ('organizations', 'cnpj', false), ('users', 'cpf', false),
      ('clients', 'cpf_cnpj', false), ('clients', 'cpf_responsible', false),
      ('clients', 'cpf_agent', false),
      ('"clients.documentTermination"', 'legal_representative_cpf', false),
      ('"clients.pf"', 'cpf', false),
      ('"certificate.pj"', 'cnpj', false), ('"certificate.pf"', 'cpf', false),
      ('"certificate.pf"', 'cnpj', false),
      -- Responsavel do certificado e nome, nao documento: so a mascara conta.
      ('"certificate.pj"', 'responsible', true),
      ('"pessoal.union"', 'cnpj', false),
      ('"regularize.process"', 'cpf_cnpj', false),
      ('"regularize.proceduralGuidances"', 'cpf_cnpj', false),
      ('"tecnologia.terms"', 'user_cpf', false)
    ) AS t(tbl, col, mask_only)
  LOOP
    -- Schema recortado ou coluna renomeada: avisa em vez de relatar zero em silencio.
    IF NOT EXISTS (
      SELECT 1 FROM pg_attribute
      WHERE attrelid = to_regclass(target.tbl) AND attname = target.col AND NOT attisdropped
    ) THEN
      RAISE NOTICE 'Coluna %.% nao existe; fora do relatorio', target.tbl, target.col;
      CONTINUE;
    END IF;

    SELECT CASE WHEN count(*) > 0 THEN 'organization_id' END INTO org_col
    FROM pg_attribute
    WHERE attrelid = to_regclass(target.tbl) AND attname = 'organization_id' AND NOT attisdropped;

    EXECUTE format(
      'INSERT INTO invalid_documents
       SELECT %1$L, %2$L, id::text, %3$s, %2$I, issue FROM (
         SELECT *, pg_temp.document_issue(%2$I) AS issue FROM %1$s) s
       WHERE issue IS NOT NULL AND (NOT %4$L OR issue = %5$L)',
      target.tbl, target.col, coalesce(quote_ident(org_col), 'NULL'),
      target.mask_only, 'Documento mascarado');
  END LOOP;
END
$scan$;

\echo '== Resumo (tabela | coluna | problema | registros)'
SELECT table_name, column_name, issue, count(*) FROM invalid_documents
GROUP BY 1, 2, 3 ORDER BY 1, 2, 3;

\echo '== Registros (tabela | coluna | id | organizacao | valor | problema)'
SELECT * FROM invalid_documents ORDER BY table_name, column_name, organization_id, value;

ROLLBACK;
