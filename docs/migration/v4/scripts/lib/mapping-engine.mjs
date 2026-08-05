import crypto from "node:crypto";
import { lstat, open, realpath } from "node:fs/promises";
import path from "node:path";

import {
  createPendingMapping,
  validateMappingEmissions,
  validateMappingRuleStructure,
} from "./mapping-contract.mjs";
import { getModelByDatabaseName } from "./prisma-catalog.mjs";
import { validateEvidenceCoverage } from "./semantic-evidence.mjs";
import { assertNoSensitiveSerializedContent, assertNoSensitiveValues } from "./sensitivity.mjs";
import { iterateSqlRows } from "./sql-dump-parser.mjs";
import { serializeCsv, serializeStableJson, writeFileSetAtomically } from "./stable-output.mjs";

const CASTELO_ORGANIZATION_ID = "e8048d1c-0830-45d7-84de-68e20abd685b";
const PROVIDER_MODE = "conservative-read-only";
const MAX_REASONS_PER_STEP = 64;
const DUMP_INTEGRITY_CHUNK_SIZE = 64 * 1024;
const PROVIDER_STATE = new WeakMap();
const RESULT_PROVENANCE = new WeakMap();

export function createConservativeMappingContextProvider({ inventory, ruleRegistry }) {
  if (!isObject(inventory) || !Array.isArray(inventory.tables)) {
    throw new TypeError("Provider exige SourceInventory válido");
  }
  if (!(ruleRegistry instanceof Map)) {
    throw new TypeError("Provider exige RuleRegistry como Map");
  }

  const provider = Object.freeze({
    kind: "v4-conservative-mapping-context-provider",
    mode: PROVIDER_MODE,
    preflightComplete: false,
  });
  PROVIDER_STATE.set(provider, {
    inventoryRef: inventory,
    inventorySnapshot: deepFreeze(copyStaticValue(inventory)),
    inventoryDigest: digestCanonical(inventory),
    ruleRegistryRef: ruleRegistry,
    ruleSnapshot: snapshotRuleRegistry(ruleRegistry),
  });
  return provider;
}

export async function buildMapping({
  inventory,
  evidenceRegistry,
  ruleRegistry,
  prismaCatalog,
  sourceDir,
  capabilities,
  integrityHooks,
}) {
  validateBuildInputs({
    inventory,
    evidenceRegistry,
    ruleRegistry,
    prismaCatalog,
    sourceDir,
    integrityHooks,
  });
  const providerState = validateContextProvider(capabilities, inventory, ruleRegistry);
  const sealedInventory = providerState.inventorySnapshot;
  validateRegistries(sealedInventory, evidenceRegistry, ruleRegistry, prismaCatalog);
  const dumpSessions = [];

  try {
    const tableMappings = [];
    const destinationMappings = [];
    const columnMappings = [];
    const pendingTables = [];
    const quarantineReasonCounts = new Map();
    const preflightBlockCounts = new Map();
    const emissionCounts = {};

    for (const sourceInspection of sorted(
      sealedInventory.tables,
      ({ sourceTable }) => sourceTable,
    )) {
      validateContextProvider(capabilities, inventory, ruleRegistry);
      const dumpPath = resolveDumpPath(sourceDir, sourceInspection);
      const dumpSession = await openValidatedDumpSession(dumpPath, sourceInspection);
      dumpSessions.push(dumpSession);
      await integrityHooks?.afterInitialValidation?.(
        Object.freeze({ sourceTable: sourceInspection.sourceTable }),
      );
      const evidence = evidenceRegistry.get(sourceInspection.sourceTable);
      if (evidence.finalStatus === "pending") {
        pendingTables.push({
          ...createPendingMapping(sourceInspection, evidence),
          preflightComplete: false,
        });
        continue;
      }

      const rule = ruleRegistry.get(sourceInspection.sourceTable);
      const audit = buildRuntimeClassifierAudit(rule);
      const staticDestinations = rule.destinations.map((step) =>
        deriveDestinationStatic(rule, step, audit),
      );
      const counts = createStepCounts(rule);
      const executable = isExplicitContextFreeRule(rule);
      let readRows = 0;
      let parseFailure;

      try {
        if (!executable) {
          for await (const _row of iterateSqlRows(dumpSession.fileHandle, {
            fileName: sourceInspection.fileName,
          })) {
            readRows += 1;
          }
          for (const destination of rule.destinations) {
            const count = counts.get(destination.stepId);
            count.readRows = readRows;
            count.blockedRows = readRows;
            recordPreflightBlock(
              preflightBlockCounts,
              {
                sourceTable: rule.sourceTable,
                stepId: destination.stepId,
                destinationTable: destination.destinationTable,
                reasonCode: "RUNTIME_CLASSIFIER_PREFLIGHT_REQUIRED",
              },
              readRows,
            );
          }
        } else {
          for await (const row of iterateSqlRows(dumpSession.fileHandle, {
            fileName: sourceInspection.fileName,
          })) {
            readRows += 1;
            const decisions = validateMappingEmissions(rule, rule.emitRows(row));
            const emissions = requireExplicitRowEmissions(rule, decisions);
            for (const decision of emissions) {
              const count = counts.get(decision.stepId);
              count.readRows += 1;
              count[toCountField(decision.status)] += 1;
              if (decision.status === "quarantine") {
                recordQuarantineReason(quarantineReasonCounts, {
                  sourceTable: rule.sourceTable,
                  stepId: decision.stepId,
                  destinationTable: decision.destinationTable,
                  field: decision.field,
                  reasonCode: decision.reasonCode,
                });
              }
            }
            validateContextProvider(capabilities, inventory, ruleRegistry);
          }
        }
      } catch (cause) {
        parseFailure = cause;
      }
      if (parseFailure !== undefined) {
        await validateFinalDumpSession(dumpSession);
        throw parseFailure;
      }

      if (readRows !== sourceInspection.rowCount) {
        await validateFinalDumpSession(dumpSession);
        throw new Error(`Contagem lida diverge do inventário para ${sourceInspection.sourceTable}`);
      }

      const countRows = [...counts.values()];
      const totals = sumCounts(countRows);
      const tableStatic = deriveTableStatic(rule, evidence, staticDestinations);
      tableMappings.push({
        ...tableStatic,
        sourceRowCount: sourceInspection.rowCount,
        readRows,
        contextProviderMode: PROVIDER_MODE,
        preflightState: executable ? "context_free_executed" : "preflight_blocked",
        preflightComplete: false,
        prepared: totals.prepared,
        quarantine: totals.quarantine,
        notEmitted: totals.notEmitted,
        blockedRows: totals.blockedRows,
      });

      for (const staticMapping of staticDestinations) {
        const count = counts.get(staticMapping.stepId);
        const mapping = {
          ...staticMapping,
          readRows: count.readRows,
          prepared: count.prepared,
          quarantine: count.quarantine,
          notEmitted: count.notEmitted,
          blockedRows: count.blockedRows,
          preflightState: executable ? "context_free_executed" : "preflight_blocked",
          preflightComplete: false,
        };
        destinationMappings.push(mapping);
        setEmissionCount(emissionCounts, mapping);
        columnMappings.push(...deriveColumnMappings(rule, staticMapping));
      }
    }

    const quarantineReasons = sortQuarantineReasons([...quarantineReasonCounts.values()]);
    const preflightBlocks = sortPreflightBlocks([...preflightBlockCounts.values()]);
    const result = {
      tableMappings: sortTableMappings(tableMappings),
      destinationMappings: sortDestinationMappings(destinationMappings),
      columnMappings: sortColumnMappings(columnMappings),
      pendingTables: sortTableMappings(pendingTables),
      quarantineReasons,
      quarantineSummary: buildQuarantineSummary(quarantineReasons),
      preflightBlocks,
      preflightSummary: buildPreflightSummary(preflightBlocks),
      emissionCounts,
      contextProviderMode: PROVIDER_MODE,
      preflightComplete: false,
      readyForMigration: false,
    };
    assertNoSensitiveValues({ ...result, emissionCounts: undefined });
    validateContextProvider(capabilities, inventory, ruleRegistry);
    await integrityHooks?.beforeFinalValidation?.();
    await validateAllDumpSessions(dumpSessions);
    const provenance = createResultProvenance({
      provider: capabilities,
      providerState,
      inventory,
      evidenceRegistry,
      ruleRegistry,
      prismaCatalog,
    });
    RESULT_PROVENANCE.set(result, provenance);
    validateMappingCompleteness(result, {
      inventory,
      evidenceRegistry,
      ruleRegistry,
      prismaCatalog,
    });
    return deepFreeze(result);
  } finally {
    await closeDumpSessions(dumpSessions);
  }
}

