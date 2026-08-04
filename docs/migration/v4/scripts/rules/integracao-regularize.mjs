import { createHash } from "node:crypto";

import { INTEGRACAO_REGULARIZE_EVIDENCE } from "../evidence/integracao-regularize.mjs";
import { REQUIRED_IDENTITY_NAMESPACE } from "../lib/mapping-contract.mjs";

const ORGANIZATION_ID = "e8048d1c-0830-45d7-84de-68e20abd685b";
const EVIDENCE_BY_SOURCE = new Map(
  INTEGRACAO_REGULARIZE_EVIDENCE.map((decision) => [decision.sourceTable, decision]),
);
const RESOLUTION_STATES = new Set(["one", "zero", "many"]);

export function buildIntegrationRegularizeContext(sourceTable, row, resolutions) {
  if (typeof sourceTable !== "string" || !/^[A-Za-z0-9_.]+$/.test(sourceTable)) {
    throw new TypeError("sourceTable deve ser um identificador legado sanitizado");
  }
  if (!isPlainObject(row) || !isPlainObject(resolutions)) {
    throw new TypeError("row e resolutions devem ser objetos");
  }
  const normalizedResolutions = Object.fromEntries(
    Object.entries(resolutions)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([name, resolution]) => [name, normalizeResolution(resolution)]),
  );
  const rowFingerprint = fingerprintRow(row);
  const signature = contextSignature(sourceTable, rowFingerprint, normalizedResolutions);
  return Object.freeze({
    sourceTable,
    rowFingerprint,
    resolutions: Object.freeze(normalizedResolutions),
    signature,
  });
}

export const INTEGRACAO_REGULARIZE_RULES = Object.freeze([
  createIntegrationGroupRule(),
  createPaRule(),
  createPaHistoryRule(),
  createTaskDependentRule(),
  createTerminationTaskRule(),
  createTaskRegularizeRule(),
  createRegularizeAgendaRule(),
  createRegularizeGroupRule(),
  createRegularizeGroupMemberRule(),
  createGuidanceActivityRule(),
  createClientPfRule(),
  createPartnerRule(),
  createClientPfExpirationRule(),
]);

function createIntegrationGroupRule() {
  return createInsertRule({
    sourceTable: "tb_integracao.grupos",
    domain: "integration",
    stepId: "integration-group-insert",
    destinationTable: "clients.group",
    identityColumn: "id",
    columns: [
      mapped("id", "id", "uuid_v5_from_full_source_table_and_legacy_id"),
      mapped("nome", "name", "normalize_required_text"),
    ],
    defaults: { status: true },
    classify(row) {
      return firstQuarantine([
        classifyIdentity(row?.id, "id", "INTEGRATION_GROUP_ID_INVALID"),
        classifyText(row?.nome, "nome", "INTEGRATION_GROUP_NAME_EMPTY"),
      ]);
    },
  });
}

function createPaRule() {
  return createInsertRule({
    sourceTable: "tb_integracao.pa",
    domain: "integration",
    stepId: "integration-pa-merge",
    destinationTable: "clients.pa",
    mode: "merge",
    identity: resolveIdentity("tb_integracao.clientes", "cliente_id", "id"),
    dependencies: ["tb_integracao.clientes"],
    columns: [
      notPreserved("id", "A identidade atual de PA é client_id, não o id auxiliar legado."),
      mapped("cliente_id", "client_id", "resolve_explicit_client_reference", referenceOptions()),
      notPreserved(
        "regime",
        "O regime genérico não distingue o regime de apuração exigido pelo PA atual.",
      ),
      mapped("atividades", "activities", "normalize_text"),
      notPreserved(
        "cnae_principal",
        "O CNAE pertence ao Client e não é atualizado lateralmente pelo PA.",
      ),
      notPreserved("cnae_secundario", "A lista CNAE pertence ao Client e não é inferida pelo PA."),
      mapped("faturamento_mensal", "tax_billing", "normalize_text"),
      mapped("faturamento_anual", "management_billing", "normalize_text"),
      mapped("licitacao", "works_bidding", "normalize_boolean"),
      notPreserved(
        "nome_socio",
        "Sócio possui identidade própria e não é comprimido em campo textual de PA.",
      ),
      mapped("colaboradores_registrados", "registered_collabortors", "normalize_integer"),
      mapped("colaboradores_nao_registrados", "unregistered_collabortors", "normalize_integer"),
      mapped("esocial", "esocial", "normalize_boolean"),
      mapped("quant_bancos", "how_many_banks", "normalize_presence_boolean"),
      mapped("quais_bancos", "whitch_banks", "normalize_text"),
      mapped("responsaveis_deps", "responsible_departments", "normalize_text"),
      mapped("trabalha_com_sistema", "works_system", "normalize_boolean"),
      mapped("nome_sistema", "system_name", "normalize_text"),
      mapped("tempo_uso_sistema", "system_usage_time", "normalize_text"),
      mapped("valor_sistema", "system_value", "normalize_text"),
      mapped("contato_sistema", "system_contact", "normalize_text", personalOptions()),
      mapped("operacoes_sistema", "system_operations", "normalize_text"),
      mapped("armazenamento_nuvem", "cloud_storage", "normalize_boolean"),
      mapped("qualNuvem", "which_cloud_storage", "normalize_text"),
      notPreserved(
        "departamentos",
        "A enumeração não possui coluna equivalente distinta no PA atual.",
      ),
      mapped("servicos", "services", "normalize_text"),
      mapped("mudanca", "dissatisfaction", "normalize_text"),
      mapped("contrato_aluguel", "rental_agreement", "normalize_boolean"),
      mapped("regime_apuracao", "assessment_regime", "normalize_text"),
      mapped("alvara", "permit", "normalize_text"),
    ],
    classify(row, context) {
      return classifyWithContext({
        sourceTable: "tb_integracao.pa",
        row,
        context,
        identityField: "id",
        resolutions: [
          requiredResolution("client", "cliente_id", ["tb_integracao.clientes"], "PA_CLIENT"),
        ],
      });
    },
  });
}

