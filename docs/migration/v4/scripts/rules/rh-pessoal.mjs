import { RH_PESSOAL_EVIDENCE } from "../evidence/rh-pessoal.mjs";
import { REQUIRED_IDENTITY_NAMESPACE } from "../lib/mapping-contract.mjs";

const ORGANIZATION_ID = "e8048d1c-0830-45d7-84de-68e20abd685b";
const EVIDENCE_BY_SOURCE = new Map(RH_PESSOAL_EVIDENCE.map((item) => [item.sourceTable, item]));

const passwordColumns = {
  "tb_pessoal.bem": [
    mapped("id", "id", "uuid_v5_from_full_source_table_and_legacy_id"),
    mapped("empresa", "client_id", "resolve_client_reference", referenceOptions()),
    mapped("usuario", "login_main", "encrypt_credential", credentialOptions()),
    mapped("identificador", "login_secondary", "encrypt_credential", credentialOptions()),
    mapped("senha", "senha_main", "encrypt_credential", credentialOptions()),
    mapped("responsavel", "responsavel_id", "resolve_optional_user_reference", referenceOptions()),
  ],
  "tb_pessoal.bsf": [
    mapped("id", "id", "uuid_v5_from_full_source_table_and_legacy_id"),
    mapped("empresa", "client_id", "resolve_client_reference", referenceOptions()),
    mapped("responsavel", "responsavel_id", "resolve_optional_user_reference", referenceOptions()),
    mapped("cpf", "login_secondary", "encrypt_credential", credentialOptions()),
    mapped("login", "login_main", "encrypt_credential", credentialOptions()),
    mapped("senha", "senha_main", "encrypt_credential", credentialOptions()),
  ],
  "tb_pessoal.codigos_acesso": [
    mapped("id", "id", "uuid_v5_from_full_source_table_and_legacy_id"),
    mapped("empresa", "client_id", "resolve_client_reference", referenceOptions()),
    mapped("cpf", "login_main", "encrypt_credential", credentialOptions()),
    mapped("cod_acesso", "login_secondary", "encrypt_credential", credentialOptions()),
    mapped("senha", "senha_main", "encrypt_credential", credentialOptions()),
    notPreserved(
      "certificado_digital",
      "O identificador de certificado não é credencial segura nem arquivo importável no contrato atual.",
      { sensitivity: "secret", transformation: "redact_and_not_preserve" },
    ),
    mapped("senha_gov", "senha_secondary", "encrypt_credential", credentialOptions()),
  ],
  "tb_pessoal.contri_assis": [
    mapped("id", "id", "uuid_v5_from_full_source_table_and_legacy_id"),
    mapped("cliente_id", "client_id", "resolve_client_reference", referenceOptions()),
    mapped("login", "login_main", "encrypt_credential", credentialOptions()),
    mapped("senha", "senha_main", "encrypt_credential", credentialOptions()),
  ],
  "tb_pessoal.empregador_web": [
    mapped("id", "id", "uuid_v5_from_full_source_table_and_legacy_id"),
    mapped("empresa", "client_id", "resolve_client_reference", referenceOptions()),
    mapped("login", "login_main", "encrypt_credential", credentialOptions()),
    mapped("senha", "senha_main", "encrypt_credential", credentialOptions()),
    mapped("email", "login_secondary", "encrypt_credential", credentialOptions()),
    mapped("senha_email", "senha_secondary", "encrypt_credential", credentialOptions()),
  ],
};

const credentialConfigs = [
  {
    sourceTable: "tb_pessoal.bem",
    serviceName: "BEM",
    clientField: "empresa",
    responsibleField: "responsavel",
    credentialFields: ["usuario", "identificador", "senha"],
  },
  {
    sourceTable: "tb_pessoal.bsf",
    serviceName: "BSF",
    clientField: "empresa",
    responsibleField: "responsavel",
    credentialFields: ["cpf", "login", "senha"],
  },
  {
    sourceTable: "tb_pessoal.codigos_acesso",
    serviceName: "Códigos de acesso",
    clientField: "empresa",
    credentialFields: ["cpf", "cod_acesso", "senha", "senha_gov"],
  },
  {
    sourceTable: "tb_pessoal.contri_assis",
    serviceName: "Contribuição assistencial",
    clientField: "cliente_id",
    credentialFields: ["login", "senha"],
  },
  {
    sourceTable: "tb_pessoal.empregador_web",
    serviceName: "Empregador Web",
    clientField: "empresa",
    credentialFields: ["login", "senha", "email", "senha_email"],
  },
];

