import assert from "node:assert/strict";
import test from "node:test";

import {
  assertExecutionGroupCoverage,
  assertTransformationCoverage,
  createExecutionRegistry,
  validateExecutionCoverage,
} from "../lib/execution-registry.mjs";
import { CASTELO_ORGANIZATION_ID } from "../lib/mapping-contract.mjs";
import { loadPrismaCatalog } from "../lib/prisma-catalog.mjs";
import { REGULARIZE_CREDENTIAL_SLOTS, V2_RULES } from "../rules/v2.mjs";
import { buildV2RuntimeState, V2_EXECUTION_ENTRIES, V2_TRANSFORMERS } from "../runtime/v2.mjs";

const OTHER_ORGANIZATION_ID = "00000000-0000-4000-8000-000000000000";
const BCRYPT_FIXTURE = "$2b$12$01234567890123456789012345678901234567890123456789012";
const ENCRYPTED_CREDENTIAL_FIXTURE =
  "0123456789abcdef0123456789abcdef:fedcba9876543210fedcba9876543210:00112233445566778899aabbccddeeff";

function entry(stepId) {
  const found = V2_EXECUTION_ENTRIES.find((candidate) => candidate.stepId === stepId);
  assert.ok(found, `entrada ausente: ${stepId}`);
  return found;
}

function prepared(stepId, destinationTable) {
  return {
    stepId,
    destinationTable,
    status: "prepared",
    identityRef: `fixture:${stepId}`,
    field: null,
    reasonCode: null,
  };
}

test("runtime V2 cobre exatamente 16 origens e 43 passos com transformações executáveis", async () => {
  assert.equal(assertExecutionGroupCoverage(V2_RULES, V2_EXECUTION_ENTRIES), true);
  assert.equal(new Set(V2_EXECUTION_ENTRIES.map(({ sourceTable }) => sourceTable)).size, 16);
  assert.equal(V2_EXECUTION_ENTRIES.length, 43);
  assert.equal(assertTransformationCoverage(V2_RULES, V2_TRANSFORMERS, V2_EXECUTION_ENTRIES), true);

  const modes = V2_RULES.flatMap(({ destinations }) => destinations).reduce((counts, step) => {
    counts[step.mode] = (counts[step.mode] ?? 0) + 1;
    return counts;
  }, {});
  assert.deepEqual(modes, { insert: 23, merge: 4, lookup: 3, derived: 12, aggregate: 1 });

  const prismaCatalog = await loadPrismaCatalog("infra/prisma/schema.prisma");
  assert.equal(
    validateExecutionCoverage({
      ruleRegistry: new Map(V2_RULES.map((rule) => [rule.sourceTable, rule])),
      executionRegistry: createExecutionRegistry([V2_EXECUTION_ENTRIES]),
      prismaCatalog,
    }),
    true,
  );
});

test("projeções diretas geram UUID v5 e limitam o payload a defaults, constantes e colunas mapeadas", async () => {
  const state = buildV2RuntimeState();
  const payload = await entry("department-insert").projector(
    prepared("department-insert", "departments"),
    {
      id: 7,
      nome: "  Fiscal  ",
      color: "#AABBCC",
      status: "ativo",
      parceiros: "1",
      nao_mapeado: "NAO_DEVE_VAZAR",
    },
    state,
  );

  assert.deepEqual(payload, {
    color: "#aabbcc",
    id: "ae745f66-b01a-51d6-bcbd-2549ac95b2c8",
    name: "Fiscal",
    organization_id: CASTELO_ORGANIZATION_ID,
    solution: true,
    status: "Ativo",
  });
  assert.equal("nao_mapeado" in payload, false);
});

