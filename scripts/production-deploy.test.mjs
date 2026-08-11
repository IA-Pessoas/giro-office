import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const deployScript = path.join(repoRoot, "scripts", "ops", "deploy-production.sh");
const webEnvLoader = path.join(repoRoot, "scripts", "ops", "load-production-web-env.sh");
const endpointWaiter = path.join(repoRoot, "scripts", "ops", "wait-production-endpoints.sh");

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
  writeFileSync(
    envFile,
    "NEXT_PUBLIC_API_URL=/api\nAPI_INTERNAL_URL=http://gateway:3010\nNEXT_PUBLIC_AUTH_COOKIE_SECURE=true\n",
  );
  const command = [
    'source "$1" "$2"',
    'printf "%s|%s|%s" "$NEXT_PUBLIC_API_URL" "$API_INTERNAL_URL" "$NEXT_PUBLIC_AUTH_COOKIE_SECURE"',
  ].join("; ");
  const result = spawnSync("bash", ["-c", command, "_", webEnvLoader, envFile], {
    cwd: repoRoot,
    encoding: "utf8",
  });

  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout, "/api|http://gateway:3010|true");
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
