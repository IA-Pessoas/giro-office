-- Cria no inventario de TI os ativos citados nos termos de responsabilidade (#1380).
-- Reparo pontual, nao e migration. Leia docs/migration/backfill-ti-inventory-from-terms.md antes de rodar.
--
--   psql "$DATABASE_URL" -X -f infra/prisma/repairs/backfill-ti-inventory-from-terms.sql            -- dry-run (padrao)
--   psql "$DATABASE_URL" -X -v apply=1 -f infra/prisma/repairs/backfill-ti-inventory-from-terms.sql -- aplica
--
-- A fonte legada do inventario nao esta disponivel (decisao do dono, 24/09/2026): cada asset_code
-- citado em termo e sem item no inventario vira item na categoria "Migrado dos termos". Usuario e
-- entrega vem do termo assinado mais recente daquele codigo (ou do mais recente, sem assinado);
-- usuario ausente ou inativo deixa o item sem atribuicao. O vinculo termo-ativo e pelo
-- asset_code, sem FK (a tela usa app/src/modules/ti/utils/termAssetCodes.ts). Codigos separados
-- por virgula ou ponto e virgula viram itens separados; a comparacao ignora caixa e espacos e o
-- item guarda a grafia do termo. Idempotente.
\set ON_ERROR_STOP on
\set category '''Migrado dos termos'''
\if :{?apply}
\else
  \set apply 0
\endif

BEGIN;
SET LOCAL search_path = pg_catalog, public;
SET LOCAL lock_timeout = '5s';
\if :apply
  LOCK TABLE "tecnologia.inventory", "tecnologia.inventoryCategories" IN SHARE ROW EXCLUSIVE MODE;
\endif

-- Um registro por codigo citado em cada termo.
CREATE TEMP VIEW ti_term_codes AS
SELECT t.organization_id, t.id AS term_id, t.user_id, t.date, t.signed_at, t.reason,
       t.user_name, t.equipament_list, t.brand,
       btrim(code) AS asset_code, upper(btrim(code)) AS code_key
FROM "tecnologia.terms" t
CROSS JOIN LATERAL regexp_split_to_table(t.asset_code, '[,;]') AS code
WHERE btrim(code) <> '';

CREATE TEMP TABLE ti_inventory_candidates ON COMMIT DROP AS
WITH latest AS (
  SELECT DISTINCT ON (organization_id, code_key) *
  FROM ti_term_codes
  ORDER BY organization_id, code_key, signed_at IS NULL, date DESC, term_id
)
SELECT l.*, u.id AS assigned_user_id
FROM latest l
LEFT JOIN users u
  ON u.id = l.user_id AND u.organization_id = l.organization_id AND u.status = 'active'
WHERE NOT EXISTS (
  SELECT 1 FROM "tecnologia.inventory" i
  WHERE i.organization_id = l.organization_id AND upper(btrim(i.asset_code)) = l.code_key
);

\echo '== Ativos a criar (codigo | usuario atribuido | entrega | assinado | nome no termo | motivo | termo)'
SELECT asset_code, coalesce(assigned_user_id, '-'), to_char(date, 'YYYY-MM-DD'),
       signed_at IS NOT NULL, user_name, reason, term_id
FROM ti_inventory_candidates ORDER BY organization_id, code_key;

INSERT INTO "tecnologia.inventoryCategories" (id, name, active, organization_id)
SELECT gen_random_uuid()::text, :category, true, org.organization_id
FROM (SELECT DISTINCT organization_id FROM ti_inventory_candidates) org
WHERE NOT EXISTS (
  SELECT 1 FROM "tecnologia.inventoryCategories" c
  WHERE c.organization_id = org.organization_id AND c.name = :category
);

INSERT INTO "tecnologia.inventory"
  (id, user_id, category_id, asset_code, notes, delivery_date, updated_at, organization_id)
SELECT gen_random_uuid()::text, cand.assigned_user_id, cat.id, cand.asset_code,
       concat_ws(' | ', 'Criado a partir do termo ' || cand.term_id,
                 nullif(btrim(cand.equipament_list), ''), nullif(btrim(cand.brand), '')),
       CASE WHEN cand.assigned_user_id IS NOT NULL THEN cand.date END,
       now(), cand.organization_id
FROM ti_inventory_candidates cand
JOIN LATERAL (
  SELECT c.id FROM "tecnologia.inventoryCategories" c
  WHERE c.organization_id = cand.organization_id AND c.name = :category
  ORDER BY c.active DESC, c.id LIMIT 1
) cat ON true;

\echo '== Codigos citados em termos sem item no inventario depois do reparo (deve ser 0)'
SELECT count(*) FROM (SELECT DISTINCT organization_id, code_key FROM ti_term_codes) cited
WHERE NOT EXISTS (
  SELECT 1 FROM "tecnologia.inventory" i
  WHERE i.organization_id = cited.organization_id AND upper(btrim(i.asset_code)) = cited.code_key
);

\if :apply
  COMMIT;
  \echo '== APLICADO'
\else
  ROLLBACK;
  \echo '== DRY-RUN: nada foi gravado. Rode com -v apply=1 para aplicar.'
\endif
