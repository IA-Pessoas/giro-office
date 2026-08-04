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

test("catálogo de distrato preserva TaskModel e valida responsáveis no departamento", () => {
  const { buildIntegrationRegularizeContext } = implementation();
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
  const context = buildIntegrationRegularizeContext(
    "tb_integracao.tarefas_express_distrato",
    row,
    resolutions,
  );

  assert.equal(mappingRule.emitRows(row, context)[0].status, "prepared");
  assert.equal(mappingRule.destinations[0].destinationTable, "integracao.tasksModel");
  assert.equal(mappingRule.destinations[0].constants.type, "legacy-termination");

  const wrongDepartment = buildIntegrationRegularizeContext(
    "tb_integracao.tarefas_express_distrato",
    row,
    {
      ...resolutions,
      responsible: resolved("tb_admin.usuarios", 17, {
        relatedIdentityRef: "tb_admin.departamentos:18",
      }),
    },
  );
  assert.equal(
    mappingRule.emitRows(row, wrongDepartment)[0].reasonCode,
    "TASK_MODEL_RESPONSIBLE_DEPARTMENT_MISMATCH",
  );
});

test("tarefa de distrato exige origem, alvo e critérios exatos sem derivar TaskModel", () => {
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
    client: resolved("tb_integracao.clientes", 7),
    department: resolved("tb_admin.departamentos", 3),
    responsible: resolved("tb_admin.usuarios", 8, {
      relatedIdentityRef: "tb_admin.departamentos:3",
    }),
    taskModel: resolved("tb_integracao.tarefas_express_distrato", 4, {
      targetTable: "integracao.tasksModel",
      targetIdentityRef: "tb_integracao.tarefas_express_distrato:4",
      criteria: {
        name: "SENTINEL_TASK_NAME",
        departmentIdentityRef: "tb_admin.departamentos:3",
      },
      relatedIdentityRef: "tb_admin.departamentos:3",
    }),
    project: resolved("integracao.projects", "project-91", {
      targetTable: "integracao.projects",
      targetIdentityRef: "integracao.projects:project-91",
      criteria: { clientIdentityRef: "tb_integracao.clientes:7" },
      relatedIdentityRef: "tb_integracao.clientes:7",
    }),
  });
  const prepared = mappingRule.emitRows(row, context);

  assert.equal(prepared.at(-1).status, "prepared");
  assert.equal(
    prepared.some(({ stepId }) => stepId === "termination-task-model-derived"),
    false,
  );
  assert.doesNotMatch(JSON.stringify(prepared), /SENTINEL/);

  const responsibleOutsideDepartment = buildIntegrationRegularizeContext(
    "tb_integracao.tarefas_distrato",
    row,
    {
      ...context.resolutions,
      responsible: {
        ...context.resolutions.responsible,
        relatedIdentityRef: "tb_admin.departamentos:99",
      },
    },
  );
  assert.equal(
    mappingRule.emitRows(row, responsibleOutsideDepartment)[0].reasonCode,
    "TASK_RESPONSIBLE_DEPARTMENT_MISMATCH",
  );

  const borrowed = mappingRule.emitRows({ ...row, id: 92 }, context);
  assert.ok(borrowed.every(({ status }) => status === "quarantine"));
  assert.equal(borrowed[0].reasonCode, "INTEGRATION_CONTEXT_MISMATCH");

  const resignedWrongCriterion = buildIntegrationRegularizeContext(
    "tb_integracao.tarefas_distrato",
    row,
    {
      ...context.resolutions,
      taskModel: {
        ...context.resolutions.taskModel,
        criteria: {
          name: "Outro modelo",
          departmentIdentityRef: "tb_admin.departamentos:3",
        },
      },
    },
  );
  assert.equal(
    mappingRule.emitRows(row, resignedWrongCriterion)[0].reasonCode,
    "TASK_MODEL_LOOKUP_CONTEXT_MISMATCH",
  );
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
    client: resolved("tb_integracao.clientes", 7),
    department: resolved("tb_admin.departamentos", 3),
    responsible: resolved("tb_admin.usuarios", 8, {
      relatedIdentityRef: "tb_admin.departamentos:3",
    }),
    taskModel: resolved("tb_integracao.tarefas_express_distrato", 4, {
      targetTable: "integracao.tasksModel",
      targetIdentityRef: "tb_integracao.tarefas_express_distrato:4",
      criteria: {
        name: "Distrato",
        departmentIdentityRef: "tb_admin.departamentos:3",
      },
      relatedIdentityRef: "tb_admin.departamentos:3",
    }),
    project: resolved("integracao.projects", "project-91", {
      targetTable: "integracao.projects",
      targetIdentityRef: "integracao.projects:project-91",
      criteria: { clientIdentityRef: "tb_integracao.clientes:99" },
      relatedIdentityRef: "tb_integracao.clientes:99",
    }),
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

