import crypto from "node:crypto";
import { lstat, readFile, realpath } from "node:fs/promises";
import path from "node:path";

import { assertNoSensitiveSerializedContent } from "./sensitivity.mjs";

const SOURCE_NAME = /^[A-Za-z0-9_.-]+$/;
const COLUMN_NAME = /^[\p{L}\p{N}_.-]+$/u;
const VERSION_NAME = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/;
const DIGEST = /^[a-f0-9]{64}$/;
const SAFE_REFERENCE = /^[A-Za-z0-9_./:# -]+$/;
const DECISION_STATUSES = new Set(["confirmed", "pending"]);
const DECISION_COMPARISON_STATUSES = Object.freeze([
  "reused",
  "corrected",
  "invalidated",
  "new",
  "missing",
  "conflict",
]);
const MAX_JSON_DEPTH = 16;
const MAX_JSON_NODES = 20_000;
const MAX_JSON_KEYS = 10_000;
const MAX_JSON_STRING_LENGTH = 4_096;
const MAX_TEXT_LINES = 5_000;
const MAX_TEXT_LINE_LENGTH = 2_048;
const MAX_CSV_ROWS = 1_024;
const MAX_CSV_CELL_LENGTH = 512;
const V3_SEMANTIC_FINGERPRINT = "320c209f4a99c670285526b7a8f795f85484542edd7a91f378ec44c6a81582d1";
const COMPARISON_PROVENANCE = new WeakMap();
const REPORT_PROVENANCE = new WeakMap();
const ALLOWED_ARTIFACTS = Object.freeze([
  {
    format: "csv",
    maximumBytes: 256 * 1024,
    origin: "v2/confirmed-table-destinations.csv",
    parser: parseV2ConfirmedDestinations,
    version: "v2",
  },
  {
    format: "json",
    maximumBytes: 256 * 1024,
    origin: "v2/manifest.json",
    parser: parseV2Manifest,
    version: "v2",
  },
  {
    format: "json",
    maximumBytes: 512 * 1024,
    origin: "v2/pending-mapping/tables-without-confirmed-destination.json",
    parser: parseV2Pending,
    version: "v2",
  },
  {
    format: "md",
    maximumBytes: 512 * 1024,
    origin: "v3/rh-pessoal-dry-run.md",
    parser: parseV3DryRun,
    version: "v3",
  },
]);

const V2_SOURCE_ROW_TABLES = Object.freeze({
  adminUsers: "tb_admin.usuarios",
  integracaoClients: "tb_integracao.clientes",
  projectPlans: "tb_integracao.planos",
  projectPlanTasks: "tb_integracao.tarefas_planos",
  projects: "tb_integracao.prospeccao_comercial",
  regularizeClients: "tb_regularize.clientes",
  rhCollaborators: "tb_rh.colaboradores",
  taskModels: "tb_integracao.tarefas_express",
  tasks: "tb_integracao.tarefas",
});

export function comparePreviousMappings({
  currentInventory,
  historicalInventories,
  evidenceRegistry,
  ruleRegistry,
  previousArtifacts,
}) {
  const current = normalizeCurrentInventory(currentInventory);
  const historicalNormalization = normalizeHistoricalInventories(historicalInventories);
  const histories = historicalNormalization.values;
  const evidence = normalizeRegistry(evidenceRegistry, "EvidenceRegistry");
  const rules = normalizeRegistry(ruleRegistry, "RuleRegistry");
  const previousNormalization = normalizePreviousArtifacts(previousArtifacts);
  const previous = previousNormalization.values;
  const previousIndex = indexPreviousDecisions(previous);
  const previousBySource = previousIndex.bySource;
  const artifactCountIndex = indexArtifactCounts(previous);
  const artifactCountsBySource = artifactCountIndex.bySource;

  const issues = [
    ...historicalNormalization.issues,
    ...previousNormalization.issues,
    ...previousIndex.issues,
    ...artifactCountIndex.issues,
  ];
  issues.sort(compareIssues);

  const currentBySource = new Map(
    current.tables.map((currentTable) => [currentTable.sourceTable, currentTable]),
  );
  const allSources = new Set(currentBySource.keys());
  for (const history of histories) {
    for (const table of history.tables) allSources.add(table.sourceTable);
  }
  for (const sourceTable of previousBySource.keys()) allSources.add(sourceTable);
  for (const sourceTable of artifactCountsBySource.keys()) allSources.add(sourceTable);

  const tables = [...allSources].sort(compareText).map((sourceTable) => {
    const currentTable = currentBySource.get(sourceTable);
    const previousDecisions = previousBySource.get(sourceTable) ?? [];
    const historicalConflict = previousIndex.conflictSources.has(sourceTable);
    if (currentTable === undefined) {
      return buildMissingCurrentTable({
        sourceTable,
        histories,
        previousDecisions,
        historicalCounts: artifactCountsBySource.get(sourceTable) ?? [],
        historicalConflict,
      });
    }
    const currentEvidence = evidence.get(currentTable.sourceTable);
    if (currentEvidence === undefined) {
      throw new Error(`EvidenceDecision atual ausente: ${currentTable.sourceTable}`);
    }
    const currentRule = rules.get(currentTable.sourceTable) ?? null;
    validateCurrentAuthority(currentTable.sourceTable, currentEvidence, currentRule);
    const currentDecision = buildCurrentDecision(
      currentTable.sourceTable,
      currentEvidence,
      currentRule,
    );
    guardedSemanticReason(currentTable.sourceTable, currentDecision);
    const artifactCountComparisons = (
      artifactCountsBySource.get(currentTable.sourceTable) ?? []
    ).map((historicalCount) => compareArtifactCount(currentTable, historicalCount));
    const inventoryComparisons = histories.map((history) =>
      compareInventoryTable(currentTable, history),
    );
    return {
      sourceTable: currentTable.sourceTable,
      currentInventory: {
        columns: currentTable.columns,
        digest: currentTable.sha256,
        rowCount: currentTable.rowCount,
      },
      inventoryComparisons,
      artifactCountComparisons,
      previousDecisions,
      currentDecision,
      decision: compareSemanticDecision({
        sourceTable: currentTable.sourceTable,
        currentDecision,
        previousDecisions,
        historicalConflict,
      }),
    };
  });

  const comparison = {
    schemaVersion: 1,
    currentInventory: {
      digest: current.digest,
      version: current.version,
    },
    historicalSources: histories.map(({ digest, origin, version }) => ({
      digest,
      origin,
      version,
    })),
    artifactSources: previous.map(
      ({ digest, format, origin, semanticAvailability, sizeBytes, version }) => ({
        digest,
        format,
        origin,
        version,
        sizeBytes,
        semanticAvailability,
      }),
    ),
    summary: buildSummary(tables, histories),
    issues,
    tables,
  };
  const frozen = deepFreeze(comparison);
  COMPARISON_PROVENANCE.set(frozen, {
    inventoryRef: currentInventory,
    inventoryDigest: sha256(canonicalJson(currentInventory)),
  });
  return frozen;
}

export function createAuthenticatedPreviousMappingReport({ comparison, availability, issues }) {
  const provenance = isRecord(comparison) ? COMPARISON_PROVENANCE.get(comparison) : undefined;
  if (provenance === undefined) {
    throw new Error("Comparação autenticada é obrigatória para finalizar o relatório");
  }
  if (!Object.isFrozen(comparison)) {
    throw new Error("Comparação autenticada foi adulterada");
  }
  if (!["not_requested", "available", "partial", "unavailable"].includes(availability)) {
    throw new TypeError("Disponibilidade histórica inválida");
  }
  assertNoSensitiveSerializedContent(JSON.stringify({ availability, comparison, issues }));
  const normalizedIssues = normalizeReportIssues(issues);
  const knownIssueSignatures = new Set(normalizedIssues.map(issueSignature));
  if (comparison.issues.some((issue) => !knownIssueSignatures.has(issueSignature(issue)))) {
    throw new Error("Relatório não pode omitir issues produzidas pela comparação");
  }
  const hasHistoricalData =
    comparison.historicalSources.length > 0 || comparison.artifactSources.length > 0;
  const expectedAvailability =
    normalizedIssues.length === 0
      ? hasHistoricalData
        ? "available"
        : "not_requested"
      : hasHistoricalData
        ? "partial"
        : "unavailable";
  if (availability !== expectedAvailability) {
    throw new Error("Disponibilidade diverge das fontes e issues históricas");
  }
  const report = { ...comparison, availability, issues: normalizedIssues };
  const frozen = deepFreeze(report);
  REPORT_PROVENANCE.set(frozen, {
    ...provenance,
    reportDigest: sha256(canonicalJson(frozen)),
  });
  return frozen;
}

export function validateAuthenticatedPreviousMappingReport(report, inventory) {
  const provenance = isRecord(report) ? REPORT_PROVENANCE.get(report) : undefined;
  if (provenance === undefined) {
    throw new Error("Relatório histórico autenticado com proveniência é obrigatório");
  }
  if (
    provenance.inventoryRef !== inventory ||
    provenance.inventoryDigest !== sha256(canonicalJson(inventory))
  ) {
    throw new Error("Inventário do relatório diverge do MappingResult autenticado");
  }
  if (!Object.isFrozen(report) || provenance.reportDigest !== sha256(canonicalJson(report))) {
    throw new Error("Relatório histórico autenticado foi adulterado");
  }
  validateReportCoverage(report, normalizeCurrentInventory(inventory));
  return true;
}

export async function loadPreviousMappingArtifacts({ previousDocsDir }) {
  const root = await assertRealConfinedRoot(previousDocsDir);
  const artifacts = [];
  const issues = [];
  const protectedPaths = [];
  for (const descriptor of ALLOWED_ARTIFACTS) {
    const absolutePath = path.join(root, ...descriptor.origin.split("/"));
    try {
      const loaded = await readAllowListedArtifact(absolutePath, root, descriptor);
      protectedPaths.push(loaded.canonicalPath);
      const parsed = descriptor.parser(loaded.content, { digest: loaded.digest });
      artifacts.push({
        version: descriptor.version,
        origin: descriptor.origin,
        digest: loaded.digest,
        sizeBytes: loaded.sizeBytes,
        format: descriptor.format,
        semanticAvailability: parsed.semanticAvailability ?? "available",
        decisions: parsed.decisions,
        inventoryCounts: parsed.inventoryCounts,
      });
      for (const reasonCode of parsed.issueReasonCodes ?? []) {
        issues.push(artifactIssue(descriptor, reasonCode));
      }
    } catch (error) {
      if (typeof error?.protectedPath === "string") protectedPaths.push(error.protectedPath);
      issues.push(
        artifactIssue(descriptor, error?.reasonCode ?? "ARTIFACT_INVALID_OR_UNAVAILABLE"),
      );
    }
  }
  artifacts.sort((left, right) => compareText(left.origin, right.origin));
  issues.sort(compareIssues);
  protectedPaths.sort(compareText);
  return { artifacts, issues, protectedPaths: [...new Set(protectedPaths)] };
}

function artifactIssue(descriptor, reasonCode) {
  return {
    scope: descriptor.origin,
    version: descriptor.version,
    reasonCode,
  };
}

function normalizeCurrentInventory(inventory) {
  if (!isRecord(inventory) || !Array.isArray(inventory.tables)) {
    throw new TypeError("Inventário atual inválido");
  }
  const version = normalizeVersion(inventory.sourceDirectoryLabel, "current");
  const digest = normalizeDigest(inventory.sourceDigest, "currentInventory.sourceDigest");
  return {
    version,
    digest,
    tables: normalizeInventoryTables(inventory.tables, "inventário atual"),
  };
}

function normalizeHistoricalInventories(inventories) {
  if (!Array.isArray(inventories)) {
    throw new TypeError("historicalInventories deve ser array");
  }
  const values = [];
  const issues = [];
  for (const [index, entry] of inventories.entries()) {
    try {
      if (!isRecord(entry) || !isRecord(entry.inventory)) {
        throw new TypeError("Inventário histórico exige version, origin, digest e inventory");
      }
      const version = normalizeVersion(entry.version, "historical version");
      const origin = normalizeOrigin(entry.origin);
      const digest = normalizeDigest(entry.digest, "historical digest");
      const inventoryLabel = normalizeVersion(
        entry.inventory.sourceDirectoryLabel,
        "historical inventory.sourceDirectoryLabel",
      );
      const inventoryDigest = normalizeDigest(
        entry.inventory.sourceDigest,
        "historical inventory.sourceDigest",
      );
      const tables = normalizeInventoryTables(entry.inventory.tables, `inventário ${version}`);
      if (
        version !== inventoryLabel ||
        origin !== `backup/${version}` ||
        digest !== inventoryDigest ||
        digest !== createInventoryDigest(tables) ||
        values.some((known) => known.version === version)
      ) {
        throw new Error("Provenance histórica divergente");
      }
      values.push({ version, origin, digest, tables });
    } catch {
      issues.push({
        scope: `historical-inventory-${index + 1}`,
        reasonCode: "HISTORICAL_INVENTORY_PROVENANCE_CONFLICT",
      });
    }
  }
  values.sort((left, right) => compareText(left.version, right.version));
  issues.sort(compareIssues);
  return { values, issues };
}

function createInventoryDigest(tables) {
  const canonicalContent = tables
    .map((table) => `${table.sourceTable}\t${table.sha256}\t${table.rowCount}`)
    .join("\n");
  return sha256(canonicalContent);
}

function normalizeInventoryTables(tables, label) {
  if (!Array.isArray(tables)) throw new TypeError(`${label} sem tables`);
  const normalized = tables.map((entry) => {
    if (!isRecord(entry)) throw new TypeError(`${label} contém tabela inválida`);
    const sourceTable = normalizeSourceName(entry.sourceTable, `${label}.sourceTable`);
    if (!Array.isArray(entry.columns)) throw new TypeError(`${sourceTable} sem columns`);
    const columns = entry.columns.map((column) =>
      normalizeColumnName(column, `${sourceTable}.column`),
    );
    columns.sort(compareText);
    assertUnique(columns, (column) => column, `Coluna duplicada em ${sourceTable}`);
    if (!Number.isSafeInteger(entry.rowCount) || entry.rowCount < 0) {
      throw new TypeError(`rowCount inválido em ${sourceTable}`);
    }
    return {
      sourceTable,
      columns,
      rowCount: entry.rowCount,
      sha256: normalizeDigest(entry.sha256, `${sourceTable}.sha256`),
    };
  });
  normalized.sort((left, right) => compareText(left.sourceTable, right.sourceTable));
  assertUnique(
    normalized,
    ({ sourceTable }) => sourceTable.toLocaleLowerCase("en-US"),
    `sourceTable duplicada no ${label}`,
  );
  return normalized;
}

function normalizePreviousArtifacts(artifacts) {
  if (!Array.isArray(artifacts)) throw new TypeError("previousArtifacts deve ser array");
  const values = [];
  const issues = [];
  for (const [index, artifact] of artifacts.entries()) {
    try {
      if (!isRecord(artifact)) throw new TypeError("Artefato histórico inválido");
      const version = normalizeVersion(artifact.version, "artifact.version");
      const origin = normalizeOrigin(artifact.origin);
      const digest = normalizeDigest(artifact.digest, "artifact.digest");
      if (!origin.startsWith(`${version}/`)) {
        throw new TypeError("Versão e origem histórica divergentes");
      }
      if (!["csv", "json", "md"].includes(artifact.format)) {
        throw new TypeError("Formato histórico não allow-listed");
      }
      if (!Number.isSafeInteger(artifact.sizeBytes) || artifact.sizeBytes <= 0) {
        throw new TypeError("Tamanho histórico inválido");
      }
      if (!["available", "metrics_only"].includes(artifact.semanticAvailability)) {
        throw new TypeError("Disponibilidade semântica histórica inválida");
      }
      if (!Array.isArray(artifact.decisions) || !Array.isArray(artifact.inventoryCounts)) {
        throw new TypeError("Shape histórico inválido");
      }
      values.push({
        version,
        origin,
        digest,
        sizeBytes: artifact.sizeBytes,
        format: artifact.format,
        semanticAvailability: artifact.semanticAvailability,
        decisions: artifact.decisions.map((decision) =>
          normalizePreviousDecision(decision, { digest, origin, version }),
        ),
        inventoryCounts: artifact.inventoryCounts.map(normalizeInventoryCount),
      });
    } catch {
      issues.push({
        scope: `historical-artifact-${index + 1}`,
        reasonCode: "HISTORICAL_ARTIFACT_PROVENANCE_CONFLICT",
      });
    }
  }
  values.sort((left, right) => compareText(left.origin, right.origin));
  issues.sort(compareIssues);
  return { values, issues };
}

function normalizePreviousDecision(decision, provenance) {
  if (!isRecord(decision)) throw new TypeError("Decisão histórica inválida");
  const sourceTable = normalizeSourceName(decision.sourceTable, "previous sourceTable");
  if (!DECISION_STATUSES.has(decision.status)) {
    throw new TypeError(`Status histórico inválido: ${sourceTable}`);
  }
  if (!Array.isArray(decision.destinations)) {
    throw new TypeError(`Destinos históricos inválidos: ${sourceTable}`);
  }
  const destinations = decision.destinations.map((destination) => {
    if (!isRecord(destination)) throw new TypeError("Destino histórico inválido");
    return {
      destinationTable: normalizeSourceName(
        destination.destinationTable,
        "previous destinationTable",
      ),
    };
  });
  destinations.sort((left, right) => compareText(left.destinationTable, right.destinationTable));
  assertUnique(
    destinations,
    ({ destinationTable }) => destinationTable,
    `Destino histórico duplicado em ${sourceTable}`,
  );
  if (decision.status === "confirmed" && destinations.length === 0) {
    throw new TypeError(`Decisão histórica confirmed sem destino: ${sourceTable}`);
  }
  if (decision.status === "pending" && destinations.length !== 0) {
    throw new TypeError(`Decisão histórica pending não pode sugerir destino: ${sourceTable}`);
  }
  return {
    sourceTable,
    status: decision.status,
    destinations,
    provenance,
  };
}

function normalizeInventoryCount(count) {
  if (!isRecord(count)) throw new TypeError("Contagem histórica inválida");
  const sourceTable = normalizeSourceName(count.sourceTable, "inventoryCount.sourceTable");
  if (!Number.isSafeInteger(count.rowCount) || count.rowCount < 0) {
    throw new TypeError(`Contagem histórica inválida: ${sourceTable}`);
  }
  return { sourceTable, rowCount: count.rowCount };
}

function indexPreviousDecisions(artifacts) {
  const bySource = new Map();
  const signaturesByVersionAndSource = new Map();
  const seenDecisions = new Set();
  for (const artifact of artifacts) {
    for (const decision of artifact.decisions) {
      const signature = canonicalJson({
        status: decision.status,
        destinations: decision.destinations,
      });
      const versionAndSource = `${decision.provenance.version}\0${decision.sourceTable}`;
      if (!signaturesByVersionAndSource.has(versionAndSource)) {
        signaturesByVersionAndSource.set(versionAndSource, new Set());
      }
      const signatures = signaturesByVersionAndSource.get(versionAndSource);
      signatures.add(signature);
      const decisionKey = `${versionAndSource}\0${signature}`;
      if (seenDecisions.has(decisionKey)) continue;
      seenDecisions.add(decisionKey);
      const normalized = {
        version: decision.provenance.version,
        origin: decision.provenance.origin,
        digest: decision.provenance.digest,
        status: decision.status,
        destinationTables: decision.destinations.map(({ destinationTable }) => destinationTable),
      };
      if (!bySource.has(decision.sourceTable)) bySource.set(decision.sourceTable, []);
      bySource.get(decision.sourceTable).push(normalized);
    }
  }
  for (const decisions of bySource.values()) {
    decisions.sort(compareHistoricalDecisions);
  }
  const conflictEntries = [...signaturesByVersionAndSource]
    .filter(([, signatures]) => signatures.size > 1)
    .map(([versionAndSource]) => {
      const [version, sourceTable] = versionAndSource.split("\0");
      return { sourceTable, version };
    });
  const issueSources = new Set(conflictEntries.map(({ sourceTable }) => sourceTable));
  const conflictSources = new Set(
    conflictEntries
      .filter(({ sourceTable, version }) => {
        const latest = bySource.get(sourceTable)?.at(-1);
        return latest?.version === version;
      })
      .map(({ sourceTable }) => sourceTable),
  );
  const issues = [...issueSources]
    .map((sourceTable) => ({
      scope: sourceTable,
      reasonCode: "HISTORICAL_DECISION_CONFLICT",
    }))
    .sort(compareIssues);
  return { bySource, conflictSources, issues };
}

function compareHistoricalDecisions(left, right) {
  const versionOrder = compareHistoricalVersions(left.version, right.version);
  if (versionOrder !== 0) return versionOrder;
  return compareText(
    `${left.origin}\0${left.digest}\0${left.status}\0${left.destinationTables.join("\0")}`,
    `${right.origin}\0${right.digest}\0${right.status}\0${right.destinationTables.join("\0")}`,
  );
}

function compareHistoricalVersions(left, right) {
  const leftMatch = left.match(/^v([0-9]+)$/);
  const rightMatch = right.match(/^v([0-9]+)$/);
  if (leftMatch !== null && rightMatch !== null) {
    return Number(leftMatch[1]) - Number(rightMatch[1]);
  }
  return compareText(left, right);
}

function indexArtifactCounts(artifacts) {
  const bySource = new Map();
  const signaturesByVersionAndSource = new Map();
  for (const artifact of artifacts) {
    for (const count of artifact.inventoryCounts) {
      const key = `${artifact.version}\0${count.sourceTable}`;
      if (!signaturesByVersionAndSource.has(key)) {
        signaturesByVersionAndSource.set(key, new Set());
      }
      const signatures = signaturesByVersionAndSource.get(key);
      if (signatures.has(count.rowCount)) continue;
      signatures.add(count.rowCount);
      const normalized = {
        version: artifact.version,
        origin: artifact.origin,
        digest: artifact.digest,
        sourceTable: count.sourceTable,
        rowCount: count.rowCount,
      };
      if (!bySource.has(count.sourceTable)) bySource.set(count.sourceTable, []);
      bySource.get(count.sourceTable).push(normalized);
    }
  }
  for (const counts of bySource.values()) {
    counts.sort((left, right) =>
      compareText(
        `${left.version}\0${left.origin}\0${left.digest}\0${left.rowCount}`,
        `${right.version}\0${right.origin}\0${right.digest}\0${right.rowCount}`,
      ),
    );
  }
  const conflictSources = new Set(
    [...signaturesByVersionAndSource]
      .filter(([, signatures]) => signatures.size > 1)
      .map(([key]) => key.split("\0")[1]),
  );
  const issues = [...conflictSources]
    .map((sourceTable) => ({
      scope: sourceTable,
      reasonCode: "HISTORICAL_COUNT_CONFLICT",
    }))
    .sort(compareIssues);
  return { bySource, conflictSources, issues };
}

function normalizeRegistry(registry, label) {
  if (!(registry instanceof Map)) throw new TypeError(`${label} deve ser Map`);
  return registry;
}

function validateCurrentAuthority(sourceTable, evidence, rule) {
  if (!isRecord(evidence) || evidence.sourceTable !== sourceTable) {
    throw new Error(`EvidenceDecision atual divergente: ${sourceTable}`);
  }
  if (!DECISION_STATUSES.has(evidence.finalStatus)) {
    throw new Error(`Status atual inválido: ${sourceTable}`);
  }
  if (evidence.finalStatus === "confirmed") {
    if (rule === null || rule.sourceTable !== sourceTable || evidence.ruleId !== rule.ruleOrigin) {
      throw new Error(`RuleRegistry atual divergente: ${sourceTable}`);
    }
  } else if (rule !== null) {
    throw new Error(`Origem pending não pode possuir regra atual: ${sourceTable}`);
  }
}

function buildCurrentDecision(sourceTable, evidence, rule) {
  const evidenceRefs = [
    ...normalizeEvidenceReferences(evidence.legacyReferences, `${sourceTable}.legacyReferences`),
    ...normalizeEvidenceReferences(
      evidence.currentContractEvidence,
      `${sourceTable}.currentContractEvidence`,
    ),
  ];
  if (rule === null) {
    return {
      status: "pending",
      reasonCode: normalizeReasonCode(evidence.reasonCode),
      ruleId: null,
      ruleDigest: null,
      destinationTables: [],
      identityDecisions: [],
      securityDecisions: [],
      evidenceRefs,
    };
  }
  if (!Array.isArray(rule.destinations) || rule.destinations.length === 0) {
    throw new Error(`Regra atual sem destinos: ${sourceTable}`);
  }
  const destinationTables = [...new Set(rule.destinations.map(normalizeDestinationTable))].sort(
    compareText,
  );
  const identityDecisions = rule.destinations.map((step) =>
    normalizeIdentityDecision(sourceTable, step),
  );
  const securityDecisions = extractSecurityDecisions(rule);
  const semanticContract = rule.destinations.map((step) => ({
    stepId: normalizeSourceName(step.stepId, "current stepId"),
    destinationTable: normalizeDestinationTable(step),
    mode: normalizeSourceName(step.mode, "current mode"),
    identity: identityDecisions.find(({ stepId }) => stepId === step.stepId),
    columns: normalizeCurrentColumns(step.columns),
  }));
  semanticContract.sort((left, right) => compareText(left.stepId, right.stepId));
  return {
    status: "confirmed",
    reasonCode: normalizeReasonCode(evidence.reasonCode),
    ruleId: normalizeReference(rule.ruleOrigin),
    ruleDigest: sha256(canonicalJson(semanticContract)),
    destinationTables,
    identityDecisions,
    securityDecisions,
    evidenceRefs,
    stepCount: semanticContract.length,
  };
}

function normalizeDestinationTable(step) {
  if (!isRecord(step)) throw new TypeError("DestinationStep atual inválido");
  return normalizeSourceName(step.destinationTable, "current destinationTable");
}

function normalizeIdentityDecision(sourceTable, step) {
  const stepId = normalizeSourceName(step.stepId, "current stepId");
  if (!isRecord(step.identity)) throw new TypeError(`IdentitySpec ausente: ${sourceTable}`);
  if (step.identity.kind === "resolve") {
    return {
      kind: "resolve",
      legacyColumn: normalizeSourceName(step.identity.sourceColumn, "identity.sourceColumn"),
      sourceTable: normalizeSourceName(step.identity.sourceTable, "identity.sourceTable"),
      stepId,
      targetLegacyColumn: normalizeSourceName(
        step.identity.targetLegacyColumn,
        "identity.targetLegacyColumn",
      ),
    };
  }
  if (step.identity.kind === "generate") {
    return {
      kind: "generate",
      legacyColumn: normalizeSourceName(step.identity.legacyColumn, "identity.legacyColumn"),
      sourceTable,
      stepId,
    };
  }
  if (step.identity.kind === "aggregate") {
    return {
      kind: "aggregate",
      legacyColumn: normalizeSourceName(step.identity.childForeignKey, "identity.childForeignKey"),
      sourceTable: normalizeSourceName(
        step.identity.parentSourceTable,
        "identity.parentSourceTable",
      ),
      stepId,
      targetLegacyColumn: normalizeSourceName(
        step.identity.parentLegacyColumn,
        "identity.parentLegacyColumn",
      ),
    };
  }
  if (step.identity.kind === "lookup") {
    return { kind: "lookup", legacyColumn: null, sourceTable, stepId };
  }
  throw new TypeError(`IdentitySpec atual inválida: ${sourceTable}`);
}

function normalizeCurrentColumns(columns) {
  if (!Array.isArray(columns)) throw new TypeError("ColumnRule atual ausente");
  return columns
    .map((column) => {
      if (!isRecord(column)) throw new TypeError("ColumnRule atual inválida");
      return {
        sourceColumn:
          column.sourceColumn === null
            ? null
            : normalizeSourceName(column.sourceColumn, "ColumnRule.sourceColumn"),
        destinationColumn:
          column.destinationColumn === null
            ? null
            : normalizeSourceName(column.destinationColumn, "ColumnRule.destinationColumn"),
        status: normalizeSourceName(column.status, "ColumnRule.status"),
        transformation: normalizeSourceName(column.transformation, "ColumnRule.transformation"),
      };
    })
    .sort((left, right) =>
      compareText(
        `${left.sourceColumn ?? ""}\0${left.destinationColumn ?? ""}\0${left.transformation}`,
        `${right.sourceColumn ?? ""}\0${right.destinationColumn ?? ""}\0${right.transformation}`,
      ),
    );
}

function extractSecurityDecisions(rule) {
  return rule.destinations
    .flatMap((step) => step.columns ?? [])
    .filter(
      (column) =>
        column.sourceColumn === "password" ||
        column.destinationColumn === "password" ||
        String(column.transformation).includes("bcrypt"),
    )
    .map((column) => ({
      destinationColumn: normalizeSourceName(
        column.destinationColumn,
        "security destinationColumn",
      ),
      sourceColumn: normalizeSourceName(column.sourceColumn, "security sourceColumn"),
      transformation: normalizeSourceName(column.transformation, "security transformation"),
    }))
    .sort((left, right) => compareText(left.destinationColumn, right.destinationColumn));
}

function buildMissingCurrentTable({
  sourceTable,
  histories,
  previousDecisions,
  historicalCounts,
  historicalConflict,
}) {
  const inventoryComparisons = histories.map((history) =>
    compareMissingInventoryTable(sourceTable, history),
  );
  const artifactCountComparisons = historicalCounts.map((historicalCount) => ({
    currentRowCount: null,
    delta: null,
    digest: historicalCount.digest,
    evidenceRefs: [`${historicalCount.origin}#${sourceTable}`],
    historicalRowCount: historicalCount.rowCount,
    origin: historicalCount.origin,
    reasonCode: "CURRENT_TABLE_NOT_PRESENT",
    version: historicalCount.version,
  }));
  const evidenceRefs = [
    ...inventoryComparisons
      .filter(({ present }) => present)
      .flatMap(({ evidenceRefs: references }) => references),
    ...artifactCountComparisons.flatMap(({ evidenceRefs: references }) => references),
    ...previousDecisions.map(({ digest, origin }) => `${origin}#${sourceTable}@${digest}`),
  ];
  const provenance = [
    ...histories
      .filter((history) => history.tables.some((table) => table.sourceTable === sourceTable))
      .map(({ digest, origin, version }) => ({ digest, origin, version })),
    ...previousDecisions.map(({ digest, origin, version }) => ({ digest, origin, version })),
  ];
  const reasonCode = historicalConflict
    ? "HISTORICAL_ARTIFACT_CONFLICT_CURRENT_TABLE_MISSING"
    : "CURRENT_TABLE_MISSING_FROM_INVENTORY";
  return {
    sourceTable,
    currentInventory: null,
    inventoryComparisons,
    artifactCountComparisons,
    previousDecisions,
    currentDecision: null,
    decision: decisionResult(
      historicalConflict ? "conflict" : "missing",
      reasonCode,
      evidenceRefs,
      deduplicateProvenance(provenance),
    ),
  };
}

function compareMissingInventoryTable(sourceTable, history) {
  const historicalTable = history.tables.find((table) => table.sourceTable === sourceTable);
  if (historicalTable === undefined) {
    return {
      version: history.version,
      origin: history.origin,
      digest: history.digest,
      present: false,
      addedColumns: [],
      removedColumns: [],
      rowCount: { current: null, delta: null, historical: null },
      hashChanged: null,
      reasonCodes: ["BACKUP_TABLE_NOT_PRESENT"],
      evidenceRefs: [],
    };
  }
  return {
    version: history.version,
    origin: history.origin,
    digest: history.digest,
    present: true,
    addedColumns: [],
    removedColumns: historicalTable.columns,
    rowCount: { current: null, delta: null, historical: historicalTable.rowCount },
    hashChanged: null,
    reasonCodes: ["CURRENT_TABLE_NOT_PRESENT"],
    evidenceRefs: [`${history.origin}#${sourceTable}`],
  };
}

function compareInventoryTable(currentTable, history) {
  const historicalTable = history.tables.find(
    ({ sourceTable }) => sourceTable === currentTable.sourceTable,
  );
  if (historicalTable === undefined) {
    return {
      version: history.version,
      origin: history.origin,
      digest: history.digest,
      present: false,
      addedColumns: [],
      removedColumns: [],
      rowCount: { current: currentTable.rowCount, delta: null, historical: null },
      hashChanged: null,
      reasonCodes: ["BACKUP_TABLE_NOT_PRESENT"],
      evidenceRefs: inventoryEvidenceRefs(currentTable, history),
    };
  }
  const currentColumns = new Set(currentTable.columns);
  const historicalColumns = new Set(historicalTable.columns);
  const addedColumns = currentTable.columns.filter((column) => !historicalColumns.has(column));
  const removedColumns = historicalTable.columns.filter((column) => !currentColumns.has(column));
  const reasonCodes = [];
  if (addedColumns.length > 0) reasonCodes.push("BACKUP_COLUMNS_ADDED");
  if (removedColumns.length > 0) reasonCodes.push("BACKUP_COLUMNS_REMOVED");
  if (historicalTable.sha256 !== currentTable.sha256) {
    reasonCodes.push("BACKUP_CONTENT_HASH_CHANGED");
  }
  if (historicalTable.rowCount !== currentTable.rowCount) {
    reasonCodes.push("BACKUP_ROW_COUNT_CHANGED");
  }
  if (reasonCodes.length === 0) reasonCodes.push("BACKUP_TABLE_UNCHANGED");
  reasonCodes.sort(compareText);
  return {
    version: history.version,
    origin: history.origin,
    digest: history.digest,
    present: true,
    addedColumns,
    removedColumns,
    rowCount: {
      current: currentTable.rowCount,
      delta: currentTable.rowCount - historicalTable.rowCount,
      historical: historicalTable.rowCount,
    },
    hashChanged: historicalTable.sha256 !== currentTable.sha256,
    reasonCodes,
    evidenceRefs: inventoryEvidenceRefs(currentTable, history),
  };
}

function inventoryEvidenceRefs(currentTable, history) {
  return [
    `${history.origin}#${currentTable.sourceTable}`,
    `current-inventory:${currentTable.sha256}#${currentTable.sourceTable}`,
  ];
}

function compareArtifactCount(currentTable, historicalCount) {
  const changed = currentTable.rowCount !== historicalCount.rowCount;
  return {
    currentRowCount: currentTable.rowCount,
    delta: currentTable.rowCount - historicalCount.rowCount,
    digest: historicalCount.digest,
    evidenceRefs: [`${historicalCount.origin}#${currentTable.sourceTable}`],
    historicalRowCount: historicalCount.rowCount,
    origin: historicalCount.origin,
    reasonCode: changed ? "ARTIFACT_ROW_COUNT_CHANGED" : "ARTIFACT_ROW_COUNT_UNCHANGED",
    version: historicalCount.version,
  };
}

function compareSemanticDecision({
  sourceTable,
  currentDecision,
  previousDecisions,
  historicalConflict,
}) {
  const previous = previousDecisions.at(-1) ?? null;
  const evidenceRefs = [
    ...currentDecision.evidenceRefs,
    ...(previous === null ? [] : [`${previous.origin}#${sourceTable}@${previous.digest}`]),
  ];
  const provenance = [
    {
      version: "v4",
      origin: "current-evidence-rule-registry",
      digest: sha256(canonicalJson(currentDecision)),
    },
    ...previousDecisions.map(({ digest, origin, version }) => ({ digest, origin, version })),
  ];

  if (historicalConflict) {
    return decisionResult(
      "conflict",
      "HISTORICAL_DECISION_CONFLICT",
      [
        ...currentDecision.evidenceRefs,
        ...previousDecisions.map(({ digest, origin }) => `${origin}#${sourceTable}@${digest}`),
      ],
      deduplicateProvenance(provenance),
    );
  }

  if (previous?.status === "confirmed" && currentDecision.status === "pending") {
    return decisionResult(
      "invalidated",
      "PREVIOUS_RULE_INVALIDATED_BY_CURRENT_EVIDENCE",
      evidenceRefs,
      provenance,
    );
  }
  if (previous === null) {
    return decisionResult("new", "NO_PREVIOUS_RULE_FOUND", evidenceRefs, provenance);
  }
  if (previous.status === "pending" && currentDecision.status === "pending") {
    return decisionResult("reused", "PREVIOUS_PENDING_REVALIDATED", evidenceRefs, provenance);
  }
  if (previous.status === "pending") {
    return decisionResult("new", "PREVIOUS_PENDING_NOW_CONFIRMED", evidenceRefs, provenance);
  }

  const guardedReason = guardedSemanticReason(sourceTable, currentDecision);
  if (guardedReason !== null) {
    return decisionResult("corrected", guardedReason, evidenceRefs, provenance);
  }
  if (sameArray(previous.destinationTables, currentDecision.destinationTables)) {
    return decisionResult("reused", "PREVIOUS_RULE_REVALIDATED", evidenceRefs, provenance);
  }
  return decisionResult("corrected", "PREVIOUS_DESTINATION_CORRECTED", evidenceRefs, provenance);
}

function guardedSemanticReason(sourceTable, currentDecision) {
  if (sourceTable === "tb_regularize.orientaoes_processual.socios") {
    if (
      !sameArray(currentDecision.destinationTables, ["regularize.proceduralGuidances"]) ||
      !currentDecision.identityDecisions.some(({ kind }) => kind === "aggregate")
    ) {
      throw new Error("Contrato atual inválido para sócios de orientação");
    }
    return "ORIENTATION_PARTNERS_MUST_BE_AGGREGATED";
  }
  if (sourceTable === "tb_admin.usuarios") {
    if (
      currentDecision.securityDecisions.length !== 1 ||
      currentDecision.securityDecisions[0].transformation !== "select_bcrypt_migration_strategy"
    ) {
      throw new Error("Contrato atual de senha legado não usa estratégia bcrypt segura");
    }
    return "LEGACY_PASSWORD_REQUIRES_CURRENT_BCRYPT_STRATEGY";
  }
  if (sourceTable === "tb_regularize.clientes") {
    const [merge, own] = currentDecision.identityDecisions;
    if (
      merge?.kind !== "resolve" ||
      merge.legacyColumn !== "cliente_id" ||
      merge.sourceTable !== "tb_integracao.clientes" ||
      merge.targetLegacyColumn !== "id" ||
      own?.kind !== "generate" ||
      own.legacyColumn !== "codigo" ||
      own.sourceTable !== "tb_regularize.clientes"
    ) {
      throw new Error("Contrato atual de cliente Regularize não usa cliente_id explícito");
    }
    return "REGULARIZE_CLIENT_REQUIRES_EXPLICIT_CLIENT_ID_CHAIN";
  }
  return null;
}

function decisionResult(status, reasonCode, evidenceRefs, provenance) {
  return {
    status,
    reasonCode,
    reason: semanticReason(reasonCode),
    evidenceRefs: [...new Set(evidenceRefs.map(normalizeReference))].sort(compareText),
    provenance: deduplicateProvenance(provenance),
  };
}

function deduplicateProvenance(provenance) {
  const bySignature = new Map();
  for (const entry of provenance) {
    const signature = `${entry.version}\0${entry.origin}\0${entry.digest}`;
    bySignature.set(signature, entry);
  }
  return [...bySignature]
    .sort(([left], [right]) => compareText(left, right))
    .map(([, value]) => value);
}

function semanticReason(reasonCode) {
  return {
    LEGACY_PASSWORD_REQUIRES_CURRENT_BCRYPT_STRATEGY:
      "A decisão histórica não comprova transformação segura; a regra atual seleciona bcrypt válido ou aplica hash bcrypt ao texto legado.",
    CURRENT_TABLE_MISSING_FROM_INVENTORY:
      "A origem existe apenas nas fontes históricas e não está presente no inventário atual.",
    HISTORICAL_DECISION_CONFLICT:
      "Artefatos históricos divergem; a decisão atual permanece registrada como autoridade sem resolver silenciosamente o conflito.",
    HISTORICAL_ARTIFACT_CONFLICT_CURRENT_TABLE_MISSING:
      "Artefatos históricos divergem para uma origem ausente do inventário atual.",
    NO_PREVIOUS_RULE_FOUND:
      "Nenhuma decisão histórica confirmada foi encontrada; a classificação vem exclusivamente da evidência atual.",
    ORIENTATION_PARTNERS_MUST_BE_AGGREGATED:
      "A orientação possui coleção filha própria; a regra atual agrega sócios no JSON da orientação sem criar Partner ou ClientPF global.",
    PREVIOUS_DESTINATION_CORRECTED:
      "O destino histórico diverge do grafo de transformação comprovado pela evidência atual.",
    PREVIOUS_PENDING_NOW_CONFIRMED:
      "A origem antes pendente agora possui comportamento legado e contrato atual comprovados.",
    PREVIOUS_PENDING_REVALIDATED:
      "A ausência de destino histórico continua compatível com a evidência atual pendente.",
    PREVIOUS_RULE_INVALIDATED_BY_CURRENT_EVIDENCE:
      "A regra histórica não prevalece porque a evidência atual não confirma um destino existente.",
    PREVIOUS_RULE_REVALIDATED:
      "O destino histórico foi revalidado contra a evidência e o contrato atuais.",
    REGULARIZE_CLIENT_REQUIRES_EXPLICIT_CLIENT_ID_CHAIN:
      "O merge atual usa cliente_id explícito para tb_integracao.clientes; sem vínculo válido, codigo gera a identidade própria.",
  }[reasonCode];
}

function buildSummary(tables, histories) {
  const countedStatuses = countBy(tables, ({ decision }) => decision.status);
  const byDecisionStatus = Object.fromEntries(
    DECISION_COMPARISON_STATUSES.map((status) => [status, countedStatuses[status] ?? 0]),
  );
  const byDecisionReasonCode = countBy(tables, ({ decision }) => decision.reasonCode);
  const byHistoricalVersion = histories.map((history) => {
    const comparisons = tables.map(({ inventoryComparisons }) =>
      inventoryComparisons.find(({ version }) => version === history.version),
    );
    return {
      version: history.version,
      digest: history.digest,
      tablesPresent: comparisons.filter(({ present }) => present).length,
      tablesMissing: comparisons.filter(({ present }) => !present).length,
      columnsChanged: comparisons.filter(
        ({ addedColumns, removedColumns }) => addedColumns.length > 0 || removedColumns.length > 0,
      ).length,
      rowCountsChanged: comparisons.filter(({ reasonCodes }) =>
        reasonCodes.includes("BACKUP_ROW_COUNT_CHANGED"),
      ).length,
      hashesChanged: comparisons.filter(({ hashChanged }) => hashChanged === true).length,
    };
  });
  const artifactVersions = new Set(
    tables.flatMap(({ artifactCountComparisons }) =>
      artifactCountComparisons.map(({ version }) => version),
    ),
  );
  const byArtifactVersion = [...artifactVersions].sort(compareText).map((version) => {
    const comparisons = tables.flatMap(({ artifactCountComparisons }) =>
      artifactCountComparisons.filter((comparison) => comparison.version === version),
    );
    return {
      version,
      tablesCompared: comparisons.length,
      rowCountsChanged: comparisons.filter(
        ({ reasonCode }) => reasonCode === "ARTIFACT_ROW_COUNT_CHANGED",
      ).length,
    };
  });
  return {
    totalTables: tables.length,
    byDecisionStatus,
    byDecisionReasonCode,
    byHistoricalVersion,
    byArtifactVersion,
  };
}

function normalizeReportIssues(issues) {
  if (!Array.isArray(issues)) throw new TypeError("Issues históricas devem ser array");
  const normalized = issues.map((issue) => {
    if (!isRecord(issue)) throw new TypeError("Issue histórica inválida");
    const allowedFields = new Set(["scope", "reasonCode", "version"]);
    if (Object.keys(issue).some((field) => !allowedFields.has(field))) {
      throw new TypeError("Issue histórica contém campo não permitido");
    }
    if (
      typeof issue.scope !== "string" ||
      issue.scope.length === 0 ||
      issue.scope.length > 240 ||
      !SAFE_REFERENCE.test(issue.scope) ||
      issue.scope.includes("..") ||
      issue.scope.includes("//")
    ) {
      throw new TypeError("Escopo de issue histórica inválido");
    }
    return {
      scope: issue.scope,
      reasonCode: normalizeReasonCode(issue.reasonCode),
      ...(issue.version === undefined
        ? {}
        : { version: normalizeVersion(issue.version, "issue.version") }),
    };
  });
  normalized.sort(compareIssues);
  assertUnique(normalized, issueSignature, "Issue histórica duplicada");
  return normalized;
}

function issueSignature(issue) {
  return `${issue.scope}\0${issue.reasonCode}\0${issue.version ?? ""}`;
}

function validateReportCoverage(report, current) {
  if (
    report.schemaVersion !== 1 ||
    !isRecord(report.currentInventory) ||
    report.currentInventory.version !== current.version ||
    report.currentInventory.digest !== current.digest ||
    !Array.isArray(report.tables) ||
    !isRecord(report.summary)
  ) {
    throw new Error("Versão ou digest atual diverge no relatório histórico");
  }
  const expectedBySource = new Map(current.tables.map((table) => [table.sourceTable, table]));
  const seen = new Set();
  const countedStatuses = Object.fromEntries(
    DECISION_COMPARISON_STATUSES.map((status) => [status, 0]),
  );
  for (const table of report.tables) {
    if (!isRecord(table)) throw new Error("Tabela inválida no relatório histórico");
    const sourceTable = normalizeSourceName(table.sourceTable, "report.sourceTable");
    if (seen.has(sourceTable)) throw new Error("Cobertura duplicada no relatório histórico");
    seen.add(sourceTable);
    const expected = expectedBySource.get(sourceTable);
    if (expected === undefined) {
      if (table.currentInventory !== null || table.currentDecision !== null) {
        throw new Error("Tabela histórica extra não pode declarar inventário atual");
      }
    } else {
      const expectedCurrent = {
        columns: expected.columns,
        digest: expected.sha256,
        rowCount: expected.rowCount,
      };
      if (canonicalJson(table.currentInventory) !== canonicalJson(expectedCurrent)) {
        throw new Error("Inventário por tabela diverge no relatório histórico");
      }
    }
    const status = table.decision?.status;
    if (!DECISION_COMPARISON_STATUSES.includes(status)) {
      throw new Error("Status inválido no relatório histórico");
    }
    countedStatuses[status] += 1;
  }
  for (const sourceTable of expectedBySource.keys()) {
    if (!seen.has(sourceTable)) throw new Error("Cobertura incompleta no relatório histórico");
  }
  const summaryStatuses = report.summary.byDecisionStatus;
  if (
    report.summary.totalTables !== report.tables.length ||
    !isRecord(summaryStatuses) ||
    Object.keys(summaryStatuses).length !== DECISION_COMPARISON_STATUSES.length ||
    DECISION_COMPARISON_STATUSES.some(
      (status) => summaryStatuses[status] !== countedStatuses[status],
    )
  ) {
    throw new Error("Summary/status não reconciliado no relatório histórico");
  }
}

function countBy(values, select) {
  const counts = new Map();
  for (const value of values) {
    const key = select(value);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return Object.fromEntries([...counts].sort(([left], [right]) => compareText(left, right)));
}

async function assertRealConfinedRoot(directory) {
  if (typeof directory !== "string" || directory.length === 0) {
    throw new TypeError("Diretório histórico obrigatório");
  }
  const resolved = path.resolve(directory);
  let inspection;
  try {
    inspection = await lstat(resolved);
  } catch {
    throw new Error("Diretório histórico deve ser um diretório real");
  }
  if (!inspection.isDirectory() || inspection.isSymbolicLink()) {
    throw new Error("Diretório histórico deve ser um diretório real, sem symlink");
  }
  const canonical = await realpath(resolved);
  if (canonical !== resolved) throw new Error("Diretório histórico deve ser confinado e sem alias");
  return canonical;
}

async function readAllowListedArtifact(filePath, root, descriptor) {
  const expectedExtension = `.${descriptor.format}`;
  if (path.extname(filePath) !== expectedExtension) {
    throw new Error("Extensão histórica não allow-listed");
  }
  const resolved = path.resolve(filePath);
  if (!resolved.startsWith(`${root}${path.sep}`)) {
    throw artifactLoadError("ARTIFACT_PATH_OUTSIDE_ROOT");
  }
  const inspection = await inspectArtifactPathComponents(root, descriptor.origin);
  if (inspection.size > descriptor.maximumBytes) {
    throw artifactLoadError("ARTIFACT_MAX_BYTES_EXCEEDED", resolved);
  }
  const canonical = await realpath(resolved);
  if (!canonical.startsWith(`${root}${path.sep}`)) {
    throw artifactLoadError("ARTIFACT_PATH_OUTSIDE_ROOT");
  }
  let bytes;
  try {
    bytes = await readFile(canonical);
  } catch {
    throw artifactLoadError("ARTIFACT_READ_FAILED", canonical);
  }
  if (bytes.byteLength !== inspection.size) {
    throw artifactLoadError("ARTIFACT_SIZE_CHANGED", canonical);
  }
  let content;
  try {
    content = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    throw artifactLoadError("ARTIFACT_INVALID_UTF8", canonical);
  }
  return {
    canonicalPath: canonical,
    content,
    digest: crypto.createHash("sha256").update(bytes).digest("hex"),
    sizeBytes: bytes.byteLength,
  };
}

async function inspectArtifactPathComponents(root, origin) {
  let current = root;
  const segments = origin.split("/");
  for (const [index, segment] of segments.entries()) {
    current = path.join(current, segment);
    let inspection;
    try {
      inspection = await lstat(current);
    } catch {
      throw artifactLoadError("ARTIFACT_MISSING");
    }
    if (inspection.isSymbolicLink()) {
      throw artifactLoadError("ARTIFACT_PATH_SYMLINK");
    }
    const final = index === segments.length - 1;
    if ((!final && !inspection.isDirectory()) || (final && !inspection.isFile())) {
      throw artifactLoadError("ARTIFACT_PATH_KIND_INVALID");
    }
    if (final) return inspection;
  }
  throw artifactLoadError("ARTIFACT_PATH_KIND_INVALID");
}

function artifactLoadError(reasonCode, protectedPath) {
  const error = new Error(reasonCode);
  error.reasonCode = reasonCode;
  if (protectedPath !== undefined) error.protectedPath = protectedPath;
  return error;
}

function parseV2ConfirmedDestinations(content) {
  const rows = parseCsv(content);
  if (
    rows.length < 2 ||
    !sameArray(rows[0], ["legacy_table", "target_table"]) ||
    rows.some((row) => row.length !== 2)
  ) {
    throw artifactLoadError("ARTIFACT_CSV_SHAPE_INVALID");
  }
  return {
    decisions: rows.slice(1).map(([sourceTable, destinationTable]) => ({
      sourceTable: normalizeSourceName(sourceTable, "V2 legacy_table"),
      status: "confirmed",
      destinations: [
        { destinationTable: normalizeSourceName(destinationTable, "V2 target_table") },
      ],
    })),
    inventoryCounts: [],
  };
}

function parseV2Manifest(content) {
  const parsed = parseJsonObject(content);
  if (!isRecord(parsed.sourceRows)) {
    throw artifactLoadError("ARTIFACT_JSON_SHAPE_INVALID");
  }
  const inventoryCounts = Object.entries(V2_SOURCE_ROW_TABLES).map(([field, sourceTable]) => {
    const rowCount = parsed.sourceRows[field];
    if (!Number.isSafeInteger(rowCount) || rowCount < 0) {
      throw artifactLoadError("ARTIFACT_JSON_SHAPE_INVALID");
    }
    return { sourceTable, rowCount };
  });
  inventoryCounts.sort((left, right) => compareText(left.sourceTable, right.sourceTable));
  return { decisions: [], inventoryCounts };
}

function parseV2Pending(content) {
  let parsed;
  try {
    parsed = JSON.parse(content);
  } catch {
    throw artifactLoadError("ARTIFACT_JSON_INVALID");
  }
  assertJsonLimits(parsed);
  if (!Array.isArray(parsed)) throw artifactLoadError("ARTIFACT_JSON_SHAPE_INVALID");
  return {
    decisions: parsed.map((entry) => {
      if (!isRecord(entry) || typeof entry.legacy_table !== "string") {
        throw artifactLoadError("ARTIFACT_JSON_SHAPE_INVALID");
      }
      return {
        sourceTable: normalizeSourceName(entry.legacy_table, "pending legacy_table"),
        status: "pending",
        destinations: [],
      };
    }),
    inventoryCounts: [],
  };
}

function parseV3DryRun(content, { digest }) {
  const lines = validateTextLines(content, "ARTIFACT_MARKDOWN_LIMIT_EXCEEDED");
  if (lines[0] !== "# Migração RH e Departamento Pessoal - Dry-run v3") {
    throw artifactLoadError("ARTIFACT_MARKDOWN_SHAPE_INVALID");
  }
  const headingIndexes = lines
    .map((line, index) => (line === "## Resultado do dry-run" ? index : -1))
    .filter((index) => index !== -1);
  if (headingIndexes.length !== 1) {
    throw artifactLoadError("ARTIFACT_MARKDOWN_SHAPE_INVALID");
  }
  const markerIndex = lines.indexOf("Registros lidos no legado:", headingIndexes[0] + 1);
  const headerIndex = markerIndex + 2;
  if (
    markerIndex === -1 ||
    lines[headerIndex] !== "| Origem | Registros |" ||
    lines[headerIndex + 1] !== "| --- | ---: |"
  ) {
    throw artifactLoadError("ARTIFACT_MARKDOWN_SHAPE_INVALID");
  }
  const inventoryCounts = [];
  for (let index = headerIndex + 2; index < lines.length; index += 1) {
    const line = lines[index];
    if (line === "") break;
    const match = line.match(/^\| `([A-Za-z0-9_.-]+)` \| ([0-9]+) \|$/);
    if (match === null) throw artifactLoadError("ARTIFACT_MARKDOWN_ROW_INVALID");
    inventoryCounts.push({ sourceTable: match[1], rowCount: Number(match[2]) });
    if (inventoryCounts.length > MAX_CSV_ROWS) {
      throw artifactLoadError("ARTIFACT_MARKDOWN_LIMIT_EXCEEDED");
    }
  }
  if (inventoryCounts.length === 0) {
    throw artifactLoadError("ARTIFACT_MARKDOWN_SHAPE_INVALID");
  }
  inventoryCounts.sort((left, right) => compareText(left.sourceTable, right.sourceTable));
  const fingerprintKnown = digest === V3_SEMANTIC_FINGERPRINT;
  return {
    decisions: fingerprintKnown
      ? [
          {
            sourceTable: "tb_rh.solicitacoes",
            status: "confirmed",
            destinations: [{ destinationTable: "rh.requests" }],
          },
        ]
      : [],
    inventoryCounts,
    semanticAvailability: fingerprintKnown ? "available" : "metrics_only",
    issueReasonCodes: fingerprintKnown ? [] : ["ARTIFACT_SEMANTIC_METRICS_ONLY"],
  };
}

function parseCsv(content) {
  const lines = validateTextLines(content, "ARTIFACT_CSV_LIMIT_EXCEEDED");
  if (lines.length > MAX_CSV_ROWS + 1) {
    throw artifactLoadError("ARTIFACT_CSV_LIMIT_EXCEEDED");
  }
  const rows = [];
  let row = [];
  let field = "";
  let quoted = false;
  for (let index = 0; index < content.length; index += 1) {
    const character = content[index];
    if (quoted) {
      if (character === '"' && content[index + 1] === '"') {
        field += '"';
        index += 1;
      } else if (character === '"') {
        quoted = false;
      } else {
        field += character;
        if (field.length > MAX_CSV_CELL_LENGTH) {
          throw artifactLoadError("ARTIFACT_CSV_LIMIT_EXCEEDED");
        }
      }
      continue;
    }
    if (character === '"') {
      if (field.length !== 0) throw new Error("CSV histórico inválido");
      quoted = true;
    } else if (character === ",") {
      row.push(field);
      field = "";
    } else if (character === "\n") {
      row.push(field.replace(/\r$/, ""));
      rows.push(row);
      row = [];
      field = "";
    } else {
      field += character;
      if (field.length > MAX_CSV_CELL_LENGTH) {
        throw artifactLoadError("ARTIFACT_CSV_LIMIT_EXCEEDED");
      }
    }
  }
  if (quoted) throw artifactLoadError("ARTIFACT_CSV_SHAPE_INVALID");
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((entry) => entry.some((value) => value.length > 0));
}

function parseJsonObject(content) {
  let parsed;
  try {
    parsed = JSON.parse(content);
  } catch {
    throw artifactLoadError("ARTIFACT_JSON_INVALID");
  }
  assertJsonLimits(parsed);
  if (!isRecord(parsed)) throw artifactLoadError("ARTIFACT_JSON_SHAPE_INVALID");
  return parsed;
}

function validateTextLines(content, reasonCode) {
  const lines = content.split(/\r?\n/);
  if (lines.length > MAX_TEXT_LINES || lines.some((line) => line.length > MAX_TEXT_LINE_LENGTH)) {
    throw artifactLoadError(reasonCode);
  }
  return lines;
}

function assertJsonLimits(value) {
  const stack = [{ depth: 0, value }];
  let nodes = 0;
  let keys = 0;
  while (stack.length > 0) {
    const current = stack.pop();
    nodes += 1;
    if (nodes > MAX_JSON_NODES || current.depth > MAX_JSON_DEPTH) {
      throw artifactLoadError("ARTIFACT_JSON_LIMIT_EXCEEDED");
    }
    if (typeof current.value === "string") {
      if (current.value.length > MAX_JSON_STRING_LENGTH) {
        throw artifactLoadError("ARTIFACT_JSON_LIMIT_EXCEEDED");
      }
      continue;
    }
    if (Array.isArray(current.value)) {
      for (const entry of current.value) stack.push({ depth: current.depth + 1, value: entry });
      continue;
    }
    if (isRecord(current.value)) {
      const entries = Object.entries(current.value);
      keys += entries.length;
      if (keys > MAX_JSON_KEYS || entries.some(([key]) => key.length > MAX_JSON_STRING_LENGTH)) {
        throw artifactLoadError("ARTIFACT_JSON_LIMIT_EXCEEDED");
      }
      for (const [, entry] of entries) {
        stack.push({ depth: current.depth + 1, value: entry });
      }
    }
  }
}

function normalizeEvidenceReferences(references, label) {
  if (!Array.isArray(references)) throw new TypeError(`${label} deve ser array`);
  return references.map(normalizeReference).sort(compareText);
}

function normalizeReference(reference) {
  if (
    typeof reference === "string" &&
    reference.length > 0 &&
    reference.length <= 240 &&
    SAFE_REFERENCE.test(reference) &&
    !reference.includes("..") &&
    !reference.includes("//")
  ) {
    return reference;
  }
  return `sha256:${sha256(String(reference))}`;
}

function normalizeReasonCode(reasonCode) {
  if (typeof reasonCode !== "string" || !/^[A-Z0-9_]+$/.test(reasonCode)) {
    throw new TypeError("reasonCode atual inválido");
  }
  return reasonCode;
}

function normalizeSourceName(value, label) {
  if (typeof value !== "string" || !SOURCE_NAME.test(value)) {
    throw new TypeError(`${label} inválido`);
  }
  return value;
}

function normalizeColumnName(value, label) {
  if (typeof value !== "string" || !COLUMN_NAME.test(value)) {
    throw new TypeError(`${label} inválido`);
  }
  return value;
}

function normalizeVersion(value, label) {
  if (typeof value !== "string" || !VERSION_NAME.test(value)) {
    throw new TypeError(`${label} inválida`);
  }
  return value;
}

function normalizeOrigin(value) {
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    value.length > 240 ||
    path.isAbsolute(value) ||
    value.includes("\\") ||
    value.split("/").includes("..") ||
    !SAFE_REFERENCE.test(value)
  ) {
    throw new TypeError("Origem histórica deve ser relativa e sanitizada");
  }
  return value;
}

function normalizeDigest(value, label) {
  if (typeof value !== "string" || !DIGEST.test(value)) {
    throw new TypeError(`${label} inválido`);
  }
  return value;
}

function assertUnique(values, select, message) {
  const seen = new Set();
  for (const value of values) {
    const key = select(value);
    if (seen.has(key)) throw new Error(message);
    seen.add(key);
  }
}

function sha256(value) {
  return crypto.createHash("sha256").update(value, "utf8").digest("hex");
}

function canonicalJson(value) {
  return JSON.stringify(stableSortObject(value));
}

function stableSortObject(value) {
  if (Array.isArray(value)) return value.map(stableSortObject);
  if (isRecord(value)) {
    return Object.fromEntries(
      Object.keys(value)
        .sort(compareText)
        .map((key) => [key, stableSortObject(value[key])]),
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

function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function sameArray(left, right) {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function compareText(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
}

function compareIssues(left, right) {
  return compareText(
    `${left.scope}\0${left.reasonCode}\0${left.version ?? ""}`,
    `${right.scope}\0${right.reasonCode}\0${right.version ?? ""}`,
  );
}
