import { createRuntimeEntry } from "../lib/execution-registry.mjs";
import { CASTELO_ORGANIZATION_ID, REQUIRED_IDENTITY_NAMESPACE } from "../lib/mapping-contract.mjs";
import { uuidV5 } from "../lib/uuid-v5.mjs";
import {
  createLegacyReferenceResolver,
  createV2ClientIdentityResolver,
} from "../rules/admin-business.mjs";
import {
  buildClientPfResolutionContexts,
  buildGuidanceActivityPayload,
  buildIntegrationRegularizeReferenceContext,
  buildPartnerPairResolutionContexts,
  INTEGRACAO_REGULARIZE_RULES,
  INTEGRACAO_REGULARIZE_TRANSFORMATIONS,
  resolveRegularizeReferringType,
} from "../rules/integracao-regularize.mjs";
import { V2_RULES } from "../rules/v2.mjs";

const ENTRY_BY_SOURCE = new Map();
const SOURCE_RESOLUTIONS = Object.freeze({
  "tb_integracao.pa": [["client", "cliente_id", "tb_integracao.clientes"]],
  "tb_integracao.pa_historicos": [
    ["client", "cliente_id", "tb_integracao.clientes"],
    ["user", "user_id", "tb_admin.usuarios"],
  ],
  "tb_integracao.tarefas_dependentes": [
    ["taskModel", "tarefa_express_id", "tb_integracao.tarefas_express"],
    ["dependentModel", "dependente_id", "tb_integracao.tarefas_express"],
  ],
  "tb_integracao.tarefas_express_distrato": [
    ["department", "departamento_id", "tb_admin.departamentos"],
    ["responsible", "responsavel_id", "tb_admin.usuarios"],
    ["responsible2", "responsavel_id_dois", "tb_admin.usuarios"],
    ["responsible3", "responsavel_id_tres", "tb_admin.usuarios"],
  ],
  "tb_regularize.grupos_integrantes": [["group", "grupo_id", "tb_regularize.grupos"]],
});

const CUSTOM_AGGREGATE_TRANSFORMATIONS = new Set([
  "aggregate_activity_uuid",
  "aggregate_normalized_economic_activities",
  "aggregate_parent_reference",
  "normalize_economic_activity_type",
]);

export const INTEGRACAO_REGULARIZE_TRANSFORMERS = Object.freeze(
  Object.fromEntries(
    Object.entries(INTEGRACAO_REGULARIZE_TRANSFORMATIONS).filter(
      ([name]) => !CUSTOM_AGGREGATE_TRANSFORMATIONS.has(name),
    ),
  ),
);

const runtimeRules = INTEGRACAO_REGULARIZE_RULES.map((rule) => ({
  ...rule,
  classifySourceRow(row, runtimeState) {
    const context = contextForRuntime(rule.sourceTable, row, runtimeState);
    return rule.classifySourceRow(row, context);
  },
  emitRows(row, runtimeState) {
    const context = contextForRuntime(rule.sourceTable, row, runtimeState);
    return rule.emitRows(row, context);
  },
}));

export const INTEGRACAO_REGULARIZE_EXECUTION_ENTRIES = Object.freeze(
  runtimeRules.flatMap((rule) =>
    rule.destinations.map((step) => {
      const entry = createRuntimeEntry({
        rule,
        step,
        organizationId: CASTELO_ORGANIZATION_ID,
        contextRequirements: requirementsForStep(rule.sourceTable, step),
        projector: (decision, rowOrRows, state) =>
          projectIntegracaoRegularize(rule, step, decision, rowOrRows, state),
        cleanup: cleanupForStep(step),
        projectionKind: step.mode === "aggregate" ? "custom_projector" : "column_transformers",
      });
      ENTRY_BY_SOURCE.set(`${rule.sourceTable}\0${step.stepId}`, entry);
      return entry;
    }),
  ),
);

