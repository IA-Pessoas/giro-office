import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

import { validateMappingRule } from "../lib/mapping-contract.mjs";
import { loadPrismaCatalog } from "../lib/prisma-catalog.mjs";
import { iterateSqlRows } from "../lib/sql-dump-parser.mjs";
import {
  ADMIN_BUSINESS_RULES,
  ADMIN_BUSINESS_TRANSFORMATIONS,
  buildRuleRegistry,
  CERTIFICATE_RULES,
  PARCELAMENTO_RULES,
  RH_PESSOAL_RULES,
  TECHNOLOGY_RULES,
} from "../rules/index.mjs";

const LEGACY_DUMP_ROOT = "/home/bruno/Documents/03.08.2026";
const ORGANIZATION_ID = "e8048d1c-0830-45d7-84de-68e20abd685b";
const PERMISSION_SOURCES = [
  "tb_admin.permissoes_certificado",
  "tb_admin.permissoes_comercial",
  "tb_admin.permissoes_contabil",
  "tb_admin.permissoes_financeiro",
  "tb_admin.permissoes_fiscal",
  "tb_admin.permissoes_integracao",
  "tb_admin.permissoes_marketing",
  "tb_admin.permissoes_parcelamento",
  "tb_admin.permissoes_pessoal",
  "tb_admin.permissoes_regularize",
  "tb_admin.permissoes_rh",
  "tb_admin.permissoes_triagem",
];

function rule(sourceTable) {
  const found = ADMIN_BUSINESS_RULES.find((candidate) => candidate.sourceTable === sourceTable);
  assert.ok(found, `regra ausente: ${sourceTable}`);
  return found;
}

