import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { REQUIRED_IDENTITY_NAMESPACE, validateMappingRule } from "../lib/mapping-contract.mjs";
import { loadPrismaCatalog } from "../lib/prisma-catalog.mjs";
import { buildRuleRegistry, v2Rules } from "../rules/index.mjs";

const RULE_ORIGIN = "scripts/migration-v2-build-load.mjs";

const expectedRules = [
  {
    source: "tb_admin.departamentos",
    destination: "departments",
    identity: "id",
    dependencies: [],
    columns: [
      ["id", "id"],
      ["nome", "name"],
      ["color", "color"],
      ["status", "status"],
      ["parceiros", "solution"],
    ],
  },
  {
    source: "tb_admin.usuarios",
    destination: "users",
    identity: "id",
    dependencies: ["tb_admin.departamentos"],
    columns: [
      ["id", "id"],
      ["nome", "name"],
      ["user", "login"],
      ["password", "password"],
      ["cargo", "permission"],
      ["status", "status"],
      ["departamento_id", "department_id"],
      ["img", "photo_url"],
      ["nome", "full_name"],
    ],
  },
  {
    source: "tb_rh.colaboradores",
    destination: "users",
    identity: "user_id",
    dependencies: ["tb_admin.usuarios", "tb_admin.departamentos"],
    columns: [
      ["user_id", "id"],
      ["nome", "full_name"],
      ["genero", "gender"],
      ["data_nascimento", "birth_date"],
      ["cpf", "cpf"],
      ["rg", "rg"],
      ["endereco", "address"],
      ["cargo", "job_title"],
      ["email", "email"],
      ["telefone", "phone"],
      ["data_admissao", "hire_date"],
      ["data_demissao", "termination_date"],
      ["status", "status"],
    ],
  },
  {
    source: "tb_integracao.clientes",
    destination: "clients",
    identity: "id",
    dependencies: [],
    columns: [
      ["id", "id"],
      ["nome", "name"],
      ["razao_social", "company_name"],
      ["nome_fantasia", "fantasy_name"],
      ["cpf_cnpj", "cpf_cnpj"],
      ["email", "email"],
      ["fone", "number"],
      ["endereco", "address"],
      ["cep", "cep"],
      ["bairro", "neighborhood"],
      ["estado", "state"],
      ["municipio", "city"],
      ["situacao", "status"],
      ["tipo", "type"],
    ],
  },
  {
    source: "tb_regularize.clientes",
    destination: "clients",
    identity: "codigo",
    dependencies: [],
    columns: [
      ["codigo", "id"],
      ["codigo", "dominio_code"],
      ["razao_social", "name"],
      ["razao_social", "company_name"],
      ["nome_fantasia", "fantasy_name"],
      ["cnpj", "cpf_cnpj"],
      ["responsavel", "responsible"],
      ["contato", "number"],
      ["email", "email"],
      ["endereco", "address"],
      ["cep", "cep"],
      ["bairro", "neighborhood"],
      ["cidade", "city"],
      ["inicio_contrato", "customer_since"],
      ["inscricao_municipal", "municipal_registration"],
      ["inscricao_estadual", "state_registration"],
      ["tipo_cliente", "status"],
    ],
  },
  {
    source: "tb_integracao.prospeccao_comercial",
    destination: "integracao.projects",
    identity: "id",
    dependencies: ["tb_integracao.clientes"],
    columns: [
      ["id", "id"],
      ["servico", "name"],
      ["cliente_id", "client_id"],
      ["situacao", "status"],
      ["data_cadastro", "start_date"],
      ["data_fechamento", "end_date"],
      ["data_status", "end_date"],
      ["solucao", "objective"],
      ["status_prospeccao", "objective"],
      ["porcentagem", "porcentage"],
    ],
  },
  {
    source: "tb_integracao.tarefas_express",
    destination: "integracao.tasksModel",
    identity: "id",
    dependencies: ["tb_admin.departamentos", "tb_admin.usuarios"],
    columns: [
      ["id", "id"],
      ["nome", "name"],
      ["departamento_id", "department_id"],
      ["responsavel_id", "responsible_id"],
      ["responsavel_id_dois", "responsible2_id"],
      ["responsavel_id_tres", "responsible3_id"],
      ["obs", "observations"],
      ["cobranca", "billing"],
      ["previsao", "prevision"],
    ],
  },
  {
    source: "tb_integracao.planos",
    destination: "integracao.projectPlan",
    identity: "id",
    dependencies: [],
    columns: [
      ["id", "id"],
      ["nome", "name"],
      ["color", "color"],
    ],
  },
  {
    source: "tb_integracao.tarefas_planos",
    destination: "integracao.projectPlanTasks",
    identity: "id",
    dependencies: ["tb_integracao.planos", "tb_integracao.tarefas_express"],
    columns: [
      ["id", "id"],
      ["plano_id", "plan_id"],
      ["tarefa_express_id", "task_id"],
      ["ordem", "order"],
    ],
  },
  {
    source: "tb_integracao.tarefas",
    destination: "integracao.tasks",
    identity: "id",
    dependencies: [
      "tb_integracao.tarefas_express",
      "tb_integracao.prospeccao_comercial",
      "tb_integracao.clientes",
      "tb_admin.departamentos",
      "tb_admin.usuarios",
    ],
    columns: [
      ["id", "id"],
      ["nome", "name"],
      ["cliente_id", "client_id"],
      ["estado", "status"],
      ["departamento_id", "department_id"],
      ["obs", "observations"],
      ["cobranca", "billing"],
      ["urgencia", "urgency"],
      ["responsavel_id", "responsible_id"],
      ["responsavel_id_dois", "responsible2_id"],
      ["responsavel_id_tres", "responsible3_id"],
      ["data_cadastro", "start_date"],
      ["data_previsao", "prevision_date"],
      ["data_resolucao", "end_date"],
      ["data_cadastro", "date_created"],
      ["data_update", "date_updated"],
      ["reuniao", "meeting"],
    ],
  },
  {
    source: "tb_regularize.alvaras",
    destination: "regularize.license",
    identity: "id",
    dependencies: ["tb_integracao.clientes", "tb_regularize.clientes", "tb_admin.usuarios"],
    columns: [
      ["id", "id"],
      ["cpf_cnpj", "client_id"],
      ["tipo_do_alvara", "type_license"],
      ["data_de_entrada", "entry_date"],
      ["protocolo", "protocol"],
      ["responsavel", "responsible_id"],
      ["status", "status"],
      ["data_ultima_consulta", "date_last_consultation"],
      ["situacao_atual", "current_situation"],
      ["contato", "contact"],
      ["observacao", "observation"],
      ["urgencia", "urgency"],
      ["tipo", "type"],
      ["task_id", "task_id"],
    ],
  },
  {
    source: "tb_regularize.processos",
    destination: "regularize.process",
    identity: "id",
    dependencies: ["tb_integracao.clientes", "tb_regularize.clientes", "tb_admin.usuarios"],
    columns: [
      ["id", "id"],
      ["cpf_cnpj", "client_pj_id"],
      ["cpf_cnpj", "cpf_cnpj"],
      ["processo", "process_type"],
      ["descricao", "description"],
      ["data_entrada", "entry_date"],
      ["data_finalizacao", "completion_date"],
      ["status", "status"],
      ["observacao", "observation"],
      ["responsavel_um", "responsible1_id"],
      ["responsavel_dois", "responsible2_id"],
      ["responsavel_tres", "responsible3_id"],
      ["travamento_cliente_notificacao", "locking_type"],
      ["urgencia", "urgency"],
      ["task_id", "task_id"],
    ],
  },
  {
    source: "tb_regularize.orientaoes_processual",
    destination: "regularize.proceduralGuidances",
    identity: "id",
    dependencies: ["tb_regularize.processos", "tb_regularize.clientes"],
    columns: [
      ["id", "id"],
      ["processo_id", "process_id"],
      ["tipo", "type"],
      ["solicitacao", "request"],
      ["obs_quadro", "framework_obs"],
      ["natureza_juridica", "legal_nature"],
      ["razao_social", "company_name"],
      ["nome_fantasia", "trade_name"],
      ["cnpj", "cpf_cnpj"],
      ["capital_social", "share_capital"],
      ["iptu", "iptu"],
      ["endereco", "address"],
      ["obj_social", "comporate_purpose"],
      ["porte", "carryng"],
      ["regime", "regime"],
      ["representante_legal", "legal_representative"],
      ["status", "status"],
    ],
  },
  {
    source: "tb_regularize.orientaoes_processual.socios",
    destination: "regularize.partners",
    identity: "id",
    dependencies: ["tb_regularize.orientaoes_processual", "tb_regularize.clientes"],
    columns: [
      ["id", "id"],
      ["op_id", "pj_id"],
      ["cpf", "pf_id"],
      ["porcent", "part"],
    ],
  },
  {
    source: "tb_regularize.taxas_municipais",
    destination: "regularize.municipalTaxes",
    identity: "id",
    dependencies: ["tb_integracao.clientes", "tb_regularize.clientes"],
    columns: [
      ["id", "id"],
      ["cliente", "client_id"],
      ["ano", "year"],
      ["tff_possui", "tff_is_applicable"],
      ["tff_valor", "tff_amount"],
      ["tff_obs", "tff_notes"],
      ["tff_analise_feito", "tff_analysis_is_done"],
      ["tff_analise_obs", "tff_analysis_notes"],
      ["tff_envio_data", "tff_sent_date"],
      ["tff_vencimento", "tff_due_date"],
      ["tlp_possui", "tlp_is_applicable"],
      ["tlp_obs", "tlp_notes"],
      ["tlp_envio", "tlp_is_sent"],
      ["tlp_envio_data", "tlp_sent_date"],
      ["vencimento", "tlp_due_date"],
      ["email", "tlp_not_email"],
    ],
  },
  {
    source: "tb_regularize.clientes_senhas",
    destination: "regularize.passwordsRegularize",
    identity: "id",
    dependencies: ["tb_integracao.clientes", "tb_regularize.clientes"],
    columns: [
      ["id", "id"],
      ["empresa", "client_id"],
      ["responsavel", "login"],
      ["acesso_simples", "password"],
      ["inscricao_estadual", "password"],
      ["sefaz", "password"],
      ["regularize", "password"],
      ["webiss_master", "password"],
      ["webiss_usuario_cpf", "password"],
      ["webiss_cpf", "password"],
      ["webiss_usuario_cpf_dois", "password"],
      ["webiss_cpf_dois", "password"],
      ["seifsa_usuario", "password"],
      ["seifsa_senha", "password"],
      ["bacen_usuario", "password"],
      ["bacen_senha", "password"],
      ["gov", "password"],
      ["MEI", "password"],
      ["certificado_pj", "password"],
      ["certificado_pf", "password"],
    ],
  },
];