export function validateMappingCompleteness(result, context) {
  const provenance = RESULT_PROVENANCE.get(result);
  if (provenance === undefined) {
    throw new Error("Resultado autenticado com provenance é obrigatório");
  }
  validateResultProvenance(provenance, context);
  const inventory = provenance.providerState.inventorySnapshot;
  validateRegistries(
    inventory,
    context.evidenceRegistry,
    context.ruleRegistry,
    context.prismaCatalog,
  );
  validateStaticContracts(result, inventory, context.evidenceRegistry, context.ruleRegistry);
  validateMetricReconciliation(result, inventory);
  return true;
}

export async function assertSafePackagePath({ packageDir, protectedPaths }) {
  if (!Array.isArray(protectedPaths) || protectedPaths.length === 0) {
    throw new TypeError("protectedPaths deve conter source, legacy e prisma");
  }
  const packagePath = await canonicalPackageCandidate(packageDir);
  for (const protectedPath of protectedPaths) {
    const canonicalProtected = await realpath(protectedPath);
    if (
      isSameOrWithin(packagePath, canonicalProtected) ||
      isSameOrWithin(canonicalProtected, packagePath)
    ) {
      throw new Error("Package não pode coincidir, conter ou estar dentro das origens");
    }
  }
  return true;
}

export async function writeMappingPackage(packageDir, result, { protectedPaths, fileSystem } = {}) {
  const provenance = RESULT_PROVENANCE.get(result);
  if (provenance === undefined) {
    throw new Error("Resultado autenticado com provenance é obrigatório");
  }
  validateMappingCompleteness(result, provenance.bindings);
  await assertSafePackagePath({ packageDir, protectedPaths });
  const artifacts = buildArtifacts(result);
  for (const [relativePath, content] of artifacts) {
    try {
      assertNoSensitiveSerializedContent(content);
    } catch (cause) {
      const error = new Error("Conteúdo sensivel rejeitado antes da substituição");
      error.artifact = relativePath;
      error.reasonCode = cause?.reasonCode ?? "SENSITIVE_CONTENT";
      error.digest = crypto.createHash("sha256").update(content).digest("hex").slice(0, 16);
      throw error;
    }
  }
  return writeFileSetAtomically(packageDir, artifacts, {
    replaceDirectories: ["mapping", "pending-mapping", "preflight", "quarantine"],
    fileSystem,
  });
}

function validateBuildInputs({
  inventory,
  evidenceRegistry,
  ruleRegistry,
  prismaCatalog,
  sourceDir,
  integrityHooks,
}) {
  if (!isObject(inventory) || !Array.isArray(inventory.tables)) {
    throw new TypeError("SourceInventory inválido");
  }
  if (!(evidenceRegistry instanceof Map) || !(ruleRegistry instanceof Map)) {
    throw new TypeError("EvidenceRegistry e RuleRegistry devem ser Map");
  }
  if (!isObject(prismaCatalog) || !Array.isArray(prismaCatalog.models)) {
    throw new TypeError("PrismaCatalog inválido");
  }
  if (typeof sourceDir !== "string" || sourceDir.length === 0) {
    throw new TypeError("sourceDir inválido");
  }
  if (
    integrityHooks !== undefined &&
    (!isObject(integrityHooks) ||
      Object.keys(integrityHooks).some(
        (field) => !["afterInitialValidation", "beforeFinalValidation"].includes(field),
      ) ||
      (integrityHooks.afterInitialValidation !== undefined &&
        typeof integrityHooks.afterInitialValidation !== "function") ||
      (integrityHooks.beforeFinalValidation !== undefined &&
        typeof integrityHooks.beforeFinalValidation !== "function"))
  ) {
    throw new TypeError("integrityHooks inválido");
  }
  if (
    inventory.actualTableCount !== inventory.tables.length ||
    inventory.expectedTableCount !== inventory.tables.length
  ) {
    throw new Error("SourceInventory possui contagem inconsistente");
  }
}

function validateContextProvider(provider, inventory, ruleRegistry) {
  const state = isObject(provider) ? PROVIDER_STATE.get(provider) : undefined;
  if (state === undefined) throw new Error("Provider conservador autenticado é obrigatório");
  if (
    state.inventoryRef !== inventory ||
    state.ruleRegistryRef !== ruleRegistry ||
    state.inventoryDigest !== digestCanonical(inventory)
  ) {
    throw new Error("Provider diverge do inventário ou registry snapshot");
  }
  validateRuleSnapshot(state.ruleSnapshot, ruleRegistry);
  return state;
}

