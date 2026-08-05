import { V2_EVIDENCE } from "../evidence/v2.mjs";
import { REQUIRED_IDENTITY_NAMESPACE } from "../lib/mapping-contract.mjs";
import { classifySensitivity } from "../lib/sensitivity.mjs";

const ORGANIZATION_ID = "e8048d1c-0830-45d7-84de-68e20abd685b";
const BCRYPT_PATTERN = /^\$2[aby]\$(?:0[4-9]|[12]\d|3[01])\$[./A-Za-z0-9]{53}$/;
const EVIDENCE_BY_SOURCE = new Map(V2_EVIDENCE.map((item) => [item.sourceTable, item]));

export const REGULARIZE_CREDENTIAL_SLOTS = Object.freeze([
  slot("gov-br", "Gov.br", "responsavel", "gov", ["gov"]),
  slot("regularize", "Regularize", "responsavel", "regularize", ["regularize"]),
  slot("simples", "Simples", "responsavel", "acesso_simples", ["acesso_simples"]),
  slot("bacen", "Bacen", "bacen_usuario", "bacen_senha", ["bacen_usuario", "bacen_senha"]),
  slot("mei", "MEI", "responsavel", "MEI", ["MEI"]),
  slot("sefaz", "SEFAZ", "inscricao_estadual", "sefaz", ["inscricao_estadual", "sefaz"]),
  slot("webiss-master", "WebISS Master", "responsavel", "webiss_master", ["webiss_master"]),
  slot(
    "webiss-cpf-1",
    "WebISS CPF",
    "webiss_usuario_cpf",
    "webiss_cpf",
    ["webiss_usuario_cpf", "webiss_cpf"],
    "webiss-cpf",
  ),
  slot(
    "webiss-cpf-2",
    "WebISS CPF",
    "webiss_usuario_cpf_dois",
    "webiss_cpf_dois",
    ["webiss_usuario_cpf_dois", "webiss_cpf_dois"],
    "webiss-cpf",
  ),
  slot("seifsa", "SEIFSA", "seifsa_usuario", "seifsa_senha", ["seifsa_usuario", "seifsa_senha"]),
]);

const REGULARIZE_CLIENT_FIELDS = [
  mapped("nome", "name"),
  mapped("razao_social", "company_name"),
  mapped("nome_fantasia", "fantasy_name"),
  mapped("cpf_cnpj", "cpf_cnpj", "normalize_cpf_cnpj", { sensitivity: "personal" }),
  mapped("cnae", "cnae", "normalize_digits"),
  mapped("responsavel", "responsible", "normalize_text", { sensitivity: "personal" }),
  mapped("fone", "number", "normalize_phone", { sensitivity: "personal" }),
  mapped("email", "email", "normalize_email", { sensitivity: "personal" }),
  mapped("endereco", "address", "normalize_text", { sensitivity: "personal" }),
  mapped("cep", "cep", "normalize_digits", { sensitivity: "personal" }),
  mapped("bairro", "neighborhood"),
  mapped("estado", "state"),
  mapped("municipio", "city"),
  mapped("cliente_desde", "customer_since", "normalize_date"),
  mapped("inscricao_municipal", "municipal_registration"),
  mapped("inscricao_estadual", "state_registration"),
  mapped("inscricao_junta_comercial", "commercial_board_registration"),
  mapped("situacao", "status", "normalize_status"),
  mapped("competencia_entrada", "competence_entry", "normalize_competence_date"),
  mapped("competencia_saida", "competence_output", "normalize_competence_date"),
];