test("usuário e colaborador projetam senha e merge somente contra identidade Castelo", async () => {
  const userId = "017ba784-b058-5af8-8c52-8c662a6d0307";
  const state = buildV2RuntimeState({
    destinationRows: [
      { destinationTable: "users", id: userId, organization_id: OTHER_ORGANIZATION_ID },
      { destinationTable: "users", id: userId, organization_id: CASTELO_ORGANIZATION_ID },
    ],
    hashLegacyPassword: async () => BCRYPT_FIXTURE,
    passwordHashingVerified: true,
    sourceRows: [{ sourceTable: "tb_rh.cargos", id: 4, nome: "Analista Fiscal" }],
  });

  const user = await entry("user-insert").projector(
    prepared("user-insert", "users"),
    {
      id: 9,
      nome: "Bruna",
      user: " BRUNA ",
      password: "legacy-password",
      cargo: "3",
      status: "1",
      departamento_id: 7,
      img: " avatar.png ",
    },
    state,
  );
  assert.equal(user.id, userId);
  assert.equal(user.password, BCRYPT_FIXTURE);
  assert.equal(user.department_id, "ae745f66-b01a-51d6-bcbd-2549ac95b2c8");

  const collaborator = await entry("collaborator-user-merge").projector(
    prepared("collaborator-user-merge", "users"),
    { user_id: 9, nome: "Bruna Silva", departamento_id: 7, status: "ativo" },
    state,
  );
  assert.equal(collaborator.id, userId);
  assert.equal(collaborator.full_name, "Bruna Silva");
  assert.deepEqual(state.resolveMergeTarget("users", userId), [userId]);

  const foreignOnly = buildV2RuntimeState({
    destinationRows: [
      { destinationTable: "users", id: userId, organization_id: OTHER_ORGANIZATION_ID },
    ],
  });
  assert.deepEqual(foreignOnly.resolveMergeTarget("users", userId), []);
  await assert.rejects(
    entry("collaborator-user-merge").projector(
      prepared("collaborator-user-merge", "users"),
      { user_id: 9, nome: "Bruna Silva", departamento_id: 7 },
      foreignOnly,
    ),
    /V2_MERGE_TARGET_NOT_FOUND/,
  );
});

test("collaborator-job-title preserva UUID Castelo resolvido quando cargo vazio", () => {
  const userId = "017ba784-b058-5af8-8c52-8c662a6d0307";
  const state = buildV2RuntimeState({
    destinationRows: [
      { destinationTable: "users", id: userId, organization_id: CASTELO_ORGANIZATION_ID },
    ],
  });
  const decision = entry("collaborator-job-title-merge")
    .emitRows({ id: 31, user_id: 9, cargo: "" }, state)
    .find(({ stepId }) => stepId === "collaborator-job-title-merge");

  assert.deepEqual(decision, {
    stepId: "collaborator-job-title-merge",
    destinationTable: "users",
    status: "not_emitted",
    identityRef: `users:${userId}`,
    field: null,
    reasonCode: "COLLABORATOR_CARGO_EMPTY_NO_JOB_TITLE",
  });
});

test("projeção de merge falha fechada quando o resolver Castelo está ausente", async () => {
  await assert.rejects(
    entry("collaborator-user-merge").projector(
      prepared("collaborator-user-merge", "users"),
      { user_id: 9, nome: "Bruna Silva", departamento_id: 7 },
      {},
    ),
    /V2_MERGE_RESOLVER_UNAVAILABLE/,
  );
});

test("callbacks de credencial exigem capacidade explícita e resultado AES-GCM válido", async () => {
  const runtimeEntry = entry("credential-slot-gov-br");
  const row = { id: 41, empresa: 31, responsavel: "LOGIN_SENTINEL", gov: "PASSWORD_SENTINEL" };

  for (const state of [
    buildV2RuntimeState({
      credentialEncryptionVerified: true,
      encryptCredential: async (value) => value,
    }),
    buildV2RuntimeState({
      credentialEncryptionVerified: true,
      encryptCredential: async () => "encrypted-but-not-the-current-contract",
    }),
  ]) {
    await assert.rejects(
      runtimeEntry.projector(
        prepared(runtimeEntry.stepId, runtimeEntry.destinationTable),
        row,
        state,
      ),
      /V2_ENCRYPTION_RESULT_INVALID/,
    );
  }

  const unverified = buildV2RuntimeState({
    encryptCredential: async () => ENCRYPTED_CREDENTIAL_FIXTURE,
  });
  await assert.rejects(
    runtimeEntry.projector(
      prepared(runtimeEntry.stepId, runtimeEntry.destinationTable),
      row,
      unverified,
    ),
    /V2_ENCRYPTION_UNAVAILABLE/,
  );
});

