import { createRuntimeEntry } from "../lib/execution-registry.mjs";
import { CASTELO_ORGANIZATION_ID, REQUIRED_IDENTITY_NAMESPACE } from "../lib/mapping-contract.mjs";
import { uuidV5 } from "../lib/uuid-v5.mjs";
import {
  buildRhPessoalRuleContext,
  RH_PESSOAL_RULES,
  SCORE_NITRO_TRANSFORMATIONS,
} from "../rules/rh-pessoal.mjs";

const REFERENCE_RESOLVER_NAMES = Object.freeze({
  client: "resolveClient",
  user: "resolveUser",
  collaboratorUser: "resolveCollaboratorUser",
  union: "resolveUnion",
  point: "resolvePoint",
  score: "resolveScore",
  question: "resolveQuestion",
  requestCategory: "resolveRequestCategory",
  request: "resolveRequest",
});

const RUNTIME_OPTION_NAMES = new Set([
  ...Object.values(REFERENCE_RESOLVER_NAMES),
  "resolveUnique",
  "readUserJson",
  "encryptCredential",
]);

export const RH_PESSOAL_TRANSFORMERS = Object.freeze({
  add_extra_minutes: ({ row }) => timeToMinutes(row?.horas_extras),
  aggregate_child_json: ({ value }) => value,
  aggregate_score_answers_json: ({ value }) => value,
  anchor_required_time: ({ value }) => anchorTime(value),
  combine_date_and_optional_time: ({ row, column }) =>
    combineDateAndTime(row?.data, row?.[column.sourceColumn], false),
  combine_date_and_required_clock_in: ({ row }) =>
    combineDateAndTime(row?.data, row?.entrada, true),
  derive_average_from_aggregated_answers: ({ row }) => scoreAverage(row),
  derive_legacy_nitro_hours_score: ({ row }) =>
    SCORE_NITRO_TRANSFORMATIONS.derive_legacy_nitro_hours_score(row),
  derive_legacy_signed_marker: ({ value }) => (normalizeBoolean(value) ? "legacy-signed" : null),
  derive_signature_status: ({ value }) => (normalizeText(value) === null ? "Gerada" : "Assinada"),
  encrypt_credential: ({ value, context, runtimeState, sourceTable, column }) =>
    encryptCredential(value, context, runtimeState, sourceTable, column.sourceColumn),
  fallback_when_score_final_empty: ({ value, row }) =>
    normalizeText(row?.score_final) === null ? normalizeNumber(value, 0) : undefined,
  normalize_boolean: ({ value }) => normalizeBoolean(value),
  normalize_date: ({ value }) => normalizeDate(value),
  normalize_integer: ({ value }) => normalizeInteger(value),
  normalize_legacy_asset_reference: ({ value }) => normalizeText(value),
  normalize_legacy_nitro_errors_score: ({ row }) =>
    SCORE_NITRO_TRANSFORMATIONS.normalize_legacy_nitro_errors_score(row),
  normalize_legacy_nitro_folders_score: ({ row }) =>
    SCORE_NITRO_TRANSFORMATIONS.normalize_legacy_nitro_folders_score(row),
  normalize_legacy_nitro_projects_score: ({ row }) =>
    SCORE_NITRO_TRANSFORMATIONS.normalize_legacy_nitro_projects_score(row),
  normalize_legacy_nitro_total_errors: ({ row }) =>
    SCORE_NITRO_TRANSFORMATIONS.normalize_legacy_nitro_total_errors(row),
  normalize_legacy_nitro_total_hours: ({ row }) =>
    SCORE_NITRO_TRANSFORMATIONS.normalize_legacy_nitro_total_hours(row),
  normalize_nullable_boolean: ({ value }) => (isMissing(value) ? null : normalizeBoolean(value)),
  normalize_number: ({ value }) => normalizeNumber(value),
  normalize_required_date: ({ value }) => normalizeDate(value),
  normalize_required_date_with_created_fallback: ({ value, row }) =>
    normalizeDate(value) ?? normalizeDate(row?.data_cadastro),
  normalize_required_text: ({ value, column, payload }) =>
    normalizeText(value) ?? payload?.[column.destinationColumn] ?? "******",
  normalize_rh_message_type: ({ value }) => enumValue(value, RH_MESSAGE_TYPES, "Message"),
  normalize_rh_request_status: ({ value }) => enumValue(value, RH_REQUEST_STATUSES, "New"),
  normalize_rh_request_urgency: ({ value }) => enumValue(value, RH_REQUEST_URGENCIES, "Low"),
  normalize_score_evaluation_status: ({ value }) =>
    enumValue(value, SCORE_EVALUATION_STATUSES, "Pending"),
  normalize_score_evaluator_role_code: ({ value }) =>
    enumValue(value, SCORE_EVALUATOR_ROLES, "SELF"),
  normalize_score_question_type: ({ value }) =>
    enumValue(value, SCORE_QUESTION_TYPES, "behavioral"),
  normalize_situation_status: ({ value }) => (normalizeBoolean(value) ? "Concluido" : "Aberto"),
  normalize_text: ({ value }) => normalizeText(value),
  normalize_time_clock_request_status: ({ value }) =>
    enumValue(value, TIME_CLOCK_REQUEST_STATUSES, normalizeText(value) ?? "Pending"),
  prefer_normalized_score_final: ({ value }) =>
    normalizeText(value) === null ? undefined : normalizeNumber(value, 0),
  resolve_client_reference: referenceTransformer,
  resolve_collaborator_user_reference: referenceTransformer,
  resolve_optional_collaborator_rh_assignee: referenceTransformer,
  resolve_optional_union_reference: referenceTransformer,
  resolve_optional_user_reference: referenceTransformer,
  resolve_point_reference: referenceTransformer,
  resolve_request_category_reference: referenceTransformer,
  resolve_request_reference: referenceTransformer,
  resolve_score_by_collaborator_and_quarter: referenceTransformer,
  resolve_user_reference: referenceTransformer,
  stringify_legacy_id: ({ value }) => String(value).trim(),
  subtract_missing_minutes: ({ row }) => -Math.abs(timeToMinutes(row?.horas_faltantes) ?? 0),
  time_to_minutes: ({ value }) => timeToMinutes(value),
  uuid_v5_from_full_source_table_and_legacy_id: ({ value, sourceTable }) =>
    uuidV5(REQUIRED_IDENTITY_NAMESPACE, `${sourceTable}:${String(value).trim()}`),
});