export const V2_RULES = [
  directRule({
    sourceTable: "tb_admin.departamentos",
    domain: "administration",
    stepId: "department-insert",
    destinationTable: "departments",
    legacyColumn: "id",
    dependencies: [],
    columns: [
      mapped("id", "id", "uuid_v5"),
      mapped("nome", "name", "normalize_text"),
      mapped("color", "color", "normalize_color"),
      mapped("status", "status", "normalize_department_status"),
      mapped("parceiros", "solution", "normalize_boolean"),
    ],
    constants: { organization_id: ORGANIZATION_ID },
    defaults: { color: "#64748b", status: "Ativo", solution: false },
  }),
  directRule({
    sourceTable: "tb_admin.usuarios",
    domain: "administration",
    stepId: "user-insert",
    destinationTable: "users",
    legacyColumn: "id",
    dependencies: ["tb_admin.departamentos"],
    columns: [
      mapped("id", "id", "uuid_v5"),
      mapped("nome", "name", "normalize_text"),
      mapped("user", "login", "normalize_login"),
      mapped("password", "password", "select_bcrypt_migration_strategy", {
        sensitivity: "credential",
        reason:
          "Seletor executável preserva bcrypt válido e aplica bcrypt_hash_legacy_plaintext somente a texto legado não vazio.",
      }),
      mapped("cargo", "permission", "normalize_integer"),
      mapped("status", "status", "normalize_status"),
      mapped("departamento_id", "department_id", "resolve_department_reference"),
      mapped("img", "photo_url", "normalize_legacy_asset_reference"),
      mapped("nome", "full_name", "normalize_text"),
    ],
    constants: { organization_id: ORGANIZATION_ID, first_owner_flag: false },
    defaults: { permission: 0, status: "Ativo", session_version: 0 },
    classifySourceRow: classifyUserRow,
  }),
  createRule({
    sourceTable: "tb_rh.colaboradores",
    domain: "human-resources",
    cardinality: "N:1",
    dependencies: ["tb_admin.usuarios", "tb_admin.departamentos", "tb_rh.cargos"],
    destinations: [
      {
        stepId: "collaborator-user-merge",
        destinationTable: "users",
        mode: "merge",
        identity: resolveIdentity("tb_admin.usuarios", "user_id", "id"),
        columns: [
          notPreserved(
            "id",
            "O identificador de colaborador não substitui a identidade administrativa ligada por user_id.",
          ),
          mapped("user_id", "id", "resolve_explicit_legacy_link"),
          mapped("nome", "full_name", "normalize_text"),
          mapped("data_admissao", "hire_date", "normalize_date"),
          notPreserved(
            "data_admissao_dominio",
            "A data de admissão no Domínio não possui campo equivalente no contrato User atual.",
          ),
          mapped("data_demissao", "termination_date", "normalize_date"),
          mapped("genero", "gender", "normalize_text"),
          mapped("data_nascimento", "birth_date", "normalize_date", { sensitivity: "personal" }),
          mapped("cpf", "cpf", "normalize_cpf", { sensitivity: "personal" }),
          mapped("rg", "rg", "normalize_rg", { sensitivity: "personal" }),
          mapped("endereco", "address", "normalize_text", { sensitivity: "personal" }),
          mapped("departamento_id", "department_id", "resolve_department_reference"),
          mapped("email", "email", "normalize_email", { sensitivity: "personal" }),
          mapped("telefone", "phone", "normalize_phone", { sensitivity: "personal" }),
          mapped("foto", "photo_url", "normalize_legacy_asset_reference"),
          mapped("status", "status", "normalize_status"),
        ],
        constants: {},
        defaults: {},
        precedence: ["explicit_legacy_link", "rh_profile", "existing_admin_user"],
        dependencies: ["tb_admin.usuarios", "tb_admin.departamentos"],
      },
      {
        stepId: "collaborator-job-title-merge",
        destinationTable: "users",
        mode: "merge",
        identity: resolveIdentity("tb_admin.usuarios", "user_id", "id"),
        columns: [
          mapped("cargo", "job_title", "resolve_legacy_cargo_name", {
            nullHandling: "not_emit_when_legacy_cargo_is_empty_or_zero",
            referenceRole: "lookup_key",
            reason:
              "cargo é FK para tb_rh.cargos.id e somente o nome resolvido pode alimentar User.job_title.",
          }),
        ],
        constants: {},
        defaults: {},
        precedence: ["explicit_legacy_link", "cargo_name_lookup", "existing_admin_user"],
        dependencies: ["tb_admin.usuarios", "tb_rh.cargos"],
      },
    ],
    classifySourceRow: classifyCollaboratorRow,
    emitRows(row, context) {
      const classification = classifyCollaboratorRow(row, context);
      const jobTitleClassification =
        classification.status === "prepared" ? classification.jobTitleDecision : classification;
      const identityRef =
        classification.status === "prepared"
          ? reference("tb_admin.usuarios", row?.user_id)
          : invalidIdentityReference("tb_rh.colaboradores", "user_id");
      return [
        emission({
          stepId: "collaborator-user-merge",
          destinationTable: "users",
          identityRef,
          classification,
        }),
        emission({
          stepId: "collaborator-job-title-merge",
          destinationTable: "users",
          identityRef,
          classification: jobTitleClassification,
        }),
      ];
    },
  }),
  directRule({
    sourceTable: "tb_integracao.clientes",
    domain: "clients",
    stepId: "integration-client-insert",
    destinationTable: "clients",
    legacyColumn: "id",
    dependencies: [],
    columns: [
      mapped("id", "id", "uuid_v5"),
      mapped("nome", "name", "normalize_text"),
      mapped("nome", "company_name", "normalize_text"),
      mapped("nome_fantasia", "fantasy_name", "normalize_text"),
      mapped("tipo", "type", "normalize_client_type"),
      mapped("cpf_cnpj", "cpf_cnpj", "normalize_cpf_cnpj", { sensitivity: "personal" }),
      mapped("dataAbertura", "opening_date", "normalize_date"),
      mapped("socioAdm", "responsible", "normalize_text", { sensitivity: "personal" }),
      mapped("cpf_socio", "cpf_responsible", "normalize_cpf", { sensitivity: "personal" }),
      mapped("contato", "number", "normalize_phone", { sensitivity: "personal" }),
      mapped("email", "email", "normalize_email", { sensitivity: "personal" }),
      mapped("preposto", "agent", "normalize_text", { sensitivity: "personal" }),
      mapped("cpf_preposto", "cpf_agent", "normalize_cpf", { sensitivity: "personal" }),
      mapped("instagram", "instagram", "normalize_text"),
      mapped("indicacao", "indication", "normalize_text"),
      notPreserved(
        "grupo_id",
        "O identificador de grupo depende da relação clients groups e não pode ser copiado como escalar.",
      ),
      mapped("cidade", "city", "normalize_text"),
      notPreserved(
        "imagem",
        "O arquivo de imagem legado não é persistido pelo pacote de mapeamento sem migração de storage.",
      ),
      mapped("tipo_cliente", "status", "normalize_status"),
      mapped("inicio_contrato", "customer_since", "normalize_date"),
      mapped("endereco", "address", "normalize_text", { sensitivity: "personal" }),
      mapped("cep", "cep", "normalize_digits", { sensitivity: "personal" }),
      mapped("bairro", "neighborhood", "normalize_text"),
      mapped("estado", "state", "normalize_text"),
      notPreserved(
        "complexidade",
        "O contrato Client atual não possui campo de complexidade e não há adaptação equivalente comprovada.",
      ),
    ],
    constants: { organization_id: ORGANIZATION_ID },
    defaults: {
      status: "Migrado",
      prospecting_status: "Migrado do legado",
      cpf_cnpj: "",
      type: "PJ",
      type_registration: "Migrado",
    },
  }),
  createRule({
    sourceTable: "tb_regularize.clientes",
    domain: "clients",
    cardinality: "1:1",
    dependencies: ["tb_integracao.clientes"],
    destinations: [
      {
        stepId: "regularize-client-merge",
        destinationTable: "clients",
        mode: "merge",
        identity: resolveIdentity("tb_integracao.clientes", "cliente_id", "id"),
        columns: [
          mapped("cliente_id", "id", "resolve_explicit_legacy_link"),
          mapped("codigo", "dominio_code", "normalize_text"),
          ...REGULARIZE_CLIENT_FIELDS,
        ],
        constants: {},
        defaults: {},
        precedence: ["explicit_legacy_link", "source_regularize", "existing_integracao"],
        dependencies: ["tb_integracao.clientes"],
      },
      {
        stepId: "regularize-client-insert",
        destinationTable: "clients",
        mode: "insert",
        identity: generateIdentity("codigo", "tb_regularize.clientes"),
        columns: [
          mapped("codigo", "id", "uuid_v5"),
          mapped("codigo", "dominio_code", "normalize_text"),
          ...REGULARIZE_CLIENT_FIELDS,
          notPreserved(
            "cliente_id",
            "Sem vínculo explícito válido, cliente_id não identifica outra entidade e não é persistido.",
          ),
        ],
        constants: { organization_id: ORGANIZATION_ID },
        defaults: {
          status: "Migrado",
          prospecting_status: "Migrado do legado",
          cpf_cnpj: "",
          type: "PJ",
          type_registration: "Migrado",
        },
        precedence: ["source_regularize"],
        dependencies: [],
      },
    ],
    classifySourceRow: prepared,
    emitRows(row) {
      const linkPresent = hasExplicitLegacyLink(row?.cliente_id);
      const linkValid = isValidLegacyIdentity(row?.cliente_id);
      const sourceIdentity = classifyRequiredIdentity(
        row?.codigo,
        "codigo",
        "REGULARIZE_CLIENT_IDENTITY_INVALID",
      );
      const mergeClassification = !linkPresent
        ? notEmitted("REGULARIZE_CLIENT_WITHOUT_EXPLICIT_LINK")
        : linkValid
          ? prepared()
          : quarantine("cliente_id", "REGULARIZE_CLIENT_LINK_INVALID");
      const insertClassification = linkPresent
        ? notEmitted(
            linkValid
              ? "REGULARIZE_CLIENT_MERGED_BY_EXPLICIT_LINK"
              : "REGULARIZE_CLIENT_INVALID_EXPLICIT_LINK",
          )
        : sourceIdentity;
      return [
        emission({
          stepId: "regularize-client-merge",
          destinationTable: "clients",
          identityRef: linkValid
            ? reference("tb_integracao.clientes", row?.cliente_id)
            : invalidIdentityReference("tb_regularize.clientes", "cliente_id"),
          classification: mergeClassification,
        }),
        emission({
          stepId: "regularize-client-insert",
          destinationTable: "clients",
          identityRef:
            sourceIdentity.status === "prepared"
              ? reference("tb_regularize.clientes", row?.codigo)
              : invalidIdentityReference("tb_regularize.clientes", "codigo"),
          classification: insertClassification,
        }),
      ];
    },
  }),
  createRule({
    sourceTable: "tb_integracao.prospeccao_comercial",
    domain: "integration",
    cardinality: "1:N",
    dependencies: ["tb_integracao.clientes"],
    destinations: [
      {
        stepId: "prospecting-client-merge",
        destinationTable: "clients",
        mode: "merge",
        identity: resolveIdentity("tb_integracao.clientes", "cliente_id", "id"),
        columns: [
          mapped("cliente_id", "id", "resolve_explicit_legacy_link"),
          mapped("solucao", "description_prospecting", "normalize_text"),
          mapped("data_status", "date_status", "normalize_date"),
          mapped("status_prospeccao", "prospecting_status", "normalize_status"),
          notPreserved(
            "mes",
            "O mês isolado é derivável das datas preservadas e não possui campo autônomo no Client atual.",
          ),
          mapped("data_cadastro", "register_date_prospecting", "normalize_date"),
          mapped("participantes", "participants_meet", "normalize_text"),
          mapped("modo_reuniao", "meet_type", "normalize_text"),
          mapped("data_fechamento", "closing_date", "normalize_date"),
          mapped("ramo", "segment", "normalize_text"),
        ],
        constants: {},
        defaults: {},
        precedence: ["explicit_legacy_link", "commercial_facet", "existing_client"],
        dependencies: ["tb_integracao.clientes"],
      },
      {
        stepId: "prospecting-project-insert",
        destinationTable: "integracao.projects",
        mode: "insert",
        identity: generateIdentity("id", "tb_integracao.prospeccao_comercial"),
        columns: [
          mapped("id", "id", "uuid_v5"),
          mapped("servico", "name", "normalize_text"),
          mapped("cliente_id", "client_id", "resolve_client_reference"),
          mapped("situacao", "status", "normalize_status"),
          mapped("data_cadastro", "start_date", "normalize_date"),
          mapped("data_fechamento", "end_date", "normalize_date"),
          mapped("data_status", "end_date", "normalize_date_fallback"),
          mapped("solucao", "objective", "normalize_text"),
          mapped("status_prospeccao", "objective", "normalize_text_fallback"),
          mapped("porcentagem", "porcentage", "normalize_float"),
        ],
        constants: { organization_id: ORGANIZATION_ID },
        defaults: { status: "Migrado", porcentage: 0 },
        precedence: ["source", "fallback"],
        dependencies: ["tb_integracao.clientes"],
      },
    ],
    classifySourceRow: classifyClientLink,
    emitRows(row) {
      const clientClassification = classifyClientLink(row);
      const projectClassification =
        clientClassification.status === "prepared"
          ? classifyRequiredIdentity(row?.id, "id", "PROSPECTING_IDENTITY_INVALID")
          : clientClassification;
      return [
        emission({
          stepId: "prospecting-client-merge",
          destinationTable: "clients",
          identityRef:
            clientClassification.status === "prepared"
              ? reference("tb_integracao.clientes", row?.cliente_id)
              : invalidIdentityReference("tb_integracao.prospeccao_comercial", "cliente_id"),
          classification: clientClassification,
        }),
        emission({
          stepId: "prospecting-project-insert",
          destinationTable: "integracao.projects",
          identityRef: isValidLegacyIdentity(row?.id)
            ? reference("tb_integracao.prospeccao_comercial", row?.id)
            : invalidIdentityReference("tb_integracao.prospeccao_comercial", "id"),
          classification: projectClassification,
        }),
      ];
    },
  }),
  directRule({
    sourceTable: "tb_integracao.tarefas_express",
    domain: "integration",
    stepId: "task-model-insert",
    destinationTable: "integracao.tasksModel",
    legacyColumn: "id",
    dependencies: ["tb_admin.departamentos", "tb_admin.usuarios"],
    columns: [
      mapped("id", "id", "uuid_v5"),
      mapped("nome", "name", "normalize_text"),
      mapped("departamento_id", "department_id", "resolve_department_reference"),
      mapped("responsavel_id", "responsible_id", "resolve_user_reference"),
      mapped("responsavel_id_dois", "responsible2_id", "resolve_optional_user_reference"),
      mapped("responsavel_id_tres", "responsible3_id", "resolve_optional_user_reference"),
      notPreserved(
        "estado",
        "Estado é atributo de instância Task e não pertence ao contrato reutilizável TaskModel.",
      ),
      mapped("obs", "observations", "normalize_text"),
      mapped("cobranca", "billing", "normalize_text"),
      mapped("previsao", "prevision", "normalize_integer"),
    ],
    constants: { organization_id: ORGANIZATION_ID, type: "legacy-express" },
    defaults: { billing: "0", prevision: 0 },
  }),
  directRule({
    sourceTable: "tb_integracao.planos",
    domain: "integration",
    stepId: "project-plan-insert",
    destinationTable: "integracao.projectPlan",
    legacyColumn: "id",
    dependencies: [],
    columns: [
      mapped("id", "id", "uuid_v5"),
      mapped("nome", "name", "normalize_text"),
      mapped("color", "color", "normalize_color"),
    ],
    constants: { organization_id: ORGANIZATION_ID },
    defaults: { color: "#64748b" },
  }),
  directRule({
    sourceTable: "tb_integracao.tarefas_planos",
    domain: "integration",
    stepId: "project-plan-task-insert",
    destinationTable: "integracao.projectPlanTasks",
    legacyColumn: "id",
    dependencies: ["tb_integracao.planos", "tb_integracao.tarefas_express"],
    columns: [
      mapped("id", "id", "uuid_v5"),
      mapped("tarefa_express_id", "task_id", "resolve_task_model_reference"),
      mapped("plano_id", "plan_id", "resolve_project_plan_reference"),
      mapped("ordem", "order", "normalize_integer"),
    ],
    constants: { organization_id: ORGANIZATION_ID },
    defaults: { order: 0 },
  }),
  createTaskRule(),
  directRule({
    sourceTable: "tb_regularize.alvaras",
    domain: "regularize",
    stepId: "license-insert",
    destinationTable: "regularize.license",
    legacyColumn: "id",
    dependencies: ["tb_integracao.clientes", "tb_regularize.clientes", "tb_admin.usuarios"],
    columns: [
      mapped("id", "id", "uuid_v5"),
      mapped("cpf_cnpj", "client_id", "lookup_client_by_document", { sensitivity: "personal" }),
      mapped("empresa", "client_id", "lookup_client_by_name_fallback"),
      mapped("tipo_do_alvara", "type_license", "normalize_text"),
      mapped("data_de_entrada", "entry_date", "normalize_required_date"),
      mapped("protocolo", "protocol", "normalize_text"),
      mapped("responsavel", "responsible_id", "resolve_optional_user_reference"),
      mapped("status", "status", "normalize_status"),
      mapped("data_ultima_consulta", "date_last_consultation", "normalize_date"),
      mapped("situacao_atual", "current_situation", "normalize_text"),
      mapped("contato", "contact", "normalize_text", { sensitivity: "personal" }),
      mapped("observacao", "observation", "normalize_text"),
      mapped("urgencia", "urgency", "normalize_text"),
      mapped("tipo", "type", "normalize_text"),
      notPreserved(
        "protocolo_arquivo",
        "O arquivo de protocolo exige migração de storage e não possui coluna escalar equivalente em License.",
      ),
    ],
    constants: { organization_id: ORGANIZATION_ID, has: true },
    defaults: {
      status: "Migrado",
      current_situation: "Não informado",
      contact: "Não informado",
      urgency: "0",
      type: "0",
      due_date: null,
      task_id: null,
    },
  }),
  directRule({
    sourceTable: "tb_regularize.processos",
    domain: "regularize",
    stepId: "process-insert",
    destinationTable: "regularize.process",
    legacyColumn: "id",
    dependencies: ["tb_integracao.clientes", "tb_regularize.clientes", "tb_admin.usuarios"],
    columns: [
      mapped("id", "id", "uuid_v5"),
      mapped("cpf_cnpj", "client_pj_id", "lookup_client_by_document", {
        sensitivity: "personal",
      }),
      mapped("cliente", "client_pj_id", "lookup_client_by_name_fallback"),
      mapped("cpf_cnpj", "cpf_cnpj", "normalize_cpf_cnpj", { sensitivity: "personal" }),
      mapped("processo", "process_type", "normalize_text"),
      mapped("descricao", "description", "normalize_text"),
      mapped("data_entrada", "entry_date", "normalize_date"),
      mapped("data_finalizacao", "completion_date", "normalize_date"),
      notPreserved(
        "meta",
        "Meta é quantidade de dias no legado e não pode ser convertida na expected_date sem uma data base inequívoca.",
      ),
      notPreserved(
        "dias_corridos",
        "Dias corridos é contador operacional derivado e não possui campo no contrato Process atual.",
      ),
      mapped("status", "status", "normalize_status"),
      mapped("observacao", "observation", "normalize_text"),
      notPreserved(
        "financeiro",
        "O estado financeiro legado não possui campo equivalente no contrato Process atual.",
      ),
      notPreserved(
        "data_env_fiscal",
        "A data de envio fiscal não possui campo equivalente no contrato Process atual.",
      ),
      notPreserved(
        "data_ret_fiscal",
        "A data de retorno fiscal não possui campo equivalente no contrato Process atual.",
      ),
      mapped("responsavel_um", "responsible1_id", "resolve_optional_user_reference"),
      mapped("responsavel_dois", "responsible2_id", "resolve_optional_user_reference"),
      mapped("responsavel_tres", "responsible3_id", "resolve_optional_user_reference"),
      mapped("urgencia", "urgency", "normalize_text"),
      notPreserved(
        "tipo",
        "A categoria numérica de origem não possui campo equivalente no contrato Process atual.",
      ),
      mapped("travamento_cliente_notificacao", "locking_type", "normalize_text"),
    ],
    constants: { organization_id: ORGANIZATION_ID },
    defaults: {
      process_type: "Não informado",
      description: "Não informado",
      status: "Migrado",
      expected_date: null,
      client_pf_id: null,
      task_id: null,
    },
  }),
  createGuidanceRule(),
  createPartnerAggregateRule(),
  directRule({
    sourceTable: "tb_regularize.taxas_municipais",
    domain: "regularize",
    stepId: "municipal-tax-insert",
    destinationTable: "regularize.municipalTaxes",
    legacyColumn: "id",
    dependencies: ["tb_regularize.clientes", "tb_integracao.clientes"],
    columns: [
      mapped("id", "id", "uuid_v5"),
      mapped("cliente", "client_id", "resolve_regularize_client_reference"),
      mapped("ano", "year", "normalize_integer"),
      mapped("tff_possui", "tff_is_applicable", "normalize_boolean"),
      mapped("tff_valor", "tff_amount", "normalize_float"),
      mapped("tff_obs", "tff_notes", "normalize_text"),
      mapped("tff_analise_feito", "tff_analysis_is_done", "normalize_boolean"),
      mapped("tff_analise_obs", "tff_analysis_notes", "normalize_text"),
      mapped("tff_envio_data", "tff_sent_date", "normalize_date"),
      mapped("tff_vencimento", "tff_due_date", "normalize_date"),
      mapped("tlp_possui", "tlp_is_applicable", "normalize_boolean"),
      mapped("tlp_obs", "tlp_notes", "normalize_text"),
      mapped("tlp_envio", "tlp_is_sent", "normalize_text"),
      mapped("tlp_envio_data", "tlp_sent_date", "normalize_date"),
      mapped("vencimento", "tlp_due_date", "normalize_date"),
      mapped("email", "tlp_not_email", "normalize_boolean", { sensitivity: "none" }),
    ],
    constants: { organization_id: ORGANIZATION_ID },
    defaults: {
      tff_is_applicable: false,
      tff_amount: 0,
      tff_analysis_is_done: false,
      tlp_is_applicable: false,
      tlp_amount: 0,
      tlp_is_sent: "0",
      tlp_not_email: false,
      tll_is_applicable: false,
      tll_amount: 0,
      tll_notes: null,
      tll_is_sent: "0",
      tll_sent_date: null,
      tll_due_date: null,
      tll_analysis_is_done: false,
      tll_analysis_notes: null,
    },
  }),
  createCredentialRule(),
];

