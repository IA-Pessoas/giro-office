import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs";
import { mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { getPrismaOutputPaths } from "./service-registry.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
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
  ...getPrismaOutputPaths().map((outputPath) => join(rootDir, outputPath)),
];

export function loadEnvFile(filePath, env = process.env) {
  if (!fs.existsSync(filePath)) {
    return;
  }

  const envContent = fs.readFileSync(filePath, "utf8");

  for (const line of envContent.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    const eqIndex = trimmed.indexOf("=");
    if (eqIndex === -1) continue;

    const key = trimmed.slice(0, eqIndex).trim();
    let value = trimmed.slice(eqIndex + 1).trim();

    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    if (!(key in env)) {
      env[key] = value;
    }
  }
}

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
    outputDirs.map(
      async (dir) =>
        (await fileExists(join(dir, "client.ts"))) || (await fileExists(join(dir, "client.js"))),
    ),
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
  await Promise.all(outputDirs.map((dir) => rm(dir, { recursive: true, force: true })));
}

async function runPrismaGenerate() {
  loadEnvFile(join(rootDir, ".env"));

  await new Promise((resolve, reject) => {
    const child = spawn("corepack pnpm exec prisma generate", [], {
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

if (process.argv[1] && __filename === resolve(process.argv[1])) {
  await ensureGeneratedClients();
}
