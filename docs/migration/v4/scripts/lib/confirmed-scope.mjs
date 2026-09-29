import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

export const CONFIRMED_SCOPE_COUNTS = Object.freeze({
  origins: 103,
  sourceRows: 629349,
  steps: 133,
});

export function buildConfirmedScope({
  inventory,
  tableMappings,
  destinationMappings,
  sourceDigest,
  pendingMappings = readPendingMappings(),
}) {
  validateInputs({ inventory, tableMappings, destinationMappings, pendingMappings, sourceDigest });

  const inventoryBySource = new Map(inventory.tables.map((table) => [table.sourceTable, table]));
  const pendingSourceNames = new Set(pendingMappings.map(({ sourceTable }) => sourceTable));
  const confirmedSources = new Set();
  const sources = tableMappings
    .map((mapping) => {
      const inventoryTable = inventoryBySource.get(mapping.sourceTable);
      if (!inventoryTable || pendingSourceNames.has(mapping.sourceTable)) {
        throw scopeError("CONFIRMED_SCOPE_INVALID");
      }
      if (
        confirmedSources.has(mapping.sourceTable) ||
        mapping.sourceRowCount !== inventoryTable.rowCount ||
        mapping.dependencies.some((dependency) => !inventoryBySource.has(dependency))
      ) {
        throw scopeError("CONFIRMED_SCOPE_INVALID");
      }
      confirmedSources.add(mapping.sourceTable);
      return {
        sourceTable: mapping.sourceTable,
        dumpHash: inventoryTable.sha256,
        rowCount: inventoryTable.rowCount,
        dependencies: [...mapping.dependencies].sort(compareText),
        contractDigest: mapping.contractDigest,
      };
    })
    .sort(compareSources);

  const steps = destinationMappings
    .map((destination) => {
      const mapping = tableMappings.find(
        ({ sourceTable }) => sourceTable === destination.sourceTable,
      );
      if (
        !mapping ||
        !mapping.destinationContractDigests.includes(destination.contractDigest) ||
        !confirmedSources.has(destination.sourceTable) ||
        destination.dependencies.some((dependency) => !inventoryBySource.has(dependency))
      ) {
        throw scopeError("CONFIRMED_SCOPE_INVALID");
      }
      return {
        sourceTable: destination.sourceTable,
        stepId: destination.stepId,
        destinationTable: destination.destinationTable,
        dependencies: [...destination.dependencies].sort(compareText),
        contractDigest: destination.contractDigest,
      };
    })
    .sort(compareSteps);

  const destinationCountBySource = Map.groupBy(steps, ({ sourceTable }) => sourceTable);
  for (const mapping of tableMappings) {
    const sourceSteps = destinationCountBySource.get(mapping.sourceTable) ?? [];
    if (
      sourceSteps.length !== mapping.destinationStepCount ||
      !sameStringArray(
        sourceSteps.map(({ contractDigest }) => contractDigest),
        mapping.destinationContractDigests,
      )
    ) {
      throw scopeError("CONFIRMED_SCOPE_INVALID");
    }
  }

  assertUnique(steps, ({ sourceTable, stepId, destinationTable }) =>
    [sourceTable, stepId, destinationTable].join("\0"),
  );

  const counts = {
    origins: sources.length,
    sourceRows: sources.reduce((total, source) => total + source.rowCount, 0),
    steps: steps.length,
  };
  const scope = { sourceDigest, sources, steps, counts };
  return deepFreeze({ ...scope, scopeDigest: digestScope(scope) });
}

export function validateConfirmedScope(scope, packageData) {
  const rebuilt = buildConfirmedScope({
    inventory: packageData.inventory,
    tableMappings: packageData.tableMappings,
    destinationMappings: packageData.destinationMappings,
    sourceDigest: packageData.inventory.sourceDigest,
    pendingMappings: packageData.pendingMappings ?? readPendingMappings(),
  });
  if (scope?.scopeDigest !== digestScope(scope) || scope.scopeDigest !== rebuilt.scopeDigest) {
    throw scopeError("CONFIRMED_SCOPE_DRIFT");
  }
  if (!sameCounts(scope.counts, rebuilt.counts)) {
    throw scopeError("CONFIRMED_SCOPE_DRIFT");
  }
  if (
    packageData.tableMappings.length === CONFIRMED_SCOPE_COUNTS.origins &&
    !sameCounts(scope.counts, CONFIRMED_SCOPE_COUNTS)
  ) {
    throw scopeError("CONFIRMED_SCOPE_METRICS_CHANGED");
  }
  return true;
}