export const v2Rules = V2_RULES;

function createTaskRule() {
  const sourceTable = "tb_integracao.tarefas";
  const dependencies = [
    "tb_integracao.tarefas_express",
    "tb_integracao.prospeccao_comercial",
    "tb_integracao.clientes",
    "tb_admin.departamentos",
    "tb_admin.usuarios",
  ];
  return createRule({
    sourceTable,
    domain: "integration",
    cardinality: "1:N",
    dependencies,
    destinations: [
      {
        stepId: "task-model-lookup",
        destinationTable: "integracao.tasksModel",
        mode: "lookup",
        identity: lookupIdentity(
          [
            ["nome", "name"],
            ["departamento_id", "department_id"],
          ],
          "null",
        ),
        columns: [
          mapped("nome", "name", "normalize_lookup_text"),
          mapped("departamento_id", "department_id", "resolve_department_reference"),
        ],
        constants: {},
        defaults: {},
        precedence: ["name_and_department_lookup"],
        dependencies: ["tb_integracao.tarefas_express"],
      },
      {
        stepId: "task-model-derived",
        destinationTable: "integracao.tasksModel",
        mode: "derived",
        identity: generateIdentity("id", `${sourceTable}:derived-model`),
        columns: [
          mapped("id", "id", "uuid_v5_derived_task_model"),
          mapped("nome", "name", "normalize_text"),
          mapped("departamento_id", "department_id", "resolve_department_reference"),
          mapped("responsavel_id", "responsible_id", "resolve_user_reference"),
          mapped("responsavel_id_dois", "responsible2_id", "resolve_optional_user_reference"),
          mapped("responsavel_id_tres", "responsible3_id", "resolve_optional_user_reference"),
          mapped("obs", "observations", "normalize_text"),
          mapped("cobranca", "billing", "normalize_text"),
        ],
        constants: { organization_id: ORGANIZATION_ID, type: "legacy-ad-hoc" },
        defaults: { billing: "0", prevision: 0 },
        precedence: ["derive_when_lookup_zero"],
        dependencies: ["tb_admin.departamentos", "tb_admin.usuarios"],
      },
      {
        stepId: "task-project-lookup",
        destinationTable: "integracao.projects",
        mode: "lookup",
        identity: lookupIdentity([["cliente_id", "client_id"]], "null"),
        columns: [mapped("cliente_id", "client_id", "resolve_client_reference")],
        constants: {},
        defaults: {},
        precedence: ["explicit_client_id", "single_project_for_client"],
        dependencies: ["tb_integracao.prospeccao_comercial", "tb_integracao.clientes"],
      },
      {
        stepId: "task-project-derived",
        destinationTable: "integracao.projects",
        mode: "derived",
        identity: generateIdentity("id", `${sourceTable}:derived-project`),
        columns: [
          mapped("id", "id", "uuid_v5_derived_project"),
          mapped("nome", "name", "derive_technical_project_name"),
          mapped("cliente_id", "client_id", "resolve_client_reference"),
          mapped("estado", "status", "normalize_status"),
        ],
        constants: { organization_id: ORGANIZATION_ID },
        defaults: { status: "Migrado", porcentage: 0 },
        precedence: ["derive_when_lookup_zero", "preserve_client_id"],
        dependencies: ["tb_integracao.clientes"],
      },
      {
        stepId: "task-insert",
        destinationTable: "integracao.tasks",
        mode: "insert",
        identity: generateIdentity("id", sourceTable),
        columns: [
          mapped("id", "id", "uuid_v5"),
          mapped(null, "model_id", "resolve_or_derive_task_model"),
          mapped(null, "project_id", "resolve_or_derive_project"),
          mapped("cliente_id", "client_id", "resolve_client_reference"),
          mapped("nome", "name", "normalize_text"),
          mapped("estado", "status", "normalize_status"),
          mapped("departamento_id", "department_id", "resolve_department_reference"),
          mapped("responsavel_id", "responsible_id", "resolve_user_reference"),
          mapped("responsavel_id_dois", "responsible2_id", "resolve_optional_user_reference"),
          mapped("responsavel_id_tres", "responsible3_id", "resolve_optional_user_reference"),
          notPreserved(
            "realizado",
            "O indicador realizado é redundante com o status e as datas preservadas da Task atual.",
          ),
          mapped("data_previsao", "prevision_date", "normalize_date"),
          mapped("data_resolucao", "end_date", "normalize_date"),
          mapped("obs", "observations", "normalize_text"),
          notPreserved(
            "ano",
            "O ano isolado é derivável das datas preservadas e não possui campo autônomo na Task atual.",
          ),
          mapped("cobranca", "billing", "normalize_text"),
          mapped("data_cadastro", "start_date", "normalize_date"),
          mapped("data_cadastro", "date_created", "normalize_date"),
          mapped("data_update", "date_updated", "normalize_date"),
          mapped("urgencia", "urgency", "normalize_text"),
          mapped("reuniao", "meeting", "normalize_text"),
        ],
        constants: { organization_id: ORGANIZATION_ID },
        defaults: { billing: "0", urgency: "0" },
        precedence: ["source", "resolved_or_derived_dependencies"],
        dependencies,
      },
    ],
    classifySourceRow: classifyTaskRow,
    emitRows(row, context) {
      const rowClassification = classifyTaskRow(row);
      const model = resolutionClassifications(context?.taskModelResolution, "nome", {
        ambiguousReason: "TASK_MODEL_AMBIGUOUS",
        notExecutedReason: "TASK_MODEL_LOOKUP_NOT_EXECUTED",
        zeroReason: "TASK_MODEL_NOT_FOUND_DERIVE",
        foundReason: "TASK_MODEL_RESOLVED_NO_DERIVE",
      });
      const project = resolutionClassifications(context?.projectResolution, "cliente_id", {
        ambiguousReason: "TASK_PROJECT_AMBIGUOUS",
        notExecutedReason: "TASK_PROJECT_LOOKUP_NOT_EXECUTED",
        zeroReason: "TASK_PROJECT_NOT_FOUND_DERIVE",
        foundReason: "TASK_PROJECT_RESOLVED_NO_DERIVE",
      });
      const dependencyFailure = [model.lookup, project.lookup].find(
        ({ status }) => status === "quarantine",
      );
      const taskClassification =
        rowClassification.status === "quarantine"
          ? rowClassification
          : (dependencyFailure ?? prepared());
      const rowIdentityRef = isValidLegacyIdentity(row?.id)
        ? reference(sourceTable, row?.id)
        : invalidIdentityReference(sourceTable, "id");
      const modelLookupClassification =
        rowClassification.status === "prepared" ? model.lookup : rowClassification;
      const modelDerivedClassification =
        rowClassification.status === "prepared" ? model.derived : rowClassification;
      const projectLookupClassification =
        rowClassification.status === "prepared" ? project.lookup : rowClassification;
      const projectDerivedClassification =
        rowClassification.status === "prepared" ? project.derived : rowClassification;

      return [
        emission({
          stepId: "task-model-lookup",
          destinationTable: "integracao.tasksModel",
          identityRef: `${rowIdentityRef}:model-lookup`,
          classification: modelLookupClassification,
        }),
        emission({
          stepId: "task-model-derived",
          destinationTable: "integracao.tasksModel",
          identityRef: `${rowIdentityRef}:model-derived`,
          classification: modelDerivedClassification,
        }),
        emission({
          stepId: "task-project-lookup",
          destinationTable: "integracao.projects",
          identityRef: `${rowIdentityRef}:project-lookup`,
          classification: projectLookupClassification,
        }),
        emission({
          stepId: "task-project-derived",
          destinationTable: "integracao.projects",
          identityRef: `${rowIdentityRef}:project-derived`,
          classification: projectDerivedClassification,
        }),
        emission({
          stepId: "task-insert",
          destinationTable: "integracao.tasks",
          identityRef: rowIdentityRef,
          classification: taskClassification,
        }),
      ];
    },
  });
}