function createPaHistoryRule() {
  return createInsertRule({
    sourceTable: "tb_integracao.pa_historicos",
    domain: "integration",
    stepId: "integration-pa-history-insert",
    destinationTable: "clients.history",
    identityColumn: "id",
    dependencies: ["tb_integracao.clientes", "tb_admin.usuarios"],
    columns: [
      mapped("id", "id", "uuid_v5_from_full_source_table_and_legacy_id"),
      mapped("cliente_id", "client_id", "resolve_explicit_client_reference", referenceOptions()),
      mapped("dia", "date", "normalize_required_datetime"),
      mapped("historico", "history", "normalize_required_text", personalOptions()),
      mapped("arquivo", "file", "normalize_legacy_asset_reference"),
      mapped("user_id", "user_id", "resolve_explicit_user_reference", referenceOptions()),
    ],
    classify(row, context) {
      return classifyWithContext({
        sourceTable: "tb_integracao.pa_historicos",
        row,
        context,
        identityField: "id",
        resolutions: [
          requiredResolution(
            "client",
            "cliente_id",
            ["tb_integracao.clientes"],
            "PA_HISTORY_CLIENT",
          ),
          requiredResolution("user", "user_id", ["tb_admin.usuarios"], "PA_HISTORY_USER"),
        ],
      });
    },
  });
}

function createTaskDependentRule() {
  return createInsertRule({
    sourceTable: "tb_integracao.tarefas_dependentes",
    domain: "integration",
    stepId: "task-dependent-insert",
    destinationTable: "integracao.tasksDependent",
    identityColumn: "id",
    dependencies: ["tb_integracao.tarefas_express"],
    columns: [
      mapped("id", "id", "uuid_v5_from_full_source_table_and_legacy_id"),
      mapped(
        "tarefa_express_id",
        "task_id",
        "resolve_explicit_task_model_reference",
        referenceOptions(),
      ),
      mapped(
        "dependente_id",
        "dependent_id",
        "resolve_explicit_task_model_reference",
        referenceOptions(),
      ),
      mapped("obs", "observation", "normalize_text"),
      mapped("espera", "wait", "normalize_boolean"),
    ],
    defaults: { observation: "", wait: false },
    classify(row, context) {
      if (
        isValidIdentity(row?.tarefa_express_id) &&
        String(row.tarefa_express_id) === String(row?.dependente_id)
      ) {
        return quarantine("dependente_id", "TASK_DEPENDENCY_SELF_REFERENCE");
      }
      return classifyWithContext({
        sourceTable: "tb_integracao.tarefas_dependentes",
        row,
        context,
        identityField: "id",
        resolutions: [
          requiredResolution(
            "taskModel",
            "tarefa_express_id",
            ["tb_integracao.tarefas_express"],
            "TASK_MODEL",
          ),
          requiredResolution(
            "dependentModel",
            "dependente_id",
            ["tb_integracao.tarefas_express"],
            "DEPENDENT_MODEL",
          ),
        ],
      });
    },
  });
}

function createTaskRegularizeRule() {
  return createInsertRule({
    sourceTable: "tb_integracao.tarefas_regularize",
    domain: "integration",
    stepId: "task-regularize-link-insert",
    destinationTable: "integracao.tasksIntegrationRegularize",
    identityColumn: "id",
    dependencies: ["tb_integracao.tarefas_express"],
    columns: [
      mapped("id", "id", "uuid_v5_from_full_source_table_and_legacy_id"),
      mapped(
        "tarefa",
        "task_model_id",
        "resolve_explicit_task_model_reference",
        referenceOptions(),
      ),
      mapped("vinculo", "referring", "normalize_required_text"),
      mapped(null, "referring_type", "derive_legacy_regularize_referring_type"),
    ],
    defaults: { referring_type: "legacy-regularize" },
    classify(row, context) {
      const base = classifyWithContext({
        sourceTable: "tb_integracao.tarefas_regularize",
        row,
        context,
        identityField: "id",
        resolutions: [
          requiredResolution(
            "taskModel",
            "tarefa",
            ["tb_integracao.tarefas_express"],
            "TASK_REGULARIZE_MODEL",
          ),
        ],
      });
      return base.status === "prepared"
        ? classifyText(row?.vinculo, "vinculo", "TASK_REGULARIZE_REFERRING_EMPTY")
        : base;
    },
  });
}

function createRegularizeGroupRule() {
  return createInsertRule({
    sourceTable: "tb_regularize.grupos",
    domain: "regularize",
    stepId: "regularize-group-insert",
    destinationTable: "clients.group",
    identityColumn: "id",
    columns: [
      mapped("id", "id", "uuid_v5_from_full_source_table_and_legacy_id"),
      mapped("nome", "name", "normalize_required_text"),
      mapped("situacao", "status", "normalize_active_status"),
    ],
    defaults: { status: true },
    classify(row) {
      return firstQuarantine([
        classifyIdentity(row?.id, "id", "REGULARIZE_GROUP_ID_INVALID"),
        classifyText(row?.nome, "nome", "REGULARIZE_GROUP_NAME_EMPTY"),
      ]);
    },
  });
}

