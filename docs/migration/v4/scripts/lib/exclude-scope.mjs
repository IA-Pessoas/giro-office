const DEFAULT_EXCLUDED_DOMAINS = Object.freeze([]);

export function parseExcludedDomains(value) {
  if (typeof value !== "string" || value.trim().length === 0) {
    return new Set(DEFAULT_EXCLUDED_DOMAINS);
  }
  return new Set(
    value
      .split(",")
      .map((entry) => entry.trim().toLowerCase())
      .filter((entry) => entry.length > 0),
  );
}

export function isSourceExcludedByPolicy(_sourceTable, domain, excludedDomains) {
  const normalizedDomain = typeof domain === "string" ? domain.trim().toLowerCase() : "";
  if (normalizedDomain.length > 0 && excludedDomains.has(normalizedDomain)) {
    return true;
  }
  return false;
}

export function partitionMappingsByPolicy({
  tableMappings,
  destinationMappings,
  executionRegistry,
  pendingMappings,
  excludedDomains,
}) {
  const excludedSources = new Map();
  const activeTableMappings = [];
  const activeDestinationMappings = [];
  const activePendingMappings = [];

  for (const mapping of tableMappings) {
    if (isSourceExcludedByPolicy(mapping.sourceTable, mapping.domain, excludedDomains)) {
      excludedSources.set(mapping.sourceTable, "DOMAIN_EXCLUDED_BY_POLICY");
      continue;
    }
    activeTableMappings.push(mapping);
  }

  for (const destination of destinationMappings) {
    if (excludedSources.has(destination.sourceTable)) continue;
    activeDestinationMappings.push(destination);
  }

  for (const pending of pendingMappings) {
    if (isSourceExcludedByPolicy(pending.sourceTable, pending.domain, excludedDomains)) {
      excludedSources.set(pending.sourceTable, "DOMAIN_EXCLUDED_BY_POLICY");
      continue;
    }
    activePendingMappings.push(pending);
  }

  const activeExecutionRegistry = new Map();
  for (const [key, entry] of executionRegistry) {
    if (excludedSources.has(entry.sourceTable)) continue;
    activeExecutionRegistry.set(key, entry);
  }

  return Object.freeze({
    excludedSources,
    tableMappings: activeTableMappings,
    destinationMappings: activeDestinationMappings,
    pendingMappings: activePendingMappings,
    executionRegistry: activeExecutionRegistry,
  });
}

export function resolveMigrationSourceDir(env, fallback) {
  const configured = env?.MIGRATION_SOURCE_DIR;
  if (typeof configured === "string" && configured.trim().length > 0) {
    return configured.trim();
  }
  return fallback;
}
