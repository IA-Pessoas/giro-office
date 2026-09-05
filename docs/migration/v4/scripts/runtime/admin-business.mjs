import { createHash } from "node:crypto";

import { createRuntimeEntry } from "../lib/execution-registry.mjs";
import { CASTELO_ORGANIZATION_ID, REQUIRED_IDENTITY_NAMESPACE } from "../lib/mapping-contract.mjs";
import { uuidV5 } from "../lib/uuid-v5.mjs";
import {
  ADMIN_BUSINESS_RULES,
  ADMIN_BUSINESS_TRANSFORMATIONS,
  buildIcmsResolutionContexts,
  buildPermissionResolutionContexts,
  createLegacyReferenceResolver,
  createV2ClientIdentityResolver,
  isAuthoritativeV2ClientIdentityResolution,
} from "../rules/admin-business.mjs";

const PERMISSION_PREFIX = "tb_admin.permissoes_";
const DYNAMIC_PERMISSION_SOURCE_TABLE = "tb_admin.permissoes";
const USER_REFERENCE_COLUMNS = new Map([
  ["tb_admin.logs", "usuario_id"],
  ["tb_contabil.clientes_observacao", "user_id"],
]);
const CLIENT_REFERENCE_SOURCES = new Set([
  "tb_contabil.clientes_mov",
  "tb_contabil.clientes_observacao",
  "tb_contabil.controle",
  "tb_contabil.relacoes",
]);
const RUNTIME_CONTEXT_ISSUANCE = new WeakMap();
const ENTRY_BY_SOURCE = new Map();

export const ADMIN_BUSINESS_TRANSFORMERS = ADMIN_BUSINESS_TRANSFORMATIONS;

const runtimeRules = ADMIN_BUSINESS_RULES.map((rule) => {
  const runtimeRule = {
    ...rule,
    classifySourceRow(row, runtimeState) {
      return classifyRuntimeRow(
        rule,
        row,
        resolveInvocationContext(runtimeState, rule.sourceTable, row),
      );
    },
    emitRows(row, runtimeState) {
      return emitRuntimeRows(
        rule,
        row,
        resolveInvocationContext(runtimeState, rule.sourceTable, row),
      );
    },
  };
  return runtimeRule;
});

export const ADMIN_BUSINESS_EXECUTION_ENTRIES = Object.freeze(
  runtimeRules.flatMap((rule) =>
    rule.destinations.map((step) => {
      const entry = createRuntimeEntry({
        rule,
        step,
        organizationId: CASTELO_ORGANIZATION_ID,
        contextRequirements: requirementsForStep(rule.sourceTable),
        projector: (emission, row, runtimeState) =>
          projectPayload(
            rule,
            step,
            emission,
            row,
            resolveInvocationContext(runtimeState, rule.sourceTable, row),
          ),
        cleanup: cleanupForStep(step),
      });
      ENTRY_BY_SOURCE.set(rule.sourceTable, entry);
      return entry;
    }),
  ),
);

