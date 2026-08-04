import assert from "node:assert/strict";
import test from "node:test";

import { validateMappingRule } from "../lib/mapping-contract.mjs";
import { loadPrismaCatalog } from "../lib/prisma-catalog.mjs";
import { buildRuleRegistry, V2_RULES } from "../rules/index.mjs";

const SOURCE_COLUMNS = {
  "tb_admin.departamentos": ["id", "nome", "color", "status", "parceiros"],
  "tb_admin.usuarios": [
    "id",
    "user",
    "password",
    "img",
    "nome",
    "cargo",
    "departamento_id",
    "status",
  ],
  "tb_rh.colaboradores": [
    "id",
    "user_id",
    "nome",
    "data_admissao",
    "data_admissao_dominio",
    "data_demissao",
    "genero",
    "data_nascimento",
    "cpf",
    "rg",
    "endereco",
    "cargo",
    "departamento_id",
    "email",
    "telefone",
    "foto",
    "status",
  ],
  "tb_integracao.clientes": [
    "id",
    "nome",
    "nome_fantasia",
    "tipo",
    "cpf_cnpj",
    "dataAbertura",
    "socioAdm",
    "cpf_socio",
    "contato",
    "email",
    "preposto",
    "cpf_preposto",
    "instagram",
    "indicacao",
    "grupo_id",
    "cidade",
    "imagem",
    "tipo_cliente",
    "inicio_contrato",
    "endereco",
    "cep",
    "bairro",
    "estado",
    "complexidade",
  ],
  "tb_regularize.clientes": [
    "codigo",
    "nome",
    "razao_social",
    "nome_fantasia",
    "cpf_cnpj",
    "cnae",
    "responsavel",
    "fone",
    "email",
    "endereco",
    "cep",
    "bairro",
    "estado",
    "municipio",
    "cliente_desde",
    "inscricao_municipal",
    "inscricao_estadual",
    "inscricao_junta_comercial",
    "situacao",
    "cliente_id",
    "competencia_entrada",
    "competencia_saida",
  ],
  "tb_integracao.prospeccao_comercial": [
    "id",
    "cliente_id",
    "servico",
    "solucao",
    "situacao",
    "data_status",
    "status_prospeccao",
    "mes",
    "data_cadastro",
    "participantes",
    "modo_reuniao",
    "data_fechamento",
    "porcentagem",
    "ramo",
  ],
  "tb_integracao.tarefas_express": [
    "id",
    "nome",
    "departamento_id",
    "responsavel_id",
    "responsavel_id_dois",
    "responsavel_id_tres",
    "estado",
    "obs",
    "cobranca",
    "previsao",
  ],
  "tb_integracao.planos": ["id", "nome", "color"],
  "tb_integracao.tarefas_planos": ["id", "tarefa_express_id", "plano_id", "ordem"],
  "tb_integracao.tarefas": [
    "id",
    "cliente_id",
    "nome",
    "estado",
    "departamento_id",
    "responsavel_id",
    "responsavel_id_dois",
    "responsavel_id_tres",
    "realizado",
    "data_previsao",
    "data_resolucao",
    "obs",
    "ano",
    "cobranca",
    "data_cadastro",
    "data_update",
    "urgencia",
    "reuniao",
  ],
  "tb_regularize.alvaras": [
    "id",
    "empresa",
    "cpf_cnpj",
    "tipo_do_alvara",
    "data_de_entrada",
    "protocolo",
    "responsavel",
    "status",
    "data_ultima_consulta",
    "situacao_atual",
    "contato",
    "observacao",
    "urgencia",
    "tipo",
    "protocolo_arquivo",
  ],
  "tb_regularize.processos": [
    "id",
    "cliente",
    "cpf_cnpj",
    "processo",
    "descricao",
    "data_entrada",
    "data_finalizacao",
    "meta",
    "dias_corridos",
    "status",
    "observacao",
    "financeiro",
    "data_env_fiscal",
    "data_ret_fiscal",
    "responsavel_um",
    "responsavel_dois",
    "responsavel_tres",
    "urgencia",
    "tipo",
    "travamento_cliente_notificacao",
  ],
  "tb_regularize.orientaoes_processual": [
    "id",
    "tipo",
    "cliente_id",
    "solicitacao",
    "obs_quadro",
    "natureza_juridica",
    "razao_social",
    "nome_fantasia",
    "cnpj",
    "capital_social",
    "iptu",
    "endereco",
    "obj_social",
    "porte",
    "regime",
    "representante_legal",
    "arquivo",
    "processo_id",
    "status",
  ],
  "tb_regularize.orientaoes_processual.socios": [
    "id",
    "op_id",
    "nome",
    "porcent",
    "prof",
    "civil",
    "rg",
    "cnh",
    "cpf",
    "endereco",
    "cargo",
  ],
  "tb_regularize.taxas_municipais": [
    "id",
    "cliente",
    "ano",
    "tff_possui",
    "tff_valor",
    "tff_obs",
    "tff_analise_feito",
    "tff_analise_obs",
    "tff_envio_data",
    "tff_vencimento",
    "tlp_possui",
    "tlp_obs",
    "tlp_envio",
    "tlp_envio_data",
    "vencimento",
    "email",
  ],
  "tb_regularize.clientes_senhas": [
    "id",
    "empresa",
    "responsavel",
    "acesso_simples",
    "inscricao_estadual",
    "sefaz",
    "regularize",
    "webiss_master",
    "webiss_usuario_cpf",
    "webiss_cpf",
    "webiss_usuario_cpf_dois",
    "webiss_cpf_dois",
    "seifsa_usuario",
    "seifsa_senha",
    "bacen_usuario",
    "bacen_senha",
    "gov",
    "MEI",
    "certificado_pj",
    "certificado_pf",
  ],
};

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

