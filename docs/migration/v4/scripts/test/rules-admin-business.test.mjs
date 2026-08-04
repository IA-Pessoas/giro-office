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
  buildIcmsResolutionContexts,
  buildPermissionResolutionContexts,
  buildRuleRegistry,
  CERTIFICATE_RULES,
  createLegacyReferenceResolver,
  createV2ClientIdentityResolver,
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

async function loadRows(sourceTable) {
  const rows = [];
  for await (const row of iterateSqlRows(path.join(LEGACY_DUMP_ROOT, `${sourceTable}.sql`))) {
    rows.push(row);
  }
  return rows;
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
    [-1, "-1", 0, "0", 1, "1", 2, "2"].map(
      ADMIN_BUSINESS_TRANSFORMATIONS.normalize_legacy_permission_level_plus_one,
    ),
    [0, 0, 1, 1, 2, 2, 3, 3],
  );
  for (const invalid of [
    -2,
    3,
    1.5,
    "-2",
    "3",
    "1.5",
    " 1",
    "1 ",
    "+1",
    "01",
    "1e0",
    "admin",
    "",
    null,
  ]) {
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

    const notExecuted = mappingRule.emitRows({ id: "99", user_id: "7", permissao: "2" }, {});
    assert.equal(notExecuted[0].status, "quarantine", sourceTable);
    assert.equal(notExecuted[0].reasonCode, "PERMISSION_USER_LOOKUP_NOT_EXECUTED", sourceTable);
    assert.equal(
      mappingRule.emitRows(
        { id: "99", user_id: "7", permissao: "3" },
        {
          userResolution: "one",
          userIdentityRef: "tb_admin.usuarios:7",
          permissionUserModuleResolution: "owner",
        },
      )[0].reasonCode,
      "PERMISSION_LEVEL_INVALID",
    );
    assert.equal(
      mappingRule.emitRows(
        { id: "99", user_id: "", permissao: "1" },
        {
          userResolution: "zero",
          permissionUserModuleResolution: "owner",
        },
      )[0].reasonCode,
      "PERMISSION_USER_LINK_INVALID",
    );
  }

  const users = await loadRows("tb_admin.usuarios");
  const userResolver = createLegacyReferenceResolver({
    sourceTable: "tb_admin.usuarios",
    legacyColumn: "id",
    rows: users,
  });
  const statusCounts = new Map();
  const reasonCounts = new Map();
  const normalizedLevelCounts = new Map();
  let rowCount = 0;

  for (const sourceTable of PERMISSION_SOURCES) {
    const rows = await loadRows(sourceTable);
    const contexts = buildPermissionResolutionContexts({ sourceTable, rows, userResolver });
    assert.equal(contexts.length, rows.length, sourceTable);
    for (const [index, row] of rows.entries()) {
      assert.equal(contexts[index].userLookupSourceTable, "tb_admin.usuarios", sourceTable);
      assert.equal(contexts[index].userLookupSourceKey, row.user_id, sourceTable);
      assert.match(contexts[index].userResolutionFingerprint, /^[a-f0-9]{64}$/);
      assert.equal(contexts[index].permissionSourceTable, sourceTable);
      assert.equal(contexts[index].permissionSourceRowId, row.id, sourceTable);
      assert.match(contexts[index].permissionNaturalKeyFingerprint, /^[a-f0-9]{64}$/);
      assert.match(contexts[index].permissionRowFingerprint, /^[a-f0-9]{64}$/);
      assert.match(contexts[index].permissionDedupSignature, /^[a-f0-9]{64}$/);
      rowCount += 1;
      const normalized = ADMIN_BUSINESS_TRANSFORMATIONS.normalize_legacy_permission_level_plus_one(
        row.permissao,
      );
      assert.notEqual(normalized, null, `${sourceTable}.${row.id}`);
      normalizedLevelCounts.set(normalized, (normalizedLevelCounts.get(normalized) ?? 0) + 1);
      const emission = rule(sourceTable).emitRows(row, contexts[index])[0];
      statusCounts.set(emission.status, (statusCounts.get(emission.status) ?? 0) + 1);
      if (emission.reasonCode !== null) {
        reasonCounts.set(emission.reasonCode, (reasonCounts.get(emission.reasonCode) ?? 0) + 1);
      }
      assert.match(emission.identityRef, /^[A-Za-z0-9_.:-]+$/);
      assert.doesNotMatch(JSON.stringify(emission), /SENTINEL/);
    }
  }

  assert.equal(rowCount, 1175);
  assert.deepEqual(Object.fromEntries(normalizedLevelCounts), { 0: 10, 1: 817, 2: 79, 3: 269 });
  assert.deepEqual(Object.fromEntries(statusCounts), {
    prepared: 1167,
    quarantine: 7,
    not_emitted: 1,
  });
  assert.equal(reasonCounts.get("PERMISSION_USER_NOT_FOUND"), 4);
  assert.equal(reasonCounts.get("PERMISSION_MODULE_LEVEL_CONFLICT"), 3);
  assert.equal(reasonCounts.get("PERMISSION_MODULE_DUPLICATE"), 1);

  const actualOwner = (await loadRows("tb_admin.permissoes_comercial"))[0];
  const actualOwnerUser = userResolver.resolve(actualOwner.user_id);
  const missingDedup = rule("tb_admin.permissoes_comercial").emitRows(actualOwner, {
    userResolution: actualOwnerUser.state,
    userIdentityRef: actualOwnerUser.identityRef,
    userResolutionFingerprint: actualOwnerUser.fingerprint,
    userLookupSourceTable: actualOwnerUser.sourceTable,
    userLookupSourceKey: actualOwnerUser.sourceKey,
  })[0];
  assert.equal(missingDedup.status, "quarantine");
  assert.equal(missingDedup.reasonCode, "PERMISSION_DEDUP_NOT_EXECUTED");
  const unknownDedup = rule("tb_admin.permissoes_comercial").emitRows(actualOwner, {
    userResolution: actualOwnerUser.state,
    userIdentityRef: actualOwnerUser.identityRef,
    userResolutionFingerprint: actualOwnerUser.fingerprint,
    userLookupSourceTable: actualOwnerUser.sourceTable,
    userLookupSourceKey: actualOwnerUser.sourceKey,
    permissionUserModuleResolution: "unknown",
  })[0];
  assert.equal(unknownDedup.status, "quarantine");
  assert.equal(unknownDedup.reasonCode, "PERMISSION_DEDUP_STATE_INVALID");
  const matchingUser = users.find(({ id }) => id === actualOwner.user_id);
  assert.ok(matchingUser);
  const ambiguousUser = createLegacyReferenceResolver({
    sourceTable: "tb_admin.usuarios",
    legacyColumn: "id",
    rows: [...users, matchingUser],
  }).resolve(actualOwner.user_id);
  assert.equal(ambiguousUser.state, "many");
  assert.equal(
    rule("tb_admin.permissoes_comercial").emitRows(actualOwner, {
      userResolution: ambiguousUser.state,
      userIdentityRef: ambiguousUser.identityRef,
      userResolutionFingerprint: ambiguousUser.fingerprint,
      userLookupSourceTable: ambiguousUser.sourceTable,
      userLookupSourceKey: ambiguousUser.sourceKey,
      permissionUserModuleResolution: "owner",
    })[0].reasonCode,
    "PERMISSION_USER_AMBIGUOUS",
  );
  assert.equal(
    rule("tb_admin.permissoes_comercial").emitRows(actualOwner, {
      userResolution: "one",
      userIdentityRef: `tb_admin.usuarios:${actualOwner.user_id}:unsafe`,
      userLookupSourceTable: "tb_admin.usuarios",
      userLookupSourceKey: actualOwner.user_id,
      permissionUserModuleResolution: "owner",
    })[0].reasonCode,
    "PERMISSION_USER_IDENTITY_INVALID",
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
  const rows = await loadRows("tb_fiscal.icms");
  const contexts = buildIcmsResolutionContexts(rows);
  assert.equal(contexts.length, 368);
  const icmsRule = rule("tb_fiscal.icms");
  assert.ok(icmsRule.destinations[0].precedence.includes("lowest_legacy_id_owner"));
  const statusCounts = new Map();
  const reasonCounts = new Map();
  for (const [index, row] of rows.entries()) {
    assert.equal(contexts[index].icmsSourceTable, "tb_fiscal.icms");
    assert.equal(contexts[index].icmsSourceRowId, row.id);
    assert.match(contexts[index].icmsNaturalKeyFingerprint, /^[a-f0-9]{64}$/);
    assert.match(contexts[index].icmsRowFingerprint, /^[a-f0-9]{64}$/);
    assert.match(contexts[index].icmsDedupSignature, /^[a-f0-9]{64}$/);
    const emission = icmsRule.emitRows(row, contexts[index])[0];
    statusCounts.set(emission.status, (statusCounts.get(emission.status) ?? 0) + 1);
    if (emission.reasonCode !== null) {
      reasonCounts.set(emission.reasonCode, (reasonCounts.get(emission.reasonCode) ?? 0) + 1);
    }
  }
  assert.deepEqual(Object.fromEntries(statusCounts), {
    prepared: 361,
    not_emitted: 3,
    quarantine: 4,
  });
  assert.equal(reasonCounts.get("ICMS_NATURAL_DUPLICATE"), 3);
  assert.equal(reasonCounts.get("ICMS_NATURAL_KEY_CONFLICT"), 4);

  const actualOwner = rows[0];
  const missingResolution = icmsRule.emitRows(actualOwner, {})[0];
  assert.equal(missingResolution.status, "quarantine");
  assert.equal(missingResolution.reasonCode, "ICMS_DEDUP_NOT_EXECUTED");
  const unknownResolution = icmsRule.emitRows(actualOwner, {
    icmsNaturalKeyResolution: "unknown",
  })[0];
  assert.equal(unknownResolution.status, "quarantine");
  assert.equal(unknownResolution.reasonCode, "ICMS_DEDUP_STATE_INVALID");

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

test("logs exigem resolução User executada e não comprimem local em changes", async () => {
  const logsRule = rule("tb_admin.logs");
  const destination = logsRule.destinations[0];
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

  const userResolver = createLegacyReferenceResolver({
    sourceTable: "tb_admin.usuarios",
    legacyColumn: "id",
    rows: await loadRows("tb_admin.usuarios"),
  });
  let preparedCount = 0;
  let missingUserCount = 0;
  let rowCount = 0;
  let firstResolved = null;
  for await (const row of iterateSqlRows(path.join(LEGACY_DUMP_ROOT, "tb_admin.logs.sql"))) {
    rowCount += 1;
    const user = userResolver.resolve(row.usuario_id);
    assert.equal(user.sourceTable, "tb_admin.usuarios");
    assert.equal(user.sourceKey, row.usuario_id);
    assert.match(user.fingerprint, /^[a-f0-9]{64}$/);
    const emission = logsRule.emitRows(row, {
      userResolution: user.state,
      userIdentityRef: user.identityRef,
      userResolutionFingerprint: user.fingerprint,
      userLookupSourceTable: user.sourceTable,
      userLookupSourceKey: user.sourceKey,
    })[0];
    if (emission.status === "prepared") preparedCount += 1;
    if (emission.reasonCode === "LOG_USER_NOT_FOUND") missingUserCount += 1;
    if (firstResolved === null && user.state === "one") firstResolved = { row, emission };
    assert.match(emission.identityRef, /^[A-Za-z0-9_.:-]+$/);
  }
  assert.equal(rowCount, 470127);
  assert.equal(preparedCount, 470099);
  assert.equal(missingUserCount, 28);

  assert.ok(firstResolved);
  assert.equal(
    logsRule.emitRows(firstResolved.row, {})[0].reasonCode,
    "LOG_USER_LOOKUP_NOT_EXECUTED",
  );
  assert.equal(
    logsRule.emitRows(firstResolved.row, {
      userResolution: "unknown",
      userIdentityRef: "tb_admin.usuarios:unknown",
    })[0].reasonCode,
    "LOG_USER_LOOKUP_STATE_INVALID",
  );
  const actualUser = (await loadRows("tb_admin.usuarios")).find(
    ({ id }) => id === firstResolved.row.usuario_id,
  );
  assert.ok(actualUser);
  const ambiguousUser = createLegacyReferenceResolver({
    sourceTable: "tb_admin.usuarios",
    legacyColumn: "id",
    rows: [...(await loadRows("tb_admin.usuarios")), actualUser],
  }).resolve(firstResolved.row.usuario_id);
  assert.equal(
    logsRule.emitRows(firstResolved.row, {
      userResolution: ambiguousUser.state,
      userIdentityRef: ambiguousUser.identityRef,
      userResolutionFingerprint: ambiguousUser.fingerprint,
      userLookupSourceTable: ambiguousUser.sourceTable,
      userLookupSourceKey: ambiguousUser.sourceKey,
    })[0].reasonCode,
    "LOG_USER_AMBIGUOUS",
  );
  assert.equal(
    logsRule.emitRows(firstResolved.row, {
      userResolution: "one",
      userIdentityRef: `tb_admin.usuarios:${firstResolved.row.usuario_id}:unsafe`,
      userLookupSourceTable: "tb_admin.usuarios",
      userLookupSourceKey: firstResolved.row.usuario_id,
    })[0].reasonCode,
    "LOG_USER_IDENTITY_INVALID",
  );
});

test("User 7 não aceita contexto one produzido para a chave legada 8", () => {
  const emission = rule("tb_admin.logs").emitRows(
    { id: "1", usuario_id: "7", tipo: "update", referente: "cliente" },
    {
      userResolution: "one",
      userIdentityRef: "tb_admin.usuarios:8",
      userLookupSourceTable: "tb_admin.usuarios",
      userLookupSourceKey: "8",
    },
  )[0];

  assert.equal(emission.status, "quarantine");
  assert.equal(emission.reasonCode, "LOG_USER_CONTEXT_MISMATCH");
});

test("referências contábeis seguem codigo Regularize até a identidade Client produzida pela V2", async () => {
  const regularizeRows = await loadRows("tb_regularize.clientes");
  const integrationRows = await loadRows("tb_integracao.clientes");
  const clientResolver = createV2ClientIdentityResolver({ regularizeRows, integrationRows });
  const userResolver = createLegacyReferenceResolver({
    sourceTable: "tb_admin.usuarios",
    legacyColumn: "id",
    rows: await loadRows("tb_admin.usuarios"),
  });
  const sources = [
    "tb_contabil.clientes_mov",
    "tb_contabil.clientes_observacao",
    "tb_contabil.controle",
    "tb_contabil.relacoes",
  ];
  const sourceResolutionCounts = new Map();
  const statusCounts = new Map();
  const reasonCounts = new Map();
  let rowCount = 0;
  const validExamples = new Map();
  let unavailableExample = null;

  for (const sourceTable of sources) {
    for (const row of await loadRows(sourceTable)) {
      rowCount += 1;
      const client = clientResolver.resolve(row.cliente_id);
      assert.equal(client.sourceTable, "tb_regularize.clientes");
      assert.equal(client.sourceKey, row.cliente_id);
      assert.match(client.fingerprint, /^[a-f0-9]{64}$/);
      sourceResolutionCounts.set(
        client.sourceState,
        (sourceResolutionCounts.get(client.sourceState) ?? 0) + 1,
      );
      const context = {
        clientResolution: client.state,
        clientIdentityRef: client.identityRef,
        clientResolutionFingerprint: client.fingerprint,
        clientLookupSourceTable: client.sourceTable,
        clientLookupSourceKey: client.sourceKey,
      };
      if (sourceTable === "tb_contabil.clientes_observacao") {
        const user = userResolver.resolve(row.user_id);
        context.userResolution = user.state;
        context.userIdentityRef = user.identityRef;
        context.userResolutionFingerprint = user.fingerprint;
        context.userLookupSourceTable = user.sourceTable;
        context.userLookupSourceKey = user.sourceKey;
      }
      const emission = rule(sourceTable).emitRows(row, context)[0];
      statusCounts.set(emission.status, (statusCounts.get(emission.status) ?? 0) + 1);
      if (emission.reasonCode !== null) {
        reasonCounts.set(emission.reasonCode, (reasonCounts.get(emission.reasonCode) ?? 0) + 1);
      }
      if (client.state === "one") {
        assert.match(client.identityRef, /^(tb_integracao|tb_regularize)\.clientes:[1-9]\d*$/);
        if (!validExamples.has(sourceTable)) validExamples.set(sourceTable, { row, client });
      } else {
        unavailableExample ??= { row, sourceTable, client };
      }
    }
  }

  assert.equal(rowCount, 3274);
  assert.deepEqual(Object.fromEntries(sourceResolutionCounts), { one: 3274 });
  assert.deepEqual(Object.fromEntries(statusCounts), { prepared: 3273, quarantine: 1 });
  assert.equal(reasonCounts.get("CLIENT_REFERENCE_NOT_FOUND"), 1);
  assert.ok(unavailableExample);
  assert.equal(unavailableExample.client.sourceState, "one");
  assert.equal(unavailableExample.client.state, "zero");

  assert.equal(validExamples.size, 4);
  for (const [sourceTable, { row, client }] of validExamples) {
    const missingContext = rule(sourceTable).emitRows(row, {})[0];
    assert.equal(missingContext.status, "quarantine", sourceTable);
    assert.equal(missingContext.reasonCode, "CLIENT_LOOKUP_NOT_EXECUTED", sourceTable);
    const unknownContext = rule(sourceTable).emitRows(row, {
      clientResolution: "unknown",
      clientIdentityRef: "tb_regularize.clientes:unknown",
    })[0];
    assert.equal(unknownContext.status, "quarantine", sourceTable);
    assert.equal(unknownContext.reasonCode, "CLIENT_LOOKUP_STATE_INVALID", sourceTable);
    assert.equal(
      rule(sourceTable).emitRows(row, {
        clientResolution: "one",
        clientIdentityRef: `${client.identityRef}:unsafe`,
        clientLookupSourceTable: client.sourceTable,
        clientLookupSourceKey: client.sourceKey,
      })[0].reasonCode,
      "CLIENT_IDENTITY_INVALID",
      sourceTable,
    );
  }

  const [validSourceTable, validExample] = validExamples.entries().next().value;

  const actualRegularizeRow = regularizeRows.find(
    ({ codigo }) => codigo === validExample.row.cliente_id,
  );
  assert.ok(actualRegularizeRow);
  const zeroResolver = createV2ClientIdentityResolver({
    regularizeRows: regularizeRows.filter(({ codigo }) => codigo !== actualRegularizeRow.codigo),
    integrationRows,
  });
  const zero = zeroResolver.resolve(validExample.row.cliente_id);
  assert.equal(zero.sourceState, "zero");
  assert.equal(
    rule(validSourceTable).emitRows(validExample.row, {
      clientResolution: zero.state,
      clientIdentityRef: zero.identityRef,
      clientResolutionFingerprint: zero.fingerprint,
      clientLookupSourceTable: zero.sourceTable,
      clientLookupSourceKey: zero.sourceKey,
    })[0].reasonCode,
    "CLIENT_REFERENCE_NOT_FOUND",
  );
  const manyResolver = createV2ClientIdentityResolver({
    regularizeRows: [...regularizeRows, actualRegularizeRow],
    integrationRows,
  });
  const many = manyResolver.resolve(validExample.row.cliente_id);
  assert.equal(many.sourceState, "many");
  assert.equal(
    rule(validSourceTable).emitRows(validExample.row, {
      clientResolution: many.state,
      clientIdentityRef: many.identityRef,
      clientResolutionFingerprint: many.fingerprint,
      clientLookupSourceTable: many.sourceTable,
      clientLookupSourceKey: many.sourceKey,
    })[0].reasonCode,
    "CLIENT_REFERENCE_AMBIGUOUS",
  );
});

test("cliente contábil A não aceita contexto de resolução produzido para codigo B", async () => {
  const rows = await loadRows("tb_contabil.clientes_mov");
  const rowA = rows[0];
  const rowB = rows.find(({ cliente_id }) => cliente_id !== rowA.cliente_id);
  assert.ok(rowB);
  const resolutionB = createV2ClientIdentityResolver({
    regularizeRows: await loadRows("tb_regularize.clientes"),
    integrationRows: await loadRows("tb_integracao.clientes"),
  }).resolve(rowB.cliente_id);
  const emission = rule("tb_contabil.clientes_mov").emitRows(rowA, {
    clientResolution: resolutionB.state,
    clientIdentityRef: resolutionB.identityRef,
    clientResolutionFingerprint: resolutionB.fingerprint,
    clientLookupSourceTable: resolutionB.sourceTable,
    clientLookupSourceKey: resolutionB.sourceKey,
  })[0];

  assert.equal(emission.status, "quarantine");
  assert.equal(emission.reasonCode, "CLIENT_CONTEXT_MISMATCH");
  assert.equal(resolutionB.sourceTable, "tb_regularize.clientes");
  assert.equal(resolutionB.sourceKey, rowB.cliente_id);

  const mixedParallelContext = rule("tb_contabil.clientes_mov").emitRows(rowA, {
    clientResolution: resolutionB.state,
    clientIdentityRef: resolutionB.identityRef,
    clientLookupSourceTable: resolutionB.sourceTable,
    clientLookupSourceKey: rowA.cliente_id,
    clientResolutionFingerprint: resolutionB.fingerprint,
  })[0];
  assert.equal(mixedParallelContext.status, "quarantine");
  assert.equal(mixedParallelContext.reasonCode, "CLIENT_CONTEXT_MISMATCH");
});

test("owner, duplicate e conflict de permissão não podem ser aplicados a outra source row", async () => {
  const users = await loadRows("tb_admin.usuarios");
  const userResolver = createLegacyReferenceResolver({
    sourceTable: "tb_admin.usuarios",
    legacyColumn: "id",
    rows: users,
  });
  let identicalPair = null;
  let conflictPair = null;

  for (const sourceTable of PERMISSION_SOURCES) {
    const rows = await loadRows(sourceTable);
    const contexts = buildPermissionResolutionContexts({ sourceTable, rows, userResolver });
    const duplicateIndex = contexts.findIndex(
      ({ permissionUserModuleResolution }) => permissionUserModuleResolution === "duplicate",
    );
    if (duplicateIndex !== -1) {
      const duplicateContext = contexts[duplicateIndex];
      const ownerIndex = contexts.findIndex(
        (context) =>
          context.permissionUserModuleResolution === "owner" &&
          context.permissionNaturalKeyFingerprint ===
            duplicateContext.permissionNaturalKeyFingerprint,
      );
      if (ownerIndex !== -1) {
        identicalPair = { sourceTable, rows, contexts, ownerIndex, duplicateIndex };
      }
    }
    const conflictIndexes = contexts
      .map((context, index) => ({ context, index }))
      .filter(({ context }) => context.permissionUserModuleResolution === "conflict");
    const firstConflict = conflictIndexes.find(({ context }, index) =>
      conflictIndexes
        .slice(index + 1)
        .some(
          ({ context: other }) =>
            other.permissionNaturalKeyFingerprint === context.permissionNaturalKeyFingerprint,
        ),
    );
    if (firstConflict) {
      const secondConflict = conflictIndexes.find(
        ({ context, index }) =>
          index !== firstConflict.index &&
          context.permissionNaturalKeyFingerprint ===
            firstConflict.context.permissionNaturalKeyFingerprint,
      );
      conflictPair = {
        sourceTable,
        rows,
        contexts,
        firstIndex: firstConflict.index,
        secondIndex: secondConflict.index,
      };
    }
  }

  assert.ok(identicalPair);
  const ownerRow = identicalPair.rows[identicalPair.ownerIndex];
  const duplicateRow = identicalPair.rows[identicalPair.duplicateIndex];
  const ownerContext = identicalPair.contexts[identicalPair.ownerIndex];
  const duplicateContext = identicalPair.contexts[identicalPair.duplicateIndex];
  for (const [row, foreignDedupContext] of [
    [duplicateRow, ownerContext],
    [ownerRow, duplicateContext],
  ]) {
    const correctUser = userResolver.resolve(row.user_id);
    const emission = rule(identicalPair.sourceTable).emitRows(row, {
      ...foreignDedupContext,
      userResolution: correctUser.state,
      userIdentityRef: correctUser.identityRef,
      userResolutionFingerprint: correctUser.fingerprint,
      userLookupSourceTable: correctUser.sourceTable,
      userLookupSourceKey: correctUser.sourceKey,
    })[0];
    assert.equal(emission.status, "quarantine");
    assert.equal(emission.reasonCode, "PERMISSION_DEDUP_CONTEXT_MISMATCH");
  }

  assert.ok(conflictPair);
  const conflictRow = conflictPair.rows[conflictPair.firstIndex];
  const foreignConflictContext = conflictPair.contexts[conflictPair.secondIndex];
  const correctUser = userResolver.resolve(conflictRow.user_id);
  const conflictEmission = rule(conflictPair.sourceTable).emitRows(conflictRow, {
    ...foreignConflictContext,
    userResolution: correctUser.state,
    userIdentityRef: correctUser.identityRef,
    userResolutionFingerprint: correctUser.fingerprint,
    userLookupSourceTable: correctUser.sourceTable,
    userLookupSourceKey: correctUser.sourceKey,
  })[0];
  assert.equal(conflictEmission.status, "quarantine");
  assert.equal(conflictEmission.reasonCode, "PERMISSION_DEDUP_CONTEXT_MISMATCH");
});

test("estado owner, duplicate ou conflict de permissão não pode ser mutado sem nova assinatura", async () => {
  const userResolver = createLegacyReferenceResolver({
    sourceTable: "tb_admin.usuarios",
    legacyColumn: "id",
    rows: await loadRows("tb_admin.usuarios"),
  });
  const examples = new Map();
  for (const sourceTable of PERMISSION_SOURCES) {
    const rows = await loadRows(sourceTable);
    const contexts = buildPermissionResolutionContexts({ sourceTable, rows, userResolver });
    for (const [index, context] of contexts.entries()) {
      if (!examples.has(context.permissionUserModuleResolution)) {
        examples.set(context.permissionUserModuleResolution, {
          sourceTable,
          row: rows[index],
          context,
        });
      }
    }
  }
  assert.deepEqual([...examples.keys()].sort(), ["conflict", "duplicate", "owner"]);

  for (const [producedState, { sourceTable, row, context }] of examples) {
    for (const mutatedState of ["owner", "duplicate", "conflict"]) {
      if (mutatedState === producedState) continue;
      const emission = rule(sourceTable).emitRows(row, {
        ...context,
        permissionUserModuleResolution: mutatedState,
      })[0];
      assert.equal(emission.status, "quarantine", `${producedState}->${mutatedState}`);
      assert.equal(
        emission.reasonCode,
        "PERMISSION_DEDUP_CONTEXT_MISMATCH",
        `${producedState}->${mutatedState}`,
      );
    }
  }
});

test("contexto ICMS owner, duplicate ou conflict não pode ser trocado ou reordenado", async () => {
  const rows = await loadRows("tb_fiscal.icms");
  const contexts = buildIcmsResolutionContexts(rows);
  const duplicateIndex = contexts.findIndex(
    ({ icmsNaturalKeyResolution }) => icmsNaturalKeyResolution === "duplicate",
  );
  assert.notEqual(duplicateIndex, -1);
  const ownerIndex = contexts.findIndex(
    (context) =>
      context.icmsNaturalKeyResolution === "owner" &&
      context.icmsNaturalKeyFingerprint === contexts[duplicateIndex].icmsNaturalKeyFingerprint,
  );
  assert.notEqual(ownerIndex, -1);
  const conflictIndexes = contexts
    .map((context, index) => ({ context, index }))
    .filter(({ context }) => context.icmsNaturalKeyResolution === "conflict");
  assert.ok(conflictIndexes.length >= 2);

  for (const [rowIndex, contextIndex] of [
    [duplicateIndex, ownerIndex],
    [ownerIndex, duplicateIndex],
    [conflictIndexes[0].index, conflictIndexes[1].index],
  ]) {
    const emission = rule("tb_fiscal.icms").emitRows(rows[rowIndex], contexts[contextIndex])[0];
    assert.equal(emission.status, "quarantine");
    assert.equal(emission.reasonCode, "ICMS_DEDUP_CONTEXT_MISMATCH");
  }
});

test("estado owner, duplicate ou conflict de ICMS não pode ser mutado sem nova assinatura", async () => {
  const rows = await loadRows("tb_fiscal.icms");
  const contexts = buildIcmsResolutionContexts(rows);
  const examples = new Map();
  for (const [index, context] of contexts.entries()) {
    if (!examples.has(context.icmsNaturalKeyResolution)) {
      examples.set(context.icmsNaturalKeyResolution, { row: rows[index], context });
    }
  }
  assert.deepEqual([...examples.keys()].sort(), ["conflict", "duplicate", "owner"]);

  for (const [producedState, { row, context }] of examples) {
    for (const mutatedState of ["owner", "duplicate", "conflict"]) {
      if (mutatedState === producedState) continue;
      const emission = rule("tb_fiscal.icms").emitRows(row, {
        ...context,
        icmsNaturalKeyResolution: mutatedState,
      })[0];
      assert.equal(emission.status, "quarantine", `${producedState}->${mutatedState}`);
      assert.equal(
        emission.reasonCode,
        "ICMS_DEDUP_CONTEXT_MISMATCH",
        `${producedState}->${mutatedState}`,
      );
    }
  }
});

test("NCM/PIS/COFINS exige tributação federal e data civil exata nos 31.362 registros reais", async () => {
  const mappingRule = rule("tb_fiscal.tributacao_pis_cofins");
  const statusCounts = new Map();
  const reasonCounts = new Map();
  let rowCount = 0;
  let validRow = null;
  for await (const row of iterateSqlRows(
    path.join(LEGACY_DUMP_ROOT, "tb_fiscal.tributacao_pis_cofins.sql"),
  )) {
    rowCount += 1;
    const emission = mappingRule.emitRows(row, {})[0];
    statusCounts.set(emission.status, (statusCounts.get(emission.status) ?? 0) + 1);
    if (emission.reasonCode !== null) {
      reasonCounts.set(emission.reasonCode, (reasonCounts.get(emission.reasonCode) ?? 0) + 1);
    }
    if (emission.status === "prepared") validRow ??= row;
  }

  assert.equal(rowCount, 31362);
  assert.deepEqual(Object.fromEntries(statusCounts), { prepared: 31358, quarantine: 4 });
  assert.equal(reasonCounts.get("NCM_FEDERAL_TAXATION_EMPTY"), 3);
  assert.equal(reasonCounts.get("NCM_VALIDITY_START_DATE_INVALID"), 1);

  assert.ok(validRow);
  assert.equal(
    mappingRule.emitRows({ ...validRow, inicio_virgencia: "2024-02-29" }, {})[0].status,
    "prepared",
  );
  assert.equal(
    mappingRule.emitRows({ ...validRow, inicio_virgencia: "2023-02-29" }, {})[0].reasonCode,
    "NCM_VALIDITY_START_DATE_INVALID",
  );
  assert.equal(
    mappingRule.emitRows({ ...validRow, inicio_virgencia: " 2024-02-29" }, {})[0].reasonCode,
    "NCM_VALIDITY_START_DATE_INVALID",
  );
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
