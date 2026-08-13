import { createHash } from "node:crypto";
import { open, stat } from "node:fs/promises";
import path from "node:path";

import { validateConfirmedScope } from "./confirmed-scope.mjs";
import { executionStepKey } from "./execution-registry.mjs";
import { CASTELO_ORGANIZATION_ID, validateMappingEmissions } from "./mapping-contract.mjs";
import { toLegacyIdRef } from "./sensitivity.mjs";
import { iterateSqlRows } from "./sql-dump-parser.mjs";
import { uuidV5 } from "./uuid-v5.mjs";

const MAX_BATCH_SIZE = 500;
const EMPTY_RESULTS = Object.freeze([]);
const CONTEXT_REQUIREMENT_PATTERN = /^(source|destination):([A-Za-z0-9_.-]+)$/;
const RESULT_METADATA = new WeakMap();

export function getExecutionResultMetadata(result) {
  return RESULT_METADATA.get(result) ?? null;
}

export async function createExecutionSession(options) {
  validateOptions(options);
  assertCasteloScope(options.organizationId);
  validateConfirmedScope(options.scope, options.mappingPackage);

  const batchSize = validateBatchSize(options.configuration?.batchSize ?? MAX_BATCH_SIZE);
  const sources = new Map(options.scope.sources.map((source) => [source.sourceTable, source]));
  const inventory = new Map(
    options.mappingPackage.inventory.tables.map((source) => [source.sourceTable, source]),
  );
  const steps = indexScopeSteps(options.scope.steps);
  const ruleRegistry = new Map(options.ruleRegistry);
  const executionRegistry = new Map(options.executionRegistry);
  validateRegistries({
    sources,
    steps,
    ruleRegistry,
    executionRegistry,
    organizationId: options.organizationId,
  });

  const state = {
    scopeDigest: options.scope.scopeDigest,
    sourceDir: path.resolve(options.sourceDir),
    sources,
    inventory,
    steps,
    ruleRegistry,
    executionRegistry,
    runtimeStateByStep: new Map(options.runtimeStateByStep ?? []),
    organizationId: options.organizationId,
    destinationReader: options.destinationReader,
    batchSize,
    configuration: freezeEphemeralSnapshot(options.configuration ?? {}),
    indexes: { source: new Map(), destination: new Map() },
    contexts: new Map(),
    executedSteps: new Set(),
    counts: {
      readRows: 0,
      prepared: 0,
      notEmitted: 0,
      quarantine: 0,
      blockedRows: 0,
    },
    codes: new Map(),
    executionDigest: digestExecutionRegistry(executionRegistry),
  };
  state.indexes = await prepareDeclaredIndexes(state);
  state.contexts = new Map(
    [...state.executionRegistry].map(([key, entry]) => [key, createExecutionContext(state, entry)]),
  );

  return Object.freeze({
    candidateProvider: () => createCandidateProvider(state),
    iterateStep: (key) => iterateStep(state, key),
    summary: () => buildSanitizedSummary(state),
  });
}

