import { createHash } from "node:crypto";

import {
  INTEGRACAO_REGULARIZE_AUDITED_CORPORA,
  INTEGRACAO_REGULARIZE_EVIDENCE,
} from "../evidence/integracao-regularize.mjs";
import { REQUIRED_IDENTITY_NAMESPACE } from "../lib/mapping-contract.mjs";
import { uuidV5 } from "../lib/uuid-v5.mjs";
import {
  isAuthenticLegacyReferenceResolution,
  isAuthoritativeV2ClientIdentityResolution,
} from "./admin-business.mjs";

const ORGANIZATION_ID = "e8048d1c-0830-45d7-84de-68e20abd685b";
const EVIDENCE_BY_SOURCE = new Map(
  INTEGRACAO_REGULARIZE_EVIDENCE.map((decision) => [decision.sourceTable, decision]),
);
const RESOLUTION_STATES = new Set(["one", "zero", "many"]);
const DECISION_STATES = new Set(["owner", "duplicate", "conflict"]);
const FINGERPRINT_PATTERN = /^[a-f0-9]{64}$/;
const INTEGRATION_CONTEXT_ISSUANCE = new WeakMap();

export function buildIntegrationRegularizeReferenceContext(sourceTable, row, resolutions) {
  if (typeof sourceTable !== "string" || !/^[A-Za-z0-9_.]+$/.test(sourceTable)) {
    throw new TypeError("sourceTable deve ser um identificador legado sanitizado");
  }
  if (!isPlainObject(row) || !isPlainObject(resolutions)) {
    throw new TypeError("row e resolutions devem ser objetos");
  }
  if (Object.values(resolutions).some(hasDecisionFields)) {
    throw new TypeError("decisões de owner/duplicata exigem builder dedicado");
  }
  if (
    sourceTable === "tb_regularize.grupos_integrantes" &&
    !isAuthoritativeV2ClientIdentityResolution(resolutions.client, row.codigo_cliente)
  ) {
    throw new TypeError("client deve possuir proveniência autoritativa do corpus V2 auditado");
  }
  return buildIntegrationRegularizeContext({
    sourceTable,
    row,
    resolutions,
    decisionBinding: null,
  });
}

function buildIntegrationRegularizeDecisionContext({
  sourceTable,
  row,
  resolutions,
  kind,
  corpusFingerprint,
  stateFingerprint,
}) {
  if (!FINGERPRINT_PATTERN.test(corpusFingerprint) || !FINGERPRINT_PATTERN.test(stateFingerprint)) {
    throw new TypeError("fingerprints do corpus e estado são obrigatórios");
  }
  const rowFingerprint = fingerprintRow(row);
  const normalizedResolutions = Object.fromEntries(
    Object.entries(resolutions)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([name, resolution]) => [name, normalizeResolution(resolution, true)]),
  );
  const decisionBinding = Object.freeze({
    kind,
    corpusFingerprint,
    stateFingerprint,
    signature: decisionBindingSignature({
      kind,
      sourceTable,
      rowFingerprint,
      corpusFingerprint,
      stateFingerprint,
      resolutions: normalizedResolutions,
    }),
  });
  return issueIntegrationContext(
    Object.freeze({
      sourceTable,
      rowFingerprint,
      resolutions: Object.freeze(normalizedResolutions),
      decisionBinding,
      signature: contextSignature(
        sourceTable,
        rowFingerprint,
        normalizedResolutions,
        decisionBinding,
      ),
    }),
    kind,
  );
}

function buildIntegrationRegularizeContext({ sourceTable, row, resolutions, decisionBinding }) {
  const normalizedResolutions = Object.fromEntries(
    Object.entries(resolutions)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([name, resolution]) => [name, normalizeResolution(resolution, false)]),
  );
  const rowFingerprint = fingerprintRow(row);
  return issueIntegrationContext(
    Object.freeze({
      sourceTable,
      rowFingerprint,
      resolutions: Object.freeze(normalizedResolutions),
      decisionBinding,
      signature: contextSignature(
        sourceTable,
        rowFingerprint,
        normalizedResolutions,
        decisionBinding,
      ),
    }),
    "reference-v3",
  );
}

export function buildClientPfResolutionContexts({
  rows,
  currentRows = [],
  currentStateVerified = false,
}) {
  if (
    !Array.isArray(rows) ||
    !Array.isArray(currentRows) ||
    typeof currentStateVerified !== "boolean"
  ) {
    throw new TypeError("rows e currentRows de ClientPF devem ser arrays");
  }
  const corpusFingerprint = assertAuthoritativeLegacyCorpus("tb_regularize.pf", rows);
  const normalizedRows = rows.map(normalizeClientPfSourceRow);
  const stateFingerprint = stableCollectionFingerprint(
    "client-pf-current-state-v2",
    currentRows.map((row) => ({
      identityRef: currentClientPfIdentityRef(row),
      code: normalizeClientPfCurrentUniqueValue("code", row?.code),
      cpf: normalizeClientPfCurrentUniqueValue("cpf", row?.cpf),
      rg: normalizeClientPfCurrentUniqueValue("rg", row?.rg),
    })),
  );
  const slotDefinitions = [
    ["uniqueCode", "code"],
    ["uniqueCpf", "cpf"],
    ["uniqueRg", "rg"],
  ];
  const decisions = rows.map(() => ({}));
  for (const [resolutionName, field] of slotDefinitions) {
    const groups = new Map();
    for (const [index, normalized] of normalizedRows.entries()) {
      const entries = groups.get(normalized[field]) ?? [];
      entries.push(index);
      groups.set(normalized[field], entries);
    }
    const currentByValue = new Map();
    for (const current of currentRows) {
      const normalizedValue = normalizeClientPfCurrentUniqueValue(field, current?.[field]);
      if (normalizedValue.length === 0) continue;
      const identities = currentByValue.get(normalizedValue) ?? new Set();
      identities.add(currentClientPfIdentityRef(current));
      currentByValue.set(normalizedValue, identities);
    }
    for (const [normalizedValue, indexes] of groups) {
      const sorted = [...indexes].sort((left, right) =>
        compareClientPfRows(rows[left], rows[right]),
      );
      const [ownerIndex] = sorted;
      const sourceOwnerIdentityRef = rowReference("tb_regularize.pf", rows[ownerIndex]?.codigo);
      const currentIdentityRefs = [...(currentByValue.get(normalizedValue) ?? [])].sort();
      const currentState =
        currentIdentityRefs.length === 0
          ? "zero"
          : currentIdentityRefs.length === 1
            ? "one"
            : "many";
      const payloads = new Set(
        sorted.map((index) =>
          canonicalRow({ ...normalizedRows[index], code: undefined, [field]: undefined }),
        ),
      );
      const isConflict = currentState !== "zero" || payloads.size > 1;
      for (const index of sorted) {
        const row = rows[index];
        const sourceKey = normalizeKey(row?.codigo) ?? `invalid-${index}`;
        const sourceIdentityRef = `tb_regularize.pf:${sourceKey}`;
        const decision = isConflict ? "conflict" : index === ownerIndex ? "owner" : "duplicate";
        const ownerIdentityRef =
          currentState === "zero"
            ? sourceOwnerIdentityRef
            : currentState === "one"
              ? currentIdentityRefs[0]
              : null;
        decisions[index][resolutionName] = {
          state: decision === "owner" ? "one" : "many",
          sourceTable: "tb_regularize.pf",
          sourceKey,
          sourceIdentityRef,
          identityRef: sourceIdentityRef,
          targetTable: "clients.pf",
          targetIdentityRef: `clients.pf:${field}:${normalizedValue}`,
          criteria: {
            field,
            normalizedValue,
            currentState,
            currentIdentityCount: currentIdentityRefs.length,
            currentStatePreflight: currentStateVerified ? "complete" : "required",
          },
          decision,
          ownerIdentityRef,
        };
      }
    }
  }
  return Object.freeze(
    rows.map((row, index) =>
      buildIntegrationRegularizeDecisionContext({
        sourceTable: "tb_regularize.pf",
        row,
        resolutions: decisions[index],
        kind: "client-pf-unique-v2",
        corpusFingerprint,
        stateFingerprint,
      }),
    ),
  );
}

