-- Deduplica clientes com o mesmo CPF/CNPJ normalizado na mesma organizacao (#1374).
-- Reparo pontual, nao e migration. Leia docs/migration/dedupe-clients-by-document.md antes de rodar.
--
--   psql "$DATABASE_URL" -X -f infra/prisma/repairs/dedupe-clients-by-document.sql            -- dry-run (padrao)
--   psql "$DATABASE_URL" -X -v apply=1 -f infra/prisma/repairs/dedupe-clients-by-document.sql -- aplica
--
-- Regra: fica o cliente ativo e nao excluido mais antigo (register_date_prospecting, depois id);
-- sem nenhum ativo no grupo, o nao excluido mais antigo. Todo vinculo dos duplicados passa a apontar
-- para ele, campos de cadastro vazios dele recebem o primeiro valor preenchido dos duplicados e os
-- duplicados sao removidos. Ficam de fora documentos com tamanho diferente de 11/14 ou com um
-- caractere so (mascarados, placeholders) e clientes de teste (QA_, QA E2E): rode antes a limpeza
-- de docs/adr/0002-testes-em-producao.md.
-- Idempotente: sem duplicados, nao altera nada.
\set ON_ERROR_STOP on
\if :{?apply}
\else
  \set apply 0
\endif

BEGIN;
SET LOCAL search_path = pg_catalog, public;
SET LOCAL lock_timeout = '5s';
SET LOCAL client_dedupe.apply = :'apply';
-- O dry-run e o relatorio para revisao: le sem bloquear escritas em clients.
\if :apply
  LOCK TABLE clients IN SHARE ROW EXCLUSIVE MODE;
\endif

-- Documento so com letras e digitos (CNPJ alfanumerico, como report-invalid-documents.sql), ou
-- NULL quando nao pode identificar o cliente.
CREATE FUNCTION pg_temp.client_doc(raw text) RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT d FROM (SELECT upper(regexp_replace(raw, '[^a-zA-Z0-9]', '', 'g')) AS d) n
  WHERE length(d) IN (11, 14) AND d !~ '^(.)\1*$'
$$;

CREATE FUNCTION pg_temp.is_test_client(name text) RETURNS boolean LANGUAGE sql IMMUTABLE AS $$
  SELECT name LIKE 'QA\_%' OR name LIKE 'QA E2E%'
$$;

DO $guard$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE contype = 'f' AND confrelid = 'clients'::regclass AND cardinality(conkey) > 1
  ) THEN
    RAISE EXCEPTION 'FK composta para clients: o reparo nao sabe remapear, revise o script';
  END IF;
END
$guard$;

CREATE TEMP TABLE client_dedupe_map ON COMMIT DROP AS
WITH ranked AS (
  SELECT id, organization_id, name, pg_temp.client_doc(cpf_cnpj) AS doc,
         row_number() OVER w AS dup_rank,
         first_value(id) OVER w AS keep_id
  FROM clients
  WHERE pg_temp.client_doc(cpf_cnpj) IS NOT NULL AND NOT pg_temp.is_test_client(name)
  WINDOW w AS (PARTITION BY organization_id, pg_temp.client_doc(cpf_cnpj)
               ORDER BY deletion_date IS NOT NULL, lower(coalesce(status, '')) <> 'ativo',
                        register_date_prospecting, id)
)
SELECT organization_id, doc, keep_id, id AS dup_id, name AS dup_name, dup_rank
FROM ranked
WHERE dup_rank > 1;

CREATE TEMP TABLE client_dedupe_refs (
  table_name text, column_name text, rows_moved bigint, conflict text
) ON COMMIT DROP;
CREATE TEMP TABLE client_dedupe_fills (column_name text, rows_filled bigint) ON COMMIT DROP;

\echo '== Duplicados (organizacao | documento | mantido | removido | nome removido)'
SELECT organization_id, doc, keep_id, dup_id, dup_name FROM client_dedupe_map
ORDER BY organization_id, doc, dup_rank;

-- Move os vinculos. Cada UPDATE roda em subtransacao: conflito de unicidade vira linha do
-- relatorio em vez de abortar o dry-run inteiro.
DO $refs$
DECLARE
  fk record;
  moved bigint;