test("todas as regras V2 são válidas contra o catálogo Prisma atual", async () => {
  const catalog = await loadPrismaCatalog("infra/prisma/schema.prisma");

  for (const mappingRule of V2_RULES) {
    assert.equal(validateMappingRule(mappingRule, catalog), true, mappingRule.sourceTable);
  }
});

test("toda coluna real dos 16 dumps termina mapped ou not_preserved com razão objetiva", () => {
  for (const mappingRule of V2_RULES) {
    const expected = SOURCE_COLUMNS[mappingRule.sourceTable];
    assert.ok(expected, mappingRule.sourceTable);
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
  const passwordTransformations = mappingRule.destinations[0].columns
    .filter(
      ({ sourceColumn, destinationColumn }) =>
        sourceColumn === "password" && destinationColumn === "password",
    )
    .map(({ transformation }) => transformation);

  assert.deepEqual(passwordTransformations, [
    "bcrypt_passthrough_if_valid",
    "bcrypt_hash_legacy_plaintext",
  ]);

  const bcrypt = "$2b$12$01234567890123456789012345678901234567890123456789012";
  assert.equal(mappingRule.emitRows({ id: 1, password: bcrypt }, {})[0].status, "prepared");

  const legacyPlaintext = "SENTINEL_LEGACY_PASSWORD";
  const plaintextEmissions = mappingRule.emitRows({ id: 2, password: legacyPlaintext }, {});
  assert.equal(plaintextEmissions[0].status, "prepared");
  assert.doesNotMatch(JSON.stringify(plaintextEmissions), new RegExp(legacyPlaintext));
  assert.doesNotMatch(JSON.stringify(mappingRule.evidence), new RegExp(legacyPlaintext));

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
    [["users", "merge"]],
  );
  assert.deepEqual(mappingRule.destinations[0].identity, {
    kind: "resolve",
    sourceTable: "tb_admin.usuarios",
    sourceColumn: "user_id",
    targetLegacyColumn: "id",
  });

  assert.equal(mappingRule.emitRows({ id: 4, user_id: 9 }, {})[0].status, "prepared");
  assert.equal(mappingRule.emitRows({ id: 4, user_id: "" }, {})[0].reasonCode, "USER_LINK_EMPTY");
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
    { taskModelMatchCount: 1, projectMatchCount: 1 },
  );
  assert.equal(byStep(resolved, "task-model-lookup")[0].status, "prepared");
  assert.equal(byStep(resolved, "task-model-derived")[0].status, "not_emitted");
  assert.equal(byStep(resolved, "task-project-lookup")[0].status, "prepared");
  assert.equal(byStep(resolved, "task-project-derived")[0].status, "not_emitted");
  assert.equal(byStep(resolved, "task-insert")[0].status, "prepared");

  const derived = mappingRule.emitRows({ id: 5, nome: "Avulsa", cliente_id: 6 }, {});
  assert.equal(byStep(derived, "task-model-derived")[0].status, "prepared");
  assert.equal(byStep(derived, "task-project-derived")[0].status, "prepared");
  assert.equal(byStep(derived, "task-insert")[0].status, "prepared");
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

  const linked = mappingRule.emitRows({ id: 10, processo_id: 20 }, {});
  assert.equal(byStep(linked, "guidance-process-lookup")[0].status, "prepared");
  assert.equal(byStep(linked, "guidance-process-derived")[0].status, "not_emitted");
  assert.equal(byStep(linked, "guidance-insert")[0].status, "prepared");

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
});

