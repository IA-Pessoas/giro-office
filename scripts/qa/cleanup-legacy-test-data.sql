-- Limpeza dos dados de teste antigos em producao que nao tem prefixo QA_ (#1383).
-- Os registros QA da rodada de 23/09/2026 e os clientes "QA E2E CLIENT ... 20260922" saem com
-- scripts/qa/cleanup-e2e-prod-2026-09-23.sql (-v residue=1). Politica: docs/adr/0002-testes-em-producao.md.
--
--   psql "$DATABASE_URL" -X -f scripts/qa/cleanup-legacy-test-data.sql            -- dry-run (padrao)
--   psql "$DATABASE_URL" -X -v apply=1 -f scripts/qa/cleanup-legacy-test-data.sql -- aplica
--
-- So casa o nome exato (sem caixa e espacos): chamados "teste" e "teste 00001", ativo "teste" e
-- termo com codigo "testecodigo". O dry-run lista cada alvo para conferencia antes do apply.
-- Mensagens do chamado saem em cascata (FK ON DELETE CASCADE). Idempotente.
\set ON_ERROR_STOP on
\if :{?apply}
\else
  \set apply 0
\endif

BEGIN;
SET LOCAL search_path = pg_catalog, public;
SET LOCAL lock_timeout = '5s';

CREATE TEMP TABLE legacy_test_targets ON COMMIT DROP AS
SELECT 'tecnologia.requests'::text AS source, id::text AS id,
       title AS label, organization_id
FROM "tecnologia.requests" WHERE lower(btrim(title)) IN ('teste', 'teste 00001')
UNION ALL
SELECT 'tecnologia.inventory', id::text, asset_code, organization_id
FROM "tecnologia.inventory" WHERE lower(btrim(asset_code)) = 'teste'
UNION ALL
SELECT 'tecnologia.terms', id::text, asset_code, organization_id
FROM "tecnologia.terms" WHERE lower(btrim(asset_code)) = 'testecodigo';

\echo '== Alvos (tabela | id | nome | organizacao)'
SELECT source, id, label, organization_id FROM legacy_test_targets ORDER BY source, id;

DELETE FROM "tecnologia.requests"
WHERE id::text IN (SELECT id FROM legacy_test_targets WHERE source = 'tecnologia.requests');
DELETE FROM "tecnologia.inventory"
WHERE id::text IN (SELECT id FROM legacy_test_targets WHERE source = 'tecnologia.inventory');
DELETE FROM "tecnologia.terms"
WHERE id::text IN (SELECT id FROM legacy_test_targets WHERE source = 'tecnologia.terms');

-- Verificacao dos dados de teste conhecidos (os desta limpeza e os QA/QA E2E): deve dar 0.
\echo '== Verificacao'
SELECT 'registros de teste restantes', (
    SELECT count(*) FROM "tecnologia.requests" WHERE lower(btrim(title)) IN ('teste', 'teste 00001'))
  + (SELECT count(*) FROM "tecnologia.inventory" WHERE lower(btrim(asset_code)) = 'teste')
  + (SELECT count(*) FROM "tecnologia.terms" WHERE lower(btrim(asset_code)) = 'testecodigo')
  + (SELECT count(*) FROM clients WHERE name LIKE 'QA\_%' OR name LIKE 'QA E2E%');

\if :apply
  COMMIT;
  \echo '== APLICADO'
\else
  ROLLBACK;
  \echo '== DRY-RUN: nada foi gravado. Rode com -v apply=1 para aplicar.'
\endif