function createGuidanceRule() {
  const sourceTable = "tb_regularize.orientaoes_processual";
  return createRule({
    sourceTable,
    domain: "regularize",
    cardinality: "1:N",
    dependencies: ["tb_regularize.processos", "tb_regularize.clientes"],
    destinations: [
      {
        stepId: "guidance-process-lookup",
        destinationTable: "regularize.process",
        mode: "lookup",
        identity: lookupIdentity([["processo_id", "id"]], "null"),
        columns: [mapped("processo_id", "id", "resolve_legacy_process_reference")],
        constants: {},
        defaults: {},
        precedence: ["explicit_process_id"],
        dependencies: ["tb_regularize.processos"],
      },
      {
        stepId: "guidance-process-derived",
        destinationTable: "regularize.process",
        mode: "derived",
        identity: generateIdentity("id", `${sourceTable}:technical-process`),
        columns: [
          mapped("id", "id", "uuid_v5_technical_guidance_process"),
          mapped("cliente_id", "client_pj_id", "resolve_regularize_client_reference"),
          mapped("cnpj", "cpf_cnpj", "normalize_cpf_cnpj", { sensitivity: "personal" }),
          mapped("solicitacao", "description", "normalize_text"),
        ],
        constants: {
          organization_id: ORGANIZATION_ID,
          process_type: "Processo técnico para orientação legada",
          status: "Migrado",
        },
        defaults: {
          cpf_cnpj: "Não informado",
          description: "Orientação legada sem processo correspondente",
          client_pf_id: null,
          task_id: null,
        },
        precedence: ["derive_only_without_valid_process"],
        dependencies: ["tb_regularize.clientes"],
      },
      {
        stepId: "guidance-insert",
        destinationTable: "regularize.proceduralGuidances",
        mode: "insert",
        identity: generateIdentity("id", sourceTable),
        columns: [
          mapped("id", "id", "uuid_v5"),
          mapped("processo_id", "process_id", "resolve_or_derive_process"),
          mapped("tipo", "type", "normalize_text"),
          mapped("solicitacao", "request", "normalize_text"),
          mapped("obs_quadro", "framework_obs", "normalize_text"),
          mapped("natureza_juridica", "legal_nature", "normalize_text"),
          mapped("razao_social", "company_name", "normalize_text"),
          mapped("nome_fantasia", "trade_name", "normalize_text"),
          mapped("cnpj", "cpf_cnpj", "normalize_cpf_cnpj", { sensitivity: "personal" }),
          mapped("capital_social", "share_capital", "normalize_float"),
          mapped("iptu", "iptu", "normalize_text"),
          mapped("endereco", "address", "normalize_text", { sensitivity: "personal" }),
          mapped("obj_social", "comporate_purpose", "normalize_text"),
          mapped("porte", "carryng", "normalize_text"),
          mapped("regime", "regime", "normalize_text"),
          mapped("representante_legal", "legal_representative", "normalize_text", {
            sensitivity: "personal",
          }),
          notPreserved(
            "arquivo",
            "O arquivo legado exige migração de storage e não possui coluna escalar na orientação atual.",
          ),
          mapped("status", "status", "normalize_status"),
        ],
        constants: { organization_id: ORGANIZATION_ID },
        defaults: { status: "Migrado", economic_activities: null, partners: null },
        precedence: ["source", "resolved_or_derived_process"],
        dependencies: ["tb_regularize.processos", "tb_regularize.clientes"],
      },
    ],
    classifySourceRow: prepared,
    emitRows(row, context) {
      const rowClassification = classifyRequiredIdentity(
        row?.id,
        "id",
        "GUIDANCE_IDENTITY_INVALID",
      );
      const processLinkPresent = hasExplicitLegacyLink(row?.processo_id);
      const processLinkValid = isValidLegacyIdentity(row?.processo_id);
      const process = !processLinkPresent
        ? {
            lookup: notEmitted("GUIDANCE_WITHOUT_EXPLICIT_PROCESS"),
            derived: prepared(),
          }
        : !processLinkValid
          ? {
              lookup: quarantine("processo_id", "GUIDANCE_PROCESS_LINK_INVALID"),
              derived: notEmitted("INVALID_PROCESS_LINK_NOT_DERIVED"),
            }
          : resolutionClassifications(context?.processResolution, "processo_id", {
              ambiguousReason: "GUIDANCE_PROCESS_AMBIGUOUS",
              notExecutedReason: "GUIDANCE_PROCESS_LOOKUP_NOT_EXECUTED",
              zeroReason: "GUIDANCE_PROCESS_NOT_FOUND",
              foundReason: "GUIDANCE_PROCESS_RESOLVED_NO_DERIVE",
              deriveOnZero: false,
            });
      const guidanceClassification =
        rowClassification.status === "quarantine"
          ? rowClassification
          : process.lookup.status === "quarantine"
            ? process.lookup
            : prepared();
      const lookupClassification =
        rowClassification.status === "prepared" ? process.lookup : rowClassification;
      const derivedClassification =
        rowClassification.status === "prepared" ? process.derived : rowClassification;
      const rowIdentityRef =
        rowClassification.status === "prepared"
          ? reference(sourceTable, row?.id)
          : invalidIdentityReference(sourceTable, "id");
      return [
        emission({
          stepId: "guidance-process-lookup",
          destinationTable: "regularize.process",
          identityRef: reference("tb_regularize.processos", row?.processo_id),
          classification: lookupClassification,
        }),
        emission({
          stepId: "guidance-process-derived",
          destinationTable: "regularize.process",
          identityRef: `${rowIdentityRef}:technical-process`,
          classification: derivedClassification,
        }),
        emission({
          stepId: "guidance-insert",
          destinationTable: "regularize.proceduralGuidances",
          identityRef: rowIdentityRef,
          classification: guidanceClassification,
        }),
      ];
    },
  });
}