export const RH_PESSOAL_RULES = [
  ...credentialConfigs.map(createCredentialRule),
  createInsertRule({
    sourceTable: "tb_pessoal.clientes_situacoes",
    domain: "pessoal",
    stepId: "pessoal-situation-insert",
    destinationTable: "pessoal.situations",
    dependencies: ["tb_integracao.clientes", "tb_admin.usuarios"],
    references: [
      requiredReference("cliente_id", "clientResolution", "CLIENT"),
      requiredReference("cadastrado_por", "registeredByResolution", "USER"),
      optionalReference("finalizado_por", "completedByResolution", "USER"),
    ],
    columns: [
      mapped("id", "id", "uuid_v5_from_full_source_table_and_legacy_id"),
      mapped("cliente_id", "client_id", "resolve_client_reference", referenceOptions()),
      mapped("status", "status", "normalize_situation_status"),
      mapped("titulo", "title", "normalize_required_text"),
      mapped("descricao", "description", "normalize_required_text", personalOptions()),
      mapped("data_cadastro", "registration_date", "normalize_required_date"),
      mapped("data_finalizacao", "completion_date", "normalize_date"),
      mapped("cadastrado_por", "registered_by_id", "resolve_user_reference", referenceOptions()),
      mapped(
        "finalizado_por",
        "completed_by_id",
        "resolve_optional_user_reference",
        referenceOptions(),
      ),
    ],
  }),
  createInsertRule({
    sourceTable: "tb_pessoal.folhas",
    domain: "pessoal",
    stepId: "pessoal-payroll-insert",
    destinationTable: "pessoal.payroll",
    dependencies: ["tb_integracao.clientes", "tb_admin.usuarios", "tb_pessoal.sindicato"],
    references: [
      requiredReference("cliente_id", "clientResolution", "CLIENT"),
      optionalReference("responsavel_id", "responsibleResolution", "USER"),
      optionalReference("sindicato", "unionResolution", "UNION"),
    ],
    unique: { contextKey: "payrollUniqueResolution", reasonPrefix: "PAYROLL" },
    columns: [
      mapped("id", "id", "uuid_v5_from_full_source_table_and_legacy_id"),
      mapped("cliente_id", "client_id", "resolve_client_reference", referenceOptions()),
      mapped(
        "responsavel_id",
        "responsible_id",
        "resolve_optional_user_reference",
        referenceOptions(),
      ),
      mapped("adiantamento", "advance", "normalize_boolean"),
      mapped("adiantamento_tipo", "advance_type", "normalize_text"),
      mapped("adiantamento_valor", "advance_amount", "normalize_number"),
      mapped("info", "info", "normalize_required_text"),
      mapped("previa", "previous", "normalize_boolean"),
      mapped("onvio", "onvio", "normalize_boolean"),
      mapped("contato", "contact", "normalize_text", personalOptions()),
      mapped("vt", "vt", "normalize_boolean"),
      mapped("vt_valor", "vt_value", "normalize_number"),
      mapped("vt_tipo", "vt_type", "normalize_text"),
      mapped("va", "va", "normalize_boolean"),
      mapped("sindicato", "union_id", "resolve_optional_union_reference", referenceOptions()),
      mapped("bem_mais", "bem_mais", "normalize_boolean"),
      mapped("bsf", "bsf", "normalize_boolean"),
      mapped("taxa_assistencial", "assistance_fee", "normalize_boolean"),
      mapped("reinf", "reinf", "normalize_boolean"),
      mapped("grupo", "group", "normalize_required_text"),
      mapped("funcionarios", "employees", "normalize_integer"),
    ],
    defaults: {
      advance: false,
      info: "",
      previous: false,
      onvio: false,
      group: "",
      vt: false,
      va: false,
      assistance_fee: false,
      bem_mais: false,
      bsf: false,
      reinf: false,
      employees: 0,
    },
    precedence: ["legacy_identity", "unique_client_id"],
  }),
  createInsertRule({
    sourceTable: "tb_pessoal.ldd",
    domain: "pessoal",
    stepId: "pessoal-ldd-insert",
    destinationTable: "pessoal.ldd",
    dependencies: ["tb_integracao.clientes"],
    references: [requiredReference("cliente", "clientResolution", "CLIENT")],
    columns: [
      mapped("id", "id", "uuid_v5_from_full_source_table_and_legacy_id"),
      mapped("cliente", "client_id", "resolve_client_reference", referenceOptions()),
      mapped("tipo", "type", "normalize_required_text"),
      mapped("periodo", "period", "normalize_text"),
      mapped("vencimento", "due_date", "normalize_date"),
      mapped("saldo", "balance_amount", "normalize_number"),
      mapped("inscricao", "registration_status", "normalize_text"),
      mapped("situacao", "status", "normalize_text"),
    ],
    requiredTextFields: ["tipo"],
  }),
  createInsertRule({
    sourceTable: "tb_pessoal.obrigacoes",
    domain: "pessoal",
    stepId: "pessoal-obligation-insert",
    destinationTable: "pessoal.obrigations",
    dependencies: ["tb_integracao.clientes", "tb_admin.usuarios"],
    references: [
      requiredReference("cliente_id", "clientResolution", "CLIENT"),
      optionalReference("responsavel_id", "responsibleResolution", "USER"),
    ],
    unique: { contextKey: "obligationUniqueResolution", reasonPrefix: "OBLIGATION" },
    requiredTextFields: ["comp"],
    columns: [
      mapped("id", "id", "uuid_v5_from_full_source_table_and_legacy_id"),
      mapped("comp", "competence", "normalize_required_text"),
      mapped("cliente_id", "client_id", "resolve_client_reference", referenceOptions()),
      mapped("adiantamento", "advance", "normalize_nullable_boolean"),
      mapped("folha", "payroll", "normalize_nullable_boolean"),
      mapped("encargos", "charges", "normalize_nullable_boolean"),
      mapped("taxa_assistencial", "assistance_fee", "normalize_nullable_boolean"),
      mapped(
        "responsavel_id",
        "responsavel_id",
        "resolve_optional_user_reference",
        referenceOptions(),
      ),
      mapped("bem_mais", "bem_mais", "normalize_nullable_boolean"),
      mapped("bsf", "bsf", "normalize_nullable_boolean"),
      mapped("va", "va", "normalize_nullable_boolean"),
      mapped("vt", "vt", "normalize_nullable_boolean"),
    ],
    precedence: ["legacy_identity", "unique_organization_client_competence"],
  }),
  createInsertRule({
    sourceTable: "tb_pessoal.sindicato",
    domain: "pessoal",
    stepId: "pessoal-union-insert",
    destinationTable: "pessoal.union",
    unique: { contextKey: "unionUniqueResolution", reasonPrefix: "UNION" },
    requiredTextFields: ["nome", "cnpj"],
    columns: [
      mapped("id", "id", "uuid_v5_from_full_source_table_and_legacy_id"),
      mapped("nome", "name", "normalize_required_text"),
      mapped("cnpj", "cnpj", "normalize_required_text"),
      mapped("data_base", "base_date", "normalize_date"),
    ],
    precedence: ["legacy_identity", "unique_organization_name_cnpj_base_date"],
  }),
  createUserJsonMergeRule({
    sourceTable: "tb_rh.alergias",
    stepId: "user-allergies-merge",
    destinationColumn: "allergies",
    contentColumns: ["nome", "fontes", "tratativo"],
  }),
  createUserJsonMergeRule({
    sourceTable: "tb_rh.contatos_emergencia",
    stepId: "user-emergency-contacts-merge",
    destinationColumn: "emergency_contacts",
    contentColumns: ["nome", "referencia", "numero"],
  }),
  createInsertRule({
    sourceTable: "tb_rh.feriados",
    domain: "human-resources",
    stepId: "rh-holiday-insert",
    destinationTable: "rh.holidays",
    columns: [
      mapped("id", "id", "uuid_v5_from_full_source_table_and_legacy_id"),
      mapped("data", "date", "normalize_required_date"),
      mapped("nome", "name", "normalize_required_text"),
    ],
    requiredTextFields: ["nome", "data"],
  }),
  createInsertRule({
    sourceTable: "tb_rh.pontos",
    domain: "human-resources",
    stepId: "rh-point-config-insert",
    destinationTable: "rh.pointConfig",
    dependencies: ["tb_rh.colaboradores"],
    references: [requiredReference("colaborador", "userResolution", "USER")],
    unique: { contextKey: "pointConfigUniqueResolution", reasonPrefix: "POINT_CONFIG" },
    columns: [
      mapped("id", "id", "uuid_v5_from_full_source_table_and_legacy_id"),
      mapped("colaborador", "user_id", "resolve_collaborator_user_reference", referenceOptions()),
      mapped("entrada", "start_time", "anchor_required_time"),
      mapped("saida_almoco", "lunch_break", "anchor_required_time"),
      mapped("retorno_almoco", "lunch_return", "anchor_required_time"),
      mapped("saida", "end_time", "anchor_required_time"),
      notPreserved(
        "carga_horaria",
        "A configuração atual calcula jornada pelos quatro horários e não possui campo de carga separado.",
      ),
      mapped("assinatura", "signature", "normalize_text", personalOptions()),
      mapped("banco_horas", "bank_balance", "time_to_minutes"),
    ],
    defaults: { bank_balance: 0, work_days: "1,2,3,4,5" },
    requiredTextFields: ["entrada", "saida_almoco", "retorno_almoco", "saida"],
  }),
  createInsertRule({
    sourceTable: "tb_rh.pontos_adicionais_folhas",
    domain: "human-resources",
    stepId: "rh-time-bank-release-insert",
    destinationTable: "rh.timeBankReleases",
    dependencies: ["tb_rh.colaboradores"],
    references: [
      requiredReference("colaborador", "userResolution", "USER"),
      requiredReference("adicionado_por", "addedByResolution", "USER"),
    ],
    requiredTextFields: ["data", "motivo"],
    columns: [
      mapped("id", "id", "uuid_v5_from_full_source_table_and_legacy_id"),
      mapped("colaborador", "user_id", "resolve_collaborator_user_reference", referenceOptions()),
      mapped("data", "date", "normalize_required_date"),
      mapped("horas", "minutes", "time_to_minutes"),
      mapped("motivo", "reason", "normalize_required_text", personalOptions()),
      mapped("aprovado", "is_approved", "normalize_boolean"),
      mapped(
        "adicionado_por",
        "added_by_user_id",
        "resolve_collaborator_user_reference",
        collaboratorReferenceOptions(),
      ),
    ],
  }),
  createInsertRule({
    sourceTable: "tb_rh.pontos_folhas",
    domain: "human-resources",
    stepId: "rh-time-sheet-insert",
    destinationTable: "rh.timeSheets",
    dependencies: ["tb_rh.colaboradores"],
    references: [requiredReference("colaborador", "userResolution", "USER")],
    requiredTextFields: ["inicio", "fim"],
    columns: [
      mapped("id", "id", "uuid_v5_from_full_source_table_and_legacy_id"),
      mapped("colaborador", "user_id", "resolve_collaborator_user_reference", referenceOptions()),
      mapped("inicio", "start_time", "normalize_required_date"),
      mapped("fim", "end_time", "normalize_required_date"),
      mapped("assinatura", "signature", "normalize_text", personalOptions()),
      mapped("assinatura", "status", "derive_signature_status", {
        reason:
          "A presença da assinatura legada determina status Assinada; ausência mantém Gerada.",
      }),
    ],
    defaults: { status: "Gerada", days: null, totals: null },
  }),
  createInsertRule({
    sourceTable: "tb_rh.pontos_registros",
    domain: "human-resources",
    stepId: "rh-point-insert",
    destinationTable: "rh.points",
    dependencies: ["tb_rh.colaboradores"],
    references: [requiredReference("colaborador", "userResolution", "USER")],
    requiredTextFields: ["data", "entrada"],
    columns: [
      mapped("id", "id", "uuid_v5_from_full_source_table_and_legacy_id"),
      mapped("colaborador", "user_id", "resolve_collaborator_user_reference", referenceOptions()),
      mapped("data", "clock_in", "combine_date_and_required_clock_in"),
      mapped("entrada", "clock_in", "combine_date_and_required_clock_in"),
      mapped("saida_almoco", "lunch_out", "combine_date_and_optional_time"),
      mapped("retorno_almoco", "lunch_in", "combine_date_and_optional_time"),
      mapped("saida", "clock_out", "combine_date_and_optional_time"),
      notPreserved(
        "atraso",
        "Atraso é informação derivável dos horários e da configuração, sem coluna própria no destino.",
      ),
      mapped("hora_diaria", "workload_hours", "time_to_minutes"),
      mapped("horas_faltantes", "time_bank_balance", "subtract_missing_minutes"),
      mapped("horas_extras", "time_bank_balance", "add_extra_minutes"),
      mapped("assinado", "signature", "derive_legacy_signed_marker"),
    ],
  }),
  createInsertRule({
    sourceTable: "tb_rh.pontos_solicitacoes",
    domain: "human-resources",
    stepId: "rh-time-clock-request-insert",
    destinationTable: "rh.timeClockRequest",
    dependencies: ["tb_rh.colaboradores", "tb_rh.pontos_registros"],
    references: [
      requiredReference("colaborador", "userResolution", "USER"),
      requiredReference("ponto", "pointResolution", "POINT"),
      optionalReference("aprovador", "approverResolution", "USER"),
    ],
    requiredTextFields: ["data", "justificativa"],
    columns: [
      mapped("id", "id", "uuid_v5_from_full_source_table_and_legacy_id"),
      mapped("colaborador", "user_id", "resolve_collaborator_user_reference", referenceOptions()),
      mapped("ponto", "point_id", "resolve_point_reference", referenceOptions()),
      mapped("entrada", "clock_in", "combine_date_and_required_clock_in"),
      mapped("saida_almoco", "lunch_out", "combine_date_and_optional_time"),
      mapped("retorno_almoco", "lunch_in", "combine_date_and_optional_time"),
      mapped("saida", "clock_out", "combine_date_and_optional_time"),
      mapped("justificativa", "justification", "normalize_required_text", personalOptions()),
      mapped("anexo", "attachment", "normalize_legacy_asset_reference", personalOptions()),
      mapped("data", "date", "normalize_required_date"),
      mapped("status", "status", "normalize_time_clock_request_status"),
      mapped(
        "aprovador",
        "approver_user_id",
        "resolve_collaborator_user_reference",
        collaboratorReferenceOptions(),
      ),
      mapped("obs_aprovador", "obs_approver", "normalize_text", personalOptions()),
    ],
  }),
  createInsertRule({
    sourceTable: "tb_rh.score",
    domain: "human-resources",
    stepId: "rh-score-insert",
    destinationTable: "rh.score",
    dependencies: ["tb_rh.colaboradores"],
    references: [requiredReference("col_id", "userResolution", "USER")],
    unique: { contextKey: "scoreUniqueResolution", reasonPrefix: "SCORE" },
    requiredTextFields: ["trimestre"],
    columns: [
      mapped("id", "id", "uuid_v5_from_full_source_table_and_legacy_id"),
      mapped("col_id", "user_id", "resolve_collaborator_user_reference", referenceOptions()),
      mapped("trimestre", "quarter", "normalize_required_text"),
      mapped("score_comportamental", "behavioral", "normalize_number"),
      mapped("score_tecnico", "technical", "normalize_number"),
      mapped("score_ti", "technology", "normalize_number"),
      mapped("score_lider", "leadership", "normalize_number"),
      mapped("score", "final_score", "fallback_when_score_final_empty"),
      mapped("score_final", "final_score", "prefer_normalized_score_final"),
    ],
    defaults: { behavioral: 0, technical: 0, technology: 0, leadership: 0, final_score: 0 },
    precedence: ["legacy_identity", "unique_user_quarter", "score_final", "score"],
  }),
  createInsertRule({
    sourceTable: "tb_rh.score_avaliacoes",
    domain: "human-resources",
    stepId: "rh-score-evaluation-insert",
    destinationTable: "rh.score_evaluations",
    dependencies: ["tb_rh.score", "tb_admin.usuarios"],
    references: [
      requiredReference("col_id", "scoreResolution", "SCORE"),
      optionalReference("user_id", "evaluatorResolution", "USER"),
    ],
    requiredTextFields: ["trimestre", "tipo"],
    columns: scoreEvaluationColumns(),
    defaults: { average_score: 0 },
  }),
  createInsertRule({
    sourceTable: "tb_rh.score_nitro",
    domain: "human-resources",
    stepId: "rh-score-nitro-insert",
    destinationTable: "rh.score_nitro",
    dependencies: ["tb_rh.score"],
    references: [requiredReference("col_id", "scoreResolution", "SCORE")],
    unique: { contextKey: "scoreNitroUniqueResolution", reasonPrefix: "SCORE_NITRO" },
    requiredTextFields: ["trimestre"],
    columns: [
      mapped("id", "id", "uuid_v5_from_full_source_table_and_legacy_id"),
      mapped("col_id", "score_id", "resolve_score_by_collaborator_and_quarter", referenceOptions()),
      mapped(
        "trimestre",
        "score_id",
        "resolve_score_by_collaborator_and_quarter",
        referenceOptions(),
      ),
      notPreserved(
        "avaliacoes",
        "O contrato atual não possui contador de avaliações separado no consolidado Nitro.",
      ),
      mapped("ch", "hours_score", "normalize_number"),
      mapped("ch", "total_hours", "normalize_integer"),
      mapped("projetos", "projects_score", "normalize_number"),
      mapped("erros", "errors_score", "normalize_number"),
      mapped("erros", "total_errors", "normalize_integer"),
      mapped("pastas", "folders_score", "normalize_number"),
    ],
    defaults: {
      projects_score: 0,
      hours_score: 0,
      errors_score: 0,
      folders_score: 0,
      total_hours: 0,
      total_errors: 0,
    },
    precedence: ["legacy_identity", "unique_score_id"],
  }),
  createInsertRule({
    sourceTable: "tb_rh.score_perguntas",
    domain: "human-resources",
    stepId: "rh-score-question-insert",
    destinationTable: "rh.score_questions",
    requiredTextFields: ["quesito", "avaliacao"],
    columns: [
      mapped("id", "id", "uuid_v5_from_full_source_table_and_legacy_id"),
      mapped("quesito", "question", "normalize_required_text"),
      mapped("avaliacao", "type", "normalize_score_question_type"),
      mapped("status", "active", "normalize_boolean"),
      mapped("id", "question_id", "stringify_legacy_id"),
    ],
    defaults: { active: true },
  }),
  createRhRequestRule(),
  createInsertRule({
    sourceTable: "tb_rh.solicitacoes_categorias",
    domain: "human-resources",
    stepId: "rh-request-category-insert",
    destinationTable: "rh.request_categories",
    requiredTextFields: ["categoria"],
    columns: [
      mapped("id", "id", "uuid_v5_from_full_source_table_and_legacy_id"),
      mapped("categoria", "name", "normalize_required_text"),
      mapped("status", "active", "normalize_boolean"),
    ],
    defaults: { active: true },
  }),
  createInsertRule({
    sourceTable: "tb_rh.solicitacoes_mensagens",
    domain: "human-resources",
    stepId: "rh-request-message-insert",
    destinationTable: "rh.request_messages",
    dependencies: ["tb_rh.solicitacoes", "tb_rh.colaboradores"],
    references: [
      requiredReference("solicitacao", "requestResolution", "REQUEST"),
      requiredReference("remetente", "senderResolution", "USER"),
    ],
    columns: [
      mapped("id", "id", "uuid_v5_from_full_source_table_and_legacy_id"),
      mapped("solicitacao", "request_id", "resolve_request_reference", referenceOptions()),
      mapped("tipo", "type", "normalize_rh_message_type"),
      mapped(
        "remetente",
        "sender_user_id",
        "resolve_collaborator_user_reference",
        collaboratorReferenceOptions(),
      ),
      notPreserved(
        "destinatario",
        "O destinatário é derivado dos participantes da solicitação atual e não é persistido na mensagem.",
        { sensitivity: "personal" },
      ),
      mapped("lida", "is_read", "normalize_boolean"),
      mapped("data_envio", "created_at", "normalize_required_date"),
      mapped("mensagem", "message", "normalize_required_text", personalOptions()),
    ],
    defaults: { attachment: null, is_read: false },
    requiredTextFields: ["mensagem", "data_envio"],
  }),
];