export function buildRhPessoalRuntimeState(options = {}) {
  assertRuntimeOptions(options);
  const resolvers = Object.fromEntries(
    Object.entries(REFERENCE_RESOLVER_NAMES).map(([kind, name]) => [kind, options[name]]),
  );
  const uniqueResolver = options.resolveUnique;
  const userJsonReader = options.readUserJson;
  const credentialEncryptor = options.encryptCredential;

  const readUserJson = (userId, field) => {
    if (typeof userJsonReader !== "function") return NOT_EXECUTED_USER_JSON;
    let value;
    try {
      value = userJsonReader(userId, field);
    } catch {
      throw runtimeError("USER_JSON_READ_FAILED");
    }
    if (
      value === null ||
      typeof value !== "object" ||
      Array.isArray(value) ||
      !["empty", "legacy", "native"].includes(value.state) ||
      !Array.isArray(value.value)
    ) {
      throw runtimeError("USER_JSON_READ_FAILED");
    }
    if (value.state === "empty" && value.value.length !== 0) {
      throw runtimeError("USER_JSON_READ_FAILED");
    }
    return Object.freeze({ state: value.state, value: Object.freeze([...value.value]) });
  };

  return Object.freeze({
    encryptionConfigured: typeof credentialEncryptor === "function",
    resolveReference(kind, value, metadata) {
      if (!(kind in REFERENCE_RESOLVER_NAMES)) throw runtimeError("REFERENCE_KIND_UNKNOWN");
      if (isMissingLegacyReference(value)) return EMPTY_RESOLUTION;
      const resolver = resolvers[kind];
      if (typeof resolver !== "function") return NOT_EXECUTED_RESOLUTION;
      return callResolver(resolver, value, metadata, "REFERENCE_RESOLUTION_FAILED");
    },
    resolveUnique(kind, value, metadata) {
      if (typeof uniqueResolver !== "function") return NOT_EXECUTED_RESOLUTION;
      let result;
      try {
        result = uniqueResolver(kind, value, metadata);
      } catch {
        throw runtimeError("UNIQUE_RESOLUTION_FAILED");
      }
      return normalizeResolution(result);
    },
    readUserJson(userId, field) {
      return readUserJson(userId, field);
    },
    encryptCredential(value, metadata) {
      if (typeof credentialEncryptor !== "function") {
        throw runtimeError("CREDENTIAL_ENCRYPTION_NOT_CONFIGURED");
      }
      try {
        return credentialEncryptor(value, metadata);
      } catch {
        throw runtimeError("CREDENTIAL_ENCRYPTION_FAILED");
      }
    },
  });
}