function createPartnerAggregateRule() {
  const sourceTable = "tb_regularize.orientaoes_processual.socios";
  return createRule({
    sourceTable,
    domain: "regularize",
    cardinality: "N:1",
    dependencies: ["tb_regularize.orientaoes_processual"],
    destinations: [
      {
        stepId: "guidance-partners-aggregate",
        destinationTable: "regularize.proceduralGuidances",
        mode: "aggregate",
        identity: {
          kind: "aggregate",
          parentSourceTable: "tb_regularize.orientaoes_processual",
          parentLegacyColumn: "id",
          childForeignKey: "op_id",
        },
        columns: [
          mapped("id", "partners", "aggregate_partner_uuid"),
          mapped("op_id", "partners", "aggregate_parent_reference"),
          mapped("nome", "partners", "aggregate_partner_name", { sensitivity: "personal" }),
          mapped("porcent", "partners", "aggregate_partner_share"),
          mapped("cpf", "partners", "aggregate_partner_cpf", { sensitivity: "personal" }),
          mapped("cargo", "partners", "aggregate_partner_role"),
          notPreserved(
            "prof",
            "O JSON GuidancePartner atual não possui campo de profissão e não autoriza ampliar o contrato.",
          ),
          notPreserved(
            "civil",
            "O JSON GuidancePartner atual não possui campo de estado civil e não autoriza ampliar o contrato.",
          ),
          notPreserved(
            "rg",
            "O JSON GuidancePartner atual não possui campo de RG e não autoriza ampliar o contrato.",
          ),
          notPreserved(
            "cnh",
            "O JSON GuidancePartner atual não possui campo de CNH e não autoriza ampliar o contrato.",
          ),
          notPreserved(
            "endereco",
            "O JSON GuidancePartner atual não possui campo de endereço e não autoriza ampliar o contrato.",
          ),
        ],
        constants: {},
        defaults: {},
        precedence: ["append_in_legacy_id_order"],
        dependencies: ["tb_regularize.orientaoes_processual"],
      },
    ],
    classifySourceRow: classifyPartnerRow,
    emitRows(rowOrRows) {
      const rows = (Array.isArray(rowOrRows) ? [...rowOrRows] : [rowOrRows]).sort(
        comparePartnerRows,
      );
      return rows.map((row) => {
        const classification = classifyPartnerRow(row);
        return emission({
          stepId: "guidance-partners-aggregate",
          destinationTable: "regularize.proceduralGuidances",
          identityRef:
            classification.status === "prepared"
              ? reference("tb_regularize.orientaoes_processual", row?.op_id, `partner-${row.id}`)
              : invalidIdentityReference(
                  sourceTable,
                  isValidLegacyIdentity(row?.op_id) ? "id" : "op_id",
                ),
          classification,
        });
      });
    },
  });
}

