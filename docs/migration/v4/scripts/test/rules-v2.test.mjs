import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";

import { validateMappingRule } from "../lib/mapping-contract.mjs";
import { loadPrismaCatalog } from "../lib/prisma-catalog.mjs";
import { inspectSqlDump } from "../lib/sql-dump-parser.mjs";
import { buildRuleRegistry, V2_RULES } from "../rules/index.mjs";

const LEGACY_DUMP_ROOT = "/home/bruno/Documents/03.08.2026";

const DIRECT_TOPOLOGIES = {
  "tb_admin.departamentos": "departments",
  "tb_admin.usuarios": "users",
  "tb_integracao.clientes": "clients",
  "tb_integracao.tarefas_express": "integracao.tasksModel",
  "tb_integracao.planos": "integracao.projectPlan",
  "tb_integracao.tarefas_planos": "integracao.projectPlanTasks",
  "tb_regularize.alvaras": "regularize.license",
  "tb_regularize.processos": "regularize.process",
  "tb_regularize.taxas_municipais": "regularize.municipalTaxes",
};

function rule(sourceTable) {
  const found = buildRuleRegistry().get(sourceTable);
  assert.ok(found, `regra ausente: ${sourceTable}`);
  return found;
}

function step(mappingRule, stepId) {
  const found = mappingRule.destinations.find((candidate) => candidate.stepId === stepId);
  assert.ok(found, `passo ausente: ${mappingRule.sourceTable}.${stepId}`);
  return found;
}

function byStep(emissions, stepId) {
  return emissions.filter((emission) => emission.stepId === stepId);
}

function assertNoPreparedUnknown(emissions, label) {
  for (const decision of emissions) {
    if (decision.status === "prepared") {
      assert.doesNotMatch(decision.identityRef, /(?:^|:)unknown(?:$|:)/, label);
    }
  }
}

test("registro V2 contém 16 regras semanticamente confirmadas, sem marcadores draft", () => {
  const registry = buildRuleRegistry();

  assert.equal(registry.size, 16);
  assert.equal(V2_RULES.length, 16);
  for (const mappingRule of registry.values()) {
    assert.equal(mappingRule.status, "confirmed");
    assert.match(mappingRule.ruleOrigin, /^v2:tb_/);
    assert.doesNotMatch(JSON.stringify(mappingRule.evidence), /draft|task 3|portad[ao]/i);
    assert.equal(typeof mappingRule.classifySourceRow, "function");
    assert.equal(typeof mappingRule.emitRows, "function");
  }
});

test("as nove topologias diretas usam inserts nos destinos atuais comprovados", () => {
  for (const [sourceTable, destinationTable] of Object.entries(DIRECT_TOPOLOGIES)) {
    const mappingRule = rule(sourceTable);
    assert.equal(mappingRule.cardinality, "1:1", sourceTable);
    assert.equal(mappingRule.destinations.length, 1, sourceTable);
    assert.equal(mappingRule.destinations[0].mode, "insert", sourceTable);
    assert.equal(mappingRule.destinations[0].destinationTable, destinationTable, sourceTable);
  }
});

test("as nove topologias diretas colocam identidade ausente ou inválida em quarantine", () => {
  for (const sourceTable of Object.keys(DIRECT_TOPOLOGIES)) {
    const mappingRule = rule(sourceTable);
    for (const id of [undefined, "", "id inválido", 0]) {
      const classification = mappingRule.classifySourceRow({ id, password: "legacy-password" }, {});
      assert.equal(classification.status, "quarantine", `${sourceTable}:${String(id)}`);
      const [decision] = mappingRule.emitRows({ id, password: "legacy-password" }, {});
      assert.equal(decision.status, "quarantine", `${sourceTable}:${String(id)}`);
      assert.equal(decision.field, "id", sourceTable);
      assert.equal(decision.reasonCode, "SOURCE_IDENTITY_INVALID", sourceTable);
      assert.doesNotMatch(decision.identityRef, /:unknown$/, sourceTable);
    }
  }
});