function createResultProvenance({
  provider,
  providerState,
  inventory,
  evidenceRegistry,
  ruleRegistry,
  prismaCatalog,
}) {
  return {
    provider,
    providerState,
    bindings: { inventory, evidenceRegistry, ruleRegistry, prismaCatalog },
    evidenceDigest: digestCanonical(snapshotMap(evidenceRegistry)),
    prismaDigest: digestCanonical(prismaCatalog),
  };
}

function validateResultProvenance(provenance, context) {
  if (
    !isObject(context) ||
    context.inventory !== provenance.bindings.inventory ||
    context.evidenceRegistry !== provenance.bindings.evidenceRegistry ||
    context.ruleRegistry !== provenance.bindings.ruleRegistry ||
    context.prismaCatalog !== provenance.bindings.prismaCatalog
  ) {
    throw new Error("Proveniência diverge dos registries autenticados");
  }
  validateContextProvider(provenance.provider, context.inventory, context.ruleRegistry);
  if (
    provenance.evidenceDigest !== digestCanonical(snapshotMap(context.evidenceRegistry)) ||
    provenance.prismaDigest !== digestCanonical(context.prismaCatalog)
  ) {
    throw new Error("Proveniência diverge do snapshot de evidência ou Prisma");
  }
}

function snapshotRuleRegistry(ruleRegistry) {
  const entries = [...ruleRegistry]
    .sort(([left], [right]) => compareText(left, right))
    .map(([sourceTable, rule]) => ({
      sourceTable,
      ruleRef: rule,
      classifyRef: rule.classifySourceRow,
      emitRef: rule.emitRows,
      digest: digestCanonical(snapshotRule(rule)),
    }));
  return Object.freeze(entries);
}

function validateRuleSnapshot(snapshot, ruleRegistry) {
  if (snapshot.length !== ruleRegistry.size) {
    throw new Error("Provider diverge do RuleRegistry snapshot");
  }
  for (const entry of snapshot) {
    const rule = ruleRegistry.get(entry.sourceTable);
    if (
      rule !== entry.ruleRef ||
      rule?.classifySourceRow !== entry.classifyRef ||
      rule?.emitRows !== entry.emitRef ||
      entry.digest !== digestCanonical(snapshotRule(rule))
    ) {
      throw new Error("Provider diverge da regra ou callback no registry snapshot");
    }
  }
}

function snapshotRule(rule) {
  if (!isObject(rule)) return rule;
  return Object.fromEntries(
    Object.entries(rule).map(([key, value]) => [
      key,
      typeof value === "function" ? functionDescriptor(key, value) : copyStaticValue(value),
    ]),
  );
}

function functionDescriptor(name, callback) {
  return { name, digest: digestFunction(callback) };
}

function digestFunction(callback) {
  return crypto
    .createHash("sha256")
    .update(Function.prototype.toString.call(callback), "utf8")
    .digest("hex");
}

function validateRegistries(inventory, evidenceRegistry, ruleRegistry, prismaCatalog) {
  const inventorySources = inventory.tables.map(({ sourceTable }) => sourceTable).sort(compareText);
  assertSameUniqueSources([...evidenceRegistry.keys()].sort(compareText), inventorySources);
  validateEvidenceCoverage({ decisions: [...evidenceRegistry.values()] }, inventory);
  const confirmedSources = [];
  for (const sourceTable of inventorySources) {
    const evidence = evidenceRegistry.get(sourceTable);
    if (evidence?.sourceTable !== sourceTable) {
      throw new Error(`EvidenceDecision diverge da origem ${sourceTable}`);
    }
    if (evidence.finalStatus === "pending") {
      if (ruleRegistry.has(sourceTable)) {
        throw new Error(`Tabela pending não pode possuir regra executável: ${sourceTable}`);
      }
      continue;
    }
    if (evidence.finalStatus !== "confirmed") {
      throw new Error(`Estado final inválido para ${sourceTable}`);
    }
    const rule = ruleRegistry.get(sourceTable);
    if (rule === undefined || rule.ruleOrigin !== evidence.ruleId) {
      throw new Error(`Regra confirmada ausente ou divergente para ${sourceTable}`);
    }
    validateMappingRuleStructure(rule, prismaCatalog);
    assertCasteloTenant(rule, prismaCatalog);
    confirmedSources.push(sourceTable);
  }
  assertSameUniqueSources(
    [...ruleRegistry.keys()].sort(compareText),
    confirmedSources.sort(compareText),
  );
}

function assertCasteloTenant(rule, prismaCatalog) {
  for (const step of rule.destinations) {
    const model = getModelByDatabaseName(prismaCatalog, step.destinationTable);
    if (model === null) throw new Error(`Destino Prisma ausente: ${step.destinationTable}`);
    const tenantScoped = model.fields.some(
      ({ databaseName }) => databaseName === "organization_id",
    );
    const tenantValue = Object.hasOwn(step.constants, "organization_id")
      ? step.constants.organization_id
      : step.defaults.organization_id;
    if (tenantValue !== undefined && tenantValue !== CASTELO_ORGANIZATION_ID) {
      throw new Error(`Tenant divergente na regra ${rule.sourceTable}.${step.stepId}`);
    }
    if (tenantScoped && ["insert", "derived"].includes(step.mode) && tenantValue === undefined) {
      throw new Error(`Tenant Castelo ausente na regra ${rule.sourceTable}.${step.stepId}`);
    }
    if (
      tenantScoped &&
      ["merge", "lookup", "aggregate"].includes(step.mode) &&
      tenantValue === undefined &&
      !["resolve", "lookup", "aggregate"].includes(step.identity.kind)
    ) {
      throw new Error(
        `Tenant Castelo sem identidade resolvida: ${rule.sourceTable}.${step.stepId}`,
      );
    }
  }
}

function isExplicitContextFreeRule(rule) {
  return (
    rule.executionContract?.contextMode === "context_free" &&
    rule.destinations.every(({ stepId }) => rule.executionContract.steps?.[stepId] !== undefined)
  );
}

function buildRuntimeClassifierAudit(rule) {
  return {
    classifyRef: `${rule.ruleOrigin}#classifySourceRow`,
    classifyDigest: digestFunction(rule.classifySourceRow),
    emitRef: `${rule.ruleOrigin}#emitRows`,
    emitDigest: digestFunction(rule.emitRows),
  };
}