async function prepareDeclaredIndexes(state) {
  const sourceRequirements = new Map();
  const destinationRequirements = new Map();
  for (const entry of state.executionRegistry.values()) {
    for (const requirement of entry.contract.contextRequirements) {
      const parsed = parseContextRequirement(requirement, state.inventory);
      const requirementsByOwner =
        parsed.kind === "source" ? sourceRequirements : destinationRequirements;
      if (parsed.kind === "source" && !state.inventory.has(parsed.owner)) {
        throw executionError("EXECUTION_SOURCE_OUT_OF_SCOPE");
      }
      if (parsed.column === undefined) continue;
      const current = requirementsByOwner.get(parsed.owner) ?? [];
      if (!current.some(({ requirement: candidate }) => candidate === requirement)) {
        current.push({ requirement, column: parsed.column });
        requirementsByOwner.set(parsed.owner, current);
      }
    }
  }

  const indexes = { source: new Map(), destination: new Map() };
  for (const requirements of sourceRequirements.values()) {
    for (const { requirement } of requirements) indexes.source.set(requirement, new Map());
  }
  for (const requirements of destinationRequirements.values()) {
    for (const { requirement } of requirements) indexes.destination.set(requirement, new Map());
  }
  for (const [sourceTable, requirements] of sourceRequirements) {
    await consumeVerifiedSource(state, sourceTable, (row) => {
      for (const { requirement, column } of requirements) {
        const normalized = normalizeIndexValue(row[column]);
        if (normalized === null) continue;
        const id = sourceIdentityValue(state, sourceTable, row, column, normalized);
        if (id === null) continue;
        addIndexValue(indexes.source.get(requirement), normalized, id);
      }
    });
  }
  for (const [destinationTable, requirements] of destinationRequirements) {
    for await (const candidate of iterateDestinationCandidates(state, {
      destinationTable,
      columns: requirements.map(({ column }) => column),
    })) {
      if (!isCandidateInTenant(candidate, state.organizationId)) continue;
      for (const { requirement, column } of requirements) {
        const normalized = normalizeIndexValue(candidate?.[column]);
        if (normalized === null) continue;
        const id = destinationIdentityValue(destinationTable, candidate, normalized);
        addIndexValue(indexes.destination.get(requirement), normalized, id);
      }
    }
  }
  for (const group of Object.values(indexes)) {
    for (const index of group.values()) {
      for (const [key, ids] of index) index.set(key, Object.freeze([...ids]));
    }
  }
  return indexes;
}

function createExecutionContext(state, entry) {
  const declared = new Set(entry.contract.contextRequirements);
  const lookup = (kind, requirement, value) => {
    const parsed = parseContextRequirement(requirement);
    if (parsed.kind !== kind || !declared.has(requirement)) {
      throw executionError("EXECUTION_CONTEXT_REQUIREMENT_UNDECLARED");
    }
    const index = state.indexes[kind].get(requirement);
    if (index === undefined) throw executionError("EXECUTION_CONTEXT_REQUIREMENT_UNDECLARED");
    const normalized = normalizeIndexValue(value);
    return normalized === null ? EMPTY_RESULTS : (index.get(normalized) ?? EMPTY_RESULTS);
  };
  const binding = state.runtimeStateByStep.get(executionStepKey(entry));
  const runtimeState = binding?.runtimeState ?? binding;
  if (
    runtimeState !== undefined &&
    (runtimeState === null || typeof runtimeState !== "object" || Array.isArray(runtimeState))
  ) {
    throw executionError("EXECUTION_RUNTIME_STATE_INVALID");
  }
  const lookupDestination = (requirement, value) => {
    const current = lookup("destination", requirement, value);
    if (typeof runtimeState?.lookupDestination !== "function") return current;
    const planned = runtimeState.lookupDestination.call(runtimeState, requirement, value);
    if (!Array.isArray(planned) || planned.some((id) => typeof id !== "string")) {
      throw executionError("EXECUTION_RUNTIME_LOOKUP_INVALID");
    }
    return Object.freeze([...new Set([...current, ...planned])]);
  };
  const kernelContext = {
    ...state.configuration,
    configuration: state.configuration,
    organizationId: state.organizationId,
    lookupSource: (requirement, value) => lookup("source", requirement, value),
    lookupDestination,
  };
  if (runtimeState === undefined) return deepFreezePlain(kernelContext);
  return deepFreezePlain({ ...runtimeState, ...kernelContext });
}

