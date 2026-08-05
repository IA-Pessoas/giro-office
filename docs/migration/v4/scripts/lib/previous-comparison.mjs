import crypto from "node:crypto";
import { lstat, readFile, realpath } from "node:fs/promises";
import path from "node:path";

const SOURCE_NAME = /^[A-Za-z0-9_.-]+$/;
const COLUMN_NAME = /^[\p{L}\p{N}_.-]+$/u;
const VERSION_NAME = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/;
const DIGEST = /^[a-f0-9]{64}$/;
const SAFE_REFERENCE = /^[A-Za-z0-9_./:# -]+$/;
const DECISION_STATUSES = new Set(["confirmed", "pending"]);
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
  const histories = normalizeHistoricalInventories(historicalInventories);
  const evidence = normalizeRegistry(evidenceRegistry, "EvidenceRegistry");
  const rules = normalizeRegistry(ruleRegistry, "RuleRegistry");
  const previous = normalizePreviousArtifacts(previousArtifacts);
  const previousBySource = indexPreviousDecisions(previous);
  const artifactCountsBySource = indexArtifactCounts(previous);

  const tables = current.tables.map((currentTable) => {
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
    const previousDecisions = previousBySource.get(currentTable.sourceTable) ?? [];
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
      }),
    };
  });

  return {
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
    artifactSources: previous.map(({ digest, format, origin, version }) => ({
      digest,
      format,
      origin,
      version,
    })),
    summary: buildSummary(tables, histories),
    tables,
  };
}

export async function loadPreviousMappingArtifacts({ previousDocsDir }) {
  const root = await assertRealConfinedRoot(previousDocsDir);
  const artifacts = [];
  for (const descriptor of ALLOWED_ARTIFACTS) {
    const absolutePath = path.join(root, ...descriptor.origin.split("/"));
    const content = await readAllowListedArtifact(absolutePath, root, descriptor);
    const parsed = descriptor.parser(content);
    artifacts.push({
      version: descriptor.version,
      origin: descriptor.origin,
      digest: sha256(content),
      format: descriptor.format,
      decisions: parsed.decisions,
      inventoryCounts: parsed.inventoryCounts,
    });
  }
  artifacts.sort((left, right) => compareText(left.origin, right.origin));
  return { artifacts, issues: [] };
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
  const normalized = inventories.map((entry) => {
    if (!isRecord(entry) || !isRecord(entry.inventory)) {
      throw new TypeError("Inventário histórico exige version, origin, digest e inventory");
    }
    const version = normalizeVersion(entry.version, "historical version");
    const origin = normalizeOrigin(entry.origin);
    const digest = normalizeDigest(entry.digest, "historical digest");
    const inventoryDigest = normalizeDigest(
      entry.inventory.sourceDigest,
      "historical inventory.sourceDigest",
    );
    if (digest !== inventoryDigest) {
      throw new Error(`Digest histórico divergente: ${version}`);
    }
    return {
      version,
      origin,
      digest,
      tables: normalizeInventoryTables(entry.inventory.tables, `inventário ${version}`),
    };
  });
  normalized.sort((left, right) => compareText(left.version, right.version));
  assertUnique(normalized, ({ version }) => version, "Versão histórica duplicada");
  return normalized;
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
  return artifacts
    .map((artifact) => {
      if (!isRecord(artifact)) throw new TypeError("Artefato histórico inválido");
      const version = normalizeVersion(artifact.version, "artifact.version");
      const origin = normalizeOrigin(artifact.origin);
      const digest = normalizeDigest(artifact.digest, "artifact.digest");
      if (!["csv", "json", "md"].includes(artifact.format)) {
        throw new TypeError("Formato histórico não allow-listed");
      }
      if (!Array.isArray(artifact.decisions) || !Array.isArray(artifact.inventoryCounts)) {
        throw new TypeError("Shape histórico inválido");
      }
      return {
        version,
        origin,
        digest,
        format: artifact.format,
        decisions: artifact.decisions.map((decision) =>
          normalizePreviousDecision(decision, { digest, origin, version }),
        ),
        inventoryCounts: artifact.inventoryCounts.map(normalizeInventoryCount),
      };
    })
    .sort((left, right) => compareText(left.origin, right.origin));
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
  const byVersionAndSource = new Map();
  for (const artifact of artifacts) {
    for (const decision of artifact.decisions) {
      const key = `${decision.provenance.version}\0${decision.sourceTable}`;
      const comparable = {
        sourceTable: decision.sourceTable,
        status: decision.status,
        destinations: decision.destinations,
      };
      const known = byVersionAndSource.get(key);
      if (known !== undefined) {
        if (canonicalJson(known.comparable) !== canonicalJson(comparable)) {
          throw new Error(`Decisão histórica conflitante: ${decision.sourceTable}`);
        }
        continue;
      }
      const normalized = {
        version: decision.provenance.version,
        origin: decision.provenance.origin,
        digest: decision.provenance.digest,
        status: decision.status,
        destinationTables: decision.destinations.map(({ destinationTable }) => destinationTable),
      };
      byVersionAndSource.set(key, { comparable, normalized });
      if (!bySource.has(decision.sourceTable)) bySource.set(decision.sourceTable, []);
      bySource.get(decision.sourceTable).push(normalized);
    }
  }
  for (const decisions of bySource.values()) {
    decisions.sort((left, right) =>
      compareText(
        `${left.version}\0${left.origin}\0${left.digest}`,
        `${right.version}\0${right.origin}\0${right.digest}`,
      ),
    );
  }
  return bySource;
}