function parseConfirmedDestinations(csv) {
  return csv
    .trim()
    .split("\n")
    .slice(1)
    .map((line) => {
      const match = line.match(/^"([^"]+)","([^"]+)"$/);
      assert.ok(match, `linha CSV inválida: ${line}`);
      return [match[1], match[2]];
    });
}

test("registro V2 porta exatamente as 16 tabelas confirmadas no artefato anterior", async () => {
  const csv = await readFile("docs/migration/v2/confirmed-table-destinations.csv", "utf8");
  const expectedDestinations = parseConfirmedDestinations(csv);
  const registry = buildRuleRegistry();

  assert.equal(registry.size, 16);
  assert.deepEqual(
    [...registry.values()].map(({ sourceTable, destinationTable }) => [
      sourceTable,
      destinationTable,
    ]),
    expectedDestinations,
  );
});

for (const expected of expectedRules) {
  test(`regra V2 de ${expected.source} preserva contrato, dependências e colunas`, async () => {
    const registry = buildRuleRegistry();
    const rule = registry.get(expected.source);

    assert.ok(rule);
    assert.equal(rule.destinationTable, expected.destination);
    assert.equal(rule.status, "confirmed");
    assert.equal(rule.ruleOrigin, RULE_ORIGIN);
    assert.deepEqual(rule.identity, {
      legacyColumn: expected.identity,
      scope: expected.source,
      namespace: REQUIRED_IDENTITY_NAMESPACE,
    });
    assert.deepEqual(rule.dependencies, expected.dependencies);
    assert.deepEqual(
      rule.columns.map(({ sourceColumn, destinationColumn }) => [sourceColumn, destinationColumn]),
      expected.columns,
    );
  });
}