function createCredentialRule(config) {
  const { sourceTable, serviceName, clientField, responsibleField, credentialFields } = config;
  return createInsertRule({
    sourceTable,
    domain: "pessoal",
    stepId: credentialStepId(sourceTable),
    destinationTable: "pessoal.passwords",
    dependencies: ["tb_integracao.clientes", ...(responsibleField ? ["tb_admin.usuarios"] : [])],
    references: [
      requiredReference(clientField, "clientResolution", "CLIENT"),
      ...(responsibleField
        ? [optionalReference(responsibleField, "responsibleResolution", "USER")]
        : []),
    ],
    columns: passwordColumns[sourceTable],
    constants: { service_name: serviceName },
    classifyAfterBase(row, context) {
      const credentialField = credentialFields.find((field) => hasValue(row?.[field]));
      if (credentialField !== undefined && context?.credentialEncryptionVerified !== true) {
        return quarantine(credentialField, "CREDENTIAL_REQUIRES_ENCRYPTION");
      }
      return prepared();
    },
  });
}

function createUserJsonMergeRule({ sourceTable, stepId, destinationColumn, contentColumns }) {
  const evidenceDecision = requireConfirmedEvidence(sourceTable);
  const classifySourceRow = (row, context) =>
    firstQuarantine([
      classifyIdentity(row, "id"),
      classifyReference(
        row,
        context,
        requiredReference("colaborador_id", "userResolution", "USER"),
      ),
    ]);

  return {
    sourceTable,
    status: "confirmed",
    domain: "human-resources",
    ruleOrigin: evidenceDecision.ruleId,
    evidence: evidenceForRule(evidenceDecision),
    cardinality: "N:1",
    dependencies: ["tb_rh.colaboradores", "tb_admin.usuarios"],
    destinations: [
      {
        stepId,
        destinationTable: "users",
        mode: "merge",
        identity: resolveIdentity("tb_rh.colaboradores", "colaborador_id", "id"),
        columns: [
          notPreserved(
            "id",
            "A identidade da linha filha não substitui a identidade User resolvida pelo colaborador.",
          ),
          mapped("colaborador_id", "id", "resolve_collaborator_user_reference", referenceOptions()),
          ...contentColumns.map((sourceColumn) =>
            mapped(sourceColumn, destinationColumn, "aggregate_child_json", personalOptions()),
          ),
        ],
        constants: {},
        defaults: {},
        precedence: ["explicit_legacy_link", "aggregate_child_json", "existing_user_value"],
        dependencies: ["tb_rh.colaboradores", "tb_admin.usuarios"],
      },
    ],
    classifySourceRow,
    emitRows(row, context) {
      const classification = classifySourceRow(row, context);
      return [
        emission({
          stepId,
          destinationTable: "users",
          identityRef:
            classification.status === "prepared"
              ? reference("tb_rh.colaboradores", row?.colaborador_id)
              : invalidIdentityReference(sourceTable, classification.field ?? "colaborador_id"),
          classification,
        }),
      ];
    },
  };
}