test("atividade de orientação emite exatamente code, description e type com identidade filha", () => {
  const { buildGuidanceActivityPayload, buildIntegrationRegularizeContext } = implementation();
  const mappingRule = rule("tb_regularize.orientaoes_processual.atividades");
  const row = {
    id: 44,
    cliente_id: 10,
    op_id: 12,
    atividade: "68.21-8-01 - Corretagem na compra e venda e avaliação de imóveis",
    tipo: 1,
  };
  const context = buildIntegrationRegularizeContext(
    "tb_regularize.orientaoes_processual.atividades",
    row,
    { guidance: resolved("tb_regularize.orientaoes_processual", 12) },
  );
  const [emission] = mappingRule.emitRows(row, context);

  assert.equal(emission.status, "prepared");
  assert.equal(emission.identityRef, "tb_regularize.orientaoes_processual.atividades:44");
  assert.deepEqual(buildGuidanceActivityPayload(row), {
    code: "68.21-8-01",
    description: "Corretagem na compra e venda e avaliação de imóveis",
    type: "Principal",
  });
  assert.deepEqual(Object.keys(buildGuidanceActivityPayload(row)).sort(), [
    "code",
    "description",
    "type",
  ]);

  const invalid = { ...row, id: 45, atividade: "", tipo: 0 };
  const invalidContext = buildIntegrationRegularizeContext(
    "tb_regularize.orientaoes_processual.atividades",
    invalid,
    { guidance: resolved("tb_regularize.orientaoes_processual", 12) },
  );
  const [quarantined] = mappingRule.emitRows(invalid, invalidContext);
  assert.equal(quarantined.status, "quarantine");
  assert.equal(quarantined.reasonCode, "GUIDANCE_ACTIVITY_VALUE_INVALID");
  assert.equal(buildGuidanceActivityPayload(invalid), null);
});

test("grupo reutiliza identidade Client canônica da cadeia V2 e rejeita contexto refeito", () => {
  const { buildIntegrationRegularizeContext } = implementation();
  const mappingRule = rule("tb_regularize.grupos_integrantes");
  const row = { id: 4, codigo_cliente: 20, grupo_id: 6 };
  const resolutions = {
    client: resolved("tb_regularize.clientes", 20, {
      identityRef: "tb_integracao.clientes:7",
      targetTable: "clients",
      targetIdentityRef: "tb_integracao.clientes:7",
      criteria: { legacyCode: "20" },
    }),
    group: resolved("tb_regularize.grupos", 6),
  };
  const one = buildIntegrationRegularizeContext(
    "tb_regularize.grupos_integrantes",
    row,
    resolutions,
  );
  assert.equal(mappingRule.emitRows(row, one)[0].status, "prepared");

  const secondaryIdentity = buildIntegrationRegularizeContext(
    "tb_regularize.grupos_integrantes",
    row,
    {
      ...resolutions,
      client: {
        ...resolutions.client,
        sourceIdentityRef: "tb_regularize.clientes:999",
      },
    },
  );
  assert.equal(
    mappingRule.emitRows(row, secondaryIdentity)[0].reasonCode,
    "INTEGRATION_CONTEXT_MISMATCH",
  );
});