async function* iterateStep(state, key) {
  if (typeof key !== "string" || !state.executionRegistry.has(key)) {
    throw executionError("EXECUTION_STEP_UNKNOWN");
  }
  if (state.executedSteps.has(key)) throw executionError("STEP_ALREADY_ITERATED");
  state.executedSteps.add(key);

  const entry = state.executionRegistry.get(key);
  const rule = state.ruleRegistry.get(entry.sourceTable);
  try {
    if (entry.contract.write.kind === "replace_owned_aggregate") {
      yield* executeAggregateStep(state, entry, rule);
      return;
    }
    yield* executeStreamingStep(state, entry, rule);
  } catch (error) {
    state.counts.blockedRows += 1;
    recordCode(state, error?.code ?? "EXECUTION_STEP_FAILED");
    throw error;
  }
}

async function* executeStreamingStep(state, entry, rule) {
  const source = await openVerifiedSource(state, entry.sourceTable);
  const context = state.contexts.get(executionStepKey(entry));
  let reachedEof = false;

  try {
    while (true) {
      const next = await source.rows.next();
      if (next.done) {
        reachedEof = true;
        break;
      }

      const row = next.value;
      state.counts.readRows += 1;
      const decision = evaluateStepDecision(state, entry, rule, row, context);

      let result;
      if (decision.status === "prepared") {
        let payload;
        try {
          payload = await entry.projector(decision, row, context);
        } catch {
          throw executionError("EXECUTION_CALLBACK_FAILED");
        }
        result = executionResult(
          {
            sourceTable: entry.sourceTable,
            stepId: entry.stepId,
            status: "prepared",
            sourceIdentityDigest: sourceIdentityDigest(rule, entry, row),
            destinationIdentity: decision.identityRef,
            payload,
          },
          cleanupMetadata(rule, entry, row, decision),
        );
        state.counts.prepared += 1;
      } else if (decision.status === "not_emitted") {
        result = executionResult(
          {
            sourceTable: entry.sourceTable,
            stepId: entry.stepId,
            status: "not_emitted",
            sourceIdentityDigest: sourceIdentityDigest(rule, entry, row),
            reasonCode: decision.reasonCode,
          },
          cleanupMetadata(rule, entry, row, decision),
        );
        state.counts.notEmitted += 1;
        recordCode(state, decision.reasonCode);
      } else {
        result = executionResult(
          {
            sourceTable: entry.sourceTable,
            stepId: entry.stepId,
            status: "quarantine",
            sourceIdentityDigest: sourceIdentityDigest(rule, entry, row),
            field: decision.field,
            reasonCode: decision.reasonCode,
          },
          cleanupMetadata(rule, entry, row, decision),
        );
        state.counts.quarantine += 1;
        recordCode(state, decision.reasonCode);
      }
      yield result;
    }
  } finally {
    await closeVerifiedSource(source, { reachedEof });
  }
}

async function* executeAggregateStep(state, entry, rule) {
  const source = await openVerifiedSource(state, entry.sourceTable);
  const context = state.contexts.get(executionStepKey(entry));
  const rows = [];
  let reachedEof = false;

  try {
    while (true) {
      const next = await source.rows.next();
      if (next.done) {
        reachedEof = true;
        break;
      }
      rows.push(next.value);
      state.counts.readRows += 1;
    }

    const groups = new Map();
    const terminalResults = [];
    const seenSourceIdentities = new Set();
    for (const row of rows) {
      const decision = evaluateStepDecision(state, entry, rule, row, context);
      const identityDigest = sourceIdentityDigest(rule, entry, row);
      if (decision.status === "prepared") {
        if (seenSourceIdentities.has(identityDigest)) {
          const result = executionResult(
            {
              sourceTable: entry.sourceTable,
              stepId: entry.stepId,
              status: "quarantine",
              sourceIdentityDigest: identityDigest,
              field: aggregateIdentityColumn(rule, entry),
              reasonCode: "AGGREGATE_CHILD_IDENTITY_DUPLICATE",
            },
            cleanupMetadata(rule, entry, row, decision),
          );
          terminalResults.push(result);
          state.counts.quarantine += 1;
          recordCode(state, result.reasonCode);
          continue;
        }
        seenSourceIdentities.add(identityDigest);
        const group = groups.get(decision.identityRef) ?? [];
        group.push({ decision, row });
        groups.set(decision.identityRef, group);
        continue;
      }
      terminalResults.push(resultForDecision(state, entry, rule, decision, row));
    }

    for (const [destinationIdentity, group] of [...groups].sort(([left], [right]) =>
      compareText(left, right),
    )) {
      group.sort(({ row: left }, { row: right }) => compareAggregateRows(rule, entry, left, right));
      let payload;
      try {
        payload = await entry.projector(
          group[0].decision,
          group.map(({ row }) => row),
          context,
        );
      } catch {
        throw executionError("EXECUTION_CALLBACK_FAILED");
      }
      state.counts.prepared += group.length;
      yield Object.freeze({
        sourceTable: entry.sourceTable,
        stepId: entry.stepId,
        status: "prepared",
        sourceRowCount: group.length,
        destinationIdentity,
        payload,
      });
    }
    for (const result of terminalResults.sort(compareTerminalResults)) yield result;
  } finally {
    await closeVerifiedSource(source, { reachedEof });
  }
}

