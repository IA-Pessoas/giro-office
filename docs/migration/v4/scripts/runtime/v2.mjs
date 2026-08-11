import { createRuntimeEntry } from "../lib/execution-registry.mjs";
import { normalizeRequiredScalarText } from "../lib/empty-scalar-policy.mjs";
import { CASTELO_ORGANIZATION_ID, REQUIRED_IDENTITY_NAMESPACE } from "../lib/mapping-contract.mjs";
import { uuidV5 } from "../lib/uuid-v5.mjs";
import { isStrictLegacyInteger, REGULARIZE_CREDENTIAL_SLOTS, V2_RULES } from "../rules/v2.mjs";

const BCRYPT_PATTERN = /^\$2[aby]\$(?:0[4-9]|[12]\d|3[01])\$[./A-Za-z0-9]{53}$/;
const DATE_TRANSFORMATIONS = new Set([
  "normalize_competence_date",
  "normalize_date",
  "normalize_date_fallback",
  "normalize_required_date",
]);
const ENCRYPTED_CREDENTIAL_PATTERN = /^[a-f0-9]{32}:[a-f0-9]{32}:(?:[a-f0-9]{2})+$/i;
const EMPTY_RESULTS = Object.freeze([]);
const DESTINATION_INDEX_COLUMNS = Object.freeze({
  clients: Object.freeze(["id", "cpf_cnpj", "name"]),
  "integracao.projects": Object.freeze(["client_id"]),
  "integracao.tasksModel": Object.freeze(["name", "department_id"]),
  "regularize.process": Object.freeze(["id"]),
  users: Object.freeze(["id"]),
});
const STEPS_BY_ID = new Map(
  V2_RULES.flatMap((rule) =>
    rule.destinations.map((step) => [step.stepId, Object.freeze({ rule, step })]),
  ),
);