export function buildAdminBusinessRuntimeState(options = {}) {
  const organizationId = options.organizationId ?? CASTELO_ORGANIZATION_ID;
  if (organizationId !== CASTELO_ORGANIZATION_ID) {
    throw new Error("Runtime Administration/Business exige o tenant Castelo");
  }
  const legacyUsers = requireRows(options.legacyUsers, "legacyUsers");
  const destinationUsers = requireRows(options.destinationUsers, "destinationUsers");
  const regularizeClients = requireRows(options.regularizeClients, "regularizeClients");
  const integrationClients = requireRows(options.integrationClients, "integrationClients");
  const destinationClients = requireRows(options.destinationClients, "destinationClients");
  const icmsRows = requireRows(options.icmsRows, "icmsRows");
  const permissionRowsBySource = normalizePermissionRows(options.permissionRowsBySource ?? {});

  const userResolver = createLegacyReferenceResolver({
    sourceTable: "tb_admin.usuarios",
    legacyColumn: "id",
    rows: legacyUsers,
  });
  const clientResolver = createV2ClientIdentityResolver({
    regularizeRows: regularizeClients,
    integrationRows: integrationClients,
  });
  const casteloUsers = indexCasteloCandidates(destinationUsers);
  const casteloClients = indexCasteloCandidates(destinationClients);
  const permissionContexts = buildPermissionContextIndex(permissionRowsBySource, userResolver);
  const icmsContexts = indexContextsByLegacyId(icmsRows, buildIcmsResolutionContexts(icmsRows));

  function contextFor(sourceTable, row) {
    if (!ENTRY_BY_SOURCE.has(sourceTable)) {
      throw new Error(`Origem Administration/Business desconhecida: ${String(sourceTable)}`);
    }
    if (!isPlainObject(row)) throw new TypeError("row deve ser um objeto simples");
    const context = { organizationId };
    const userColumn = isPermissionSource(sourceTable)
      ? "user_id"
      : USER_REFERENCE_COLUMNS.get(sourceTable);
    if (userColumn !== undefined) {
      Object.assign(context, userContext(userResolver.resolve(row[userColumn]), casteloUsers));
    }
    if (CLIENT_REFERENCE_SOURCES.has(sourceTable)) {
      Object.assign(context, clientContext(clientResolver.resolve(row.cliente_id), casteloClients));
    }
    if (isPermissionSource(sourceTable)) {
      Object.assign(context, permissionContexts.get(sourceTable)?.get(String(row.id)) ?? {});
    }
    if (sourceTable === "tb_fiscal.icms") {
      Object.assign(context, icmsContexts.get(String(row.id)) ?? {});
    }
    const frozen = Object.freeze(context);
    RUNTIME_CONTEXT_ISSUANCE.set(frozen, {
      sourceTable,
      sourceRowDigest: sourceRowDigest(sourceTable, row),
    });
    return frozen;
  }

  async function* iterateRows(sourceTable, rows) {
    if (!isIterable(rows)) throw new TypeError("rows deve ser iterável");
    const entry = ENTRY_BY_SOURCE.get(sourceTable);
    if (entry === undefined) {
      throw new Error(`Origem Administration/Business desconhecida: ${String(sourceTable)}`);
    }
    for await (const row of rows) {
      const context = contextFor(sourceTable, row);
      const emissions = entry
        .emitRows(row, context)
        .filter(({ stepId }) => stepId === entry.stepId);
      if (emissions.length !== 1) throw new Error("ADMIN_BUSINESS_STEP_EMISSION_INVALID");
      const [emission] = emissions;
      if (emission.status === "prepared") {
        yield Object.freeze({
          sourceTable,
          stepId: entry.stepId,
          status: "prepared",
          payload: entry.projector(emission, row, context),
        });
      } else {
        yield Object.freeze({
          sourceTable,
          stepId: entry.stepId,
          status: emission.status,
          field: emission.field,
          reasonCode: emission.reasonCode,
        });
      }
    }
  }

  return Object.freeze({ organizationId, contextFor, iterateRows });
}

function requirementsForStep(sourceTable) {
  const requirements = [];
  if (isPermissionSource(sourceTable)) {
    requirements.push(
      "source:tb_admin.usuarios.id",
      `source:${sourceTable}.id`,
      `source:${sourceTable}.user_id`,
      "destination:users.id",
    );
  } else if (USER_REFERENCE_COLUMNS.has(sourceTable)) {
    requirements.push("source:tb_admin.usuarios.id", "destination:users.id");
  }
  if (CLIENT_REFERENCE_SOURCES.has(sourceTable)) {
    requirements.push(
      "source:tb_regularize.clientes.codigo",
      "source:tb_integracao.clientes.id",
      "destination:clients.id",
    );
  }
  if (sourceTable === "tb_fiscal.icms") {
    for (const column of [
      "id",
      "estado",
      "item",
      "cest",
      "descricao",
      "acordo",
      "mva_original_aplicada",
      "mva_ajustado",
      "mva_original",
    ]) {
      requirements.push(`source:tb_fiscal.icms.${column}`);
    }
  }
  return requirements;
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
  const ownedColumns = step.columns
    .filter(
      ({ status, destinationColumn }) => status === "mapped" && destinationColumn !== "user_id",
    )
    .map(({ destinationColumn }) => destinationColumn);
  const resetValue = (column) =>
    step.destinationTable === "permissions.specific" && column === "task_completion" ? null : 0;
  return {
    kind: "reset_owned_columns",
    identityColumns: ["user_id", "organization_id"],
    ownedColumns,
    resetValues: Object.fromEntries(ownedColumns.map((column) => [column, resetValue(column)])),
  };
}