function evaluateStepDecision(state, entry, rule, row, context) {
  try {
    const binding = state.runtimeStateByStep.get(executionStepKey(entry));
    if (typeof binding?.classifyExecutionRow === "function") {
      const classification = binding.classifyExecutionRow(row, context);
      if (classification?.status !== "prepared") {
        return validateMappingEmissions(rule, [
          {
            stepId: entry.stepId,
            destinationTable: entry.destinationTable,
            status: classification?.status,
            identityRef: `quarantine:${entry.sourceTable}:${classification?.field ?? "runtime"}:runtime`,
            field: classification?.status === "quarantine" ? classification.field : null,
            reasonCode: classification?.reasonCode,
          },
        ])[0];
      }
    }
    entry.classifySourceRow(row, context);
    const emissions = validateMappingEmissions(rule, entry.emitRows(row, context));
    const matching = emissions.filter(({ stepId }) => stepId === entry.stepId);
    if (matching.length === 0) throw executionError("STEP_EMISSION_MISSING");
    if (matching.length > 1) throw executionError("STEP_EMISSION_DUPLICATE");
    return matching[0];
  } catch (error) {
    if (error?.code?.startsWith("STEP_EMISSION_")) throw error;
    throw executionError("EXECUTION_CALLBACK_FAILED", {
      sourceTable: entry.sourceTable,
      stepId: entry.stepId,
      destinationTable: entry.destinationTable,
      causeCode: error?.code ?? null,
      causeMessage: error?.message ?? String(error),
    });
  }
}

function resultForDecision(state, entry, rule, decision, row) {
  if (decision.status === "not_emitted") {
    state.counts.notEmitted += 1;
    recordCode(state, decision.reasonCode);
    return executionResult(
      {
        sourceTable: entry.sourceTable,
        stepId: entry.stepId,
        status: "not_emitted",
        sourceIdentityDigest: sourceIdentityDigest(rule, entry, row),
        reasonCode: decision.reasonCode,
      },
      cleanupMetadata(rule, entry, row, decision),
    );
  }
  state.counts.quarantine += 1;
  recordCode(state, decision.reasonCode);
  return executionResult(
    {
      sourceTable: entry.sourceTable,
      stepId: entry.stepId,
      status: "quarantine",
      sourceIdentityDigest: sourceIdentityDigest(rule, entry, row),
      field: decision.field,
      reasonCode: decision.reasonCode,
    },
    cleanupMetadata(rule, entry, row, decision),
  );
}

