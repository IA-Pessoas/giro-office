-- Deduplica clientes com o mesmo CPF/CNPJ normalizado na mesma organizacao (#1374).
-- Reparo pontual, nao e migration. Leia docs/migration/dedupe-clients-by-document.md antes de rodar.
--
--   psql "$DATABASE_URL" -X -f infra/prisma/repairs/dedupe-clients-by-document.sql            -- dry-run (padrao)
--   psql "$DATABASE_URL" -X -v apply=1 -f infra/prisma/repairs/dedupe-clients-by-document.sql -- aplica
--
-- Regra: fica o cliente mais antigo (register_date_prospecting, depois id). Todo vinculo
-- (FK para clients.id) dos duplicados passa a apontar para ele, campos vazios dele recebem o
-- primeiro valor preenchido dos duplicados e os duplicados sao removidos. Documentos com
-- tamanho diferente de 11/14 digitos ou com um digito so (mascarados, placeholders) ficam de fora.
-- Idempotente: sem duplicados, nao altera nada.
\set ON_ERROR_STOP on
\if :{?apply}
\else
  \set apply 0
\endif

BEGIN;
SET LOCAL lock_timeout = '5s';
LOCK TABLE clients IN SHARE ROW EXCLUSIVE MODE;
SELECT set_config('client_dedupe.apply', :'apply', true) \gset

CREATE TEMP TABLE client_dedupe_map ON COMMIT DROP AS
WITH normalized AS (
  SELECT id, organization_id, name, register_date_prospecting,
         regexp_replace(cpf_cnpj, '\D', '', 'g') AS doc
  FROM clients
), ranked AS (
  SELECT *,
         row_number() OVER w AS rn,
         first_value(id) OVER w AS keep_id
  FROM normalized
  WHERE length(doc) IN (11, 14) AND doc !~ '^(\d)\1*$'
  WINDOW w AS (PARTITION BY organization_id, doc ORDER BY register_date_prospecting, id)
)
SELECT organization_id, doc, keep_id, id AS dup_id, name AS dup_name, rn
FROM ranked
WHERE rn > 1;

CREATE TEMP TABLE client_dedupe_refs (
  table_name text, column_name text, rows_moved bigint, conflict text
) ON COMMIT DROP;
CREATE TEMP TABLE client_dedupe_fills (column_name text, rows_filled bigint) ON COMMIT DROP;

\echo '== Duplicados (organizacao | documento | mantido | removido | nome removido)'
SELECT organization_id, doc, keep_id, dup_id, dup_name FROM client_dedupe_map ORDER BY organization_id, doc, rn;

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
    WHERE c.contype = 'f' AND c.confrelid = 'clients'::regclass AND cardinality(c.conkey) = 1
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

-- Preenche campos vazios (NULL ou '') do mantido com o primeiro duplicado preenchido.
DO $fills$
DECLARE
  col text;
  filled bigint;
BEGIN
  FOR col IN
    SELECT attname FROM pg_attribute
    WHERE attrelid = 'clients'::regclass AND attnum > 0 AND NOT attisdropped AND NOT attnotnull
    ORDER BY attnum
  LOOP
    EXECUTE format(
      'UPDATE clients k SET %1$I = (
         SELECT d.%1$I FROM client_dedupe_map m JOIN clients d ON d.id = m.dup_id
         WHERE m.keep_id = k.id AND NULLIF(d.%1$I::text, %2$L) IS NOT NULL
         ORDER BY m.rn LIMIT 1)
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
    WHERE length(regexp_replace(cpf_cnpj, '\D', '', 'g')) IN (11, 14)
      AND regexp_replace(cpf_cnpj, '\D', '', 'g') !~ '^(\d)\1*$'
    GROUP BY organization_id, regexp_replace(cpf_cnpj, '\D', '', 'g')
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
