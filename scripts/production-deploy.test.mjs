import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const deployScript = path.join(repoRoot, "scripts", "ops", "deploy-production.sh");
const webEnvLoader = path.join(repoRoot, "scripts", "ops", "load-production-web-env.sh");
const endpointWaiter = path.join(repoRoot, "scripts", "ops", "wait-production-endpoints.sh");
const turboConfig = path.join(repoRoot, "turbo.json");
const serviceDockerfile = path.join(repoRoot, "docker", "service.Dockerfile");
const appDockerfile = path.join(repoRoot, "docker", "app.Dockerfile");
const reportsWorker = path.join(repoRoot, "services", "reports-service", "src", "worker.ts");
const poolBudgetValidator = path.join(
  repoRoot,
  "scripts",
  "ops",
  "validate-database-pool-budget.mjs",
);
const vpsCompose = path.join(repoRoot, "docker-compose.vps.yml");

function createPoolEnvRoot(databasePoolMax = "1") {
  const envRoot = mkdtempSync(path.join(tmpdir(), "database-pool-budget-"));
  const compose = readFileSync(vpsCompose, "utf8");
  const names = [...compose.matchAll(/- \.env\.vps\.([a-z0-9-]+)/gu)].map((match) => match[1]);
  for (const name of new Set(names)) {
    writeFileSync(path.join(envRoot, `.env.vps.${name}`), `DATABASE_POOL_MAX=${databasePoolMax}\n`);
  }
  return envRoot;
}

test("production service image invalidates copied TypeScript incremental state before build", () => {
  const dockerfile = readFileSync(serviceDockerfile, "utf8");
  const appDockerfileContents = readFileSync(appDockerfile, "utf8");
  const installIndex = dockerfile.indexOf("RUN pnpm install --frozen-lockfile");
  const buildArgumentIndex = dockerfile.indexOf("ARG WORKSPACE_PACKAGE");
  const cleanupIndex = dockerfile.indexOf(
    'rm -rf "${SERVICE_DIR}/dist" "${SERVICE_DIR}/tsconfig.tsbuildinfo"',
  );
  const buildIndex = dockerfile.indexOf('pnpm turbo run build --filter="${WORKSPACE_PACKAGE}"');

  assert.ok(installIndex >= 0, "frozen install must remain present");
  assert.match(
    dockerfile,
    /pnpm install --frozen-lockfile --ignore-scripts/u,
    "service dependency install must explicitly ignore dependency build scripts",
  );
  assert.match(
    appDockerfileContents,
    /pnpm install --frozen-lockfile --ignore-scripts/u,
    "web dependency install must explicitly ignore dependency build scripts",
  );
  assert.ok(
    buildArgumentIndex > installIndex,
    "service-specific args must not invalidate dependency install cache",
  );
  assert.ok(cleanupIndex >= 0, "service build must remove copied incremental state");
  assert.ok(buildIndex >= 0, "service build command must remain present");
  assert.ok(cleanupIndex < buildIndex, "incremental state must be removed before tsc runs");
});

test("reports worker keeps its polling timer referenced", () => {
  const worker = readFileSync(reportsWorker, "utf8");

  assert.doesNotMatch(worker, /\.unref\(\)/u);
});

test("production build forwards the internal API URL through Turbo strict env", () => {
  const config = JSON.parse(readFileSync(turboConfig, "utf8"));

  assert.ok(config.tasks.build.env.includes("API_INTERNAL_URL"));
});

test("production endpoint waiter preserves external network names", () => {
  const external = spawnSync("bash", [endpointWaiter, "--resolve-network", "public-edge"], {
    encoding: "utf8",
    env: { ...process.env, COMPOSE_PROJECT_NAME: "giro-office-production" },
  });
  const internal = spawnSync("bash", [endpointWaiter, "--resolve-network", "backend"], {
    encoding: "utf8",
    env: { ...process.env, COMPOSE_PROJECT_NAME: "giro-office-production" },
  });

  assert.equal(external.status, 0, external.stderr);
  assert.equal(external.stdout.trim(), "public-edge");
  assert.equal(internal.status, 0, internal.stderr);
  assert.equal(internal.stdout.trim(), "giro-office-production_backend");
});

