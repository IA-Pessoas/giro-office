import { spawn } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { mkdir, open, readFile, rm, stat, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { isDeepStrictEqual } from "node:util";
import { getPrismaOutputPaths } from "./service-registry.mjs";

const scriptPath = fileURLToPath(import.meta.url);
const rootDir = dirname(dirname(scriptPath));
const infraDir = join(rootDir, "infra");
const defaultStateDir = join(rootDir, ".turbo", "prisma");
const defaultLockDir = join(defaultStateDir, "generate.lock");
const defaultStampFile = join(defaultStateDir, "generate.stamp");
const defaultMutationLockFile = join(defaultStateDir, "generate.mutation.lock");
const defaultFlockPath = "/usr/bin/flock";
const flockConflictExitCode = 75;
const flockLockFileDescriptor = 3;
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

export async function acquireLockMutationMutex(
  lockFile,
  { platform = process.platform, spawnImpl = spawn, flockPath = defaultFlockPath } = {},
) {
  if (platform !== "linux") {
    const exited = Promise.resolve({ code: 0, signal: null });
    return {
      holder: null,
      exited,
      release: async () => exited,
    };
  }

  let lockHandle;
  try {
    lockHandle = await open(lockFile, "a");
  } catch (cause) {
    throw new Error(`Linux Prisma lock serialization cannot open ${lockFile}.`, { cause });
  }

  let released = false;
  const release = async () => {
    if (released) return;
    released = true;
    const handle = lockHandle;
    lockHandle = null;
    await handle?.close();
  };

  return new Promise((resolvePromise, reject) => {
    let flock;
    try {
      flock = spawnImpl(
        flockPath,
        [
          "--exclusive",
          "--nonblock",
          "--conflict-exit-code",
          String(flockConflictExitCode),
          String(flockLockFileDescriptor),
        ],
        {
          stdio: ["ignore", "ignore", "pipe", lockHandle.fd],
        },
      );
    } catch (cause) {
      void release().then(
        () =>
          reject(
            new Error(
              `Linux Prisma lock serialization requires ${flockPath}. Install util-linux and retry.`,
              { cause },
            ),
          ),
        reject,
      );
      return;
    }

    let errorOutput = "";
    let acquisitionSettled = false;
    const closeBeforeSettling = (settle) => {
      if (acquisitionSettled) return;
      acquisitionSettled = true;
      void release().then(settle, reject);
    };

    flock.stderr.setEncoding("utf8");
    flock.stderr.on("data", (chunk) => {
      errorOutput += chunk;
    });
    flock.once("error", (cause) => {
      closeBeforeSettling(() =>
        reject(
          new Error(
            `Linux Prisma lock serialization requires ${flockPath}. Install util-linux and retry.`,
            { cause },
          ),
        ),
      );
    });
    flock.once("exit", (code, signal) => {
      if (acquisitionSettled) return;
      if (code === 0) {
        acquisitionSettled = true;
        resolvePromise({ holder: null, exited: Promise.resolve({ code, signal }), release });
        return;
      }
      if (code === flockConflictExitCode) {
        closeBeforeSettling(() => resolvePromise(null));
        return;
      }
      closeBeforeSettling(() =>
        reject(
          new Error(
            `${flockPath} failed before acquiring the Prisma lock mutation mutex ` +
              `(code ${code ?? "null"}, signal ${signal ?? "none"}): ${errorOutput.trim() || "no stderr"}`,
          ),
        ),
      );
    });
  });
}

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

function isCompleteLockMetadata(metadata) {
  return Boolean(
    metadata &&
      Number.isSafeInteger(metadata.pid) &&
      metadata.pid > 0 &&
      Number.isFinite(metadata.acquiredAt) &&
      typeof metadata.token === "string" &&
      metadata.token.length > 0,
  );
}

export function isLockStale(
  metadata,
  { now = Date.now(), staleMs = 5 * 60_000, isAlive = isProcessAlive, lockMtimeMs } = {},
) {
  if (!isCompleteLockMetadata(metadata)) {
    return !Number.isFinite(lockMtimeMs) || now - lockMtimeMs > staleMs;
  }
  return !isAlive(metadata.pid);
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

async function readLockSnapshot(lockDir, readFileImpl, statImpl) {
  const metadata = await readLockOwner(lockDir, readFileImpl);
  let lockMtimeMs;
  if (!isCompleteLockMetadata(metadata)) {
    try {
      lockMtimeMs = (await statImpl(lockDir)).mtimeMs;
    } catch (error) {
      if (error?.code === "ENOENT") return null;
      throw error;
    }
  }
  return { metadata, lockMtimeMs };
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
  const mutationLockFile = options.mutationLockFile ?? defaultMutationLockFile;
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
  const acquireMutationMutex = options.acquireMutationMutex ?? acquireLockMutationMutex;

  await mkdirImpl(stateDir, { recursive: true });
  const desiredStamp = await computeStateHash(schemaInputs, readFileImpl);

  async function publishOwner(ownerToken) {
    let metadataPublished = false;
    try {
      await writeFileImpl(
        join(lockDir, "owner.json"),
        JSON.stringify({ pid: process.pid, acquiredAt: now(), token: ownerToken }),
        "utf8",
      );
      metadataPublished = true;
      return ownerToken;
    } finally {
      if (!metadataPublished) {
        await rmImpl(lockDir, { recursive: true, force: true });
      }
    }
  }

  async function cleanupOwner(ownerToken) {
    while (true) {
      const mutationMutex = await acquireMutationMutex(mutationLockFile);
      if (!mutationMutex) {
        await sleep(250);
        continue;
      }

      try {
        const currentMetadata = await readLockOwner(lockDir, readFileImpl);
        if (currentMetadata?.token === ownerToken) {
          await rmImpl(lockDir, { recursive: true, force: true });
        }
        return;
      } finally {
        await mutationMutex.release();
      }
    }
  }

  async function generateAsOwner(ownerToken) {
    try {
      const freshStamp = await readCurrentStamp(stampFile, readFileImpl);
      if (freshStamp === desiredStamp && (await outputsReady(outputDirs, statImpl))) return;

      await Promise.all(outputDirs.map((dir) => rmImpl(dir, { recursive: true, force: true })));
      await runGenerate();
      await writeFileImpl(stampFile, desiredStamp, "utf8");
    } finally {
      await cleanupOwner(ownerToken);
    }
  }

  while (true) {
    const currentStamp = await readCurrentStamp(stampFile, readFileImpl);
    if (currentStamp === desiredStamp && (await outputsReady(outputDirs, statImpl))) return;

    const mutationMutex = await acquireMutationMutex(mutationLockFile);
    if (!mutationMutex) {
      await sleep(250);
      continue;
    }

    let ownerToken;
    try {
      let acquired = false;
      try {
        await mkdirImpl(lockDir, { recursive: false });
        acquired = true;
      } catch (error) {
        if (error?.code !== "EEXIST") throw error;
      }

      if (acquired) {
        ownerToken = await publishOwner(randomUUID());
      } else {
        const observedLock = await readLockSnapshot(lockDir, readFileImpl, statImpl);
        if (
          observedLock &&
          isLockStale(observedLock.metadata, { now: now(), staleMs, isAlive, ...observedLock })
        ) {
          const currentLock = await readLockSnapshot(lockDir, readFileImpl, statImpl);
          const recoverySnapshotChanged =
            currentLock &&
            (!isDeepStrictEqual(currentLock, observedLock) ||
              !isLockStale(currentLock.metadata, {
                now: now(),
                staleMs,
                isAlive,
                ...currentLock,
              }));

          if (!recoverySnapshotChanged) {
            if (currentLock) {
              await rmImpl(lockDir, { recursive: true, force: true });
            }

            try {
              await mkdirImpl(lockDir, { recursive: false });
              ownerToken = await publishOwner(randomUUID());
            } catch (error) {
              if (error?.code !== "EEXIST") throw error;
            }
          }
        }
      }
    } finally {
      await mutationMutex.release();
    }

    if (ownerToken) return generateAsOwner(ownerToken);
    await sleep(250);
  }
}

if (process.argv[1] && resolve(process.argv[1]) === scriptPath) {
  await ensureGeneratedClients();
}