test("todas as regras V2 continuam válidas contra o catálogo Prisma atual", async () => {
  const catalog = await loadPrismaCatalog("infra/prisma/schema.prisma");

  for (const rule of v2Rules) {
    assert.equal(validateMappingRule(rule, catalog), true, rule.sourceTable);
  }
});

test("classifyRow é puro e retorna somente prepared ou quarantine", () => {
  for (const rule of v2Rules) {
    const row = Object.freeze({});
    const context = Object.freeze({});
    const first = rule.classifyRow(row, context);
    const second = rule.classifyRow(row, context);

    assert.deepEqual(second, first, rule.sourceTable);
    assert.ok(["prepared", "quarantine"].includes(first.status), rule.sourceTable);
  }
});

test("senha de usuário só prepara bcrypt válido e nunca retorna o valor recebido", () => {
  const rule = buildRuleRegistry().get("tb_admin.usuarios");
  const invalid = rule.classifyRow({ id: 41, password: "legacy-not-hashed" }, {});
  const invalidCost = rule.classifyRow(
    {
      id: 41,
      password: "$2b$99$C6UzMDM.H6dfI/f/IKcEe.5m6K5IfHhY7v0ZgXR2pRkzFFvO23Vq.",
    },
    {},
  );
  const valid = rule.classifyRow(
    {
      id: 41,
      password: "$2b$12$C6UzMDM.H6dfI/f/IKcEe.5m6K5IfHhY7v0ZgXR2pRkzFFvO23Vq.",
    },
    {},
  );
  const passwordColumn = rule.columns.find(
    ({ destinationColumn }) => destinationColumn === "password",
  );

  assert.deepEqual(invalid, {
    status: "quarantine",
    field: "password",
    reasonCode: "USER_PASSWORD_NOT_BCRYPT",
  });
  assert.deepEqual(invalidCost, invalid);
  assert.deepEqual(valid, { status: "prepared" });
  assert.equal(passwordColumn.transformation, "bcrypt_passthrough_if_valid");
  assert.equal(passwordColumn.sensitivity, "credential");
  assert.doesNotMatch(JSON.stringify(invalid), /legacy-not-hashed/);
});