test("adaptações não preparam emissão quando a identidade exigida está ausente ou inválida", () => {
  const collaborator = rule("tb_rh.colaboradores").emitRows({ id: 1, user_id: "id inválido" }, {});
  assert.equal(collaborator[0].status, "quarantine");
  assert.equal(collaborator[0].reasonCode, "USER_LINK_INVALID");

  const regularizeInvalidLink = rule("tb_regularize.clientes").emitRows(
    { codigo: 1, cliente_id: "id inválido" },
    {},
  );
  assert.equal(byStep(regularizeInvalidLink, "regularize-client-merge")[0].status, "quarantine");
  assert.equal(byStep(regularizeInvalidLink, "regularize-client-insert")[0].status, "not_emitted");
  const regularizeMissingCode = rule("tb_regularize.clientes").emitRows(
    { codigo: "", cliente_id: "0" },
    {},
  );
  assert.equal(
    byStep(regularizeMissingCode, "regularize-client-insert")[0].reasonCode,
    "REGULARIZE_CLIENT_IDENTITY_INVALID",
  );

  const prospectInvalidClient = rule("tb_integracao.prospeccao_comercial").emitRows(
    { id: 1, cliente_id: "id inválido" },
    {},
  );
  assert.ok(prospectInvalidClient.every(({ status }) => status === "quarantine"));
  const prospectMissingId = rule("tb_integracao.prospeccao_comercial").emitRows(
    { id: "", cliente_id: 2 },
    {},
  );
  assert.equal(byStep(prospectMissingId, "prospecting-client-merge")[0].status, "prepared");
  assert.equal(
    byStep(prospectMissingId, "prospecting-project-insert")[0].reasonCode,
    "PROSPECTING_IDENTITY_INVALID",
  );

  const taskMissingId = rule("tb_integracao.tarefas").emitRows(
    { id: "", cliente_id: 2, nome: "Tarefa" },
    { taskModelResolution: "one", projectResolution: "one" },
  );
  assert.ok(taskMissingId.every(({ status }) => status !== "prepared"));

  const guidanceMissingId = rule("tb_regularize.orientaoes_processual").emitRows(
    { id: "", processo_id: 2 },
    { processResolution: "one" },
  );
  assert.ok(guidanceMissingId.every(({ status }) => status !== "prepared"));

  const credentialsMissingId = rule("tb_regularize.clientes_senhas").emitRows(
    { id: "", empresa: 2, responsavel: "login", gov: "password" },
    { credentialEncryptionVerified: true },
  );
  assert.equal(
    credentialsMissingId.filter(
      ({ destinationTable, status }) =>
        destinationTable === "regularize.passowordsSites" && status === "prepared",
    ).length,
    1,
  );
  assert.equal(
    credentialsMissingId.find(
      ({ destinationTable }) => destinationTable === "regularize.passwordsRegularize",
    ).reasonCode,
    "CREDENTIAL_SOURCE_IDENTITY_INVALID",
  );
  const credentialsMissingClient = rule("tb_regularize.clientes_senhas").emitRows(
    { id: 1, empresa: "", responsavel: "login", gov: "password" },
    { credentialEncryptionVerified: true },
  );
  assert.equal(
    credentialsMissingClient.find(
      ({ destinationTable }) => destinationTable === "regularize.passwordsRegularize",
    ).reasonCode,
    "CREDENTIAL_CLIENT_LINK_INVALID",
  );

  for (const [label, emissions] of [
    ["collaborator", collaborator],
    ["regularize-invalid-link", regularizeInvalidLink],
    ["regularize-missing-code", regularizeMissingCode],
    ["prospect-invalid-client", prospectInvalidClient],
    ["prospect-missing-id", prospectMissingId],
    ["task-missing-id", taskMissingId],
    ["guidance-missing-id", guidanceMissingId],
    ["credentials-missing-id", credentialsMissingId],
    ["credentials-missing-client", credentialsMissingClient],
  ]) {
    assertNoPreparedUnknown(emissions, label);
  }
});

test("todas as regras V2 são válidas contra o catálogo Prisma atual", async () => {
  const catalog = await loadPrismaCatalog("infra/prisma/schema.prisma");

  for (const mappingRule of V2_RULES) {
    assert.equal(validateMappingRule(mappingRule, catalog), true, mappingRule.sourceTable);
  }
});

test("toda coluna real dos 16 dumps termina mapped ou not_preserved com razão objetiva", async () => {
  for (const mappingRule of V2_RULES) {
    const inspection = await inspectSqlDump(
      path.join(LEGACY_DUMP_ROOT, `${mappingRule.sourceTable}.sql`),
      { relativeTo: LEGACY_DUMP_ROOT },
    );
    const expected = inspection.columns;
    assert.equal(inspection.sourceTable, mappingRule.sourceTable);
    assert.ok(expected.length > 0, mappingRule.sourceTable);
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
        assert.ok(column.reason.length >= 20, `${mappingRule.sourceTable}.${column.sourceColumn}`);
        if (column.status === "not_preserved") {
          assert.equal(column.destinationColumn, null);
          assert.doesNotMatch(column.reason, /pendente|draft|revis[aã]o futura/i);
        }
      }
    }

    assert.deepEqual([...classified].sort(), [...expected].sort(), mappingRule.sourceTable);
  }
});