function createRhRequestRule() {
  const sourceTable = "tb_rh.solicitacoes";
  const evidenceDecision = requireConfirmedEvidence(sourceTable);
  const stepId = "rh-request-insert";
  const classifySourceRow = (row, context) => {
    const base = firstQuarantine([
      classifyIdentity(row, "id"),
      classifyReference(
        row,
        context,
        requiredReference("requerente", "requesterResolution", "REQUESTER"),
      ),
      classifyReference(
        row,
        context,
        requiredReference("categoria", "categoryResolution", "CATEGORY"),
      ),
    ]);
    if (base.status === "quarantine") return base;

    if (isMissingLegacyReference(row?.atribuido)) {
      return classifyResolution(
        context?.eligibleAssigneeResolution,
        "atribuido",
        "ELIGIBLE_RH_ASSIGNEE",
      );
    }
    if (!isValidLegacyIdentity(row?.atribuido)) {
      return quarantine("atribuido", "ASSIGNEE_REFERENCE_INVALID");
    }
    return classifyResolution(context?.assigneeResolution, "atribuido", "ASSIGNEE_REFERENCE");
  };

  return {
    sourceTable,
    status: "confirmed",
    domain: "human-resources",
    ruleOrigin: evidenceDecision.ruleId,
    evidence: evidenceForRule(evidenceDecision),
    cardinality: "1:1",
    dependencies: ["tb_rh.colaboradores", "tb_admin.usuarios", "tb_rh.solicitacoes_categorias"],
    destinations: [
      {
        stepId,
        destinationTable: "rh.requests",
        mode: "insert",
        identity: generateIdentity("id", sourceTable),
        columns: [
          mapped("id", "id", "uuid_v5_from_full_source_table_and_legacy_id"),
          mapped("titulo", "title", "normalize_required_text"),
          mapped("descricao", "description", "normalize_required_text", personalOptions()),
          mapped("status", "status", "normalize_rh_request_status"),
          mapped("requerente", "requester_user_id", "resolve_collaborator_user_reference", {
            ...referenceOptions(),
            reason:
              "requerente referencia tb_rh.colaboradores.id e deve resolver o User ligado, nunca o mesmo id em tb_admin.usuarios.",
          }),
          mapped("atribuido", "assigned_to_user_id", "resolve_required_collaborator_rh_assignee", {
            ...referenceOptions(),
            nullHandling: "required_lookup_never_null",
            reason:
              "Assignee explícito referencia tb_rh.colaboradores.id e resolve seu User no tenant; ausência exige exatamente um User ativo no tenant, diferente do requester e com permissions.rh >= 1.",
          }),
          mapped(
            "categoria",
            "category_id",
            "resolve_request_category_reference",
            referenceOptions(),
          ),
          mapped("urgencia", "urgency", "normalize_rh_request_urgency"),
          mapped("data_cadastro", "created_at", "normalize_required_date"),
          mapped("data_atualizacao", "updated_at", "normalize_required_date_with_created_fallback"),
        ],
        constants: { organization_id: ORGANIZATION_ID },
        defaults: { description: "", urgency: "Low", status: "New" },
        precedence: ["legacy_identity", "explicit_assignee_user", "single_eligible_rh_assignee"],
        dependencies: ["tb_rh.colaboradores", "tb_admin.usuarios", "tb_rh.solicitacoes_categorias"],
      },
    ],
    classifySourceRow,
    emitRows(row, context) {
      const classification = classifySourceRow(row, context);
      return [
        emission({
          stepId,
          destinationTable: "rh.requests",
          identityRef:
            classification.status === "prepared"
              ? reference(sourceTable, row?.id)
              : invalidIdentityReference(sourceTable, classification.field ?? "id"),
          classification,
        }),
      ];
    },
  };
}

