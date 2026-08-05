import path from "node:path";

import { createPendingMapping, validateMappingRule } from "./mapping-contract.mjs";
import { getModelByDatabaseName } from "./prisma-catalog.mjs";
import { validateEvidenceCoverage } from "./semantic-evidence.mjs";
import {
  assertNoSensitiveSerializedContent,
  assertNoSensitiveValues,
  sanitizeQuarantineItem,
} from "./sensitivity.mjs";
import { iterateSqlRows } from "./sql-dump-parser.mjs";
import { serializeCsv, serializeStableJson, writeFileSetAtomically } from "./stable-output.mjs";

const CASTELO_ORGANIZATION_ID = "e8048d1c-0830-45d7-84de-68e20abd685b";
const EMISSION_STATUSES = ["prepared", "quarantine", "not_emitted"];

export async function buildMapping({
  inventory,
  evidenceRegistry,
  ruleRegistry,
  prismaCatalog,
  sourceDir,
  capabilities = {},
}) {
  validateBuildInputs({
    inventory,
    evidenceRegistry,
    ruleRegistry,
    prismaCatalog,
    sourceDir,
    capabilities,
  });
  validateRegistries(inventory, evidenceRegistry, ruleRegistry, prismaCatalog);

  const tableMappings = [];
  const destinationMappings = [];
  const columnMappings = [];
  const pendingTables = [];
  const quarantineItems = [];
  const emissionCounts = {};

  for (const sourceInspection of sorted(inventory.tables, ({ sourceTable }) => sourceTable)) {
    const evidence = evidenceRegistry.get(sourceInspection.sourceTable);
    if (evidence.finalStatus === "pending") {
      pendingTables.push(createPendingMapping(sourceInspection, evidence));
      continue;
    }

    const rule = ruleRegistry.get(sourceInspection.sourceTable);
    const stepCounts = new Map(
      rule.destinations.map((destination) => [
        destination.stepId,
        {
          sourceTable: rule.sourceTable,
          stepId: destination.stepId,
          destinationTable: destination.destinationTable,
          mode: destination.mode,
          read: 0,
          prepared: 0,
          quarantine: 0,
          notEmitted: 0,
        },
      ]),
    );
    let readRows = 0;
    const dumpPath = resolveDumpPath(sourceDir, sourceInspection);

    for await (const row of iterateSqlRows(dumpPath)) {
      readRows += 1;
      const context = createRuleContext(capabilities, {
        sourceTable: rule.sourceTable,
        rowNumber: readRows,
      });
      const emissions = completeRowEmissions(rule, rule.emitRows(row, context), readRows);

      for (const decision of emissions) {
        const count = stepCounts.get(decision.stepId);
        count.read += 1;
        count[toCountField(decision.status)] += 1;
        if (decision.status === "quarantine") {
          quarantineItems.push(
            sanitizeQuarantineItem({
              sourceTable: rule.sourceTable,
              legacyId:
                sourceInspection.legacyIdColumn === null
                  ? decision.identityRef
                  : row[sourceInspection.legacyIdColumn],
              stepId: decision.stepId,
              field: decision.field,
              reasonCode: decision.reasonCode,
              destinationTable: decision.destinationTable,
            }),
          );
        }
      }
    }

    if (readRows !== sourceInspection.rowCount) {
      throw new Error(`Contagem lida diverge do inventário para ${sourceInspection.sourceTable}`);
    }

    const counts = [...stepCounts.values()];
    const totals = sumCounts(counts);
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
      prepared: totals.prepared,
      quarantine: totals.quarantine,
      notEmitted: totals.notEmitted,
    });

    for (const destination of rule.destinations) {
      const count = stepCounts.get(destination.stepId);
      destinationMappings.push({
        sourceTable: rule.sourceTable,
        stepId: destination.stepId,
        destinationTable: destination.destinationTable,
        mode: destination.mode,
        identityKind: destination.identity.kind,
        cardinality: rule.cardinality,
        ruleOrigin: rule.ruleOrigin,
        dependencies: [...destination.dependencies],
        precedence: [...destination.precedence],
        readRows: count.read,
        prepared: count.prepared,
        quarantine: count.quarantine,
        notEmitted: count.notEmitted,
      });
      setEmissionCount(emissionCounts, count);

      for (const column of destination.columns) {
        columnMappings.push({
          sourceTable: rule.sourceTable,
          stepId: destination.stepId,
          destinationTable: destination.destinationTable,
          mode: destination.mode,
          sourceColumn: column.sourceColumn,
          destinationColumn: column.destinationColumn,
          status: column.status,
          transformation: column.transformation,
          nullHandling: column.nullHandling,
          referenceRole: column.referenceRole,
          sensitivity: column.sensitivity,
          ruleOrigin: rule.ruleOrigin,
          reason: column.reason,
        });
      }
    }
  }

  const result = {
    tableMappings: sortTableMappings(tableMappings),
    destinationMappings: sortDestinationMappings(destinationMappings),
    columnMappings: sortColumnMappings(columnMappings),
    pendingTables: sortTableMappings(pendingTables),
    quarantineItems: sortQuarantineItems(quarantineItems),
    emissionCounts,
    quarantineSummary: buildQuarantineSummary(quarantineItems),
  };
  assertNoSensitiveValues({
    tableMappings: result.tableMappings,
    destinationMappings: result.destinationMappings,
    columnMappings: result.columnMappings,
    pendingTables: result.pendingTables,
    quarantineItems: result.quarantineItems,
    quarantineSummary: result.quarantineSummary,
  });
  validateMappingCompleteness(result, inventory);
  return result;
}