export const RH_PESSOAL_EXECUTION_ENTRIES = Object.freeze(
  RH_PESSOAL_RULES.flatMap((rule) =>
    rule.destinations.map((step) => {
      const runtimeRule = runtimeRuleFor(rule, step);
      return createRuntimeEntry({
        rule: runtimeRule,
        step,
        organizationId: CASTELO_ORGANIZATION_ID,
        contextRequirements: [],
        projector: (emission, row, runtimeState) =>
          projectRhPessoalEmission(rule, step, emission, row, runtimeState),
        cleanup: cleanupForStep(step),
      });
    }),
  ),
);

const EMPTY_RESOLUTION = Object.freeze({ state: "zero", id: null, value: null });
const NOT_EXECUTED_RESOLUTION = Object.freeze({
  state: "not_executed",
  id: null,
  value: null,
});
const NOT_EXECUTED_USER_JSON = Object.freeze({
  state: "not_executed",
  value: Object.freeze([]),
});

const RH_REQUEST_STATUSES = new Map([
  ["0", "New"],
  ["1", "In_Progress"],
  ["2", "Resolved"],
  ["3", "Closed"],
]);
const RH_REQUEST_URGENCIES = new Map([
  ["1", "Low"],
  ["2", "Medium"],
  ["3", "High"],
]);
const RH_MESSAGE_TYPES = new Map([
  ["0", "Message"],
  ["2", "Solution"],
  ["3", "Rejection"],
  ["4", "Acceptance"],
]);
const SCORE_QUESTION_TYPES = new Map([
  ["1", "behavioral"],
  ["2", "technical"],
  ["3", "tech"],
  ["4", "leadership"],
]);
const SCORE_EVALUATION_STATUSES = new Map([
  ["0", "Pending"],
  ["1", "Completed"],
]);
const SCORE_EVALUATOR_ROLES = new Map([
  ["0", "SELF"],
  ["1", "LEADER"],
  ["2", "RH"],
  ["3", "DIRECTOR"],
  ["4", "TI"],
  ["5", "SUBORDINATE"],
]);
const TIME_CLOCK_REQUEST_STATUSES = new Map([
  ["0", "Pending"],
  ["1", "Approved"],
  ["2", "Rejected"],
]);

function runtimeRuleFor(rule, step) {
  const classifySourceRow = (row, runtimeState) => {
    const context = buildRhPessoalRuleContext(rule.sourceTable, row, runtimeState);
    const classification = rule.classifySourceRow(row, context);
    return classification.status === "prepared"
      ? classifyRuntimeDependencies(rule.sourceTable, context, runtimeState, step)
      : classification;
  };
  return {
    ...rule,
    classifySourceRow,
    emitRows(row, runtimeState) {
      const context = buildRhPessoalRuleContext(rule.sourceTable, row, runtimeState);
      const emissions = rule.emitRows(row, context);
      if (!emissions.some(({ status }) => status === "prepared")) return emissions;
      const runtimeClassification = classifyRuntimeDependencies(
        rule.sourceTable,
        context,
        runtimeState,
        step,
      );
      if (runtimeClassification.status === "prepared") return emissions;
      return emissions.map((emission) =>
        emission.status === "prepared"
          ? {
              ...emission,
              status: "quarantine",
              identityRef: `quarantine:${rule.sourceTable}:${runtimeClassification.field}:invalid`,
              field: runtimeClassification.field,
              reasonCode: runtimeClassification.reasonCode,
            }
          : emission,
      );
    },
  };
}

