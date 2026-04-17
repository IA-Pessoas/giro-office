import { createHash } from "node:crypto";
import { mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = dirname(__dirname);
const infraDir = join(rootDir, "infra");
const stateDir = join(rootDir, ".turbo", "prisma");
const lockDir = join(stateDir, "generate.lock");
const stampFile = join(stateDir, "generate.stamp");

const schemaInputs = [
  join(rootDir, "infra", "prisma", "schema.prisma"),
  join(rootDir, "infra", "prisma.config.ts"),
  join(rootDir, "infra", "package.json"),
  join(rootDir, "pnpm-lock.yaml"),
];

const outputDirs = [
  join(rootDir, "infra", "generated", "prisma"),
  join(rootDir, "services", "user-service", "src", "generated", "prisma"),
  join(rootDir, "services", "task-service", "src", "generated", "prisma"),
  join(rootDir, "services", "project-service", "src", "generated", "prisma"),
  join(rootDir, "services", "client-service", "src", "generated", "prisma"),
  join(rootDir, "services", "organization-service", "src", "generated", "prisma"),
  join(rootDir, "services", "audit-service", "generated", "prisma"),
  join(rootDir, "services", "rh-service", "src", "generated", "prisma"),
];

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fileExists(path) {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

async function outputsReady() {
  const results = await Promise.all(
    outputDirs.map(async (dir) => (await fileExists(join(dir, "client.ts"))) || (await fileExists(join(dir, "client.js")))),
  );
  return results.every(Boolean);
}

async function computeStateHash() {
  const hash = createHash("sha256");

  for (const input of schemaInputs) {
    hash.update(await readFile(input));
  }

  return hash.digest("hex");
}

async function readCurrentStamp() {
  try {
    return (await readFile(stampFile, "utf8")).trim();
  } catch {
    return "";
  }
}

async function cleanOutputs() {
  await Promise.all(
    outputDirs.map((dir) => rm(dir, { recursive: true, force: true })),
  );
}

async function runPrismaGenerate() {
  await new Promise((resolve, reject) => {
    const child = spawn("pnpm exec prisma generate", [], {
      cwd: infraDir,
      stdio: "inherit",
      shell: true,
      env: process.env,
    });

    child.on("exit", (code) => {
      if (code === 0) {
        resolve();
        return;
      }

      reject(new Error(`prisma generate exited with code ${code ?? "null"}`));
    });

    child.on("error", reject);
  });
}

async function tryAcquireLock() {
  try {
    await mkdir(lockDir, { recursive: false });
    return true;
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "EEXIST") {
      return false;
    }

    throw error;
  }
}

async function ensureGeneratedClients() {
  await mkdir(stateDir, { recursive: true });

  const desiredStamp = await computeStateHash();

  while (true) {
    const currentStamp = await readCurrentStamp();
    if (currentStamp === desiredStamp && (await outputsReady())) {
      return;
    }

    if (await tryAcquireLock()) {
      try {
        const freshStamp = await readCurrentStamp();
        if (freshStamp === desiredStamp && (await outputsReady())) {
          return;
        }

        await cleanOutputs();
        await runPrismaGenerate();
        await writeFile(stampFile, desiredStamp, "utf8");
        return;
      } finally {
        await rm(lockDir, { recursive: true, force: true });
      }
    }

    await sleep(250);
  }
}

await ensureGeneratedClients();