function readPendingMappings() {
  const mappings = JSON.parse(
    readFileSync(new URL("../../pending-mapping/tables.json", import.meta.url), "utf8"),
  );
  if (
    !Array.isArray(mappings) ||
    mappings.some((mapping) => typeof mapping?.sourceTable !== "string")
  ) {
    throw scopeError("CONFIRMED_SCOPE_INVALID");
  }
  return mappings;
}

function validateInputs({
  inventory,
  tableMappings,
  destinationMappings,
  pendingMappings,
  sourceDigest,
}) {
  if (
    !Array.isArray(inventory?.tables) ||
    !Array.isArray(tableMappings) ||
    !Array.isArray(destinationMappings) ||
    !Array.isArray(pendingMappings) ||
    pendingMappings.some((mapping) => typeof mapping?.sourceTable !== "string") ||
    sourceDigest !== inventory.sourceDigest ||
    sourceDigest !== digestSourceInventory(inventory.tables)
  ) {
    throw scopeError("CONFIRMED_SCOPE_INVALID");
  }
  assertUnique(inventory.tables, ({ sourceTable }) => sourceTable);
  for (const table of inventory.tables) {
    if (
      typeof table?.sourceTable !== "string" ||
      !isDigest(table?.sha256) ||
      !Number.isSafeInteger(table?.rowCount) ||
      table.rowCount < 0
    ) {
      throw scopeError("CONFIRMED_SCOPE_INVALID");
    }
  }
  for (const mapping of tableMappings) {
    if (
      typeof mapping?.sourceTable !== "string" ||
      !Number.isSafeInteger(mapping?.sourceRowCount) ||
      !Number.isSafeInteger(mapping?.destinationStepCount) ||
      !Array.isArray(mapping?.destinationContractDigests) ||
      !Array.isArray(mapping?.dependencies) ||
      !mapping.dependencies.every((dependency) => typeof dependency === "string") ||
      !isDigest(mapping?.contractDigest)
    ) {
      throw scopeError("CONFIRMED_SCOPE_INVALID");
    }
  }
  for (const destination of destinationMappings) {
    if (
      typeof destination?.sourceTable !== "string" ||
      typeof destination?.stepId !== "string" ||
      typeof destination?.destinationTable !== "string" ||
      !Array.isArray(destination?.dependencies) ||
      !destination.dependencies.every((dependency) => typeof dependency === "string") ||
      !isDigest(destination?.contractDigest)
    ) {
      throw scopeError("CONFIRMED_SCOPE_INVALID");
    }
  }
}

function digestSourceInventory(tables) {
  return createHash("sha256")
    .update(
      [...tables]
        .sort((left, right) => compareText(left.sourceTable, right.sourceTable))
        .map(({ sourceTable, sha256, rowCount }) => `${sourceTable}\t${sha256}\t${rowCount}`)
        .join("\n"),
      "utf8",
    )
    .digest("hex");
}

function digest(value) {
  return createHash("sha256").update(JSON.stringify(value), "utf8").digest("hex");
}

function digestScope(scope) {
  if (!scope || typeof scope !== "object") return null;
  return digest({
    sourceDigest: scope.sourceDigest,
    sources: scope.sources,
    steps: scope.steps,
    counts: scope.counts,
  });
}

function assertUnique(values, key) {
  const seen = new Set();
  for (const value of values) {
    const valueKey = key(value);
    if (seen.has(valueKey)) throw scopeError("CONFIRMED_SCOPE_INVALID");
    seen.add(valueKey);
  }
}

function deepFreeze(value) {
  if (value !== null && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) deepFreeze(child);
  }
  return value;
}

function sameCounts(actual, expected) {
  return (
    actual?.origins === expected.origins &&
    actual?.sourceRows === expected.sourceRows &&
    actual?.steps === expected.steps
  );
}

function sameStringArray(left, right) {
  if (left.length !== right.length) return false;
  const sortedLeft = [...left].sort(compareText);
  const sortedRight = [...right].sort(compareText);
  return sortedLeft.every((value, index) => value === sortedRight[index]);
}

function compareSources(left, right) {
  return compareText(left.sourceTable, right.sourceTable);
}

function compareSteps(left, right) {
  return compareText(
    [left.sourceTable, left.stepId, left.destinationTable].join("\0"),
    [right.sourceTable, right.stepId, right.destinationTable].join("\0"),
  );
}

function compareText(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
}

function isDigest(value) {
  return typeof value === "string" && /^[a-f0-9]{64}$/.test(value);
}

function scopeError(code) {
  const error = new Error(code);
  error.code = code;
  return error;
}