function classifyRuntimeDependencies(sourceTable, context, runtimeState, step) {
  if (["tb_rh.alergias", "tb_rh.contatos_emergencia"].includes(sourceTable)) {
    const ownedColumn = step.columns.find(
      ({ status, transformation }) =>
        status === "mapped" && transformation === "aggregate_child_json",
    )?.destinationColumn;
    let current;
    try {
      current = runtimeState?.readUserJson?.(context?.userId, ownedColumn);
    } catch (error) {
      if (error?.code === "USER_JSON_READ_FAILED") {
        return {
          status: "quarantine",
          field: ownedColumn,
          reasonCode: "USER_JSON_READ_FAILED",
        };
      }
      throw error;
    }
    if (current?.state === "not_executed" || current === undefined) {
      return {
        status: "quarantine",
        field: ownedColumn,
        reasonCode: "USER_JSON_STATE_NOT_PROVIDED",
      };
    }
    if (current?.state === "native" && current.value.length > 0) {
      return {
        status: "quarantine",
        field: ownedColumn,
        reasonCode: "USER_JSON_NATIVE_VALUE_PRESENT",
      };
    }
  }
  if (sourceTable !== "tb_rh.score_avaliacoes") return { status: "prepared" };
  const questions = context?.questionResolutions;
  if (!Array.isArray(questions)) {
    return {
      status: "quarantine",
      field: "p1",
      reasonCode: "QUESTION_REFERENCE_LOOKUP_NOT_EXECUTED",
    };
  }
  for (const resolution of questions) {
    if (resolution?.state === "one" && isResolvedId(resolution.id)) continue;
    const suffix =
      resolution?.state === "zero"
        ? "NOT_FOUND"
        : resolution?.state === "many"
          ? "AMBIGUOUS"
          : "LOOKUP_NOT_EXECUTED";
    return {
      status: "quarantine",
      field: `p${resolution?.slot ?? 1}`,
      reasonCode: `QUESTION_REFERENCE_${suffix}`,
    };
  }
  return { status: "prepared" };
}

function projectRhPessoalEmission(rule, step, emission, rowOrRows, runtimeState) {
  if (emission?.status !== "prepared") throw runtimeError("PROJECTION_REQUIRES_PREPARED");
  const rows = Array.isArray(rowOrRows) ? [...rowOrRows] : [rowOrRows];
  if (rows.length === 0) throw runtimeError("AGGREGATE_ROWS_EMPTY");
  const context = buildRhPessoalRuleContext(rule.sourceTable, rows[0], runtimeState);
  if (step.mode === "aggregate") {
    return projectUserJsonAggregate(rule.sourceTable, step, rows, context, runtimeState);
  }
  const [row] = rows;

  const payload = { ...step.defaults, ...step.constants };
  if (rule.sourceTable === "tb_rh.score_avaliacoes") {
    Object.assign(payload, projectScoreEvaluation(row, context));
  }

  for (const column of step.columns) {
    if (column.status !== "mapped") continue;
    if (
      rule.sourceTable === "tb_rh.score_avaliacoes" &&
      ["answers", "average_score"].includes(column.destinationColumn)
    ) {
      continue;
    }
    if (
      rule.sourceTable === "tb_rh.pontos_registros" &&
      column.destinationColumn === "time_bank_balance"
    ) {
      payload.time_bank_balance =
        (timeToMinutes(row?.horas_extras) ?? 0) -
        Math.abs(timeToMinutes(row?.horas_faltantes) ?? 0);
      continue;
    }
    const transformer = RH_PESSOAL_TRANSFORMERS[column.transformation];
    if (typeof transformer !== "function") throw runtimeError("TRANSFORMATION_NOT_IMPLEMENTED");
    const value = transformer({
      value: row?.[column.sourceColumn],
      row,
      context,
      column,
      sourceTable: rule.sourceTable,
      runtimeState,
      payload,
    });
    if (value !== undefined) payload[column.destinationColumn] = value;
  }
  return payload;
}

function projectUserJsonAggregate(sourceTable, step, rows, context, runtimeState) {
  const userId = context?.userId;
  if (!isResolvedId(userId)) throw runtimeError("AGGREGATE_USER_REFERENCE_INVALID");
  const ownedColumn = step.columns.find(
    ({ status, transformation }) =>
      status === "mapped" && transformation === "aggregate_child_json",
  )?.destinationColumn;
  if (!isResolvedId(ownedColumn)) throw runtimeError("AGGREGATE_OWNED_COLUMN_INVALID");

  const parentIdentity = String(rows[0]?.colaborador_id).trim();
  if (rows.some((row) => String(row?.colaborador_id).trim() !== parentIdentity)) {
    throw runtimeError("AGGREGATE_PARENT_MISMATCH");
  }

  const candidates = rows
    .map((row) => {
      const child = projectUserJsonChild(ownedColumn, row);
      return {
        sourceIdentity: `${sourceTable}:${String(row?.id).trim()}`,
        contentKey: userJsonContentKey(ownedColumn, child),
        child,
      };
    })
    .sort(compareUserJsonCandidates);
  const current = runtimeState?.readUserJson?.(userId, ownedColumn);
  const replacementAllowed =
    ["empty", "legacy"].includes(current?.state) ||
    (current?.state === "native" && current.value.length === 0);
  if (!replacementAllowed) {
    throw runtimeError("USER_JSON_REPLACEMENT_NOT_ALLOWED");
  }
  const seenSources = new Set();
  const children = [];
  for (const candidate of candidates) {
    if (seenSources.has(candidate.sourceIdentity)) continue;
    seenSources.add(candidate.sourceIdentity);
    children.push(candidate.child);
  }

  return {
    id: userId,
    [ownedColumn]: children,
  };
}