function cleanupMetadata(rule, entry, row, decision) {
  const step = rule.destinations.find(({ stepId }) => stepId === entry.stepId);
  if (step?.identity?.kind !== "generate") {
    if (!["resolve", "aggregate"].includes(step?.identity?.kind)) {
      return Object.freeze({ cleanupIdentity: null });
    }
    const destinationIdentity = decision?.identityRef;
    const resolvedPrefix = `${entry.destinationTable}:`;
    return Object.freeze({
      cleanupIdentity: null,
      destinationIdentity:
        typeof destinationIdentity === "string" &&
        destinationIdentity.startsWith(resolvedPrefix) &&
        destinationIdentity.length > resolvedPrefix.length
          ? destinationIdentity
          : null,
    });
  }
  const [identityColumn] = entry.contract.cleanup.identityColumns;
  const legacyValue = row?.[step.identity.legacyColumn];
  if (identityColumn === undefined || legacyValue === undefined || legacyValue === null) {
    return Object.freeze({ cleanupIdentity: null });
  }
  return Object.freeze({
    cleanupIdentity: Object.freeze({
      [identityColumn]: uuidV5(
        step.identity.namespace,
        `${step.identity.scope}:${String(legacyValue).trim()}`,
      ),
    }),
  });
}

function executionResult(value, metadata) {
  const result = Object.freeze(value);
  RESULT_METADATA.set(result, metadata);
  return result;
}

function aggregateIdentityColumn(rule, entry) {
  const step = rule.destinations.find(({ stepId }) => stepId === entry.stepId);
  return step?.identity?.legacyColumn ?? "id";
}

function compareAggregateRows(rule, entry, left, right) {
  const identityColumn = aggregateIdentityColumn(rule, entry);
  return String(left?.[identityColumn] ?? "").localeCompare(
    String(right?.[identityColumn] ?? ""),
    "en-US",
    { numeric: true },
  );
}

function compareTerminalResults(left, right) {
  return compareText(left.sourceIdentityDigest, right.sourceIdentityDigest);
}

async function consumeVerifiedSource(state, sourceTable, consumeRow) {
  const source = await openVerifiedSource(state, sourceTable);
  let reachedEof = false;
  try {
    while (true) {
      const next = await source.rows.next();
      if (next.done) {
        reachedEof = true;
        break;
      }
      consumeRow(next.value);
    }
  } finally {
    await closeVerifiedSource(source, { reachedEof });
  }
}

async function closeVerifiedSource(source, { reachedEof }) {
  let iteratorError = null;
  let verificationError = null;
  let closeError = null;
  try {
    if (!reachedEof) {
      try {
        await source.rows.return();
      } catch {
        iteratorError = executionError("SOURCE_ITERATOR_CLOSE_FAILED");
      }
    }
    try {
      await verifyClosedSource(source, { reachedEof });
    } catch (error) {
      verificationError = error;
    }
  } finally {
    try {
      await source.fileHandle.close();
    } catch {
      closeError = executionError("SOURCE_FILE_CLOSE_FAILED");
    }
  }
  if (verificationError !== null) throw verificationError;
  if (iteratorError !== null) throw iteratorError;
  if (closeError !== null) throw closeError;
}

async function openVerifiedSource(state, sourceTable) {
  const inventory = state.inventory.get(sourceTable);
  if (inventory === undefined) {
    throw executionError("EXECUTION_SOURCE_OUT_OF_SCOPE");
  }
  const expected = state.sources.get(sourceTable) ?? {
    dumpHash: inventory.sha256,
    rowCount: inventory.rowCount,
  };
  const filePath = resolveInventoryPath(state.sourceDir, inventory);
  let pathStat;
  let fileHandle;
  try {
    pathStat = await stat(filePath);
    fileHandle = await open(filePath, "r");
  } catch {
    throw executionError("SOURCE_DUMP_UNAVAILABLE");
  }
  const handleStat = await fileHandle.stat();
  if (!sameFileIdentity(pathStat, handleStat) || !handleStat.isFile()) {
    await fileHandle.close();
    throw executionError("SOURCE_DUMP_DRIFT");
  }

  const hash = createHash("sha256");
  let rowCount = 0;
  const parsedRows = iterateSqlRows(fileHandle, {
    fileName: path.basename(filePath),
    onChunk(chunk) {
      hash.update(chunk);
    },
  });
  const rows = (async function* countedRows() {
    for await (const row of parsedRows) {
      rowCount += 1;
      yield row;
    }
  })();

  return {
    filePath,
    fileHandle,
    pathStat,
    handleStat,
    expected,
    hash,
    rows,
    rowCount: () => rowCount,
  };
}