test("hasher de senha exige capacidade explícita e devolução bcrypt diferente do segredo", async () => {
  const runtimeEntry = entry("user-insert");
  const row = {
    id: 9,
    nome: "Bruna",
    user: "bruna",
    password: "PLAINTEXT_SENTINEL",
    cargo: 3,
    status: 1,
    departamento_id: 7,
  };
  const insecureStates = [
    buildV2RuntimeState({
      hashLegacyPassword: async (value) => value,
      passwordHashingVerified: true,
    }),
    buildV2RuntimeState({
      hashLegacyPassword: async () => "not-a-bcrypt-hash",
      passwordHashingVerified: true,
    }),
  ];
  for (const state of insecureStates) {
    await assert.rejects(
      runtimeEntry.projector(prepared("user-insert", "users"), row, state),
      /V2_PASSWORD_HASH_RESULT_INVALID/,
    );
  }

  await assert.rejects(
    runtimeEntry.projector(
      prepared("user-insert", "users"),
      row,
      buildV2RuntimeState({ hashLegacyPassword: async () => BCRYPT_FIXTURE }),
    ),
    /V2_PASSWORD_HASHER_UNAVAILABLE/,
  );
});

test("datas SQL sem timezone são UTC e datas de calendário inválidas falham fechadas", () => {
  const previousTimezone = process.env.TZ;
  process.env.TZ = "America/Bahia";
  try {
    assert.equal(V2_TRANSFORMERS.normalize_date("2024-01-31 12:30:00"), "2024-01-31T12:30:00.000Z");
    assert.throws(() => V2_TRANSFORMERS.normalize_date("2024-02-31"), /V2_DATE_INVALID/);
  } finally {
    if (previousTimezone === undefined) delete process.env.TZ;
    else process.env.TZ = previousTimezone;
  }
});

test("runtime converte data inválida em quarantine sanitizada antes da projeção", () => {
  const runtimeEntry = entry("integration-client-insert");
  const row = { id: 12, dataAbertura: "2024-02-31" };
  const expectedDecision = {
    status: "quarantine",
    field: "dataAbertura",
    reasonCode: "DATE_VALUE_INVALID",
  };

  assert.deepEqual(runtimeEntry.classifySourceRow(row, {}), expectedDecision);
  const [decision] = runtimeEntry.emitRows(row, {});
  assert.deepEqual(
    {
      status: decision.status,
      field: decision.field,
      reasonCode: decision.reasonCode,
    },
    expectedDecision,
  );
  assert.doesNotMatch(JSON.stringify(decision), /2024-02-31/);
});

for (const [label, value] of [
  ["null", null],
  ["vazia", ""],
  ["sentinela zero", "0000-00-00"],
]) {
  test(`runtime converte normalize_required_date ${label} em quarantine sanitizada`, () => {
    const runtimeEntry = entry("license-insert");
    const row = { id: 13, data_de_entrada: value };
    const expectedDecision = {
      status: "quarantine",
      field: "data_de_entrada",
      reasonCode: "DATE_VALUE_INVALID",
    };

    assert.deepEqual(runtimeEntry.classifySourceRow(row, {}), expectedDecision);
    const [decision] = runtimeEntry.emitRows(row, {});
    assert.deepEqual(
      {
        status: decision.status,
        field: decision.field,
        reasonCode: decision.reasonCode,
      },
      expectedDecision,
    );
    assert.equal("value" in decision, false);
    assert.equal("payload" in decision, false);
  });
}