export const V2_TRANSFORMERS = Object.freeze({
  credential_slot_audit_note: (_value, metadata) =>
    `Migração V2: ${credentialSlotForStep(metadata.step.stepId)?.slotKey ?? "credencial"}`,
  derive_technical_project_name: (value) => {
    const name = normalizeText(value);
    return name === null ? "Projeto técnico migrado" : `Projeto técnico - ${name}`;
  },
  encrypt_credential: async (value, metadata) => {
    const encryptCredential = metadata.context?.encryptCredential;
    if (
      metadata.context?.credentialEncryptionVerified !== true ||
      typeof encryptCredential !== "function"
    ) {
      throw runtimeError("V2_ENCRYPTION_UNAVAILABLE");
    }
    const plaintext = normalizeRequiredScalarText(value);
    const encrypted = await encryptCredential(plaintext, publicMetadata(metadata));
    if (
      typeof encrypted !== "string" ||
      encrypted === plaintext ||
      !ENCRYPTED_CREDENTIAL_PATTERN.test(encrypted)
    ) {
      throw runtimeError("V2_ENCRYPTION_RESULT_INVALID");
    }
    return encrypted;
  },
  lookup_client_by_document: (value, metadata) => {
    if (isEmpty(value)) return undefined;
    return resolveOptionalUnique(metadata.context?.resolveClientByDocument?.(value));
  },
  lookup_client_by_name_fallback: (value, metadata) => {
    if (metadata.payload[metadata.column.destinationColumn] !== undefined) {
      return metadata.payload[metadata.column.destinationColumn];
    }
    return resolveExactlyOne(metadata.context?.resolveClientByName?.(value), "V2_CLIENT_NOT_FOUND");
  },
  normalize_boolean: normalizeBoolean,
  normalize_client_type: normalizeClientType,
  normalize_color: normalizeColor,
  normalize_competence_date: normalizeCompetenceDate,
  normalize_cpf: normalizeDigits,
  normalize_cpf_cnpj: normalizeDigits,
  normalize_date: normalizeDate,
  normalize_date_fallback: (value, metadata) =>
    normalizeDate(value) ?? metadata.payload[metadata.column.destinationColumn],
  normalize_department_status: normalizeDepartmentStatus,
  normalize_digits: normalizeDigits,
  normalize_email: normalizeEmail,
  normalize_float: normalizeFloat,
  normalize_integer: normalizeInteger,
  normalize_legacy_asset_reference: normalizeText,
  normalize_login: (value) => normalizeText(value)?.toLocaleLowerCase("pt-BR") ?? null,
  normalize_lookup_text: (value) => normalizeText(value)?.toLocaleLowerCase("pt-BR") ?? null,
  normalize_phone: normalizeDigits,
  normalize_required_date: (value) => {
    const normalized = normalizeDate(value);
    if (normalized === null) throw runtimeError("V2_REQUIRED_DATE_INVALID");
    return normalized;
  },
  normalize_required_text: normalizeRequiredScalarText,
  normalize_rg: normalizeDigits,
  normalize_scalar: normalizeScalar,
  normalize_status: normalizeStatus,
  normalize_text: normalizeText,
  normalize_text_fallback: (value, metadata) =>
    normalizeText(value) ?? metadata.payload[metadata.column.destinationColumn],
  resolve_client_reference: (value, metadata) =>
    metadata.context?.resolveIntegrationClientReference?.(value) ??
    generatedId("tb_integracao.clientes", value),
  resolve_credential_site: (_value, metadata) => {
    const slot = credentialSlotForStep(metadata.step.stepId);
    if (slot === null) throw runtimeError("V2_CREDENTIAL_SLOT_UNKNOWN");
    return generatedId(
      `tb_regularize.clientes_senhas:site:${slot.siteKey}`,
      CASTELO_ORGANIZATION_ID,
    );
  },
  resolve_department_reference: (value, metadata) =>
    metadata.context?.resolveDepartmentReference?.(value) ??
    generatedId("tb_admin.departamentos", value),
  resolve_explicit_legacy_link: (value, metadata) => {
    const sourceTable = metadata.step.identity.sourceTable;
    const targetId = generatedId(sourceTable, value);
    assertMergeTarget(metadata, targetId);
    return targetId;
  },
  resolve_legacy_cargo_name: (value, metadata) => {
    const cargo = metadata.context?.resolveCargo?.({ cargo: value });
    if (cargo?.resolution !== "one" || typeof cargo.name !== "string") {
      throw runtimeError("V2_CARGO_NOT_RESOLVED");
    }
    return cargo.name.trim();
  },
  resolve_legacy_process_reference: (value, metadata) => {
    const resolution = metadata.context?.resolveGuidanceProcess?.({ processo_id: value });
    return resolveExactlyOne(resolution?.ids, "V2_PROCESS_NOT_FOUND");
  },
  resolve_optional_user_reference: (value, metadata) =>
    isEmpty(value)
      ? null
      : (metadata.context?.resolveUserReference?.(value) ??
        generatedId("tb_admin.usuarios", value)),
  resolve_or_derive_process: (_value, metadata) => {
    const resolution = metadata.context?.resolveGuidanceProcess?.(metadata.row);
    if (resolution?.resolution === "one") return resolution.ids[0];
    if (isEmpty(metadata.row?.processo_id) || String(metadata.row.processo_id).trim() === "0") {
      return generatedId("tb_regularize.orientaoes_processual:technical-process", metadata.row?.id);
    }
    throw runtimeError("V2_PROCESS_NOT_RESOLVED");
  },
  resolve_or_derive_project: (_value, metadata) => {
    const resolution = metadata.context?.resolveTaskProject?.(metadata.row);
    if (resolution?.resolution === "one") return resolution.ids[0];
    if (resolution === undefined || resolution?.resolution === "zero") {
      return generatedId("tb_integracao.tarefas:derived-project", metadata.row?.id);
    }
    throw runtimeError("V2_TASK_PROJECT_AMBIGUOUS");
  },
  resolve_or_derive_task_model: (_value, metadata) => {
    const resolution = metadata.context?.resolveTaskModel?.(metadata.row);
    if (resolution?.resolution === "one") return resolution.ids[0];
    if (resolution === undefined || resolution?.resolution === "zero") {
      return generatedId("tb_integracao.tarefas:derived-model", metadata.row?.id);
    }
    throw runtimeError("V2_TASK_MODEL_AMBIGUOUS");
  },
  resolve_project_plan_reference: (value, metadata) =>
    metadata.context?.resolveProjectPlanReference?.(value) ??
    generatedId("tb_integracao.planos", value),
  resolve_regularize_client_reference: (value, metadata) =>
    metadata.context?.resolveRegularizeClientReference?.(value) ??
    generatedId("tb_regularize.clientes", value),
  resolve_task_model_reference: (value, metadata) =>
    metadata.context?.resolveTaskModelReference?.(value) ??
    generatedId("tb_integracao.tarefas_express", value),
  resolve_user_reference: (value, metadata) =>
    metadata.context?.resolveUserReference?.(value) ?? generatedId("tb_admin.usuarios", value),
  select_bcrypt_migration_strategy: async (value, metadata) => {
    const text = normalizeRequiredScalarText(value);
    if (BCRYPT_PATTERN.test(text)) return text;
    const hashLegacyPassword = metadata.context?.hashLegacyPassword;
    if (
      metadata.context?.passwordHashingVerified !== true ||
      typeof hashLegacyPassword !== "function"
    ) {
      throw runtimeError("V2_PASSWORD_HASHER_UNAVAILABLE");
    }
    const hash = await hashLegacyPassword(text, publicMetadata(metadata));
    if (typeof hash !== "string" || hash === text || !BCRYPT_PATTERN.test(hash)) {
      throw runtimeError("V2_PASSWORD_HASH_RESULT_INVALID");
    }
    return hash;
  },
  uuid_v5: (value, metadata) => generatedId(metadata.step.identity.scope, value),
  uuid_v5_credential_site: (_value, metadata) =>
    generatedId(metadata.step.identity.scope, CASTELO_ORGANIZATION_ID),
  uuid_v5_derived_project: (value, metadata) => generatedId(metadata.step.identity.scope, value),
  uuid_v5_derived_task_model: (value, metadata) => generatedId(metadata.step.identity.scope, value),
  uuid_v5_per_credential_slot: (value, metadata) =>
    generatedId(metadata.step.identity.scope, value),
  uuid_v5_technical_guidance_process: (value, metadata) =>
    generatedId(metadata.step.identity.scope, value),
});