async function verifyClosedSource(source, { reachedEof }) {
  let finalPathStat;
  let finalHandleStat;
  try {
    finalPathStat = await stat(source.filePath);
    finalHandleStat = await source.fileHandle.stat();
  } catch {
    throw executionError("SOURCE_DUMP_DRIFT");
  }
  const digest = reachedEof ? source.hash.digest("hex") : await digestFileHandle(source.fileHandle);
  if (
    digest !== source.expected.dumpHash ||
    (reachedEof && source.rowCount() !== source.expected.rowCount) ||
    !sameFileSnapshot(source.pathStat, finalPathStat) ||
    !sameFileSnapshot(source.handleStat, finalHandleStat) ||
    !sameFileIdentity(finalPathStat, finalHandleStat)
  ) {
    throw executionError("SOURCE_DUMP_DRIFT");
  }
}

async function digestFileHandle(fileHandle) {
  const hash = createHash("sha256");
  const buffer = Buffer.allocUnsafe(64 * 1024);
  let position = 0;
  while (true) {
    const { bytesRead } = await fileHandle.read(buffer, 0, buffer.length, position);
    if (bytesRead === 0) return hash.digest("hex");
    hash.update(buffer.subarray(0, bytesRead));
    position += bytesRead;
  }
}

async function* createCandidateProvider(state) {
  let batch = [];
  for await (const candidate of iterateDestinationCandidates(state)) {
    batch.push(candidate);
    if (batch.length === state.batchSize) {
      yield Object.freeze(batch);
      batch = [];
    }
  }
  if (batch.length > 0) yield Object.freeze(batch);
}

async function* iterateDestinationCandidates(state, request = {}) {
  let candidates;
  try {
    candidates = await state.destinationReader(
      Object.freeze({
        organizationId: state.organizationId,
        batchSize: state.batchSize,
        ...request,
      }),
    );
  } catch {
    throw executionError("DESTINATION_READER_FAILED");
  }
  if (candidates === null || candidates === undefined) return;
  if (
    typeof candidates[Symbol.asyncIterator] !== "function" &&
    typeof candidates[Symbol.iterator] !== "function"
  ) {
    throw executionError("DESTINATION_READER_INVALID");
  }

  try {
    for await (const candidateOrBatch of candidates) {
      const values = Array.isArray(candidateOrBatch) ? candidateOrBatch : [candidateOrBatch];
      for (const candidate of values) yield candidate;
    }
  } catch {
    throw executionError("DESTINATION_READER_FAILED");
  }
}

function buildSanitizedSummary(state) {
  return deepFreezePlain({
    digests: {
      scope: state.scopeDigest,
      execution: state.executionDigest,
    },
    counts: { ...state.counts },
    codes: Object.fromEntries([...state.codes].sort(([left], [right]) => compareText(left, right))),
  });
}

function validateOptions(options) {
  if (options === null || typeof options !== "object") {
    throw new TypeError("createExecutionSession exige opções");
  }
  if (typeof options.sourceDir !== "string" || options.sourceDir.length === 0) {
    throw new TypeError("sourceDir deve ser um diretório");
  }
  if (!(options.ruleRegistry instanceof Map) || !(options.executionRegistry instanceof Map)) {
    throw new TypeError("ruleRegistry e executionRegistry devem ser Map");
  }
  if (typeof options.destinationReader !== "function") {
    throw new TypeError("destinationReader deve ser uma função");
  }
  if (
    options.configuration !== undefined &&
    (options.configuration === null || typeof options.configuration !== "object")
  ) {
    throw new TypeError("configuration deve ser um objeto");
  }
  if (options.runtimeStateByStep !== undefined && !(options.runtimeStateByStep instanceof Map)) {
    throw new TypeError("runtimeStateByStep deve ser Map");
  }
}

