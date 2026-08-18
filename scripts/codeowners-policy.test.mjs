import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const expectedOwner = "@eedsilva";

function parseCodeowners(source) {
  return source.split(/\r?\n/u).flatMap((line, index) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) return [];

    const [pattern, ...owners] = trimmed.split(/\s+/u);
    assert.ok(owners.length > 0, `CODEOWNERS line ${index + 1} has no owner`);
    assert.doesNotMatch(pattern, /^!|\[|\]/u, `CODEOWNERS line ${index + 1} is invalid`);
    return [{ line: index + 1, pattern, owners }];
  });
}

async function createResolver(source) {
  const entries = parseCodeowners(source);
  const directory = await mkdtemp(path.join(tmpdir(), "giro-codeowners-"));
  await execFileAsync("git", ["init", "--quiet"], { cwd: directory });

  const patterns = source
    .split(/\r?\n/u)
    .map((line) => {
      const trimmed = line.trim();
      return !trimmed || trimmed.startsWith("#") ? "" : trimmed.split(/\s+/u)[0];
    })
    .join("\n");
  await writeFile(path.join(directory, ".git", "info", "exclude"), patterns);

  return {
    async resolve(relativePath) {
      try {
        const { stdout } = await execFileAsync(
          "git",
          ["check-ignore", "--no-index", "--verbose", relativePath],
          { cwd: directory },
        );
        const line = Number(stdout.match(/:(\d+):[^\t]*\t/u)?.[1]);
        return entries.find((entry) => entry.line === line) ?? null;
      } catch (error) {
        if (error.code === 1) return null;
        throw error;
      }
    },
    cleanup: () => rm(directory, { recursive: true, force: true }),
  };
}

async function assertOwned(resolver, relativePath) {
  const entry = await resolver.resolve(relativePath);
  assert.ok(entry, `${relativePath} is not covered by CODEOWNERS`);
  assert.deepEqual(entry.owners, [expectedOwner], `${relativePath} resolves to the wrong owner`);
}

test("critical supply-chain paths resolve to the approved owner", async (context) => {
  const source = await readFile(path.join(repositoryRoot, ".github", "CODEOWNERS"), "utf8");
  const resolver = await createResolver(source);
  context.after(resolver.cleanup);

  const criticalPaths = [
    ".github/CODEOWNERS",
    ".github/workflows/supply-chain-integrity.yml",
    ".github/actions/security/action.yml",
    "package.json",
    "app/package.json",
    "pnpm-lock.yaml",
    "pnpm-workspace.yaml",
    ".npmrc",
    ".pnpmfile.cjs",
    "app/next.config.mjs",
    "services/example/vitest.config.ts",
    ".husky/pre-commit",
    "scripts/ops/deploy-production.sh",
    "docs/migration/v4/scripts/migrate.mjs",
    ".vscode/tasks.json",
    ".cursor/rules/project.mdc",
    ".codex/rules/default.rules.md",
    "AGENTS.md",
    "docker/service.Dockerfile",
    "docker-compose.production.yml",
    "Caddyfile",
    "infra/main.tf",
    "wrangler.toml",
    ".env.example",
    "SECURITY.md",
    "security-allowlist.json",
  ];

  for (const criticalPath of criticalPaths) await assertOwned(resolver, criticalPath);
});

test("an uncovered config naming convention fails closed", async (context) => {
  const source = await readFile(path.join(repositoryRoot, ".github", "CODEOWNERS"), "utf8");
  const resolver = await createResolver(source);
  context.after(resolver.cleanup);

  await assert.rejects(
    () => assertOwned(resolver, "services/example/runtime.settings.js"),
    /is not covered by CODEOWNERS/u,
  );
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