export function buildIntegracaoRegularizeRuntimeState(options = {}) {
  if (!isPlainObject(options))
    throw new TypeError("buildIntegracaoRegularizeRuntimeState exige opções");
  const organizationId = options.organizationId ?? CASTELO_ORGANIZATION_ID;
  if (organizationId !== CASTELO_ORGANIZATION_ID) {
    throw new Error("Runtime Integração/Regularize exige o tenant Castelo");
  }
  const rowsBySource = normalizeRowsBySource(options.sourceRows ?? {});
  const clientCandidates = normalizeRows(options.clientCandidates, "clientCandidates");
  const clientPfRows = normalizeRows(options.clientPfRows, "clientPfRows");
  const currentClientPfRows = normalizeRows(options.currentClientPfRows, "currentClientPfRows");
  const currentClientPfStateVerified = options.currentClientPfStateVerified === true;
  const partnerRows = normalizeRows(options.partnerRows, "partnerRows");
  const regularizeClients = normalizeRows(options.regularizeClients, "regularizeClients");
  const integrationClients = normalizeRows(options.integrationClients, "integrationClients");

  if (clientPfRows.length > 0) rowsBySource.set("tb_regularize.pf", clientPfRows);
  if (partnerRows.length > 0) rowsBySource.set("tb_regularize.pf_empresas", partnerRows);
  const resolvers = new Map(
    [...rowsBySource].map(([sourceTable, rows]) => [
      sourceTable,
      createLegacyReferenceResolver({
        sourceTable,
        legacyColumn: identityColumnFor(sourceTable),
        rows,
      }),
    ]),
  );
  const v2Clients =
    regularizeClients.length > 0 || integrationClients.length > 0
      ? createV2ClientIdentityResolver({
          regularizeRows: regularizeClients,
          integrationRows: integrationClients,
        })
      : null;
  const clientPfContexts = buildDecisionContextIndex(
    clientPfRows,
    currentClientPfRows,
    ({ rows, currentRows }) =>
      buildClientPfResolutionContexts({
        rows,
        currentRows,
        currentStateVerified: currentClientPfStateVerified,
      }),
  );
  const partnerContexts = buildPartnerContexts({
    partnerRows,
    clientPfRows,
    currentClientPfRows,
    v2Clients,
  });

  const state = {
    organizationId,
    clientCandidates,
    rowsBySource,
    resolvers,
    v2Clients,
    clientPfContexts,
    partnerContexts,
    contextFor(sourceTable, row) {
      return buildRuntimeContext(sourceTable, row, state);
    },
  };

  async function* iterateRows(sourceTable, rows) {
    if (!ENTRY_BY_SOURCE.size) throw new Error("INTEGRACAO_REGULARIZE_RUNTIME_NOT_CONFIGURED");
    const entries = INTEGRACAO_REGULARIZE_EXECUTION_ENTRIES.filter(
      (entry) => entry.sourceTable === sourceTable,
    );
    if (entries.length === 0)
      throw new Error(`Origem Integração/Regularize desconhecida: ${sourceTable}`);
    for await (const row of rows) {
      for (const entry of entries) {
        const [decision] = entry
          .emitRows(row, state)
          .filter(({ stepId }) => stepId === entry.stepId);
        if (decision.status === "prepared") {
          yield Object.freeze({
            sourceTable,
            stepId: entry.stepId,
            status: "prepared",
            payload: entry.projector(decision, row, state),
          });
        } else {
          yield Object.freeze({
            sourceTable,
            stepId: entry.stepId,
            status: decision.status,
            field: decision.field,
            reasonCode: decision.reasonCode,
          });
        }
      }
    }
  }

  return Object.freeze({ ...state, iterateRows });
}

function contextForRuntime(sourceTable, row, state) {
  if (!isRuntimeState(state))
    return quarantine("runtime", "INTEGRACAO_REGULARIZE_RUNTIME_STATE_REQUIRED");
  try {
    return buildRuntimeContext(sourceTable, row, state);
  } catch {
    return buildIntegrationRegularizeReferenceContext(sourceTable, row, {});
  }
}

function buildRuntimeContext(sourceTable, row, state) {
  if (sourceTable === "tb_regularize.pf") {
    if (state.clientCandidates.length > 1) return quarantinedRuntimeContext(row, "cpf_cnpj");
    return contextFromIndex(state.clientPfContexts, row?.codigo, row, sourceTable);
  }
  if (sourceTable === "tb_regularize.pf_empresas") {
    return contextFromIndex(state.partnerContexts, row?.id, row, sourceTable);
  }
  const resolutions = {};
  for (const [name, field, targetSource] of SOURCE_RESOLUTIONS[sourceTable] ?? []) {
    if (name.startsWith("responsible") && !hasReference(row?.[field])) continue;
    resolutions[name] = resolveReference(state, targetSource, row?.[field]);
  }
  if (sourceTable === "tb_regularize.grupos_integrantes") {
    if (state.v2Clients === null) throw new Error("CANONICAL_CLIENT_LOOKUP_NOT_EXECUTED");
    resolutions.client = state.v2Clients.resolve(row?.codigo_cliente);
  }
  if (sourceTable === "tb_integracao.tarefas_regularize") {
    resolutions.taskModel = resolveReference(state, "tb_integracao.tarefas_express", row?.tarefa);
    const kind = resolveRegularizeReferringType(row?.vinculo);
    resolutions.referringType = referenceResolution(
      kind === null ? "zero" : "one",
      sourceTable,
      row?.id,
      kind === null ? null : `regularize.${kind}`,
      {
        relatedIdentityRef: kind === null ? null : `regularize.${kind}`,
        criteria: { legacyValue: text(row?.vinculo) },
      },
    );
  }
  if (sourceTable === "tb_regularize.orientaoes_processual.atividades") {
    resolutions.guidance = resolveReference(
      state,
      "tb_regularize.orientaoes_processual",
      row?.op_id,
    );
  }
  if (sourceTable === "tb_regularize.vencimento") {
    resolutions.clientPf = resolveReference(state, "tb_regularize.pf", row?.referente);
    const type = text(row?.tipo).toLocaleLowerCase("pt-BR");
    const key = `${text(row?.referente)}-${type}`;
    const duplicate =
      (state.rowsBySource.get(sourceTable) ?? []).filter(
        (candidate) =>
          `${text(candidate?.referente)}-${text(candidate?.tipo).toLocaleLowerCase("pt-BR")}` ===
          key,
      ).length > 1;
    resolutions.expirationSlot = referenceResolution(duplicate ? "many" : "one", sourceTable, key);
  }
  return buildIntegrationRegularizeReferenceContext(sourceTable, row, resolutions);
}