export function buildPartnerPairResolutionContexts({
  rows,
  clientPfResolutions,
  clientResolutions,
}) {
  if (
    !Array.isArray(rows) ||
    !Array.isArray(clientPfResolutions) ||
    !Array.isArray(clientResolutions) ||
    clientPfResolutions.length !== rows.length ||
    clientResolutions.length !== rows.length
  ) {
    throw new TypeError("rows e resoluções de sócios devem ser arrays de mesmo tamanho");
  }
  const corpusFingerprint = assertAuthoritativeLegacyCorpus("tb_regularize.pf_empresas", rows);
  const normalizedClientPf = clientPfResolutions.map((resolution, index) =>
    validatePartnerReferenceResolution({
      resolution,
      value: rows[index]?.pf_id,
      sourceTable: "tb_regularize.pf",
      label: "clientPF",
      canonicalClient: false,
    }),
  );
  const normalizedClients = clientResolutions.map((resolution, index) =>
    validatePartnerReferenceResolution({
      resolution,
      value: rows[index]?.empresa_id,
      sourceTable: "tb_regularize.clientes",
      label: "client",
      canonicalClient: true,
    }),
  );
  const stateFingerprint = partnerAuthoritativeResolutionStateFingerprint(
    rows,
    normalizedClients,
    normalizedClientPf,
  );
  if (
    stateFingerprint !==
    INTEGRACAO_REGULARIZE_AUDITED_CORPORA["tb_regularize.pf_empresas"].resolutionStateDigest
  ) {
    throw new TypeError(
      "estado canônico autoritativo de sócios não corresponde ao backup auditado",
    );
  }
  const groups = new Map();
  for (const [index, row] of rows.entries()) {
    const client = normalizedClients[index];
    const clientPf = normalizedClientPf[index];
    const pairKey =
      client.state === "one" && clientPf.state === "one"
        ? `${client.identityRef}|${clientPf.identityRef}`
        : `invalid:${rowReference("tb_regularize.pf_empresas", row?.id ?? index)}`;
    const entries = groups.get(pairKey) ?? [];
    entries.push(index);
    groups.set(pairKey, entries);
  }
  const pairDecisions = new Array(rows.length);
  for (const indexes of groups.values()) {
    const conflict = partnerPeriodsConflict(indexes.map((index) => rows[index]));
    const sorted = [...indexes].sort((left, right) => comparePartnerOwner(rows[left], rows[right]));
    const [ownerIndex] = sorted;
    const ownerIdentityRef = rowReference("tb_regularize.pf_empresas", rows[ownerIndex]?.id);
    for (const index of sorted) {
      pairDecisions[index] = {
        decision: conflict ? "conflict" : index === ownerIndex ? "owner" : "duplicate",
        ownerIdentityRef,
      };
    }
  }
  return Object.freeze(
    rows.map((row, index) => {
      const clientPf = normalizedClientPf[index];
      const client = normalizedClients[index];
      const sourceKey = normalizeKey(row?.id) ?? `invalid-${index}`;
      const sourceIdentityRef = `tb_regularize.pf_empresas:${sourceKey}`;
      const pair = pairDecisions[index];
      return buildIntegrationRegularizeDecisionContext({
        sourceTable: "tb_regularize.pf_empresas",
        row,
        kind: "partner-pair-v2",
        corpusFingerprint,
        stateFingerprint,
        resolutions: {
          clientPf,
          client,
          partnerPair: {
            state: pair.decision === "conflict" ? "many" : "one",
            sourceTable: "tb_regularize.pf_empresas",
            sourceKey,
            sourceIdentityRef,
            identityRef: sourceIdentityRef,
            targetTable: "regularize.partners",
            targetIdentityRef: `regularize.partners:${client.identityRef}:${clientPf.identityRef}`,
            criteria: {
              pjIdentityRef: client.identityRef,
              pfIdentityRef: clientPf.identityRef,
            },
            decision: pair.decision,
            ownerIdentityRef: pair.ownerIdentityRef,
          },
        },
      });
    }),
  );
}

export const INTEGRACAO_REGULARIZE_RULES = Object.freeze([
  createIntegrationGroupRule(),
  createPaRule(),
  createPaHistoryRule(),
  createTaskDependentRule(),
  createTerminationTaskModelRule(),
  createTaskRegularizeRule(),
  createRegularizeGroupRule(),
  createRegularizeGroupMemberRule(),
  createGuidanceActivityRule(),
  createClientPfRule(),
  createPartnerRule(),
  createClientPfExpirationRule(),
]);