test("defaults necessários do contrato atual ficam explícitos nos passos V2", () => {
  const expectedDefaults = new Map([
    ["department-insert", { status: "Ativo", solution: false }],
    ["user-insert", { permission: 0, session_version: 0 }],
    ["integration-client-insert", { type: "PJ", prospecting_status: "Migrado do legado" }],
    ["task-model-insert", { billing: "0", prevision: 0 }],
    ["project-plan-insert", { color: "#64748b" }],
    ["project-plan-task-insert", { order: 0 }],
    ["license-insert", { due_date: null, task_id: null }],
    ["process-insert", { expected_date: null, client_pf_id: null }],
    ["municipal-tax-insert", { tll_is_applicable: false, tll_amount: 0 }],
  ]);

  const stepsById = new Map(
    V2_RULES.flatMap((mappingRule) =>
      mappingRule.destinations.map((destination) => [destination.stepId, destination]),
    ),
  );
  for (const [stepId, defaults] of expectedDefaults) {
    const destination = stepsById.get(stepId);
    assert.ok(destination, stepId);
    for (const [field, value] of Object.entries(defaults)) {
      assert.deepEqual(destination.defaults[field], value, `${stepId}.${field}`);
    }
  }
});

test("usuário preserva bcrypt, transforma plaintext e quarentena somente senha vazia sem expor valor", () => {
  const mappingRule = rule("tb_admin.usuarios");
  const passwordRules = mappingRule.destinations[0].columns.filter(
    ({ sourceColumn, destinationColumn }) =>
      sourceColumn === "password" && destinationColumn === "password",
  );
  assert.equal(passwordRules.length, 1);
  assert.equal(passwordRules[0].transformation, "select_bcrypt_migration_strategy");

  const bcrypt = "$2b$12$01234567890123456789012345678901234567890123456789012";
  assert.deepEqual(mappingRule.classifySourceRow({ id: 1, password: bcrypt }, {}), {
    status: "prepared",
    selectedTransformation: "bcrypt_passthrough_if_valid",
  });
  assert.equal(mappingRule.emitRows({ id: 1, password: bcrypt }, {})[0].status, "prepared");

  const legacyPlaintext = "SENTINEL_LEGACY_PASSWORD";
  const plaintextClassification = mappingRule.classifySourceRow(
    { id: 2, password: legacyPlaintext },
    {},
  );
  assert.deepEqual(plaintextClassification, {
    status: "prepared",
    selectedTransformation: "bcrypt_hash_legacy_plaintext",
  });
  const plaintextEmissions = mappingRule.emitRows({ id: 2, password: legacyPlaintext }, {});
  assert.equal(plaintextEmissions[0].status, "prepared");
  assert.doesNotMatch(JSON.stringify(plaintextClassification), new RegExp(legacyPlaintext));
  assert.doesNotMatch(JSON.stringify(plaintextEmissions), new RegExp(legacyPlaintext));
  assert.doesNotMatch(JSON.stringify(mappingRule.evidence), new RegExp(legacyPlaintext));

  assert.deepEqual(mappingRule.classifySourceRow({ id: 3, password: "   " }, {}), {
    status: "quarantine",
    field: "password",
    reasonCode: "USER_PASSWORD_EMPTY",
  });
  const emptyEmission = mappingRule.emitRows({ id: 3, password: "   " }, {})[0];
  assert.equal(emptyEmission.status, "quarantine");
  assert.equal(emptyEmission.field, "password");
  assert.equal(emptyEmission.reasonCode, "USER_PASSWORD_EMPTY");
});

