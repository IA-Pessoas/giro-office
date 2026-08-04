import { REQUIRED_IDENTITY_NAMESPACE } from "../lib/mapping-contract.mjs";
import { classifySensitivity } from "../lib/sensitivity.mjs";

const RULE_ORIGIN =
  "draft: mechanical V2 port from scripts/migration-v2-build-load.mjs; revalidate in Task 3";
const DRAFT_EVIDENCE = Object.freeze({
  legacy: ["Portada mecanicamente da V2; revisão semântica pendente na Task 3."],
  current: ["Catálogo Prisma validado estruturalmente; revisão semântica pendente na Task 3."],
});
const BCRYPT_PATTERN = /^\$2[aby]\$(?:0[4-9]|[12]\d|3[01])\$[./A-Za-z0-9]{53}$/;

const REGULARIZE_CREDENTIAL_COLUMNS = [
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
];

const prepared = () => ({ status: "prepared" });

export const v2Rules = [
  rule({
    sourceTable: "tb_admin.departamentos",
    destinationTable: "departments",
    domain: "administration",
    legacyColumn: "id",
    dependencies: [],
    pairs: [
      ["id", "id"],
      ["nome", "name"],
      ["color", "color"],
      ["status", "status"],
      ["parceiros", "solution"],
    ],
  }),
  rule({
    sourceTable: "tb_admin.usuarios",
    destinationTable: "users",
    domain: "administration",
    legacyColumn: "id",
    dependencies: ["tb_admin.departamentos"],
    pairs: [
      ["id", "id"],
      ["nome", "name"],
      ["user", "login"],
      ["password", "password", "bcrypt_passthrough_if_valid", "credential"],
      ["cargo", "permission"],
      ["status", "status"],
      ["departamento_id", "department_id"],
      ["img", "photo_url"],
      ["nome", "full_name"],
    ],
    classifyRow: classifyUserRow,
  }),
  rule({
    sourceTable: "tb_rh.colaboradores",
    destinationTable: "users",
    domain: "human-resources",
    legacyColumn: "user_id",
    dependencies: ["tb_admin.usuarios", "tb_admin.departamentos"],
    pairs: [
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
  }),
  rule({
    sourceTable: "tb_integracao.clientes",
    destinationTable: "clients",
    domain: "clients",
    legacyColumn: "id",
    dependencies: [],
    pairs: [
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
  }),
  rule({
    sourceTable: "tb_regularize.clientes",
    destinationTable: "clients",
    domain: "clients",
    legacyColumn: "codigo",
    dependencies: [],
    pairs: [
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
  }),
  rule({
    sourceTable: "tb_integracao.prospeccao_comercial",
    destinationTable: "integracao.projects",
    domain: "integration",
    legacyColumn: "id",
    dependencies: ["tb_integracao.clientes"],
    pairs: [
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
  }),
  rule({
    sourceTable: "tb_integracao.tarefas_express",
    destinationTable: "integracao.tasksModel",
    domain: "integration",
    legacyColumn: "id",
    dependencies: ["tb_admin.departamentos", "tb_admin.usuarios"],
    pairs: [
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
  }),
  rule({
    sourceTable: "tb_integracao.planos",
    destinationTable: "integracao.projectPlan",
    domain: "integration",
    legacyColumn: "id",
    dependencies: [],
    pairs: [
      ["id", "id"],
      ["nome", "name"],
      ["color", "color"],
    ],
  }),
  rule({
    sourceTable: "tb_integracao.tarefas_planos",
    destinationTable: "integracao.projectPlanTasks",
    domain: "integration",
    legacyColumn: "id",
    dependencies: ["tb_integracao.planos", "tb_integracao.tarefas_express"],
    pairs: [
      ["id", "id"],
      ["plano_id", "plan_id"],
      ["tarefa_express_id", "task_id"],
      ["ordem", "order"],
    ],
  }),
  rule({
    sourceTable: "tb_integracao.tarefas",
    destinationTable: "integracao.tasks",
    domain: "integration",
    legacyColumn: "id",
    dependencies: [
      "tb_integracao.tarefas_express",
      "tb_integracao.prospeccao_comercial",
      "tb_integracao.clientes",
      "tb_admin.departamentos",
      "tb_admin.usuarios",
    ],
    pairs: [
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
  }),
  rule({
    sourceTable: "tb_regularize.alvaras",
    destinationTable: "regularize.license",
    domain: "regularize",
    legacyColumn: "id",
    dependencies: ["tb_integracao.clientes", "tb_regularize.clientes", "tb_admin.usuarios"],
    pairs: [
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
  }),
  rule({
    sourceTable: "tb_regularize.processos",
    destinationTable: "regularize.process",
    domain: "regularize",
    legacyColumn: "id",
    dependencies: ["tb_integracao.clientes", "tb_regularize.clientes", "tb_admin.usuarios"],
    pairs: [
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
  }),
  rule({
    sourceTable: "tb_regularize.orientaoes_processual",
    destinationTable: "regularize.proceduralGuidances",
    domain: "regularize",
    legacyColumn: "id",
    dependencies: ["tb_regularize.processos", "tb_regularize.clientes"],
    pairs: [
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
  }),
  rule({
    sourceTable: "tb_regularize.orientaoes_processual.socios",
    destinationTable: "regularize.partners",
    domain: "regularize",
    legacyColumn: "id",
    dependencies: ["tb_regularize.orientaoes_processual", "tb_regularize.clientes"],
    pairs: [
      ["id", "id"],
      ["op_id", "pj_id"],
      ["cpf", "pf_id"],
      ["porcent", "part"],
    ],
  }),
  rule({
    sourceTable: "tb_regularize.taxas_municipais",
    destinationTable: "regularize.municipalTaxes",
    domain: "regularize",
    legacyColumn: "id",
    dependencies: ["tb_integracao.clientes", "tb_regularize.clientes"],
    pairs: [
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
  }),
  rule({
    sourceTable: "tb_regularize.clientes_senhas",
    destinationTable: "regularize.passwordsRegularize",
    domain: "regularize",
    legacyColumn: "id",
    dependencies: ["tb_integracao.clientes", "tb_regularize.clientes"],
    pairs: [
      ["id", "id"],
      ["empresa", "client_id"],
      ["responsavel", "login"],
      ...REGULARIZE_CREDENTIAL_COLUMNS.map((column) => [
        column,
        "password",
        "encrypt_credential",
        "credential",
      ]),
    ],
    classifyRow: classifyRegularizeCredentialRow,
  }),
];

function rule({
  sourceTable,
  destinationTable,
  domain,
  legacyColumn,
  dependencies,
  pairs,
  classifyRow = prepared,
}) {
  return {
    sourceTable,
    status: "confirmed",
    domain,
    ruleOrigin: RULE_ORIGIN,
    reason: "Portada mecanicamente da V2; decisão semântica pendente na Task 3.",
    evidence: {
      legacy: [...DRAFT_EVIDENCE.legacy],
      current: [...DRAFT_EVIDENCE.current],
    },
    cardinality: "1:1",
    destinations: [
      {
        stepId: "v2-insert",
        destinationTable,
        mode: "insert",
        identity: {
          strategy: "create",
          legacyColumn,
          scope: sourceTable,
          namespace: REQUIRED_IDENTITY_NAMESPACE,
        },
        dependencies,
        columns: pairs.map(([sourceColumn, destinationColumn, transformation, sensitivity]) =>
          mappedColumn({ sourceColumn, destinationColumn, transformation, sensitivity }),
        ),
      },
    ],
    emitRows(row, context) {
      return [toEmissionDecision(classifyRow(row, context))];
    },
  };
}

function toEmissionDecision(decision) {
  const emission = { stepId: "v2-insert", status: decision.status };
  if (decision.status !== "quarantine") {
    return emission;
  }
  return {
    ...emission,
    field: decision.field,
    reasonCode: decision.reasonCode,
  };
}

function mappedColumn({ sourceColumn, destinationColumn, transformation, sensitivity }) {
  return {
    sourceColumn,
    destinationColumn,
    status: "mapped",
    transformation: transformation ?? inferTransformation(destinationColumn),
    nullHandling: "normalize_empty_to_null_or_quarantine_when_required",
    referenceRole:
      destinationColumn === "id"
        ? "identity"
        : destinationColumn.endsWith("_id")
          ? "foreign_key"
          : "none",
    sensitivity: sensitivity ?? inferSensitivity(sourceColumn, destinationColumn),
    reason: "Mapeamento portado explicitamente da transformação V2.",
  };
}

function inferTransformation(destinationColumn) {
  if (destinationColumn === "id") {
    return "uuid_v5";
  }
  if (destinationColumn.endsWith("_id")) {
    return "resolve_legacy_reference";
  }
  if (destinationColumn.includes("date") || destinationColumn.endsWith("_at")) {
    return "normalize_date";
  }
  if (destinationColumn === "status") {
    return "normalize_status";
  }
  return "normalize_scalar";
}

function inferSensitivity(sourceColumn, destinationColumn) {
  if (destinationColumn === "password") {
    return "credential";
  }

  const detected = classifySensitivity(sourceColumn);
  if (detected !== "none") {
    return detected;
  }
  if (/cpf|cnpj|rg|email|fone|telefone|address|endereco/i.test(sourceColumn)) {
    return "personal";
  }
  return "none";
}

function classifyUserRow(row) {
  if (typeof row?.password !== "string" || !BCRYPT_PATTERN.test(row.password)) {
    return {
      status: "quarantine",
      field: "password",
      reasonCode: "USER_PASSWORD_NOT_BCRYPT",
    };
  }
  return { status: "prepared" };
}

function classifyRegularizeCredentialRow(row, context) {
  const credentialColumn = REGULARIZE_CREDENTIAL_COLUMNS.find((column) =>
    hasCredentialValue(row?.[column]),
  );
  if (credentialColumn !== undefined && context?.credentialEncryptionVerified !== true) {
    return {
      status: "quarantine",
      field: credentialColumn,
      reasonCode: "CREDENTIAL_REQUIRES_ENCRYPTION",
    };
  }
  return { status: "prepared" };
}

function hasCredentialValue(value) {
  return value !== null && value !== undefined && String(value).trim().length > 0;
}
