import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ignoredDirectories = new Set([
  ".git",
  ".next",
  ".turbo",
  "dist",
  "graphify-out",
  "node_modules",
]);
const executableConfigPattern =
  /^(?:postcss|tailwind|eslint|next|babel|vite)\.config\.(?:js|cjs|mjs|ts)$/;
const additionalConfigNames = new Set(["lint-staged.config.mjs", "tasks.json"]);
const maliciousMarkers = [
  /For only test/,
  /global\.[A-Za-z_$][A-Za-z0-9_$]*\s*=\s*['"][A-Za-z0-9-]+['"]/,
  /global\[['"](?:!|_V)['"]\]/,
  /rmcej%otb%/,
  /Cot%3t=shtP/,
  /LAST_COMMIT_DATE/,
  /temp_auto_push\.bat/,
];

async function findExecutableConfigs(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    if (entry.isDirectory() && ignoredDirectories.has(entry.name)) {
      continue;
    }

    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await findExecutableConfigs(entryPath)));
      continue;
    }

    if (executableConfigPattern.test(entry.name) || additionalConfigNames.has(entry.name)) {
      files.push(entryPath);
    }
  }

  return files;
}

test("executable project configs contain no PolinRider indicators", async () => {
  const configs = await findExecutableConfigs(repositoryRoot);
  assert.ok(configs.length > 0, "expected executable project configs to be scanned");

  for (const config of configs) {
    const source = await readFile(config, "utf8");
    const relativePath = path.relative(repositoryRoot, config);

    for (const marker of maliciousMarkers) {
      assert.doesNotMatch(source, marker, `${relativePath} contains ${marker}`);
    }

    const longestLine = Math.max(...source.split(/\r?\n/u).map((line) => line.length));
    assert.ok(longestLine < 2_000, `${relativePath} contains an unexpectedly long line`);
  }
});

test("pre-commit scans for supply-chain payloads before loading lint-staged config", async () => {
  const hook = await readFile(path.join(repositoryRoot, ".husky", "pre-commit"), "utf8");
  const scannerIndex = hook.indexOf("node scripts/supply-chain-integrity.mjs");
  const lintStagedIndex = hook.indexOf("pnpm lint-staged");

  assert.ok(scannerIndex >= 0, "pre-commit must execute the supply-chain scanner");
  assert.ok(lintStagedIndex >= 0, "pre-commit must retain lint-staged");
  assert.ok(scannerIndex < lintStagedIndex, "scanner must run before lint-staged loads its config");
});

test("isolated Super Admin CI installs the pinned dependency graph without lifecycle scripts", async () => {
  const workflow = await readFile(
    path.join(repositoryRoot, ".github", "workflows", "super-admin-v2-ci.yml"),
    "utf8",
  );
  const installCommands = workflow
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .filter((line) => /\bpnpm install\b/u.test(line));

  assert.deepEqual(installCommands, [
    "run: corepack pnpm install --frozen-lockfile --ignore-scripts",
  ]);
  assert.match(workflow, /node-version:\s*["']?22["']?/u);
  assert.match(workflow, /corepack pnpm --version\)" = "10\.26\.0"/u);
  assert.doesNotMatch(workflow, /\b(?:npm|npx|yarn)\s+(?:add|ci|install)\b/u);
});

test("isolated Super Admin CI runs the repository supply-chain gates", async () => {
  const workflow = await readFile(
    path.join(repositoryRoot, ".github", "workflows", "super-admin-v2-ci.yml"),
    "utf8",
  );

  for (const requiredGate of [
    "node scripts/supply-chain-integrity.mjs",
    "node scripts/pnpm-security-policy.mjs --root .",
    "corepack pnpm audit --audit-level moderate",
    "scripts/super-admin-session-regression.test.mjs",
    "corepack pnpm smoke:coverage",
  ]) {
    assert.ok(workflow.includes(requiredGate), `workflow must run: ${requiredGate}`);
  }
});

test("isolated Super Admin CI provides Prisma's non-secret generation environment", async () => {
  const workflow = await readFile(
    path.join(repositoryRoot, ".github", "workflows", "super-admin-v2-ci.yml"),
    "utf8",
  );
  const gatesIndex = workflow.indexOf("\n  gates:");
  const envIndex = workflow.indexOf("\n    env:", gatesIndex);
  const stepsIndex = workflow.indexOf("\n    steps:", gatesIndex);

  assert.ok(
    envIndex > gatesIndex && envIndex < stepsIndex,
    "DATABASE_URL must cover every gate step",
  );
  assert.match(
    workflow.slice(envIndex, stepsIndex),
    /DATABASE_URL:\s*postgresql:\/\/ci:ci@127\.0\.0\.1:5432\/giro_ci/u,
  );
});

test("isolated Super Admin CI pins trusted actions and prepares API packages before the app", async () => {
  const workflow = await readFile(
    path.join(repositoryRoot, ".github", "workflows", "super-admin-v2-ci.yml"),
    "utf8",
  );
  const requiredInOrder = [
    "corepack pnpm --filter @workspace/shared build",
    "corepack pnpm --filter @workspace/api check",
    "corepack pnpm --filter @workspace/api typecheck",
    "corepack pnpm --filter @workspace/api build",
    "corepack pnpm --filter @workspace/api test",
    "corepack pnpm --filter @workspace/app typecheck",
  ];

  assert.match(workflow, /actions\/checkout@11bd71901bbe5b1630ceea73d27597364c9af683/u);
  assert.match(workflow, /actions\/setup-node@49933ea5288caeca8642d1e84afbd3f7d6820020/u);

  let previousIndex = -1;
  for (const command of requiredInOrder) {
    const commandIndex = workflow.indexOf(command);
    assert.ok(commandIndex >= 0, `workflow must run: ${command}`);
    assert.ok(commandIndex > previousIndex, `${command} must run after its package prerequisite`);
    previousIndex = commandIndex;
  }
});
