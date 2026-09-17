import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const schemaUrl = new URL("../../schema.prisma", import.meta.url);
const migrationUrl = new URL(
  "../../migrations/20260916150000_regularize_guidance_checklist/migration.sql",
  import.meta.url,
);

const checklistItems = [
  ["type", "Tipo de orientação"],
  ["request", "Solicitação"],
  ["framework_obs", "Observações de enquadramento"],
  ["legal_nature", "Natureza jurídica"],
  ["company_name", "Razão social"],
  ["trade_name", "Nome fantasia"],
  ["cpf_cnpj", "CPF/CNPJ"],
  ["share_capital", "Capital social"],
  ["iptu", "IPTU"],
  ["address", "Endereço"],
  ["comporate_purpose", "Objeto social"],
  ["carryng", "Porte"],
  ["regime", "Regime tributário"],
  ["legal_representative", "Representante legal"],
  ["economic_activities", "Atividades econômicas"],
  ["partners", "Sócios"],
  ["branch", "Filial"],
];

test("schema preserva a orientação legada e adiciona o checklist por alvo", async () => {
  const schema = await readFile(schemaUrl, "utf8");

  assert.match(schema, /model ProceduralGuidance \{[\s\S]*?process_id\s+String\?/);
  assert.match(schema, /model ProceduralGuidance \{[\s\S]*?target_type\s+String/);
  assert.match(schema, /model ProceduralGuidance \{[\s\S]*?client_pj_id\s+String\?/);
  assert.match(schema, /model ProceduralGuidance \{[\s\S]*?client_pf_id\s+String\?/);
  assert.match(schema, /model ProceduralGuidance \{[\s\S]*?target_snapshot\s+Json/);
  assert.match(schema, /model ProceduralGuidance \{[\s\S]*?branch_data\s+Json\?/);
  assert.match(schema, /model ProceduralGuidance \{[\s\S]*?checklist_items\s+ProceduralGuidanceChecklistItem\[\]/);
  assert.match(
    schema,
    /clientPJ\s+Client\?\s+@relation\("proceduralGuidanceClientPJ", fields: \[client_pj_id\], references: \[id\]\)/,
  );
  assert.match(
    schema,
    /clientPF\s+ClientPF\?\s+@relation\("proceduralGuidanceClientPF", fields: \[client_pf_id\], references: \[id\]\)/,
  );
  assert.match(schema, /process\s+Process\?\s+@relation\(fields: \[process_id\], references: \[id\]\)/);
  assert.match(schema, /model Client \{[\s\S]*?proceduralGuidances\s+ProceduralGuidance\[\]\s+@relation\("proceduralGuidanceClientPJ"\)/);
  assert.match(schema, /model ClientPF \{[\s\S]*?proceduralGuidances\s+ProceduralGuidance\[\]\s+@relation\("proceduralGuidanceClientPF"\)/);
  assert.match(
    schema,
    /model ProceduralGuidanceChecklistItem \{[\s\S]*?guidance\s+ProceduralGuidance\s+@relation\(fields: \[guidance_id\], references: \[id\], onDelete: Cascade\)[\s\S]*?@@unique\(\[guidance_id, code\]\)[\s\S]*?@@map\("regularize\.proceduralGuidanceChecklistItems"\)/,
  );
});

test("migration cria checklist canônico, preserva histórico e protege orientação ativa por processo", async () => {
  const migration = await readFile(migrationUrl, "utf8");
  const values = migration.match(/CROSS JOIN \(VALUES\s*([\s\S]*?)\) AS checklist\(code, label\)/);

  assert.ok(values, "a migration deve inserir o conjunto canônico por CROSS JOIN");
  const actualItems = Array.from(values[1].matchAll(/\('([^']+)',\s*'([^']+)'\)/g), ([, code, label]) => [
    code,
    label,
  ]);
  assert.deepEqual(actualItems, checklistItems);
  assert.match(migration, /'Pendente'/);
  assert.match(migration, /ON CONFLICT DO NOTHING/);
  assert.match(migration, /jsonb_build_object\('version', 1,/);
  assert.match(
    migration,
    /UPDATE "regularize\.proceduralGuidances" AS guidance\s+SET "target_type" = CASE[\s\S]*?THEN 'SEM_CLIENTE'[\s\S]*?THEN 'PJ'[\s\S]*?THEN 'PF'[\s\S]*?ELSE 'SEM_CLIENTE'\s+END\s+FROM "regularize\.process" AS process\s+WHERE guidance\."process_id" = process\."id"\s+AND guidance\."organization_id" = process\."organization_id";/,
  );
  assert.match(
    migration,
    /WHEN EXISTS \(\s*SELECT 1\s+FROM "clients" AS process_client_pj[\s\S]*?process_client_pj\."organization_id" = process\."organization_id"[\s\S]*?\)\s+AND EXISTS \(\s*SELECT 1\s+FROM "clients\.pf" AS process_client_pf[\s\S]*?process_client_pf\."organization_id" = process\."organization_id"[\s\S]*?\)\s+THEN 'SEM_CLIENTE'/,
  );
  assert.match(
    migration,
    /SET\s+"client_pj_id" = CASE\s+WHEN guidance\."target_type" = 'PJ' THEN client_pj\."id"\s+ELSE NULL\s+END,\s+"client_pf_id" = CASE\s+WHEN guidance\."target_type" = 'PF' THEN client_pf\."id"\s+ELSE NULL\s+END[\s\S]*?LEFT JOIN "clients" AS client_pj[\s\S]*?client_pj\."organization_id" = process\."organization_id"[\s\S]*?LEFT JOIN "clients\.pf" AS client_pf[\s\S]*?client_pf\."organization_id" = process\."organization_id"[\s\S]*?WHERE guidance\."process_id" = process\."id"\s+AND guidance\."organization_id" = process\."organization_id";/,
  );
  assert.match(migration, /RAISE EXCEPTION 'Cannot create procedural_guidance_active_process_unique/);
  assert.match(
    migration,
    /CREATE UNIQUE INDEX "procedural_guidance_active_process_unique"[\s\S]*?ON "regularize\.proceduralGuidances" \("organization_id", "process_id"\)[\s\S]*?WHERE "process_id" IS NOT NULL AND "status" = 'Em andamento'/,
  );
  assert.doesNotMatch(migration, /\bDELETE FROM\b|\bDROP TABLE\b/i);
});