const MERGE_RESET_VALUES = Object.freeze({
  "collaborator-job-title-merge": Object.freeze({ job_title: null }),
  "collaborator-user-merge": Object.freeze({
    full_name: null,
    hire_date: null,
    termination_date: null,
    gender: null,
    birth_date: null,
    cpf: null,
    rg: null,
    address: null,
    email: null,
    phone: null,
    photo_url: null,
  }),
  "prospecting-client-merge": Object.freeze({
    description_prospecting: null,
    date_status: null,
    participants_meet: null,
    meet_type: null,
    closing_date: null,
    segment: null,
  }),
  "regularize-client-merge": Object.freeze({
    dominio_code: null,
    company_name: null,
    fantasy_name: null,
    cpf_cnpj: "",
    cnae: null,
    responsible: null,
    number: null,
    email: null,
    address: null,
    cep: null,
    neighborhood: null,
    state: null,
    city: null,
    customer_since: null,
    municipal_registration: null,
    state_registration: null,
    commercial_board_registration: null,
    competence_entry: null,
    competence_output: null,
  }),
});

export const V2_EXECUTION_ENTRIES = Object.freeze(
  V2_RULES.flatMap((rule) => {
    const dateAwareRule = withDateQuarantine(rule);
    return rule.destinations.map((step) => {
      const runtimeRule = withStepExecutionPreconditions(dateAwareRule, step);
      return createRuntimeEntry({
        rule: runtimeRule,
        step,
        organizationId: CASTELO_ORGANIZATION_ID,
        contextRequirements: requirementsForV2Step(rule.sourceTable, step),
        projector: projectV2Emission,
        cleanup: cleanupForV2Step(step),
        projectionKind:
          step.stepId === "guidance-partners-aggregate"
            ? "custom_projector"
            : "column_transformers",
      });
    });
  }),
);

function withStepExecutionPreconditions(rule, step) {
  const clientNameColumn = step.columns.find(
    ({ status, transformation }) =>
      status === "mapped" && transformation === "lookup_client_by_name_fallback",
  );
  const credentialKind = step.stepId.startsWith("credential-site-")
    ? "SITE"
    : step.stepId.startsWith("credential-slot-")
      ? "SLOT"
      : null;
  if (credentialKind !== null) {
    return {
      ...rule,
      emitRows(row, context) {
        const decisions = rule.emitRows(row, context);
        if (decisions.some((decision) => decision.stepId === step.stepId)) return decisions;
        return [
          ...decisions,
          {
            stepId: step.stepId,
            destinationTable: step.destinationTable,
            status: "not_emitted",
            identityRef: `${rule.sourceTable}:${step.stepId}:inactive`,
            field: null,
            reasonCode: `V2_CREDENTIAL_${credentialKind}_INACTIVE`,
          },
        ];
      },
    };
  }
  if (step.mode !== "merge" && clientNameColumn === undefined) return rule;

  const resolveMergeTarget = (row, context) => {
    const sourceColumn = step.identity.sourceColumn;
    const targetId = generatedId(step.identity.sourceTable, row?.[sourceColumn]);
    let matches;
    if (typeof context?.resolveMergeTarget === "function") {
      matches = context.resolveMergeTarget(step.destinationTable, targetId);
    } else if (typeof context?.lookupDestination === "function") {
      matches = context.lookupDestination(`destination:${step.destinationTable}.id`, targetId);
    } else {
      return {
        classification: {
          status: "quarantine",
          field: sourceColumn,
          reasonCode: "V2_MERGE_LOOKUP_NOT_EXECUTED",
        },
        targetId: null,
      };
    }
    if (!Array.isArray(matches)) throw runtimeError("V2_MERGE_RESOLUTION_INVALID");
    if (matches.length === 0) {
      return {
        classification: {
          status: "quarantine",
          field: sourceColumn,
          reasonCode: "V2_MERGE_TARGET_NOT_FOUND",
        },
        targetId: null,
      };
    }
    if (matches.length > 1) {
      return {
        classification: {
          status: "quarantine",
          field: sourceColumn,
          reasonCode: "V2_MERGE_TARGET_AMBIGUOUS",
        },
        targetId: null,
      };
    }
    return { classification: { status: "prepared" }, targetId: matches[0] };
  };
  const classifyMergeTarget = (row, context) => resolveMergeTarget(row, context).classification;

  const classifyClientReference = (row, context) => {
    const documentColumn = step.columns.find(
      ({ status, transformation }) =>
        status === "mapped" && transformation === "lookup_client_by_document",
    );
    const documentValue = row?.[documentColumn?.sourceColumn];
    const nameValue = row?.[clientNameColumn?.sourceColumn];
    const documentMatches =
      typeof context?.resolveClientByDocument === "function"
        ? context.resolveClientByDocument(documentValue)
        : typeof context?.lookupDestination === "function"
          ? context.lookupDestination(
              "destination:clients.cpf_cnpj",
              normalizeDigits(documentValue),
            )
          : null;
    if (documentMatches === null) {
      return {
        status: "quarantine",
        field: documentColumn?.sourceColumn ?? "cpf_cnpj",
        reasonCode: "V2_CLIENT_LOOKUP_NOT_EXECUTED",
      };
    }
    if (!Array.isArray(documentMatches)) throw runtimeError("V2_CLIENT_RESOLUTION_INVALID");
    if (documentMatches.length > 1) {
      return {
        status: "quarantine",
        field: documentColumn?.sourceColumn ?? "cpf_cnpj",
        reasonCode: "V2_CLIENT_REFERENCE_AMBIGUOUS",
      };
    }
    if (documentMatches.length === 1) return { status: "prepared" };
    const nameMatches =
      typeof context?.resolveClientByName === "function"
        ? context.resolveClientByName(nameValue)
        : context.lookupDestination("destination:clients.name", normalizeText(nameValue));
    if (!Array.isArray(nameMatches)) throw runtimeError("V2_CLIENT_RESOLUTION_INVALID");
    if (nameMatches.length === 0) {
      return {
        status: "quarantine",
        field: clientNameColumn.sourceColumn,
        reasonCode: "V2_CLIENT_REFERENCE_NOT_FOUND",
      };
    }
    if (nameMatches.length > 1) {
      return {
        status: "quarantine",
        field: clientNameColumn.sourceColumn,
        reasonCode: "V2_CLIENT_REFERENCE_AMBIGUOUS",
      };
    }
    return { status: "prepared" };
  };
  const classifyStep = step.mode === "merge" ? classifyMergeTarget : classifyClientReference;

  return {
    ...rule,
    classifySourceRow(row, context) {
      const classification = rule.classifySourceRow(row, context);
      return classification.status === "prepared" ? classifyStep(row, context) : classification;
    },
    emitRows(row, context) {
      return rule.emitRows(row, context).map((decision) => {
        if (decision.stepId !== step.stepId) return decision;
        if (step.mode === "merge" && !decision.identityRef.startsWith("quarantine:")) {
          const resolution = resolveMergeTarget(row, context);
          if (resolution.classification.status === "prepared") {
            return {
              ...decision,
              identityRef: resolvedIdentityReference(step.destinationTable, resolution.targetId),
            };
          }
          const unresolved = {
            ...decision,
            identityRef: `quarantine:${rule.sourceTable}:${step.identity.sourceColumn}:invalid`,
          };
          return decision.status === "prepared"
            ? { ...unresolved, ...resolution.classification }
            : unresolved;
        }
        if (decision.status !== "prepared") return decision;
        const classification = classifyStep(row, context);
        return classification.status === "prepared" ? decision : { ...decision, ...classification };
      });
    },
  };
}