function createInsertRule({
  sourceTable,
  domain,
  stepId,
  destinationTable,
  columns,
  dependencies = [],
  references = [],
  unique = null,
  requiredTextFields = [],
  constants = {},
  defaults = {},
  precedence = ["legacy_identity"],
  classifyAfterBase = null,
}) {
  const evidenceDecision = requireConfirmedEvidence(sourceTable);
  const classifySourceRow = (row, context) => {
    const base = firstQuarantine([
      classifyIdentity(row, "id"),
      ...requiredTextFields.map((field) => classifyRequiredValue(row, field)),
      ...references.map((spec) => classifyReference(row, context, spec)),
      ...(unique === null
        ? []
        : [classifyUniqueResolution(context?.[unique.contextKey], unique.reasonPrefix)]),
    ]);
    if (base.status === "quarantine") return base;
    return classifyAfterBase?.(row, context) ?? prepared();
  };

  return {
    sourceTable,
    status: "confirmed",
    domain,
    ruleOrigin: evidenceDecision.ruleId,
    evidence: evidenceForRule(evidenceDecision),
    cardinality: "1:1",
    dependencies,
    destinations: [
      {
        stepId,
        destinationTable,
        mode: "insert",
        identity: generateIdentity("id", sourceTable),
        columns,
        constants: { organization_id: ORGANIZATION_ID, ...constants },
        defaults,
        precedence,
        dependencies,
      },
    ],
    classifySourceRow,
    emitRows(row, context) {
      const classification = classifySourceRow(row, context);
      return [
        emission({
          stepId,
          destinationTable,
          identityRef:
            classification.status === "prepared"
              ? reference(sourceTable, row?.id)
              : invalidIdentityReference(sourceTable, classification.field ?? "id"),
          classification,
        }),
      ];
    },
  };
}