test("colaborador faz merge somente no User administrativo ligado por user_id", () => {
  const mappingRule = rule("tb_rh.colaboradores");
  assert.equal(mappingRule.cardinality, "N:1");
  assert.deepEqual(
    mappingRule.destinations.map(({ destinationTable, mode }) => [destinationTable, mode]),
    [
      ["users", "merge"],
      ["users", "merge"],
    ],
  );
  assert.ok(mappingRule.dependencies.includes("tb_rh.cargos"));
  for (const destination of mappingRule.destinations) {
    assert.deepEqual(destination.identity, {
      kind: "resolve",
      sourceTable: "tb_admin.usuarios",
      sourceColumn: "user_id",
      targetLegacyColumn: "id",
    });
  }

  const profile = step(mappingRule, "collaborator-user-merge");
  const jobTitle = step(mappingRule, "collaborator-job-title-merge");
  assert.equal(
    profile.columns.some(
      ({ sourceColumn, destinationColumn }) =>
        sourceColumn === "cargo" || destinationColumn === "job_title",
    ),
    false,
  );
  assert.ok(jobTitle.dependencies.includes("tb_rh.cargos"));
  assert.deepEqual(
    jobTitle.columns.map(({ sourceColumn, destinationColumn, transformation, referenceRole }) => ({
      sourceColumn,
      destinationColumn,
      transformation,
      referenceRole,
    })),
    [
      {
        sourceColumn: "cargo",
        destinationColumn: "job_title",
        transformation: "resolve_legacy_cargo_name",
        referenceRole: "lookup_key",
      },
    ],
  );
  assert.doesNotMatch(jobTitle.columns[0].transformation, /normalize_text|copy|numeric/i);

  const resolved = mappingRule.emitRows(
    { id: 4, user_id: 9, cargo: 7 },
    { cargoResolution: "one", cargoResolvedName: "Analista" },
  );
  assert.equal(byStep(resolved, "collaborator-user-merge")[0].status, "prepared");
  assert.equal(byStep(resolved, "collaborator-job-title-merge")[0].status, "prepared");
  assert.doesNotMatch(JSON.stringify(resolved), /Analista|"cargo"\s*:\s*7/);
  assert.deepEqual(
    mappingRule.classifySourceRow(
      { id: 4, user_id: 9, cargo: 7 },
      { cargoResolution: "one", cargoResolvedName: "Analista" },
    ),
    { status: "prepared", jobTitleDecision: { status: "prepared" } },
  );

  for (const cargo of ["", "0", 0, null]) {
    const withoutCargo = mappingRule.emitRows({ id: 4, user_id: 9, cargo }, {});
    assert.equal(byStep(withoutCargo, "collaborator-user-merge")[0].status, "prepared");
    assert.equal(byStep(withoutCargo, "collaborator-job-title-merge")[0].status, "not_emitted");
    assert.equal(
      byStep(withoutCargo, "collaborator-job-title-merge")[0].reasonCode,
      "COLLABORATOR_CARGO_EMPTY_NO_JOB_TITLE",
    );
  }

  for (const [cargoResolution, reasonCode] of [
    ["not_executed", "COLLABORATOR_CARGO_LOOKUP_NOT_EXECUTED"],
    ["zero", "COLLABORATOR_CARGO_NOT_FOUND"],
    ["many", "COLLABORATOR_CARGO_AMBIGUOUS"],
  ]) {
    const unresolved = mappingRule.emitRows({ id: 4, user_id: 9, cargo: 7 }, { cargoResolution });
    assert.equal(byStep(unresolved, "collaborator-user-merge")[0].status, "prepared");
    assert.equal(byStep(unresolved, "collaborator-job-title-merge")[0].status, "quarantine");
    assert.equal(byStep(unresolved, "collaborator-job-title-merge")[0].reasonCode, reasonCode);
  }

  for (const cargoResolvedName of [7, "7"]) {
    const numericName = mappingRule.emitRows(
      { id: 4, user_id: 9, cargo: 7 },
      { cargoResolution: "one", cargoResolvedName },
    );
    assert.equal(
      byStep(numericName, "collaborator-job-title-merge")[0].reasonCode,
      "COLLABORATOR_CARGO_NAME_INVALID",
    );
  }

  const malformedCargo = mappingRule.emitRows(
    { id: 4, user_id: 9, cargo: "cargo inválido" },
    { cargoResolution: "one", cargoResolvedName: "Analista" },
  );
  assert.equal(
    byStep(malformedCargo, "collaborator-job-title-merge")[0].reasonCode,
    "COLLABORATOR_CARGO_LINK_INVALID",
  );

  const invalidUser = mappingRule.emitRows({ id: 4, user_id: "", cargo: 7 }, {});
  assert.ok(invalidUser.every(({ status }) => status === "quarantine"));
  assert.ok(invalidUser.every(({ reasonCode }) => reasonCode === "USER_LINK_EMPTY"));
});

