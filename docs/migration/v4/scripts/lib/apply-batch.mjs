export function orderSourcesForApply(tableMappings) {
  const bySource = new Map(tableMappings.map((mapping) => [mapping.sourceTable, mapping]));
  const pending = new Set(tableMappings.map(({ sourceTable }) => sourceTable));
  const ordered = [];

  while (pending.size > 0) {
    const ready = [...pending].filter((sourceTable) => {
      const dependencies = bySource.get(sourceTable)?.dependencies ?? [];
      return dependencies.every((dependency) => !pending.has(dependency));
    });
    if (ready.length === 0) {
      throw new Error("MIGRATION_APPLY_DEPENDENCY_CYCLE");
    }
    ready.sort(compareText);
    for (const sourceTable of ready) {
      pending.delete(sourceTable);
      ordered.push(sourceTable);
    }
  }

  return ordered;
}

export function chunkSources(sourceTables, chunkSize) {
  if (!Number.isInteger(chunkSize) || chunkSize < 1) {
    throw new Error("MIGRATION_APPLY_CHUNK_SIZE_INVALID");
  }
  const batches = [];
  for (let index = 0; index < sourceTables.length; index += chunkSize) {
    batches.push(sourceTables.slice(index, index + chunkSize));
  }
  return batches;
}

export function filterPlanSteps(steps, sourceTables) {
  const allowed = new Set(sourceTables);
  return steps.filter(({ sourceTable }) => allowed.has(sourceTable));
}

function compareText(left, right) {
  return String(left).localeCompare(String(right));
}