function withDateQuarantine(rule) {
  const dateColumns = rule.destinations.flatMap((destination) =>
    destination.columns.filter(
      (column) => column.status === "mapped" && DATE_TRANSFORMATIONS.has(column.transformation),
    ),
  );
  const canonicalParentIdentity = rule.sourceTable === "tb_regularize.orientaoes_processual.socios";
  const validatesUserPasswordHasher = rule.sourceTable === "tb_admin.usuarios";
  if (dateColumns.length === 0 && !canonicalParentIdentity && !validatesUserPasswordHasher) {
    return rule;
  }

  const classifyDate = (row) => {
    for (const column of dateColumns) {
      const value = row?.[column.sourceColumn];
      const required = column.transformation === "normalize_required_date";
      if (!required && isEmpty(value)) continue;
      try {
        if (required) {
          V2_TRANSFORMERS.normalize_required_date(value);
        } else if (column.transformation === "normalize_competence_date") {
          normalizeCompetenceDate(value);
        } else {
          normalizeDate(value);
        }
      } catch (error) {
        if (!["V2_DATE_INVALID", "V2_REQUIRED_DATE_INVALID"].includes(error?.code)) throw error;
        return {
          status: "quarantine",
          field: column.sourceColumn,
          reasonCode: "DATE_VALUE_INVALID",
        };
      }
    }
    return null;
  };

  return {
    ...rule,
    classifySourceRow(row, context) {
      const classification = classifyRuntimePreconditions(rule, row, context);
      if (classification.status !== "prepared") return classification;
      return classifyDate(row) ?? classification;
    },
    emitRows(row, context) {
      const dateClassification = classifyDate(row);
      const runtimeClassification = classifyRuntimePreconditions(rule, row, context);
      const decisions = rule.emitRows(row, context).map((decision) =>
        canonicalParentIdentity && decision.status === "prepared"
          ? Object.freeze({
              ...decision,
              identityRef: decision.identityRef.replace(/:partner-[^:]+$/, ""),
            })
          : decision,
      );
      const overrideClassification =
        runtimeClassification.status === "prepared" ? dateClassification : runtimeClassification;
      if (overrideClassification === null) return decisions;
      return decisions.map((decision) =>
        decision.status === "prepared"
          ? {
              ...decision,
              status: overrideClassification.status,
              field: overrideClassification.field,
              reasonCode: overrideClassification.reasonCode,
            }
          : decision,
      );
    },
  };
}