function scoreEvaluationColumns() {
  const answerColumns = [];
  for (const prefix of ["p", "n", "obs"]) {
    for (let index = 1; index <= 8; index += 1) {
      answerColumns.push(
        mapped(`${prefix}${index}`, "answers", "aggregate_score_answers_json", {
          sensitivity: prefix === "obs" ? "personal" : "none",
          reason:
            "As respostas e observações legadas são agregadas deterministicamente no JSON answers atual.",
        }),
      );
    }
  }

  return [
    mapped("id", "id", "uuid_v5_from_full_source_table_and_legacy_id"),
    mapped(
      "trimestre",
      "score_id",
      "resolve_score_by_collaborator_and_quarter",
      referenceOptions(),
    ),
    mapped("tipo", "type", "normalize_score_question_type"),
    mapped("col_id", "score_id", "resolve_score_by_collaborator_and_quarter", referenceOptions()),
    mapped("user_id", "evaluator_id", "resolve_optional_user_reference", referenceOptions()),
    mapped("avaliador", "evaluator_role", "normalize_score_evaluator_role_code", {
      reason:
        "O legado grava o papel em avaliador: 0=SELF, 1=LEADER, 2=RH, 3=DIRECTOR, 4=TI e 5=SUBORDINATE.",
    }),
    mapped("status", "status", "normalize_score_evaluation_status"),
    ...answerColumns,
    mapped("p1", "average_score", "derive_average_from_aggregated_answers"),
  ];
}