test("vínculo Regularize resolve process ou license sem fabricar referring_type", () => {
  const { buildIntegrationRegularizeContext, resolveRegularizeReferringType } = implementation();
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
  const context = buildIntegrationRegularizeContext("tb_integracao.tarefas_regularize", row, base);
  const [prepared] = mappingRule.emitRows(row, context);

  assert.equal(prepared.status, "prepared");
  assert.equal(resolveRegularizeReferringType(row.vinculo), "license");
  assert.equal(mappingRule.destinations[0].defaults.referring_type, undefined);

  const unknownRow = { ...row, id: 5, vinculo: "SENTINEL_UNKNOWN_KIND" };
  const unknownContext = buildIntegrationRegularizeContext(
    "tb_integracao.tarefas_regularize",
    unknownRow,
    {
      ...base,
      referringType: resolved("tb_integracao.tarefas_regularize", 5, {
        targetTable: "integracao.tasksIntegrationRegularize",
        targetIdentityRef: "regularize.process",
        relatedIdentityRef: "regularize.process",
        criteria: { legacyValue: "SENTINEL_UNKNOWN_KIND" },
      }),
    },
  );
  const [unknown] = mappingRule.emitRows(unknownRow, unknownContext);
  assert.equal(unknown.status, "quarantine");
  assert.equal(unknown.reasonCode, "TASK_REGULARIZE_REFERRING_TYPE_UNKNOWN");
  assert.equal(resolveRegularizeReferringType(unknownRow.vinculo), null);

  const ambiguousContext = buildIntegrationRegularizeContext(
    "tb_integracao.tarefas_regularize",
    row,
    {
      ...base,
      referringType: { ...base.referringType, state: "many" },
    },
  );
  assert.equal(
    mappingRule.emitRows(row, ambiguousContext)[0].reasonCode,
    "TASK_REGULARIZE_REFERRING_TYPE_AMBIGUOUS",
  );
});

test("ClientPF exige campos atuais, normaliza estado civil e vincula as três unicidades", () => {
  const { buildClientPfResolutionContexts, normalizeClientPfSourceRow } = implementation();
  const mappingRule = rule("tb_regularize.pf");
  const row = {
    codigo: 101,
    nome: "Pessoa Exemplo",
    sexo: "F",
    endereco: "Rua Exemplo",
    cidade: "Salvador",
    cep: "40000-000",
    uf: "BA",
    profissao: "Contadora",
    pai: "Pai Exemplo",
    mae: "Mãe Exemplo",
    estado_civil: "2",
    nascimento: "1990-02-03",
    cpf_cnpj: "123.456.789-01",
    identidade: "12.345.678-9",
    reservista: "",
    ctps: "",
    cnh: "",
    conjuge: "",
    status: "Ativo",
    obs: "",
    telefone: "",
  };
  const [context] = buildClientPfResolutionContexts({ rows: [row], currentRows: [] });
  const [prepared] = mappingRule.emitRows(row, context);

  assert.equal(prepared.status, "prepared");
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
  const [invalidContext] = buildClientPfResolutionContexts({
    rows: [invalidMarital],
    currentRows: [],
  });
  assert.equal(
    mappingRule.emitRows(invalidMarital, invalidContext)[0].reasonCode,
    "CLIENT_PF_MARITAL_STATUS_INVALID",
  );

  const missingRequired = { ...row, profissao: "" };
  const [missingContext] = buildClientPfResolutionContexts({
    rows: [missingRequired],
    currentRows: [],
  });
  assert.equal(
    mappingRule.emitRows(missingRequired, missingContext)[0].reasonCode,
    "CLIENT_PF_PROFESSION_EMPTY",
  );
});