function classifyRuntimePreconditions(rule, row, context) {
  const classification = rule.classifySourceRow(row, context);
  if (
    classification.status === "prepared" &&
    rule.sourceTable === "tb_regularize.orientaoes_processual.socios"
  ) {
    try {
      normalizeFloat(row?.porcent);
    } catch (error) {
      if (error?.code !== "V2_FLOAT_INVALID") throw error;
      return {
        status: "quarantine",
        field: "porcent",
        reasonCode: "V2_PARTNER_SHARE_INVALID",
      };
    }
  }
  if (
    classification.status === "prepared" &&
    rule.sourceTable === "tb_admin.usuarios" &&
    !BCRYPT_PATTERN.test(String(row?.password)) &&
    (context?.passwordHashingVerified !== true || typeof context?.hashLegacyPassword !== "function")
  ) {
    return {
      status: "quarantine",
      field: "password",
      reasonCode: "USER_PASSWORD_HASHER_NOT_CONFIGURED",
    };
  }
  return classification;
}

export function buildV2RuntimeState(options = {}) {
  if (!isPlainObject(options)) throw new TypeError("buildV2RuntimeState exige opções");
  const organizationId = options.organizationId ?? CASTELO_ORGANIZATION_ID;
  if (organizationId !== CASTELO_ORGANIZATION_ID) throw runtimeError("V2_TENANT_NOT_CASTELO");
  const destinationRows = normalizeRows(options.destinationRows, "destinationRows").filter(
    (row) => rowOrganizationId(row) === organizationId,
  );
  const sourceRows = normalizeRows(options.sourceRows, "sourceRows");
  const destinationIndexes = buildDestinationIndexes(destinationRows);
  const cargoIndex = buildCargoIndex(sourceRows);

  const lookupDestination = (requirement, value) => {
    const { owner, column } = parseRequirement(requirement, "destination");
    const normalized = normalizeKey(value);
    if (normalized === null) return EMPTY_RESULTS;
    return destinationIndexes.get(`${owner}\0${column}`)?.get(normalized) ?? EMPTY_RESULTS;
  };
  function resolveTaskModel(row) {
    const departmentId = generatedId("tb_admin.departamentos", row?.departamento_id);
    return resolution(
      intersectIds(
        this.lookupDestination("destination:integracao.tasksModel.name", row?.nome),
        this.lookupDestination("destination:integracao.tasksModel.department_id", departmentId),
      ),
    );
  }
  function resolveTaskProject(row) {
    return resolution(
      this.lookupDestination(
        "destination:integracao.projects.client_id",
        generatedId("tb_integracao.clientes", row?.cliente_id),
      ),
    );
  }
  function resolveGuidanceProcess(row) {
    const legacyValue = row?.processo_id;
    if (isEmpty(legacyValue) || String(legacyValue).trim() === "0") return resolution([]);
    const requirement = "destination:regularize.process.id";
    const direct = this.lookupDestination(requirement, legacyValue);
    return resolution(
      direct.length > 0
        ? direct
        : this.lookupDestination(requirement, generatedId("tb_regularize.processos", legacyValue)),
    );
  }
  const resolveCargo = (row) => {
    const matches = cargoIndex.get(normalizeKey(row?.cargo)) ?? EMPTY_RESULTS;
    return Object.freeze({
      ids: Object.freeze(matches.map(({ id }) => id)),
      name: matches.length === 1 ? matches[0].name : null,
      resolution: resolutionState(matches.length),
    });
  };
  function resolveClientByDocument(value) {
    return this.lookupDestination("destination:clients.cpf_cnpj", normalizeDigits(value));
  }
  function resolveClientByName(value) {
    return this.lookupDestination("destination:clients.name", normalizeText(value));
  }
  function resolveMergeTarget(destinationTable, id) {
    return this.lookupDestination(`destination:${destinationTable}.id`, id);
  }

  return Object.freeze({
    organizationId,
    credentialEncryptionVerified: options.credentialEncryptionVerified === true,
    encryptCredential: options.encryptCredential,
    hashLegacyPassword: options.hashLegacyPassword,
    lookupDestination,
    passwordHashingVerified: options.passwordHashingVerified === true,
    resolveCargo,
    resolveClientByDocument,
    resolveClientByName,
    resolveDepartmentReference: options.resolveDepartmentReference,
    resolveGuidanceProcess,
    resolveIntegrationClientReference: options.resolveIntegrationClientReference,
    resolveMergeTarget,
    resolveProjectPlanReference: options.resolveProjectPlanReference,
    resolveRegularizeClientReference: options.resolveRegularizeClientReference,
    resolveTaskModel,
    resolveTaskModelReference: options.resolveTaskModelReference,
    resolveTaskProject,
    resolveUserReference: options.resolveUserReference,
  });
}