test("runtime preserva normalize_date vazio como nullable", () => {
  const runtimeEntry = entry("integration-client-insert");
  const row = { id: 14, dataAbertura: "" };

  assert.deepEqual(runtimeEntry.classifySourceRow(row, {}), { status: "prepared" });
  assert.equal(runtimeEntry.emitRows(row, {})[0].status, "prepared");
});

test("inteiros rejeitam conteúdo parcial e frações em vez de truncar", () => {
  for (const malformed of ["12abc", "1.9", "1,9", " 7 trailing"]) {
    assert.throws(
      () => V2_TRANSFORMERS.normalize_integer(malformed),
      /V2_INTEGER_INVALID/,
      malformed,
    );
  }
  assert.equal(V2_TRANSFORMERS.normalize_integer(" -12 "), -12);
});

test("clientes das duas origens preservam somente a projeção declarada", async () => {
  const state = buildV2RuntimeState();
  const integration = await entry("integration-client-insert").projector(
    prepared("integration-client-insert", "clients"),
    {
      id: 12,
      nome: " ACME ",
      tipo: "pj",
      cpf_cnpj: "12.345.678/0001-90",
      email: " Financeiro@Example.COM ",
      complexidade: "alta",
    },
    state,
  );
  assert.equal(integration.id, "1ab9eb8e-b7e0-55e5-8157-bbc247185355");
  assert.equal(integration.cpf_cnpj, "12345678000190");
  assert.equal(integration.email, "financeiro@example.com");
  assert.equal("complexidade" in integration, false);

  const regularize = await entry("regularize-client-insert").projector(
    prepared("regularize-client-insert", "clients"),
    {
      codigo: 31,
      cliente_id: 0,
      nome: " Loja Castelo ",
      cpf_cnpj: "123.456.789-00",
      situacao: "ativo",
    },
    state,
  );
  assert.equal(regularize.name, "Loja Castelo");
  assert.equal(regularize.cpf_cnpj, "12345678900");
  assert.equal("cliente_id" in regularize, false);
});

test("licença e processo fazem fallback de cliente por nome somente no tenant Castelo", async () => {
  const state = buildV2RuntimeState({
    destinationRows: [
      {
        destinationTable: "clients",
        id: "client-foreign",
        name: "ACME",
        cpf_cnpj: "12345678000190",
        organization_id: OTHER_ORGANIZATION_ID,
      },
      {
        destinationTable: "clients",
        id: "client-castelo",
        name: "ACME",
        cpf_cnpj: "12345678000190",
        organization_id: CASTELO_ORGANIZATION_ID,
      },
    ],
  });
  const license = await entry("license-insert").projector(
    prepared("license-insert", "regularize.license"),
    {
      id: 4,
      cpf_cnpj: "",
      empresa: " ACME ",
      tipo_do_alvara: "Funcionamento",
      data_de_entrada: "31/01/2024",
    },
    state,
  );
  assert.equal(license.client_id, "client-castelo");
  assert.equal(license.entry_date, "2024-01-31T00:00:00.000Z");

  const process = await entry("process-insert").projector(
    prepared("process-insert", "regularize.process"),
    { id: 5, cpf_cnpj: "12.345.678/0001-90", cliente: "ACME", processo: "Abertura" },
    state,
  );
  assert.equal(process.client_pj_id, "client-castelo");
  assert.equal(process.cpf_cnpj, "12345678000190");

  for (const stepId of ["license-insert", "process-insert"]) {
    assert.deepEqual(entry(stepId).contract.contextRequirements, [
      "destination:clients.cpf_cnpj",
      "destination:clients.name",
    ]);
  }
});

