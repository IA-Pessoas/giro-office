import assert from "node:assert/strict";
import { execFile, spawnSync } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const expectedOwner = "@IA-Pessoas/security-platform";
const representativeCriticalPaths = [
  ".github/CODEOWNERS",
  "package.json",
  "app/pnpm-lock.yaml",
  "pnpm-workspace.yaml",
  ".npmrc",
  ".pnpmfile.cjs",
  ".node-version",
  ".nvmrc",
  "app/migration/visual-baseline.config.json",
  "viteconfig.js",
  "app/runtimeconfig.mjs",
  "services/audit-service/buildconfig.ts",
  "packages/api/toolconfig.cjs",
  "app/tsconfig.json",
  "tools/tsconfig.build.json",
  "turbo.json",
  "biome.json",
  ".editorconfig",
  ".husky/pre-commit",
  "scripts/ops/deploy-production.sh",
  "docs/migration/v4/scripts/migrate.mjs",
  ".vscode/tasks.json",
  ".cursor/rules/project.mdc",
  ".codex/rules/default.rules.md",
  ".claude/settings.json",
  ".agents/hooks/pre-commit.sh",
  "AGENTS.md",
  "app/CLAUDE.md",
  "services/src/Dockerfile",
  "build/service.Dockerfile",
  "docker-compose.production.yml",
  "deploy/docker-compose.production.yaml",
  "compose.yml",
  "deploy/compose.yaml",
  "deploy/Caddyfile",
  "deploy/caddy-security.json",
  "deploy/caddy-security.conf",
  "deploy/nginx.conf",
  "deploy/reverse-proxy.conf",
  "docker/README.md",
  "infra/schema.prisma",
  "terraform/main.tf",
  "terraform/prod.tfvars",
  "workers/wrangler.toml",
  "workers/wrangler.json",
  "workers/wrangler.jsonc",
  ".env.example",
  "SECURITY.md",
  "security-allowlist.json",
  "security-allowlist.yaml",
  "security-allowlist.yml",
  "security-policy.json",
  "security-policy.yaml",
  "security-policy.yml",
  "security-policy.md",
];

function parseCodeowners(source) {
  const entries = [];
  const patterns = [];
  for (const [index, line] of source.split(/\r?\n/u).entries()) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      patterns.push("");
      continue;
    }

    const [pattern, ...owners] = trimmed.split(/\s+/u);
    assert.ok(owners.length > 0, `CODEOWNERS line ${index + 1} has no owner`);
    assert.doesNotMatch(pattern, /^!|\[|\]/u, `CODEOWNERS line ${index + 1} is invalid`);
    entries.push({ line: index + 1, pattern, owners });
    patterns.push(pattern);
  }
  return { entries, patterns: patterns.join("\n") };
}

async function createResolver(source) {
  const { entries, patterns } = parseCodeowners(source);
  const directory = await mkdtemp(path.join(tmpdir(), "giro-codeowners-"));
  await execFileAsync("git", ["init", "--quiet"], { cwd: directory });
  await execFileAsync("git", ["config", "core.ignorecase", "false"], { cwd: directory });

  await writeFile(path.join(directory, ".git", "info", "exclude"), patterns);

  function resolveAll(relativePaths) {
    const result = spawnSync("git", ["check-ignore", "--no-index", "--verbose", ...relativePaths], {
      cwd: directory,
      encoding: "utf8",
      maxBuffer: 10 * 1024 * 1024,
    });
    if (result.error) throw result.error;
    if (result.status !== 0 && result.status !== 1) {
      throw new Error(`git check-ignore failed with exit code ${result.status}`);
    }

    const resolved = new Map();
    for (const outputLine of result.stdout.trimEnd().split("\n")) {
      const match = outputLine.match(/:(\d+):[^\t]*\t(.*)$/u);
      if (!match) continue;
      const entry = entries.find((candidate) => candidate.line === Number(match[1]));
      if (entry) resolved.set(match[2], entry);
    }
    return resolved;
  }

  return {
    resolve: async (relativePath) => resolveAll([relativePath]).get(relativePath) ?? null,
    resolveAll,
    cleanup: () => rm(directory, { recursive: true, force: true }),
  };
}

function assertOwnedEntry(relativePath, entry) {
  assert.ok(entry, `${relativePath} is not covered by CODEOWNERS`);
  assert.deepEqual(entry.owners, [expectedOwner], `${relativePath} resolves to the wrong owner`);
}

async function assertOwned(resolver, relativePath) {
  assertOwnedEntry(relativePath, await resolver.resolve(relativePath));
}