async function projectV2Emission(emission, rowOrRows, context = {}) {
  const definition = STEPS_BY_ID.get(emission?.stepId);
  if (definition === undefined || emission.destinationTable !== definition.step.destinationTable) {
    throw runtimeError("V2_PROJECTION_STEP_UNKNOWN");
  }
  if (emission.status !== "prepared") throw runtimeError("V2_PROJECTION_NOT_PREPARED");
  if (definition.step.stepId === "guidance-partners-aggregate") {
    return projectPartnerAggregate(rowOrRows);
  }
  if (Array.isArray(rowOrRows) || !isPlainObject(rowOrRows)) {
    throw runtimeError("V2_PROJECTION_ROW_INVALID");
  }

  const { rule, step } = definition;
  const payload = { ...step.defaults, ...step.constants };
  for (const column of step.columns) {
    if (column.status !== "mapped") continue;
    const sourceValue = column.sourceColumn === null ? undefined : rowOrRows[column.sourceColumn];
    if (
      column.sourceColumn !== null &&
      isEmpty(sourceValue) &&
      Object.hasOwn(step.defaults, column.destinationColumn)
    ) {
      continue;
    }
    const transformer = V2_TRANSFORMERS[column.transformation];
    if (typeof transformer !== "function") throw runtimeError("V2_TRANSFORMER_MISSING");
    const transformed = await transformer(sourceValue, {
      column,
      context,
      emission,
      payload,
      row: rowOrRows,
      rule,
      step,
    });
    if (transformed !== undefined) payload[column.destinationColumn] = transformed;
  }
  return Object.freeze(payload);
}

function requirementsForV2Step(sourceTable, step) {
  if (sourceTable === "tb_integracao.tarefas") {
    return Object.freeze([
      "destination:integracao.tasksModel.name",
      "destination:integracao.tasksModel.department_id",
      "destination:integracao.projects.client_id",
    ]);
  }
  if (sourceTable === "tb_regularize.orientaoes_processual") {
    return Object.freeze(["destination:regularize.process.id"]);
  }
  if (["license-insert", "process-insert"].includes(step.stepId)) {
    return Object.freeze(["destination:clients.cpf_cnpj", "destination:clients.name"]);
  }
  const requirements = [];
  if (step.mode === "merge") requirements.push(`destination:${step.destinationTable}.id`);
  if (step.mode === "lookup") {
    for (const { destinationColumn } of step.identity.criteria) {
      requirements.push(`destination:${step.destinationTable}.${destinationColumn}`);
    }
  }
  if (sourceTable === "tb_rh.colaboradores") {
    requirements.push("source:tb_rh.cargos.id");
  }
  return Object.freeze([...new Set(requirements)]);
}

function cleanupForV2Step(step) {
  if (step.mode === "lookup") return { kind: "none" };
  if (step.mode === "aggregate") {
    return {
      kind: "replace_owned_aggregate",
      identityColumns: ["id"],
      ownedColumns: ["partners"],
      resetValues: { partners: null },
    };
  }
  if (["insert", "derived"].includes(step.mode)) {
    return {
      kind: "delete_by_identity",
      identityColumns: ["id"],
      ownedColumns: [],
      resetValues: {},
    };
  }
  const resetValues = MERGE_RESET_VALUES[step.stepId];
  if (resetValues === undefined) throw runtimeError("V2_MERGE_CLEANUP_MISSING");
  return {
    kind: "reset_owned_columns",
    identityColumns: ["id"],
    ownedColumns: Object.keys(resetValues),
    resetValues,
  };
}

function projectPartnerAggregate(rowOrRows) {
  const rows = (Array.isArray(rowOrRows) ? [...rowOrRows] : [rowOrRows]).sort(comparePartnerRows);
  const partners = rows.map((row) =>
    Object.freeze({
      id: generatedId("tb_regularize.orientaoes_processual.socios", row?.id),
      name: normalizeText(row?.nome),
      share: normalizeFloat(row?.porcent),
      cpf: normalizeDigits(row?.cpf),
      role: normalizeText(row?.cargo),
    }),
  );
  return Object.freeze({ partners: Object.freeze(partners) });
}

function assertMergeTarget(metadata, targetId) {
  if (typeof metadata.context?.resolveMergeTarget !== "function") {
    throw runtimeError("V2_MERGE_RESOLVER_UNAVAILABLE");
  }
  const matches = metadata.context.resolveMergeTarget(metadata.step.destinationTable, targetId);
  if (matches.length === 0) throw runtimeError("V2_MERGE_TARGET_NOT_FOUND");
  if (matches.length > 1) throw runtimeError("V2_MERGE_TARGET_AMBIGUOUS");
}

function generatedId(scope, legacyValue) {
  if (isEmpty(legacyValue)) throw runtimeError("V2_IDENTITY_VALUE_INVALID");
  return uuidV5(REQUIRED_IDENTITY_NAMESPACE, `${scope}:${String(legacyValue).trim()}`);
}

function resolvedIdentityReference(destinationTable, targetId) {
  const normalized = String(targetId ?? "").trim();
  if (!/^[A-Za-z0-9_.-]+$/.test(normalized)) {
    throw runtimeError("V2_MERGE_RESOLUTION_INVALID");
  }
  return `${destinationTable}:${normalized}`;
}

