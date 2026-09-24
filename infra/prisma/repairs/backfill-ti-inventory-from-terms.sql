-- Cria no inventario de TI os ativos citados nos termos de responsabilidade (#1380).
-- Reparo pontual, nao e migration. Leia docs/migration/backfill-ti-inventory-from-terms.md antes de rodar.
--
--   psql "$DATABASE_URL" -X -f infra/prisma/repairs/backfill-ti-inventory-from-terms.sql            -- dry-run (padrao)
--   psql "$DATABASE_URL" -X -v apply=1 -f infra/prisma/repairs/backfill-ti-inventory-from-terms.sql -- aplica
--
-- A fonte legada do inventario nao esta disponivel (decisao do dono, 24/09/2026): cada asset_code
-- citado em termo e sem item no inventario vira item na categoria "Migrado dos termos", com
-- usuario e data de entrega do termo mais recente daquele codigo. O vinculo termo-ativo e pelo
-- asset_code, sem FK. Codigos separados por virgula, ponto e virgula ou barra viram itens
-- separados; comparacao ignora caixa e espacos. Idempotente.
\set ON_ERROR_STOP on
\if :{?apply}
\else
  \set apply 0
\endif

BEGIN;
SET LOCAL search_path = pg_catalog, public;
SET LOCAL lock_timeout = '5s';
\if :apply
  LOCK TABLE "tecnologia.inventory" IN SHARE ROW EXCLUSIVE MODE;
\endif

CREATE TEMP TABLE ti_inventory_candidates ON COMMIT DROP AS
WITH codes AS (
  SELECT t.organization_id, t.id AS term_id, t.user_id, t.date, t.user_name,
         t.equipament_list, t.brand, upper(btrim(code)) AS asset_code
  FROM "tecnologia.terms" t
  CROSS JOIN LATERAL regexp_split_to_table(t.asset_code, '[,;/]') AS code
  WHERE btrim(code) <> ''
), latest AS (
  SELECT DISTINCT ON (organization_id, asset_code) *
  FROM codes
  ORDER BY organization_id, asset_code, date DESC, term_id
)
SELECT l.*
FROM latest l
WHERE NOT EXISTS (
  SELECT 1 FROM "tecnologia.inventory" i
  WHERE i.organization_id = l.organization_id AND upper(btrim(i.asset_code)) = l.asset_code
);

\echo '== Ativos a criar (codigo | usuario | entrega | nome no termo | equipamento | marca | termo)'
SELECT asset_code, user_id, to_char(date, 'YYYY-MM-DD'), user_name, equipament_list, brand, term_id
FROM ti_inventory_candidates ORDER BY organization_id, asset_code;

INSERT INTO "tecnologia.inventoryCategories" (id, name, active, organization_id)
SELECT gen_random_uuid()::text, 'Migrado dos termos', true, org.organization_id
FROM (SELECT DISTINCT organization_id FROM ti_inventory_candidates) org
WHERE NOT EXISTS (
  SELECT 1 FROM "tecnologia.inventoryCategories" c
  WHERE c.organization_id = org.organization_id AND c.name = 'Migrado dos termos'
);

INSERT INTO "tecnologia.inventory"
  (id, user_id, category_id, asset_code, notes, delivery_date, updated_at, organization_id)
SELECT gen_random_uuid()::text, cand.user_id, cat.id, cand.asset_code,
       concat_ws(' | ', 'Criado a partir do termo ' || cand.term_id,
                 nullif(btrim(cand.equipament_list), ''), nullif(btrim(cand.brand), '')),
       cand.date, now(), cand.organization_id
FROM ti_inventory_candidates cand
JOIN LATERAL (
  SELECT c.id FROM "tecnologia.inventoryCategories" c
  WHERE c.organization_id = cand.organization_id AND c.name = 'Migrado dos termos'
  ORDER BY c.id LIMIT 1
) cat ON true;

\echo '== Codigos citados em termos sem item no inventario depois do reparo (deve ser 0)'
SELECT count(*) FROM (
  SELECT DISTINCT t.organization_id, upper(btrim(code)) AS asset_code
  FROM "tecnologia.terms" t
  CROSS JOIN LATERAL regexp_split_to_table(t.asset_code, '[,;/]') AS code
  WHERE btrim(code) <> ''
) cited
WHERE NOT EXISTS (
  SELECT 1 FROM "tecnologia.inventory" i
  WHERE i.organization_id = cited.organization_id AND upper(btrim(i.asset_code)) = cited.asset_code
);

\if :apply
  COMMIT;
  \echo '== APLICADO'
\else
  ROLLBACK;
  \echo '== DRY-RUN: nada foi gravado. Rode com -v apply=1 para aplicar.'
\endif