test("ClientPF distingue owner, duplicidade e conflito com decisão assinada", () => {
  const { buildIntegrationRegularizeContext } = implementation();
  const mappingRule = rule("tb_regularize.pf");
  const row = {
    codigo: 101,
    nome: "Pessoa Exemplo",
    sexo: "M",
    endereco: "Rua Exemplo",
    cidade: "Salvador",
    cep: "40000000",
    uf: "BA",
    profissao: "Contador",
    pai: "Pai Exemplo",
    mae: "Mãe Exemplo",
    estado_civil: "1",
    nascimento: "1990-02-03",
    cpf_cnpj: "12345678901",
    identidade: "123456789",
    reservista: "",
    ctps: "",
    cnh: "",
    conjuge: "",
    status: "Ativo",
    obs: "",
    telefone: "",
  };
  const slot = (field, normalizedValue, overrides = {}) =>
    resolved("tb_regularize.pf", 101, {
      targetTable: "clients.pf",
      targetIdentityRef: `clients.pf:${field}:${normalizedValue}`,
      criteria: { field, normalizedValue },
      decision: "owner",
      ownerIdentityRef: "tb_regularize.pf:101",
      ...overrides,
    });
  const resolutions = {
    uniqueCode: slot("code", "101"),
    uniqueCpf: slot("cpf", "12345678901"),
    uniqueRg: slot("rg", "123456789"),
  };

  const duplicate = buildIntegrationRegularizeContext("tb_regularize.pf", row, {
    ...resolutions,
    uniqueCpf: slot("cpf", "12345678901", {
      state: "many",
      decision: "duplicate",
      ownerIdentityRef: "tb_regularize.pf:100",
    }),
  });
  const [notEmitted] = mappingRule.emitRows(row, duplicate);
  assert.equal(notEmitted.status, "not_emitted");
  assert.equal(notEmitted.reasonCode, "CLIENT_PF_CPF_DUPLICATE");

  const conflict = buildIntegrationRegularizeContext("tb_regularize.pf", row, {
    ...resolutions,
    uniqueRg: slot("rg", "123456789", {
      state: "many",
      decision: "conflict",
      ownerIdentityRef: "clients.pf:existing",
    }),
  });
  const [quarantined] = mappingRule.emitRows(row, conflict);
  assert.equal(quarantined.status, "quarantine");
  assert.equal(quarantined.reasonCode, "CLIENT_PF_RG_CONFLICT");

  const resignedWrongValue = buildIntegrationRegularizeContext("tb_regularize.pf", row, {
    ...resolutions,
    uniqueCpf: slot("cpf", "99999999999"),
  });
  assert.equal(
    mappingRule.emitRows(row, resignedWrongValue)[0].reasonCode,
    "INTEGRATION_CONTEXT_MISMATCH",
  );
});

test("builder ClientPF decide duplicidade determinística e conflito com destino atual", () => {
  const { buildClientPfResolutionContexts } = implementation();
  const mappingRule = rule("tb_regularize.pf");
  const first = {
    codigo: 101,
    nome: "Pessoa Exemplo",
    sexo: "M",
    endereco: "Rua Exemplo",
    cidade: "Salvador",
    cep: "40000000",
    uf: "BA",
    profissao: "Contador",
    pai: "Pai Exemplo",
    mae: "Mãe Exemplo",
    estado_civil: "1",
    nascimento: "1990-02-03",
    cpf_cnpj: "12345678901",
    identidade: "123456789",
    reservista: "",
    ctps: "",
    cnh: "",
    conjuge: "",
    status: "Ativo",
    obs: "",
    telefone: "",
  };
  const duplicate = { ...first, codigo: 102 };
  const contexts = buildClientPfResolutionContexts({ rows: [first, duplicate] });

  assert.equal(mappingRule.emitRows(first, contexts[0])[0].status, "prepared");
  assert.equal(
    mappingRule.emitRows(duplicate, contexts[1])[0].reasonCode,
    "CLIENT_PF_CPF_DUPLICATE",
  );

  const [currentConflict] = buildClientPfResolutionContexts({
    rows: [first],
    currentRows: [{ id: "existing", code: "other", cpf: "12345678901", rg: "other" }],
  });
  assert.equal(
    mappingRule.emitRows(first, currentConflict)[0].reasonCode,
    "CLIENT_PF_CPF_CONFLICT",
  );
});

