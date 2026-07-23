import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { getPrismaOutputPaths } from "./service-registry.mjs";

const scriptPath = fileURLToPath(import.meta.url);
const rootDir = dirname(dirname(scriptPath));
const infraDir = join(rootDir, "infra");
const defaultStateDir = join(rootDir, ".turbo", "prisma");
const defaultLockDir = join(defaultStateDir, "generate.lock");
const defaultStampFile = join(defaultStateDir, "generate.stamp");
const defaultSchemaInputs = [
  join(rootDir, "infra", "prisma", "schema.prisma"),
  join(rootDir, "infra", "prisma.config.ts"),
  join(rootDir, "infra", "package.json"),
  join(rootDir, "pnpm-lock.yaml"),
];
const defaultOutputDirs = [
  join(rootDir, "infra", "generated", "prisma"),
  ...getPrismaOutputPaths().map((outputPath) => join(rootDir, outputPath)),
];

const defaultSleep = (milliseconds) =>
  new Promise((resolvePromise) => setTimeout(resolvePromise, milliseconds));

export function createPnpmCommand(args, env = process.env) {
  const npmExecPath = env.npm_execpath;
  if (npmExecPath && /(?:^|[\\/])pnpm(?:\.c?js)?$/i.test(npmExecPath)) {
    return {
      command: process.execPath,
      args: [npmExecPath, ...args],
    };
  }

  return {
    command: "corepack",
    args: ["pnpm", ...args],
  };
}

export function isProcessAlive(pid, killImpl = process.kill.bind(process)) {
  if (!Number.isSafeInteger(pid) || pid <= 0) return false;
  try {
    killImpl(pid, 0);
    return true;
  } catch (error) {
    if (error?.code === "ESRCH") return false;
    if (error?.code === "EPERM") return true;
    throw error;
  }
}

export function isLockStale(
  metadata,
  { now = Date.now(), staleMs = 5 * 60_000, isAlive = isProcessAlive } = {},
) {
  if (
    !metadata ||
    !Number.isSafeInteger(metadata.pid) ||
    metadata.pid <= 0 ||
    !Number.isFinite(metadata.acquiredAt)
  ) {
    return true;
  }
  return now - metadata.acquiredAt > staleMs || !isAlive(metadata.pid);
}

async function fileExists(path, statImpl) {
  try {
    await statImpl(path);
    return true;
  } catch {
    return false;
  }
}

async function outputsReady(outputDirs, statImpl) {
  const results = await Promise.all(
    outputDirs.map(
      async (dir) =>
        (await fileExists(join(dir, "client.ts"), statImpl)) ||
        (await fileExists(join(dir, "client.js"), statImpl)),
    ),
  );
  return results.every(Boolean);
}

async function computeStateHash(schemaInputs, readFileImpl) {
  const hash = createHash("sha256");
  for (const input of schemaInputs) hash.update(await readFileImpl(input));
  return hash.digest("hex");
}

async function readCurrentStamp(stampFile, readFileImpl) {
  try {
    return (await readFileImpl(stampFile, "utf8")).trim();
  } catch {
    return "";
  }
}

async function readLockOwner(lockDir, readFileImpl) {
  try {
    return JSON.parse(await readFileImpl(join(lockDir, "owner.json"), "utf8"));
  } catch {
    return null;
  }
}

export async function runPrismaGenerate({
  spawnImpl = spawn,
  env = process.env,
  cwd = infraDir,
} = {}) {
  await new Promise((resolvePromise, reject) => {
    const pnpm = createPnpmCommand(["exec", "prisma", "generate"], env);
    const child = spawnImpl(pnpm.command, pnpm.args, {
      cwd,
      stdio: "inherit",
      env,
    });

    child.on("exit", (code) => {
      if (code === 0) resolvePromise();
      else reject(new Error(`prisma generate exited with code ${code ?? "null"}`));
    });
    child.on("error", reject);
  });
}

export async function ensureGeneratedClients(options = {}) {
  const stateDir = options.stateDir ?? defaultStateDir;
  const lockDir = options.lockDir ?? defaultLockDir;
  const stampFile = options.stampFile ?? defaultStampFile;
  const schemaInputs = options.schemaInputs ?? defaultSchemaInputs;
  const outputDirs = options.outputDirs ?? defaultOutputDirs;
  const mkdirImpl = options.mkdirImpl ?? mkdir;
  const readFileImpl = options.readFileImpl ?? readFile;
  const writeFileImpl = options.writeFileImpl ?? writeFile;
  const rmImpl = options.rmImpl ?? rm;
  const statImpl = options.statImpl ?? stat;
  const sleep = options.sleep ?? defaultSleep;
  const runGenerate = options.runGenerate ?? runPrismaGenerate;
  const staleMs = options.staleMs ?? 5 * 60_000;
  const isAlive = options.isAlive ?? isProcessAlive;
  const now = options.now ?? Date.now;

  await mkdirImpl(stateDir, { recursive: true });
  const desiredStamp = await computeStateHash(schemaInputs, readFileImpl);

  while (true) {
    const currentStamp = await readCurrentStamp(stampFile, readFileImpl);
    if (currentStamp === desiredStamp && (await outputsReady(outputDirs, statImpl))) return;

    let acquired = false;
    try {
      await mkdirImpl(lockDir, { recursive: false });
      acquired = true;
    } catch (error) {
      if (error?.code !== "EEXIST") throw error;
    }

    if (acquired) {
      try {
        await writeFileImpl(
          join(lockDir, "owner.json"),
          JSON.stringify({ pid: process.pid, acquiredAt: now() }),
          "utf8",
        );
        const freshStamp = await readCurrentStamp(stampFile, readFileImpl);
        if (freshStamp === desiredStamp && (await outputsReady(outputDirs, statImpl))) return;

        await Promise.all(outputDirs.map((dir) => rmImpl(dir, { recursive: true, force: true })));
        await runGenerate();
        await writeFileImpl(stampFile, desiredStamp, "utf8");
        return;
      } finally {
        await rmImpl(lockDir, { recursive: true, force: true });
      }
    }

    const metadata = await readLockOwner(lockDir, readFileImpl);
    if (isLockStale(metadata, { now: now(), staleMs, isAlive })) {
      await rmImpl(lockDir, { recursive: true, force: true });
      continue;
    }

    await sleep(250);
  }
}

if (process.argv[1] && resolve(process.argv[1]) === scriptPath) {
  await ensureGeneratedClients();
}