function deriveDestinationStatic(rule, step, audit) {
  const declared = isExplicitContextFreeRule(rule);
  const stepContract = declared ? rule.executionContract.steps[step.stepId] : null;
  const contextContract = declared
    ? {
        declared: true,
        mode: rule.executionContract.contextMode,
        requirements: [...stepContract.contextRequirements],
      }
    : { declared: false, mode: "unknown", requirements: [] };
  const emissionContract = declared
    ? {
        kind: "declarative",
        decisionSource: stepContract.decisionSource,
        conditions: {
          preparedWhen: deriveConditionArtifact(stepContract.preparedWhen),
          quarantineWhen: deriveConditionArtifact(stepContract.quarantineWhen),
          notEmittedWhen: deriveConditionArtifact(stepContract.notEmittedWhen),
        },
        decisionRequiredPerSourceRow: true,
        omissionPolicy: "error",
        runtimeClassifierRequired: false,
      }
    : {
        kind: "runtime_classifier",
        decisionSource: "runtime_classifier",
        conditions: null,
        decisionRequiredPerSourceRow: true,
        omissionPolicy: "error",
        runtimeClassifierRequired: true,
      };
  const contractOrigin = {
    ruleOrigin: rule.ruleOrigin,
    stepId: step.stepId,
    classifyRef: audit.classifyRef,
    emitRef: audit.emitRef,
  };
  const runtimeClassifier = {
    required: !declared,
    classifyDigest: audit.classifyDigest,
    emitDigest: audit.emitDigest,
  };
  const contractBody = {
    sourceTable: rule.sourceTable,
    stepId: step.stepId,
    destinationTable: step.destinationTable,
    mode: step.mode,
    identity: copyStaticValue(step.identity),
    cardinality: rule.cardinality,
    ruleOrigin: rule.ruleOrigin,
    dependencies: [...step.dependencies],
    precedence: [...step.precedence],
    columns: step.columns.map(copyColumn),
    constants: copyStaticValue(step.constants),
    defaults: copyStaticValue(step.defaults),
    contextContract,
    emissionContract,
    contractOrigin,
    runtimeClassifier,
  };
  return {
    ...contractBody,
    identityKind: step.identity.kind,
    contractDigest: digestCanonical(contractBody),
  };
}

function deriveConditionArtifact(condition) {
  const artifact = copyStaticValue(condition);
  return { ...artifact, conditionDigest: digestCanonical(artifact) };
}

function deriveTableStatic(rule, evidence, destinations) {
  const contractBody = {
    sourceTable: rule.sourceTable,
    reasonCode: evidence.reasonCode,
    reason: evidence.reason,
    domain: rule.domain,
    ruleOrigin: rule.ruleOrigin,
    cardinality: rule.cardinality,
    destinationStepCount: rule.destinations.length,
    dependencies: [...rule.dependencies],
    evidence: copyRuleEvidence(rule.evidence),
    destinationContractDigests: destinations.map(({ contractDigest }) => contractDigest),
  };
  return { ...contractBody, contractDigest: digestCanonical(contractBody), status: "confirmed" };
}

function deriveColumnMappings(rule, destination) {
  return destination.columns.map((column) => ({
    sourceTable: rule.sourceTable,
    stepId: destination.stepId,
    destinationTable: destination.destinationTable,
    mode: destination.mode,
    ...copyColumn(column),
    ruleOrigin: rule.ruleOrigin,
    contractDigest: destination.contractDigest,
  }));
}

function requireExplicitRowEmissions(rule, emissions) {
  const expected = new Set(rule.destinations.map(({ stepId }) => stepId));
  const actual = new Set();
  for (const { stepId } of emissions) {
    if (actual.has(stepId)) throw new Error(`Emissão duplicada no passo ${stepId}`);
    actual.add(stepId);
  }
  for (const stepId of expected) {
    if (!actual.has(stepId)) throw new Error(`Decisão explícita ausente para o passo ${stepId}`);
  }
  if (actual.size !== expected.size) throw new Error("Emissão contém passo desconhecido");
  return emissions;
}

function createStepCounts(rule) {
  return new Map(
    rule.destinations.map(({ stepId, destinationTable, mode }) => [
      stepId,
      {
        sourceTable: rule.sourceTable,
        stepId,
        destinationTable,
        mode,
        readRows: 0,
        prepared: 0,
        quarantine: 0,
        notEmitted: 0,
        blockedRows: 0,
      },
    ]),
  );
}

function recordQuarantineReason(registry, reason, increment = 1) {
  recordBounded(registry, quarantineReasonKey(reason), reason, increment, "quarantine");
}

function recordPreflightBlock(registry, block, increment) {
  recordBounded(registry, preflightBlockKey(block), block, increment, "preflight", {
    preserveZero: true,
  });
}

function recordBounded(registry, key, item, increment, label, { preserveZero = false } = {}) {
  if (increment === 0 && !preserveZero) return;
  const existing = registry.get(key);
  if (existing !== undefined) {
    existing.count += increment;
    return;
  }
  const perStep = [...registry.values()].filter(
    (candidate) => destinationKey(candidate) === destinationKey(item),
  ).length;
  if (perStep >= MAX_REASONS_PER_STEP) {
    throw new Error(
      `Quantidade de ${label} excedeu o limite para ${item.sourceTable}.${item.stepId}`,
    );
  }
  registry.set(key, { ...item, count: increment });
}

function validateStaticContracts(result, inventory, evidenceRegistry, ruleRegistry) {
  const expectedTables = [];
  const expectedDestinations = [];
  const expectedColumns = [];
  const expectedPending = [];
  for (const source of sorted(inventory.tables, ({ sourceTable }) => sourceTable)) {
    const evidence = evidenceRegistry.get(source.sourceTable);
    if (evidence.finalStatus === "pending") {
      expectedPending.push({
        ...createPendingMapping(source, evidence),
        preflightComplete: false,
      });
      continue;
    }
    const rule = ruleRegistry.get(source.sourceTable);
    const audit = buildRuntimeClassifierAudit(rule);
    const destinations = rule.destinations.map((step) =>
      deriveDestinationStatic(rule, step, audit),
    );
    expectedTables.push(deriveTableStatic(rule, evidence, destinations));
    expectedDestinations.push(...destinations);
    for (const destination of destinations) {
      expectedColumns.push(...deriveColumnMappings(rule, destination));
    }
  }
  compareStaticRows(
    result.tableMappings,
    expectedTables,
    TABLE_STATIC_FIELDS,
    sortTableMappings,
    "tableMappings",
  );
  compareStaticRows(
    result.destinationMappings,
    expectedDestinations,
    DESTINATION_STATIC_FIELDS,
    sortDestinationMappings,
    "destinationMappings",
  );
  compareStaticRows(
    result.columnMappings,
    expectedColumns,
    COLUMN_COLUMNS,
    sortColumnMappings,
    "columnMappings",
  );
  if (
    canonicalJson(sortTableMappings(result.pendingTables.map(pickPendingMapping))) !==
    canonicalJson(sortTableMappings(expectedPending.map(pickPendingMapping)))
  ) {
    throw new Error("pendingMappings diverge dos registries");
  }
}