function mapped(sourceColumn, destinationColumn, transformation, options = {}) {
  return {
    sourceColumn,
    destinationColumn,
    status: "mapped",
    transformation,
    nullHandling: options.nullHandling ?? "normalize_empty_to_null_or_quarantine_when_required",
    referenceRole: options.referenceRole ?? "none",
    sensitivity: options.sensitivity ?? "none",
    reason:
      options.reason ??
      `A coluna legada ${sourceColumn} alimenta ${destinationColumn} conforme o contrato atual validado.`,
  };
}

function notPreserved(sourceColumn, reason, options = {}) {
  return {
    sourceColumn,
    destinationColumn: null,
    status: "not_preserved",
    transformation: options.transformation ?? "not_preserved",
    nullHandling: "not_applicable",
    referenceRole: "none",
    sensitivity: options.sensitivity ?? "none",
    reason,
  };
}

function referenceOptions() {
  return {
    referenceRole: "foreign_key",
    reason:
      "A referência legada é resolvida por vínculo explícito e falhas nunca fabricam entidade.",
  };
}

function collaboratorReferenceOptions() {
  return {
    referenceRole: "foreign_key",
    reason:
      "O valor legado referencia tb_rh.colaboradores.id e deve resolver o User explicitamente ligado ao colaborador.",
  };
}