function isCriticalTrackedPath(relativePath) {
  return (
    /^(?:\.github|\.husky|\.vscode|\.cursor|\.codex|\.claude|\.agents|docker|infra)\//u.test(
      relativePath,
    ) ||
    /(?:^|\/)scripts\//u.test(relativePath) ||
    /(?:^|\/)(?:package\.json|pnpm-lock\.yaml|pnpm-workspace\.yaml|\.npmrc|\.pnpmfile\.[^/]+|\.node-version|\.nvmrc|turbo\.json|biome\.json|\.editorconfig|Dockerfile|Caddyfile|SECURITY\.md|AGENTS\.md|CLAUDE\.md)$/u.test(
      relativePath,
    ) ||
    /(?:^|\/)(?:[^/]+\.config\.[^/]+|tsconfig[^/]*\.json|[^/]*compose[^/]*\.(?:ya?ml)|[^/]*(?:caddy|nginx|proxy)[^/]*\.(?:conf|json)|wrangler[^/]*\.(?:toml|jsonc?))$/u.test(
      relativePath,
    ) ||
    /^(?:[^/]*config[^/]*\.[^/]+|app\/[^/]*config[^/]*\.[^/]+|services\/[^/]+\/[^/]*config[^/]*\.[^/]+|packages\/[^/]+\/[^/]*config[^/]*\.[^/]+)$/u.test(
      relativePath,
    ) ||
    /(?:^|\/)(?:\.env[^/]*|[^/]*(?:allowlist|policy)[^/]*\.(?:json|ya?ml|md)|[^/]+\.settings\.(?:js|mjs|cjs|ts)|[^/]+\.Dockerfile|[^/]+\.tf|[^/]+\.tfvars)$/u.test(
      relativePath,
    )
  );
}

async function listTrackedCriticalPaths() {
  const { stdout } = await execFileAsync("git", ["ls-files", "-z"], { cwd: repositoryRoot });
  return stdout
    .split("\0")
    .filter((relativePath) => relativePath && isCriticalTrackedPath(relativePath));
}

test("critical supply-chain paths resolve to the approved owner", async (context) => {
  const source = await readFile(path.join(repositoryRoot, ".github", "CODEOWNERS"), "utf8");
  const resolver = await createResolver(source);
  context.after(resolver.cleanup);

  for (const criticalPath of representativeCriticalPaths) await assertOwned(resolver, criticalPath);
});

test("every CODEOWNERS pattern protects a representative critical path", async (context) => {
  const source = await readFile(path.join(repositoryRoot, ".github", "CODEOWNERS"), "utf8");
  const { entries } = parseCodeowners(source);
  const resolver = await createResolver(source);
  context.after(resolver.cleanup);

  const exercisedPatterns = new Set();
  for (const criticalPath of representativeCriticalPaths) {
    const entry = await resolver.resolve(criticalPath);
    if (entry) exercisedPatterns.add(entry.pattern);
  }

  assert.deepEqual(
    [...exercisedPatterns].sort(),
    entries.map(({ pattern }) => pattern).sort(),
    "every CODEOWNERS pattern must have a representative critical path",
  );
});

test("every tracked critical path resolves to the approved owner", async (context) => {
  const source = await readFile(path.join(repositoryRoot, ".github", "CODEOWNERS"), "utf8");
  const resolver = await createResolver(source);
  context.after(resolver.cleanup);

  const criticalPaths = await listTrackedCriticalPaths();
  const resolved = resolver.resolveAll(criticalPaths);
  for (const criticalPath of criticalPaths)
    assertOwnedEntry(criticalPath, resolved.get(criticalPath));
});

test("a newly introduced config convention fails until the policy covers it", async (context) => {
  const source = await readFile(path.join(repositoryRoot, ".github", "CODEOWNERS"), "utf8");
  const resolver = await createResolver(source);
  context.after(resolver.cleanup);

  const newConfigPath = "services/example/runtime.settings.js";
  assert.equal(isCriticalTrackedPath(newConfigPath), true);
  await assert.rejects(() => assertOwned(resolver, newConfigPath), /is not covered by CODEOWNERS/u);
});

test("the last matching CODEOWNERS pattern takes precedence", async (context) => {
  const resolver = await createResolver("* @eedsilva\n/config.js @JohanVPS\n");
  context.after(resolver.cleanup);

  assert.deepEqual((await resolver.resolve("config.js"))?.owners, ["@JohanVPS"]);
});

test("the policy test remains in the local and CI gates", async () => {
  const packageJson = JSON.parse(await readFile(path.join(repositoryRoot, "package.json"), "utf8"));
  const workflow = await readFile(
    path.join(repositoryRoot, ".github", "workflows", "supply-chain-integrity.yml"),
    "utf8",
  );

  assert.match(packageJson.scripts.test, /codeowners-policy\.test\.mjs/u);
  assert.match(workflow, /codeowners-policy\.test\.mjs/u);
});