function compareStaticRows(actual, expected, fields, sorter, label) {
  const selectedActual = sorter(actual.map((row) => pickFields(row, fields)));
  const selectedExpected = sorter(expected.map((row) => pickFields(row, fields)));
  if (canonicalJson(selectedActual) !== canonicalJson(selectedExpected)) {
    throw new Error(`${label} diverge dos registries autenticados`);
  }
}

function validateMetricReconciliation(result, inventory) {
  if (result.preflightComplete !== false || result.readyForMigration !== false) {
    throw new Error("Estado de preflight inválido ou incompleto");
  }
  const confirmed = requireArray(result.tableMappings, "tableMappings");
  const pending = requireArray(result.pendingTables, "pendingTables");
  const destinations = requireArray(result.destinationMappings, "destinationMappings");
  const reasons = requireArray(result.quarantineReasons, "quarantineReasons");
  const blocks = requireArray(result.preflightBlocks, "preflightBlocks");
  requireArray(result.columnMappings, "columnMappings");
  const inventoryBySource = new Map(inventory.tables.map((table) => [table.sourceTable, table]));
  assertSameUniqueSources(
    [...confirmed, ...pending].map(({ sourceTable }) => sourceTable).sort(compareText),
    [...inventoryBySource.keys()].sort(compareText),
  );
  const pendingSources = new Set(pending.map(({ sourceTable }) => sourceTable));
  const destinationsBySource = groupBy(destinations, "sourceTable");
  const blockedDestinationKeys = new Set(blocks.map(destinationKey));
  const destinationKeys = new Set();
  const expectedEmissionCounts = {};
  for (const destination of destinations) {
    const key = destinationKey(destination);
    if (destinationKeys.has(key)) throw new Error(`Destination mapping duplicado: ${key}`);
    destinationKeys.add(key);
    const source = inventoryBySource.get(destination.sourceTable);
    if (
      source === undefined ||
      pendingSources.has(destination.sourceTable) ||
      destination.readRows !== source.rowCount ||
      destination.preflightComplete !== false ||
      !validCounts(destination) ||
      destination.prepared +
        destination.quarantine +
        destination.notEmitted +
        destination.blockedRows !==
        source.rowCount ||
      blockedDestinationKeys.has(key) !== (destination.preflightState === "preflight_blocked")
    ) {
      throw new Error(`Destination mapping incompleto: ${key}`);
    }
    setEmissionCount(expectedEmissionCounts, destination);
  }
  if (canonicalJson(expectedEmissionCounts) !== canonicalJson(result.emissionCounts)) {
    throw new Error("EmissionCounts diverge de destinationMappings");
  }

  for (const mapping of confirmed) {
    const source = inventoryBySource.get(mapping.sourceTable);
    const sourceDestinations = destinationsBySource.get(mapping.sourceTable) ?? [];
    const totals = sumCounts(sourceDestinations);
    const sourceBlocked = sourceDestinations.some(
      ({ preflightState }) => preflightState === "preflight_blocked",
    );
    if (
      source === undefined ||
      mapping.sourceRowCount !== source.rowCount ||
      mapping.readRows !== source.rowCount ||
      mapping.destinationStepCount !== sourceDestinations.length ||
      mapping.preflightComplete !== false ||
      mapping.prepared !== totals.prepared ||
      mapping.quarantine !== totals.quarantine ||
      mapping.notEmitted !== totals.notEmitted ||
      mapping.blockedRows !== totals.blockedRows ||
      sourceBlocked !== (mapping.preflightState === "preflight_blocked")
    ) {
      throw new Error(`Totais da tabela divergem: ${mapping.sourceTable}`);
    }
  }
  validateAggregateRows(reasons, destinations, "quarantine", quarantineReasonKey);
  validateAggregateRows(blocks, destinations, "blockedRows", preflightBlockKey, {
    allowZero: true,
  });
  if (canonicalJson(buildQuarantineSummary(reasons)) !== canonicalJson(result.quarantineSummary)) {
    throw new Error("Resumo de quarantine diverge das razões");
  }
  if (canonicalJson(buildPreflightSummary(blocks)) !== canonicalJson(result.preflightSummary)) {
    throw new Error("Resumo de preflight diverge dos bloqueios");
  }
}

function validateAggregateRows(
  rows,
  destinations,
  countField,
  keyBuilder,
  { allowZero = false } = {},
) {
  const keys = new Set();
  const totals = new Map();
  const rowCounts = new Map();
  for (const row of rows) {
    const key = keyBuilder(row);
    if (keys.has(key)) throw new Error(`Linha agregada duplicada: ${key}`);
    keys.add(key);
    if (!Number.isSafeInteger(row.count) || row.count < (allowZero ? 0 : 1)) {
      throw new Error(`Contagem agregada inválida: ${key}`);
    }
    const destinationId = destinationKey(row);
    const destination = destinations.find(
      (candidate) => destinationKey(candidate) === destinationId,
    );
    if (destination === undefined) throw new Error(`Agregado sem destination: ${key}`);
    totals.set(destinationId, (totals.get(destinationId) ?? 0) + row.count);
    rowCounts.set(destinationId, (rowCounts.get(destinationId) ?? 0) + 1);
    if (rowCounts.get(destinationId) > MAX_REASONS_PER_STEP) {
      throw new Error(`Agregado excede limite bounded: ${destinationId}`);
    }
  }
  for (const destination of destinations) {
    if ((totals.get(destinationKey(destination)) ?? 0) !== destination[countField]) {
      throw new Error(`Agregado diverge do destino: ${destinationKey(destination)}`);
    }
  }
}

function resolveDumpPath(sourceDir, inspection) {
  const sourceRoot = path.resolve(sourceDir);
  const dumpPath = path.resolve(sourceRoot, inspection.relativePath ?? inspection.fileName);
  if (dumpPath !== sourceRoot && !dumpPath.startsWith(`${sourceRoot}${path.sep}`)) {
    throw new Error("Caminho de dump fora do diretório de origem");
  }
  return dumpPath;
}