test("estado runtime resolve lookup Castelo ou deriva modelo e projeto de tarefa", async () => {
  const departmentId = "ae745f66-b01a-51d6-bcbd-2549ac95b2c8";
  const clientId = "1ab9eb8e-b7e0-55e5-8157-bbc247185355";
  const state = buildV2RuntimeState({
    destinationRows: [
      {
        destinationTable: "integracao.tasksModel",
        id: "model-foreign",
        name: "Fechamento",
        department_id: departmentId,
        organization_id: OTHER_ORGANIZATION_ID,
      },
      {
        destinationTable: "integracao.tasksModel",
        id: "model-castelo",
        name: "Fechamento",
        department_id: departmentId,
        organization_id: CASTELO_ORGANIZATION_ID,
      },
      {
        destinationTable: "integracao.projects",
        id: "project-castelo",
        client_id: clientId,
        organization_id: CASTELO_ORGANIZATION_ID,
      },
    ],
  });
  const row = {
    id: 5,
    nome: "Fechamento",
    cliente_id: 12,
    departamento_id: 7,
    responsavel_id: 9,
  };

  assert.deepEqual(state.resolveTaskModel(row), { ids: ["model-castelo"], resolution: "one" });
  assert.deepEqual(state.resolveTaskProject(row), {
    ids: ["project-castelo"],
    resolution: "one",
  });

  const task = await entry("task-insert").projector(
    prepared("task-insert", "integracao.tasks"),
    row,
    state,
  );
  assert.equal(task.model_id, "model-castelo");
  assert.equal(task.project_id, "project-castelo");

  const emptyState = buildV2RuntimeState();
  const derivedModel = await entry("task-model-derived").projector(
    prepared("task-model-derived", "integracao.tasksModel"),
    row,
    emptyState,
  );
  assert.equal(derivedModel.id, "0f5ae3aa-282a-5a91-830b-23fce46c3b69");
  const derivedTask = await entry("task-insert").projector(
    prepared("task-insert", "integracao.tasks"),
    row,
    emptyState,
  );
  assert.equal(derivedTask.model_id, derivedModel.id);
  assert.notEqual(derivedTask.project_id, null);
});

test("resolvers usam o lookupDestination de menor privilégio injetado pelo kernel", () => {
  const baseState = buildV2RuntimeState();
  const calls = [];
  const kernelContext = {
    ...baseState,
    lookupDestination(requirement, value) {
      calls.push([requirement, value]);
      if (requirement === "destination:integracao.tasksModel.name") return ["model-castelo"];
      if (requirement === "destination:integracao.tasksModel.department_id") {
        return ["model-castelo"];
      }
      if (requirement === "destination:integracao.projects.client_id") {
        return ["project-castelo"];
      }
      return [];
    },
  };
  const row = { id: 5, nome: "Fechamento", cliente_id: 12, departamento_id: 7 };

  assert.deepEqual(kernelContext.resolveTaskModel(row), {
    ids: ["model-castelo"],
    resolution: "one",
  });
  assert.deepEqual(kernelContext.resolveTaskProject(row), {
    ids: ["project-castelo"],
    resolution: "one",
  });
  assert.deepEqual(
    calls.map(([requirement]) => requirement),
    [
      "destination:integracao.tasksModel.name",
      "destination:integracao.tasksModel.department_id",
      "destination:integracao.projects.client_id",
    ],
  );

  for (const runtimeEntry of V2_EXECUTION_ENTRIES.filter(
    ({ sourceTable }) => sourceTable === "tb_integracao.tarefas",
  )) {
    assert.deepEqual(runtimeEntry.contract.contextRequirements, [
      "destination:integracao.tasksModel.name",
      "destination:integracao.tasksModel.department_id",
      "destination:integracao.projects.client_id",
    ]);
  }
});

test("estado runtime retém somente índices mínimos e não observa mutação posterior dos candidatos", () => {
  const candidate = {
    destinationTable: "integracao.tasksModel",
    id: "model-castelo",
    name: "Fechamento",
    department_id: "ae745f66-b01a-51d6-bcbd-2549ac95b2c8",
    organization_id: CASTELO_ORGANIZATION_ID,
  };
  const state = buildV2RuntimeState({ destinationRows: [candidate] });
  candidate.name = "MUTATED_SENTINEL";

  assert.deepEqual(state.resolveTaskModel({ nome: "Fechamento", departamento_id: 7 }), {
    ids: ["model-castelo"],
    resolution: "one",
  });
  assert.deepEqual(state.resolveTaskModel({ nome: "MUTATED_SENTINEL", departamento_id: 7 }), {
    ids: [],
    resolution: "zero",
  });
});