test("cliente Regularize faz merge pelo cliente_id explícito ou insert próprio sem vínculo", () => {
  const mappingRule = rule("tb_regularize.clientes");
  assert.deepEqual(
    mappingRule.destinations.map(({ destinationTable, mode }) => [destinationTable, mode]),
    [
      ["clients", "merge"],
      ["clients", "insert"],
    ],
  );
  assert.equal(mappingRule.destinations[0].identity.sourceTable, "tb_integracao.clientes");

  const linked = mappingRule.emitRows({ codigo: 12, cliente_id: 55 }, {});
  assert.equal(byStep(linked, "regularize-client-merge")[0].status, "prepared");
  assert.equal(byStep(linked, "regularize-client-insert")[0].status, "not_emitted");

  const standalone = mappingRule.emitRows({ codigo: 12, cliente_id: "0" }, {});
  assert.equal(byStep(standalone, "regularize-client-merge")[0].status, "not_emitted");
  assert.equal(byStep(standalone, "regularize-client-insert")[0].status, "prepared");
});

test("prospecção divide faceta comercial de clients e projeto sem perder cliente_id", () => {
  const mappingRule = rule("tb_integracao.prospeccao_comercial");
  assert.deepEqual(
    mappingRule.destinations.map(({ destinationTable, mode }) => [destinationTable, mode]),
    [
      ["clients", "merge"],
      ["integracao.projects", "insert"],
    ],
  );
  assert.equal(mappingRule.destinations[0].identity.sourceColumn, "cliente_id");
  assert.ok(
    mappingRule.destinations[1].columns.some(
      ({ sourceColumn, destinationColumn }) =>
        sourceColumn === "cliente_id" && destinationColumn === "client_id",
    ),
  );
  assert.deepEqual(
    mappingRule.emitRows({ id: 7, cliente_id: 8 }, {}).map(({ status }) => status),
    ["prepared", "prepared"],
  );
});

test("tarefa resolve ou deriva modelo e projeto antes do insert preservando client_id", () => {
  const mappingRule = rule("tb_integracao.tarefas");
  assert.deepEqual(
    mappingRule.destinations.map(({ destinationTable, mode }) => [destinationTable, mode]),
    [
      ["integracao.tasksModel", "lookup"],
      ["integracao.tasksModel", "derived"],
      ["integracao.projects", "lookup"],
      ["integracao.projects", "derived"],
      ["integracao.tasks", "insert"],
    ],
  );
  assert.ok(
    step(mappingRule, "task-insert").columns.some(
      ({ sourceColumn, destinationColumn }) =>
        sourceColumn === "cliente_id" && destinationColumn === "client_id",
    ),
  );

  const resolved = mappingRule.emitRows(
    { id: 5, nome: "Rotina", cliente_id: 6 },
    { taskModelResolution: "one", projectResolution: "one" },
  );
  assert.equal(byStep(resolved, "task-model-lookup")[0].status, "prepared");
  assert.equal(byStep(resolved, "task-model-derived")[0].status, "not_emitted");
  assert.equal(byStep(resolved, "task-project-lookup")[0].status, "prepared");
  assert.equal(byStep(resolved, "task-project-derived")[0].status, "not_emitted");
  assert.equal(byStep(resolved, "task-insert")[0].status, "prepared");

  const derived = mappingRule.emitRows(
    { id: 5, nome: "Avulsa", cliente_id: 6 },
    { taskModelResolution: "zero", projectResolution: "zero" },
  );
  assert.equal(byStep(derived, "task-model-lookup")[0].status, "not_emitted");
  assert.equal(byStep(derived, "task-model-derived")[0].status, "prepared");
  assert.equal(byStep(derived, "task-project-lookup")[0].status, "not_emitted");
  assert.equal(byStep(derived, "task-project-derived")[0].status, "prepared");
  assert.equal(byStep(derived, "task-insert")[0].status, "prepared");

  const notExecuted = mappingRule.emitRows({ id: 5, nome: "Avulsa", cliente_id: 6 }, {});
  assert.equal(
    byStep(notExecuted, "task-model-lookup")[0].reasonCode,
    "TASK_MODEL_LOOKUP_NOT_EXECUTED",
  );
  assert.equal(byStep(notExecuted, "task-model-derived")[0].status, "not_emitted");
  assert.equal(
    byStep(notExecuted, "task-project-lookup")[0].reasonCode,
    "TASK_PROJECT_LOOKUP_NOT_EXECUTED",
  );
  assert.equal(byStep(notExecuted, "task-project-derived")[0].status, "not_emitted");
  assert.equal(byStep(notExecuted, "task-insert")[0].status, "quarantine");

  const modelMany = mappingRule.emitRows(
    { id: 5, nome: "Ambígua", cliente_id: 6 },
    { taskModelResolution: "many", projectResolution: "one" },
  );
  assert.equal(byStep(modelMany, "task-model-lookup")[0].reasonCode, "TASK_MODEL_AMBIGUOUS");
  assert.equal(byStep(modelMany, "task-model-derived")[0].status, "not_emitted");
  assert.equal(byStep(modelMany, "task-insert")[0].status, "quarantine");

  const projectMany = mappingRule.emitRows(
    { id: 5, nome: "Ambígua", cliente_id: 6 },
    { taskModelResolution: "one", projectResolution: "many" },
  );
  assert.equal(byStep(projectMany, "task-project-lookup")[0].reasonCode, "TASK_PROJECT_AMBIGUOUS");
  assert.equal(byStep(projectMany, "task-project-derived")[0].status, "not_emitted");
  assert.equal(byStep(projectMany, "task-insert")[0].status, "quarantine");

  const mixed = mappingRule.emitRows(
    { id: 5, nome: "Mista", cliente_id: 6 },
    { taskModelResolution: "one", projectResolution: "zero" },
  );
  assert.equal(byStep(mixed, "task-model-lookup")[0].status, "prepared");
  assert.equal(byStep(mixed, "task-project-derived")[0].status, "prepared");
  assert.equal(byStep(mixed, "task-insert")[0].status, "prepared");
});