function createRegularizeGroupMemberRule() {
  return createInsertRule({
    sourceTable: "tb_regularize.grupos_integrantes",
    domain: "regularize",
    stepId: "regularize-group-member-insert",
    destinationTable: "clients.clientsGroup",
    identityColumn: "id",
    dependencies: ["tb_regularize.grupos", "tb_regularize.clientes"],
    columns: [
      mapped("id", "id", "uuid_v5_from_full_source_table_and_legacy_id"),
      mapped(
        "codigo_cliente",
        "client_id",
        "resolve_explicit_regularize_client_reference",
        referenceOptions(),
      ),
      mapped(
        "grupo_id",
        "group_id",
        "resolve_explicit_regularize_group_reference",
        referenceOptions(),
      ),
    ],
    classify(row, context) {
      return classifyWithContext({
        sourceTable: "tb_regularize.grupos_integrantes",
        row,
        context,
        identityField: "id",
        resolutions: [
          requiredResolution(
            "client",
            "codigo_cliente",
            ["tb_regularize.clientes"],
            "GROUP_MEMBER_CLIENT",
          ),
          requiredResolution("group", "grupo_id", ["tb_regularize.grupos"], "GROUP_MEMBER_GROUP"),
        ],
      });
    },
  });
}

function createPartnerRule() {
  return createInsertRule({
    sourceTable: "tb_regularize.pf_empresas",
    domain: "regularize",
    stepId: "regularize-partner-insert",
    destinationTable: "regularize.partners",
    identityColumn: "id",
    dependencies: ["tb_regularize.pf", "tb_regularize.clientes"],
    columns: [
      mapped("id", "id", "uuid_v5_from_full_source_table_and_legacy_id"),
      mapped("pf_id", "pf_id", "resolve_explicit_client_pf_reference", referenceOptions()),
      mapped(
        "empresa_id",
        "pj_id",
        "resolve_explicit_regularize_client_reference",
        referenceOptions(),
      ),
      mapped("parte", "part", "normalize_percentage"),
      mapped("entrada", "entry", "normalize_required_date"),
      mapped("saida", "exit", "normalize_zero_date_to_null"),
    ],
    classify(row, context) {
      return classifyWithContext({
        sourceTable: "tb_regularize.pf_empresas",
        row,
        context,
        identityField: "id",
        resolutions: [
          requiredResolution("clientPf", "pf_id", ["tb_regularize.pf"], "PARTNER_PF"),
          requiredResolution("client", "empresa_id", ["tb_regularize.clientes"], "PARTNER_PJ"),
        ],
      });
    },
  });
}

function createTerminationTaskRule() {
  const sourceTable = "tb_integracao.tarefas_distrato";
  const dependencies = ["tb_integracao.clientes", "tb_admin.departamentos", "tb_admin.usuarios"];
  const destinations = [
    lookupStep({
      stepId: "termination-task-model-lookup",
      destinationTable: "integracao.tasksModel",
      criteria: [
        ["nome", "name"],
        ["departamento_id", "department_id"],
      ],
      columns: [
        mapped("nome", "name", "normalize_lookup_text"),
        mapped(
          "departamento_id",
          "department_id",
          "resolve_explicit_department_reference",
          referenceOptions(),
        ),
      ],
      dependencies: ["tb_admin.departamentos"],
    }),
    destination({
      stepId: "termination-task-model-derived",
      destinationTable: "integracao.tasksModel",
      mode: "derived",
      identity: generateIdentity("id", `${sourceTable}:derived-model`),
      columns: [
        mapped("id", "id", "uuid_v5_derived_task_model"),
        mapped("nome", "name", "normalize_required_text"),
        mapped(
          "departamento_id",
          "department_id",
          "resolve_explicit_department_reference",
          referenceOptions(),
        ),
        mapped(
          "responsavel_id",
          "responsible_id",
          "resolve_explicit_user_reference",
          referenceOptions(),
        ),
        mapped(
          "responsavel_id_dois",
          "responsible2_id",
          "resolve_optional_user_reference",
          referenceOptions(),
        ),
        mapped(
          "responsavel_id_tres",
          "responsible3_id",
          "resolve_optional_user_reference",
          referenceOptions(),
        ),
        mapped("obs", "observations", "normalize_text", personalOptions()),
        mapped("cobranca", "billing", "normalize_task_billing"),
      ],
      constants: { organization_id: ORGANIZATION_ID, type: "legacy-termination" },
      defaults: { billing: "0", prevision: 0 },
      precedence: ["derive_only_when_lookup_zero"],
      dependencies: ["tb_admin.departamentos", "tb_admin.usuarios"],
    }),
    lookupStep({
      stepId: "termination-project-lookup",
      destinationTable: "integracao.projects",
      criteria: [["cliente_id", "client_id"]],
      columns: [
        mapped("cliente_id", "client_id", "resolve_explicit_client_reference", referenceOptions()),
      ],
      dependencies: ["tb_integracao.clientes"],
    }),
    destination({
      stepId: "termination-project-derived",
      destinationTable: "integracao.projects",
      mode: "derived",
      identity: generateIdentity("id", `${sourceTable}:derived-project`),
      columns: [
        mapped("id", "id", "uuid_v5_derived_project"),
        mapped("nome", "name", "derive_termination_project_name"),
        mapped("cliente_id", "client_id", "resolve_explicit_client_reference", referenceOptions()),
        mapped("estado", "status", "normalize_task_status"),
        mapped("data_previsao", "end_date", "normalize_zero_date_to_null"),
        mapped("obs", "objective", "normalize_text", personalOptions()),
      ],
      constants: { organization_id: ORGANIZATION_ID },
      defaults: { status: "Migrado", porcentage: 0 },
      precedence: ["derive_only_when_lookup_zero", "preserve_task_client"],
      dependencies: ["tb_integracao.clientes"],
    }),
    destination({
      stepId: "termination-task-insert",
      destinationTable: "integracao.tasks",
      mode: "insert",
      identity: generateIdentity("id", sourceTable),
      columns: [
        mapped("id", "id", "uuid_v5_from_full_source_table_and_legacy_id"),
        mapped(null, "model_id", "resolve_or_derive_task_model"),
        mapped(null, "project_id", "resolve_or_derive_project"),
        mapped("cliente_id", "client_id", "resolve_explicit_client_reference", referenceOptions()),
        mapped("nome", "name", "normalize_required_text"),
        mapped("estado", "status", "normalize_task_status"),
        mapped(
          "departamento_id",
          "department_id",
          "resolve_explicit_department_reference",
          referenceOptions(),
        ),
        mapped(
          "responsavel_id",
          "responsible_id",
          "resolve_explicit_user_reference",
          referenceOptions(),
        ),
        mapped(
          "responsavel_id_dois",
          "responsible2_id",
          "resolve_optional_user_reference",
          referenceOptions(),
        ),
        mapped(
          "responsavel_id_tres",
          "responsible3_id",
          "resolve_optional_user_reference",
          referenceOptions(),
        ),
        notPreserved(
          "realizado",
          "O indicador é redundante com status e datas preservados na Task.",
        ),
        mapped("data_previsao", "prevision_date", "normalize_zero_date_to_null"),
        mapped("data_resolucao", "end_date", "normalize_zero_date_to_null"),
        mapped("obs", "observations", "normalize_text", personalOptions()),
        notPreserved(
          "ano",
          "O ano é derivável das datas e não possui campo autônomo na Task atual.",
        ),
        mapped("cobranca", "billing", "normalize_task_billing"),
      ],
      constants: { organization_id: ORGANIZATION_ID },
      defaults: { billing: "0", urgency: "0" },
      precedence: ["source", "resolved_or_derived_dependencies"],
      dependencies,
    }),
  ];
  return createRule({
    sourceTable,
    domain: "integration",
    cardinality: "1:N",
    dependencies,
    destinations,
    classifySourceRow: classifyTerminationTask,
    emitRows(row, context) {
      const classification = classifyTerminationTask(row, context);
      const identityRef = rowReference(sourceTable, row?.id);
      if (classification.status !== "prepared") {
        return destinations.map((step) =>
          emission(step, classification, `${identityRef}:${step.stepId}`),
        );
      }
      const modelState = context.resolutions.taskModel.state;
      const projectState = context.resolutions.project.state;
      return [
        emission(
          destinations[0],
          modelState === "one" ? prepared() : notEmitted("TASK_MODEL_NOT_FOUND_DERIVE"),
          `${identityRef}:model-lookup`,
        ),
        emission(
          destinations[1],
          modelState === "zero" ? prepared() : notEmitted("TASK_MODEL_RESOLVED_NO_DERIVE"),
          `${identityRef}:model-derived`,
        ),
        emission(
          destinations[2],
          projectState === "one" ? prepared() : notEmitted("TASK_PROJECT_NOT_FOUND_DERIVE"),
          `${identityRef}:project-lookup`,
        ),
        emission(
          destinations[3],
          projectState === "zero" ? prepared() : notEmitted("TASK_PROJECT_RESOLVED_NO_DERIVE"),
          `${identityRef}:project-derived`,
        ),
        emission(destinations[4], prepared(), identityRef),
      ];
    },
  });
}