function resolution(ids) {
  const uniqueIds = Object.freeze([...new Set(ids)]);
  return Object.freeze({ ids: uniqueIds, resolution: resolutionState(uniqueIds.length) });
}

function intersectIds(left, right) {
  const rightIds = new Set(right);
  return left.filter((id) => rightIds.has(id));
}

function resolutionState(count) {
  return count === 0 ? "zero" : count === 1 ? "one" : "many";
}

function resolveExactlyOne(ids, missingCode) {
  if (!Array.isArray(ids) || ids.length === 0) throw runtimeError(missingCode);
  if (ids.length > 1) throw runtimeError("V2_REFERENCE_AMBIGUOUS");
  return ids[0];
}

function resolveOptionalUnique(ids) {
  if (!Array.isArray(ids) || ids.length === 0) return undefined;
  if (ids.length > 1) throw runtimeError("V2_REFERENCE_AMBIGUOUS");
  return ids[0];
}

function publicMetadata({ column, rule, step }) {
  return Object.freeze({
    destinationColumn: column.destinationColumn,
    destinationTable: step.destinationTable,
    sourceTable: rule.sourceTable,
    stepId: step.stepId,
  });
}

function credentialSlotForStep(stepId) {
  if (!stepId.startsWith("credential-slot-")) return null;
  const slotKey = stepId.slice("credential-slot-".length);
  return REGULARIZE_CREDENTIAL_SLOTS.find((slot) => slot.slotKey === slotKey) ?? null;
}

function normalizeRows(value, field) {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.some((row) => !isPlainObject(row))) {
    throw new TypeError(`${field} deve ser um array de objetos`);
  }
  return [...value];
}

function buildDestinationIndexes(rows) {
  const indexes = new Map();
  for (const [destinationTable, columns] of Object.entries(DESTINATION_INDEX_COLUMNS)) {
    for (const column of columns) indexes.set(`${destinationTable}\0${column}`, new Map());
  }
  for (const row of rows) {
    const columns = DESTINATION_INDEX_COLUMNS[row.destinationTable];
    if (columns === undefined || isEmpty(row.id)) continue;
    for (const column of columns) {
      const normalized = normalizeKey(row[column]);
      if (normalized === null) continue;
      const index = indexes.get(`${row.destinationTable}\0${column}`);
      const ids = index.get(normalized) ?? [];
      ids.push(String(row.id));
      index.set(normalized, ids);
    }
  }
  for (const index of indexes.values()) {
    for (const [key, ids] of index) index.set(key, Object.freeze([...ids]));
  }
  return indexes;
}

function buildCargoIndex(rows) {
  const index = new Map();
  for (const row of rows) {
    if (row.sourceTable !== "tb_rh.cargos") continue;
    const id = normalizeKey(row.id);
    const name = normalizeText(row.nome ?? row.name);
    if (id === null || name === null) continue;
    const matches = index.get(id) ?? EMPTY_RESULTS;
    index.set(id, Object.freeze([...matches, Object.freeze({ id: String(row.id), name })]));
  }
  return index;
}

function rowOrganizationId(row) {
  return row.organization_id ?? row.organizationId;
}

function parseRequirement(requirement, expectedKind) {
  const match =
    typeof requirement === "string"
      ? requirement.match(/^(source|destination):([A-Za-z0-9_.-]+)\.([A-Za-z0-9_-]+)$/)
      : null;
  if (match === null || match[1] !== expectedKind) {
    throw runtimeError("V2_CONTEXT_REQUIREMENT_INVALID");
  }
  return { owner: match[2], column: match[3] };
}

function normalizeScalar(value) {
  return typeof value === "string" ? normalizeText(value) : (value ?? null);
}

function normalizeText(value) {
  if (value === null || value === undefined) return null;
  const normalized = String(value).normalize("NFKC").trim();
  return normalized.length === 0 ? null : normalized;
}

function normalizeKey(value) {
  return normalizeText(value)?.toLocaleLowerCase("pt-BR") ?? null;
}

function normalizeDigits(value) {
  const text = normalizeText(value);
  if (text === null) return null;
  const digits = text.replaceAll(/\D/g, "");
  return digits.length === 0 ? null : digits;
}

function normalizeEmail(value) {
  return normalizeText(value)?.toLocaleLowerCase("en-US") ?? null;
}

function normalizeBoolean(value) {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value !== 0;
  const normalized = normalizeKey(value);
  if (["1", "sim", "s", "true", "ativo"].includes(normalized)) return true;
  if (["0", "nao", "não", "n", "false", "inativo", null].includes(normalized)) return false;
  throw runtimeError("V2_BOOLEAN_INVALID");
}

function normalizeInteger(value) {
  if (isEmpty(value)) return null;
  const text = String(value).trim();
  if (!isStrictLegacyInteger(value)) throw runtimeError("V2_INTEGER_INVALID");
  const parsed = Number(text);
  return parsed;
}

function normalizeFloat(value) {
  if (isEmpty(value)) return null;
  const text = String(value).trim();
  const normalized = text.includes(",") ? text.replaceAll(".", "").replace(",", ".") : text;
  const parsed = Number(normalized);
  if (!Number.isFinite(parsed)) throw runtimeError("V2_FLOAT_INVALID");
  return parsed;
}