export const INTEGRACAO_REGULARIZE_TRANSFORMATIONS = Object.freeze({
  aggregate_activity_uuid: (_value, metadata) => buildGuidanceActivityPayload(metadata.row)?.id,
  aggregate_normalized_economic_activities: (_value, metadata) =>
    buildGuidanceActivityPayload(metadata.row),
  aggregate_parent_reference: (_value, metadata) =>
    runtimeReferenceId(metadata.context?.resolutions?.guidance),
  normalize_active_status: (value) =>
    !["0", "inativo", "false"].includes(normalizeText(value).toLowerCase()),
  normalize_boolean: normalizeLegacyBoolean,
  normalize_economic_activity_type: (value) =>
    normalizeText(value) === "1" ? "Principal" : "Secundária",
  normalize_integer: (value) => {
    const normalized = normalizeText(value);
    return normalized.length === 0 ? null : Number.parseInt(normalized, 10);
  },
  normalize_legacy_asset_reference: normalizeText,
  normalize_legacy_marital_status: (_value, metadata) =>
    normalizeClientPfSourceRow(metadata.row).marital_status,
  normalize_percentage: normalizeLegacyPercentage,
  normalize_person_sex: (_value, metadata) => normalizeClientPfSourceRow(metadata.row).sex,
  normalize_presence_boolean: (value) => normalizeText(value).length > 0,
  normalize_required_cpf: (_value, metadata) => normalizeClientPfSourceRow(metadata.row).cpf,
  normalize_required_date: normalizeRequiredDate,
  normalize_required_datetime: normalizeRequiredDateTime,
  normalize_required_digits: (value) => normalizeDigits(value),
  normalize_required_rg: (_value, metadata) => normalizeClientPfSourceRow(metadata.row).rg,
  normalize_required_state: (_value, metadata) => normalizeClientPfSourceRow(metadata.row).state,
  normalize_required_status: (_value, metadata) => normalizeClientPfSourceRow(metadata.row).status,
  normalize_required_text: normalizeRequiredText,
  normalize_task_billing: (value) => (normalizeLegacyBoolean(value) ? "1" : "0"),
  normalize_text: normalizeText,
  normalize_zero_date_to_null: (value) => {
    const normalized = normalizeText(value);
    return normalized.length === 0 || normalized.startsWith("0000-")
      ? null
      : normalizeRequiredDate(value);
  },
  resolve_canonical_v2_client_reference: (_value, metadata) =>
    runtimeReferenceId(metadata.context?.resolutions?.client),
  resolve_explicit_client_pf_reference: (_value, metadata) =>
    runtimeReferenceId(metadata.context?.resolutions?.clientPf),
  resolve_explicit_client_reference: (_value, metadata) =>
    runtimeReferenceId(metadata.context?.resolutions?.client),
  resolve_explicit_department_reference: (_value, metadata) =>
    runtimeReferenceId(metadata.context?.resolutions?.department),
  resolve_explicit_regularize_group_reference: (_value, metadata) =>
    runtimeReferenceId(metadata.context?.resolutions?.group),
  resolve_explicit_task_model_reference: (value, metadata) =>
    runtimeReferenceId(
      metadata.context?.resolutions?.taskModel ??
        metadata.context?.resolutions?.dependentModel ??
        metadata.context?.resolutions?.responsible,
      value,
    ),
  resolve_explicit_user_reference: (value, metadata) =>
    runtimeReferenceId(
      Object.values(metadata.context?.resolutions ?? {}).find(
        (resolution) =>
          resolution?.sourceTable === "tb_admin.usuarios" &&
          resolution?.sourceKey === normalizeKey(value),
      ),
    ),
  resolve_legacy_regularize_referring_type_lookup: (_value, metadata) =>
    metadata.context?.resolutions?.referringType?.relatedIdentityRef?.replace("regularize.", "") ??
    null,
  resolve_optional_user_reference: (value, metadata) =>
    hasReference(value)
      ? INTEGRACAO_REGULARIZE_TRANSFORMATIONS.resolve_explicit_user_reference(value, metadata)
      : null,
  uuid_v5_from_full_source_table_and_legacy_id: (value, metadata) =>
    uuidV5(REQUIRED_IDENTITY_NAMESPACE, `${metadata.rule.sourceTable}:${normalizeText(value)}`),
});

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
      const fields = firstQuarantine([
        classifyRequiredDateTime(row?.dia, "dia", "PA_HISTORY_DATE_INVALID"),
        classifyText(row?.historico, "historico", "PA_HISTORY_TEXT_EMPTY"),
      ]);
      if (fields.status !== "prepared") return fields;
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

function createTerminationTaskModelRule() {
  const sourceTable = "tb_integracao.tarefas_express_distrato";
  return createInsertRule({
    sourceTable,
    domain: "integration",
    stepId: "termination-task-model-insert",
    destinationTable: "integracao.tasksModel",
    identityColumn: "id",
    dependencies: ["tb_admin.departamentos", "tb_admin.usuarios"],
    columns: [
      mapped("id", "id", "uuid_v5_from_full_source_table_and_legacy_id"),
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
      notPreserved(
        "estado",
        "Estado pertence à ocorrência Task e não ao modelo reutilizável atual.",
      ),
      notPreserved(
        "realizado",
        "O indicador pertence à execução e não ao contrato reutilizável de TaskModel.",
      ),
      mapped("obs", "observations", "normalize_text", personalOptions()),
      notPreserved("ano", "O ano legado não possui semântica de previsão no TaskModel atual."),
      mapped("cobranca", "billing", "normalize_task_billing"),
    ],
    constants: { type: "legacy-termination" },
    defaults: { billing: "0", prevision: 0 },
    classify(row, context) {
      const base = firstQuarantine([
        classifyIdentity(row?.id, "id", "TERMINATION_TASK_MODEL_ID_INVALID"),
        classifyText(row?.nome, "nome", "TERMINATION_TASK_MODEL_NAME_EMPTY"),
        classifyIdentity(
          row?.departamento_id,
          "departamento_id",
          "TERMINATION_TASK_MODEL_DEPARTMENT_INVALID",
        ),
        classifyIdentity(
          row?.responsavel_id,
          "responsavel_id",
          "TERMINATION_TASK_MODEL_RESPONSIBLE_INVALID",
        ),
      ]);
      if (base.status !== "prepared") return base;
      const linked = classifyWithContext({
        sourceTable,
        row,
        context,
        identityField: "id",
        resolutions: [
          requiredResolution(
            "department",
            "departamento_id",
            ["tb_admin.departamentos"],
            "TASK_MODEL_DEPARTMENT",
          ),
          requiredResolution(
            "responsible",
            "responsavel_id",
            ["tb_admin.usuarios"],
            "TASK_MODEL_RESPONSIBLE",
          ),
          optionalResolution(
            "responsible2",
            "responsavel_id_dois",
            ["tb_admin.usuarios"],
            "TASK_MODEL_RESPONSIBLE2",
          ),
          optionalResolution(
            "responsible3",
            "responsavel_id_tres",
            ["tb_admin.usuarios"],
            "TASK_MODEL_RESPONSIBLE3",
          ),
        ],
      });
      if (linked.status !== "prepared") return linked;
      return classifyResponsibleDepartments({
        row,
        context,
        departmentResolutionName: "department",
        responsibleResolutionNames: [
          ["responsible", "responsavel_id"],
          ["responsible2", "responsavel_id_dois"],
          ["responsible3", "responsavel_id_tres"],
        ],
        reasonCode: "TASK_MODEL_RESPONSIBLE_DEPARTMENT_MISMATCH",
      });
    },
  });
}

function createTaskRegularizeRule() {
  const sourceTable = "tb_integracao.tarefas_regularize";
  const step = destination({
    stepId: "task-regularize-link-insert",
    destinationTable: "integracao.tasksIntegrationRegularize",
    mode: "insert",
    identity: generateIdentity("id", sourceTable),
    columns: [
      mapped("id", "id", "uuid_v5_from_full_source_table_and_legacy_id"),
      mapped(
        "tarefa",
        "task_model_id",
        "resolve_explicit_task_model_reference",
        referenceOptions(),
      ),
      mapped("vinculo", "referring", "normalize_required_text"),
      mapped(null, "referring_type", "resolve_legacy_regularize_referring_type_lookup"),
    ],
    constants: { organization_id: ORGANIZATION_ID },
    dependencies: ["tb_integracao.tarefas_express"],
  });
  function classify(row, context) {
    const base = classifyWithContext({
      sourceTable,
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
    if (base.status !== "prepared") return base;
    const text = classifyText(row?.vinculo, "vinculo", "TASK_REGULARIZE_REFERRING_EMPTY");
    if (text.status !== "prepared") return text;
    const referringType = resolveRegularizeReferringType(row.vinculo);
    if (referringType === null) {
      return quarantine("vinculo", "TASK_REGULARIZE_REFERRING_TYPE_UNKNOWN");
    }
    const resolution = context.resolutions.referringType;
    if (!resolution || !RESOLUTION_STATES.has(resolution.state)) {
      return quarantine("vinculo", "TASK_REGULARIZE_REFERRING_TYPE_LOOKUP_NOT_EXECUTED");
    }
    if (resolution.state === "many") {
      return quarantine("vinculo", "TASK_REGULARIZE_REFERRING_TYPE_AMBIGUOUS");
    }
    if (resolution.state === "zero") {
      return quarantine("vinculo", "TASK_REGULARIZE_REFERRING_TYPE_UNKNOWN");
    }
    const sourceIdentityRef = rowReference(sourceTable, row.id);
    const expectedTarget = `regularize.${referringType}`;
    if (
      resolution.sourceTable !== sourceTable ||
      resolution.sourceKey !== normalizeKey(row.id) ||
      resolution.sourceIdentityRef !== sourceIdentityRef ||
      resolution.identityRef !== sourceIdentityRef ||
      resolution.targetTable !== "integracao.tasksIntegrationRegularize" ||
      resolution.targetIdentityRef !== expectedTarget ||
      resolution.relatedIdentityRef !== expectedTarget ||
      !sameCriteria(resolution.criteria, { legacyValue: normalizeText(row.vinculo) })
    ) {
      return quarantine("vinculo", "INTEGRATION_CONTEXT_MISMATCH");
    }
    return prepared();
  }
  return createRule({
    sourceTable,
    domain: "integration",
    cardinality: "1:1",
    dependencies: ["tb_integracao.tarefas_express"],
    destinations: [step],
    classifySourceRow: classify,
    emitRows(row, context) {
      const classification = classify(row, context);
      return [emission(step, classification, rowReference(sourceTable, row?.id))];
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
        "resolve_canonical_v2_client_reference",
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
          canonicalClientResolution("client", "codigo_cliente", "GROUP_MEMBER_CLIENT"),
          requiredResolution("group", "grupo_id", ["tb_regularize.grupos"], "GROUP_MEMBER_GROUP"),
        ],
      });
    },
  });
}