function classifyTerminationTask(row, context) {
  const basic = firstQuarantine([
    classifyIdentity(row?.id, "id", "TERMINATION_TASK_ID_INVALID"),
    classifyText(row?.nome, "nome", "TERMINATION_TASK_NAME_EMPTY"),
    classifyIdentity(row?.cliente_id, "cliente_id", "TERMINATION_TASK_CLIENT_INVALID"),
    classifyIdentity(
      row?.departamento_id,
      "departamento_id",
      "TERMINATION_TASK_DEPARTMENT_INVALID",
    ),
    classifyIdentity(row?.responsavel_id, "responsavel_id", "TERMINATION_TASK_RESPONSIBLE_INVALID"),
  ]);
  if (basic.status !== "prepared") return basic;
  if (!isContextBound("tb_integracao.tarefas_distrato", row, context)) {
    return quarantine("id", "INTEGRATION_CONTEXT_MISMATCH");
  }
  const specifications = [
    requiredResolution("client", "cliente_id", ["tb_integracao.clientes"], "TASK_CLIENT"),
    requiredResolution(
      "department",
      "departamento_id",
      ["tb_admin.departamentos"],
      "TASK_DEPARTMENT",
    ),
    requiredResolution("responsible", "responsavel_id", ["tb_admin.usuarios"], "TASK_RESPONSIBLE"),
    optionalResolution(
      "responsible2",
      "responsavel_id_dois",
      ["tb_admin.usuarios"],
      "TASK_RESPONSIBLE2",
    ),
    optionalResolution(
      "responsible3",
      "responsavel_id_tres",
      ["tb_admin.usuarios"],
      "TASK_RESPONSIBLE3",
    ),
  ];
  for (const specification of specifications) {
    const classification = classifyResolution(context, specification, row);
    if (classification.status !== "prepared") return classification;
  }
  const model = context.resolutions.taskModel;
  if (!model || !RESOLUTION_STATES.has(model.state))
    return quarantine("nome", "TASK_MODEL_LOOKUP_NOT_EXECUTED");
  if (model.state === "many") return quarantine("nome", "TASK_MODEL_AMBIGUOUS");
  if (model.relatedIdentityRef !== context.resolutions.department.identityRef) {
    return quarantine("departamento_id", "TASK_MODEL_DEPARTMENT_MISMATCH");
  }
  const project = context.resolutions.project;
  if (!project || !RESOLUTION_STATES.has(project.state))
    return quarantine("cliente_id", "TASK_PROJECT_LOOKUP_NOT_EXECUTED");
  if (project.state === "many") return quarantine("cliente_id", "TASK_PROJECT_AMBIGUOUS");
  if (project.relatedIdentityRef !== context.resolutions.client.identityRef) {
    return quarantine("cliente_id", "TASK_PROJECT_CLIENT_MISMATCH");
  }
  return prepared();
}

