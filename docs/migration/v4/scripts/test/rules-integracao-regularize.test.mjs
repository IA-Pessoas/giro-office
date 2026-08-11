import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

import { validateMappingRule } from "../lib/mapping-contract.mjs";
import { loadPrismaCatalog } from "../lib/prisma-catalog.mjs";
import { iterateSqlRows } from "../lib/sql-dump-parser.mjs";

const LEGACY_DUMP_ROOT = "/home/bruno/Documents/03.08.2026";
const rulesModule = await import("../rules/index.mjs").catch(() => null);

function implementation() {
  assert.ok(rulesModule, "regras Integração/Regularize ainda não implementadas");
  return rulesModule;
}

function rule(sourceTable) {
  const { INTEGRACAO_REGULARIZE_RULES, buildRuleRegistry } = implementation();
  const found = buildRuleRegistry(INTEGRACAO_REGULARIZE_RULES).get(sourceTable);
  assert.ok(found, `regra ausente: ${sourceTable}`);
  return found;
}

function resolved(sourceTable, sourceKey, overrides = {}) {
  const sourceIdentityRef = `${sourceTable}:${sourceKey}`;
  return {
    state: "one",
    sourceTable,
    sourceKey,
    sourceIdentityRef,
    identityRef: sourceIdentityRef,
    ...overrides,
  };
}

async function loadRows(sourceTable) {
  const rows = [];
  for await (const row of iterateSqlRows(path.join(LEGACY_DUMP_ROOT, `${sourceTable}.sql`))) {
    rows.push(row);
  }
  return rows;
}

function referenceContext(sourceTable, row, resolutions) {
  return implementation().buildIntegrationRegularizeReferenceContext(sourceTable, row, resolutions);
}

function countModes(entries) {
  return Object.fromEntries(
    [...Map.groupBy(entries, ({ mode }) => mode)].map(([mode, items]) => [mode, items.length]),
  );
}

test("integração/regularize cobre seu mapeamento direto completo", () => {
  const { INTEGRACAO_REGULARIZE_RULES } = implementation();

  assert.deepEqual(
    countModes(INTEGRACAO_REGULARIZE_RULES.flatMap(({ destinations }) => destinations)),
    { aggregate: 1, insert: 9, merge: 3 },
  );
});