test("sócio reutiliza Client canônico e escolhe um único período por par PJ/PF", () => {
  const { buildIntegrationRegularizeContext, buildPartnerPairResolutionContexts } =
    implementation();
  const mappingRule = rule("tb_regularize.pf_empresas");
  const ownerRow = {
    id: 41,
    pf_id: 33,
    empresa_id: 222,
    parte: 50,
    entrada: "2020-01-07",
    saida: "0000-00-00",
  };
  const base = {
    clientPf: resolved("tb_regularize.pf", 33),
    client: resolved("tb_regularize.clientes", 222, {
      identityRef: "tb_integracao.clientes:700",
      targetTable: "clients",
      targetIdentityRef: "tb_integracao.clientes:700",
      criteria: { legacyCode: "222" },
    }),
  };
  const pair = (row, decision, ownerIdentityRef) =>
    resolved("tb_regularize.pf_empresas", row.id, {
      targetTable: "regularize.partners",
      targetIdentityRef: "regularize.partners:tb_integracao.clientes:700:tb_regularize.pf:33",
      criteria: {
        pjIdentityRef: "tb_integracao.clientes:700",
        pfIdentityRef: "tb_regularize.pf:33",
      },
      decision,
      ownerIdentityRef,
    });
  const historicalRow = {
    ...ownerRow,
    id: 40,
    parte: 0,
    entrada: "2010-04-27",
    saida: "2018-08-20",
  };
  const [duplicateContext, ownerContext] = buildPartnerPairResolutionContexts({
    rows: [historicalRow, ownerRow],
    clientPfResolutions: [base.clientPf, base.clientPf],
    clientResolutions: [base.client, base.client],
  });
  assert.equal(mappingRule.emitRows(ownerRow, ownerContext)[0].status, "prepared");
  assert.deepEqual(mappingRule.destinations[0].precedence, [
    "active_period",
    "latest_entry",
    "lowest_legacy_id",
  ]);

  const [duplicate] = mappingRule.emitRows(historicalRow, duplicateContext);
  assert.equal(duplicate.status, "not_emitted");
  assert.equal(duplicate.reasonCode, "PARTNER_PAIR_HISTORICAL_DUPLICATE");

  const overlappingRow = {
    ...historicalRow,
    id: 42,
    entrada: "2015-01-01",
    saida: "2021-01-01",
  };
  const overlapContexts = buildPartnerPairResolutionContexts({
    rows: [historicalRow, overlappingRow],
    clientPfResolutions: [base.clientPf, base.clientPf],
    clientResolutions: [base.client, base.client],
  });
  assert.ok(
    overlapContexts.every(
      (candidate, index) =>
        mappingRule.emitRows([historicalRow, overlappingRow][index], candidate)[0].reasonCode ===
        "PARTNER_PAIR_HISTORY_CONFLICT",
    ),
  );

  const conflictContext = buildIntegrationRegularizeContext(
    "tb_regularize.pf_empresas",
    historicalRow,
    {
      ...base,
      partnerPair: pair(historicalRow, "conflict", "tb_regularize.pf_empresas:41"),
    },
  );
  assert.equal(
    mappingRule.emitRows(historicalRow, conflictContext)[0].reasonCode,
    "PARTNER_PAIR_HISTORY_CONFLICT",
  );

  const invalidDates = { ...ownerRow, entrada: "2025-01-01", saida: "2024-01-01" };
  const invalidContext = buildIntegrationRegularizeContext(
    "tb_regularize.pf_empresas",
    invalidDates,
    {
      ...base,
      partnerPair: pair(invalidDates, "owner", "tb_regularize.pf_empresas:41"),
    },
  );
  assert.equal(
    mappingRule.emitRows(invalidDates, invalidContext)[0].reasonCode,
    "PARTNER_EXIT_BEFORE_ENTRY",
  );
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