function projectUserJsonChild(ownedColumn, row) {
  return ownedColumn === "allergies"
    ? {
        name: normalizeText(row?.nome),
        sources: normalizeText(row?.fontes),
        treatment: normalizeText(row?.tratativo),
      }
    : {
        name: normalizeText(row?.nome),
        relation: normalizeText(row?.referencia),
        phone: normalizeText(row?.numero),
      };
}

function userJsonContentKey(ownedColumn, child) {
  if (child === null || typeof child !== "object" || Array.isArray(child)) return null;
  const values =
    ownedColumn === "allergies"
      ? [child.name, child.sources, child.treatment]
      : [child.name, child.relation, child.phone];
  return JSON.stringify(values.map((value) => normalizeText(value)));
}

function compareUserJsonCandidates(left, right) {
  const identityOrder = left.sourceIdentity.localeCompare(right.sourceIdentity, "en-US", {
    numeric: true,
  });
  return identityOrder === 0
    ? left.contentKey.localeCompare(right.contentKey, "en-US")
    : identityOrder;
}

function projectScoreEvaluation(row, context) {
  const answers = context.questionResolutions.map((resolution) => ({
    question_id: resolution.id,
    answer: normalizeNumber(row?.[`n${resolution.slot}`], 0),
    obs: normalizeText(row?.[`obs${resolution.slot}`]) ?? "",
  }));
  return { answers, average_score: scoreAverage(row) };
}

function scoreAverage(row) {
  const values = Array.from({ length: 8 }, (_, index) => index + 1).flatMap((slot) =>
    isMissingLegacyReference(row?.[`p${slot}`]) ? [] : [normalizeNumber(row?.[`n${slot}`], 0)],
  );
  return values.length === 0
    ? 0
    : values.reduce((total, value) => total + value, 0) / values.length;
}

function referenceTransformer({ context, column }) {
  const byDestination = {
    client_id: context.clientId,
    registered_by_id: context.registeredById,
    completed_by_id: context.completedById,
    responsible_id: context.responsibleId,
    responsavel_id: context.responsibleId,
    union_id: context.unionId,
    user_id: context.userId,
    added_by_user_id: context.addedById,
    point_id: context.pointId,
    approver_user_id: context.approverId,
    score_id: context.scoreId,
    evaluator_id: context.evaluatorId,
    requester_user_id: context.requesterUserId,
    assigned_to_user_id: context.assigneeUserId,
    category_id: context.categoryId,
    request_id: context.requestId,
    sender_user_id: context.senderId,
  };
  if (!Object.hasOwn(byDestination, column.destinationColumn)) {
    throw runtimeError("REFERENCE_DESTINATION_UNKNOWN");
  }
  return byDestination[column.destinationColumn] ?? null;
}

function cleanupForStep(step) {
  if (step.mode === "insert") {
    return {
      kind: "delete_by_identity",
      identityColumns: ["id"],
      ownedColumns: [],
      resetValues: {},
    };
  }
  const ownedColumns = [
    ...new Set(
      step.columns
        .filter(
          ({ status, transformation }) =>
            status === "mapped" && transformation === "aggregate_child_json",
        )
        .map(({ destinationColumn }) => destinationColumn),
    ),
  ];
  if (step.mode === "aggregate") {
    return {
      kind: "replace_owned_aggregate",
      identityColumns: ["id"],
      ownedColumns,
      resetValues: Object.fromEntries(ownedColumns.map((column) => [column, null])),
    };
  }
  return {
    kind: "reset_owned_columns",
    identityColumns: ["id"],
    ownedColumns,
    resetValues: Object.fromEntries(ownedColumns.map((column) => [column, null])),
  };
}

function callResolver(resolver, value, metadata, failureCode) {
  let result;
  try {
    result = resolver(value, metadata);
  } catch {
    throw runtimeError(failureCode);
  }
  return normalizeResolution(result);
}

