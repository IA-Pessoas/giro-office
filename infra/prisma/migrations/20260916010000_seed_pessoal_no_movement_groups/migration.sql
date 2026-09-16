INSERT INTO "pessoal.group" (
  "id",
  "name",
  "normalized_name",
  "policy",
  "system_key",
  "organization_id"
)
SELECT
  gen_random_uuid()::text,
  'Sem Movimento',
  'sem movimento',
  'NO_OBLIGATIONS',
  'NO_MOVEMENT',
  organization."id"
FROM "organizations" AS organization
ON CONFLICT ("organization_id", "system_key") DO NOTHING;
