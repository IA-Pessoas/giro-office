import crypto from "node:crypto";
import { lstat, realpath } from "node:fs/promises";
import path from "node:path";

import { createPendingMapping, validateMappingRule } from "./mapping-contract.mjs";
import { getModelByDatabaseName } from "./prisma-catalog.mjs";
import { validateEvidenceCoverage } from "./semantic-evidence.mjs";
import { assertNoSensitiveSerializedContent, assertNoSensitiveValues } from "./sensitivity.mjs";
import { iterateSqlRows } from "./sql-dump-parser.mjs";
import { serializeCsv, serializeStableJson, writeFileSetAtomically } from "./stable-output.mjs";

const CASTELO_ORGANIZATION_ID = "e8048d1c-0830-45d7-84de-68e20abd685b";
const EMISSION_STATUSES = ["prepared", "quarantine", "not_emitted"];
const MAX_REASONS_PER_STEP = 64;
const PROVIDER_STATE = new WeakMap();
const SENSITIVE_CAPABILITY = /(?:encrypt|credential|secret|storage.*verified|key.*verified)/i;

export function createMappingContextProvider({
  inventory,
  ruleRegistry,
  sourcePreparers = new Map(),
}) {
  if (!isObject(inventory) || !Array.isArray(inventory.tables)) {
    throw new TypeError("Provider exige SourceInventory válido");
  }
  if (!(ruleRegistry instanceof Map) || !(sourcePreparers instanceof Map)) {
    throw new TypeError("Provider exige RuleRegistry e sourcePreparers como Map");
  }
  for (const [sourceTable, prepare] of sourcePreparers) {
    if (!ruleRegistry.has(sourceTable) || typeof prepare !== "function") {
      throw new Error("Source preparer não corresponde ao RuleRegistry");
    }
  }

  const provider = Object.freeze({
    kind: "v4-authenticated-context-provider",
    mode: sourcePreparers.size === 0 ? "conservative-read-only" : "authenticated-read-only",
    preflightComplete: false,
  });
  PROVIDER_STATE.set(provider, {
    inventory,
    inventoryFingerprint: fingerprintInventory(inventory),
    ruleRegistry,
    ruleSnapshot: snapshotRuleRegistry(ruleRegistry),
    sourcePreparers: new Map(sourcePreparers),
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
}) {
  validateBuildInputs({
    inventory,
    evidenceRegistry,
    ruleRegistry,
    prismaCatalog,
    sourceDir,
  });
  const providerState = validateContextProvider(capabilities, inventory, ruleRegistry);
  validateRegistries(inventory, evidenceRegistry, ruleRegistry, prismaCatalog);
  providerState.ruleSnapshot = snapshotRuleRegistry(ruleRegistry);

  const tableMappings = [];
  const destinationMappings = [];
  const columnMappings = [];
  const pendingTables = [];
  const quarantineReasonCounts = new Map();
  const emissionCounts = {};

  for (const sourceInspection of sorted(inventory.tables, ({ sourceTable }) => sourceTable)) {
    const evidence = evidenceRegistry.get(sourceInspection.sourceTable);
    if (evidence.finalStatus === "pending") {
      pendingTables.push({
        ...createPendingMapping(sourceInspection, evidence),
        preflightComplete: false,
      });
      continue;
    }

    validateContextProvider(capabilities, inventory, ruleRegistry);
    const rule = ruleRegistry.get(sourceInspection.sourceTable);
    const stepContracts = new Map(
      rule.destinations.map((destination) => [
        destination.stepId,
        buildDestinationContract(rule, destination),
      ]),
    );
    const counts = createStepCounts(rule);
    const execution = await prepareSourceExecution({
      providerState,
      inventory,
      ruleRegistry,
      sourceInspection,
      rule,
      stepContracts,
    });
    validateContextProvider(capabilities, inventory, ruleRegistry);
    const dumpPath = resolveDumpPath(sourceDir, sourceInspection);
    let readRows = 0;

    if (!execution.executable) {
      for await (const _row of iterateSqlRows(dumpPath)) readRows += 1;
      for (const destination of rule.destinations) {
        const count = counts.get(destination.stepId);
        count.readRows = readRows;
        count.quarantine = readRows;
        recordQuarantineReason(
          quarantineReasonCounts,
          {
            sourceTable: rule.sourceTable,
            stepId: destination.stepId,
            destinationTable: destination.destinationTable,
            field: null,
            reasonCode: execution.reasonCode,
          },
          readRows,
        );
      }
    } else {
      for await (const row of iterateSqlRows(dumpPath)) {
        readRows += 1;
        const context = await issueRowContext(execution, row, readRows);
        const emissions = requireExplicitRowEmissions(rule, rule.emitRows(row, context));
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
      }
    }

    if (readRows !== sourceInspection.rowCount) {
      throw new Error(`Contagem lida diverge do inventário para ${sourceInspection.sourceTable}`);
    }

    const countRows = [...counts.values()];
    const totals = sumCounts(countRows);
    tableMappings.push({
      sourceTable: rule.sourceTable,
      sourceRowCount: sourceInspection.rowCount,
      readRows,
      status: "confirmed",
      reasonCode: evidence.reasonCode,
      reason: evidence.reason,
      domain: rule.domain,
      ruleOrigin: rule.ruleOrigin,
      cardinality: rule.cardinality,
      destinationStepCount: rule.destinations.length,
      dependencies: [...rule.dependencies],
      evidence: copyRuleEvidence(rule.evidence),
      contextProviderMode: capabilities.mode,
      preflightComplete: false,
      prepared: totals.prepared,
      quarantine: totals.quarantine,
      notEmitted: totals.notEmitted,
    });

    for (const destination of rule.destinations) {
      const count = counts.get(destination.stepId);
      const contract = stepContracts.get(destination.stepId);
      const mapping = {
        sourceTable: rule.sourceTable,
        stepId: destination.stepId,
        destinationTable: destination.destinationTable,
        mode: destination.mode,
        identityKind: destination.identity.kind,
        identity: copyStaticValue(destination.identity),
        cardinality: rule.cardinality,
        ruleOrigin: rule.ruleOrigin,
        dependencies: [...destination.dependencies],
        precedence: [...destination.precedence],
        columns: destination.columns.map(copyColumn),
        constants: copyStaticValue(destination.constants),
        defaults: copyStaticValue(destination.defaults),
        contextRequirements: contract.contextRequirements,
        emissionContract: contract.emissionContract,
        readRows: count.readRows,
        prepared: count.prepared,
        quarantine: count.quarantine,
        notEmitted: count.notEmitted,
        preflightComplete: false,
      };
      destinationMappings.push(mapping);
      setEmissionCount(emissionCounts, mapping);

      for (const column of destination.columns) {
        columnMappings.push({
          sourceTable: rule.sourceTable,
          stepId: destination.stepId,
          destinationTable: destination.destinationTable,
          mode: destination.mode,
          ...copyColumn(column),
          ruleOrigin: rule.ruleOrigin,
        });
      }
    }
  }

  const quarantineReasons = sortQuarantineReasons([...quarantineReasonCounts.values()]);
  const result = {
    tableMappings: sortTableMappings(tableMappings),
    destinationMappings: sortDestinationMappings(destinationMappings),
    columnMappings: sortColumnMappings(columnMappings),
    pendingTables: sortTableMappings(pendingTables),
    quarantineReasons,
    emissionCounts,
    quarantineSummary: buildQuarantineSummary(quarantineReasons),
    contextProviderMode: capabilities.mode,
    preflightComplete: false,
    readyForMigration: false,
  };
  assertNoSensitiveValues({ ...result, emissionCounts: undefined });
  validateMappingCompleteness(result, inventory);
  return result;
}

export function validateMappingCompleteness(result, inventory) {
  if (!isObject(result) || !Array.isArray(inventory?.tables)) {
    throw new TypeError("Resultado e inventário são obrigatórios");
  }
  if (result.preflightComplete !== false || result.readyForMigration !== false) {
    throw new Error("Estado de preflight inválido ou incompleto");
  }
  const confirmed = requireArray(result.tableMappings, "tableMappings");
  const pending = requireArray(result.pendingTables, "pendingTables");
  const destinations = requireArray(result.destinationMappings, "destinationMappings");
  const columns = requireArray(result.columnMappings, "columnMappings");
  const reasons = requireArray(result.quarantineReasons, "quarantineReasons");
  const inventoryBySource = new Map(inventory.tables.map((table) => [table.sourceTable, table]));
  const inventorySources = [...inventoryBySource.keys()].sort(compareText);
  assertSameUniqueSources(
    [...confirmed, ...pending].map(({ sourceTable }) => sourceTable).sort(compareText),
    inventorySources,
  );

  const pendingSources = new Set();
  for (const mapping of pending) {
    const source = inventoryBySource.get(mapping.sourceTable);
    if (
      source === undefined ||
      mapping.status !== "pending" ||
      mapping.sourceRowCount !== source.rowCount ||
      mapping.preflightComplete !== false
    ) {
      throw new Error(`Pending mapping inválido: ${String(mapping.sourceTable)}`);
    }
    pendingSources.add(mapping.sourceTable);
  }

  const destinationsBySource = groupBy(destinations, "sourceTable");
  const destinationKeys = new Set();
  const expectedEmissionCounts = {};
  const expectedColumns = [];
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
      destination.prepared + destination.quarantine + destination.notEmitted !== source.rowCount
    ) {
      throw new Error(`Destination mapping incompleto: ${key}`);
    }
    if (
      !isObject(destination.identity) ||
      destination.identity.kind !== destination.identityKind ||
      !Array.isArray(destination.dependencies) ||
      !Array.isArray(destination.precedence) ||
      !Array.isArray(destination.columns) ||
      destination.columns.length === 0 ||
      !isObject(destination.constants) ||
      !isObject(destination.defaults) ||
      !Array.isArray(destination.contextRequirements) ||
      !isObject(destination.emissionContract) ||
      destination.emissionContract.decisionRequiredPerSourceRow !== true ||
      destination.emissionContract.omissionPolicy !== "error"
    ) {
      throw new Error(`Contrato estático do destino inválido: ${key}`);
    }
    for (const column of destination.columns) {
      if (canonicalJson(column) !== canonicalJson(copyColumn(column))) {
        throw new Error(`Column contract inválido: ${key}`);
      }
      expectedColumns.push({
        sourceTable: destination.sourceTable,
        stepId: destination.stepId,
        destinationTable: destination.destinationTable,
        mode: destination.mode,
        ...copyColumn(column),
        ruleOrigin: destination.ruleOrigin,
      });
    }
    setEmissionCount(expectedEmissionCounts, destination);
  }
  if (canonicalJson(expectedEmissionCounts) !== canonicalJson(result.emissionCounts)) {
    throw new Error("EmissionCounts diverge de destinationMappings");
  }
  if (
    canonicalJson(sortColumnMappings(expectedColumns)) !==
    canonicalJson(sortColumnMappings(columns))
  ) {
    throw new Error("ColumnMappings diverge de destinationMappings");
  }

  for (const mapping of confirmed) {
    const source = inventoryBySource.get(mapping.sourceTable);
    const sourceDestinations = destinationsBySource.get(mapping.sourceTable) ?? [];
    const totals = sumCounts(sourceDestinations);
    if (
      source === undefined ||
      mapping.status !== "confirmed" ||
      mapping.sourceRowCount !== source.rowCount ||
      mapping.readRows !== source.rowCount ||
      mapping.destinationStepCount !== sourceDestinations.length ||
      mapping.preflightComplete !== false ||
      sourceDestinations.length === 0 ||
      mapping.prepared !== totals.prepared ||
      mapping.quarantine !== totals.quarantine ||
      mapping.notEmitted !== totals.notEmitted
    ) {
      throw new Error(`Totais da tabela divergem: ${mapping.sourceTable}`);
    }
  }

  const reasonKeys = new Set();
  const quarantineByDestination = new Map();
  const reasonRowsByDestination = new Map();
  for (const reason of reasons) {
    const key = quarantineReasonKey(reason);
    if (reasonKeys.has(key)) throw new Error(`Quarantine reason duplicada: ${key}`);
    reasonKeys.add(key);
    if (!Number.isSafeInteger(reason.count) || reason.count <= 0) {
      throw new Error(`Contagem de quarantine inválida: ${key}`);
    }
    const destination = destinations.find(
      (candidate) => destinationKey(candidate) === destinationKey(reason),
    );
    if (destination === undefined) throw new Error(`Quarantine sem destination: ${key}`);
    const destinationId = destinationKey(reason);
    const reasonRows = (reasonRowsByDestination.get(destinationId) ?? 0) + 1;
    if (reasonRows > MAX_REASONS_PER_STEP) {
      throw new Error(`Quarantine excede limite bounded: ${destinationId}`);
    }
    reasonRowsByDestination.set(destinationId, reasonRows);
    quarantineByDestination.set(
      destinationId,
      (quarantineByDestination.get(destinationId) ?? 0) + reason.count,
    );
  }
  for (const destination of destinations) {
    if (
      (quarantineByDestination.get(destinationKey(destination)) ?? 0) !== destination.quarantine
    ) {
      throw new Error(`Quarantine diverge do destino: ${destinationKey(destination)}`);
    }
  }
  const expectedSummary = buildQuarantineSummary(reasons);
  if (canonicalJson(expectedSummary) !== canonicalJson(result.quarantineSummary)) {
    throw new Error("Resumo de quarantine diverge das razões");
  }
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
    replaceDirectories: ["mapping", "pending-mapping", "quarantine"],
    fileSystem,
  });
}

