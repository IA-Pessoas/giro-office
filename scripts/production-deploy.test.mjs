import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const deployScript = path.join(repoRoot, "scripts", "ops", "deploy-production.sh");

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
