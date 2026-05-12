import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const detectorScript = path.join(repoRoot, "scripts", "ci", "detect-changed-vps-services.sh");
const bashCommand =
  process.platform === "win32" ? "C:\\Program Files\\Git\\bin\\bash.exe" : "bash";

async function run(command, args, options = {}) {
  return execFileAsync(command, args, {
    cwd: options.cwd || repoRoot,
    env: { ...process.env, ...(options.env || {}) },
    windowsHide: true,
  });
}

async function createGitFixture() {
  const dir = await mkdtemp(path.join(tmpdir(), "workflow-scope-"));
  await run("git", ["init"], { cwd: dir });
  await run("git", ["config", "user.email", "ci@example.test"], { cwd: dir });
  await run("git", ["config", "user.name", "CI Test"], { cwd: dir });
  await writeFile(path.join(dir, "package.json"), "{}\n", "utf8");
  await run("git", ["add", "."], { cwd: dir });
  await run("git", ["commit", "-m", "initial"], { cwd: dir });
  const { stdout } = await run("git", ["rev-parse", "HEAD"], { cwd: dir });
  return { dir, before: stdout.trim() };
}

async function commitFixtureChange(fixture, relativePath, contents) {
  const fullPath = path.join(fixture.dir, relativePath);
  await mkdir(path.dirname(fullPath), { recursive: true });
  await writeFile(fullPath, contents, "utf8");
  await run("git", ["add", "."], { cwd: fixture.dir });
  await run("git", ["commit", "-m", `change ${relativePath}`], { cwd: fixture.dir });
  const { stdout } = await run("git", ["rev-parse", "HEAD"], { cwd: fixture.dir });
  return stdout.trim();
}

async function detectChangedServices(changedPath) {
  const fixture = await createGitFixture();
  const after = await commitFixtureChange(fixture, changedPath, "changed\n");
  const { stdout } = await run(bashCommand, [detectorScript, fixture.before, after], {
    cwd: fixture.dir,
  });
  return stdout.trim();
}

test("detect-changed-vps-services emits NONE for docs-only changes", async () => {
  assert.equal(await detectChangedServices("docs/release-note.md"), "NONE");
});

test("detect-changed-vps-services emits a single service for service-only changes", async () => {
  assert.equal(
    await detectChangedServices("services/client-service/src/routes/clients.ts"),
    "client-service",
  );
});

test("detect-changed-vps-services emits web for app changes", async () => {
  assert.equal(await detectChangedServices("app/src/app/page.tsx"), "web");
});

test("detect-changed-vps-services keeps shared changes conservative", async () => {
  assert.equal(await detectChangedServices("shared/src/domain.ts"), "ALL");
});

test("detect-changed-vps-services emits ALL for lockfile changes", async () => {
  assert.equal(await detectChangedServices("pnpm-lock.yaml"), "ALL");
});