function createPartnerRule() {
  const sourceTable = "tb_regularize.pf_empresas";
  const step = destination({
    stepId: "regularize-partner-insert",
    destinationTable: "regularize.partners",
    mode: "insert",
    identity: generateIdentity("id", sourceTable),
    columns: [
      mapped("id", "id", "uuid_v5_from_full_source_table_and_legacy_id"),
      mapped("pf_id", "pf_id", "resolve_explicit_client_pf_reference", referenceOptions()),
      mapped("empresa_id", "pj_id", "resolve_canonical_v2_client_reference", referenceOptions()),
      mapped("parte", "part", "normalize_percentage"),
      mapped("entrada", "entry", "normalize_required_date"),
      mapped("saida", "exit", "normalize_zero_date_to_null"),
    ],
    constants: { organization_id: ORGANIZATION_ID },
    precedence: ["active_period", "latest_entry", "lowest_legacy_id"],
    dependencies: ["tb_regularize.pf", "tb_regularize.clientes"],
  });
  function classify(row, context) {
    const entry = classifyDate(row?.entrada, "entrada", "PARTNER_ENTRY_DATE_INVALID");
    if (entry.status !== "prepared") return entry;
    if (hasNonZeroDate(row?.saida)) {
      const exit = classifyDate(row.saida, "saida", "PARTNER_EXIT_DATE_INVALID");
      if (exit.status !== "prepared") return exit;
      if (String(row.saida) < String(row.entrada)) {
        return quarantine("saida", "PARTNER_EXIT_BEFORE_ENTRY");
      }
    }
    const linked = classifyWithContext({
      sourceTable,
      row,
      context,
      identityField: "id",
      resolutions: [
        requiredResolution("clientPf", "pf_id", ["tb_regularize.pf"], "PARTNER_PF"),
        canonicalClientResolution("client", "empresa_id", "PARTNER_PJ"),
      ],
    });
    if (linked.status !== "prepared") return linked;
    if (!isDecisionContextBound(context, "partner-pair-v2")) {
      return quarantine("id", "INTEGRATION_CONTEXT_MISMATCH");
    }
    const pair = context.resolutions.partnerPair;
    if (!pair || !RESOLUTION_STATES.has(pair.state)) {
      return quarantine("id", "PARTNER_PAIR_DECISION_NOT_EXECUTED");
    }
    const expectedOwner = rowReference(sourceTable, row.id);
    const expectedTarget = `regularize.partners:${context.resolutions.client.identityRef}:${context.resolutions.clientPf.identityRef}`;
    if (
      pair.sourceTable !== sourceTable ||
      pair.sourceKey !== normalizeKey(row.id) ||
      pair.sourceIdentityRef !== expectedOwner ||
      pair.identityRef !== expectedOwner ||
      pair.targetTable !== "regularize.partners" ||
      pair.targetIdentityRef !== expectedTarget ||
      !sameCriteria(pair.criteria, {
        pjIdentityRef: context.resolutions.client.identityRef,
        pfIdentityRef: context.resolutions.clientPf.identityRef,
      }) ||
      !new Set(["owner", "duplicate", "conflict"]).has(pair.decision)
    ) {
      return quarantine("id", "INTEGRATION_CONTEXT_MISMATCH");
    }
    if (pair.decision === "conflict" || pair.state === "many") {
      return quarantine("id", "PARTNER_PAIR_HISTORY_CONFLICT");
    }
    if (pair.decision === "duplicate") {
      return pair.ownerIdentityRef && pair.ownerIdentityRef !== expectedOwner
        ? notEmitted("PARTNER_PAIR_HISTORICAL_DUPLICATE")
        : quarantine("id", "INTEGRATION_CONTEXT_MISMATCH");
    }
    return pair.ownerIdentityRef === expectedOwner
      ? prepared()
      : quarantine("id", "INTEGRATION_CONTEXT_MISMATCH");
  }
  return createRule({
    sourceTable,
    domain: "regularize",
    cardinality: "1:1",
    dependencies: ["tb_regularize.pf", "tb_regularize.clientes"],
    destinations: [step],
    classifySourceRow: classify,
    emitRows(row, context) {
      return [emission(step, classify(row, context), rowReference(sourceTable, row?.id))];
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
      mapped("id", "economic_activities", "aggregate_activity_uuid"),
      notPreserved(
        "cliente_id",
        "O cliente é contexto redundante e não é tratado como FK de catálogo.",
      ),
      mapped("op_id", "economic_activities", "aggregate_parent_reference", referenceOptions()),
      mapped("atividade", "economic_activities", "aggregate_normalized_economic_activities"),
      mapped("tipo", "economic_activities", "normalize_economic_activity_type"),
    ],
    defaults: { economic_activities: null },
    precedence: ["explicit_parent", "stable_child_order"],
    dependencies: ["tb_regularize.orientaoes_processual"],
  });
  function classify(row, context) {
    if (buildGuidanceActivityPayload(row) === null) {
      return quarantine("atividade", "GUIDANCE_ACTIVITY_VALUE_INVALID");
    }
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
      const classification = classify(row, context);
      const identityRef =
        classification.status === "prepared"
          ? `${context.resolutions.guidance.identityRef}:activity-${normalizeKey(row?.id)}`
          : rowReference(sourceTable, row?.id);
      return [emission(step, classification, identityRef)];
    },
  });
}

