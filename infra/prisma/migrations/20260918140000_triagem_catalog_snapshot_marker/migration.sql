ALTER TABLE "triagem.competences"
  ADD COLUMN "catalog_snapshot_initialized_at" TIMESTAMP(3);

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
