import { getModelByDatabaseName } from "./prisma-catalog.mjs";

const OPERATIONS = new Set(["delete", "dynamic", "insert", "select", "update"]);
const STATUSES = new Set(["confirmed", "pending"]);
const CONFIDENCES = new Set(["high", "medium", "low"]);

export function buildEvidenceCatalog({ inventory, usage, prismaCatalog, overlays = {} }) {
  const usageBySourceTable = new Map(
    (usage?.tables ?? []).map((entry) => [entry.sourceTable, entry]),
  );
  const decisions = inventory.tables.map(({ sourceTable }) => {
    const legacy = usageBySourceTable.get(sourceTable) ?? emptyLegacyUsage(sourceTable);
    const overlay = getOverlay(overlays, sourceTable);
    const directModel = getModelByDatabaseName(prismaCatalog, sourceTable);
    const adaptedModel =
      overlay?.destinationTable === undefined
        ? null
        : getModelByDatabaseName(prismaCatalog, overlay.destinationTable);
    const currentContractEvidence = getCurrentEvidence({ adaptedModel, directModel, overlay });
    const classification = classifyDecision({
      legacy,
      currentContractEvidence,
      directModel,
      adaptedModel,
    });

    return {
      sourceTable,
      legacyModule: legacy.legacyModule ?? "sem referência",
      legacyReferences: stableUnique(legacy.legacyReferences ?? []),
      operations: stableUnique(legacy.operations ?? []),
      legacyRelationships: stableUnique(legacy.legacyRelationships ?? []),
      currentContractEvidence,
      finalStatus: overlay?.finalStatus ?? "pending",
      reasonCode: overlay?.reasonCode ?? classification.reasonCode,
      reason: overlay?.reason ?? classification.reason,
      confidence: overlay?.confidence ?? classification.confidence,
      ruleId: overlay?.ruleId ?? null,
    };
  });
  const catalog = { decisions };
  validateEvidenceCoverage(catalog, inventory);
  return catalog;
}

export function validateEvidenceCoverage(catalog, inventory) {
  const inventoryTables = inventory?.tables?.map(({ sourceTable }) => sourceTable) ?? [];
  const decisionTables = catalog?.decisions?.map(({ sourceTable }) => sourceTable) ?? [];
  assertUnique(inventoryTables, "inventário");
  assertUnique(decisionTables, "catálogo");

  if (!sameSet(inventoryTables, decisionTables)) {
    throw new Error("Cobertura de evidências difere do inventário de origem.");
  }

  for (const decision of catalog.decisions) {
    validateDecision(decision);
  }
}

function emptyLegacyUsage(sourceTable) {
  return {
    sourceTable,
    legacyModule: null,
    legacyReferences: [],
    operations: [],
    legacyRelationships: [],
  };
}

function getOverlay(overlays, sourceTable) {
  if (Array.isArray(overlays)) {
    return overlays.find((overlay) => overlay?.sourceTable === sourceTable) ?? null;
  }
  return overlays?.[sourceTable] ?? null;
}

function getCurrentEvidence({ adaptedModel, directModel, overlay }) {
  if (adaptedModel !== null) {
    return stableUnique(
      overlay.currentContractEvidence?.length > 0
        ? overlay.currentContractEvidence
        : [`Prisma: ${adaptedModel.databaseName}`],
    );
  }
  if (directModel !== null) {
    return [`Prisma: ${directModel.databaseName}`];
  }
  return [];
}

function classifyDecision({ legacy, currentContractEvidence, directModel, adaptedModel }) {
  if (legacy.legacyReferences.length === 0) {
    return {
      confidence: "low",
      reasonCode: "NO_LEGACY_CODE_REFERENCE",
      reason: "Nenhuma referência de código legado foi localizada.",
    };
  }
  if (currentContractEvidence.length === 0) {
    return {
      confidence: "low",
      reasonCode: "NO_CURRENT_CONTRACT",
      reason: "Nenhum contrato atual candidato foi localizado.",
    };
  }
  if (adaptedModel !== null && directModel === null) {
    return {
      confidence: "medium",
      reasonCode: "ADAPTATION_REQUIRES_REVIEW",
      reason: "Adaptação para contrato atual localizada; revisão semântica ainda é obrigatória.",
    };
  }
  return {
    confidence: "medium",
    reasonCode: "DIRECT_DESTINATION_REQUIRES_REVIEW",
    reason: "Destino direto localizado; revisão semântica ainda é obrigatória.",
  };
}

function validateDecision(decision) {
  if (
    typeof decision?.sourceTable !== "string" ||
    decision.sourceTable.length === 0 ||
    typeof decision.legacyModule !== "string" ||
    !isStringArray(decision.legacyReferences) ||
    !isStringArray(decision.legacyRelationships) ||
    !Array.isArray(decision.operations) ||
    !decision.operations.every((operation) => OPERATIONS.has(operation)) ||
    !isStringArray(decision.currentContractEvidence) ||
    !STATUSES.has(decision.finalStatus) ||
    typeof decision.reasonCode !== "string" ||
    decision.reasonCode.length === 0 ||
    typeof decision.reason !== "string" ||
    decision.reason.length === 0 ||
    !CONFIDENCES.has(decision.confidence) ||
    !(typeof decision.ruleId === "string" || decision.ruleId === null)
  ) {
    throw new Error("EvidenceDecision incompleto ou inválido.");
  }

  if (
    decision.finalStatus === "confirmed" &&
    (decision.legacyReferences.length === 0 ||
      decision.currentContractEvidence.length === 0 ||
      decision.ruleId === null)
  ) {
    throw new Error("EvidenceDecision confirmed exige evidências atual, legada e ruleId.");
  }
}

function isStringArray(value) {
  return Array.isArray(value) && value.every((item) => typeof item === "string" && item.length > 0);
}

function stableUnique(values) {
  return [...new Set(values)].sort(compareText);
}

function assertUnique(values, label) {
  if (new Set(values).size !== values.length) {
    throw new Error(`sourceTable duplicada no ${label}.`);
  }
}

function sameSet(left, right) {
  return left.length === right.length && left.every((value) => right.includes(value));
}

function compareText(left, right) {
  if (left < right) {
    return -1;
  }
  if (left > right) {
    return 1;
  }
  return 0;
}
