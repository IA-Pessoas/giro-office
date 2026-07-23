import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";

const GIB = 1024 ** 3;

export const DEV_PROFILES = Object.freeze({
  low: Object.freeze({ name: "low", batchSize: 1, batchDelayMs: 2500 }),
  normal: Object.freeze({ name: "normal", batchSize: 2, batchDelayMs: 1500 }),
  fast: Object.freeze({ name: "fast", batchSize: 4, batchDelayMs: 500 }),
});

export function readPositiveInteger(name, value) {
  if (value === undefined || value === "") {
    return undefined;
  }

  if (!/^\d+$/.test(value)) {
    throw new Error(`${name} must be a positive integer.`);
  }

  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    throw new Error(`${name} must be a positive integer.`);
  }

  return parsed;
}

export function selectDevProfile({ env, cpuCount, totalMemoryBytes }) {
  const requestedProfile = env.DEV_PROFILE;
  if (requestedProfile !== undefined && !(requestedProfile in DEV_PROFILES)) {
    throw new Error(`DEV_PROFILE must be one of: ${Object.keys(DEV_PROFILES).join(", ")}.`);
  }

  const automaticProfile =
    cpuCount <= 4 || totalMemoryBytes <= 12 * GIB
      ? "low"
      : cpuCount <= 8 || totalMemoryBytes <= 24 * GIB
        ? "normal"
        : "fast";
  const selected = DEV_PROFILES[requestedProfile ?? automaticProfile];

  return {
    name: selected.name,
    batchSize:
      readPositiveInteger("DEV_START_BATCH_SIZE", env.DEV_START_BATCH_SIZE) ?? selected.batchSize,
    batchDelayMs:
      readPositiveInteger("DEV_START_DELAY_MS", env.DEV_START_DELAY_MS) ?? selected.batchDelayMs,
  };
}

export function resolvePackageBin({ packageDir, packageName, binName }) {
  const requireFromPackage = createRequire(join(packageDir, "package.json"));
  const packageJsonPath = requireFromPackage.resolve(`${packageName}/package.json`);
  const packageJson = JSON.parse(readFileSync(packageJsonPath, "utf8"));
  const bin = typeof packageJson.bin === "string" ? packageJson.bin : packageJson.bin?.[binName];

  if (typeof bin !== "string" || bin.length === 0) {
    throw new Error(`Unable to resolve ${binName} from ${packageName} in ${packageDir}.`);
  }

  return resolve(dirname(packageJsonPath), bin);
}

function createServiceTarget(rootDir, service, resolveBin) {
  const packageDir = resolve(rootDir, service.packagePath);
  const url = new URL(service.defaultUrl);

  return {
    name: service.name,
    kind: service.name === "gateway" ? "gateway" : "service",
    packageDir,
    command: process.execPath,
    args: [
      resolveBin({ packageDir, packageName: "tsx", binName: "tsx" }),
      "watch",
      "--exclude",
      "../../shared/dist/**",
      "src/server.ts",
    ],
    port: Number(url.port),
    readiness: {
      type: "http",
      url: new URL("/health", url).toString(),
    },
  };
}

export function createDevTargets({ rootDir, registry, resolveBin = resolvePackageBin }) {
  const sharedDir = resolve(rootDir, "shared");
  const appDir = resolve(rootDir, "app");
  const gateway = registry.find((service) => service.name === "gateway");
  const domainServices = registry.filter((service) => service.name !== "gateway");

  if (!gateway) {
    throw new Error("The service registry must contain gateway.");
  }

  return [
    {
      name: "shared",
      kind: "shared",
      packageDir: sharedDir,
      command: process.execPath,
      args: [
        resolveBin({ packageDir: sharedDir, packageName: "typescript", binName: "tsc" }),
        "--watch",
        "--preserveWatchOutput",
      ],
      readiness: {
        type: "output",
        successPattern: /Found 0 errors?\. Watching for file changes\./,
        failurePattern: /Found [1-9]\d* errors?\. Watching for file changes\./,
      },
    },
    ...domainServices.map((service) => createServiceTarget(rootDir, service, resolveBin)),
    createServiceTarget(rootDir, gateway, resolveBin),
    {
      name: "app",
      kind: "app",
      packageDir: appDir,
      command: process.execPath,
      args: [
        resolveBin({ packageDir: appDir, packageName: "next", binName: "next" }),
        "dev",
        "--webpack",
      ],
      port: 3000,
      readiness: {
        type: "tcp",
        host: "127.0.0.1",
        port: 3000,
      },
    },
  ];
}