function credentialOptions() {
  return {
    sensitivity: "credential",
    nullHandling: "normalize_empty_to_null",
    reason: "O valor é credencial e somente pode ser persistido após criptografia verificada.",
  };
}

function personalOptions() {
  return {
    sensitivity: "personal",
    reason: "O dado pessoal é preservado somente no destino previsto e nunca integra a quarentena.",
  };
}

function requiredReference(field, contextKey, reasonPrefix) {
  return { field, contextKey, reasonPrefix, optional: false };
}

function optionalReference(field, contextKey, reasonPrefix) {
  return { field, contextKey, reasonPrefix, optional: true };
}

function classifyReference(row, context, spec) {
  const value = row?.[spec.field];
  if (spec.optional && isMissingLegacyReference(value)) return prepared();
  if (!isValidLegacyIdentity(value)) {
    return quarantine(spec.field, `${spec.reasonPrefix}_REFERENCE_INVALID`);
  }
  return classifyResolution(
    context?.[spec.contextKey],
    spec.field,
    `${spec.reasonPrefix}_REFERENCE`,
  );
}

function classifyResolution(state, field, reasonPrefix) {
  if (state === "one") return prepared();
  if (state === "zero") return quarantine(field, `${reasonPrefix}_NOT_FOUND`);
  if (state === "many") return quarantine(field, `${reasonPrefix}_AMBIGUOUS`);
  return quarantine(field, `${reasonPrefix}_LOOKUP_NOT_EXECUTED`);
}

function classifyUniqueResolution(state, reasonPrefix) {
  if (state === "zero") return prepared();
  if (state === "one" || state === "many") {
    return quarantine("id", `${reasonPrefix}_UNIQUE_CONFLICT`);
  }
  return quarantine("id", `${reasonPrefix}_UNIQUE_LOOKUP_NOT_EXECUTED`);
}

function classifyIdentity(row, field) {
  return isValidLegacyIdentity(row?.[field])
    ? prepared()
    : quarantine(field, "SOURCE_IDENTITY_INVALID");
}

function classifyRequiredValue(row, field) {
  return hasValue(row?.[field]) ? prepared() : quarantine(field, "REQUIRED_SOURCE_VALUE_EMPTY");
}

function firstQuarantine(classifications) {
  return classifications.find(({ status }) => status === "quarantine") ?? prepared();
}

function prepared() {
  return { status: "prepared" };
}

function quarantine(field, reasonCode) {
  return { status: "quarantine", field, reasonCode };
}

function emission({ stepId, destinationTable, identityRef, classification }) {
  return {
    stepId,
    destinationTable,
    status: classification.status,
    identityRef,
    field: classification.status === "quarantine" ? classification.field : null,
    reasonCode: classification.status === "quarantine" ? classification.reasonCode : null,
  };
}

function generateIdentity(legacyColumn, scope) {
  return { kind: "generate", legacyColumn, scope, namespace: REQUIRED_IDENTITY_NAMESPACE };
}

function resolveIdentity(sourceTable, sourceColumn, targetLegacyColumn) {
  return { kind: "resolve", sourceTable, sourceColumn, targetLegacyColumn };
}

function reference(sourceTable, legacyValue) {
  return `${sourceTable}:${String(legacyValue)}`;
}

function invalidIdentityReference(sourceTable, field) {
  return `quarantine:${sourceTable}:${field}:invalid`;
}

function isValidLegacyIdentity(value) {
  if (typeof value === "number") return Number.isSafeInteger(value) && value > 0;
  return typeof value === "string" && /^[1-9]\d*$/.test(value.trim());
}

function isMissingLegacyReference(value) {
  return (
    value === undefined || value === null || String(value).trim() === "" || String(value) === "0"
  );
}

function hasValue(value) {
  return value !== undefined && value !== null && String(value).trim().length > 0;
}

function evidenceForRule(evidenceDecision) {
  return {
    legacy: evidenceDecision.legacyReferences,
    current: evidenceDecision.currentContractEvidence,
  };
}

function requireConfirmedEvidence(sourceTable) {
  const evidenceDecision = EVIDENCE_BY_SOURCE.get(sourceTable);
  if (evidenceDecision?.finalStatus !== "confirmed" || evidenceDecision.ruleId === null) {
    throw new Error(`EvidenceDecision RH/Pessoal confirmed ausente para ${sourceTable}`);
  }
  return evidenceDecision;
}

function credentialStepId(sourceTable) {
  return `${sourceTable.replaceAll(".", "-")}-password-insert`;
}