async function inspectDeclaredColumns(sourceTable) {
  const dump = await readFile(path.join(LEGACY_DUMP_ROOT, `${sourceTable}.sql`), "utf8");
  const createBody = dump.match(/CREATE TABLE[\s\S]*?\(([\s\S]*?)\) ENGINE=/)?.[1];
  assert.ok(createBody, `CREATE TABLE ausente: ${sourceTable}`);
  return [...createBody.matchAll(/^\s*`([^`]+)`/gm)].map((match) => match[1]);
}

test("as 20 regras administrativas/empresariais são válidas no Prisma atual e não colidem", async () => {
  const catalog = await loadPrismaCatalog("infra/prisma/schema.prisma");
  const registry = buildRuleRegistry(ADMIN_BUSINESS_RULES);

  assert.equal(ADMIN_BUSINESS_RULES.length, 20);
  assert.equal(registry.size, 36);
  for (const mappingRule of ADMIN_BUSINESS_RULES) {
    assert.equal(validateMappingRule(mappingRule, catalog), true, mappingRule.sourceTable);
    assert.equal(registry.get(mappingRule.sourceTable), mappingRule);
  }

  const cumulativeRegistry = buildRuleRegistry(
    RH_PESSOAL_RULES,
    TECHNOLOGY_RULES,
    CERTIFICATE_RULES,
    PARCELAMENTO_RULES,
    ADMIN_BUSINESS_RULES,
  );
  assert.equal(cumulativeRegistry.size, 76);
});

test("toda coluna real de origem confirmed é mapped ou not_preserved com motivo", async () => {
  for (const mappingRule of ADMIN_BUSINESS_RULES) {
    const expected = await inspectDeclaredColumns(mappingRule.sourceTable);
    const classified = new Set();
    for (const destination of mappingRule.destinations) {
      for (const column of destination.columns) {
        if (column.sourceColumn === null) continue;
        assert.ok(
          expected.includes(column.sourceColumn),
          `${mappingRule.sourceTable}.${column.sourceColumn}`,
        );
        classified.add(column.sourceColumn);
        assert.ok(["mapped", "not_preserved"].includes(column.status));
        assert.ok(column.reason.length >= 20);
        if (column.status === "not_preserved") assert.equal(column.destinationColumn, null);
      }
    }
    assert.deepEqual([...classified].sort(), expected.sort(), mappingRule.sourceTable);
  }
});

test("permissões fixas fazem merge pelo vínculo explícito User/Organization e normalizam -1..2 para 0..3", async () => {
  assert.deepEqual(
    [-1, 0, 1, 2].map(ADMIN_BUSINESS_TRANSFORMATIONS.normalize_legacy_permission_level_plus_one),
    [0, 1, 2, 3],
  );
  for (const invalid of [-2, 3, 1.5, "admin", null]) {
    assert.equal(
      ADMIN_BUSINESS_TRANSFORMATIONS.normalize_legacy_permission_level_plus_one(invalid),
      null,
    );
  }

  for (const sourceTable of PERMISSION_SOURCES) {
    const mappingRule = rule(sourceTable);
    const destination = mappingRule.destinations[0];
    assert.equal(destination.destinationTable, "permissions");
    assert.equal(destination.mode, "merge");
    assert.deepEqual(destination.identity, {
      kind: "resolve",
      sourceTable: "tb_admin.usuarios",
      sourceColumn: "user_id",
      targetLegacyColumn: "id",
    });
    assert.equal(destination.constants.organization_id, ORGANIZATION_ID);
    assert.equal(destination.precedence[0], "explicit_legacy_link");
    assert.match(destination.precedence.join(" "), /user_organization.*unique/i);
    assert.ok(destination.precedence.includes("lowest_legacy_id_owner"));
    assert.equal(
      destination.columns.find(({ sourceColumn }) => sourceColumn === "permissao").transformation,
      "normalize_legacy_permission_level_plus_one",
    );

    const prepared = mappingRule.emitRows({ id: 99, user_id: 7, permissao: 2 }, {});
    assert.equal(prepared[0].status, "prepared", sourceTable);
    assert.equal(prepared[0].identityRef, `permissions:tb_admin.usuarios:7:${ORGANIZATION_ID}`);
    assert.doesNotMatch(JSON.stringify(prepared), /permissao|SENTINEL/);
    assert.equal(
      mappingRule.emitRows({ id: 99, user_id: 7, permissao: 3 }, {})[0].reasonCode,
      "PERMISSION_LEVEL_INVALID",
    );
    assert.equal(
      mappingRule.emitRows({ id: 99, user_id: "", permissao: 1 }, {})[0].reasonCode,
      "PERMISSION_USER_LINK_INVALID",
    );
  }

  const certificateRule = rule("tb_admin.permissoes_certificado");
  assert.equal(
    certificateRule.emitRows(
      { id: 99, user_id: 7, permissao: 2 },
      { permissionUserModuleResolution: "duplicate" },
    )[0].reasonCode,
    "PERMISSION_MODULE_DUPLICATE",
  );
  assert.equal(
    certificateRule.emitRows(
      { id: 99, user_id: 7, permissao: 2 },
      { permissionUserModuleResolution: "conflict" },
    )[0].reasonCode,
    "PERMISSION_MODULE_LEVEL_CONFLICT",
  );

  const schema = await readFile("infra/prisma/schema.prisma", "utf8");
  assert.match(schema, /@@unique\(\[user_id, organization_id\].*uq_permissions_user_org/);
  const normalization = await readFile(
    "infra/prisma/migrations/20260727160000_normalize_permission_levels/migration.sql",
    "utf8",
  );
  assert.match(normalization, /"certificado" = CASE[\s\S]*?"certificado" \+ 1/);
  assert.match(normalization, /CHECK \(%I BETWEEN 0 AND 3\)/);
  assert.match(normalization, /DROP COLUMN IF EXISTS "atendimento"[\s\S]*?"pec"[\s\S]*?"wiki"/);
});

test("duplicatas naturais reais respeitam as identidades únicas/lógicas atuais", async () => {
  const permissionByUser = new Map();
  for await (const row of iterateSqlRows(
    path.join(LEGACY_DUMP_ROOT, "tb_admin.permissoes_certificado.sql"),
  )) {
    const levels = permissionByUser.get(row.user_id) ?? [];
    levels.push(row.permissao);
    permissionByUser.set(row.user_id, levels);
  }
  assert.ok([...permissionByUser.values()].some((levels) => new Set(levels).size > 1));

  assert.equal(
    await countDuplicateKeys("tb_fiscal.icms", [
      "estado",
      "item",
      "cest",
      "descricao",
      "acordo",
      "mva_original_aplicada",
      "mva_ajustado",
      "mva_original",
    ]),
    4,
  );
  const icmsRule = rule("tb_fiscal.icms");
  assert.ok(icmsRule.destinations[0].precedence.includes("lowest_legacy_id_owner"));
  const icmsRow = { id: 7, estado: "BA", descricao: "Regra fiscal" };
  assert.equal(
    icmsRule.emitRows(icmsRow, { icmsNaturalKeyResolution: "owner" })[0].status,
    "prepared",
  );
  assert.equal(
    icmsRule.emitRows(icmsRow, { icmsNaturalKeyResolution: "duplicate" })[0].reasonCode,
    "ICMS_NATURAL_DUPLICATE",
  );

  assert.equal(await countDuplicateKeys("tb_contabil.clientes_mov", ["cliente_id"]), 0);
  assert.equal(await countDuplicateKeys("tb_contabil.relacoes", ["cliente_id"]), 0);
  assert.equal(await countDuplicateKeys("tb_contabil.controle", ["cliente_id", "competencia"]), 0);
});

test("permissão dinâmica e módulos aposentados não ganham regra por inferência nominal", async () => {
  const registry = buildRuleRegistry(ADMIN_BUSINESS_RULES);
  for (const sourceTable of [
    "tb_admin.permissoes",
    "tb_admin.permissoes_atendimento",
    "tb_admin.permissoes_pec",
    "tb_admin.permissoes_wiki",
  ]) {
    assert.equal(registry.has(sourceTable), false, sourceTable);
  }

  const dynamicPairs = new Set();
  for await (const row of iterateSqlRows(path.join(LEGACY_DUMP_ROOT, "tb_admin.permissoes.sql"))) {
    dynamicPairs.add(`${row.modulo}:${row.referencia}`);
  }
  assert.ok(dynamicPairs.has("integracao:0"));
  assert.ok(dynamicPairs.has("fiscal:0"));
  assert.ok(dynamicPairs.has("workspace:0"));
});

test("logs preservam o evento auditável, mas não comprimem local em changes", () => {
  const destination = rule("tb_admin.logs").destinations[0];
  assert.equal(destination.destinationTable, "logs");
  assert.equal(destination.constants.organization_id, ORGANIZATION_ID);
  assert.equal(destination.defaults.changes, "{}");
  assert.deepEqual(
    destination.columns
      .filter(({ status }) => status === "mapped")
      .map(({ sourceColumn, destinationColumn }) => [sourceColumn, destinationColumn]),
    [
      ["id", "id"],
      ["tipo", "action"],
      ["referente", "referring"],
      ["referente_id", "referring_id"],
      ["usuario_id", "user_id"],
      ["data", "date"],
    ],
  );
  const local = destination.columns.find(({ sourceColumn }) => sourceColumn === "local");
  assert.equal(local.status, "not_preserved");
  assert.equal(local.destinationColumn, null);
});

test("histórico contábil preserva texto integral e não o mistura com departamento", () => {
  const destination = rule("tb_contabil.clientes_observacao").destinations[0];
  assert.equal(destination.destinationTable, "clients.history");
  assert.equal(
    destination.columns.find(({ sourceColumn }) => sourceColumn === "observacao").destinationColumn,
    "history",
  );
  const department = destination.columns.find(
    ({ sourceColumn }) => sourceColumn === "departamento_id",
  );
  assert.equal(department.status, "not_preserved");
  assert.doesNotMatch(department.reason, /concaten|history/i);
});

test("controle contábil preserva a semântica comprovada dos 17 checks", () => {
  const destination = rule("tb_contabil.controle").destinations[0];
  const pairs = Object.fromEntries(
    destination.columns
      .filter(({ status }) => status === "mapped")
      .map(({ sourceColumn, destinationColumn }) => [sourceColumn, destinationColumn]),
  );
  assert.equal(pairs.pagamento, "integrate_payroll");
  assert.equal(pairs.inss, "suspense_accounts");
  assert.equal(pairs.contas_estouradas, "check_overdrawn_accounts");
  assert.equal(pairs.apuracao, "monthly_closing");
  assert.equal(pairs.obs, "notes");
});

test("contratos, grupos, nuvens e documentos não são consolidados sem identidade/unique/contrato fiel", async () => {
  const registry = buildRuleRegistry(ADMIN_BUSINESS_RULES);
  for (const sourceTable of [
    "tb_atendimento.uber_clientes",
    "tb_financeiro.contratos",
    "tb_contabil.nuvens",
    "tb_fiscal.clientes_atacadistas",
    "tb_contabil.documentos",
    "tb_fiscal.documentos",
  ]) {
    assert.equal(registry.has(sourceTable), false, sourceTable);
  }

  const schema = await readFile("infra/prisma/schema.prisma", "utf8");
  const groupModel = schema.match(/model Group \{([\s\S]*?)\n\}/)?.[1] ?? "";
  const clientsGroupModel = schema.match(/model ClientsGroup \{([\s\S]*?)\n\}/)?.[1] ?? "";
  const clientModel = schema.match(/model Client \{([\s\S]*?)\n\}/)?.[1] ?? "";
  assert.doesNotMatch(groupModel, /@@unique/);
  assert.doesNotMatch(clientsGroupModel, /@@unique/);
  assert.doesNotMatch(clientModel.match(/^\s*cpf_cnpj.*$/m)?.[0] ?? "", /@unique/);
  assert.equal(await countDuplicateKeys("tb_financeiro.contratos", ["cpf_cnpj"]), 3);
});

test("IDs são determinísticos, Castelo é constante e quarentenas não expõem valores", () => {
  for (const mappingRule of ADMIN_BUSINESS_RULES) {
    for (const destination of mappingRule.destinations) {
      assert.equal(destination.constants.organization_id, ORGANIZATION_ID, mappingRule.sourceTable);
      if (destination.identity.kind === "generate") {
        assert.equal(destination.identity.namespace, "3f68d246-0b54-4a10-9415-a8845a767fb5");
        const first = mappingRule.emitRows({ id: 15 }, {});
        const second = mappingRule.emitRows({ id: 15 }, {});
        assert.equal(first[0].identityRef, second[0].identityRef, mappingRule.sourceTable);
      }
    }
  }

  const row = {
    id: "SENTINEL_PERSONAL_VALUE",
    cliente_id: "SENTINEL_SECRET_VALUE",
    observacao: "SENTINEL_FREE_TEXT",
  };
  for (const sourceTable of [
    "tb_contabil.clientes_mov",
    "tb_contabil.clientes_observacao",
    "tb_contabil.controle",
  ]) {
    const emissions = rule(sourceTable).emitRows(row, {});
    assert.equal(emissions[0].status, "quarantine");
    assert.doesNotMatch(JSON.stringify(emissions), /SENTINEL/);
  }
});

async function countDuplicateKeys(sourceTable, columns) {
  const seen = new Set();
  let duplicateCount = 0;
  for await (const row of iterateSqlRows(path.join(LEGACY_DUMP_ROOT, `${sourceTable}.sql`))) {
    const key = JSON.stringify(columns.map((column) => row[column]));
    if (seen.has(key)) duplicateCount += 1;
    else seen.add(key);
  }
  return duplicateCount;
}