export function validateMappingCompleteness(result, inventory) {
  if (!isObject(result) || !Array.isArray(inventory?.tables)) {
    throw new TypeError("Resultado e inventário são obrigatórios");
  }
  const confirmed = result.tableMappings ?? [];
  const pending = result.pendingTables ?? [];
  const allMappings = [...confirmed, ...pending];
  const inventorySources = inventory.tables.map(({ sourceTable }) => sourceTable).sort(compareText);
  const resultSources = allMappings.map(({ sourceTable }) => sourceTable).sort(compareText);
  assertSameUniqueSources(resultSources, inventorySources);

  const tableBySource = new Map(confirmed.map((mapping) => [mapping.sourceTable, mapping]));
  const destinationsBySource = groupBy(result.destinationMappings ?? [], "sourceTable");
  for (const sourceTable of inventorySources) {
    const mapping = tableBySource.get(sourceTable);
    if (mapping === undefined) {
      if ((destinationsBySource.get(sourceTable) ?? []).length > 0) {
        throw new Error(`Tabela pending possui destino executável: ${sourceTable}`);
      }
      continue;
    }
    if (mapping.readRows !== mapping.sourceRowCount) {
      throw new Error(`Leitura incompleta para ${sourceTable}`);
    }
    const destinations = destinationsBySource.get(sourceTable) ?? [];
    if (destinations.length !== mapping.destinationStepCount) {
      throw new Error(`Quantidade de passos diverge para ${sourceTable}`);
    }
    for (const destination of destinations) {
      if (
        destination.prepared + destination.quarantine + destination.notEmitted !==
        mapping.sourceRowCount
      ) {
        throw new Error(`Passo sem fechamento integral: ${sourceTable}.${destination.stepId}`);
      }
    }
  }

  if (result.quarantineSummary?.total !== (result.quarantineItems ?? []).length) {
    throw new Error("Resumo de quarentena diverge dos itens sanitizados");
  }
  return true;
}

export async function writeMappingPackage(packageDir, result) {
  const artifacts = buildArtifacts(result);
  assertNoSensitiveValues(Object.fromEntries(artifacts));
  for (const content of artifacts.values()) {
    assertNoSensitiveSerializedContent(content);
  }
  await writeFileSetAtomically(packageDir, artifacts, {
    replaceDirectories: ["mapping", "pending-mapping", "quarantine"],
  });
}