async function openValidatedDumpSession(dumpPath, inspection) {
  validateInventoryIntegrityFields(inspection);
  let fileHandle;
  try {
    const initialPathIdentity = await captureDumpPathIdentity(dumpPath, inspection.sourceTable);
    fileHandle = await open(dumpPath, "r");
    const handleIdentity = await fileHandle.stat({ bigint: true });
    if (
      !handleIdentity.isFile() ||
      handleIdentity.dev !== initialPathIdentity.device ||
      handleIdentity.ino !== initialPathIdentity.inode
    ) {
      throw dumpIntegrityError("DUMP_INTEGRITY_CHANGED", inspection.sourceTable);
    }
    const session = {
      dumpPath,
      sourceTable: inspection.sourceTable,
      expectedSize: BigInt(inspection.fileSizeBytes),
      expectedSha256: inspection.sha256,
      fileHandle,
      initialPathIdentity,
      initialSnapshot: null,
    };
    session.initialSnapshot = await captureOpenDumpIntegrity(session);
    if (
      session.initialSnapshot.size !== session.expectedSize ||
      session.initialSnapshot.sha256 !== session.expectedSha256
    ) {
      throw dumpIntegrityError("DUMP_INTEGRITY_MISMATCH", inspection.sourceTable);
    }
    return session;
  } catch (cause) {
    if (fileHandle !== undefined) await fileHandle.close().catch(() => {});
    if (cause?.code?.startsWith("DUMP_INTEGRITY_")) throw cause;
    throw dumpIntegrityError("DUMP_INTEGRITY_UNAVAILABLE", inspection.sourceTable);
  }
}

async function validateAllDumpSessions(sessions) {
  for (const session of sessions) await validateFinalDumpSession(session);
}

async function validateFinalDumpSession(session) {
  try {
    const snapshot = await captureOpenDumpIntegrity(session);
    const pathIdentity = await captureDumpPathIdentity(session.dumpPath, session.sourceTable);
    if (
      snapshot.size !== session.expectedSize ||
      snapshot.sha256 !== session.expectedSha256 ||
      !sameDumpSnapshot(snapshot, session.initialSnapshot) ||
      !samePathIdentity(pathIdentity, session.initialPathIdentity) ||
      pathIdentity.device !== snapshot.device ||
      pathIdentity.inode !== snapshot.inode
    ) {
      throw dumpIntegrityError("DUMP_INTEGRITY_CHANGED", session.sourceTable);
    }
  } catch (cause) {
    if (cause?.code?.startsWith("DUMP_INTEGRITY_")) throw cause;
    throw dumpIntegrityError("DUMP_INTEGRITY_UNAVAILABLE", session.sourceTable);
  }
}

async function captureOpenDumpIntegrity(session) {
  try {
    const before = await session.fileHandle.stat({ bigint: true });
    if (!before.isFile()) {
      throw dumpIntegrityError("DUMP_INTEGRITY_UNAVAILABLE", session.sourceTable);
    }
    const hash = crypto.createHash("sha256");
    let streamedSize = 0n;
    const buffer = Buffer.allocUnsafe(DUMP_INTEGRITY_CHUNK_SIZE);
    let position = 0;
    while (true) {
      const { bytesRead } = await session.fileHandle.read(buffer, 0, buffer.length, position);
      if (bytesRead === 0) break;
      position += bytesRead;
      streamedSize += BigInt(bytesRead);
      hash.update(buffer.subarray(0, bytesRead));
    }
    const after = await session.fileHandle.stat({ bigint: true });
    if (!sameFileMetadata(before, after) || streamedSize !== after.size) {
      throw dumpIntegrityError("DUMP_INTEGRITY_CHANGED", session.sourceTable);
    }
    return {
      sha256: hash.digest("hex"),
      size: streamedSize,
      device: after.dev,
      inode: after.ino,
      modifiedAt: after.mtimeNs,
      changedAt: after.ctimeNs,
    };
  } catch (cause) {
    if (cause?.code?.startsWith("DUMP_INTEGRITY_")) throw cause;
    throw dumpIntegrityError("DUMP_INTEGRITY_UNAVAILABLE", session.sourceTable);
  }
}

async function captureDumpPathIdentity(dumpPath, sourceTable) {
  try {
    const inspection = await lstat(dumpPath, { bigint: true });
    if (!inspection.isFile() || inspection.isSymbolicLink()) {
      throw dumpIntegrityError("DUMP_INTEGRITY_UNAVAILABLE", sourceTable);
    }
    return {
      canonicalPath: await realpath(dumpPath),
      device: inspection.dev,
      inode: inspection.ino,
    };
  } catch (cause) {
    if (cause?.code?.startsWith("DUMP_INTEGRITY_")) throw cause;
    throw dumpIntegrityError("DUMP_INTEGRITY_UNAVAILABLE", sourceTable);
  }
}

async function closeDumpSessions(sessions) {
  const settlements = await Promise.allSettled(
    sessions.map(({ fileHandle }) => fileHandle.close()),
  );
  const failedIndex = settlements.findIndex(({ status }) => status === "rejected");
  if (failedIndex !== -1) {
    throw dumpIntegrityError("DUMP_INTEGRITY_CLOSE_FAILED", sessions[failedIndex].sourceTable);
  }
}

function validateInventoryIntegrityFields(inspection) {
  if (
    !Number.isSafeInteger(inspection.fileSizeBytes) ||
    inspection.fileSizeBytes < 0 ||
    typeof inspection.sha256 !== "string" ||
    !/^[a-f0-9]{64}$/.test(inspection.sha256)
  ) {
    throw dumpIntegrityError("DUMP_INTEGRITY_METADATA_INVALID", inspection.sourceTable);
  }
}

function sameFileMetadata(left, right) {
  return (
    left.isFile() === right.isFile() &&
    left.dev === right.dev &&
    left.ino === right.ino &&
    left.size === right.size &&
    left.mtimeNs === right.mtimeNs &&
    left.ctimeNs === right.ctimeNs
  );
}

function sameDumpSnapshot(left, right) {
  return (
    left.sha256 === right.sha256 &&
    left.size === right.size &&
    left.device === right.device &&
    left.inode === right.inode &&
    left.modifiedAt === right.modifiedAt &&
    left.changedAt === right.changedAt
  );
}

function samePathIdentity(left, right) {
  return (
    left.canonicalPath === right.canonicalPath &&
    left.device === right.device &&
    left.inode === right.inode
  );
}

function dumpIntegrityError(code, sourceTable) {
  const error = new Error(`Integridade do dump rejeitada para ${sourceTable}`);
  error.code = code;
  error.sourceTable = sourceTable;
  return error;
}

function setEmissionCount(registry, count) {
  registry[count.sourceTable] ??= {};
  registry[count.sourceTable][count.stepId] = {
    destinationTable: count.destinationTable,
    readRows: count.readRows,
    prepared: count.prepared,
    quarantine: count.quarantine,
    notEmitted: count.notEmitted,
    blockedRows: count.blockedRows,
  };
}