function validateRegistries({ sources, steps, ruleRegistry, executionRegistry, organizationId }) {
  if (executionRegistry.size !== steps.size) {
    throw executionError("EXECUTION_REGISTRY_INCOMPLETE");
  }
  for (const key of steps.keys()) {
    if (!executionRegistry.has(key)) throw executionError("EXECUTION_REGISTRY_INCOMPLETE");
  }
  for (const [key, entry] of executionRegistry) {
    if (key !== executionStepKey(entry)) throw executionError("EXECUTION_STEP_KEY_MISMATCH");
    if (!sources.has(entry.sourceTable)) throw executionError("EXECUTION_SOURCE_OUT_OF_SCOPE");
    const scopeStep = steps.get(key);
    if (scopeStep === undefined || scopeStep.destinationTable !== entry.destinationTable) {
      throw executionError("EXECUTION_STEP_OUT_OF_SCOPE");
    }
    const rule = ruleRegistry.get(entry.sourceTable);
    if (
      rule?.status !== "confirmed" ||
      !rule.destinations?.some(
        ({ stepId, destinationTable }) =>
          stepId === entry.stepId && destinationTable === entry.destinationTable,
      )
    ) {
      throw executionError("EXECUTION_RULE_MISSING");
    }
    if (entry.contract?.tenantScope?.organizationId !== organizationId) {
      throw executionError("EXECUTION_TENANT_SCOPE_MISMATCH");
    }
  }
}

function indexScopeSteps(scopeSteps) {
  const steps = new Map();
  for (const step of scopeSteps) {
    const key = executionStepKey(step);
    if (steps.has(key)) throw executionError("EXECUTION_STEP_DUPLICATE");
    steps.set(key, step);
  }
  return steps;
}

function parseContextRequirement(requirement, sourceInventory) {
  const match =
    typeof requirement === "string" ? requirement.match(CONTEXT_REQUIREMENT_PATTERN) : null;
  if (match === null) throw executionError("EXECUTION_CONTEXT_REQUIREMENT_INVALID");
  const kind = match[1];
  const qualifiedName = match[2];
  if (kind === "source" && sourceInventory?.has(qualifiedName)) {
    return { kind, owner: qualifiedName, column: undefined };
  }
  const separator = qualifiedName.lastIndexOf(".");
  if (separator <= 0 || separator === qualifiedName.length - 1) {
    throw executionError("EXECUTION_CONTEXT_REQUIREMENT_INVALID");
  }
  return {
    kind,
    owner: qualifiedName.slice(0, separator),
    column: qualifiedName.slice(separator + 1),
  };
}

function resolveInventoryPath(sourceDir, inventory) {
  const relativePath = inventory.relativePath ?? inventory.fileName;
  if (
    typeof relativePath !== "string" ||
    relativePath.length === 0 ||
    path.isAbsolute(relativePath)
  ) {
    throw executionError("SOURCE_DUMP_PATH_INVALID");
  }
  const resolved = path.resolve(sourceDir, relativePath);
  const relative = path.relative(sourceDir, resolved);
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    throw executionError("SOURCE_DUMP_PATH_INVALID");
  }
  return resolved;
}

function sourceIdentityDigest(rule, entry, row) {
  const step = rule.destinations.find(({ stepId }) => stepId === entry.stepId);
  const identityColumn = step?.identity?.legacyColumn ?? "id";
  return toLegacyIdRef(`${entry.sourceTable}:${String(row?.[identityColumn] ?? "missing")}`);
}