function classifyRuntimeRow(rule, row, context) {
  if (!isIssuedRuntimeContext(context, rule.sourceTable, row)) {
    return quarantine("runtime_context", "ADMIN_BUSINESS_RUNTIME_CONTEXT_NOT_EXECUTED");
  }
  const classification = rule.classifySourceRow(row, context);
  if (classification.status !== "prepared") return classification;
  if (isPermissionSource(rule.sourceTable) || USER_REFERENCE_COLUMNS.has(rule.sourceTable)) {
    const tenantUser = classifyTenantResolution(context.userTenantResolution, "USER");
    if (tenantUser !== null) return tenantUser;
  }
  if (CLIENT_REFERENCE_SOURCES.has(rule.sourceTable)) {
    if (context.clientIdentityAuthoritative !== true) {
      return quarantine("cliente_id", "CLIENT_IDENTITY_NOT_AUTHORITATIVE");
    }
    const tenantClient = classifyTenantResolution(context.clientTenantResolution, "CLIENT");
    if (tenantClient !== null) return tenantClient;
  }
  return classification;
}

function classifyTenantResolution(state, kind) {
  if (state === "one") return null;
  if (state === "zero") {
    return quarantine(
      kind === "USER" ? "user_id" : "cliente_id",
      `${kind}_DESTINATION_NOT_FOUND_IN_CASTELO`,
    );
  }
  if (state === "many") {
    return quarantine(
      kind === "USER" ? "user_id" : "cliente_id",
      `${kind}_DESTINATION_AMBIGUOUS_IN_CASTELO`,
    );
  }
  return quarantine(
    kind === "USER" ? "user_id" : "cliente_id",
    `${kind}_DESTINATION_LOOKUP_NOT_EXECUTED`,
  );
}

function emitRuntimeRows(rule, row, context) {
  const classification = classifyRuntimeRow(rule, row, context);
  return Object.freeze(
    rule.emitRows(row, context).map((emission) => {
      let identityRef = emission.identityRef;
      if (classification.status === "prepared") {
        if (isPermissionSource(rule.sourceTable)) {
          const target =
            rule.sourceTable === DYNAMIC_PERMISSION_SOURCE_TABLE
              ? "permissions.specific"
              : "permissions";
          identityRef = `${target}:${context.resolvedUserId}:${CASTELO_ORGANIZATION_ID}`;
        } else {
          identityRef = uuidV5(
            REQUIRED_IDENTITY_NAMESPACE,
            `${rule.sourceTable}:${String(row.id)}`,
          );
        }
      }
      return Object.freeze({
        ...emission,
        identityRef,
        status: classification.status,
        field: classification.field ?? null,
        reasonCode: classification.reasonCode ?? null,
      });
    }),
  );
}

function projectPayload(rule, step, emission, row, context) {
  if (emission.status !== "prepared" || !isIssuedRuntimeContext(context, rule.sourceTable, row)) {
    throw new Error("ADMIN_BUSINESS_PROJECTION_NOT_PREPARED");
  }
  const payload = { ...step.defaults };
  for (const column of step.columns) {
    if (column.status !== "mapped") continue;
    const transformer = ADMIN_BUSINESS_TRANSFORMERS[column.transformation];
    if (typeof transformer !== "function") {
      throw new Error(`Transformação ausente: ${column.transformation}`);
    }
    payload[column.destinationColumn] = transformer(row[column.sourceColumn], {
      sourceTable: rule.sourceTable,
      row,
      context,
      step,
      column,
    });
  }
  Object.assign(payload, step.constants);
  return Object.freeze(payload);
}

function userContext(resolution, candidates) {
  const currentId =
    resolution.state === "one" && typeof resolution.identityRef === "string"
      ? uuidV5(REQUIRED_IDENTITY_NAMESPACE, resolution.identityRef)
      : null;
  const candidateCount = currentId === null ? 0 : (candidates.get(currentId) ?? 0);
  return {
    userResolution: resolution.state,
    userIdentityRef: resolution.identityRef,
    userResolutionFingerprint: resolution.fingerprint,
    userLookupSourceTable: resolution.sourceTable,
    userLookupSourceKey: resolution.sourceKey,
    userTenantResolution: candidateState(candidateCount),
    resolvedUserId: candidateCount === 1 ? currentId : null,
  };
}