function buildArtifacts(result) {
  const tables = sortTableMappings(result.tableMappings.map(pickTableMapping));
  const destinations = sortDestinationMappings(
    result.destinationMappings.map(pickDestinationMapping),
  );
  const columns = sortColumnMappings(result.columnMappings.map(pickColumnMapping));
  const pending = sortTableMappings(result.pendingTables.map(pickPendingMapping));
  const reasons = sortQuarantineReasons(result.quarantineReasons.map(pickQuarantineReason));
  const blocks = sortPreflightBlocks(result.preflightBlocks.map(pickPreflightBlock));
  const files = new Map();
  addJsonCsv(files, "mapping/tables", TABLE_COLUMNS, tables, flattenTableMapping);
  addJsonCsv(
    files,
    "mapping/destinations",
    DESTINATION_COLUMNS,
    destinations,
    flattenDestinationMapping,
  );
  addJsonCsv(files, "mapping/columns", COLUMN_COLUMNS, columns, (row) => row);
  addJsonCsv(files, "pending-mapping/tables", PENDING_COLUMNS, pending, flattenPendingMapping);
  files.set(
    "preflight/summary.json",
    serializeStableJson(pickPreflightSummary(result.preflightSummary)),
  );
  files.set("preflight/blocked.csv", serializeCsv(PREFLIGHT_COLUMNS, blocks));
  files.set(
    "quarantine/summary.json",
    serializeStableJson(pickQuarantineSummary(result.quarantineSummary)),
  );
  files.set("quarantine/reasons.csv", serializeCsv(QUARANTINE_COLUMNS, reasons));
  return files;
}

function addJsonCsv(files, stem, columns, rows, flatten) {
  files.set(`${stem}.json`, serializeStableJson(rows));
  files.set(`${stem}.csv`, serializeCsv(columns, rows.map(flatten)));
}

function flattenTableMapping(row) {
  return {
    ...row,
    dependencies: row.dependencies.join("|"),
    evidence: JSON.stringify(row.evidence),
    destinationContractDigests: row.destinationContractDigests.join("|"),
  };
}

function flattenDestinationMapping(row) {
  return {
    ...row,
    identity: JSON.stringify(row.identity),
    dependencies: row.dependencies.join("|"),
    precedence: row.precedence.join("|"),
    columns: JSON.stringify(row.columns),
    constants: JSON.stringify(row.constants),
    defaults: JSON.stringify(row.defaults),
    contextContract: JSON.stringify(row.contextContract),
    emissionContract: JSON.stringify(row.emissionContract),
    contractOrigin: JSON.stringify(row.contractOrigin),
    runtimeClassifier: JSON.stringify(row.runtimeClassifier),
  };
}

function flattenPendingMapping(row) {
  return {
    sourceTable: row.sourceTable,
    sourceRowCount: row.sourceRowCount,
    status: row.status,
    reasonCode: row.reasonCode,
    reason: row.reason,
    legacyReferences: row.evidence.legacyReferences.join("|"),
    currentContractEvidence: row.evidence.currentContractEvidence.join("|"),
    confidence: row.evidence.confidence,
    preflightComplete: row.preflightComplete,
  };
}

function buildQuarantineSummary(reasons) {
  const total = reasons.reduce((sum, reason) => sum + reason.count, 0);
  return {
    total,
    unresolved: total,
    boundedReasonRows: reasons.length,
    byReason: countWeightedGroups(reasons, "reasonCode"),
    bySourceTable: countWeightedGroups(reasons, "sourceTable"),
  };
}

function buildPreflightSummary(blocks) {
  return {
    totalBlockedRows: blocks.reduce((sum, block) => sum + block.count, 0),
    blockedSources: new Set(blocks.map(({ sourceTable }) => sourceTable)).size,
    blockedSteps: blocks.length,
    byReason: countWeightedGroups(blocks, "reasonCode"),
    bySourceTable: countWeightedGroups(blocks, "sourceTable"),
  };
}

function countWeightedGroups(items, field) {
  const counts = new Map();
  for (const item of items) counts.set(item[field], (counts.get(item[field]) ?? 0) + item.count);
  return [...counts.entries()]
    .sort(([left], [right]) => compareText(left, right))
    .map(([value, count]) => ({ [field]: value, count }));
}

function sumCounts(counts) {
  return counts.reduce(
    (total, count) => ({
      prepared: total.prepared + count.prepared,
      quarantine: total.quarantine + count.quarantine,
      notEmitted: total.notEmitted + count.notEmitted,
      blockedRows: total.blockedRows + count.blockedRows,
    }),
    { prepared: 0, quarantine: 0, notEmitted: 0, blockedRows: 0 },
  );
}

function validCounts(mapping) {
  return [
    mapping.readRows,
    mapping.prepared,
    mapping.quarantine,
    mapping.notEmitted,
    mapping.blockedRows,
  ].every((value) => Number.isSafeInteger(value) && value >= 0);
}

function copyRuleEvidence(evidence) {
  return { legacy: [...evidence.legacy], current: [...evidence.current] };
}

function copyColumn(column) {
  return pickFields(column, COLUMN_CONTRACT_FIELDS);
}

function copyStaticValue(value) {
  if (Array.isArray(value)) return value.map(copyStaticValue);
  if (isObject(value)) {
    return Object.fromEntries(
      Object.entries(value).map(([key, entry]) => [key, copyStaticValue(entry)]),
    );
  }
  return value;
}

function deepFreeze(value, seen = new WeakSet()) {
  if (value === null || typeof value !== "object" || seen.has(value)) return value;
  seen.add(value);
  for (const entry of Object.values(value)) deepFreeze(entry, seen);
  return Object.freeze(value);
}

function snapshotMap(registry) {
  return [...registry]
    .sort(([left], [right]) => compareText(left, right))
    .map(([key, value]) => [key, copyStaticValue(value)]);
}

function digestCanonical(value) {
  return crypto.createHash("sha256").update(canonicalJson(value), "utf8").digest("hex");
}

async function canonicalPackageCandidate(packageDir) {
  const resolved = path.resolve(packageDir);
  try {
    const inspection = await lstat(resolved);
    if (inspection.isSymbolicLink()) throw new Error("Package não pode ser symlink ou alias");
    const canonical = await realpath(resolved);
    if (canonical !== resolved) throw new Error("Package não pode usar alias de realpath");
    return canonical;
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
    const parent = path.dirname(resolved);
    const canonicalParent = await realpath(parent);
    if (canonicalParent !== parent) throw new Error("Package não pode usar ancestral symlink");
    return path.join(canonicalParent, path.basename(resolved));
  }
}

function isSameOrWithin(candidate, parent) {
  return candidate === parent || candidate.startsWith(`${parent}${path.sep}`);
}

function canonicalJson(value) {
  return JSON.stringify(stableSortObject(value));
}

function stableSortObject(value) {
  if (Array.isArray(value)) return value.map(stableSortObject);
  if (isObject(value)) {
    return Object.fromEntries(
      Object.keys(value)
        .sort(compareText)
        .map((key) => [key, stableSortObject(value[key])]),
    );
  }
  return value;
}