function projectIntegracaoRegularize(rule, step, decision, rowOrRows, state) {
  if (decision?.status !== "prepared")
    throw new Error("INTEGRACAO_REGULARIZE_PROJECTION_NOT_PREPARED");
  const rows = Array.isArray(rowOrRows) ? rowOrRows : [rowOrRows];
  if (rows.length === 0 || rows.some((row) => !isPlainObject(row))) {
    throw new TypeError("projeção exige uma ou mais linhas simples");
  }
  if (step.mode === "aggregate") return projectGuidanceActivities(step, rows, state);
  const row = rows[0];
  const context = buildRuntimeContext(rule.sourceTable, row, state);
  const payload = { ...step.defaults, ...step.constants };
  for (const column of step.columns) {
    if (column.status !== "mapped") continue;
    const transformer = INTEGRACAO_REGULARIZE_TRANSFORMERS[column.transformation];
    if (typeof transformer !== "function")
      throw new Error(`Transformação ausente: ${column.transformation}`);
    const value = transformer(row?.[column.sourceColumn], {
      column,
      context,
      decision,
      payload,
      row,
      rule,
      step,
    });
    if (value !== undefined) payload[column.destinationColumn] = value;
  }
  return Object.freeze(payload);
}

function projectGuidanceActivities(step, rows, state) {
  const parent = text(rows[0]?.op_id);
  if (rows.some((row) => text(row?.op_id) !== parent)) throw new Error("AGGREGATE_PARENT_MISMATCH");
  const context = buildRuntimeContext(
    "tb_regularize.orientaoes_processual.atividades",
    rows[0],
    state,
  );
  const activities = rows
    .map(buildGuidanceActivityPayload)
    .filter((activity) => activity !== null)
    .sort((left, right) => left.id.localeCompare(right.id));
  return Object.freeze({
    id: uuidV5(REQUIRED_IDENTITY_NAMESPACE, context.resolutions.guidance.identityRef),
    [step.columns.find(({ transformation }) => transformation === "aggregate_activity_uuid")
      .destinationColumn]: activities,
  });
}

function requirementsForStep(_sourceTable, step) {
  const requirements = (step.dependencies ?? []).map(
    (dependency) => `source:${dependency}.${legacyIdentityColumn(dependency, step)}`,
  );
  if (step.mode === "merge") {
    requirements.push(`destination:${step.destinationTable}.${destinationIdentityColumn(step)}`);
  }
  return Object.freeze([...new Set(requirements)]);
}

function legacyIdentityColumn(sourceTable, currentStep) {
  if (
    currentStep.identity?.kind === "resolve" &&
    currentStep.identity.sourceTable === sourceTable
  ) {
    return currentStep.identity.targetLegacyColumn;
  }
  const candidates = new Set();
  for (const rule of [...V2_RULES, ...INTEGRACAO_REGULARIZE_RULES]) {
    if (rule.sourceTable !== sourceTable) continue;
    for (const step of rule.destinations) {
      if (step.identity?.kind === "generate") candidates.add(step.identity.legacyColumn);
    }
  }
  if (candidates.size > 1) throw new Error(`Identidade legada ambígua: ${sourceTable}`);
  return [...candidates][0] ?? "id";
}

