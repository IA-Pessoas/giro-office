import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { chmod, mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const detectorScript = path.join(repoRoot, "scripts", "ci", "detect-changed-vps-services.sh");
const bashCommand = process.platform === "win32" ? "C:\\Program Files\\Git\\bin\\bash.exe" : "bash";

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

const buildxPushScript = path.join(repoRoot, "scripts", "ci", "compose-vps-buildx-push.sh");

async function dryRunBuildxPush(scope) {
  const { stdout } = await run(bashCommand, [buildxPushScript], {
    env: {
      DOCKER_REGISTRY_URL: "ghcr.io/example-org/workspace",
      STAGING_DOCKER_TAG: "abc1234",
      VPS_PUSH_SERVICES: scope,
      NEXT_PUBLIC_API_URL: "https://api.example.test",
      API_INTERNAL_URL: "http://gateway:3010",
      CI_DRY_RUN: "1",
    },
  });
  return stdout;
}

test("compose-vps-buildx-push skips all Docker work for NONE scope", async () => {
  const output = await dryRunBuildxPush("NONE");
  assert.match(output, /VPS_PUSH_SERVICES=NONE/);
  assert.doesNotMatch(output, /docker buildx build/);
});

test("compose-vps-buildx-push plans cached service build for a backend service", async () => {
  const output = await dryRunBuildxPush("client-service");
  assert.match(output, /docker buildx build/);
  assert.match(output, /--file docker\/service\.Dockerfile/);
  assert.match(output, /--build-arg WORKSPACE_PACKAGE=@workspace\/client-service/);
  assert.match(output, /--build-arg SERVICE_DIR=services\/client-service/);
  assert.match(
    output,
    /--cache-from type=registry,ref=ghcr\.io\/example-org\/workspace\/buildcache-client-service:buildcache/,
  );
  assert.match(
    output,
    /--cache-to type=registry,ref=ghcr\.io\/example-org\/workspace\/buildcache-client-service:buildcache,mode=max/,
  );
  assert.match(output, /--tag ghcr\.io\/example-org\/workspace\/client-service:abc1234/);
});

test("compose-vps-buildx-push plans cached web build with Next.js build args", async () => {
  const output = await dryRunBuildxPush("web");
  assert.match(output, /--file docker\/app\.Dockerfile/);
  assert.match(output, /--build-arg NEXT_PUBLIC_API_URL=https:\/\/api\.example\.test/);
  assert.match(output, /--build-arg API_INTERNAL_URL=http:\/\/gateway:3010/);
  assert.match(
    output,
    /--cache-from type=registry,ref=ghcr\.io\/example-org\/workspace\/buildcache-web:buildcache/,
  );
  assert.match(output, /--tag ghcr\.io\/example-org\/workspace\/web:abc1234/);
});

const deployScopeScript = path.join(repoRoot, "scripts", "ci", "vps-deploy-scope.sh");

async function runDeployScopeFunction(functionName, scope) {
  const { stdout } = await run(bashCommand, [
    "-c",
    `. "${deployScopeScript.replaceAll("\\", "/")}"; ${functionName} "$1"`,
    "_",
    scope,
  ]);
  return stdout.trim();
}

test("vps-deploy-scope resolves NONE as skip", async () => {
  assert.equal(await runDeployScopeFunction("vps_deploy_mode", "NONE"), "skip");
});

test("vps-deploy-scope resolves ALL as full", async () => {
  assert.equal(await runDeployScopeFunction("vps_deploy_mode", "ALL"), "full");
});

test("vps-deploy-scope resolves service list as selective", async () => {
  assert.equal(
    await runDeployScopeFunction("vps_deploy_mode", "gateway client-service"),
    "selective",
  );
});

test("vps-deploy-scope emits compose args only for selective scope", async () => {
  assert.equal(await runDeployScopeFunction("vps_compose_service_args", "ALL"), "");
  assert.equal(
    await runDeployScopeFunction("vps_compose_service_args", "gateway client-service"),
    "gateway\nclient-service",
  );
});

const pullByTagScript = path.join(
  repoRoot,
  "scripts",
  "ci",
  "compose-vps-pull-by-tag-selective.sh",
);
const remoteDeployScript = path.join(repoRoot, "scripts", "ci", "vps-remote-deploy.sh");

async function writeExecutable(filePath, contents) {
  await writeFile(filePath, contents, "utf8");
  await chmod(filePath, 0o755);
}

async function createFakeDockerBin(scriptContents) {
  const dir = await mkdtemp(path.join(tmpdir(), "fake-docker-"));
  await writeExecutable(path.join(dir, "docker"), scriptContents);
  return dir;
}

function withPrependedPath(binDir, extraEnv = {}) {
  return {
    ...extraEnv,
    PATH: `${toBashPath(binDir)}:${process.env.PATH}`,
  };
}

function toBashPath(filePath) {
  const normalized = filePath.replaceAll("\\", "/");
  if (process.platform !== "win32") {
    return normalized;
  }
  return `/${normalized[0].toLowerCase()}${normalized.slice(2)}`;
}

test("compose-vps-pull-by-tag-selective retries transient docker pull failures", async () => {
  const stateDir = await mkdtemp(path.join(tmpdir(), "pull-retry-state-"));
  const fakeDockerBin = await createFakeDockerBin(`#!/usr/bin/env bash
set -euo pipefail
echo "$*" >> "$DOCKER_CALL_LOG"
if [[ "$1 $2" == "image inspect" ]]; then
  exit 1
fi
if [[ "$1" == "compose" ]]; then
  if [[ "$*" == *"config --images"* ]]; then
    printf 'workspace-gateway:vps\\n'
  fi
  exit 0
fi
if [[ "$1" == "pull" ]]; then
  count_file="$DOCKER_STATE_DIR/pull-count"
  count=0
  [[ -f "$count_file" ]] && count="$(cat "$count_file")"
  count=$((count + 1))
  echo "$count" > "$count_file"
  if [[ "$count" -lt 3 ]]; then
    echo "simulated GHCR timeout" >&2
    exit 1
  fi
  exit 0
fi
if [[ "$1" == "tag" ]]; then
  exit 0
fi
exit 0
`);

  const callLog = path.join(stateDir, "docker.log");
  await run(bashCommand, [toBashPath(pullByTagScript)], {
    env: withPrependedPath(fakeDockerBin, {
      DOCKER_CALL_LOG: toBashPath(callLog),
      DOCKER_STATE_DIR: toBashPath(stateDir),
      DOCKER_REGISTRY_URL: "ghcr.io/example-org/workspace",
      DOCKER_IMAGE_TAG: "abc1234",
      VPS_PULL_SERVICES: "gateway",
      DOCKER_PULL_RETRIES: "3",
      DOCKER_PULL_RETRY_DELAY_SECONDS: "0",
      WORKSPACE_VPS_IMAGE_TAG: "vps",
    }),
  });

  const pullCount = Number(await readFile(path.join(stateDir, "pull-count"), "utf8"));
  const calls = await readFile(callLog, "utf8");
  assert.equal(pullCount, 3);
  assert.match(calls, /pull ghcr\.io\/example-org\/workspace\/gateway:abc1234/);
  assert.match(
    calls,
    /tag ghcr\.io\/example-org\/workspace\/gateway:abc1234 workspace-gateway:vps/,
  );
});

test("vps-remote-deploy rolls image tags back when registry pull fails", async () => {
  const script = await readFile(remoteDeployScript, "utf8");
  assert.match(
    script,
    /if \[\[ "\$pull_rc" -ne 0 \]\]; then\s+.*rollback_images "\$IDS_FILE"\s+dump_compose_logs/s,
  );
});