async function inspectDeclaredColumns(sourceTable) {
  const dump = await readFile(path.join(LEGACY_DUMP_ROOT, `${sourceTable}.sql`), "utf8");
  const createBody = dump.match(/CREATE TABLE[\s\S]*?\(([\s\S]*?)\) ENGINE=/)?.[1];
  assert.ok(createBody, `CREATE TABLE ausente: ${sourceTable}`);
  return [...createBody.matchAll(/^\s*`([^`]+)`/gm)].map((match) => match[1]);
}

test("registry acumulado contém 88 regras e nenhuma origem colide", () => {
  const {
    ADMIN_BUSINESS_RULES,
    CERTIFICATE_RULES,
    INTEGRACAO_REGULARIZE_RULES,
    PARCELAMENTO_RULES,
    RH_PESSOAL_RULES,
    TECHNOLOGY_RULES,
    V2_RULES,
    buildRuleRegistry,
  } = implementation();
  const groups = [
    V2_RULES,
    RH_PESSOAL_RULES,
    TECHNOLOGY_RULES,
    CERTIFICATE_RULES,
    PARCELAMENTO_RULES,
    ADMIN_BUSINESS_RULES,
    INTEGRACAO_REGULARIZE_RULES,
  ];
  const all = groups.flat();
  const registry = buildRuleRegistry(...groups.slice(1));

  assert.equal(INTEGRACAO_REGULARIZE_RULES.length, 12);
  assert.equal(registry.size, 89);
  assert.equal(new Set(all.map(({ sourceTable }) => sourceTable)).size, 89);
  assert.equal(registry.has("tb_integracao.tarefas_distrato"), false);
});

test("todas as 12 regras são válidas contra o catálogo Prisma atual", async () => {
  const { INTEGRACAO_REGULARIZE_RULES } = implementation();
  const catalog = await loadPrismaCatalog("infra/prisma/schema.prisma");

  for (const mappingRule of INTEGRACAO_REGULARIZE_RULES) {
    assert.equal(validateMappingRule(mappingRule, catalog), true, mappingRule.sourceTable);
  }
});

test("toda coluna dos dumps confirmed termina mapped ou not_preserved com motivo", async () => {
  const { INTEGRACAO_REGULARIZE_RULES } = implementation();

  for (const mappingRule of INTEGRACAO_REGULARIZE_RULES) {
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
        assert.ok(column.reason.length >= 20, `${mappingRule.sourceTable}.${column.sourceColumn}`);
        if (column.status === "not_preserved") assert.equal(column.destinationColumn, null);
      }
    }
    assert.deepEqual([...classified].sort(), [...expected].sort(), mappingRule.sourceTable);
  }
});

test("catálogo de distrato preserva TaskModel e valida responsáveis no departamento", () => {
  const mappingRule = rule("tb_integracao.tarefas_express_distrato");
  const row = {
    id: 4,
    nome: "Documentos de saída - Dep. Contábil",
    departamento_id: 5,
    responsavel_id: 17,
    responsavel_id_dois: 0,
    responsavel_id_tres: 0,
    estado: "A Realizar",
    realizado: null,
    obs: "Checklist",
    ano: 2022,
    cobranca: 1,
  };
  const resolutions = {
    department: resolved("tb_admin.departamentos", 5),
    responsible: resolved("tb_admin.usuarios", 17, {
      relatedIdentityRef: "tb_admin.departamentos:5",
    }),
  };
  const context = referenceContext("tb_integracao.tarefas_express_distrato", row, resolutions);

  assert.equal(mappingRule.emitRows(row, context)[0].status, "prepared");
  assert.equal(mappingRule.destinations[0].destinationTable, "integracao.tasksModel");
  assert.equal(mappingRule.destinations[0].constants.type, "legacy-termination");

  const wrongDepartment = referenceContext("tb_integracao.tarefas_express_distrato", row, {
    ...resolutions,
    responsible: resolved("tb_admin.usuarios", 17, {
      relatedIdentityRef: "tb_admin.departamentos:18",
    }),
  });
  assert.equal(
    mappingRule.emitRows(row, wrongDepartment)[0].reasonCode,
    "TASK_MODEL_RESPONSIBLE_DEPARTMENT_MISMATCH",
  );
});

test("dependência resolve os dois modelos explicitamente, rejeita auto-relação e ambiguidade", () => {
  const mappingRule = rule("tb_integracao.tarefas_dependentes");
  const row = { id: 5, tarefa_express_id: 10, dependente_id: 11, obs: "aguardar", espera: 1 };
  const preparedContext = referenceContext("tb_integracao.tarefas_dependentes", row, {
    taskModel: { state: "one", sourceTable: "tb_integracao.tarefas_express", sourceKey: 10 },
    dependentModel: {
      state: "one",
      sourceTable: "tb_integracao.tarefas_express",
      sourceKey: 11,
    },
  });
  assert.equal(mappingRule.emitRows(row, preparedContext)[0].status, "prepared");

  const self = mappingRule.emitRows({ ...row, dependente_id: 10 }, preparedContext);
  assert.equal(self[0].reasonCode, "TASK_DEPENDENCY_SELF_REFERENCE");

  const ambiguousContext = referenceContext("tb_integracao.tarefas_dependentes", row, {
    taskModel: { state: "one", sourceTable: "tb_integracao.tarefas_express", sourceKey: 10 },
    dependentModel: {
      state: "many",
      sourceTable: "tb_integracao.tarefas_express",
      sourceKey: 11,
    },
  });
  assert.equal(
    mappingRule.emitRows(row, ambiguousContext)[0].reasonCode,
    "DEPENDENT_MODEL_AMBIGUOUS",
  );
});

test("atividades usam aggregate explícito no pai e não convertem catálogo por coocorrência", () => {
  const mappingRule = rule("tb_regularize.orientaoes_processual.atividades");
  const destination = mappingRule.destinations[0];

  assert.deepEqual(destination.identity, {
    kind: "aggregate",
    parentSourceTable: "tb_regularize.orientaoes_processual",
    parentLegacyColumn: "id",
    childForeignKey: "op_id",
  });
  const activity = destination.columns.find(({ sourceColumn }) => sourceColumn === "atividade");
  const childId = destination.columns.find(({ sourceColumn }) => sourceColumn === "id");
  const parentId = destination.columns.find(({ sourceColumn }) => sourceColumn === "op_id");
  assert.equal(activity.destinationColumn, "economic_activities");
  assert.equal(activity.transformation, "aggregate_normalized_economic_activities");
  assert.equal(childId.destinationColumn, "economic_activities");
  assert.equal(childId.transformation, "aggregate_activity_uuid");
  assert.equal(parentId.destinationColumn, "economic_activities");
  assert.equal(parentId.transformation, "aggregate_parent_reference");
  assert.equal(mappingRule.dependencies.includes("tb_regularize.atividades"), false);
});

test("atividade real preserva filho removível dentro da identidade agregada do pai", async () => {
  const { buildGuidanceActivityPayload, createLegacyReferenceResolver } = implementation();
  const mappingRule = rule("tb_regularize.orientaoes_processual.atividades");
  const rows = await loadRows("tb_regularize.orientaoes_processual.atividades");
  const row = rows.find(({ id }) => id === "2");
  assert.ok(row);
  const guidanceResolver = createLegacyReferenceResolver({
    sourceTable: "tb_regularize.orientaoes_processual",
    legacyColumn: "id",
    rows: await loadRows("tb_regularize.orientaoes_processual"),
  });
  const context = referenceContext("tb_regularize.orientaoes_processual.atividades", row, {
    guidance: guidanceResolver.resolve(row.op_id),
  });
  const [emission] = mappingRule.emitRows(row, context);

  assert.equal(emission.status, "prepared");
  assert.equal(emission.identityRef, "tb_regularize.orientaoes_processual:2:activity-2");
  assert.deepEqual(buildGuidanceActivityPayload(row), {
    id: "54c80027-6a41-5f14-b2eb-b7612eef85e9",
    code: "23.11-7/00",
    description: "Fabricação de vidro plano e de segurança",
    type: "Principal",
  });
  assert.deepEqual(Object.keys(buildGuidanceActivityPayload(row)).sort(), [
    "code",
    "description",
    "id",
    "type",
  ]);

  const invalid = { ...row, id: 45, atividade: "", tipo: 0 };
  const invalidContext = referenceContext(
    "tb_regularize.orientaoes_processual.atividades",
    invalid,
    { guidance: guidanceResolver.resolve(invalid.op_id) },
  );
  const [quarantined] = mappingRule.emitRows(invalid, invalidContext);
  assert.equal(quarantined.status, "quarantine");
  assert.equal(quarantined.reasonCode, "GUIDANCE_ACTIVITY_VALUE_INVALID");
  assert.equal(buildGuidanceActivityPayload(invalid), null);
});

test("grupo consome diretamente resolução Client produzida pela V2", async () => {
  const { createLegacyReferenceResolver, createV2ClientIdentityResolver } = implementation();
  const mappingRule = rule("tb_regularize.grupos_integrantes");
  const clientResolver = createV2ClientIdentityResolver({
    regularizeRows: await loadRows("tb_regularize.clientes"),
    integrationRows: await loadRows("tb_integracao.clientes"),
  });
  const groupResolver = createLegacyReferenceResolver({
    sourceTable: "tb_regularize.grupos",
    legacyColumn: "id",
    rows: await loadRows("tb_regularize.grupos"),
  });
  const row = (await loadRows("tb_regularize.grupos_integrantes")).find(
    ({ id }) => String(id) === "20",
  );
  assert.ok(row);
  assert.equal(row.codigo_cliente, "507");
  const client = clientResolver.resolve(row.codigo_cliente);
  const resolutions = {
    client,
    group: groupResolver.resolve(row.grupo_id),
  };
  const one = referenceContext("tb_regularize.grupos_integrantes", row, resolutions);
  assert.equal(mappingRule.emitRows(row, one)[0].status, "prepared");
  assert.equal(client.targetTable, undefined);
  assert.equal(client.criteria, undefined);
  assert.match(client.fingerprint, /^[a-f0-9]{64}$/);
  assert.equal(
    mappingRule.destinations[0].columns.find(
      ({ sourceColumn }) => sourceColumn === "codigo_cliente",
    ).transformation,
    "resolve_canonical_v2_client_reference",
  );

  assert.throws(
    () =>
      referenceContext("tb_regularize.grupos_integrantes", row, {
        ...resolutions,
        client: { ...client, fingerprint: "0".repeat(64) },
      }),
    /proveniência|autêntica/i,
  );

  assert.throws(
    () =>
      referenceContext("tb_regularize.grupos_integrantes", row, {
        ...resolutions,
        client: { ...client },
      }),
    /proveniência|autêntica/i,
  );
  assert.throws(
    () =>
      referenceContext("tb_regularize.grupos_integrantes", row, {
        ...resolutions,
        client: { ...client, sourceState: client.sourceState === "one" ? "zero" : "one" },
      }),
    /proveniência|autêntica/i,
  );

  const fabricated = {
    sourceState: client.sourceState,
    state: client.state,
    identityRef: client.identityRef,
    sourceTable: client.sourceTable,
    sourceKey: client.sourceKey,
    fingerprint: createHash("sha256")
      .update(
        JSON.stringify([
          "reference-resolution-v1",
          client.state,
          client.identityRef,
          client.sourceTable,
          client.sourceKey,
        ]),
      )
      .digest("hex"),
  };
  assert.throws(
    () =>
      referenceContext("tb_regularize.grupos_integrantes", row, {
        ...resolutions,
        client: fabricated,
      }),
    /proveniência|autêntica/i,
  );

  const fakeResolver = createV2ClientIdentityResolver({
    regularizeRows: [{ codigo: "507", cliente_id: "999999999" }],
    integrationRows: [{ id: "999999999" }],
  });
  const fakeClient = fakeResolver.resolve("507");
  assert.equal(fakeClient.identityRef, "tb_integracao.clientes:999999999");
  assert.throws(
    () =>
      referenceContext("tb_regularize.grupos_integrantes", row, {
        client: fakeClient,
        group: groupResolver.resolve(row.grupo_id),
      }),
    /corpus autoritativo|proveniência autoritativa/i,
  );
});

test("vínculo Regularize resolve process ou license sem fabricar referring_type", () => {
  const { resolveRegularizeReferringType } = implementation();
  const mappingRule = rule("tb_integracao.tarefas_regularize");
  const row = { id: 4, tarefa: 20, vinculo: "Sanitário" };
  const base = {
    taskModel: resolved("tb_integracao.tarefas_express", 20),
    referringType: resolved("tb_integracao.tarefas_regularize", 4, {
      targetTable: "integracao.tasksIntegrationRegularize",
      targetIdentityRef: "regularize.license",
      relatedIdentityRef: "regularize.license",
      criteria: { legacyValue: "Sanitário" },
    }),
  };
  const context = referenceContext("tb_integracao.tarefas_regularize", row, base);
  const [prepared] = mappingRule.emitRows(row, context);

  assert.equal(prepared.status, "prepared");
  assert.equal(resolveRegularizeReferringType(row.vinculo), "license");
  assert.equal(mappingRule.destinations[0].defaults.referring_type, undefined);

  const unknownRow = { ...row, id: 5, vinculo: "SENTINEL_UNKNOWN_KIND" };
  const unknownContext = referenceContext("tb_integracao.tarefas_regularize", unknownRow, {
    ...base,
    referringType: resolved("tb_integracao.tarefas_regularize", 5, {
      targetTable: "integracao.tasksIntegrationRegularize",
      targetIdentityRef: "regularize.process",
      relatedIdentityRef: "regularize.process",
      criteria: { legacyValue: "SENTINEL_UNKNOWN_KIND" },
    }),
  });
  const [unknown] = mappingRule.emitRows(unknownRow, unknownContext);
  assert.equal(unknown.status, "quarantine");
  assert.equal(unknown.reasonCode, "TASK_REGULARIZE_REFERRING_TYPE_UNKNOWN");
  assert.equal(resolveRegularizeReferringType(unknownRow.vinculo), null);

  const ambiguousContext = referenceContext("tb_integracao.tarefas_regularize", row, {
    ...base,
    referringType: { ...base.referringType, state: "many" },
  });
  assert.equal(
    mappingRule.emitRows(row, ambiguousContext)[0].reasonCode,
    "TASK_REGULARIZE_REFERRING_TYPE_AMBIGUOUS",
  );
});

test("ClientPF usa o corpus real completo e exige preflight do estado atual", async () => {
  const {
    buildClientPfResolutionContexts,
    INTEGRACAO_REGULARIZE_AUDITED_CORPORA,
    normalizeClientPfSourceRow,
  } = implementation();
  const mappingRule = rule("tb_regularize.pf");
  const rows = await loadRows("tb_regularize.pf");
  const contexts = buildClientPfResolutionContexts({ rows, currentRows: [] });
  const row = rows[0];
  const context = contexts[0];
  const [preflightRequired] = mappingRule.emitRows(row, context);

  assert.equal(rows.length, 1287);
  assert.equal(
    context.decisionBinding.corpusFingerprint,
    INTEGRACAO_REGULARIZE_AUDITED_CORPORA["tb_regularize.pf"].digest,
  );
  assert.equal(context.resolutions.uniqueCode.criteria.currentState, "zero");
  assert.equal(context.resolutions.uniqueCode.criteria.currentIdentityCount, 0);
  assert.equal(preflightRequired.status, "quarantine");
  assert.equal(preflightRequired.reasonCode, "CLIENT_PF_CURRENT_STATE_PREFLIGHT_REQUIRED");
  const verifiedContexts = buildClientPfResolutionContexts({
    rows,
    currentRows: [],
    currentStateVerified: true,
  });
  const verifiedContext = verifiedContexts[0];
  assert.equal(verifiedContext.resolutions.uniqueCode.criteria.currentStatePreflight, "complete");
  assert.notEqual(
    mappingRule.emitRows(row, verifiedContext)[0].reasonCode,
    "CLIENT_PF_CURRENT_STATE_PREFLIGHT_REQUIRED",
  );
  assert.equal(normalizeClientPfSourceRow(row).marital_status, "Casado");
  for (const required of [
    "sex",
    "address",
    "city",
    "zip_code",
    "state",
    "profession",
    "father",
    "mother",
    "marital_status",
    "cpf",
    "rg",
  ]) {
    assert.equal(required in mappingRule.destinations[0].defaults, false, required);
  }

  const invalidMarital = { ...row, estado_civil: "0" };
  assert.equal(
    mappingRule.emitRows(invalidMarital, context)[0].reasonCode,
    "CLIENT_PF_MARITAL_STATUS_INVALID",
  );

  const missingIndex = rows.findIndex((candidate) => String(candidate.profissao ?? "").trim() === "");
  assert.ok(missingIndex >= 0);
  assert.notEqual(
    mappingRule.emitRows(rows[missingIndex], verifiedContexts[missingIndex])[0].reasonCode,
    "CLIENT_PF_PROFESSION_EMPTY",
  );
});

test("builder ClientPF rejeita subset, linha alterada e duplicação do corpus autoritativo", async () => {
  const { buildClientPfResolutionContexts } = implementation();
  const rows = await loadRows("tb_regularize.pf");

  assert.throws(
    () => buildClientPfResolutionContexts({ rows: [rows[0]], currentRows: [] }),
    /corpus autoritativo.*tb_regularize\.pf/i,
  );
  assert.throws(
    () =>
      buildClientPfResolutionContexts({
        rows: [{ ...rows[0], nome: `${rows[0].nome} ALTERADO` }, ...rows.slice(1)],
        currentRows: [],
      }),
    /corpus autoritativo.*tb_regularize\.pf/i,
  );
  assert.throws(
    () => buildClientPfResolutionContexts({ rows: [...rows, rows[0]], currentRows: [] }),
    /corpus autoritativo.*tb_regularize\.pf/i,
  );

  const contexts = buildClientPfResolutionContexts({ rows, currentRows: [] });
  const reversed = buildClientPfResolutionContexts({ rows: [...rows].reverse(), currentRows: [] });
  assert.deepEqual(
    contexts.find(({ resolutions }) => resolutions.uniqueCode.sourceKey === "1"),
    reversed.find(({ resolutions }) => resolutions.uniqueCode.sourceKey === "1"),
  );
});

test("contexto ClientPF é opaco e preserva zero, um ou muitos resultados do preflight", async () => {
  const { buildClientPfResolutionContexts, buildIntegrationRegularizeContext } = implementation();
  const mappingRule = rule("tb_regularize.pf");
  const rows = await loadRows("tb_regularize.pf");
  const row = rows[0];
  const contexts = buildClientPfResolutionContexts({ rows, currentRows: [] });
  const context = contexts[0];
  assert.equal(buildIntegrationRegularizeContext, undefined);

  assert.throws(
    () => referenceContext("tb_regularize.pf", row, context.resolutions),
    /decis.+builder dedicado/i,
  );
  assert.equal(
    mappingRule.emitRows(row, { ...context })[0].reasonCode,
    "INTEGRATION_CONTEXT_MISMATCH",
  );
  assert.equal(
    mappingRule.emitRows(row, structuredClone(context))[0].reasonCode,
    "INTEGRATION_CONTEXT_MISMATCH",
  );

  const currentRows = [
    { id: "current-b", code: row.codigo, cpf: "other-b", rg: "other-b" },
    { id: "current-a", code: row.codigo, cpf: "other-a", rg: "other-a" },
  ];
  const multipleCurrent = buildClientPfResolutionContexts({ rows, currentRows })[0];
  const permutedCurrent = buildClientPfResolutionContexts({
    rows,
    currentRows: [...currentRows].reverse(),
  })[0];
  assert.deepEqual(multipleCurrent, permutedCurrent);
  assert.equal(multipleCurrent.resolutions.uniqueCode.criteria.currentState, "many");
  assert.equal(multipleCurrent.resolutions.uniqueCode.criteria.currentIdentityCount, 2);
  assert.equal(multipleCurrent.resolutions.uniqueCode.decision, "conflict");
  assert.equal(mappingRule.emitRows(row, multipleCurrent)[0].reasonCode, "CLIENT_PF_CODE_CONFLICT");

  const currentConflict = buildClientPfResolutionContexts({
    rows,
    currentRows: [{ id: "existing", code: row.codigo, cpf: "other", rg: "other" }],
  })[0];
  assert.equal(currentConflict.resolutions.uniqueCode.criteria.currentState, "one");
  assert.equal(currentConflict.resolutions.uniqueCode.criteria.currentIdentityCount, 1);
  assert.equal(mappingRule.emitRows(row, currentConflict)[0].reasonCode, "CLIENT_PF_CODE_CONFLICT");
});

test("sócios reais agrupam os 10 pares canônicos e bloqueiam reassinatura", async () => {
  const {
    buildPartnerPairResolutionContexts,
    createLegacyReferenceResolver,
    createV2ClientIdentityResolver,
    INTEGRACAO_REGULARIZE_AUDITED_CORPORA,
  } = implementation();
  const mappingRule = rule("tb_regularize.pf_empresas");
  const rows = await loadRows("tb_regularize.pf_empresas");
  const regularizeRows = await loadRows("tb_regularize.clientes");
  const integrationRows = await loadRows("tb_integracao.clientes");
  const clientPfRows = await loadRows("tb_regularize.pf");
  const clientResolver = createV2ClientIdentityResolver({
    regularizeRows,
    integrationRows,
  });
  const clientPfResolver = createLegacyReferenceResolver({
    sourceTable: "tb_regularize.pf",
    legacyColumn: "codigo",
    rows: clientPfRows,
  });
  const clientResolutions = rows.map((row) => clientResolver.resolve(row.empresa_id));
  const clientPfResolutions = rows.map((row) => clientPfResolver.resolve(row.pf_id));
  const contexts = buildPartnerPairResolutionContexts({
    rows,
    clientPfResolutions,
    clientResolutions,
  });
  assert.equal(
    contexts[0].decisionBinding.corpusFingerprint,
    INTEGRACAO_REGULARIZE_AUDITED_CORPORA["tb_regularize.pf_empresas"].digest,
  );
  assert.equal(
    contexts[0].decisionBinding.stateFingerprint,
    INTEGRACAO_REGULARIZE_AUDITED_CORPORA["tb_regularize.pf_empresas"].resolutionStateDigest,
  );

  const byCanonicalPair = new Map();
  for (const [index, context] of contexts.entries()) {
    const pair = context.resolutions.partnerPair.targetIdentityRef;
    const entries = byCanonicalPair.get(pair) ?? [];
    entries.push(index);
    byCanonicalPair.set(pair, entries);
  }
  const repeated = [...byCanonicalPair.values()].filter((indexes) => indexes.length > 1);
  assert.equal(repeated.length, 10);
  assert.equal(repeated.flat().length, 20);
  const decisions = repeated
    .flat()
    .map((index) => contexts[index].resolutions.partnerPair.decision)
    .sort();
  assert.deepEqual(
    Object.fromEntries(
      [...new Set(decisions)].map((decision) => [
        decision,
        decisions.filter((candidate) => candidate === decision).length,
      ]),
    ),
    { conflict: 16, duplicate: 2, owner: 2 },
  );

  const emissions = repeated
    .flat()
    .map((index) => mappingRule.emitRows(rows[index], contexts[index])[0]);
  assert.deepEqual(
    Object.fromEntries(
      [...new Set(emissions.map(({ status }) => status))].map((status) => [
        status,
        emissions.filter((emission) => emission.status === status).length,
      ]),
    ),
    { not_emitted: 2, prepared: 2, quarantine: 16 },
  );
  assert.deepEqual(mappingRule.destinations[0].precedence, [
    "active_period",
    "latest_entry",
    "lowest_legacy_id",
  ]);
  assert.equal(
    mappingRule.destinations[0].columns.find(({ sourceColumn }) => sourceColumn === "empresa_id")
      .transformation,
    "resolve_canonical_v2_client_reference",
  );

  const reversedRows = [...rows].reverse();
  const reversed = buildPartnerPairResolutionContexts({
    rows: reversedRows,
    clientPfResolutions: [...clientPfResolutions].reverse(),
    clientResolutions: [...clientResolutions].reverse(),
  });
  assert.deepEqual(
    contexts.find(({ resolutions }) => resolutions.partnerPair.sourceKey === "40"),
    reversed.find(({ resolutions }) => resolutions.partnerPair.sourceKey === "40"),
  );

  const duplicateIndex = contexts.findIndex(
    ({ resolutions }) => resolutions.partnerPair.decision === "duplicate",
  );
  assert.notEqual(duplicateIndex, -1);
  assert.throws(
    () =>
      referenceContext(
        "tb_regularize.pf_empresas",
        rows[duplicateIndex],
        contexts[duplicateIndex].resolutions,
      ),
    /decis.+builder dedicado/i,
  );
  const forged = {
    ...contexts[duplicateIndex],
    resolutions: {
      ...contexts[duplicateIndex].resolutions,
      partnerPair: {
        ...contexts[duplicateIndex].resolutions.partnerPair,
        decision: "owner",
        ownerIdentityRef: `tb_regularize.pf_empresas:${rows[duplicateIndex].id}`,
      },
    },
  };
  assert.equal(
    mappingRule.emitRows(rows[duplicateIndex], forged)[0].reasonCode,
    "INTEGRATION_CONTEXT_MISMATCH",
  );
  assert.equal(
    mappingRule.emitRows(rows[duplicateIndex], { ...contexts[duplicateIndex] })[0].reasonCode,
    "INTEGRATION_CONTEXT_MISMATCH",
  );
  assert.equal(
    mappingRule.emitRows(rows[duplicateIndex], structuredClone(contexts[duplicateIndex]))[0]
      .reasonCode,
    "INTEGRATION_CONTEXT_MISMATCH",
  );

  const row40Index = rows.findIndex(({ id }) => String(id) === "40");
  assert.notEqual(row40Index, -1);
  assert.throws(
    () =>
      buildPartnerPairResolutionContexts({
        rows: [rows[row40Index]],
        clientPfResolutions: [clientPfResolutions[row40Index]],
        clientResolutions: [clientResolutions[row40Index]],
      }),
    /corpus autoritativo.*tb_regularize\.pf_empresas/i,
  );

  const copiedClientPfResolutions = [...clientPfResolutions];
  copiedClientPfResolutions[0] = { ...copiedClientPfResolutions[0] };
  assert.throws(
    () =>
      buildPartnerPairResolutionContexts({
        rows,
        clientPfResolutions: copiedClientPfResolutions,
        clientResolutions,
      }),
    /clientPF.+proveniência|autêntica/i,
  );

  const mutatedClientResolutions = [...clientResolutions];
  mutatedClientResolutions[0] = {
    ...mutatedClientResolutions[0],
    sourceState: mutatedClientResolutions[0].sourceState === "one" ? "zero" : "one",
  };
  assert.throws(
    () =>
      buildPartnerPairResolutionContexts({
        rows,
        clientPfResolutions,
        clientResolutions: mutatedClientResolutions,
      }),
    /client.+proveniência|autêntica/i,
  );

  const alternativeClientResolver = createV2ClientIdentityResolver({
    regularizeRows: regularizeRows.filter(
      ({ codigo }) => String(codigo) !== String(rows[0].empresa_id),
    ),
    integrationRows,
  });
  const alternativeClientResolutions = [...clientResolutions];
  alternativeClientResolutions[0] = alternativeClientResolver.resolve(rows[0].empresa_id);
  assert.equal(alternativeClientResolutions[0].sourceState, "zero");
  assert.throws(
    () =>
      buildPartnerPairResolutionContexts({
        rows,
        clientPfResolutions,
        clientResolutions: alternativeClientResolutions,
      }),
    /proveniência autoritativa|corpus autoritativo/i,
  );

  const invalidDates = { ...rows[0], id: "999999", entrada: "2025-01-01", saida: "2024-01-01" };
  assert.equal(
    mappingRule.emitRows(invalidDates, contexts[0])[0].reasonCode,
    "PARTNER_EXIT_BEFORE_ENTRY",
  );
});

test("vencimento PF exige um único dono por referente e tipo normalizado", () => {
  const mappingRule = rule("tb_regularize.vencimento");
  const row = {
    id: 9,
    data_expedicao: "2020-01-01",
    data_vencimento: "2030-01-01",
    referente: 20,
    tipo: "Identidade",
  };
  const resolutions = {
    clientPf: { state: "one", sourceTable: "tb_regularize.pf", sourceKey: 20 },
    expirationSlot: {
      state: "one",
      sourceTable: "tb_regularize.vencimento",
      sourceKey: "20-identidade",
    },
  };
  const owner = referenceContext("tb_regularize.vencimento", row, resolutions);
  assert.deepEqual(
    mappingRule.emitRows(row, owner).map(({ status }) => status),
    ["prepared", "not_emitted"],
  );

  const ambiguous = referenceContext("tb_regularize.vencimento", row, {
    ...resolutions,
    expirationSlot: { ...resolutions.expirationSlot, state: "many" },
  });
  assert.equal(
    mappingRule.emitRows(row, ambiguous)[0].reasonCode,
    "CLIENT_PF_EXPIRATION_SLOT_AMBIGUOUS",
  );
});