test("clientes_senhas expande dez credenciais nos nove sites lógicos com criptografia por emissão", () => {
  const mappingRule = rule("tb_regularize.clientes_senhas");
  assert.deepEqual(
    mappingRule.destinations.map(({ destinationTable, mode }) => [destinationTable, mode]),
    [
      ["regularize.passowordsSites", "derived"],
      ["regularize.passwordsRegularize", "insert"],
    ],
  );
  const siteDestination = step(mappingRule, "credential-site-derived");
  assert.equal(siteDestination.identity.kind, "generate");
  assert.deepEqual(siteDestination.defaults, { link: null });
  assert.deepEqual(
    {
      sphere: siteDestination.constants.sphere,
      status: siteDestination.constants.status,
      user: siteDestination.constants.user,
      password: siteDestination.constants.password,
    },
    { sphere: "legacy", status: true, user: "", password: "" },
  );

  const credentialColumns = step(mappingRule, "credential-insert").columns.filter(
    ({ destinationColumn }) => destinationColumn === "login" || destinationColumn === "password",
  );
  assert.ok(credentialColumns.length >= 20);
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
  const readySites = byStep(ready, "credential-site-derived");
  const readyCredentials = byStep(ready, "credential-insert");
  assert.equal(readySites.length, 9);
  assert.equal(readyCredentials.length, 10);
  assert.ok(readyCredentials.every(({ status }) => status === "prepared"));
  assert.equal(
    readyCredentials.filter(({ identityRef }) => /webiss-cpf-[12]$/.test(identityRef)).length,
    2,
  );

  const blocked = mappingRule.emitRows(row, { credentialEncryptionVerified: false });
  const blockedCredentials = byStep(blocked, "credential-insert");
  assert.equal(blockedCredentials.length, 10);
  assert.ok(blockedCredentials.every(({ status }) => status === "quarantine"));
  assert.ok(
    blockedCredentials.every(({ reasonCode }) => reasonCode === "CREDENTIAL_REQUIRES_ENCRYPTION"),
  );
  assert.doesNotMatch(JSON.stringify(ready), /SENTINEL/);
  assert.doesNotMatch(JSON.stringify(blocked), /SENTINEL/);

  const certificates = step(mappingRule, "credential-insert").columns.filter(({ sourceColumn }) =>
    ["certificado_pj", "certificado_pf"].includes(sourceColumn),
  );
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
    }
    assert.doesNotMatch(JSON.stringify(emissions), /"(?:payload|value|passwordValue)"\s*:/i);
  }
});
