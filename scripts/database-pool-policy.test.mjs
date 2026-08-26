import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const poolConstructorPattern = /new\s+(?:PrismaPg|Pool)\s*\(/gu;
const ignoredDirectoryNames = new Set(["dist", "generated", "node_modules", "test", "tests"]);

function discoverRuntimePoolFiles(directory = path.join(root, "services")) {
  const discovered = [];
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (!ignoredDirectoryNames.has(entry.name)) {
        discovered.push(...discoverRuntimePoolFiles(path.join(directory, entry.name)));
      }
      continue;
    }
    if (!entry.isFile() || !/\.[cm]?[jt]s$/u.test(entry.name)) {
      continue;
    }
    const absolutePath = path.join(directory, entry.name);
    const source = fs.readFileSync(absolutePath, "utf8");
    const constructorCount = [...source.matchAll(poolConstructorPattern)].length;
    if (constructorCount > 0) {
      discovered.push({
        relativePath: path.relative(root, absolutePath),
        source,
        constructorCount,
      });
    }
  }
  return discovered;
}

const poolerSessionSize = 20;
const rolloutPoolSize = 40;
const rolloutOverlapFactor = 2;

test("todos os pools de runtime possuem teto explicito e configuravel", () => {
  const runtimePoolFiles = discoverRuntimePoolFiles();
  assert.ok(runtimePoolFiles.length > 0, "nenhum pool de runtime foi descoberto");
  for (const { relativePath, source } of runtimePoolFiles) {
    assert.match(source, /max:/u, `${relativePath} precisa definir max`);
    assert.match(
      source,
      /DATABASE_POOL_MAX|databasePoolMax/u,
      `${relativePath} precisa consumir DATABASE_POOL_MAX`,
    );
    assert.match(
      source,
      /connectionTimeoutMillis:/u,
      `${relativePath} precisa limitar espera por conexao`,
    );
    assert.match(
      source,
      /DATABASE_POOL_CONNECTION_TIMEOUT_MS/u,
      `${relativePath} precisa consumir DATABASE_POOL_CONNECTION_TIMEOUT_MS`,
    );
  }
});

test("orcamento de conexoes cabe no pooler em regime e durante rollout", () => {
  const runtimePoolFiles = discoverRuntimePoolFiles();
  const constructorsByService = new Map();
  for (const { relativePath, constructorCount } of runtimePoolFiles) {
    const serviceName = relativePath.split(path.sep)[1];
    constructorsByService.set(
      serviceName,
      (constructorsByService.get(serviceName) ?? 0) + constructorCount,
    );
  }
  const compose = fs.readFileSync(path.join(root, "docker-compose.vps.yml"), "utf8");
  const composePoolProcesses = [...compose.matchAll(/- \.env\.vps\.([a-z0-9-]+)/gu)]
    .map((match) => match[1])
    .filter((serviceName) => constructorsByService.has(serviceName));
  const steadyStateSlots = composePoolProcesses.reduce(
    (total, serviceName) => total + constructorsByService.get(serviceName),
    0,
  );

  assert.equal(steadyStateSlots, 18, "budget versionado precisa refletir os processos do Compose");
  assert.ok(
    steadyStateSlots <= poolerSessionSize,
    `budget de ${steadyStateSlots} excede pooler session mode de ${poolerSessionSize}`,
  );
  assert.ok(
    steadyStateSlots * rolloutOverlapFactor <= rolloutPoolSize,
    `rollout requer ${steadyStateSlots * rolloutOverlapFactor} slots, acima de ${rolloutPoolSize}`,
  );

  const exampleFiles = [
    path.join(root, ".env.example"),
    ...fs
      .readdirSync(path.join(root, "services"), { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => path.join(root, "services", entry.name, ".env.example"))
      .filter((file) => fs.existsSync(file)),
  ];
  for (const file of exampleFiles) {
    const match = fs.readFileSync(file, "utf8").match(/^DATABASE_POOL_MAX=(.+)$/mu);
    if (match) {
      assert.equal(
        match[1],
        "1",
        `${path.relative(root, file)} precisa preservar DATABASE_POOL_MAX=1`,
      );
    }
  }
});

test("migrations preferem DIRECT_URL e preservam fallback local", () => {
  const source = fs.readFileSync(path.join(root, "infra/prisma.config.ts"), "utf8");
  assert.match(source, /process\.env\.DIRECT_URL\s*\?\?/u);
  assert.match(source, /env\("DATABASE_URL"\)/u);
});

test("guards de banco e deploy executam em todo pull request", () => {
  const workflow = fs.readFileSync(
    path.join(root, ".github/workflows/database-resilience-guard.yml"),
    "utf8",
  );
  assert.match(workflow, /^on:\s*\n\s+pull_request:/mu);
  assert.match(workflow, /node --test scripts\/database-pool-policy\.test\.mjs/u);
  assert.match(workflow, /node --test scripts\/production-deploy\.test\.mjs/u);
  assert.doesNotMatch(workflow, /pnpm install|npm install/u);
});