function clientContext(resolution, candidates) {
  const authoritative = isAuthoritativeV2ClientIdentityResolution(resolution, resolution.sourceKey);
  const currentId =
    authoritative && resolution.state === "one" && typeof resolution.identityRef === "string"
      ? uuidV5(REQUIRED_IDENTITY_NAMESPACE, resolution.identityRef)
      : null;
  const candidateCount = currentId === null ? 0 : (candidates.get(currentId) ?? 0);
  return {
    clientResolution: resolution.state,
    clientIdentityRef: resolution.identityRef,
    clientResolutionFingerprint: resolution.fingerprint,
    clientLookupSourceTable: resolution.sourceTable,
    clientLookupSourceKey: resolution.sourceKey,
    clientIdentityAuthoritative: authoritative,
    clientTenantResolution: candidateState(candidateCount),
    resolvedClientId: candidateCount === 1 ? currentId : null,
  };
}

function buildPermissionContextIndex(rowsBySource, userResolver) {
  const contextsBySource = new Map();
  for (const [sourceTable, rows] of rowsBySource) {
    const contexts = buildPermissionResolutionContexts({ sourceTable, rows, userResolver });
    contextsBySource.set(sourceTable, indexContextsByLegacyId(rows, contexts));
  }
  return contextsBySource;
}

function isPermissionSource(sourceTable) {
  return (
    sourceTable === DYNAMIC_PERMISSION_SOURCE_TABLE || sourceTable.startsWith(PERMISSION_PREFIX)
  );
}

function indexContextsByLegacyId(rows, contexts) {
  const index = new Map();
  for (const [position, row] of rows.entries()) {
    const key = String(row?.id);
    if (index.has(key)) throw new Error(`Identidade legada duplicada no runtime: ${key}`);
    index.set(key, contexts[position]);
  }
  return index;
}

function normalizePermissionRows(value) {
  if (value instanceof Map) {
    return new Map(
      [...value].map(([sourceTable, rows]) => [sourceTable, requireRows(rows, sourceTable)]),
    );
  }
  if (!isPlainObject(value)) {
    throw new TypeError("permissionRowsBySource deve ser objeto ou Map");
  }
  return new Map(
    Object.entries(value).map(([sourceTable, rows]) => [
      sourceTable,
      requireRows(rows, sourceTable),
    ]),
  );
}

function indexCasteloCandidates(rows) {
  const index = new Map();
  for (const row of rows) {
    const organizationId = row?.organization_id ?? row?.organizationId;
    if (organizationId !== CASTELO_ORGANIZATION_ID) continue;
    if (typeof row?.id !== "string" || row.id.length === 0) continue;
    index.set(row.id, (index.get(row.id) ?? 0) + 1);
  }
  return index;
}

function candidateState(count) {
  return count === 0 ? "zero" : count === 1 ? "one" : "many";
}

function isIssuedRuntimeContext(context, sourceTable, row) {
  const issuance = RUNTIME_CONTEXT_ISSUANCE.get(context);
  return (
    issuance?.sourceTable === sourceTable &&
    issuance.sourceRowDigest === sourceRowDigest(sourceTable, row) &&
    context.organizationId === CASTELO_ORGANIZATION_ID
  );
}

function resolveInvocationContext(runtimeState, sourceTable, row) {
  if (isIssuedRuntimeContext(runtimeState, sourceTable, row)) return runtimeState;
  if (typeof runtimeState?.contextFor === "function") {
    return runtimeState.contextFor(sourceTable, row);
  }
  return runtimeState;
}

function sourceRowDigest(sourceTable, row) {
  const hash = createHash("sha256").update(`${sourceTable.length}:${sourceTable}`);
  for (const key of Object.keys(row).sort()) {
    const value = row[key];
    const canonical = value === null || value === undefined ? "" : String(value);
    hash.update(`|${key.length}:${key}:${canonical.length}:${canonical}`);
  }
  return hash.digest("hex");
}

function requireRows(value, field) {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.some((row) => !isPlainObject(row))) {
    throw new TypeError(`${field} deve ser um array de objetos`);
  }
  return [...value];
}

function isIterable(value) {
  return (
    value !== null &&
    value !== undefined &&
    (typeof value[Symbol.iterator] === "function" ||
      typeof value[Symbol.asyncIterator] === "function")
  );
}

function isPlainObject(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function quarantine(field, reasonCode) {
  return Object.freeze({ status: "quarantine", field, reasonCode });
}
