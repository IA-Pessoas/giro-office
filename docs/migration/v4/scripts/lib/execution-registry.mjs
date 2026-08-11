import { createHash } from "node:crypto";

import { validateStepExecutionContract } from "./mapping-contract.mjs";

const ENTRY_FIELDS = new Set([
  "sourceTable",
  "stepId",
  "destinationTable",
  "contract",
  "classifySourceRow",
  "emitRows",
  "projector",
]);
const RUNTIME_OPTION_FIELDS = new Set([
  "rule",
  "step",
  "organizationId",
  "contextRequirements",
  "projector",
  "cleanup",
  "projectionKind",
]);

export function executionStepKey({ sourceTable, stepId }) {
  assertNonEmptyString(sourceTable, "sourceTable");
  assertNonEmptyString(stepId, "stepId");
  return `${sourceTable}\0${stepId}`;
}

export function createExecutionRegistry(groups) {
  if (!Array.isArray(groups)) {
    throw new TypeError("groups deve ser um array de grupos de execução");
  }
  const entries = new Map();
  for (const group of groups) {
    if (!Array.isArray(group)) {
      throw new TypeError("Cada grupo de execução deve ser um array");
    }
    for (const entry of group) {
      const key = executionStepKey(entry);
      if (entries.has(key)) throw new Error(`EXECUTION_CONTRACT_DUPLICATE:${key}`);
      entries.set(key, deepFreeze(validateEntry(entry)));
    }
  }
  return entries;
}

export function createRuntimeEntry(options) {
  assertKnownFields(options, RUNTIME_OPTION_FIELDS, "createRuntimeEntry options");
  const {
    rule,
    step,
    organizationId,
    contextRequirements,
    projector,
    cleanup,
    projectionKind = "column_transformers",
  } = options ?? {};
  assertNonEmptyString(rule?.sourceTable, "rule.sourceTable");
  assertNonEmptyString(step?.stepId, "step.stepId");
  assertNonEmptyString(step?.destinationTable, "step.destinationTable");
  if (!Array.isArray(rule?.destinations) || !rule.destinations.includes(step)) {
    throw new Error("step deve pertencer à regra informada");
  }
  for (const [name, callback] of [
    ["classifySourceRow", rule.classifySourceRow],
    ["emitRows", rule.emitRows],
    ["projector", projector],
  ]) {
    if (typeof callback !== "function") {
      throw new TypeError(`${name} deve ser uma função pura`);
    }
  }
  if (!Array.isArray(contextRequirements)) {
    throw new TypeError("contextRequirements deve ser um array");
  }

  const contract = {
    contextRequirements: [...contextRequirements],
    tenantScope: {
      kind: "organization_column",
      column: "organization_id",
      organizationId,
    },
    projection: {
      kind: projectionKind,
      callbackDigests: {
        classifySourceRow: digestCallback(rule.classifySourceRow),
        emitRows: digestCallback(rule.emitRows),
        projector: digestCallback(projector),
      },
    },
    write: writeContractFor(step, cleanup),
    cleanup: cloneJsonValue(cleanup, "cleanup"),
  };

  return deepFreeze({
    sourceTable: rule.sourceTable,
    stepId: step.stepId,
    destinationTable: step.destinationTable,
    contract,
    classifySourceRow: rule.classifySourceRow,
    emitRows: rule.emitRows,
    projector,
  });
}

export function validateExecutionCoverage({ ruleRegistry, executionRegistry, prismaCatalog }) {
  if (!(ruleRegistry instanceof Map)) {
    throw new TypeError("ruleRegistry deve ser um Map");
  }
  if (!(executionRegistry instanceof Map)) {
    throw new TypeError("executionRegistry deve ser um Map");
  }

  const expectedKeys = new Set();
  for (const rule of ruleRegistry.values()) {
    if (rule?.status !== "confirmed") continue;
    for (const step of rule.destinations ?? []) {
      const key = executionStepKey({ sourceTable: rule.sourceTable, stepId: step.stepId });
      expectedKeys.add(key);
      const entry = executionRegistry.get(key);
      if (entry === undefined) {
        throw new Error(`Cobertura ausente para ${rule.sourceTable}.${step.stepId}`);
      }
      if (entry.destinationTable !== step.destinationTable) {
        throw new Error(`Destino divergente para ${rule.sourceTable}.${step.stepId}`);
      }
      validateStepExecutionContract(entry.contract, step, prismaCatalog);
    }
  }
  for (const key of executionRegistry.keys()) {
    if (!expectedKeys.has(key)) {
      const [sourceTable, stepId] = key.split("\0");
      throw new Error(`Step extra no executionRegistry: ${sourceTable}.${stepId}`);
    }
  }
  return true;
}

export function assertExecutionGroupCoverage(rules, entries) {
  if (!Array.isArray(rules) || !Array.isArray(entries)) {
    throw new TypeError("rules e entries devem ser arrays");
  }
  const expected = new Set();
  for (const rule of rules) {
    for (const step of rule?.destinations ?? []) {
      const key = executionStepKey({ sourceTable: rule.sourceTable, stepId: step.stepId });
      if (expected.has(key)) throw new Error(`Step duplicado nas regras: ${key}`);
      expected.add(key);
    }
  }
  const actual = new Set();
  for (const entry of entries) {
    const key = executionStepKey(entry);
    if (actual.has(key)) throw new Error(`EXECUTION_CONTRACT_DUPLICATE:${key}`);
    actual.add(key);
  }
  for (const key of expected) {
    if (!actual.has(key)) throw new Error(`Cobertura ausente para ${displayKey(key)}`);
  }
  for (const key of actual) {
    if (!expected.has(key)) throw new Error(`Step extra no grupo de execução: ${displayKey(key)}`);
  }
  return true;
}

