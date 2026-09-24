-- Liga as flags de servico (contabil, fiscal, pessoal) dos clientes com evidencia migrada (#1376).
-- Reparo pontual, nao e migration. Leia docs/migration/backfill-client-service-flags.md antes de rodar.
--
--   psql "$DATABASE_URL" -X -f infra/prisma/repairs/backfill-client-service-flags.sql            -- dry-run (padrao)
--   psql "$DATABASE_URL" -X -v apply=1 -f infra/prisma/repairs/backfill-client-service-flags.sql -- aplica
--
-- Evidencia e dado ja migrado do modulo, nao a fonte legada: o dry-run e o relatorio para o negocio
-- conferir a contagem antes do apply. So liga flag (nunca desliga) e e idempotente.
\set ON_ERROR_STOP on
\if :{?apply}
\else
  \set apply 0
\endif

BEGIN;
SET LOCAL search_path = pg_catalog, public;
SET LOCAL lock_timeout = '5s';

CREATE TEMP TABLE service_flag_evidence (client_id text, flag text, source text) ON COMMIT DROP;

DO $evidence$
DECLARE
  src record;
BEGIN
  FOR src IN
    SELECT * FROM (VALUES
      ('contabil', '"contabil.control"', NULL), ('contabil', '"contabil.relationship"', NULL),
      ('contabil', '"contabil.responsibles"', NULL),
      ('contabil', '"triagem.configs"', 'CONTABIL'), ('contabil', '"triagem.monthly"', 'CONTABIL'),
      ('contabil', '"triagem.responsibles"', 'CONTABIL'),
      ('fiscal', '"triagem.configs"', 'FISCAL'), ('fiscal', '"triagem.monthly"', 'FISCAL'),
      ('fiscal', '"triagem.responsibles"', 'FISCAL'),
      ('pessoal', '"pessoal.ldd"', NULL), ('pessoal', '"pessoal.obrigations"', NULL),
      ('pessoal', '"pessoal.situations"', NULL), ('pessoal', '"pessoal.passwords"', NULL),
      ('pessoal', '"pessoal.payroll"', NULL)
    ) AS t(flag, tbl, type_filter)
  LOOP
    IF to_regclass(src.tbl) IS NULL THEN
      RAISE NOTICE 'Tabela % nao existe; fora da evidencia', src.tbl;
      CONTINUE;
    END IF;
    EXECUTE format(
      'INSERT INTO service_flag_evidence SELECT DISTINCT client_id, %L, %L FROM %s
       WHERE client_id IS NOT NULL AND %s',
      src.flag, src.tbl || coalesce('[' || src.type_filter || ']', ''), src.tbl,
      CASE WHEN src.type_filter IS NULL THEN 'true' ELSE format('type = %L', src.type_filter) END);
  END LOOP;
END
$evidence$;

-- Clientes com evidencia cuja flag ainda nao e true.
CREATE TEMP TABLE service_flag_changes ON COMMIT DROP AS
SELECT c.id, c.organization_id, c.status, to_jsonb(c) ->> 'name' AS name, e.flag,
       string_agg(DISTINCT e.source, ', ') AS sources
FROM service_flag_evidence e
JOIN clients c ON c.id = e.client_id
WHERE (to_jsonb(c) ->> e.flag)::boolean IS NOT TRUE
GROUP BY c.id, c.organization_id, c.status, name, e.flag;

\echo '== Resumo (flag | status do cliente | clientes a ligar)'
SELECT flag, status, count(*) FROM service_flag_changes GROUP BY 1, 2 ORDER BY 1, 2;

\echo '== Clientes (flag | organizacao | id | nome | status | evidencia)'
SELECT flag, organization_id, id, name, status, sources FROM service_flag_changes
ORDER BY flag, organization_id, name;

UPDATE clients SET contabil = true
WHERE id IN (SELECT id FROM service_flag_changes WHERE flag = 'contabil');
UPDATE clients SET fiscal = true
WHERE id IN (SELECT id FROM service_flag_changes WHERE flag = 'fiscal');
UPDATE clients SET pessoal = true
WHERE id IN (SELECT id FROM service_flag_changes WHERE flag = 'pessoal');

\echo '== Clientes ativos com a flag depois do reparo (flag | clientes)'
SELECT 'contabil', count(*) FILTER (WHERE contabil) FROM clients WHERE status = 'Ativo'
UNION ALL SELECT 'fiscal', count(*) FILTER (WHERE fiscal) FROM clients WHERE status = 'Ativo'
UNION ALL SELECT 'pessoal', count(*) FILTER (WHERE pessoal) FROM clients WHERE status = 'Ativo';

\if :apply
  COMMIT;
  \echo '== APLICADO'
\else
  ROLLBACK;
  \echo '== DRY-RUN: nada foi gravado. Rode com -v apply=1 para aplicar.'
\endif