test("credenciais Regularize exigem prova criptográfica e não usam transformação em claro", () => {
  const rule = buildRuleRegistry().get("tb_regularize.clientes_senhas");
  const credentialColumns = rule.columns.filter(({ sensitivity }) => sensitivity === "credential");

  assert.deepEqual(rule.classifyRow({ acesso_simples: "opaque-fixture" }, {}), {
    status: "quarantine",
    field: "acesso_simples",
    reasonCode: "CREDENTIAL_REQUIRES_ENCRYPTION",
  });
  assert.deepEqual(
    rule.classifyRow({ acesso_simples: "opaque-fixture" }, { credentialEncryptionVerified: true }),
    { status: "prepared" },
  );
  assert.ok(credentialColumns.length > 0);
  for (const column of credentialColumns) {
    assert.equal(column.transformation, "encrypt_credential");
    assert.doesNotMatch(column.transformation, /^(plain|copy|preserve_raw)$/i);
  }
});

test("todas as tabelas anteriormente pending permanecem fora do registro confirmed", async () => {
  const pending = JSON.parse(
    await readFile(
      "docs/migration/v2/pending-mapping/tables-without-confirmed-destination.json",
      "utf8",
    ),
  );
  const registry = buildRuleRegistry();

  assert.equal(pending.length, 296);
  for (const { legacy_table: sourceTable } of pending) {
    assert.equal(registry.has(sourceTable), false, sourceTable);
  }
});