function indexArtifactCounts(artifacts) {
  const bySource = new Map();
  const byVersionAndSource = new Map();
  for (const artifact of artifacts) {
    for (const count of artifact.inventoryCounts) {
      const key = `${artifact.version}\0${count.sourceTable}`;
      const known = byVersionAndSource.get(key);
      if (known !== undefined) {
        if (known.rowCount !== count.rowCount) {
          throw new Error(`Contagem histórica conflitante: ${count.sourceTable}`);
        }
        continue;
      }
      const normalized = {
        version: artifact.version,
        origin: artifact.origin,
        digest: artifact.digest,
        sourceTable: count.sourceTable,
        rowCount: count.rowCount,
      };
      byVersionAndSource.set(key, normalized);
      if (!bySource.has(count.sourceTable)) bySource.set(count.sourceTable, []);
      bySource.get(count.sourceTable).push(normalized);
    }
  }
  for (const counts of bySource.values()) {
    counts.sort((left, right) =>
      compareText(`${left.version}\0${left.origin}`, `${right.version}\0${right.origin}`),
    );
  }
  return bySource;
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

function compareSemanticDecision({ sourceTable, currentDecision, previousDecisions }) {
  const previous =
    [...previousDecisions].reverse().find(({ status }) => status === "confirmed") ??
    previousDecisions.at(-1) ??
    null;
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
    provenance,
  };
}

function semanticReason(reasonCode) {
  return {
    LEGACY_PASSWORD_REQUIRES_CURRENT_BCRYPT_STRATEGY:
      "A decisão histórica não comprova transformação segura; a regra atual seleciona bcrypt válido ou aplica hash bcrypt ao texto legado.",
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
  const byDecisionStatus = countBy(tables, ({ decision }) => decision.status);
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
    throw new Error("Artefato histórico fora do diretório confinado");
  }
  let inspection;
  try {
    inspection = await lstat(resolved);
  } catch {
    throw new Error(`Artefato histórico ausente: ${descriptor.origin}`);
  }
  if (!inspection.isFile() || inspection.isSymbolicLink()) {
    throw new Error(`Artefato histórico deve ser arquivo real: ${descriptor.origin}`);
  }
  if (inspection.size > descriptor.maximumBytes) {
    throw new Error(`Artefato histórico excede limite: ${descriptor.origin}`);
  }
  const canonical = await realpath(resolved);
  if (!canonical.startsWith(`${root}${path.sep}`)) {
    throw new Error("Artefato histórico fora do diretório confinado");
  }
  return readFile(canonical, "utf8");
}

function parseV2ConfirmedDestinations(content) {
  const rows = parseCsv(content);
  if (
    rows.length < 2 ||
    !sameArray(rows[0], ["legacy_table", "target_table"]) ||
    rows.some((row) => row.length !== 2)
  ) {
    throw new Error("Shape CSV V2 inválido");
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
  const parsed = parseJsonObject(content, "manifest V2");
  if (!isRecord(parsed.sourceRows)) throw new Error("Shape sourceRows do manifest V2 inválido");
  const inventoryCounts = Object.entries(V2_SOURCE_ROW_TABLES).map(([field, sourceTable]) => {
    const rowCount = parsed.sourceRows[field];
    if (!Number.isSafeInteger(rowCount) || rowCount < 0) {
      throw new Error(`Shape sourceRows do manifest V2 inválido: ${field}`);
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
    throw new Error("JSON pending V2 inválido");
  }
  if (!Array.isArray(parsed)) throw new Error("Shape pending V2 inválido");
  return {
    decisions: parsed.map((entry) => {
      if (!isRecord(entry) || typeof entry.legacy_table !== "string") {
        throw new Error("Shape pending V2 inválido");
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

function parseV3DryRun(content) {
  if (!/^# Migração RH e Departamento Pessoal - Dry-run v3$/m.test(content)) {
    throw new Error("Markdown V3 sem shape esperado");
  }
  const section = content.match(
    /## Resultado do dry-run[\s\S]*?Registros lidos no legado:\s*\n([\s\S]*?)(?=\n\n[^|])/,
  );
  if (section === null) throw new Error("Markdown V3 sem tabela de inventário");
  const inventoryCounts = [];
  for (const line of section[1].split(/\r?\n/)) {
    const match = line.match(/^\| `([A-Za-z0-9_.-]+)` \| ([0-9]+) \|$/);
    if (match === null) continue;
    inventoryCounts.push({ sourceTable: match[1], rowCount: Number(match[2]) });
  }
  if (inventoryCounts.length === 0) throw new Error("Markdown V3 sem contagens válidas");
  inventoryCounts.sort((left, right) => compareText(left.sourceTable, right.sourceTable));
  const decisions = [];
  if (
    content.includes("tb_rh.colaboradores.id`, nao `tb_admin.usuarios.id") &&
    content.includes("rh.requests.requester_user_id")
  ) {
    decisions.push({
      sourceTable: "tb_rh.solicitacoes",
      status: "confirmed",
      destinations: [{ destinationTable: "rh.requests" }],
    });
  }
  return { decisions, inventoryCounts };
}

function parseCsv(content) {
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
    }
  }
  if (quoted) throw new Error("CSV histórico inválido");
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((entry) => entry.some((value) => value.length > 0));
}

function parseJsonObject(content, label) {
  let parsed;
  try {
    parsed = JSON.parse(content);
  } catch {
    throw new Error(`JSON ${label} inválido`);
  }
  if (!isRecord(parsed)) throw new Error(`Shape ${label} inválido`);
  return parsed;
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

function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function sameArray(left, right) {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function compareText(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
}