function destinationKey({ sourceTable, stepId, destinationTable }) {
  return [sourceTable, stepId, destinationTable].join("\0");
}

function quarantineReasonKey({ sourceTable, stepId, destinationTable, field, reasonCode }) {
  return [sourceTable, stepId, destinationTable, field ?? "", reasonCode].join("\0");
}

function preflightBlockKey({ sourceTable, stepId, destinationTable, reasonCode }) {
  return [sourceTable, stepId, destinationTable, reasonCode].join("\0");
}

function sortTableMappings(rows) {
  return sorted(rows, ({ sourceTable }) => sourceTable);
}

function sortDestinationMappings(rows) {
  return sorted(rows, destinationKey);
}

function sortColumnMappings(rows) {
  return sorted(
    rows,
    ({ sourceTable, stepId, destinationTable, sourceColumn, destinationColumn }) =>
      [sourceTable, stepId, destinationTable, sourceColumn ?? "", destinationColumn ?? ""].join(
        "\0",
      ),
  );
}

function sortQuarantineReasons(rows) {
  return sorted(rows, quarantineReasonKey);
}

function sortPreflightBlocks(rows) {
  return sorted(rows, preflightBlockKey);
}

function sorted(rows, key) {
  return [...rows].sort((left, right) => compareText(key(left), key(right)));
}

function groupBy(rows, field) {
  const groups = new Map();
  for (const row of rows) {
    if (!groups.has(row[field])) groups.set(row[field], []);
    groups.get(row[field]).push(row);
  }
  return groups;
}

function assertSameUniqueSources(actual, expected) {
  const normalized = actual.map((sourceTable) => sourceTable.toLocaleLowerCase("en-US"));
  if (new Set(normalized).size !== actual.length || !sameArray(actual, expected)) {
    throw new Error("Cobertura de sourceTable divergente");
  }
}

function sameArray(left, right) {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function requireArray(value, field) {
  if (!Array.isArray(value)) throw new TypeError(`${field} deve ser array`);
  return value;
}

function toCountField(status) {
  if (!["prepared", "quarantine", "not_emitted"].includes(status)) {
    throw new Error(`Status de emissão inválido: ${status}`);
  }
  return status === "not_emitted" ? "notEmitted" : status;
}

function pickFields(value, fields) {
  return Object.fromEntries(fields.map((field) => [field, copyStaticValue(value[field])]));
}

function pickTableMapping(row) {
  return pickFields(row, TABLE_COLUMNS);
}

function pickDestinationMapping(row) {
  return pickFields(row, DESTINATION_COLUMNS);
}

function pickColumnMapping(row) {
  return pickFields(row, COLUMN_COLUMNS);
}

function pickPendingMapping(row) {
  return {
    sourceTable: row.sourceTable,
    sourceRowCount: row.sourceRowCount,
    status: row.status,
    reasonCode: row.reasonCode,
    reason: row.reason,
    evidence: pickFields(row.evidence, PENDING_EVIDENCE_FIELDS),
    preflightComplete: row.preflightComplete,
  };
}

function pickQuarantineReason(row) {
  return pickFields(row, QUARANTINE_COLUMNS);
}

function pickPreflightBlock(row) {
  return pickFields(row, PREFLIGHT_COLUMNS);
}

function pickQuarantineSummary(summary) {
  return pickFields(summary, QUARANTINE_SUMMARY_FIELDS);
}

function pickPreflightSummary(summary) {
  return pickFields(summary, PREFLIGHT_SUMMARY_FIELDS);
}

function isObject(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function compareText(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
}

const COLUMN_CONTRACT_FIELDS = [
  "sourceColumn",
  "destinationColumn",
  "status",
  "transformation",
  "nullHandling",
  "referenceRole",
  "sensitivity",
  "reason",
];
const TABLE_STATIC_FIELDS = [
  "sourceTable",
  "status",
  "reasonCode",
  "reason",
  "domain",
  "ruleOrigin",
  "cardinality",
  "destinationStepCount",
  "dependencies",
  "evidence",
  "destinationContractDigests",
  "contractDigest",
];
const TABLE_COLUMNS = [
  "sourceTable",
  "sourceRowCount",
  "readRows",
  "status",
  "reasonCode",
  "reason",
  "domain",
  "ruleOrigin",
  "cardinality",
  "destinationStepCount",
  "dependencies",
  "evidence",
  "destinationContractDigests",
  "contractDigest",
  "contextProviderMode",
  "preflightState",
  "preflightComplete",
  "prepared",
  "quarantine",
  "notEmitted",
  "blockedRows",
];
const DESTINATION_STATIC_FIELDS = [
  "sourceTable",
  "stepId",
  "destinationTable",
  "mode",
  "identityKind",
  "identity",
  "cardinality",
  "ruleOrigin",
  "dependencies",
  "precedence",
  "columns",
  "constants",
  "defaults",
  "contextContract",
  "emissionContract",
  "contractOrigin",
  "runtimeClassifier",
  "contractDigest",
];
const DESTINATION_COLUMNS = [
  ...DESTINATION_STATIC_FIELDS,
  "readRows",
  "prepared",
  "quarantine",
  "notEmitted",
  "blockedRows",
  "preflightState",
  "preflightComplete",
];
const COLUMN_COLUMNS = [
  "sourceTable",
  "stepId",
  "destinationTable",
  "mode",
  ...COLUMN_CONTRACT_FIELDS,
  "ruleOrigin",
  "contractDigest",
];
const PENDING_COLUMNS = [
  "sourceTable",
  "sourceRowCount",
  "status",
  "reasonCode",
  "reason",
  "legacyReferences",
  "currentContractEvidence",
  "confidence",
  "preflightComplete",
];
const PENDING_EVIDENCE_FIELDS = [
  "sourceTable",
  "legacyModule",
  "legacyReferences",
  "operations",
  "legacyRelationships",
  "currentContractEvidence",
  "finalStatus",
  "reasonCode",
  "reason",
  "confidence",
  "ruleId",
];
const QUARANTINE_COLUMNS = [
  "sourceTable",
  "stepId",
  "destinationTable",
  "field",
  "reasonCode",
  "count",
];
const PREFLIGHT_COLUMNS = ["sourceTable", "stepId", "destinationTable", "reasonCode", "count"];
const QUARANTINE_SUMMARY_FIELDS = [
  "total",
  "unresolved",
  "boundedReasonRows",
  "byReason",
  "bySourceTable",
];
const PREFLIGHT_SUMMARY_FIELDS = [
  "totalBlockedRows",
  "blockedSources",
  "blockedSteps",
  "byReason",
  "bySourceTable",
];