test("orientação resolve processo legado ou deriva processo técnico antes da orientação", () => {
  const mappingRule = rule("tb_regularize.orientaoes_processual");
  assert.deepEqual(
    mappingRule.destinations.map(({ destinationTable, mode }) => [destinationTable, mode]),
    [
      ["regularize.process", "lookup"],
      ["regularize.process", "derived"],
      ["regularize.proceduralGuidances", "insert"],
    ],
  );

  const linked = mappingRule.emitRows({ id: 10, processo_id: 20 }, { processResolution: "one" });
  assert.equal(byStep(linked, "guidance-process-lookup")[0].status, "prepared");
  assert.equal(byStep(linked, "guidance-process-derived")[0].status, "not_emitted");
  assert.equal(byStep(linked, "guidance-insert")[0].status, "prepared");

  for (const [processResolution, reasonCode] of [
    ["not_executed", "GUIDANCE_PROCESS_LOOKUP_NOT_EXECUTED"],
    ["zero", "GUIDANCE_PROCESS_NOT_FOUND"],
    ["many", "GUIDANCE_PROCESS_AMBIGUOUS"],
  ]) {
    const unresolved = mappingRule.emitRows({ id: 10, processo_id: 20 }, { processResolution });
    assert.equal(byStep(unresolved, "guidance-process-lookup")[0].status, "quarantine");
    assert.equal(byStep(unresolved, "guidance-process-lookup")[0].reasonCode, reasonCode);
    assert.equal(byStep(unresolved, "guidance-process-derived")[0].status, "not_emitted");
    assert.equal(byStep(unresolved, "guidance-insert")[0].status, "quarantine");
  }

  const implicitNotExecuted = mappingRule.emitRows({ id: 10, processo_id: 20 }, {});
  assert.equal(
    byStep(implicitNotExecuted, "guidance-process-lookup")[0].reasonCode,
    "GUIDANCE_PROCESS_LOOKUP_NOT_EXECUTED",
  );

  const invalidLink = mappingRule.emitRows({ id: 10, processo_id: "id inválido" }, {});
  assert.equal(
    byStep(invalidLink, "guidance-process-lookup")[0].reasonCode,
    "GUIDANCE_PROCESS_LINK_INVALID",
  );
  assert.equal(byStep(invalidLink, "guidance-process-derived")[0].status, "not_emitted");
  assert.equal(byStep(invalidLink, "guidance-insert")[0].status, "quarantine");

  const autonomous = mappingRule.emitRows({ id: 10, processo_id: "0" }, {});
  assert.equal(byStep(autonomous, "guidance-process-lookup")[0].status, "not_emitted");
  assert.equal(byStep(autonomous, "guidance-process-derived")[0].status, "prepared");
  assert.equal(byStep(autonomous, "guidance-insert")[0].status, "prepared");
});