function sourceIdentityValue(state, sourceTable, row, indexedColumn, normalizedKey) {
  const identityColumn = state.inventory.get(sourceTable)?.legacyIdColumn;
  const value =
    typeof identityColumn === "string" && identityColumn.length > 0
      ? row?.[identityColumn]
      : row?.id;
  if (value !== null && value !== undefined) return String(value);
  return toLegacyIdRef(`${sourceTable}:${indexedColumn}:${normalizedKey}`);
}

function destinationIdentityValue(destinationTable, candidate, normalizedKey) {
  if (candidate?.id !== null && candidate?.id !== undefined) return String(candidate.id);
  return toLegacyIdRef(`${destinationTable}:${normalizedKey}`);
}

function addIndexValue(index, normalized, id) {
  const ids = index.get(normalized) ?? [];
  ids.push(id);
  index.set(normalized, ids);
}

function isCandidateInTenant(candidate, organizationId) {
  const candidateOrganizationId = candidate?.organization_id ?? candidate?.organizationId;
  return candidateOrganizationId === organizationId;
}

function normalizeIndexValue(value) {
  if (value === null || value === undefined) return null;
  return String(value).normalize("NFKC").trim().toLocaleLowerCase("en-US");
}

function validateBatchSize(value) {
  if (!Number.isSafeInteger(value) || value < 1) {
    throw executionError("EXECUTION_BATCH_SIZE_INVALID");
  }
  if (value > MAX_BATCH_SIZE) throw executionError("EXECUTION_BATCH_LIMIT_EXCEEDED");
  return value;
}

function assertCasteloScope(organizationId) {
  if (organizationId !== CASTELO_ORGANIZATION_ID) {
    throw executionError("EXECUTION_TENANT_NOT_CASTELO");
  }
}

function recordCode(state, code) {
  if (typeof code !== "string" || !/^[A-Z0-9_.-]+$/.test(code)) return;
  state.codes.set(code, (state.codes.get(code) ?? 0) + 1);
}

export function digestExecutionRegistry(registry) {
  const contracts = [...registry]
    .sort(([left], [right]) => compareText(left, right))
    .map(([key, entry]) => ({ key, contract: entry.contract }));
  return createHash("sha256").update(JSON.stringify(contracts), "utf8").digest("hex");
}

function freezeEphemeralSnapshot(value) {
  return deepFreezePlain(cloneEphemeral(value, new Map()));
}

function cloneEphemeral(value, seen) {
  if (value === null || typeof value !== "object") return value;
  if (seen.has(value)) return seen.get(value);
  if (Buffer.isBuffer(value)) return Buffer.from(value);
  if (ArrayBuffer.isView(value)) return value.slice();
  if (value instanceof ArrayBuffer) return value.slice(0);
  if (value instanceof Date) return new Date(value.getTime());
  const clone = Array.isArray(value) ? [] : {};
  seen.set(value, clone);
  for (const [key, child] of Object.entries(value)) clone[key] = cloneEphemeral(child, seen);
  return clone;
}

function deepFreezePlain(value, seen = new Set()) {
  if (value === null || typeof value !== "object" || seen.has(value)) return value;
  seen.add(value);
  if (!ArrayBuffer.isView(value)) {
    for (const child of Object.values(value)) deepFreezePlain(child, seen);
    Object.freeze(value);
  }
  return value;
}

function sameFileIdentity(left, right) {
  return left.dev === right.dev && left.ino === right.ino;
}

function sameFileSnapshot(left, right) {
  return (
    sameFileIdentity(left, right) &&
    left.size === right.size &&
    left.mtimeMs === right.mtimeMs &&
    left.ctimeMs === right.ctimeMs
  );
}

function compareText(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
}

function executionError(code, details = undefined) {
  const error = new Error(code);
  error.code = code;
  if (details !== undefined) error.details = details;
  return error;
}