function createCredentialRule() {
  const sourceTable = "tb_regularize.clientes_senhas";
  const siteSlots = [
    ...new Map(REGULARIZE_CREDENTIAL_SLOTS.map((item) => [item.siteKey, item])).values(),
  ];
  const siteDestinations = siteSlots.map((credentialSlot) => ({
    stepId: credentialSiteStepId(credentialSlot),
    destinationTable: "regularize.passowordsSites",
    mode: "derived",
    identity: generateIdentity("organization_id", `${sourceTable}:site:${credentialSlot.siteKey}`),
    columns: [mapped(null, "id", "uuid_v5_credential_site")],
    constants: {
      name: credentialSlot.siteName,
      sphere: "legacy",
      user: "",
      password: "",
      status: true,
      organization_id: ORGANIZATION_ID,
    },
    defaults: { link: null },
    precedence: ["logical_site_scope", "organization_scope"],
    dependencies: [],
  }));
  const credentialDestinations = REGULARIZE_CREDENTIAL_SLOTS.map((credentialSlot, index) => ({
    stepId: credentialSlotStepId(credentialSlot),
    destinationTable: "regularize.passwordsRegularize",
    mode: "insert",
    identity: generateIdentity("id", `${sourceTable}:credential:${credentialSlot.slotKey}`),
    columns: [
      mapped("id", "id", "uuid_v5_per_credential_slot"),
      mapped("empresa", "client_id", "resolve_regularize_client_reference"),
      mapped(null, "site_id", "resolve_credential_site"),
      ...credentialSlotColumns(credentialSlot),
      mapped(null, "notes", "credential_slot_audit_note"),
      ...(index === 0
        ? [
            notPreserved(
              "certificado_pj",
              "Certificado PJ é artefato criptográfico, não uma senha de site, e exige fluxo próprio de storage.",
            ),
            notPreserved(
              "certificado_pf",
              "Certificado PF é artefato criptográfico, não uma senha de site, e exige fluxo próprio de storage.",
            ),
          ]
        : []),
    ],
    constants: { organization_id: ORGANIZATION_ID },
    defaults: { notes: null },
    precedence: ["logical_slot_scope", "encrypted_login_and_password"],
    dependencies: ["tb_regularize.clientes", "tb_integracao.clientes"],
  }));
  const destinations = [...siteDestinations, ...credentialDestinations];
  const destinationsByStep = new Map(
    destinations.map((destination) => [destination.stepId, destination]),
  );
  return createRule({
    sourceTable,
    domain: "regularize",
    cardinality: "1:N",
    dependencies: ["tb_regularize.clientes", "tb_integracao.clientes"],
    destinations,
    classifySourceRow: prepared,
    emitRows(row, context) {
      const activeSlots = REGULARIZE_CREDENTIAL_SLOTS.filter((credentialSlot) =>
        credentialSlot.activationColumns.some((column) => hasValue(row?.[column])),
      );
      const activeSites = [...new Map(activeSlots.map((item) => [item.siteKey, item])).values()];
      return [
        ...activeSites.map((credentialSlot) =>
          emission({
            stepId: credentialSiteStepId(credentialSlot),
            destinationTable: "regularize.passowordsSites",
            identityRef: generatedIdentityReference(
              destinationsByStep.get(credentialSiteStepId(credentialSlot)),
              row,
            ),
            classification: prepared(),
          }),
        ),
        ...activeSlots.map((credentialSlot) => {
          const classification = classifyCredentialEmission(row, context, credentialSlot);
          return emission({
            stepId: credentialSlotStepId(credentialSlot),
            destinationTable: "regularize.passwordsRegularize",
            identityRef: isValidLegacyIdentity(row?.id)
              ? generatedIdentityReference(
                  destinationsByStep.get(credentialSlotStepId(credentialSlot)),
                  row,
                )
              : invalidIdentityReference(sourceTable, "id"),
            classification,
          });
        }),
      ];
    },
  });
}