function normalizeResolution(result) {
  if (result === null) return EMPTY_RESOLUTION;
  if (result === undefined) return NOT_EXECUTED_RESOLUTION;
  if (Array.isArray(result)) {
    if (result.length === 0) return EMPTY_RESOLUTION;
    if (result.length > 1) return Object.freeze({ state: "many", id: null, value: null });
    return normalizeResolution(result[0]);
  }
  if (typeof result === "string" && result.trim().length > 0) {
    return Object.freeze({ state: "one", id: result.trim(), value: null });
  }
  if (typeof result === "object") {
    const state = result.state ?? (isResolvedId(result.id) ? "one" : "not_executed");
    if (!["zero", "one", "many"].includes(state)) return NOT_EXECUTED_RESOLUTION;
    if (state === "zero") return EMPTY_RESOLUTION;
    if (state === "many") return Object.freeze({ state: "many", id: null, value: null });
    if (!isResolvedId(result.id)) return NOT_EXECUTED_RESOLUTION;
    return Object.freeze({ state: "one", id: result.id.trim(), value: result.value ?? null });
  }
  return NOT_EXECUTED_RESOLUTION;
}

function encryptCredential(value, context, runtimeState, sourceTable, sourceColumn) {
  if (isMissing(value)) return null;
  if (context?.credentialEncryptionVerified !== true) {
    throw runtimeError("CREDENTIAL_ENCRYPTION_NOT_CONFIGURED");
  }
  if (runtimeState?.encryptCredential instanceof Function) {
    return runtimeState.encryptCredential(value, { sourceTable, sourceColumn });
  }
  throw runtimeError("CREDENTIAL_ENCRYPTION_NOT_CONFIGURED");
}

function assertRuntimeOptions(options) {
  if (options === null || typeof options !== "object" || Array.isArray(options)) {
    throw new TypeError("buildRhPessoalRuntimeState exige opções");
  }
  for (const [name, value] of Object.entries(options)) {
    if (!RUNTIME_OPTION_NAMES.has(name)) {
      throw new Error(`Opção runtime RH/Pessoal desconhecida: ${name}`);
    }
    if (typeof value !== "function") throw new TypeError(`${name} deve ser função`);
  }
}

function isMissingLegacyReference(value) {
  return isMissing(value) || String(value).trim() === "0";
}

function isMissing(value) {
  return value === undefined || value === null || String(value).trim() === "";
}

function isResolvedId(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function normalizeText(value) {
  return isMissing(value) ? null : String(value).trim();
}

function normalizeDate(value) {
  const text = normalizeText(value);
  return text === null || text.startsWith("0000-00-00") ? null : text;
}

function normalizeNumber(value, fallback = null) {
  if (isMissing(value)) return fallback;
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function normalizeInteger(value) {
  const number = normalizeNumber(value);
  return number === null ? null : Math.trunc(number);
}

function normalizeBoolean(value) {
  return ["1", "true", "sim", "yes", "ativo", "aprovado"].includes(
    String(value ?? "")
      .trim()
      .toLocaleLowerCase("pt-BR"),
  );
}

function enumValue(value, mapping, fallback) {
  const text = normalizeText(value);
  if (text === null) return fallback;
  return mapping.get(text) ?? ([...mapping.values()].includes(text) ? text : fallback);
}

function timeToMinutes(value) {
  const text = normalizeText(value);
  if (text === null) return null;
  if (/^-?\d+(?:\.\d+)?$/.test(text)) return Math.round(Number(text) * 60);
  const match = text.match(/^(-?)(\d+):(\d{1,2})(?::(\d{1,2}))?$/);
  if (match === null) return null;
  const minutes = Number(match[2]) * 60 + Number(match[3]) + Math.round(Number(match[4] ?? 0) / 60);
  return match[1] === "-" ? -minutes : minutes;
}

function anchorTime(value) {
  const time = normalizeText(value);
  return time === null || isZeroClock(time) ? null : `1970-01-01T${normalizeClock(time)}`;
}

function combineDateAndTime(dateValue, timeValue, required) {
  const date = normalizeDate(dateValue);
  const time = normalizeText(timeValue);
  if (date === null || time === null || isZeroClock(time)) return required ? null : null;
  return `${date.slice(0, 10)}T${normalizeClock(time)}`;
}

function isZeroClock(value) {
  return /^00:00(?::00)?$/.test(value);
}

function normalizeClock(value) {
  return /^\d{1,2}:\d{2}$/.test(value) ? `${value}:00` : value;
}

function runtimeError(code) {
  const error = new Error(code);
  error.code = code;
  return error;
}
