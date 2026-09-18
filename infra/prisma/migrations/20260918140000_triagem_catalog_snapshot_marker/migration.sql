ALTER TABLE "triagem.competences"
  ADD COLUMN "catalog_snapshot_initialized_at" TIMESTAMP(3);

-- O backfill atravessa organizações e roda dentro da transação da migration.
-- Desabilitar RLS durante este trecho evita depender de app.organization_id;
-- as tabelas retornam ao estado FORCE RLS antes da migration terminar.
ALTER TABLE "triagem.competences" DISABLE ROW LEVEL SECURITY;
ALTER TABLE "triagem.catalog_items" DISABLE ROW LEVEL SECURITY;
ALTER TABLE "triagem.competence_catalog_snapshots" DISABLE ROW LEVEL SECURITY;

WITH legacy_values AS (
  SELECT organization_id, 'LINK_TYPE'::text AS kind, NULLIF(BTRIM(type), '') AS code
  FROM "triagem.external_links"
  UNION
  SELECT organization_id, 'JUSTIFICATION'::text, NULLIF(BTRIM(justification), '')
  FROM "triagem.monthly"
  UNION
  SELECT monthly.organization_id, 'JUSTIFICATION'::text,
    NULLIF(BTRIM(notes.value ->> 'justification'), '')
  FROM "triagem.monthly" AS monthly
  CROSS JOIN LATERAL jsonb_each(
    CASE WHEN jsonb_typeof(monthly.item_notes::jsonb) = 'object'
      THEN monthly.item_notes::jsonb ELSE '{}'::jsonb END
  ) AS notes
  UNION
  SELECT monthly.organization_id, 'DELIVERY_METHOD'::text,
    NULLIF(BTRIM(notes.value ->> 'delivery_method'), '')
  FROM "triagem.monthly" AS monthly
  CROSS JOIN LATERAL jsonb_each(
    CASE WHEN jsonb_typeof(monthly.item_notes::jsonb) = 'object'
      THEN monthly.item_notes::jsonb ELSE '{}'::jsonb END
  ) AS notes
  UNION
  SELECT monthly.organization_id, 'STATE_SITE'::text,
    NULLIF(BTRIM(notes.value ->> 'state_site'), '')
  FROM "triagem.monthly" AS monthly
  CROSS JOIN LATERAL jsonb_each(
    CASE WHEN jsonb_typeof(monthly.item_notes::jsonb) = 'object'
      THEN monthly.item_notes::jsonb ELSE '{}'::jsonb END
  ) AS notes
  UNION
  SELECT competence.organization_id, 'DELIVERY_METHOD'::text,
    NULLIF(BTRIM(item.value ->> 'delivery_method'), '')
  FROM "triagem.competences" AS competence
  CROSS JOIN LATERAL jsonb_array_elements(
    CASE WHEN jsonb_typeof(competence.configuration_snapshot::jsonb -> 'configs') = 'array'
      THEN competence.configuration_snapshot::jsonb -> 'configs' ELSE '[]'::jsonb END
  ) AS config
  CROSS JOIN LATERAL jsonb_array_elements(
    CASE WHEN jsonb_typeof(config.value -> 'active_items') = 'array'
      THEN config.value -> 'active_items' ELSE '[]'::jsonb END
  ) AS item
  UNION
  SELECT competence.organization_id, 'STATE_SITE'::text,
    NULLIF(BTRIM(item.value ->> 'state_site'), '')
  FROM "triagem.competences" AS competence
  CROSS JOIN LATERAL jsonb_array_elements(
    CASE WHEN jsonb_typeof(competence.configuration_snapshot::jsonb -> 'configs') = 'array'
      THEN competence.configuration_snapshot::jsonb -> 'configs' ELSE '[]'::jsonb END
  ) AS config
  CROSS JOIN LATERAL jsonb_array_elements(
    CASE WHEN jsonb_typeof(config.value -> 'active_items') = 'array'
      THEN config.value -> 'active_items' ELSE '[]'::jsonb END
  ) AS item
)
INSERT INTO "triagem.catalog_items" (
  id, organization_id, kind, code, label, url, archived_at, created_at, updated_at
)
SELECT gen_random_uuid()::text, organization_id, kind, code, code, NULL, NULL,
  CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM legacy_values
WHERE code IS NOT NULL
ON CONFLICT (organization_id, kind, code) DO NOTHING;

INSERT INTO "triagem.competence_catalog_snapshots" (
  id, organization_id, competence_id, catalog_item_id, kind, code, label, url, created_at
)
SELECT gen_random_uuid()::text, competence.organization_id, competence.id, item.id,
  item.kind, item.code, item.label, item.url, CURRENT_TIMESTAMP
FROM "triagem.competences" AS competence
JOIN "triagem.catalog_items" AS item
  ON item.organization_id = competence.organization_id
 AND item.archived_at IS NULL
ON CONFLICT (organization_id, competence_id, catalog_item_id) DO NOTHING;

UPDATE "triagem.competences"
SET catalog_snapshot_initialized_at = CURRENT_TIMESTAMP
WHERE catalog_snapshot_initialized_at IS NULL;

ALTER TABLE "triagem.competences" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "triagem.competences" FORCE ROW LEVEL SECURITY;
ALTER TABLE "triagem.catalog_items" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "triagem.catalog_items" FORCE ROW LEVEL SECURITY;
ALTER TABLE "triagem.competence_catalog_snapshots" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "triagem.competence_catalog_snapshots" FORCE ROW LEVEL SECURITY;