function credentialSiteStepId(credentialSlot) {
  return `credential-site-${credentialSlot.siteKey}`;
}

function credentialSlotStepId(credentialSlot) {
  return `credential-slot-${credentialSlot.slotKey}`;
}

function credentialSlotColumns(credentialSlot) {
  return [
    mapped(credentialSlot.loginColumn, "login", "encrypt_credential", {
      sensitivity: "credential",
      reason: `Login do slot lógico ${credentialSlot.siteName} exige criptografia do contrato atual.`,
    }),
    mapped(credentialSlot.passwordColumn, "password", "encrypt_credential", {
      sensitivity: "credential",
      reason: `Senha do slot lógico ${credentialSlot.siteName} exige criptografia do contrato atual.`,
    }),
  ];
}

function directRule({
  sourceTable,
  domain,
  stepId,
  destinationTable,
  legacyColumn,
  dependencies,
  columns,
  constants,
  defaults,
  classifySourceRow = prepared,
}) {
  const classifyDirectSourceRow = (row, context) => {
    const identityClassification = classifyRequiredIdentity(
      row?.[legacyColumn],
      legacyColumn,
      "SOURCE_IDENTITY_INVALID",
    );
    return identityClassification.status === "prepared"
      ? classifySourceRow(row, context)
      : identityClassification;
  };
  return createRule({
    sourceTable,
    domain,
    cardinality: "1:1",
    dependencies,
    destinations: [
      {
        stepId,
        destinationTable,
        mode: "insert",
        identity: generateIdentity(legacyColumn, sourceTable),
        columns,
        constants,
        defaults,
        precedence: ["source", "defaults"],
        dependencies,
      },
    ],
    classifySourceRow: classifyDirectSourceRow,
    emitRows(row, context) {
      const classification = classifyDirectSourceRow(row, context);
      return [
        emission({
          stepId,
          destinationTable,
          identityRef: isValidLegacyIdentity(row?.[legacyColumn])
            ? reference(sourceTable, row?.[legacyColumn])
            : invalidIdentityReference(sourceTable, legacyColumn),
          classification,
        }),
      ];
    },
  });
}

function createRule({
  sourceTable,
  domain,
  cardinality,
  dependencies,
  destinations,
  classifySourceRow,
  emitRows,
}) {
  const evidenceDecision = EVIDENCE_BY_SOURCE.get(sourceTable);
  if (evidenceDecision === undefined) {
    throw new Error(`EvidenceDecision V2 ausente para ${sourceTable}`);
  }
  return {
    sourceTable,
    status: "confirmed",
    domain,
    ruleOrigin: evidenceDecision.ruleId,
    evidence: {
      legacy: evidenceDecision.legacyReferences,
      current: evidenceDecision.currentContractEvidence,
    },
    cardinality,
    dependencies,
    destinations,
    classifySourceRow,
    emitRows,
  };
}

function mapped(sourceColumn, destinationColumn, transformation, options = {}) {
  return {
    sourceColumn,
    destinationColumn,
    status: "mapped",
    transformation: transformation ?? inferTransformation(destinationColumn),
    nullHandling: options.nullHandling ?? "normalize_empty_to_null_or_quarantine_when_required",
    referenceRole: options.referenceRole ?? inferReferenceRole(destinationColumn),
    sensitivity: options.sensitivity ?? inferSensitivity(sourceColumn, destinationColumn),
    reason:
      options.reason ??
      "Comportamento legado e contrato atual comprovam este mapeamento de coluna.",
  };
}

function notPreserved(sourceColumn, reason) {
  return {
    sourceColumn,
    destinationColumn: null,
    status: "not_preserved",
    transformation: "discard_without_persisting_value",
    nullHandling: "not_applicable",
    referenceRole: "none",
    sensitivity: inferSensitivity(sourceColumn, null),
    reason,
  };
}

function generateIdentity(legacyColumn, scope) {
  return {
    kind: "generate",
    legacyColumn,
    scope,
    namespace: REQUIRED_IDENTITY_NAMESPACE,
  };
}

function resolveIdentity(sourceTable, sourceColumn, targetLegacyColumn) {
  return { kind: "resolve", sourceTable, sourceColumn, targetLegacyColumn };
}

function lookupIdentity(pairs, onZero) {
  return {
    kind: "lookup",
    criteria: pairs.map(([sourceColumn, destinationColumn]) => ({
      sourceColumn,
      destinationColumn,
    })),
    onZero,
    onMany: "quarantine",
  };
}

function emission({ stepId, destinationTable, identityRef, classification }) {
  return {
    stepId,
    destinationTable,
    status: classification.status,
    identityRef,
    field: classification.status === "quarantine" ? classification.field : null,
    reasonCode: classification.status === "prepared" ? null : classification.reasonCode,
  };
}

function reference(sourceTable, legacyValue, suffix = null) {
  const safeLegacyValue = safeReferencePart(legacyValue);
  return suffix === null
    ? `${sourceTable}:${safeLegacyValue}`
    : `${sourceTable}:${safeLegacyValue}:${safeReferencePart(suffix)}`;
}

function generatedIdentityReference(destination, row) {
  const { identity } = destination;
  const legacyValue = Object.hasOwn(destination.constants, identity.legacyColumn)
    ? destination.constants[identity.legacyColumn]
    : row?.[identity.legacyColumn];
  return `${identity.scope}:${safeReferencePart(legacyValue)}`;
}

function safeReferencePart(value) {
  if (
    (typeof value === "string" || typeof value === "number") &&
    /^[A-Za-z0-9_.-]+$/.test(String(value))
  ) {
    return String(value);
  }
  return "unknown";
}

function invalidIdentityReference(sourceTable, field) {
  return `quarantine:${sourceTable}:${field}:invalid`;
}

function prepared() {
  return { status: "prepared" };
}

function quarantine(field, reasonCode) {
  return { status: "quarantine", field, reasonCode };
}

function notEmitted(reasonCode) {
  return { status: "not_emitted", reasonCode };
}

function classifyUserRow(row) {
  if (!hasValue(row?.password)) {
    return quarantine("password", "USER_PASSWORD_EMPTY");
  }
  return {
    status: "prepared",
    selectedTransformation: BCRYPT_PATTERN.test(String(row.password))
      ? "bcrypt_passthrough_if_valid"
      : "bcrypt_hash_legacy_plaintext",
  };
}

function classifyRequiredIdentity(value, field, reasonCode) {
  return isValidLegacyIdentity(value) ? prepared() : quarantine(field, reasonCode);
}