function validateBuildInputs({
  inventory,
  evidenceRegistry,
  ruleRegistry,
  prismaCatalog,
  sourceDir,
  capabilities,
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
  if (!isObject(capabilities)) {
    throw new TypeError("capabilities deve ser um objeto");
  }
  if (
    inventory.actualTableCount !== inventory.tables.length ||
    inventory.expectedTableCount !== inventory.tables.length
  ) {
    throw new Error("SourceInventory possui contagem inconsistente");
  }
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
    if (model === null) {
      throw new Error(`Destino Prisma ausente: ${step.destinationTable}`);
    }
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
  }
}

function completeRowEmissions(rule, emissions, rowNumber) {
  if (!Array.isArray(emissions)) {
    throw new TypeError("emitRows deve retornar um array");
  }
  const emittedSteps = new Set();
  for (const { stepId } of emissions) {
    if (emittedSteps.has(stepId)) {
      throw new Error(`Emissão duplicada no passo ${stepId}`);
    }
    emittedSteps.add(stepId);
  }
  return [
    ...emissions,
    ...rule.destinations
      .filter(({ stepId }) => !emittedSteps.has(stepId))
      .map(({ stepId, destinationTable }) => ({
        stepId,
        destinationTable,
        status: "not_emitted",
        identityRef: `${rule.sourceTable}:row-${rowNumber}:${stepId}`,
        field: null,
        reasonCode: "STEP_NOT_APPLICABLE_TO_SOURCE_ROW",
      })),
  ];
}

function resolveDumpPath(sourceDir, inspection) {
  const sourceRoot = path.resolve(sourceDir);
  const dumpPath = path.resolve(sourceRoot, inspection.relativePath ?? inspection.fileName);
  if (dumpPath !== sourceRoot && !dumpPath.startsWith(`${sourceRoot}${path.sep}`)) {
    throw new Error("Caminho de dump fora do diretório de origem");
  }
  return dumpPath;
}

function createRuleContext(capabilities, metadata) {
  return Object.freeze({
    ...capabilities,
    capabilities: Object.freeze({ ...capabilities }),
    ...metadata,
  });
}

function setEmissionCount(registry, count) {
  registry[count.sourceTable] ??= {};
  registry[count.sourceTable][count.stepId] = {
    destinationTable: count.destinationTable,
    read: count.read,
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
  const reasons = sortQuarantineItems(result.quarantineItems ?? []);
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
  return { ...row, dependencies: row.dependencies.join("|") };
}

function flattenDestinationMapping(row) {
  return {
    ...row,
    dependencies: row.dependencies.join("|"),
    precedence: row.precedence.join("|"),
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
  };
}

function buildQuarantineSummary(items) {
  return {
    total: items.length,
    unresolved: items.length,
    byReason: countGroups(items, "reasonCode"),
    bySourceTable: countGroups(items, "sourceTable"),
  };
}

function countGroups(items, field) {
  const counts = new Map();
  for (const item of items) counts.set(item[field], (counts.get(item[field]) ?? 0) + 1);
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

function sortTableMappings(rows) {
  return sorted(rows, ({ sourceTable }) => sourceTable);
}

function sortDestinationMappings(rows) {
  return sorted(rows, ({ sourceTable, stepId, destinationTable }) =>
    [sourceTable, stepId, destinationTable].join("\0"),
  );
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

function sortQuarantineItems(rows) {
  return sorted(rows, ({ sourceTable, stepId, legacyIdRef, reasonCode }) =>
    [sourceTable, stepId ?? "", legacyIdRef, reasonCode].join("\0"),
  );
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
  if (new Set(actual).size !== actual.length || !sameArray(actual, expected)) {
    throw new Error("Cobertura de sourceTable divergente");
  }
}

function sameArray(left, right) {
  return left.length === right.length && left.every((value, index) => value === right[index]);
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
  "cardinality",
  "ruleOrigin",
  "dependencies",
  "precedence",
  "readRows",
  "prepared",
  "quarantine",
  "notEmitted",
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
];
const QUARANTINE_COLUMNS = [
  "sourceTable",
  "legacyIdRef",
  "stepId",
  "destinationTable",
  "field",
  "reasonCode",
  "decisionStatus",
];