test("sócios agregam exclusivamente no JSON proceduralGuidances.partners", () => {
  const mappingRule = rule("tb_regularize.orientaoes_processual.socios");

  assert.equal(mappingRule.cardinality, "N:1");
  assert.deepEqual(
    mappingRule.destinations.map(({ destinationTable, mode }) => [destinationTable, mode]),
    [["regularize.proceduralGuidances", "aggregate"]],
  );
  assert.equal(mappingRule.destinations[0].identity.kind, "aggregate");
  assert.ok(
    mappingRule.destinations[0].columns.some(
      ({ sourceColumn, destinationColumn }) =>
        sourceColumn === "nome" && destinationColumn === "partners",
    ),
  );
  assert.doesNotMatch(JSON.stringify(mappingRule.destinations), /regularize\.partners|clients\.pf/);

  const children = [
    { id: 9, op_id: 21, nome: "SEGUNDO_SENTINEL" },
    { id: 3, op_id: 21, nome: "PRIMEIRO_SENTINEL" },
  ];
  const aggregate = mappingRule.emitRows(children, {});
  assert.deepEqual(
    aggregate.map(({ identityRef }) => identityRef),
    [
      "tb_regularize.orientaoes_processual:21:partner-3",
      "tb_regularize.orientaoes_processual:21:partner-9",
    ],
  );
  assert.ok(aggregate.every(({ status }) => status === "prepared"));
  assert.ok(
    aggregate.every(
      ({ destinationTable }) => destinationTable === "regularize.proceduralGuidances",
    ),
  );
  assert.deepEqual(mappingRule.emitRows([...children].reverse(), {}), aggregate);
  assert.doesNotMatch(JSON.stringify(aggregate), /SENTINEL/);

  const orphan = mappingRule.emitRows({ id: 4, op_id: "" }, {})[0];
  assert.equal(orphan.status, "quarantine");
  assert.equal(orphan.reasonCode, "GUIDANCE_PARTNER_PARENT_EMPTY");
  const missingChildIdentity = mappingRule.emitRows({ id: "", op_id: 21 }, {})[0];
  assert.equal(missingChildIdentity.status, "quarantine");
  assert.equal(missingChildIdentity.reasonCode, "GUIDANCE_PARTNER_IDENTITY_INVALID");
});

