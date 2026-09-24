-- Limpeza dos dados de teste antigos em producao que nao tem prefixo QA_ (#1383).
-- Os registros QA da rodada de 23/09/2026 e os clientes "QA E2E CLIENT ... 20260922" saem com
-- scripts/qa/cleanup-e2e-prod-2026-09-23.sql (-v residue=1). Politica: docs/adr/0002-testes-em-producao.md.
--
--   psql "$DATABASE_URL" -X -f scripts/qa/cleanup-legacy-test-data.sql                          -- dry-run (padrao)
--   psql "$DATABASE_URL" -X -v apply=1 -v expected=<N> -f scripts/qa/cleanup-legacy-test-data.sql -- aplica
--
-- Excecao a regra de IDs explicitos do ADR: esses registros sao anteriores a politica e so tem o
-- nome. Casa o nome exato (sem caixa e espacos): chamados "teste" e "teste 00001", ativo "teste" e
-- termo "testecodigo" (em codigo do ativo, lista de equipamentos ou IMEI). O dry-run lista cada
-- alvo; o apply exige expected = total de alvos conferido no dry-run e aborta se mudou.
-- Mensagens do chamado saem em cascata (FK ON DELETE CASCADE). Idempotente.
\set ON_ERROR_STOP on
\if :{?apply}
\else
  \set apply 0
\endif
\if :{?expected}
\else
  \set expected -1
\endif

BEGIN;
SET LOCAL search_path = pg_catalog, public;
SET LOCAL lock_timeout = '5s';
SET LOCAL legacy_cleanup.apply = :'apply';
SET LOCAL legacy_cleanup.expected = :'expected';

CREATE TEMP TABLE legacy_test_targets ON COMMIT DROP AS
SELECT 'tecnologia.requests'::text AS source, id::text AS id, title AS label, organization_id
FROM "tecnologia.requests" WHERE lower(btrim(title)) IN ('teste', 'teste 00001')
UNION ALL
SELECT 'tecnologia.inventory', id::text, asset_code, organization_id
FROM "tecnologia.inventory" WHERE lower(btrim(asset_code)) = 'teste'
UNION ALL
SELECT 'tecnologia.terms', id::text, concat_ws(' / ', asset_code, equipament_list, imei), organization_id
FROM "tecnologia.terms"
WHERE 'testecodigo' IN (lower(btrim(asset_code)), lower(btrim(equipament_list)), lower(btrim(imei)));

\echo '== Alvos (tabela | id | nome | organizacao)'
SELECT source, id, label, organization_id FROM legacy_test_targets ORDER BY source, id;
\echo '== Total de alvos (use em -v expected=N)'
SELECT count(*) FROM legacy_test_targets;

DO $guard$
DECLARE
  found int := (SELECT count(*) FROM legacy_test_targets);
BEGIN
  IF current_setting('legacy_cleanup.apply')::boolean
     AND found <> current_setting('legacy_cleanup.expected')::int THEN
    RAISE EXCEPTION 'Alvos mudaram: esperado %, encontrado %. Rode o dry-run e confira.',
      current_setting('legacy_cleanup.expected'), found;
  END IF;
END
$guard$;

DELETE FROM "tecnologia.requests"
WHERE id::text IN (SELECT id FROM legacy_test_targets WHERE source = 'tecnologia.requests');
DELETE FROM "tecnologia.inventory"
WHERE id::text IN (SELECT id FROM legacy_test_targets WHERE source = 'tecnologia.inventory');
DELETE FROM "tecnologia.terms"
WHERE id::text IN (SELECT id FROM legacy_test_targets WHERE source = 'tecnologia.terms');

\if :apply
  COMMIT;
  \echo '== APLICADO. Rode scripts/qa/verify-no-test-data.sql para a verificacao final.'
\else
  ROLLBACK;
  \echo '== DRY-RUN: nada foi gravado. Rode com -v apply=1 -v expected=<total> para aplicar.'
\endif