test("production web env is exported for Docker build arguments", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "production-web-env-"));
  const envFile = path.join(dir, ".env.vps.web");
  writeFileSync(envFile, "NEXT_PUBLIC_API_URL=/api\nAPI_INTERNAL_URL=http://gateway:3010\n");
  const command = [
    'source "$1" "$2"',
    'printf "%s|%s" "$NEXT_PUBLIC_API_URL" "$API_INTERNAL_URL"',
  ].join("; ");
  const result = spawnSync("bash", ["-c", command, "_", webEnvLoader, envFile], {
    cwd: repoRoot,
    encoding: "utf8",
  });

  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout, "/api|http://gateway:3010");
  assert.doesNotMatch(readFileSync(appDockerfile, "utf8"), /NEXT_PUBLIC_AUTH_COOKIE_SECURE/);
});

test("production deploy plans validation and build before replacing containers", () => {
  const result = spawnSync("bash", [deployScript], {
    cwd: repoRoot,
    encoding: "utf8",
    env: { ...process.env, DEPLOY_DRY_RUN: "1" },
  });
  assert.equal(result.status, 0, result.stderr);
  const output = result.stdout;

  const expectedOrder = [
    "validate-env",
    "database-pool-budget",
    "compose-config",
    "build-images-sequentially",
    "database-migrate",
    "compose-up",
    "wait-endpoints",
  ];
  let previousIndex = -1;
  for (const marker of expectedOrder) {
    const index = output.indexOf(marker);
    assert.ok(index > previousIndex, `${marker} must appear after the previous phase`);
    previousIndex = index;
  }
});

test("production pool preflight validates actual envs against rollout capacity", () => {
  const validEnvRoot = createPoolEnvRoot("1");
  const valid = spawnSync("node", [poolBudgetValidator, validEnvRoot], {
    cwd: repoRoot,
    encoding: "utf8",
    env: { ...process.env, DATABASE_POOLER_SIZE: "40" },
  });
  assert.equal(valid.status, 0, valid.stderr);
  assert.match(valid.stdout, /steady=18.*rollout=36.*pooler=40/u);

  const oversizedEnvRoot = createPoolEnvRoot("1");
  writeFileSync(path.join(oversizedEnvRoot, ".env.vps.rh-service"), "DATABASE_POOL_MAX=5\n");
  const oversized = spawnSync("node", [poolBudgetValidator, oversizedEnvRoot], {
    cwd: repoRoot,
    encoding: "utf8",
    env: { ...process.env, DATABASE_POOLER_SIZE: "40" },
  });
  assert.equal(oversized.status, 1);
  assert.match(oversized.stderr, /rollout requer 44 slots.*pooler possui 40/u);
});

test("production deploy preserves rollback image tags before overwriting production tags", () => {
  const script = readFileSync(deployScript, "utf8");
  const snapshotIndex = script.indexOf('docker image tag "$image" "$backup_image"');
  const buildIndex = script.lastIndexOf("phase build-images-sequentially");
  const restoreIndex = script.indexOf('docker image tag "$backup_image" "$image"');

  assert.ok(snapshotIndex >= 0, "current images must receive durable rollback tags");
  assert.ok(buildIndex >= 0, "sequential build phase must remain present");
  assert.ok(
    snapshotIndex < buildIndex,
    "rollback tags must exist before builds overwrite production tags",
  );
  assert.ok(
    restoreIndex >= 0,
    "rollback must restore from the preserved tag, not a stale image id",
  );
});

test("production deploy refuses to start when required env files are absent", () => {
  const result = spawnSync("bash", [deployScript], {
    cwd: repoRoot,
    encoding: "utf8",
    env: { ...process.env, DEPLOY_ENV_ROOT: path.join(repoRoot, "missing-env-root") },
  });

  assert.equal(result.status, 1);
  assert.match(`${result.stdout}\n${result.stderr}`, /missing required production env file/);
  assert.doesNotMatch(`${result.stdout}\n${result.stderr}`, /compose-up/);
});