function validateBuildInputs({
  inventory,
  evidenceRegistry,
  ruleRegistry,
  prismaCatalog,
  sourceDir,
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
    inventory.actualTableCount !== inventory.tables.length ||
    inventory.expectedTableCount !== inventory.tables.length
  ) {
    throw new Error("SourceInventory possui contagem inconsistente");
  }
}

function validateContextProvider(provider, inventory, ruleRegistry) {
  const state = isObject(provider) ? PROVIDER_STATE.get(provider) : undefined;
  if (state === undefined) throw new Error("Provider de contexto autenticado é obrigatório");
  if (
    state.inventory !== inventory ||
    state.ruleRegistry !== ruleRegistry ||
    state.inventoryFingerprint !== fingerprintInventory(inventory)
  ) {
    throw new Error("Provider diverge do inventário ou registry vinculado");
  }
  for (const [sourceTable, snapshot] of state.ruleSnapshot) {
    const rule = ruleRegistry.get(sourceTable);
    if (
      rule !== snapshot.rule ||
      rule.ruleOrigin !== snapshot.ruleOrigin ||
      rule.emitRows !== snapshot.emitRows
    ) {
      throw new Error("Provider diverge do RuleRegistry vinculado");
    }
  }
  return state;
}

function snapshotRuleRegistry(ruleRegistry) {
  return new Map(
    [...ruleRegistry].map(([sourceTable, rule]) => [
      sourceTable,
      { rule, ruleOrigin: rule.ruleOrigin, emitRows: rule.emitRows },
    ]),
  );
}

