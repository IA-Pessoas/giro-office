import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

import { validateMappingRule } from "../lib/mapping-contract.mjs";
import { loadPrismaCatalog } from "../lib/prisma-catalog.mjs";

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

async function inspectDeclaredColumns(sourceTable) {
  const dump = await readFile(path.join(LEGACY_DUMP_ROOT, `${sourceTable}.sql`), "utf8");
  const createBody = dump.match(/CREATE TABLE[\s\S]*?\(([\s\S]*?)\) ENGINE=/)?.[1];
  assert.ok(createBody, `CREATE TABLE ausente: ${sourceTable}`);
  return [...createBody.matchAll(/^\s*`([^`]+)`/gm)].map((match) => match[1]);
}

test("registry acumulado contém 89 regras e nenhuma origem colide", () => {
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

  assert.equal(INTEGRACAO_REGULARIZE_RULES.length, 13);
  assert.equal(registry.size, 89);
  assert.equal(new Set(all.map(({ sourceTable }) => sourceTable)).size, 89);
});

test("todas as 13 regras são válidas contra o catálogo Prisma atual", async () => {
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

test("tarefa de distrato exige projeto, modelo, cliente e departamento vinculados à própria linha", () => {
  const { buildIntegrationRegularizeContext } = implementation();
  const mappingRule = rule("tb_integracao.tarefas_distrato");
  const row = {
    id: 91,
    cliente_id: 7,
    nome: "SENTINEL_TASK_NAME",
    estado: "Em andamento",
    departamento_id: 3,
    responsavel_id: 8,
    responsavel_id_dois: 0,
    responsavel_id_tres: 0,
    realizado: 0,
    data_previsao: "2026-08-10",
    data_resolucao: "0000-00-00",
    obs: "SENTINEL_TASK_OBS",
    ano: 2026,
    cobranca: "0",
  };
  const context = buildIntegrationRegularizeContext("tb_integracao.tarefas_distrato", row, {
    client: { state: "one", sourceTable: "tb_integracao.clientes", sourceKey: 7 },
    department: { state: "one", sourceTable: "tb_admin.departamentos", sourceKey: 3 },
    responsible: { state: "one", sourceTable: "tb_admin.usuarios", sourceKey: 8 },
    taskModel: {
      state: "one",
      sourceTable: "integracao.tasksModel",
      sourceKey: "model-91",
      relatedIdentityRef: "tb_admin.departamentos:3",
    },
    project: {
      state: "one",
      sourceTable: "integracao.projects",
      sourceKey: "project-91",
      relatedIdentityRef: "tb_integracao.clientes:7",
    },
  });
  const prepared = mappingRule.emitRows(row, context);

  assert.equal(prepared.at(-1).status, "prepared");
  assert.doesNotMatch(JSON.stringify(prepared), /SENTINEL/);

  const borrowed = mappingRule.emitRows({ ...row, id: 92 }, context);
  assert.ok(borrowed.every(({ status }) => status === "quarantine"));
  assert.equal(borrowed[0].reasonCode, "INTEGRATION_CONTEXT_MISMATCH");
});

test("Task.project.client_id divergente de Task.client_id sempre gera quarantine", () => {
  const { buildIntegrationRegularizeContext } = implementation();
  const mappingRule = rule("tb_integracao.tarefas_distrato");
  const row = {
    id: 91,
    cliente_id: 7,
    nome: "Distrato",
    estado: "Em andamento",
    departamento_id: 3,
    responsavel_id: 8,
  };
  const context = buildIntegrationRegularizeContext("tb_integracao.tarefas_distrato", row, {
    client: { state: "one", sourceTable: "tb_integracao.clientes", sourceKey: 7 },
    department: { state: "one", sourceTable: "tb_admin.departamentos", sourceKey: 3 },
    responsible: { state: "one", sourceTable: "tb_admin.usuarios", sourceKey: 8 },
    taskModel: {
      state: "one",
      sourceTable: "integracao.tasksModel",
      sourceKey: "model-91",
      relatedIdentityRef: "tb_admin.departamentos:3",
    },
    project: {
      state: "one",
      sourceTable: "integracao.projects",
      sourceKey: "project-91",
      relatedIdentityRef: "tb_integracao.clientes:99",
    },
  });
  const emissions = mappingRule.emitRows(row, context);

  assert.ok(emissions.every(({ status }) => status === "quarantine"));
  assert.equal(emissions[0].reasonCode, "TASK_PROJECT_CLIENT_MISMATCH");
  assert.equal(emissions[0].field, "cliente_id");
});

test("dependência resolve os dois modelos explicitamente, rejeita auto-relação e ambiguidade", () => {
  const { buildIntegrationRegularizeContext } = implementation();
  const mappingRule = rule("tb_integracao.tarefas_dependentes");
  const row = { id: 5, tarefa_express_id: 10, dependente_id: 11, obs: "aguardar", espera: 1 };
  const preparedContext = buildIntegrationRegularizeContext(
    "tb_integracao.tarefas_dependentes",
    row,
    {
      taskModel: { state: "one", sourceTable: "tb_integracao.tarefas_express", sourceKey: 10 },
      dependentModel: {
        state: "one",
        sourceTable: "tb_integracao.tarefas_express",
        sourceKey: 11,
      },
    },
  );
  assert.equal(mappingRule.emitRows(row, preparedContext)[0].status, "prepared");

  const self = mappingRule.emitRows({ ...row, dependente_id: 10 }, preparedContext);
  assert.equal(self[0].reasonCode, "TASK_DEPENDENCY_SELF_REFERENCE");

  const ambiguousContext = buildIntegrationRegularizeContext(
    "tb_integracao.tarefas_dependentes",
    row,
    {
      taskModel: { state: "one", sourceTable: "tb_integracao.tarefas_express", sourceKey: 10 },
      dependentModel: {
        state: "many",
        sourceTable: "tb_integracao.tarefas_express",
        sourceKey: 11,
      },
    },
  );
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
  assert.equal(activity.destinationColumn, "economic_activities");
  assert.equal(activity.transformation, "aggregate_normalized_economic_activities");
  assert.equal(mappingRule.dependencies.includes("tb_regularize.atividades"), false);
});

test("vínculos de grupo e sócio usam chaves legadas explícitas; zero ou muitos quarentena", () => {
  const { buildIntegrationRegularizeContext } = implementation();
  const cases = [
    {
      sourceTable: "tb_regularize.grupos_integrantes",
      row: { id: 4, codigo_cliente: 20, grupo_id: 6 },
      resolutions: {
        client: { state: "one", sourceTable: "tb_regularize.clientes", sourceKey: 20 },
        group: { state: "one", sourceTable: "tb_regularize.grupos", sourceKey: 6 },
      },
    },
    {
      sourceTable: "tb_regularize.pf_empresas",
      row: { id: 4, pf_id: 20, empresa_id: 6, parte: 50, entrada: "2020-01-01", saida: null },
      resolutions: {
        clientPf: { state: "one", sourceTable: "tb_regularize.pf", sourceKey: 20 },
        client: { state: "one", sourceTable: "tb_regularize.clientes", sourceKey: 6 },
      },
    },
  ];

  for (const item of cases) {
    const mappingRule = rule(item.sourceTable);
    const one = buildIntegrationRegularizeContext(item.sourceTable, item.row, item.resolutions);
    assert.equal(mappingRule.emitRows(item.row, one)[0].status, "prepared", item.sourceTable);
    const firstKey = Object.keys(item.resolutions)[0];
    const many = buildIntegrationRegularizeContext(item.sourceTable, item.row, {
      ...item.resolutions,
      [firstKey]: { ...item.resolutions[firstKey], state: "many" },
    });
    assert.equal(mappingRule.emitRows(item.row, many)[0].status, "quarantine", item.sourceTable);
  }
});

test("vencimento PF exige um único dono por referente e tipo normalizado", () => {
  const { buildIntegrationRegularizeContext } = implementation();
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
  const owner = buildIntegrationRegularizeContext("tb_regularize.vencimento", row, resolutions);
  assert.deepEqual(
    mappingRule.emitRows(row, owner).map(({ status }) => status),
    ["prepared", "not_emitted"],
  );

  const ambiguous = buildIntegrationRegularizeContext("tb_regularize.vencimento", row, {
    ...resolutions,
    expirationSlot: { ...resolutions.expirationSlot, state: "many" },
  });
  assert.equal(
    mappingRule.emitRows(row, ambiguous)[0].reasonCode,
    "CLIENT_PF_EXPIRATION_SLOT_AMBIGUOUS",
  );
});