export function assertTransformationCoverage(rules, transformers, entries) {
  assertExecutionGroupCoverage(rules, entries);
  const entryByKey = new Map(entries.map((entry) => [executionStepKey(entry), entry]));
  const required = new Set();
  for (const rule of rules) {
    for (const step of rule?.destinations ?? []) {
      const key = executionStepKey({ sourceTable: rule.sourceTable, stepId: step.stepId });
      if (entryByKey.get(key)?.contract?.projection?.kind === "custom_projector") continue;
      for (const column of step.columns ?? []) {
        if (column.status === "mapped") required.add(column.transformation);
      }
    }
  }

  const available = transformerEntries(transformers);
  for (const transformation of required) {
    if (typeof available.get(transformation) !== "function") {
      throw new Error(`Transformação ausente: ${transformation}`);
    }
  }
  for (const [transformation, transformer] of available) {
    if (typeof transformer !== "function") {
      throw new TypeError(`Transformação deve ser função: ${transformation}`);
    }
    if (!required.has(transformation)) {
      throw new Error(`Transformação extra: ${transformation}`);
    }
  }
  return true;
}

function validateEntry(entry) {
  assertKnownFields(entry, ENTRY_FIELDS, "ExecutionEntry");
  for (const field of ENTRY_FIELDS) {
    if (!(field in entry)) throw new Error(`ExecutionEntry exige ${field}`);
  }
  assertNonEmptyString(entry.sourceTable, "sourceTable");
  assertNonEmptyString(entry.stepId, "stepId");
  assertNonEmptyString(entry.destinationTable, "destinationTable");
  if (!isPlainObject(entry.contract)) throw new TypeError("contract deve ser um objeto");
  assertJsonSerializable(entry.contract, "contract");
  for (const field of ["classifySourceRow", "emitRows", "projector"]) {
    if (typeof entry[field] !== "function") {
      throw new TypeError(`ExecutionEntry.${field} deve ser uma função pura`);
    }
  }
  return entry;
}

function writeContractFor(step, cleanup) {
  if (["insert", "derived"].includes(step.mode)) {
    return {
      kind: "insert",
      conflictColumns: Array.isArray(cleanup?.identityColumns) ? [...cleanup.identityColumns] : [],
    };
  }
  if (step.mode === "lookup") return { kind: "none" };
  if (step.mode === "merge") return { kind: "update_exactly_one" };
  if (step.mode === "aggregate") return { kind: "replace_owned_aggregate" };
  throw new Error(`Mode de DestinationStep inválido: ${String(step.mode)}`);
}

function transformerEntries(transformers) {
  if (transformers instanceof Map) return new Map(transformers);
  if (!isPlainObject(transformers)) {
    throw new TypeError("transformers deve ser um objeto ou Map");
  }
  return new Map(Object.entries(transformers));
}

function digestCallback(callback) {
  return createHash("sha256")
    .update(Function.prototype.toString.call(callback), "utf8")
    .digest("hex");
}

function cloneJsonValue(value, field) {
  assertJsonSerializable(value, field);
  try {
    return JSON.parse(JSON.stringify(value));
  } catch {
    throw new TypeError(`${field} deve ser serializável como JSON`);
  }
}

function assertKnownFields(value, allowedFields, label) {
  if (!isPlainObject(value)) throw new TypeError(`${label} deve ser um objeto`);
  for (const field of Object.keys(value)) {
    if (!allowedFields.has(field)) {
      throw new Error(`${label} contém campo incompatível: ${field}`);
    }
  }
}

function assertJsonSerializable(value, field, seen = new Set()) {
  if (value === null || ["string", "boolean"].includes(typeof value)) return;
  if (typeof value === "number" && Number.isFinite(value)) return;
  if (typeof value !== "object") {
    throw new TypeError(`${field} contém valor não serializável`);
  }
  if (seen.has(value)) throw new TypeError(`${field} contém referência circular não serializável`);
  seen.add(value);
  if (Array.isArray(value)) {
    for (let index = 0; index < value.length; index += 1) {
      assertJsonSerializable(value[index], `${field}[${index}]`, seen);
    }
  } else {
    if (!isPlainObject(value)) {
      throw new TypeError(`${field} deve usar somente objetos JSON simples`);
    }
    for (const [key, child] of Object.entries(value)) {
      assertJsonSerializable(child, `${field}.${key}`, seen);
    }
  }
  seen.delete(value);
}

function displayKey(key) {
  return key.replace("\0", ".");
}

function deepFreeze(value) {
  if (value !== null && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) deepFreeze(child);
  }
  return value;
}

function assertNonEmptyString(value, field) {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new TypeError(`${field} deve ser uma string não vazia`);
  }
}

function isPlainObject(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