async function prepareSourceExecution({ providerState, sourceInspection, rule, stepContracts }) {
  const requirements = stableUnique(
    [...stepContracts.values()].flatMap(({ contextRequirements }) => contextRequirements),
  );
  const prepare = providerState.sourcePreparers.get(rule.sourceTable);
  if (prepare === undefined) {
    return {
      executable: false,
      reasonCode:
        requirements.length > 0
          ? "SEMANTIC_CONTEXT_PREFLIGHT_REQUIRED"
          : "RULE_CONTEXT_PREFLIGHT_REQUIRED",
    };
  }
  const prepared = await prepare({
    source: Object.freeze({
      sourceTable: sourceInspection.sourceTable,
      sha256: sourceInspection.sha256,
      rowCount: sourceInspection.rowCount,
    }),
    rule: Object.freeze({
      sourceTable: rule.sourceTable,
      ruleOrigin: rule.ruleOrigin,
      steps: Object.freeze([...stepContracts.keys()]),
    }),
  });
  if (
    !isObject(prepared) ||
    prepared.preflightComplete !== true ||
    typeof prepared.contextForRow !== "function"
  ) {
    throw new Error(`Source preparer incompleto para ${rule.sourceTable}`);
  }
  return {
    executable: true,
    contextForRow: prepared.contextForRow,
    sourceTable: rule.sourceTable,
    sourceDigest: sourceInspection.sha256,
  };
}