BEGIN
  FOR fk IN
    SELECT c.conrelid::regclass AS tbl, a.attname AS col
    FROM pg_constraint c
    JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = c.conkey[1]
    WHERE c.contype = 'f' AND c.confrelid = 'clients'::regclass
    UNION
    -- Vinculos a clients.id sem FK no banco; mantenha em dia com o schema.prisma.
    SELECT to_regclass(t), 'client_id'
    FROM unnest(ARRAY[
      '"commercial.email_notifications"', '"commercial.prospecting_close_events"',
      '"client.commercial_projection_events"', '"pessoal.payroll"',
      '"pessoal.group_assignment_preview_details"'
    ]) AS t
    WHERE to_regclass(t) IS NOT NULL
    ORDER BY 1, 2
  LOOP
    BEGIN
      EXECUTE format(
        'UPDATE %s t SET %I = m.keep_id FROM client_dedupe_map m WHERE t.%I = m.dup_id',
        fk.tbl, fk.col, fk.col);
      GET DIAGNOSTICS moved = ROW_COUNT;
      INSERT INTO client_dedupe_refs VALUES (fk.tbl::text, fk.col, moved, NULL);
    EXCEPTION WHEN unique_violation THEN
      INSERT INTO client_dedupe_refs VALUES (fk.tbl::text, fk.col, 0, SQLERRM);
    END;
  END LOOP;
END
$refs$;

-- Preenche campos de cadastro vazios (NULL ou '') do mantido com o primeiro duplicado
-- preenchido. Datas de ciclo de vida (exclusao, saida, greve) e flags de servico ficam de fora:
-- herdar esses valores mudaria o estado do cliente mantido.
DO $fills$
DECLARE
  col text;
  filled bigint;
BEGIN
  FOREACH col IN ARRAY ARRAY[
    'dominio_code', 'company_name', 'fantasy_name', 'cnae', 'cnae_secondary', 'responsible',
    'cpf_responsible', 'agent', 'cpf_agent', 'number', 'email', 'address', 'cep', 'neighborhood',
    'state', 'city', 'municipal_registration', 'state_registration',
    'commercial_board_registration', 'opening_date', 'instagram', 'indication', 'regime',
    'size', 'segment'
  ] LOOP
    CONTINUE WHEN NOT EXISTS (
      SELECT 1 FROM pg_attribute
      WHERE attrelid = 'clients'::regclass AND attname = col AND NOT attisdropped);
    EXECUTE format(
      'UPDATE clients k SET %1$I = (
         SELECT d.%1$I FROM client_dedupe_map m JOIN clients d ON d.id = m.dup_id
         WHERE m.keep_id = k.id AND NULLIF(d.%1$I::text, %2$L) IS NOT NULL
         ORDER BY m.dup_rank LIMIT 1)
       WHERE NULLIF(k.%1$I::text, %2$L) IS NULL
         AND EXISTS (
           SELECT 1 FROM client_dedupe_map m JOIN clients d ON d.id = m.dup_id
           WHERE m.keep_id = k.id AND NULLIF(d.%1$I::text, %2$L) IS NOT NULL)',
      col, '');
    GET DIAGNOSTICS filled = ROW_COUNT;
    IF filled > 0 THEN
      INSERT INTO client_dedupe_fills VALUES (col, filled);
    END IF;
  END LOOP;
END
$fills$;

\echo '== Vinculos movidos (tabela | coluna | linhas | conflito)'
SELECT table_name, column_name, rows_moved, conflict FROM client_dedupe_refs
WHERE rows_moved > 0 OR conflict IS NOT NULL ORDER BY 1, 2;

\echo '== Campos vazios preenchidos no mantido (coluna | clientes)'
SELECT column_name, rows_filled FROM client_dedupe_fills ORDER BY 1;

DO $check$
DECLARE
  conflicts text;
BEGIN
  SELECT string_agg(table_name || '.' || column_name || ': ' || conflict, E'\n')
  INTO conflicts FROM client_dedupe_refs WHERE conflict IS NOT NULL;
  IF conflicts IS NULL THEN
    DELETE FROM clients WHERE id IN (SELECT dup_id FROM client_dedupe_map);
  ELSIF current_setting('client_dedupe.apply')::boolean THEN
    RAISE EXCEPTION E'Conflitos de unicidade; resolva antes de aplicar:\n%', conflicts;
  ELSE
    RAISE WARNING E'Conflitos de unicidade; o apply vai falhar:\n%', conflicts;
    RETURN;
  END IF;
  IF EXISTS (
    SELECT 1 FROM clients
    WHERE pg_temp.client_doc(cpf_cnpj) IS NOT NULL AND NOT pg_temp.is_test_client(name)
    GROUP BY organization_id, pg_temp.client_doc(cpf_cnpj)
    HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION 'Ainda ha clientes duplicados apos o merge';
  END IF;
END
$check$;

\if :apply
  COMMIT;
  \echo '== APLICADO'
\else
  ROLLBACK;
  \echo '== DRY-RUN: nada foi gravado. Rode com -v apply=1 para aplicar.'
\endif
