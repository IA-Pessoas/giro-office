import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..");

const manifestModule = await import(
  pathToFileURL(path.join(__dirname, "all-services-smoke.manifest.mjs")).href
);
const registryModule = await import(
  pathToFileURL(path.join(__dirname, "service-registry.mjs")).href
);
const harnessModule = await import(
  pathToFileURL(path.join(__dirname, "service-harness-lib.mjs")).href
);

const { EXEMPT_SPEC_OPERATION_KEYS, manifest, specFiles } = manifestModule;
const { serviceRegistry } = registryModule;
const { extractOpenApiOperationsFromSource } = harnessModule;

function extractWorkspaceServicePackagePaths() {
  const workspacePath = path.join(rootDir, "pnpm-workspace.yaml");
  const source = fs.readFileSync(workspacePath, "utf8");
  return [...source.matchAll(/^\s*-\s+"?(services\/[^"*?]+)"?\s*$/gm)].map((match) => match[1]);
}

function extractSpecOperations(specPath, service) {
  const source = fs.readFileSync(specPath, "utf8");
  return extractOpenApiOperationsFromSource(source).map((operation) => ({ service, ...operation }));
}

function asKey(entry) {
  return `${entry.service}|${entry.method}|${entry.path}`;
}

function hasValidExpectedStatus(entry) {
  return (
    Array.isArray(entry.expectedStatus) &&
    entry.expectedStatus.length > 0 &&
    entry.expectedStatus.every(
      (status) => Number.isInteger(status) && status >= 100 && status <= 599,
    )
  );
}

const specOperations = Object.entries(specFiles).flatMap(([service, relativeSpecPath]) =>
  extractSpecOperations(path.join(rootDir, relativeSpecPath), service),
);

const manifestOperations = manifest.filter((entry) => entry.specOperation !== false);
const malformedEntries = manifest.filter(
  (entry) =>
    !["good", "bad"].includes(entry.expectationKind) ||
    !hasValidExpectedStatus(entry) ||
    typeof entry.expectedLabel !== "string" ||
    entry.expectedLabel.trim() === "",
);

const routeGroups = new Map();
for (const entry of manifest) {
  const key = asKey(entry);
  if (!routeGroups.has(key)) {
    routeGroups.set(key, []);
  }
  routeGroups.get(key).push(entry);
}

const missingGood = [];
const missingBad = [];
const malformedGroups = [];

for (const [key, entries] of routeGroups.entries()) {
  if (entries.some((entry) => entry.pairCoverageExempt)) {
    continue;
  }

  const goodCount = entries.filter((entry) => entry.expectationKind === "good").length;
  const badCount = entries.filter((entry) => entry.expectationKind === "bad").length;

  if (goodCount !== 1) {
    malformedGroups.push(`${key} (good entries: ${goodCount})`);
  }

  if (goodCount < 1) {
    missingGood.push(key);
  }

  if (badCount < 1) {
    missingBad.push(key);
  }
}

const specKeys = new Set(
  specOperations
    .filter((operation) => !EXEMPT_SPEC_OPERATION_KEYS.has(asKey(operation)))
    .map(asKey),
);
const manifestKeys = new Set(manifestOperations.map(asKey));

const missing = [...specKeys].filter((key) => !manifestKeys.has(key));
const extra = [...manifestKeys].filter((key) => !specKeys.has(key));
const workspaceServicePaths = extractWorkspaceServicePackagePaths();
const registryPackagePaths = new Set(serviceRegistry.map((service) => service.packagePath));
const registryServices = new Set(serviceRegistry.map((service) => service.name));
const servicesMissingFromRegistry = workspaceServicePaths.filter(
  (servicePath) => !registryPackagePaths.has(servicePath),
);
const specServicesMissingCoverage = Object.keys(specFiles).filter(
  (service) =>
    registryServices.has(service) && !manifestOperations.some((entry) => entry.service === service),
);

if (
  missing.length > 0 ||
  extra.length > 0 ||
  malformedEntries.length > 0 ||
  malformedGroups.length > 0 ||
  missingGood.length > 0 ||
  missingBad.length > 0 ||
  servicesMissingFromRegistry.length > 0 ||
  specServicesMissingCoverage.length > 0
) {
  if (servicesMissingFromRegistry.length > 0) {
    console.error("Workspace services missing from scripts/service-registry.mjs:");
    for (const servicePath of servicesMissingFromRegistry) {
      console.error(`  - ${servicePath}`);
    }
  }

  if (specServicesMissingCoverage.length > 0) {
    console.error("Registry services with OpenAPI specs but no smoke manifest coverage:");
    for (const service of specServicesMissingCoverage) {
      console.error(`  - ${service}`);
    }
  }

  if (missing.length > 0) {
    console.error("Missing manifest operations:");
    for (const key of missing) {
      console.error(`  - ${key}`);
    }
  }

  if (extra.length > 0) {
    console.error("Manifest operations not found in spec.ts:");
    for (const key of extra) {
      console.error(`  - ${key}`);
    }
  }

  if (malformedEntries.length > 0) {
    console.error("Manifest entries with malformed expectation metadata:");
    for (const entry of malformedEntries) {
      console.error(`  - ${entry.id}`);
    }
  }

  if (malformedGroups.length > 0) {
    console.error("Route groups with malformed good/bad structure:");
    for (const key of malformedGroups) {
      console.error(`  - ${key}`);
    }
  }

  if (missingGood.length > 0) {
    console.error("Route groups missing a good expectation:");
    for (const key of missingGood) {
      console.error(`  - ${key}`);
    }
  }

  if (missingBad.length > 0) {
    console.error("Route groups missing a bad expectation:");
    for (const key of missingBad) {
      console.error(`  - ${key}`);
    }
  }

  process.exit(1);
}

console.log(
  `Smoke manifest coverage OK: ${manifestOperations.length}/${specOperations.length} operations mapped with paired expectations.`,
);