async function issueRowContext(execution, row, rowNumber) {
  const supplied = await execution.contextForRow(row, rowNumber);
  if (!isObject(supplied)) throw new Error("Resolver deve retornar contexto por linha");
  for (const [key, value] of Object.entries(supplied)) {
    if (SENSITIVE_CAPABILITY.test(key) && value === true) {
      throw new Error("Capability sensível exige preflight externo autenticado");
    }
  }
  const disabledCapabilities = Object.freeze({
    encryption: false,
    credentialEncryptionVerified: false,
    certificateStorageEncryptionVerified: false,
  });
  return Object.freeze({
    ...supplied,
    ...disabledCapabilities,
    capabilities: disabledCapabilities,
    sourceTable: execution.sourceTable,
    sourceDigest: execution.sourceDigest,
    rowNumber,
  });
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
    validateMappingRule(rule, prismaCatalog);
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

function buildDestinationContract(rule, step) {
  const contextRequirements = detectContextRequirements(rule, step);
  return {
    contextRequirements,
    emissionContract: {
      decisionRequiredPerSourceRow: true,
      omissionPolicy: "error",
      preflightReasonCode:
        contextRequirements.length === 0 ? null : "SEMANTIC_CONTEXT_PREFLIGHT_REQUIRED",
    },
  };
}

function detectContextRequirements(rule, step) {
  const requirements = new Set();
  if (["resolve", "lookup", "aggregate"].includes(step.identity.kind)) {
    requirements.add(`identity:${step.identity.kind}`);
  }
  if (["merge", "lookup", "aggregate"].includes(step.mode)) {
    requirements.add(`mode:${step.mode}`);
  }
  if (rule.dependencies.length > 0 || step.dependencies.length > 0) {
    requirements.add("dependency_resolution");
  }
  if (
    step.columns.some(({ transformation }) =>
      /resolve|lookup|dedup|unique|encrypt|aggregate|parent|existing/i.test(transformation),
    )
  ) {
    requirements.add("transformation_resolution");
  }
  if (step.columns.some(({ sensitivity }) => ["credential", "secret"].includes(sensitivity))) {
    requirements.add("encryption_preflight");
  }
  if (
    step.precedence.some((entry) =>
      /resolve|lookup|dedup|unique|current|existing|canonical|parent/i.test(entry),
    )
  ) {
    requirements.add("precedence_resolution");
  }
  return [...requirements].sort(compareText);
}

function requireExplicitRowEmissions(rule, emissions) {
  if (!Array.isArray(emissions)) throw new TypeError("emitRows deve retornar um array");
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
      },
    ]),
  );
}