function createRegularizeAgendaRule() {
  const sourceTable = "tb_regularize.agenda";
  const dependencies = ["tb_regularize.clientes", "tb_admin.departamentos", "tb_admin.usuarios"];
  const commonColumns = [
    mapped("id", "id", "uuid_v5_from_full_source_table_and_legacy_id"),
    mapped("title", "agenda", "normalize_required_text"),
    mapped("subject", "obs", "normalize_text", personalOptions()),
    mapped(
      "departamento",
      "department_control_id",
      "resolve_explicit_department_reference",
      referenceOptions(),
    ),
    mapped(
      "responsavel_id",
      "participant_id",
      "resolve_optional_user_reference",
      referenceOptions(),
    ),
    mapped(
      "cliente_id",
      "client_id",
      "resolve_optional_regularize_client_reference",
      referenceOptions(),
    ),
  ];
  const destinations = [
    destination({
      stepId: "regularize-agenda-insert",
      destinationTable: "agenda",
      mode: "insert",
      identity: generateIdentity("id", `${sourceTable}:single`),
      columns: [
        ...commonColumns,
        mapped("start", "date", "normalize_required_datetime"),
        mapped("status", "status", "normalize_text"),
        notPreserved("recorrente", "O indicador apenas seleciona o destino não recorrente."),
      ],
      constants: { organization_id: ORGANIZATION_ID },
      defaults: { location: null, task_id: null },
      precedence: ["emit_when_not_recurring"],
      dependencies,
    }),
    destination({
      stepId: "regularize-recurring-agenda-insert",
      destinationTable: "agenda.recurring",
      mode: "insert",
      identity: generateIdentity("id", `${sourceTable}:recurring`),
      columns: [
        ...commonColumns,
        mapped("start", "day", "derive_day_of_month"),
        mapped("recorrente", "recurrence", "normalize_legacy_recurrence"),
        notPreserved("status", "A agenda recorrente atual não possui status autônomo equivalente."),
      ],
      constants: { organization_id: ORGANIZATION_ID },
      defaults: { location: null },
      precedence: ["emit_when_recurring"],
      dependencies,
    }),
  ];
  function classify(row, context) {
    const basic = firstQuarantine([
      classifyIdentity(row?.id, "id", "REGULARIZE_AGENDA_ID_INVALID"),
      classifyText(row?.title, "title", "REGULARIZE_AGENDA_TITLE_EMPTY"),
      classifyIdentity(row?.departamento, "departamento", "REGULARIZE_AGENDA_DEPARTMENT_INVALID"),
    ]);
    if (basic.status !== "prepared") return basic;
    return classifyWithContext({
      sourceTable,
      row,
      context,
      identityField: "id",
      resolutions: [
        requiredResolution(
          "department",
          "departamento",
          ["tb_admin.departamentos"],
          "REGULARIZE_AGENDA_DEPARTMENT",
        ),
        optionalResolution(
          "responsible",
          "responsavel_id",
          ["tb_admin.usuarios"],
          "REGULARIZE_AGENDA_RESPONSIBLE",
        ),
        optionalResolution(
          "client",
          "cliente_id",
          ["tb_regularize.clientes"],
          "REGULARIZE_AGENDA_CLIENT",
        ),
      ],
    });
  }
  return createRule({
    sourceTable,
    domain: "regularize",
    cardinality: "1:N",
    dependencies,
    destinations,
    classifySourceRow: classify,
    emitRows(row, context) {
      const classification = classify(row, context);
      const identityRef = rowReference(sourceTable, row?.id);
      if (classification.status !== "prepared") {
        return destinations.map((step) =>
          emission(step, classification, `${identityRef}:${step.stepId}`),
        );
      }
      const recurring = normalizeBoolean(row?.recorrente);
      return [
        emission(
          destinations[0],
          recurring ? notEmitted("RECURRING_AGENDA_USES_RECURRING_DESTINATION") : prepared(),
          `${identityRef}:single`,
        ),
        emission(
          destinations[1],
          recurring ? prepared() : notEmitted("SINGLE_AGENDA_USES_SINGLE_DESTINATION"),
          `${identityRef}:recurring`,
        ),
      ];
    },
  });
}

function createGuidanceActivityRule() {
  const sourceTable = "tb_regularize.orientaoes_processual.atividades";
  const step = destination({
    stepId: "guidance-activities-aggregate",
    destinationTable: "regularize.proceduralGuidances",
    mode: "aggregate",
    identity: {
      kind: "aggregate",
      parentSourceTable: "tb_regularize.orientaoes_processual",
      parentLegacyColumn: "id",
      childForeignKey: "op_id",
    },
    columns: [
      notPreserved("id", "A identidade filha não substitui a identidade da orientação agregada."),
      notPreserved(
        "cliente_id",
        "O cliente é contexto redundante e não é tratado como FK de catálogo.",
      ),
      mapped("op_id", "id", "resolve_explicit_guidance_parent", referenceOptions()),
      mapped("atividade", "economic_activities", "aggregate_normalized_economic_activities"),
      mapped("tipo", "economic_activities", "normalize_economic_activity_type"),
    ],
    defaults: { economic_activities: null },
    precedence: ["explicit_parent", "stable_child_order"],
    dependencies: ["tb_regularize.orientaoes_processual"],
  });
  function classify(row, context) {
    return classifyWithContext({
      sourceTable,
      row,
      context,
      identityField: "id",
      resolutions: [
        requiredResolution(
          "guidance",
          "op_id",
          ["tb_regularize.orientaoes_processual"],
          "GUIDANCE_ACTIVITY_PARENT",
        ),
      ],
    });
  }
  return createRule({
    sourceTable,
    domain: "regularize",
    cardinality: "N:1",
    dependencies: ["tb_regularize.orientaoes_processual"],
    destinations: [step],
    classifySourceRow: classify,
    emitRows(row, context) {
      return [
        emission(
          step,
          classify(row, context),
          `${rowReference("tb_regularize.orientaoes_processual", row?.op_id)}:activities`,
        ),
      ];
    },
  });
}