function classifyCollaboratorRow(row, context) {
  if (!hasExplicitLegacyLink(row?.user_id)) {
    return quarantine("user_id", "USER_LINK_EMPTY");
  }
  if (!isValidLegacyIdentity(row?.user_id)) {
    return quarantine("user_id", "USER_LINK_INVALID");
  }
  return {
    status: "prepared",
    jobTitleDecision: classifyCollaboratorJobTitle(row, context),
  };
}

function classifyCollaboratorJobTitle(row, context) {
  if (!hasExplicitLegacyLink(row?.cargo)) {
    return notEmitted("COLLABORATOR_CARGO_EMPTY_NO_JOB_TITLE");
  }
  if (!isValidLegacyCargoId(row?.cargo)) {
    return quarantine("cargo", "COLLABORATOR_CARGO_LINK_INVALID");
  }
  if (context?.cargoResolution === "zero") {
    return quarantine("cargo", "COLLABORATOR_CARGO_NOT_FOUND");
  }
  if (context?.cargoResolution === "many") {
    return quarantine("cargo", "COLLABORATOR_CARGO_AMBIGUOUS");
  }
  if (context?.cargoResolution !== "one") {
    return quarantine("cargo", "COLLABORATOR_CARGO_LOOKUP_NOT_EXECUTED");
  }
  return isResolvedJobTitleName(context?.cargoResolvedName)
    ? prepared()
    : quarantine("cargo", "COLLABORATOR_CARGO_NAME_INVALID");
}

function isValidLegacyCargoId(value) {
  return /^\d+$/.test(String(value)) && BigInt(String(value)) > 0n;
}

function isResolvedJobTitleName(value) {
  return typeof value === "string" && value.trim().length > 0 && !/^\d+$/.test(value.trim());
}

function classifyClientLink(row) {
  if (!hasExplicitLegacyLink(row?.cliente_id)) {
    return quarantine("cliente_id", "CLIENT_LINK_EMPTY");
  }
  return isValidLegacyIdentity(row?.cliente_id)
    ? prepared()
    : quarantine("cliente_id", "CLIENT_LINK_INVALID");
}

function classifyTaskRow(row) {
  if (!isValidLegacyIdentity(row?.id)) {
    return quarantine("id", "TASK_IDENTITY_INVALID");
  }
  if (!hasExplicitLegacyLink(row?.cliente_id)) {
    return quarantine("cliente_id", "TASK_CLIENT_LINK_EMPTY");
  }
  if (!isValidLegacyIdentity(row?.cliente_id)) {
    return quarantine("cliente_id", "TASK_CLIENT_LINK_INVALID");
  }
  if (!hasValue(row?.nome)) {
    return quarantine("nome", "TASK_NAME_EMPTY");
  }
  return prepared();
}

function classifyPartnerRow(row) {
  if (!hasExplicitLegacyLink(row?.op_id)) {
    return quarantine("op_id", "GUIDANCE_PARTNER_PARENT_EMPTY");
  }
  if (!isValidLegacyIdentity(row?.op_id)) {
    return quarantine("op_id", "GUIDANCE_PARTNER_PARENT_INVALID");
  }
  return isValidLegacyIdentity(row?.id)
    ? prepared()
    : quarantine("id", "GUIDANCE_PARTNER_IDENTITY_INVALID");
}

function comparePartnerRows(left, right) {
  return (
    compareLegacyIdentityValues(left?.op_id, right?.op_id) ||
    compareLegacyIdentityValues(left?.id, right?.id)
  );
}

function compareLegacyIdentityValues(left, right) {
  const leftText = String(left ?? "");
  const rightText = String(right ?? "");
  if (/^\d+$/.test(leftText) && /^\d+$/.test(rightText)) {
    const leftNumber = BigInt(leftText);
    const rightNumber = BigInt(rightText);
    return leftNumber < rightNumber ? -1 : leftNumber > rightNumber ? 1 : 0;
  }
  return leftText < rightText ? -1 : leftText > rightText ? 1 : 0;
}

function classifyCredentialEmission(row, context, credentialSlot) {
  if (!isValidLegacyIdentity(row?.id)) {
    return quarantine("id", "CREDENTIAL_SOURCE_IDENTITY_INVALID");
  }
  if (!isValidLegacyIdentity(row?.empresa)) {
    return quarantine("empresa", "CREDENTIAL_CLIENT_LINK_INVALID");
  }
  if (context?.credentialEncryptionVerified !== true) {
    return quarantine(credentialSlot.passwordColumn, "CREDENTIAL_REQUIRES_ENCRYPTION");
  }
  if (!hasValue(row?.[credentialSlot.loginColumn])) {
    return quarantine(credentialSlot.loginColumn, "CREDENTIAL_LOGIN_EMPTY");
  }
  if (!hasValue(row?.[credentialSlot.passwordColumn])) {
    return quarantine(credentialSlot.passwordColumn, "CREDENTIAL_PASSWORD_EMPTY");
  }
  return prepared();
}

function resolutionClassifications(resolutionState, field, options) {
  if (resolutionState === "many") {
    return {
      lookup: quarantine(field, options.ambiguousReason),
      derived: notEmitted("AMBIGUOUS_REFERENCE_NOT_DERIVED"),
    };
  }
  if (resolutionState === "one") {
    return { lookup: prepared(), derived: notEmitted(options.foundReason) };
  }
  if (resolutionState === "zero") {
    return options.deriveOnZero === false
      ? {
          lookup: quarantine(field, options.zeroReason),
          derived: notEmitted("CONFIRMED_ZERO_NOT_DERIVED"),
        }
      : {
          lookup: notEmitted(options.zeroReason),
          derived: prepared(),
        };
  }
  return {
    lookup: quarantine(field, options.notExecutedReason),
    derived: notEmitted("LOOKUP_NOT_EXECUTED_NO_DERIVE"),
  };
}

function slot(
  slotKey,
  siteName,
  loginColumn,
  passwordColumn,
  activationColumns,
  siteKey = slotKey,
) {
  return Object.freeze({
    slotKey,
    siteKey,
    siteName,
    loginColumn,
    passwordColumn,
    activationColumns: Object.freeze(activationColumns),
  });
}

function hasValue(value) {
  return value !== null && value !== undefined && String(value).trim().length > 0;
}

function hasExplicitLegacyLink(value) {
  return hasValue(value) && String(value).trim() !== "0";
}

function isValidLegacyIdentity(value) {
  return (
    hasExplicitLegacyLink(value) &&
    (typeof value === "string" || typeof value === "number") &&
    /^[A-Za-z0-9_.-]+$/.test(String(value))
  );
}

function inferTransformation(destinationColumn) {
  if (destinationColumn === "id") return "uuid_v5";
  if (destinationColumn?.endsWith("_id")) return "resolve_legacy_reference";
  if (destinationColumn?.includes("date") || destinationColumn?.endsWith("_at")) {
    return "normalize_date";
  }
  if (destinationColumn === "status") return "normalize_status";
  return "normalize_scalar";
}

function inferReferenceRole(destinationColumn) {
  if (destinationColumn === "id") return "identity";
  if (destinationColumn?.endsWith("_id")) return "foreign_key";
  return "none";
}

function inferSensitivity(sourceColumn, destinationColumn) {
  if (destinationColumn === "password" || destinationColumn === "login") {
    return "credential";
  }
  const detected = classifySensitivity(sourceColumn);
  if (detected !== "none") return detected;
  if (/cpf|cnpj|rg|email|fone|telefone|contato|endereco|address/i.test(sourceColumn ?? "")) {
    return "personal";
  }
  return "none";
}