function recordQuarantineReason(registry, reason, increment = 1) {
  if (increment === 0) return;
  const key = quarantineReasonKey(reason);
  const existing = registry.get(key);
  if (existing !== undefined) {
    existing.count += increment;
    return;
  }
  const perStep = [...registry.values()].filter(
    (item) => destinationKey(item) === destinationKey(reason),
  ).length;
  if (perStep >= MAX_REASONS_PER_STEP) {
    throw new Error(
      `Quantidade de razões excedeu o limite para ${reason.sourceTable}.${reason.stepId}`,
    );
  }
  registry.set(key, { ...reason, count: increment });
}

function resolveDumpPath(sourceDir, inspection) {
  const sourceRoot = path.resolve(sourceDir);
  const dumpPath = path.resolve(sourceRoot, inspection.relativePath ?? inspection.fileName);
  if (dumpPath !== sourceRoot && !dumpPath.startsWith(`${sourceRoot}${path.sep}`)) {
    throw new Error("Caminho de dump fora do diretório de origem");
  }
  return dumpPath;
}

function setEmissionCount(registry, count) {
  registry[count.sourceTable] ??= {};
  registry[count.sourceTable][count.stepId] = {
    destinationTable: count.destinationTable,
    readRows: count.readRows,
    prepared: count.prepared,
    quarantine: count.quarantine,
    notEmitted: count.notEmitted,
  };
}