test("agregado de sócios produz o JSON permitido em ordem determinística", async () => {
  const state = buildV2RuntimeState();
  const aggregateEntry = entry("guidance-partners-aggregate");
  const payload = await aggregateEntry.projector(
    prepared("guidance-partners-aggregate", "regularize.proceduralGuidances"),
    [
      { id: 9, op_id: 21, nome: "Segundo", porcent: "40,5", cpf: "222.222.222-22", cargo: "Sócio" },
      {
        id: 3,
        op_id: 21,
        nome: "Primeiro",
        porcent: "59,5",
        cpf: "111.111.111-11",
        cargo: "Administrador",
      },
    ],
    state,
  );

  assert.deepEqual(payload, {
    partners: [
      {
        id: "9c1e1f53-0cd5-5cb8-8c99-7defd6d0a322",
        name: "Primeiro",
        share: 59.5,
        cpf: "11111111111",
        role: "Administrador",
      },
      {
        id: "f10e9a07-c634-57c8-832e-dbad30da4bba",
        name: "Segundo",
        share: 40.5,
        cpf: "22222222222",
        role: "Sócio",
      },
    ],
  });
});

test("dez slots de credencial geram identidades distintas e criptografam login e senha", async () => {
  const encryptedFields = [];
  const state = buildV2RuntimeState({
    credentialEncryptionVerified: true,
    encryptCredential: async (_value, metadata) => {
      encryptedFields.push(`${metadata.stepId}:${metadata.destinationColumn}`);
      return ENCRYPTED_CREDENTIAL_FIXTURE;
    },
  });
  const row = {
    id: 41,
    empresa: 31,
    responsavel: "LOGIN_SENTINEL",
    gov: "GOV_SENTINEL",
    regularize: "REGULARIZE_SENTINEL",
    acesso_simples: "SIMPLES_SENTINEL",
    bacen_usuario: "BACEN_USER_SENTINEL",
    bacen_senha: "BACEN_PASSWORD_SENTINEL",
    MEI: "MEI_SENTINEL",
    inscricao_estadual: "SEFAZ_USER_SENTINEL",
    sefaz: "SEFAZ_PASSWORD_SENTINEL",
    webiss_master: "WEBISS_MASTER_SENTINEL",
    webiss_usuario_cpf: "WEBISS_ONE_USER_SENTINEL",
    webiss_cpf: "WEBISS_ONE_PASSWORD_SENTINEL",
    webiss_usuario_cpf_dois: "WEBISS_TWO_USER_SENTINEL",
    webiss_cpf_dois: "WEBISS_TWO_PASSWORD_SENTINEL",
    seifsa_usuario: "SEIFSA_USER_SENTINEL",
    seifsa_senha: "SEIFSA_PASSWORD_SENTINEL",
  };
  const credentialEntries = V2_EXECUTION_ENTRIES.filter(({ stepId }) =>
    stepId.startsWith("credential-slot-"),
  );
  assert.equal(credentialEntries.length, REGULARIZE_CREDENTIAL_SLOTS.length);

  const payloads = await Promise.all(
    credentialEntries.map((runtimeEntry) =>
      runtimeEntry.projector(
        prepared(runtimeEntry.stepId, runtimeEntry.destinationTable),
        row,
        state,
      ),
    ),
  );
  assert.equal(new Set(payloads.map(({ id }) => id)).size, 10);
  assert.ok(
    payloads.every(
      ({ login, password }) =>
        login === ENCRYPTED_CREDENTIAL_FIXTURE && password === ENCRYPTED_CREDENTIAL_FIXTURE,
    ),
  );
  assert.equal(encryptedFields.length, 20);
  assert.doesNotMatch(JSON.stringify(payloads), /SENTINEL/);
});
