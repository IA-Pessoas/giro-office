import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { realpathSync } from "node:fs";
import { cp, mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { getPrismaOutputPaths } from "./service-registry.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = dirname(__dirname);
const infraDir = join(rootDir, "infra");
const stateDir = join(rootDir, ".turbo", "prisma");
const lockDir = join(stateDir, "generate.lock");
const stampFile = join(stateDir, "generate.stamp");
const infraOutputDir = join(rootDir, "infra", "generated", "prisma");
const canonicalServiceOutputDir = join(
  rootDir,
  "services",
  "user-service",
  "src",
  "generated",
  "prisma",
);
const serviceOutputDirs = getPrismaOutputPaths().map((outputPath) => join(rootDir, outputPath));

const schemaInputs = [
  join(rootDir, "infra", "prisma", "schema.prisma"),
  join(rootDir, "infra", "prisma.config.ts"),
  join(rootDir, "infra", "package.json"),
  join(rootDir, "pnpm-lock.yaml"),
  join(__dirname, "prisma-generate.mjs"),
  join(__dirname, "service-registry.mjs"),
];

const outputDirs = [infraOutputDir, ...serviceOutputDirs];

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
  await new Promise((resolve, reject) => {
    const child = spawn(
      "corepack pnpm exec prisma generate --generator infraClient --generator userServiceClient",
      [],
      {
        cwd: infraDir,
        stdio: "inherit",
        shell: true,
        env: {
          ...process.env,
          DATABASE_URL:
            process.env.DATABASE_URL ?? "postgresql://localhost:5432/giro_build?schema=public",
        },
      },
    );

    child.on("exit", (code) => {
      if (code === 0) {
        resolve();
        return;
      }

      reject(new Error(`prisma generate exited with code ${code ?? "null"}`));
    });

    child.on("error", reject);
  });

  await Promise.all(
    serviceOutputDirs
      .filter((outputDir) => outputDir !== canonicalServiceOutputDir)
      .map((outputDir) => cp(canonicalServiceOutputDir, outputDir, { recursive: true })),
  );
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

// O lock e um mkdir e so o `finally` do detentor o remove. Se esse processo morre sem
// rodar o finally (SIGKILL, timeout de CI, terminal fechado), o diretorio fica para tras
// e todo processo seguinte espera para sempre no laco abaixo.
// ponytail: descarta o lock pela idade; se a geracao passar a demorar mais que
// LOCK_STALE_MS, grave o PID no lock e cheque se o processo ainda vive.
export const LOCK_STALE_MS = 10 * 60 * 1000;

export async function clearStaleLock(now = Date.now()) {
  let info;
  try {
    info = await stat(lockDir);
  } catch {
    return false;
  }

  if (now - info.mtimeMs <= LOCK_STALE_MS) {
    return false;
  }

  await rm(lockDir, { recursive: true, force: true });
  return true;
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

    await clearStaleLock();
    await sleep(250);
  }
}

// Roda a geracao so quando invocado como script; importar o modulo (nos testes) nao dispara nada.
if (
  process.argv[1] &&
  realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url))
) {
  await ensureGeneratedClients();
}