function createClientPfRule() {
  return createInsertRule({
    sourceTable: "tb_regularize.pf",
    domain: "regularize",
    stepId: "regularize-client-pf-insert",
    destinationTable: "clients.pf",
    identityColumn: "codigo",
    columns: [
      mapped("codigo", "id", "uuid_v5_from_full_source_table_and_legacy_id"),
      mapped("codigo", "code", "normalize_required_text"),
      mapped("nome", "name", "normalize_required_text", personalOptions()),
      mapped("sexo", "sex", "normalize_text", personalOptions()),
      mapped("endereco", "address", "normalize_text", personalOptions()),
      mapped("cidade", "city", "normalize_text"),
      mapped("cep", "zip_code", "normalize_digits", personalOptions()),
      mapped("uf", "state", "normalize_state"),
      mapped("profissao", "profession", "normalize_text", personalOptions()),
      mapped("pai", "father", "normalize_text", personalOptions()),
      mapped("mae", "mother", "normalize_text", personalOptions()),
      mapped("estado_civil", "marital_status", "normalize_text", personalOptions()),
      mapped("nascimento", "date_of_birth", "normalize_required_date", personalOptions()),
      mapped("cpf_cnpj", "cpf", "normalize_cpf", personalOptions()),
      mapped("identidade", "rg", "normalize_rg", personalOptions()),
      mapped("reservista", "military_certificate", "normalize_text", personalOptions()),
      mapped("ctps", "ctps", "normalize_text", personalOptions()),
      mapped("cnh", "cnh", "normalize_text", personalOptions()),
      mapped("conjuge", "spouse", "normalize_text", personalOptions()),
      mapped("status", "status", "normalize_status"),
      mapped("obs", "notes", "normalize_text", personalOptions()),
      notPreserved(
        "telefone",
        "ClientPF não possui telefone; o dado pessoal não é anexado a notes.",
      ),
    ],
    defaults: {
      sex: "",
      address: "",
      city: "",
      zip_code: "",
      state: "",
      profession: "",
      father: "",
      mother: "",
      marital_status: "",
      cpf: "",
      rg: "",
      military_certificate: "",
      ctps: "",
      cnh: "",
      spouse: "",
      status: "Migrado",
      notes: "",
    },
    classify(row) {
      return firstQuarantine([
        classifyIdentity(row?.codigo, "codigo", "CLIENT_PF_IDENTITY_INVALID"),
        classifyText(row?.nome, "nome", "CLIENT_PF_NAME_EMPTY"),
        classifyDate(row?.nascimento, "nascimento", "CLIENT_PF_BIRTH_DATE_INVALID"),
      ]);
    },
  });
}

function createClientPfExpirationRule() {
  const sourceTable = "tb_regularize.vencimento";
  const dependencies = ["tb_regularize.pf"];
  const baseColumns = [
    notPreserved("id", "A identidade auxiliar não substitui a identidade do ClientPF pai."),
    mapped("referente", "id", "resolve_explicit_client_pf_reference", referenceOptions()),
  ];
  const destinations = [
    destination({
      stepId: "client-pf-rg-expiration-merge",
      destinationTable: "clients.pf",
      mode: "merge",
      identity: resolveIdentity("tb_regularize.pf", "referente", "codigo"),
      columns: [
        ...baseColumns,
        mapped("data_expedicao", "rg_expedition", "normalize_zero_date_to_null", personalOptions()),
        mapped("data_vencimento", "rg_validity", "normalize_zero_date_to_null", personalOptions()),
        notPreserved("tipo", "O tipo seleciona os campos RG e não é persistido como texto."),
      ],
      precedence: ["explicit_legacy_link", "identity_type"],
      dependencies,
    }),
    destination({
      stepId: "client-pf-cnh-expiration-merge",
      destinationTable: "clients.pf",
      mode: "merge",
      identity: resolveIdentity("tb_regularize.pf", "referente", "codigo"),
      columns: [
        ...baseColumns,
        mapped(
          "data_expedicao",
          "cnh_expedition",
          "normalize_zero_date_to_null",
          personalOptions(),
        ),
        mapped("data_vencimento", "cnh_validity", "normalize_zero_date_to_null", personalOptions()),
        notPreserved("tipo", "O tipo seleciona os campos CNH e não é persistido como texto."),
      ],
      precedence: ["explicit_legacy_link", "cnh_type"],
      dependencies,
    }),
  ];
  function classify(row, context) {
    const type = normalizeText(row?.tipo).toLocaleLowerCase("pt-BR");
    if (type !== "identidade" && type !== "cnh") {
      return quarantine("tipo", "CLIENT_PF_EXPIRATION_TYPE_UNSUPPORTED");
    }
    const parent = classifyWithContext({
      sourceTable,
      row,
      context,
      identityField: "id",
      resolutions: [
        requiredResolution(
          "clientPf",
          "referente",
          ["tb_regularize.pf"],
          "CLIENT_PF_EXPIRATION_PARENT",
        ),
      ],
    });
    if (parent.status !== "prepared") return parent;

    const slot = context.resolutions.expirationSlot;
    const expectedSlotKey = `${normalizeKey(row?.referente)}-${type}`;
    if (!slot || !RESOLUTION_STATES.has(slot.state)) {
      return quarantine("tipo", "CLIENT_PF_EXPIRATION_SLOT_NOT_EXECUTED");
    }
    if (
      slot.sourceTable !== sourceTable ||
      slot.sourceKey !== expectedSlotKey ||
      (slot.state === "one" && slot.identityRef !== `${sourceTable}:${expectedSlotKey}`)
    ) {
      return quarantine("tipo", "INTEGRATION_CONTEXT_MISMATCH");
    }
    if (slot.state === "many") {
      return quarantine("tipo", "CLIENT_PF_EXPIRATION_SLOT_AMBIGUOUS");
    }
    if (slot.state === "zero") {
      return quarantine("tipo", "CLIENT_PF_EXPIRATION_SLOT_NOT_FOUND");
    }
    return prepared();
  }
  return createRule({
    sourceTable,
    domain: "regularize",
    cardinality: "N:1",
    dependencies,
    destinations,
    classifySourceRow: classify,
    emitRows(row, context) {
      const classification = classify(row, context);
      const identityRef = rowReference("tb_regularize.pf", row?.referente);
      if (classification.status !== "prepared") {
        return destinations.map((step) =>
          emission(step, classification, `${identityRef}:${step.stepId}`),
        );
      }
      const type = normalizeText(row?.tipo).toLocaleLowerCase("pt-BR");
      return [
        emission(
          destinations[0],
          type === "identidade" ? prepared() : notEmitted("CLIENT_PF_EXPIRATION_IS_CNH"),
          `${identityRef}:rg`,
        ),
        emission(
          destinations[1],
          type === "cnh" ? prepared() : notEmitted("CLIENT_PF_EXPIRATION_IS_RG"),
          `${identityRef}:cnh`,
        ),
      ];
    },
  });
}