function normalizeDate(value) {
  const text = normalizeText(value);
  if (text === null || text === "0000-00-00" || text.startsWith("0000-00-00 ")) return null;
  const brazilian = text.match(/^(\d{2})\/(\d{2})\/(\d{4})(?:\s+(\d{2}):(\d{2})(?::(\d{2}))?)?$/);
  if (brazilian !== null) {
    return strictUtcDate({
      year: brazilian[3],
      month: brazilian[2],
      day: brazilian[1],
      hour: brazilian[4],
      minute: brazilian[5],
      second: brazilian[6],
    });
  }
  const sqlOrIso = text.match(
    /^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,9}))?)?(Z|[+-]\d{2}:\d{2})?)?$/,
  );
  if (sqlOrIso === null) throw runtimeError("V2_DATE_INVALID");
  return strictUtcDate({
    year: sqlOrIso[1],
    month: sqlOrIso[2],
    day: sqlOrIso[3],
    hour: sqlOrIso[4],
    minute: sqlOrIso[5],
    second: sqlOrIso[6],
    fraction: sqlOrIso[7],
    timezone: sqlOrIso[8],
  });
}

function strictUtcDate(parts) {
  const year = Number(parts.year);
  const month = Number(parts.month);
  const day = Number(parts.day);
  const hour = Number(parts.hour ?? 0);
  const minute = Number(parts.minute ?? 0);
  const second = Number(parts.second ?? 0);
  const millisecond = Number((parts.fraction ?? "").padEnd(3, "0").slice(0, 3) || 0);
  const date = new Date(0);
  date.setUTCFullYear(year, month - 1, day);
  date.setUTCHours(hour, minute, second, millisecond);
  if (
    year < 1 ||
    month < 1 ||
    month > 12 ||
    day < 1 ||
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day ||
    date.getUTCHours() !== hour ||
    date.getUTCMinutes() !== minute ||
    date.getUTCSeconds() !== second
  ) {
    throw runtimeError("V2_DATE_INVALID");
  }
  if (parts.timezone === undefined || parts.timezone === "Z") return date.toISOString();
  const offset = parts.timezone.match(/^([+-])(\d{2}):(\d{2})$/);
  const offsetHour = Number(offset?.[2]);
  const offsetMinute = Number(offset?.[3]);
  if (
    offset === null ||
    offsetHour > 14 ||
    offsetMinute > 59 ||
    (offsetHour === 14 && offsetMinute !== 0)
  ) {
    throw runtimeError("V2_DATE_INVALID");
  }
  const normalized = `${parts.year}-${parts.month}-${parts.day}T${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}:${String(second).padStart(2, "0")}.${String(millisecond).padStart(3, "0")}${parts.timezone}`;
  const zonedDate = new Date(normalized);
  if (Number.isNaN(zonedDate.getTime())) throw runtimeError("V2_DATE_INVALID");
  return zonedDate.toISOString();
}

function normalizeCompetenceDate(value) {
  const text = normalizeText(value);
  if (text === null) return null;
  if (/^\d{4}-\d{2}$/.test(text)) return normalizeDate(`${text}-01`);
  if (/^\d{2}\/\d{4}$/.test(text)) {
    const [month, year] = text.split("/");
    return normalizeDate(`${year}-${month}-01`);
  }
  return normalizeDate(text);
}

function normalizeColor(value) {
  const text = normalizeText(value);
  return text !== null && /^#[0-9a-f]{6}$/i.test(text) ? text.toLocaleLowerCase("en-US") : null;
}

function normalizeDepartmentStatus(value) {
  return normalizeBoolean(value) || normalizeKey(value) === "ativo" ? "Ativo" : "Inativo";
}

function normalizeStatus(value) {
  const text = normalizeText(value);
  if (text === null) return null;
  const normalized = normalizeKey(text);
  if (["1", "ativo", "a", "aberto"].includes(normalized)) return "Ativo";
  if (["0", "inativo", "i", "fechado"].includes(normalized)) return "Inativo";
  return text;
}

function normalizeClientType(value) {
  const normalized = normalizeKey(value);
  if (["pf", "fisica", "física", "1"].includes(normalized)) return "PF";
  if (["pj", "juridica", "jurídica", "2"].includes(normalized)) return "PJ";
  return normalizeText(value)?.toLocaleUpperCase("pt-BR") ?? null;
}

function comparePartnerRows(left, right) {
  const leftId = String(left?.id ?? "");
  const rightId = String(right?.id ?? "");
  if (/^\d+$/.test(leftId) && /^\d+$/.test(rightId)) {
    const leftNumber = BigInt(leftId);
    const rightNumber = BigInt(rightId);
    return leftNumber < rightNumber ? -1 : leftNumber > rightNumber ? 1 : 0;
  }
  return leftId < rightId ? -1 : leftId > rightId ? 1 : 0;
}

function isEmpty(value) {
  return value === null || value === undefined || String(value).trim().length === 0;
}

function isPlainObject(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function runtimeError(code) {
  const error = new Error(code);
  error.code = code;
  return error;
}