function createClientPfRule() {
  const sourceTable = "tb_regularize.pf";
  const step = destination({
    stepId: "regularize-client-pf-insert",
    destinationTable: "clients.pf",
    mode: "insert",
    identity: generateIdentity("codigo", sourceTable),
    columns: [
      mapped("codigo", "id", "uuid_v5_from_full_source_table_and_legacy_id"),
      mapped("codigo", "code", "normalize_required_text"),
      mapped("nome", "name", "normalize_required_text", personalOptions()),
      mapped("sexo", "sex", "normalize_person_sex", personalOptions()),
      mapped("endereco", "address", "normalize_required_text", personalOptions()),
      mapped("cidade", "city", "normalize_required_text"),
      mapped("cep", "zip_code", "normalize_required_digits", personalOptions()),
      mapped("uf", "state", "normalize_required_state"),
      mapped("profissao", "profession", "normalize_required_text", personalOptions()),
      mapped("pai", "father", "normalize_required_text", personalOptions()),
      mapped("mae", "mother", "normalize_required_text", personalOptions()),
      mapped(
        "estado_civil",
        "marital_status",
        "normalize_legacy_marital_status",
        personalOptions(),
      ),
      mapped("nascimento", "date_of_birth", "normalize_required_date", personalOptions()),
      mapped("cpf_cnpj", "cpf", "normalize_required_cpf", personalOptions()),
      mapped("identidade", "rg", "normalize_required_rg", personalOptions()),
      mapped("reservista", "military_certificate", "normalize_text", personalOptions()),
      mapped("ctps", "ctps", "normalize_text", personalOptions()),
      mapped("cnh", "cnh", "normalize_text", personalOptions()),
      mapped("conjuge", "spouse", "normalize_text", personalOptions()),
      mapped("status", "status", "normalize_required_status"),
      mapped("obs", "notes", "normalize_text", personalOptions()),
      notPreserved(
        "telefone",
        "ClientPF não possui telefone; o dado pessoal não é anexado a notes.",
      ),
    ],
    constants: { organization_id: ORGANIZATION_ID },
    defaults: {
      military_certificate: "",
      ctps: "",
      cnh: "",
      spouse: "",
      notes: "",
    },
    precedence: [
      "validated_source",
      "authoritative_source_corpus",
      "current_state_preflight_required",
      "signed_unique_owner",
    ],
  });
  function classify(row, context) {
    const normalized = normalizeClientPfSourceRow(row);
    const required = firstQuarantine([
      classifyIdentity(row?.codigo, "codigo", "CLIENT_PF_IDENTITY_INVALID"),
      classifyText(row?.nome, "nome", "CLIENT_PF_NAME_EMPTY"),
      normalized.sex === null ? quarantine("sexo", "CLIENT_PF_SEX_INVALID") : prepared(),
      classifyText(row?.endereco, "endereco", "CLIENT_PF_ADDRESS_EMPTY"),
      classifyText(row?.cidade, "cidade", "CLIENT_PF_CITY_EMPTY"),
      normalized.zip_code.length === 0 ? quarantine("cep", "CLIENT_PF_ZIP_CODE_EMPTY") : prepared(),
      normalized.state === null ? quarantine("uf", "CLIENT_PF_STATE_INVALID") : prepared(),
      classifyText(row?.profissao, "profissao", "CLIENT_PF_PROFESSION_EMPTY"),
      classifyText(row?.pai, "pai", "CLIENT_PF_FATHER_EMPTY"),
      classifyText(row?.mae, "mae", "CLIENT_PF_MOTHER_EMPTY"),
      normalized.marital_status === null
        ? quarantine("estado_civil", "CLIENT_PF_MARITAL_STATUS_INVALID")
        : prepared(),
      classifyDate(row?.nascimento, "nascimento", "CLIENT_PF_BIRTH_DATE_INVALID"),
      normalized.cpf.length === 11 ? prepared() : quarantine("cpf_cnpj", "CLIENT_PF_CPF_INVALID"),
      normalized.rg.length > 0 ? prepared() : quarantine("identidade", "CLIENT_PF_RG_EMPTY"),
      normalized.status === null ? quarantine("status", "CLIENT_PF_STATUS_INVALID") : prepared(),
    ]);
    if (required.status !== "prepared") return required;
    if (!isContextBound(sourceTable, row, context)) {
      return quarantine("codigo", "INTEGRATION_CONTEXT_MISMATCH");
    }
    if (!isDecisionContextBound(context, "client-pf-unique-v2")) {
      return quarantine("codigo", "INTEGRATION_CONTEXT_MISMATCH");
    }
    const uniqueSlots = [
      ["uniqueCode", "code", normalized.code],
      ["uniqueCpf", "cpf", normalized.cpf],
      ["uniqueRg", "rg", normalized.rg],
    ];
    for (const [resolutionName, field, value] of uniqueSlots) {
      const classification = classifyClientPfUniqueSlot({
        row,
        resolution: context.resolutions[resolutionName],
        field,
        normalizedValue: value,
      });
      if (classification.status !== "prepared") return classification;
    }
    return prepared();
  }
  return createRule({
    sourceTable,
    domain: "regularize",
    cardinality: "1:1",
    dependencies: [],
    destinations: [step],
    classifySourceRow: classify,
    emitRows(row, context) {
      return [emission(step, classify(row, context), rowReference(sourceTable, row?.codigo))];
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

export function resolveRegularizeReferringType(value) {
  const normalized = normalizeText(value).toLocaleUpperCase("pt-BR");
  const licenses = new Set([
    "SANITÁRIO",
    "FUNCIONAMENTO",
    "LICENÇA AMBIENTA",
    "LICENÇA AMBIENTAL",
    "PUBLICIDADE",
  ]);
  const processes = new Set([
    "ALTERAÇÃO CONTRATUAL",
    "ALTERAÇÃO DE PORTE",
    "ALTERAÇÃO DO NOME FANTASIA",
    "CONSTITUIÇÃO",
    "CONSTITUIÇÃO DE MEI",
    "DISTRATO SOCIAL",
    "MIGRAÇÃO",
    "MIGRAÇÃO MEI / ME",
    "TRANSFORMAÇÃO",
  ]);
  if (licenses.has(normalized)) return "license";
  if (processes.has(normalized)) return "process";
  return null;
}

export function buildGuidanceActivityPayload(row) {
  const type = normalizeKey(row?.tipo);
  const normalizedType = type === "1" ? "Principal" : type === "0" ? "Secundária" : null;
  const activity = normalizeText(row?.atividade);
  const match = activity.match(/^(\d[\d./-]*\d)\s*(?:-\s*)?(.+)$/u);
  const code = normalizeText(match?.[1]);
  const description = normalizeText(match?.[2]).replace(/;+$/, "").trim();
  const sourceKey = normalizeKey(row?.id);
  return normalizedType !== null && sourceKey !== null && code.length > 0 && description.length > 0
    ? {
        id: uuidV5(
          REQUIRED_IDENTITY_NAMESPACE,
          `tb_regularize.orientaoes_processual.atividades:${sourceKey}`,
        ),
        code,
        description,
        type: normalizedType,
      }
    : null;
}

export function normalizeClientPfSourceRow(row) {
  const maritalStatus = new Map([
    ["1", "Solteiro"],
    ["2", "Casado"],
    ["3", "Viúvo(a)"],
    ["4", "Divorciado(a)"],
    ["5", "Concubinato(a)"],
    ["6", "Separado(a) Judicialmente"],
    ["7", "União Estável"],
  ]).get(normalizeText(row?.estado_civil));
  const sex = normalizeText(row?.sexo).toUpperCase();
  const state = normalizeText(row?.uf).toUpperCase();
  const status = normalizeText(row?.status);
  return {
    code: normalizeText(row?.codigo),
    name: normalizeText(row?.nome),
    sex: new Set(["F", "M"]).has(sex) ? sex : null,
    address: normalizeText(row?.endereco),
    city: normalizeText(row?.cidade),
    zip_code: normalizeDigits(row?.cep),
    state: /^[A-Z]{2}$/.test(state) ? state : null,
    profession: normalizeText(row?.profissao),
    father: normalizeText(row?.pai),
    mother: normalizeText(row?.mae),
    marital_status: maritalStatus ?? null,
    date_of_birth: normalizeText(row?.nascimento),
    cpf: normalizeDigits(row?.cpf_cnpj),
    rg: normalizeText(row?.identidade)
      .replace(/[^\p{L}\p{N}]/gu, "")
      .toUpperCase(),
    military_certificate: normalizeText(row?.reservista),
    ctps: normalizeText(row?.ctps),
    cnh: normalizeText(row?.cnh),
    spouse: normalizeText(row?.conjuge),
    status: status.length > 0 && status !== "Selecione um..." ? status : null,
    notes: normalizeText(row?.obs),
  };
}

function normalizeClientPfCurrentUniqueValue(field, value) {
  if (field === "cpf") return normalizeDigits(value);
  if (field === "rg") {
    return normalizeText(value)
      .replace(/[^\p{L}\p{N}]/gu, "")
      .toUpperCase();
  }
  return normalizeText(value);
}

function currentClientPfIdentityRef(row) {
  const currentKey = normalizeKey(row?.id);
  return currentKey === null
    ? `clients.pf:invalid-${stableFingerprint(["client-pf-current-invalid-v2", canonicalRow(row)]).slice(0, 16)}`
    : `clients.pf:${currentKey}`;
}

function compareClientPfRows(left, right) {
  const leftCode = Number.parseInt(normalizeText(left?.codigo), 10);
  const rightCode = Number.parseInt(normalizeText(right?.codigo), 10);
  const leftOrder = Number.isSafeInteger(leftCode) ? leftCode : Number.MAX_SAFE_INTEGER;
  const rightOrder = Number.isSafeInteger(rightCode) ? rightCode : Number.MAX_SAFE_INTEGER;
  return leftOrder - rightOrder || canonicalRow(left).localeCompare(canonicalRow(right), "pt-BR");
}

function comparePartnerOwner(left, right) {
  const leftActive = hasNonZeroDate(left?.saida) ? 1 : 0;
  const rightActive = hasNonZeroDate(right?.saida) ? 1 : 0;
  if (leftActive !== rightActive) return leftActive - rightActive;
  const entryOrder = normalizeText(right?.entrada).localeCompare(
    normalizeText(left?.entrada),
    "en-US",
  );
  if (entryOrder !== 0) return entryOrder;
  const leftId = Number.parseInt(normalizeText(left?.id), 10);
  const rightId = Number.parseInt(normalizeText(right?.id), 10);
  return leftId - rightId;
}

function partnerPeriodsConflict(rows) {
  const valid = rows.every(
    (row) =>
      classifyDate(row?.entrada, "entrada", "INVALID").status === "prepared" &&
      (!hasNonZeroDate(row?.saida) ||
        classifyDate(row.saida, "saida", "INVALID").status === "prepared"),
  );
  if (!valid) return true;
  const activeCount = rows.filter((row) => !hasNonZeroDate(row?.saida)).length;
  if (activeCount > 1) return true;
  const ordered = [...rows].sort((left, right) =>
    normalizeText(left?.entrada).localeCompare(normalizeText(right?.entrada), "en-US"),
  );
  for (let index = 1; index < ordered.length; index += 1) {
    const previous = ordered[index - 1];
    const current = ordered[index];
    if (!hasNonZeroDate(previous?.saida) || String(current.entrada) <= String(previous.saida)) {
      return true;
    }
  }
  return false;
}

function classifyClientPfUniqueSlot({ row, resolution, field, normalizedValue }) {
  const reasonField = field.toUpperCase();
  if (!resolution || !RESOLUTION_STATES.has(resolution.state)) {
    return quarantine(field, `CLIENT_PF_${reasonField}_UNIQUE_LOOKUP_NOT_EXECUTED`);
  }
  const sourceIdentityRef = rowReference("tb_regularize.pf", row?.codigo);
  if (
    resolution.sourceTable !== "tb_regularize.pf" ||
    resolution.sourceKey !== normalizeKey(row?.codigo) ||
    resolution.sourceIdentityRef !== sourceIdentityRef ||
    resolution.identityRef !== sourceIdentityRef ||
    resolution.targetTable !== "clients.pf" ||
    resolution.targetIdentityRef !== `clients.pf:${field}:${normalizedValue}` ||
    !sameCriteria(resolution.criteria, {
      field,
      normalizedValue,
      currentState: resolution.criteria?.currentState,
      currentIdentityCount: resolution.criteria?.currentIdentityCount,
      currentStatePreflight: resolution.criteria?.currentStatePreflight,
    }) ||
    !["complete", "required"].includes(resolution.criteria?.currentStatePreflight) ||
    !new Set(["zero", "one", "many"]).has(resolution.criteria?.currentState) ||
    !Number.isSafeInteger(resolution.criteria?.currentIdentityCount) ||
    resolution.criteria.currentIdentityCount < 0 ||
    (resolution.criteria.currentState === "zero" &&
      resolution.criteria.currentIdentityCount !== 0) ||
    (resolution.criteria.currentState === "one" &&
      resolution.criteria.currentIdentityCount !== 1) ||
    (resolution.criteria.currentState === "many" && resolution.criteria.currentIdentityCount < 2)
  ) {
    return quarantine(field, "INTEGRATION_CONTEXT_MISMATCH");
  }
  if (resolution.decision === "conflict" || resolution.state === "zero") {
    return quarantine(field, `CLIENT_PF_${reasonField}_CONFLICT`);
  }
  if (resolution.decision === "duplicate" || resolution.state === "many") {
    return resolution.decision === "duplicate" &&
      resolution.ownerIdentityRef !== null &&
      resolution.ownerIdentityRef !== sourceIdentityRef
      ? notEmitted(`CLIENT_PF_${reasonField}_DUPLICATE`)
      : quarantine(field, `CLIENT_PF_${reasonField}_CONFLICT`);
  }
  if (resolution.criteria.currentStatePreflight === "required") {
    return quarantine(field, "CLIENT_PF_CURRENT_STATE_PREFLIGHT_REQUIRED");
  }
  return resolution.decision === "owner" && resolution.ownerIdentityRef === sourceIdentityRef
    ? prepared()
    : quarantine(field, "INTEGRATION_CONTEXT_MISMATCH");
}

function classifyResponsibleDepartments({
  row,
  context,
  departmentResolutionName,
  responsibleResolutionNames,
  reasonCode,
}) {
  const departmentIdentityRef = context?.resolutions?.[departmentResolutionName]?.identityRef;
  for (const [resolutionName, field] of responsibleResolutionNames) {
    if (!hasReference(row?.[field])) continue;
    if (context.resolutions[resolutionName]?.relatedIdentityRef !== departmentIdentityRef) {
      return quarantine(field, reasonCode);
    }
  }
  return prepared();
}

function hasNonZeroDate(value) {
  const normalized = normalizeText(value);
  return normalized.length > 0 && normalized !== "0000-00-00";
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
  if (specification.canonicalClient) {
    if (!isCanonicalV2ClientResolution(resolution, value)) {
      return quarantine(specification.field, "INTEGRATION_CONTEXT_MISMATCH");
    }
    if (resolution.state === "zero") {
      return quarantine(specification.field, `${specification.prefix}_NOT_FOUND`);
    }
    if (resolution.state === "many") {
      return quarantine(specification.field, `${specification.prefix}_AMBIGUOUS`);
    }
    return prepared();
  }
  if (resolution.sourceIdentityRef !== `${resolution.sourceTable}:${resolution.sourceKey}`) {
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

function canonicalClientResolution(name, field, prefix) {
  return {
    name,
    field,
    allowedSources: ["tb_regularize.clientes"],
    prefix,
    optional: false,
    canonicalClient: true,
  };
}

function isCanonicalV2ClientResolution(resolution, value) {
  const sourceKey = normalizeKey(value);
  const canonicalIdentity = resolution.identityRef;
  const canonicalIdentityValid =
    resolution.state !== "one" ||
    canonicalIdentity === `tb_regularize.clientes:${sourceKey}` ||
    /^tb_integracao\.clientes:[1-9]\d*$/.test(canonicalIdentity ?? "");
  return (
    sourceKey !== null &&
    resolution.sourceTable === "tb_regularize.clientes" &&
    resolution.sourceKey === sourceKey &&
    RESOLUTION_STATES.has(resolution.sourceState) &&
    canonicalIdentityValid &&
    resolution.fingerprint ===
      referenceResolutionFingerprint(
        resolution.state,
        resolution.identityRef,
        resolution.sourceTable,
        resolution.sourceKey,
      ) &&
    resolution.targetTable === null &&
    resolution.targetIdentityRef === null &&
    resolution.criteria === null &&
    resolution.relatedIdentityRef === null
  );
}

function validatePartnerReferenceResolution({
  resolution,
  value,
  sourceTable,
  label,
  canonicalClient,
}) {
  const authentic = canonicalClient
    ? isAuthoritativeV2ClientIdentityResolution(resolution, value)
    : isAuthenticLegacyReferenceResolution(resolution, sourceTable, value);
  if (!authentic) {
    throw new TypeError(
      canonicalClient
        ? `${label} deve possuir proveniência autoritativa do corpus V2 auditado`
        : `${label} deve possuir proveniência autêntica do resolver oficial`,
    );
  }
  const normalized = normalizeResolution(resolution, false);
  const sourceKey = normalizeKey(value);
  const fingerprintValid =
    normalized.fingerprint ===
    referenceResolutionFingerprint(
      normalized.state,
      normalized.identityRef,
      normalized.sourceTable,
      normalized.sourceKey,
    );
  const identityValid =
    normalized.state !== "one" ||
    (canonicalClient
      ? isCanonicalV2ClientResolution(normalized, value)
      : /^tb_regularize\.pf:[1-9]\d*$/.test(normalized.identityRef ?? ""));
  if (
    sourceKey === null ||
    normalized.sourceTable !== sourceTable ||
    normalized.sourceKey !== sourceKey ||
    normalized.sourceIdentityRef !== `${sourceTable}:${sourceKey}` ||
    !fingerprintValid ||
    !identityValid
  ) {
    throw new TypeError(`${label} deve ser uma resolução canônica vinculada à linha`);
  }
  return normalized;
}

function normalizeResolution(resolution, allowDecisions = false) {
  if (!isPlainObject(resolution) || !RESOLUTION_STATES.has(resolution.state)) {
    throw new TypeError("resolução deve possuir state one, zero ou many");
  }
  const sourceTable = normalizeKey(resolution.sourceTable);
  const sourceKey = normalizeKey(resolution.sourceKey);
  if (sourceTable === null || sourceKey === null) {
    throw new TypeError("resolução deve possuir sourceTable e sourceKey sanitizados");
  }
  const sourceIdentityRef = normalizeReference(
    resolution.sourceIdentityRef ?? `${sourceTable}:${sourceKey}`,
  );
  const identityRef =
    resolution.identityRef == null
      ? resolution.state === "one"
        ? `${sourceTable}:${sourceKey}`
        : null
      : normalizeReference(resolution.identityRef);
  const relatedIdentityRef =
    resolution.relatedIdentityRef == null
      ? null
      : normalizeReference(resolution.relatedIdentityRef);
  const targetTable = resolution.targetTable == null ? null : normalizeKey(resolution.targetTable);
  if (resolution.targetTable != null && targetTable === null) {
    throw new TypeError("targetTable deve ser um identificador sanitizado");
  }
  const targetIdentityRef =
    resolution.targetIdentityRef == null ? null : normalizeReference(resolution.targetIdentityRef);
  const criteria =
    resolution.criteria == null ? null : normalizeContextCriteria(resolution.criteria);
  const decision = resolution.decision == null ? null : normalizeKey(resolution.decision);
  if (decision !== null && !DECISION_STATES.has(decision)) {
    throw new TypeError("decision deve ser owner, duplicate ou conflict");
  }
  const ownerIdentityRef =
    resolution.ownerIdentityRef == null ? null : normalizeReference(resolution.ownerIdentityRef);
  if (!allowDecisions && (decision !== null || ownerIdentityRef !== null)) {
    throw new TypeError("decisões de owner/duplicata exigem builder dedicado");
  }
  const fingerprint =
    resolution.fingerprint == null ? null : normalizeFingerprint(resolution.fingerprint);
  const sourceState =
    resolution.sourceState == null ? null : normalizeResolutionState(resolution.sourceState);
  return Object.freeze({
    state: resolution.state,
    sourceTable,
    sourceKey,
    sourceIdentityRef,
    identityRef,
    relatedIdentityRef,
    targetTable,
    targetIdentityRef,
    criteria,
    decision,
    ownerIdentityRef,
    fingerprint,
    sourceState,
  });
}

function hasDecisionFields(resolution) {
  return (
    isPlainObject(resolution) &&
    (Object.hasOwn(resolution, "decision") || Object.hasOwn(resolution, "ownerIdentityRef"))
  );
}

function normalizeFingerprint(value) {
  const normalized = normalizeText(value);
  if (!FINGERPRINT_PATTERN.test(normalized)) {
    throw new TypeError("fingerprint de resolução inválido");
  }
  return normalized;
}

function normalizeResolutionState(value) {
  if (!RESOLUTION_STATES.has(value)) {
    throw new TypeError("sourceState deve ser one, zero ou many");
  }
  return value;
}

function normalizeContextCriteria(value) {
  if (!isPlainObject(value)) {
    throw new TypeError("criteria deve ser um objeto simples");
  }
  const entries = Object.entries(value)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, item]) => {
      if (!/^[A-Za-z][A-Za-z0-9_]*$/.test(key)) {
        throw new TypeError("criteria possui chave inválida");
      }
      if (isPlainObject(item)) return [key, normalizeContextCriteria(item)];
      if (typeof item === "string") {
        const normalized = item.trim();
        if (
          [...normalized].some((character) => {
            const codePoint = character.codePointAt(0);
            return codePoint !== undefined && (codePoint <= 31 || codePoint === 127);
          })
        ) {
          throw new TypeError("criteria possui texto inválido");
        }
        return [key, normalized];
      }
      if (typeof item === "number" && Number.isFinite(item)) return [key, item];
      if (typeof item === "boolean" || item === null) return [key, item];
      throw new TypeError("criteria possui valor inválido");
    });
  return Object.freeze(Object.fromEntries(entries));
}

function sameCriteria(actual, expected) {
  return isPlainObject(actual) && canonicalRow(actual) === canonicalRow(expected);
}

function isContextBound(sourceTable, row, context) {
  if (!isPlainObject(context) || !isPlainObject(context.resolutions)) return false;
  const issuance = INTEGRATION_CONTEXT_ISSUANCE.get(context);
  if (issuance === undefined || issuance.snapshot !== canonicalRow(context)) return false;
  const rowFingerprint = fingerprintRow(row);
  return (
    context.sourceTable === sourceTable &&
    context.rowFingerprint === rowFingerprint &&
    context.signature ===
      contextSignature(
        sourceTable,
        rowFingerprint,
        context.resolutions,
        context.decisionBinding ?? null,
      )
  );
}

function isDecisionContextBound(context, kind) {
  const binding = context?.decisionBinding;
  const issuance = INTEGRATION_CONTEXT_ISSUANCE.get(context);
  return (
    issuance?.kind === kind &&
    isPlainObject(binding) &&
    binding.kind === kind &&
    FINGERPRINT_PATTERN.test(binding.corpusFingerprint ?? "") &&
    FINGERPRINT_PATTERN.test(binding.stateFingerprint ?? "") &&
    binding.signature ===
      decisionBindingSignature({
        kind,
        sourceTable: context.sourceTable,
        rowFingerprint: context.rowFingerprint,
        corpusFingerprint: binding.corpusFingerprint,
        stateFingerprint: binding.stateFingerprint,
        resolutions: context.resolutions,
      })
  );
}

function issueIntegrationContext(context, kind) {
  INTEGRATION_CONTEXT_ISSUANCE.set(
    context,
    Object.freeze({ kind, snapshot: canonicalRow(context) }),
  );
  return context;
}

function assertAuthoritativeLegacyCorpus(sourceTable, rows) {
  const manifest = INTEGRACAO_REGULARIZE_AUDITED_CORPORA[sourceTable];
  const digest = authoritativeLegacyCorpusFingerprint(sourceTable, manifest?.identityColumn, rows);
  if (manifest === undefined || rows.length !== manifest.rowCount || digest !== manifest.digest) {
    throw new TypeError(`corpus autoritativo inválido para ${sourceTable}`);
  }
  return digest;
}

function authoritativeLegacyCorpusFingerprint(sourceTable, identityColumn, rows) {
  return stableCollectionFingerprint(
    "integration-regularize-authoritative-corpus-v1",
    rows.map((row) => ({
      sourceTable,
      sourceIdentityRef: rowReference(sourceTable, row?.[identityColumn]),
      row,
    })),
  );
}

function partnerAuthoritativeResolutionStateFingerprint(
  rows,
  clientResolutions,
  clientPfResolutions,
) {
  return stableCollectionFingerprint(
    "partner-authoritative-resolution-state-v3",
    rows.map((row, index) => ({
      sourceIdentityRef: rowReference("tb_regularize.pf_empresas", row?.id),
      client: {
        sourceState: clientResolutions[index].sourceState,
        state: clientResolutions[index].state,
        sourceTable: clientResolutions[index].sourceTable,
        sourceKey: clientResolutions[index].sourceKey,
        identityRef: clientResolutions[index].identityRef,
        fingerprint: clientResolutions[index].fingerprint,
      },
      clientPf: {
        state: clientPfResolutions[index].state,
        sourceTable: clientPfResolutions[index].sourceTable,
        sourceKey: clientPfResolutions[index].sourceKey,
        identityRef: clientPfResolutions[index].identityRef,
        fingerprint: clientPfResolutions[index].fingerprint,
      },
    })),
  );
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

function classifyText(_value, _field, _reasonCode) {
  return prepared();
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

function classifyRequiredDateTime(value, field, reasonCode) {
  const normalized = normalizeText(value);
  if (
    normalized.startsWith("0000-") ||
    !/^\d{4}-\d{2}-\d{2}(?:[ T]\d{2}:\d{2}(?::\d{2})?)?$/.test(normalized)
  ) {
    return quarantine(field, reasonCode);
  }
  const date = new Date(`${normalized.replace(" ", "T")}Z`);
  return Number.isNaN(date.getTime()) ? quarantine(field, reasonCode) : prepared();
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

function normalizeText(value) {
  return typeof value === "string" ? value.trim() : String(value ?? "").trim();
}

function normalizeDigits(value) {
  return normalizeText(value).replace(/\D/g, "");
}

function normalizeLegacyBoolean(value) {
  const normalized = normalizeText(value).toLocaleLowerCase("pt-BR");
  if (["1", "sim", "s", "true", "ativo"].includes(normalized)) return true;
  if (["", "0", "não", "nao", "n", "false", "inativo"].includes(normalized)) return false;
  throw new TypeError("booleano legado inválido");
}

function normalizeLegacyPercentage(value) {
  const normalized = normalizeText(value);
  if (normalized.length === 0) return null;
  const numeric = Number(normalized.replaceAll(".", "").replace(",", ".").replace("%", ""));
  if (!Number.isFinite(numeric)) throw new TypeError("percentual legado inválido");
  return numeric;
}

function normalizeRequiredText(value) {
  const normalized = normalizeText(value);
  return normalized.length === 0 ? "******" : normalized;
}

function normalizeRequiredDate(value) {
  const normalized = normalizeText(value);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(normalized) || normalized.startsWith("0000-")) {
    throw new TypeError("data obrigatória inválida");
  }
  const date = new Date(`${normalized}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== normalized) {
    throw new TypeError("data obrigatória inválida");
  }
  return normalized;
}

function normalizeRequiredDateTime(value) {
  const normalized = normalizeText(value);
  if (!/^\d{4}-\d{2}-\d{2}(?:[ T]\d{2}:\d{2}(?::\d{2})?)?$/.test(normalized)) {
    throw new TypeError("data e hora obrigatórias inválidas");
  }
  const date = new Date(`${normalized.replace(" ", "T")}Z`);
  if (Number.isNaN(date.getTime())) throw new TypeError("data e hora obrigatórias inválidas");
  return date.toISOString();
}

function runtimeReferenceId(resolution) {
  if (resolution?.state !== "one" || typeof resolution.identityRef !== "string") {
    throw new TypeError("referência runtime não resolvida");
  }
  return uuidV5(REQUIRED_IDENTITY_NAMESPACE, resolution.identityRef);
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

function contextSignature(sourceTable, rowFingerprint, resolutions, decisionBinding) {
  return stableFingerprint([
    "integration-regularize-context-v2",
    sourceTable,
    rowFingerprint,
    canonicalRow(resolutions),
    canonicalRow(decisionBinding),
  ]);
}

function decisionBindingSignature({
  kind,
  sourceTable,
  rowFingerprint,
  corpusFingerprint,
  stateFingerprint,
  resolutions,
}) {
  return stableFingerprint([
    "integration-regularize-decision-v2",
    kind,
    sourceTable,
    rowFingerprint,
    corpusFingerprint,
    stateFingerprint,
    canonicalRow(resolutions),
  ]);
}

function referenceResolutionFingerprint(state, identityRef, sourceTable, sourceKey) {
  return createHash("sha256")
    .update(JSON.stringify(["reference-resolution-v1", state, identityRef, sourceTable, sourceKey]))
    .digest("hex");
}

function stableCollectionFingerprint(label, values) {
  return stableFingerprint([label, ...values.map(canonicalRow).sort()]);
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
