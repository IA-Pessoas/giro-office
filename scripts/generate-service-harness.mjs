import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import {
  buildGeneratedSmokeOperations,
  deriveServiceHarnessConfig,
  extractOpenApiOperationsFromSource,
  formatGeneratedSmokeModule,
  formatServiceRegistryModule,
  mergeServiceRegistryEntry,
} from "./service-harness-lib.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..");

function parseArgs(argv) {
  const args = {};
  for (const entry of argv) {
    if (entry === "--dry-run") {
      args.dryRun = true;
      continue;
    }
    const match = entry.match(/^--([^=]+)=(.*)$/);
    if (match) {
      args[match[1].replace(/-([a-z])/g, (_, char) => char.toUpperCase())] = match[2];
    }
  }
  return args;
}

function readDiscoveredOperations(config) {
  const specPath = path.join(rootDir, config.openapiSpecPath);
  if (!fs.existsSync(specPath)) {
    return [];
  }
  return extractOpenApiOperationsFromSource(fs.readFileSync(specPath, "utf8"));
}

async function loadCurrentRegistry() {
  const registryUrl = pathToFileURL(path.join(__dirname, "service-registry.mjs")).href;
  const module = await import(`${registryUrl}?t=${Date.now()}`);
  return module.serviceRegistry;
}

function applyExistingRegistryDefaults(config, existingEntry, args) {
  if (!existingEntry) {
    return config;
  }

  return {
    ...existingEntry,
    ...config,
    openapiSpecPath:
      args.openapiSpecPath === undefined
        ? (existingEntry.openapiSpecPath ?? config.openapiSpecPath)
        : config.openapiSpecPath,
    authModes:
      args.authModes === undefined
        ? (existingEntry.authModes ?? config.authModes)
        : config.authModes,
    internalTokenEnvKey:
      args.internalTokenEnvKey === undefined
        ? (existingEntry.internalTokenEnvKey ?? config.internalTokenEnvKey)
        : config.internalTokenEnvKey,
    prismaOutputPath:
      args.prismaOutputPath === undefined && args.usesPrisma === undefined
        ? (existingEntry.prismaOutputPath ?? config.prismaOutputPath)
        : config.prismaOutputPath,
  };
}

function buildChecklist(config, routePlaceholders) {
  return [
    `Register ${config.urlEnvKey} in local and deploy env files.`,
    `Confirm gateway routing for ${config.name}.`,
    `Keep ${config.openapiSpecPath} committed and exported by the service.`,
    `Add fixture-backed smoke handlers for ${routePlaceholders.length} non-health route(s).`,
    config.prismaOutputPath
      ? `Confirm Prisma generator output includes ${config.prismaOutputPath}.`
      : "No Prisma output path requested.",
  ];
}

async function buildPlan(args) {
  const currentRegistry = await loadCurrentRegistry();
  const initialConfig = deriveServiceHarnessConfig(args);
  const existingEntry = currentRegistry.find((entry) => entry.name === initialConfig.name);
  const config = applyExistingRegistryDefaults(initialConfig, existingEntry, args);
  const discoveredOperations = readDiscoveredOperations(config);
  const scaffold = buildGeneratedSmokeOperations(config, discoveredOperations);
  const nextRegistry = mergeServiceRegistryEntry(currentRegistry, config);
  const generatedRelativePath = path.join("scripts", "generated", `${config.name}.smoke.mjs`);

  return {
    config,
    discoveredOperations,
    registryPath: "scripts/service-registry.mjs",
    registrySource: formatServiceRegistryModule(nextRegistry),
    generatedSmokePath: generatedRelativePath,
    generatedSmokeSource: formatGeneratedSmokeModule({
      service: config.name,
      operations: scaffold.operations,
      routePlaceholders: scaffold.routePlaceholders,
    }),
    smokeOperations: scaffold.operations,
    routePlaceholders: scaffold.routePlaceholders,
    checklist: buildChecklist(config, scaffold.routePlaceholders),
  };
}

async function writePlan(plan) {
  const registryPath = path.join(rootDir, plan.registryPath);
  const smokePath = path.join(rootDir, plan.generatedSmokePath);

  fs.writeFileSync(registryPath, plan.registrySource, "utf8");
  fs.mkdirSync(path.dirname(smokePath), { recursive: true });
  fs.writeFileSync(smokePath, plan.generatedSmokeSource, "utf8");
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const plan = await buildPlan(args);

  if (args.dryRun) {
    process.stdout.write(
      `${JSON.stringify(
        {
          registryEntry: plan.config,
          generatedSmokePath: plan.generatedSmokePath,
          smokeOperations: plan.smokeOperations,
          routePlaceholders: plan.routePlaceholders,
          checklist: plan.checklist,
        },
        null,
        2,
      )}\n`,
    );
    return;
  }

  await writePlan(plan);
  process.stdout.write(`Updated ${plan.registryPath}\n`);
  process.stdout.write(`Wrote ${plan.generatedSmokePath}\n`);
  for (const item of plan.checklist) {
    process.stdout.write(`- ${item}\n`);
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === __filename) {
  main().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exit(1);
  });
}

export { buildPlan, parseArgs, writePlan };