function buildArtifacts(result) {
  const tables = sortTableMappings(result.tableMappings ?? []);
  const destinations = sortDestinationMappings(result.destinationMappings ?? []);
  const columns = sortColumnMappings(result.columnMappings ?? []);
  const pending = sortTableMappings(result.pendingTables ?? []);
  const reasons = sortQuarantineReasons(result.quarantineReasons ?? []);
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
  files.set("quarantine/summary.json", serializeStableJson(result.quarantineSummary));
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
    contextRequirements: row.contextRequirements.join("|"),
    emissionContract: JSON.stringify(row.emissionContract),
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
    }),
    { prepared: 0, quarantine: 0, notEmitted: 0 },
  );
}

function validCounts(mapping) {
  return [mapping.readRows, mapping.prepared, mapping.quarantine, mapping.notEmitted].every(
    (value) => Number.isSafeInteger(value) && value >= 0,
  );
}

function copyRuleEvidence(evidence) {
  return { legacy: [...evidence.legacy], current: [...evidence.current] };
}

function copyColumn(column) {
  return {
    sourceColumn: column.sourceColumn,
    destinationColumn: column.destinationColumn,
    status: column.status,
    transformation: column.transformation,
    nullHandling: column.nullHandling,
    referenceRole: column.referenceRole,
    sensitivity: column.sensitivity,
    reason: column.reason,
  };
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

function fingerprintInventory(inventory) {
  return crypto
    .createHash("sha256")
    .update(
      canonicalJson({
        actualTableCount: inventory.actualTableCount,
        expectedTableCount: inventory.expectedTableCount,
        sourceDigest: inventory.sourceDigest,
        tables: inventory.tables.map(({ sourceTable, sha256, rowCount }) => ({
          sourceTable,
          sha256,
          rowCount,
        })),
      }),
    )
    .digest("hex");
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

function stableUnique(values) {
  return [...new Set(values)].sort(compareText);
}

function requireArray(value, field) {
  if (!Array.isArray(value)) throw new TypeError(`${field} deve ser array`);
  return value;
}

function toCountField(status) {
  if (!EMISSION_STATUSES.includes(status)) throw new Error(`Status de emissão inválido: ${status}`);
  return status === "not_emitted" ? "notEmitted" : status;
}

function isObject(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function compareText(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
}

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
  "contextProviderMode",
  "preflightComplete",
  "prepared",
  "quarantine",
  "notEmitted",
];
const DESTINATION_COLUMNS = [
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
  "contextRequirements",
  "emissionContract",
  "readRows",
  "prepared",
  "quarantine",
  "notEmitted",
  "preflightComplete",
];
const COLUMN_COLUMNS = [
  "sourceTable",
  "stepId",
  "destinationTable",
  "mode",
  "sourceColumn",
  "destinationColumn",
  "status",
  "transformation",
  "nullHandling",
  "referenceRole",
  "sensitivity",
  "ruleOrigin",
  "reason",
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
const QUARANTINE_COLUMNS = [
  "sourceTable",
  "stepId",
  "destinationTable",
  "field",
  "reasonCode",
  "count",
];