function destinationIdentityColumn(step) {
  if (step.identity?.kind !== "resolve") return "id";
  return (
    step.columns.find(
      ({ sourceColumn, status }) =>
        status === "mapped" && sourceColumn === step.identity.sourceColumn,
    )?.destinationColumn ?? "id"
  );
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
  if (step.stepId === "integration-pa-merge") {
    const ownedColumns = [
      ...new Set(
        step.columns
          .filter(
            ({ status, destinationColumn }) =>
              status === "mapped" && destinationColumn !== "client_id",
          )
          .map(({ destinationColumn }) => destinationColumn),
      ),
    ];
    return {
      kind: "reset_owned_columns",
      identityColumns: ["client_id"],
      ownedColumns,
      resetValues: Object.fromEntries(ownedColumns.map((column) => [column, null])),
    };
  }
  const identityColumns = ["id"];
  const ownedColumns = [
    ...new Set(
      step.columns
        .filter(
          ({ status, destinationColumn }) =>
            status === "mapped" &&
            !identityColumns.includes(destinationColumn) &&
            destinationColumn !== "organization_id",
        )
        .map(({ destinationColumn }) => destinationColumn),
    ),
  ];
  if (step.mode === "aggregate") {
    return {
      kind: "replace_owned_aggregate",
      identityColumns,
      ownedColumns,
      resetValues: Object.fromEntries(ownedColumns.map((column) => [column, null])),
    };
  }
  return {
    kind: "reset_owned_columns",
    identityColumns,
    ownedColumns,
    resetValues: Object.fromEntries(ownedColumns.map((column) => [column, null])),
  };
}

function buildDecisionContextIndex(rows, currentRows, builder) {
  if (rows.length === 0) return new Map();
  const contexts = builder({ rows, currentRows });
  return new Map(rows.map((row, index) => [text(row?.codigo), contexts[index]]));
}

function buildPartnerContexts({ partnerRows, clientPfRows, v2Clients }) {
  if (partnerRows.length === 0 || clientPfRows.length === 0 || v2Clients === null) return new Map();
  const clientPfResolver = createLegacyReferenceResolver({
    sourceTable: "tb_regularize.pf",
    legacyColumn: "codigo",
    rows: clientPfRows,
  });
  const contexts = buildPartnerPairResolutionContexts({
    rows: partnerRows,
    clientPfResolutions: partnerRows.map((row) => clientPfResolver.resolve(row?.pf_id)),
    clientResolutions: partnerRows.map((row) => v2Clients.resolve(row?.empresa_id)),
  });
  return new Map(partnerRows.map((row, index) => [text(row?.id), contexts[index]]));
}

function contextFromIndex(index, key, _row, sourceTable) {
  const context = index.get(text(key));
  if (context === undefined) throw new Error(`${sourceTable}_CONTEXT_NOT_EXECUTED`);
  return context;
}

function resolveReference(state, sourceTable, value) {
  const resolver = state.resolvers.get(sourceTable);
  if (resolver === undefined) return referenceResolution("zero", sourceTable, value);
  return resolver.resolve(value);
}

function referenceResolution(state, sourceTable, value, identityRef = undefined, extra = {}) {
  const key = text(value);
  return {
    state,
    sourceTable,
    sourceKey: key,
    sourceIdentityRef: `${sourceTable}:${key}`,
    identityRef: state === "one" ? (identityRef ?? `${sourceTable}:${key}`) : null,
    ...extra,
  };
}

function quarantinedRuntimeContext(row, _field) {
  return buildIntegrationRegularizeReferenceContext("tb_regularize.pf", row, {
    uniqueCode: referenceResolution("many", "tb_regularize.pf", row?.codigo),
    uniqueCpf: referenceResolution("many", "tb_regularize.pf", row?.codigo),
    uniqueRg: referenceResolution("many", "tb_regularize.pf", row?.codigo),
  });
}

function normalizeRowsBySource(value) {
  if (!isPlainObject(value)) throw new TypeError("sourceRows deve ser um objeto por origem");
  return new Map(
    Object.entries(value).map(([sourceTable, rows]) => [
      sourceTable,
      normalizeRows(rows, sourceTable),
    ]),
  );
}

function normalizeRows(value, label) {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.some((row) => !isPlainObject(row))) {
    throw new TypeError(`${label} deve ser um array de objetos`);
  }
  return [...value];
}

function identityColumnFor(sourceTable) {
  return sourceTable === "tb_regularize.pf" ? "codigo" : "id";
}

function isRuntimeState(value) {
  return isPlainObject(value) && value.organizationId === CASTELO_ORGANIZATION_ID;
}

function hasReference(value) {
  return /^[1-9]\d*$/.test(text(value));
}

function text(value) {
  return String(value ?? "").trim();
}

function quarantine(field, reasonCode) {
  return { status: "quarantine", field, reasonCode };
}

function isPlainObject(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