test("clientes_senhas expande dez credenciais nos nove sites lógicos com criptografia por emissão", () => {
  const mappingRule = rule("tb_regularize.clientes_senhas");
  const siteDestinations = mappingRule.destinations.filter(
    ({ destinationTable }) => destinationTable === "regularize.passowordsSites",
  );
  const credentialDestinations = mappingRule.destinations.filter(
    ({ destinationTable }) => destinationTable === "regularize.passwordsRegularize",
  );
  assert.equal(siteDestinations.length, 9);
  assert.equal(credentialDestinations.length, 10);
  assert.ok(siteDestinations.every(({ mode }) => mode === "derived"));
  assert.ok(credentialDestinations.every(({ mode }) => mode === "insert"));
  assert.equal(new Set(siteDestinations.map(({ stepId }) => stepId)).size, 9);
  assert.equal(new Set(credentialDestinations.map(({ stepId }) => stepId)).size, 10);
  assert.ok(
    siteDestinations.every(
      ({ identity, constants }) =>
        identity.kind === "generate" &&
        identity.legacyColumn === "organization_id" &&
        constants.organization_id === "e8048d1c-0830-45d7-84de-68e20abd685b",
    ),
  );
  assert.ok(
    credentialDestinations.every(
      ({ identity }) => identity.kind === "generate" && identity.legacyColumn === "id",
    ),
  );

  const credentialColumns = credentialDestinations.flatMap(({ columns }) =>
    columns.filter(
      ({ destinationColumn }) => destinationColumn === "login" || destinationColumn === "password",
    ),
  );
  assert.equal(credentialColumns.length, 20);
  assert.ok(
    credentialColumns.every(({ transformation }) => transformation === "encrypt_credential"),
  );

  const row = {
    id: 1,
    empresa: 2,
    responsavel: "RESPONSAVEL_SENTINEL",
    gov: "GOV_SENTINEL",
    regularize: "REGULARIZE_SENTINEL",
    acesso_simples: "SIMPLES_SENTINEL",
    bacen_usuario: "BACEN_LOGIN_SENTINEL",
    bacen_senha: "BACEN_PASSWORD_SENTINEL",
    MEI: "MEI_SENTINEL",
    inscricao_estadual: "SEFAZ_LOGIN_SENTINEL",
    sefaz: "SEFAZ_PASSWORD_SENTINEL",
    webiss_master: "WEBISS_MASTER_SENTINEL",
    webiss_usuario_cpf: "WEBISS_ONE_LOGIN_SENTINEL",
    webiss_cpf: "WEBISS_ONE_PASSWORD_SENTINEL",
    webiss_usuario_cpf_dois: "WEBISS_TWO_LOGIN_SENTINEL",
    webiss_cpf_dois: "WEBISS_TWO_PASSWORD_SENTINEL",
    seifsa_usuario: "SEIFSA_LOGIN_SENTINEL",
    seifsa_senha: "SEIFSA_PASSWORD_SENTINEL",
  };

  const ready = mappingRule.emitRows(row, { credentialEncryptionVerified: true });
  const readySites = ready.filter(
    ({ destinationTable }) => destinationTable === "regularize.passowordsSites",
  );
  const readyCredentials = ready.filter(
    ({ destinationTable }) => destinationTable === "regularize.passwordsRegularize",
  );
  assert.equal(readySites.length, 9);
  assert.equal(readyCredentials.length, 10);
  assert.ok(readyCredentials.every(({ status }) => status === "prepared"));
  assert.equal(
    readyCredentials.filter(({ stepId }) => /^credential-slot-webiss-cpf-[12]$/.test(stepId))
      .length,
    2,
  );

  const destinationsByStep = new Map(
    mappingRule.destinations.map((destination) => [destination.stepId, destination]),
  );
  const identitySeeds = ready.map((decision) => {
    const destination = destinationsByStep.get(decision.stepId);
    assert.ok(destination, decision.stepId);
    assert.equal(destination.identity.kind, "generate", decision.stepId);
    const legacyValue = Object.hasOwn(destination.constants, destination.identity.legacyColumn)
      ? destination.constants[destination.identity.legacyColumn]
      : row[destination.identity.legacyColumn];
    assert.ok(legacyValue, `${decision.stepId}.${destination.identity.legacyColumn}`);
    const identitySeed = `${destination.identity.scope}:${legacyValue}`;
    assert.equal(decision.identityRef, identitySeed, decision.stepId);
    return identitySeed;
  });
  assert.equal(new Set(identitySeeds).size, 19);

  const secondReady = mappingRule.emitRows(
    { ...row, id: 2 },
    { credentialEncryptionVerified: true },
  );
  assert.deepEqual(
    secondReady
      .filter(({ destinationTable }) => destinationTable === "regularize.passowordsSites")
      .map(({ identityRef }) => identityRef),
    readySites.map(({ identityRef }) => identityRef),
  );
  const firstCredentialIdentities = new Set(readyCredentials.map(({ identityRef }) => identityRef));
  assert.ok(
    secondReady
      .filter(({ destinationTable }) => destinationTable === "regularize.passwordsRegularize")
      .every(({ identityRef }) => !firstCredentialIdentities.has(identityRef)),
  );

  const blocked = mappingRule.emitRows(row, { credentialEncryptionVerified: false });
  const blockedCredentials = blocked.filter(
    ({ destinationTable }) => destinationTable === "regularize.passwordsRegularize",
  );
  assert.equal(blockedCredentials.length, 10);
  assert.ok(blockedCredentials.every(({ status }) => status === "quarantine"));
  assert.ok(
    blockedCredentials.every(({ reasonCode }) => reasonCode === "CREDENTIAL_REQUIRES_ENCRYPTION"),
  );
  assert.doesNotMatch(JSON.stringify(ready), /SENTINEL/);
  assert.doesNotMatch(JSON.stringify(blocked), /SENTINEL/);

  const certificates = credentialDestinations.flatMap(({ columns }) =>
    columns.filter(({ sourceColumn }) =>
      ["certificado_pj", "certificado_pf"].includes(sourceColumn),
    ),
  );
  assert.equal(certificates.length, 2);
  assert.ok(certificates.every(({ status }) => status === "not_preserved"));
});

test("emitRows V2 expõe somente decisões sanitizadas, nunca payload ou valor", () => {
  for (const mappingRule of V2_RULES) {
    const emissions = mappingRule.emitRows(Object.freeze({}), Object.freeze({}));
    assert.equal(Array.isArray(emissions), true, mappingRule.sourceTable);
    for (const emission of emissions) {
      assert.deepEqual(Object.keys(emission).sort(), [
        "destinationTable",
        "field",
        "identityRef",
        "reasonCode",
        "status",
        "stepId",
      ]);
      assert.ok(["prepared", "quarantine", "not_emitted"].includes(emission.status));
      if (emission.status === "prepared") {
        assert.doesNotMatch(emission.identityRef, /(?:^|:)unknown(?:$|:)/);
      }
    }
    assert.doesNotMatch(JSON.stringify(emissions), /"(?:payload|value|passwordValue)"\s*:/i);
  }
});