function createInsertRule({
  sourceTable,
  domain,
  stepId,
  destinationTable,
  identityColumn,
  identity = generateIdentity(identityColumn, sourceTable),
  mode = "insert",
  dependencies = [],
  columns,
  constants = {},
  defaults = {},
  classify,
}) {
  const destination = {
    stepId,
    destinationTable,
    mode,
    identity,
    columns,
    constants: { organization_id: ORGANIZATION_ID, ...constants },
    defaults,
    precedence: mode === "merge" ? ["explicit_legacy_link", "source"] : ["source"],
    dependencies,
  };
  return createRule({
    sourceTable,
    domain,
    cardinality: "1:1",
    dependencies,
    destinations: [destination],
    classifySourceRow: classify,
    emitRows(row, context) {
      return [
        emission(
          destination,
          classify(row, context),
          rowReference(sourceTable, row?.id ?? row?.codigo),
        ),
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
  const evidence = EVIDENCE_BY_SOURCE.get(sourceTable);
  if (evidence?.finalStatus !== "confirmed") {
    throw new Error(`Evidência confirmed ausente: ${sourceTable}`);
  }
  return {
    sourceTable,
    status: "confirmed",
    domain,
    ruleOrigin: evidence.ruleId,
    evidence: { legacy: evidence.legacyReferences, current: evidence.currentContractEvidence },
    cardinality,
    dependencies,
    destinations,
    classifySourceRow,
    emitRows,
  };
}

function classifyWithContext({ sourceTable, row, context, identityField, resolutions }) {
  const identity = classifyIdentity(row?.[identityField], identityField, "SOURCE_IDENTITY_INVALID");
  if (identity.status !== "prepared") return identity;
  for (const specification of resolutions) {
    if (!specification.optional || hasReference(row?.[specification.field])) {
      const valueClassification = classifyIdentity(
        row?.[specification.field],
        specification.field,
        `${specification.prefix}_LINK_INVALID`,
      );
      if (valueClassification.status !== "prepared") return valueClassification;
    }
  }
  if (!isContextBound(sourceTable, row, context)) {
    return quarantine(identityField, "INTEGRATION_CONTEXT_MISMATCH");
  }
  for (const specification of resolutions) {
    const classification = classifyResolution(context, specification, row);
    if (classification.status !== "prepared") return classification;
  }
  return prepared();
}

function classifyResolution(context, specification, row) {
  const value = row?.[specification.field];
  if (specification.optional && !hasReference(value)) return prepared();
  const resolution = context?.resolutions?.[specification.name];
  if (!resolution || !RESOLUTION_STATES.has(resolution.state)) {
    return quarantine(specification.field, `${specification.prefix}_LOOKUP_NOT_EXECUTED`);
  }
  if (
    !specification.allowedSources.includes(resolution.sourceTable) ||
    normalizeKey(value) !== resolution.sourceKey
  ) {
    return quarantine(specification.field, "INTEGRATION_CONTEXT_MISMATCH");
  }
  if (resolution.state === "zero") {
    return quarantine(specification.field, `${specification.prefix}_NOT_FOUND`);
  }
  if (resolution.state === "many") {
    return quarantine(specification.field, `${specification.prefix}_AMBIGUOUS`);
  }
  return resolution.identityRef === `${resolution.sourceTable}:${resolution.sourceKey}`
    ? prepared()
    : quarantine(specification.field, "INTEGRATION_CONTEXT_MISMATCH");
}

function requiredResolution(name, field, allowedSources, prefix) {
  return { name, field, allowedSources, prefix, optional: false };
}

function optionalResolution(name, field, allowedSources, prefix) {
  return { name, field, allowedSources, prefix, optional: true };
}

function normalizeResolution(resolution) {
  if (!isPlainObject(resolution) || !RESOLUTION_STATES.has(resolution.state)) {
    throw new TypeError("resolução deve possuir state one, zero ou many");
  }
  const sourceTable = normalizeKey(resolution.sourceTable);
  const sourceKey = normalizeKey(resolution.sourceKey);
  if (sourceTable === null || sourceKey === null) {
    throw new TypeError("resolução deve possuir sourceTable e sourceKey sanitizados");
  }
  const identityRef =
    resolution.state === "one"
      ? normalizeReference(resolution.identityRef ?? `${sourceTable}:${sourceKey}`)
      : null;
  const relatedIdentityRef =
    resolution.relatedIdentityRef == null
      ? null
      : normalizeReference(resolution.relatedIdentityRef);
  return Object.freeze({
    state: resolution.state,
    sourceTable,
    sourceKey,
    identityRef,
    relatedIdentityRef,
  });
}

function isContextBound(sourceTable, row, context) {
  if (!isPlainObject(context) || !isPlainObject(context.resolutions)) return false;
  const rowFingerprint = fingerprintRow(row);
  return (
    context.sourceTable === sourceTable &&
    context.rowFingerprint === rowFingerprint &&
    context.signature === contextSignature(sourceTable, rowFingerprint, context.resolutions)
  );
}

function lookupStep({ stepId, destinationTable, criteria, columns, dependencies }) {
  return {
    stepId,
    destinationTable,
    mode: "lookup",
    identity: {
      kind: "lookup",
      criteria: criteria.map(([sourceColumn, destinationColumn]) => ({
        sourceColumn,
        destinationColumn,
      })),
      onZero: "null",
      onMany: "quarantine",
    },
    columns,
    constants: {},
    defaults: {},
    precedence: ["normalized_lookup", "on_many_quarantine"],
    dependencies,
  };
}

function destination({
  stepId,
  destinationTable,
  mode,
  identity,
  columns,
  constants = {},
  defaults = {},
  precedence = ["source"],
  dependencies = [],
}) {
  return {
    stepId,
    destinationTable,
    mode,
    identity,
    columns,
    constants,
    defaults,
    precedence,
    dependencies,
  };
}

function generateIdentity(legacyColumn, scope) {
  return { kind: "generate", legacyColumn, scope, namespace: REQUIRED_IDENTITY_NAMESPACE };
}

function resolveIdentity(sourceTable, sourceColumn, targetLegacyColumn) {
  return { kind: "resolve", sourceTable, sourceColumn, targetLegacyColumn };
}

function mapped(sourceColumn, destinationColumn, transformation, options = {}) {
  return {
    sourceColumn,
    destinationColumn,
    status: "mapped",
    transformation,
    nullHandling: options.nullHandling ?? "normalize_or_apply_declared_default",
    referenceRole: options.referenceRole ?? "value",
    sensitivity: options.sensitivity ?? "none",
    reason:
      options.reason ??
      "A evidência legada e o contrato atual comprovam esta transformação sem alterar a semântica.",
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
      "A chave é resolvida pelo vínculo legado explícito; zero ou múltiplos candidatos geram quarantine.",
  };
}

function personalOptions() {
  return { sensitivity: "personal" };
}

function emission(step, classification, identityRef) {
  return {
    stepId: step.stepId,
    destinationTable: step.destinationTable,
    status: classification.status,
    identityRef,
    field: classification.status === "quarantine" ? classification.field : null,
    reasonCode: classification.status === "prepared" ? null : classification.reasonCode,
  };
}

function prepared() {
  return { status: "prepared", field: null, reasonCode: null };
}

function quarantine(field, reasonCode) {
  return { status: "quarantine", field, reasonCode };
}

function notEmitted(reasonCode) {
  return { status: "not_emitted", field: null, reasonCode };
}

function classifyIdentity(value, field, reasonCode) {
  return isValidIdentity(value) ? prepared() : quarantine(field, reasonCode);
}

function classifyText(value, field, reasonCode) {
  return normalizeText(value).length > 0 ? prepared() : quarantine(field, reasonCode);
}

function classifyDate(value, field, reasonCode) {
  const text = normalizeText(value);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text) || text.startsWith("0000-")) {
    return quarantine(field, reasonCode);
  }
  const parsed = new Date(`${text}T00:00:00.000Z`);
  return Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== text
    ? quarantine(field, reasonCode)
    : prepared();
}

function firstQuarantine(classifications) {
  return classifications.find(({ status }) => status !== "prepared") ?? prepared();
}

function hasReference(value) {
  return isValidIdentity(value);
}

function isValidIdentity(value) {
  return (
    (Number.isSafeInteger(value) && value > 0) ||
    (typeof value === "string" && /^[1-9]\d*$/.test(value))
  );
}

function normalizeBoolean(value) {
  return value === true || value === 1 || value === "1" || value === "true";
}

function normalizeText(value) {
  return typeof value === "string" ? value.trim() : String(value ?? "").trim();
}

function normalizeKey(value) {
  const normalized = normalizeText(value);
  return /^[A-Za-z0-9_.-]+$/.test(normalized) ? normalized : null;
}

function normalizeReference(value) {
  const normalized = normalizeText(value);
  if (!/^[A-Za-z0-9_.:-]+$/.test(normalized)) {
    throw new TypeError("identityRef deve ser uma referência sanitizada");
  }
  return normalized;
}

function rowReference(sourceTable, value) {
  return `${sourceTable}:${normalizeKey(value) ?? "invalid"}`;
}

function fingerprintRow(row) {
  return stableFingerprint(["integration-regularize-row-v1", canonicalRow(row)]);
}

function contextSignature(sourceTable, rowFingerprint, resolutions) {
  return stableFingerprint([
    "integration-regularize-context-v1",
    sourceTable,
    rowFingerprint,
    canonicalRow(resolutions),
  ]);
}

function stableFingerprint(parts) {
  return createHash("sha256").update(parts.join("\u001f"), "utf8").digest("hex");
}

function canonicalRow(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalRow).join(",")}]`;
  if (isPlainObject(value)) {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonicalRow(value[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value ?? null);
}

function isPlainObject(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
