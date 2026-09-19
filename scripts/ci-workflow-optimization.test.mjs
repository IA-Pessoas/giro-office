import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { chmod, mkdir, mkdtemp, readdir, readFile, writeFile } from "node:fs/promises";
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

test("CI shell scripts avoid Bash 4-only features", async () => {
  const ciScriptsDir = path.join(repoRoot, "scripts", "ci");
  const shellScripts = (await readdir(ciScriptsDir))
    .filter((file) => file.endsWith(".sh"))
    .map((file) => path.join(ciScriptsDir, file));
  const violations = [];

  for (const shellScript of shellScripts) {
    const contents = await readFile(shellScript, "utf8");
    const lines = contents.split(/\r?\n/);
    for (const [index, line] of lines.entries()) {
      const trimmed = line.trimStart();
      if (trimmed.startsWith("#")) {
        continue;
      }
      if (/\b(mapfile|readarray)\b|declare\s+-A/.test(line)) {
        violations.push(`${path.relative(repoRoot, shellScript)}:${index + 1}:${line.trim()}`);
      }
    }
  }

  assert.deepEqual(violations, []);
});

test("detect-changed-vps-services emits NONE for docs-only changes", async () => {
  assert.equal(await detectChangedServices("docs/release-note.md"), "NONE");
});

test("detect-changed-vps-services emits a single service for service-only changes", async () => {
  assert.equal(
    await detectChangedServices("services/client-service/src/routes/clients.ts"),
    "client-service",
  );
});

test("detect-changed-vps-services emits certificate-service for certificate changes", async () => {
  assert.equal(
    await detectChangedServices("services/certificate-service/src/routes/certificatePj.routes.ts"),
    "certificate-service",
  );
});

test("detect-changed-vps-services emits pessoal-service for pessoal changes", async () => {
  assert.equal(
    await detectChangedServices("services/pessoal-service/src/routes/pessoal.routes.ts"),
    "pessoal-service",
  );
});

test("detect-changed-vps-services emits parcelamento-service for parcelamento changes", async () => {
  assert.equal(
    await detectChangedServices("services/parcelamento-service/src/routes/installment.routes.ts"),
    "parcelamento-service",
  );
});

test("detect-changed-vps-services emits reports-service for reports changes", async () => {
  assert.equal(
    await detectChangedServices("services/reports-service/src/server.ts"),
    "reports-service",
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

test("compose-vps-buildx-push plans cached service build for ti-service", async () => {
  const output = await dryRunBuildxPush("ti-service");
  assert.match(output, /docker buildx build/);
  assert.match(output, /--file docker\/service\.Dockerfile/);
  assert.match(output, /--build-arg WORKSPACE_PACKAGE=@workspace\/ti-service/);
  assert.match(output, /--build-arg SERVICE_DIR=services\/ti-service/);
  assert.match(
    output,
    /--cache-from type=registry,ref=ghcr\.io\/example-org\/workspace\/buildcache-ti-service:buildcache/,
  );
  assert.match(output, /--tag ghcr\.io\/example-org\/workspace\/ti-service:abc1234/);
});

test("compose-vps-buildx-push plans cached service build for certificate-service", async () => {
  const output = await dryRunBuildxPush("certificate-service");
  assert.match(output, /docker buildx build/);
  assert.match(output, /--file docker\/service\.Dockerfile/);
  assert.match(output, /--build-arg WORKSPACE_PACKAGE=@workspace\/certificate-service/);
  assert.match(output, /--build-arg SERVICE_DIR=services\/certificate-service/);
  assert.match(
    output,
    /--cache-from type=registry,ref=ghcr\.io\/example-org\/workspace\/buildcache-certificate-service:buildcache/,
  );
  assert.match(output, /--tag ghcr\.io\/example-org\/workspace\/certificate-service:abc1234/);
});

test("compose-vps-buildx-push plans cached service build for pessoal-service", async () => {
  const output = await dryRunBuildxPush("pessoal-service");
  assert.match(output, /docker buildx build/);
  assert.match(output, /--file docker\/service\.Dockerfile/);
  assert.match(output, /--build-arg WORKSPACE_PACKAGE=@workspace\/pessoal-service/);
  assert.match(output, /--build-arg SERVICE_DIR=services\/pessoal-service/);
  assert.match(
    output,
    /--cache-from type=registry,ref=ghcr\.io\/example-org\/workspace\/buildcache-pessoal-service:buildcache/,
  );
  assert.match(output, /--tag ghcr\.io\/example-org\/workspace\/pessoal-service:abc1234/);
});

test("compose-vps-buildx-push plans cached service build for parcelamento-service", async () => {
  const output = await dryRunBuildxPush("parcelamento-service");
  assert.match(output, /docker buildx build/);
  assert.match(output, /--file docker\/service\.Dockerfile/);
  assert.match(output, /--build-arg WORKSPACE_PACKAGE=@workspace\/parcelamento-service/);
  assert.match(output, /--build-arg SERVICE_DIR=services\/parcelamento-service/);
  assert.match(
    output,
    /--cache-from type=registry,ref=ghcr\.io\/example-org\/workspace\/buildcache-parcelamento-service:buildcache/,
  );
  assert.match(output, /--tag ghcr\.io\/example-org\/workspace\/parcelamento-service:abc1234/);
});

test("reports-service is wired into VPS build, runtime, wait, and secret materialization", async () => {
  assert.match(
    await dryRunBuildxPush("reports-service"),
    /WORKSPACE_PACKAGE=@workspace\/reports-service/,
  );
  assert.equal(await runDeployScopeFunction("vps_validate_service_token", "reports-service"), "");
  const composeContents = await readFile(composeVpsFile, "utf8");
  const reportsBlock = extractComposeServiceBlock(composeContents, "reports-service");
  const workerBlock = extractComposeServiceBlock(composeContents, "reports-worker");
  assert.match(reportsBlock, /\.env\.vps\.reports-service/);
  assert.doesNotMatch(reportsBlock, /REPORTS_INTERNAL_TOKEN:\s*\$\{/);
  assert.doesNotMatch(workerBlock, /expose:|healthcheck:/);
  assert.match(
    await readFile(vpsSecretsManifest, "utf8"),
    /^ENV_VPS_REPORTS_SERVICE\|\.env\.vps\.reports-service$/m,
  );
  const waitScript = await readFile(vpsWaitEndpointsScript, "utf8");
  assert.match(
    waitScript,
    /reports-service\)\s+printf "%s\\n" "http:\/\/reports-service:3044\/health"/,
  );
  assert.match(waitScript, /\[\[ "\$svc" == "reports-worker" \]\]/);
  assert.match(waitScript, /ALL_BACKEND_SERVICES=\([\s\S]*reports-service[\s\S]*\)/);
  assert.match(
    await readFile(composeVpsRuntimeOverrideFile, "utf8"),
    /reports-service:\s+healthcheck:\s+disable: true/,
  );
  assert.match(await readFile(productionDeployScript, "utf8"), /reports-service/);
  assert.match(
    await readFile(productionWaitScript, "utf8"),
    /http:\/\/reports-service:3044\/health/,
  );
});

test("commercial-service is wired into VPS build, runtime, wait, and secret materialization", async () => {
  assert.match(
    await dryRunBuildxPush("commercial-service"),
    /WORKSPACE_PACKAGE=@workspace\/commercial-service/,
  );
  assert.equal(
    await runDeployScopeFunction("vps_validate_service_token", "commercial-service"),
    "",
  );
  const composeContents = await readFile(composeVpsFile, "utf8");
  const commercialBlock = extractComposeServiceBlock(composeContents, "commercial-service");
  const gatewayBlock = extractComposeServiceBlock(composeContents, "gateway");
  assert.match(commercialBlock, /image: workspace-commercial-service:/);
  assert.match(commercialBlock, /WORKSPACE_PACKAGE: "@workspace\/commercial-service"/);
  assert.match(commercialBlock, /SERVICE_DIR: services\/commercial-service/);
  assert.match(commercialBlock, /\.env\.vps\.commercial-service/);
  assert.match(commercialBlock, /expose:[\s\S]*- "3045"/);
  assert.match(commercialBlock, /fetch\('http:\/\/127\.0\.0\.1:3045\/health'\)/);
  assert.match(gatewayBlock, /COMMERCIAL_SERVICE_URL: http:\/\/commercial-service:3045/);
  assert.match(
    gatewayBlock,
    /depends_on:[\s\S]*commercial-service:[\s\S]*condition: service_healthy/,
  );
  assert.match(
    await readFile(vpsSecretsManifest, "utf8"),
    /^ENV_VPS_COMMERCIAL_SERVICE\|\.env\.vps\.commercial-service$/m,
  );
  const waitScript = await readFile(vpsWaitEndpointsScript, "utf8");
  assert.match(
    waitScript,
    /commercial-service\)\s+printf "%s\\n" "http:\/\/commercial-service:3045\/health"/,
  );
  assert.match(waitScript, /ALL_BACKEND_SERVICES=\([\s\S]*commercial-service[\s\S]*\)/);
  assert.match(
    await readFile(composeVpsRuntimeOverrideFile, "utf8"),
    /commercial-service:\s+healthcheck:\s+disable: true/,
  );
  assert.match(await readFile(productionDeployScript, "utf8"), /commercial-service/);
  assert.match(
    await readFile(productionWaitScript, "utf8"),
    /http:\/\/commercial-service:3045\/health/,
  );
});

test("reports project adapter has internal URL and shared reporting secret provisioning", async () => {
  const composeContents = await readFile(composeVpsFile, "utf8");
  const reportsBlock = extractComposeServiceBlock(composeContents, "reports-service");
  const projectBlock = extractComposeServiceBlock(composeContents, "project-service");
  const manifest = await readFile(vpsSecretsManifest, "utf8");

  assert.match(reportsBlock, /PROJECT_SERVICE_URL: http:\/\/project-service:3033/);
  assert.match(projectBlock, /env_file:[\s\S]*\.env\.vps\.project-service/);
  assert.match(
    manifest,
    /^# ENV_VPS_PROJECT_SERVICE deve incluir REPORTS_INTERNAL_TOKEN e REPORTS_GRANT_SECRET iguais aos de ENV_VPS_REPORTS_SERVICE\.$/m,
  );
  assert.match(
    manifest,
    /^# REPORTS_INTERNAL_TOKEN e REPORTS_GRANT_SECRET devem coincidir com ENV_VPS_PROJECT_SERVICE\.$/m,
  );
});

test("reports task adapter has internal URL and shared reporting secret provisioning", async () => {
  const composeContents = await readFile(composeVpsFile, "utf8");
  const reportsBlock = extractComposeServiceBlock(composeContents, "reports-service");
  const taskBlock = extractComposeServiceBlock(composeContents, "task-service");
  const manifest = await readFile(vpsSecretsManifest, "utf8");

  assert.match(reportsBlock, /TASK_SERVICE_URL: http:\/\/task-service:3032/);
  assert.match(taskBlock, /env_file:[\s\S]*\.env\.vps\.task-service/);
  assert.match(
    manifest,
    /^# ENV_VPS_TASK_SERVICE deve incluir REPORTS_INTERNAL_TOKEN e REPORTS_GRANT_SECRET iguais aos de ENV_VPS_REPORTS_SERVICE\.$/m,
  );
  assert.match(
    manifest,
    /^# REPORTS_INTERNAL_TOKEN e REPORTS_GRANT_SECRET devem coincidir com ENV_VPS_TASK_SERVICE\.$/m,
  );
});

test("reports fiscal adapter has internal URL in both VPS processes", async () => {
  const composeContents = await readFile(composeVpsFile, "utf8");
  const reportsBlock = extractComposeServiceBlock(composeContents, "reports-service");
  const workerBlock = extractComposeServiceBlock(composeContents, "reports-worker");

  assert.match(reportsBlock, /FISCAL_SERVICE_URL: http:\/\/fiscal-service:3037/);
  assert.match(workerBlock, /FISCAL_SERVICE_URL: http:\/\/fiscal-service:3037/);
});

test("compose-vps-buildx-push plans cached web build with Next.js build args", async () => {
  const output = await dryRunBuildxPush("web");
  assert.match(output, /--file docker\/app\.Dockerfile/);
  assert.match(output, /--build-arg NEXT_PUBLIC_API_URL=https:\/\/api\.example\.test/);
  assert.doesNotMatch(output, /NEXT_PUBLIC_AUTH_COOKIE_SECURE/);
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
    await runDeployScopeFunction("vps_compose_service_args", "gateway pessoal-service"),
    "gateway\npessoal-service",
  );
});

test("vps-deploy-scope reinicia o worker junto com reports-service", async () => {
  assert.equal(
    await runDeployScopeFunction("vps_compose_service_args", "reports-service"),
    "reports-service\nreports-worker",
  );
});

const pullByTagScript = path.join(
  repoRoot,
  "scripts",
  "ci",
  "compose-vps-pull-by-tag-selective.sh",
);
const remoteDeployScript = path.join(repoRoot, "scripts", "ci", "vps-remote-deploy.sh");
const composeVpsFile = path.join(repoRoot, "docker-compose.vps.yml");
const composeVpsRuntimeOverrideFile = path.join(
  repoRoot,
  "docker-compose.vps.runtime-override.yml",
);
const vpsSecretsManifest = path.join(repoRoot, "scripts", "ci", "vps-secrets.manifest");
const vpsWaitEndpointsScript = path.join(repoRoot, "scripts", "ci", "vps-wait-endpoints.sh");
const productionDeployScript = path.join(repoRoot, "scripts", "ops", "deploy-production.sh");
const productionWaitScript = path.join(repoRoot, "scripts", "ops", "wait-production-endpoints.sh");

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

function extractComposeServiceBlock(composeContents, serviceName) {
  const serviceMatch = new RegExp(`^  ${serviceName}:\\r?\\n`, "m").exec(composeContents);
  assert.ok(serviceMatch, `service ${serviceName} should exist in docker-compose.vps.yml`);
  const start = serviceMatch.index;
  const nextServiceMatch = /^ {2}[A-Za-z0-9_.-]+:\r?\n/gm;
  nextServiceMatch.lastIndex = start + serviceMatch[0].length;
  const next = nextServiceMatch.exec(composeContents);
  return composeContents.slice(start, next?.index ?? composeContents.length);
}

test("audit-service is part of the default VPS compose stack", async () => {
  const composeContents = await readFile(composeVpsFile, "utf8");
  const auditBlock = extractComposeServiceBlock(composeContents, "audit-service");
  const gatewayBlock = extractComposeServiceBlock(composeContents, "gateway");

  assert.doesNotMatch(auditBlock, /^\s+profiles:/m);
  assert.match(gatewayBlock, /depends_on:[\s\S]*audit-service:[\s\S]*condition: service_healthy/);
});

test("certificate-service is part of the default VPS compose stack", async () => {
  const composeContents = await readFile(composeVpsFile, "utf8");
  const certificateBlock = extractComposeServiceBlock(composeContents, "certificate-service");
  const gatewayBlock = extractComposeServiceBlock(composeContents, "gateway");

  assert.doesNotMatch(certificateBlock, /^\s+profiles:/m);
  assert.match(
    certificateBlock,
    /image: workspace-certificate-service:\$\{WORKSPACE_VPS_IMAGE_TAG:-vps\}/,
  );
  assert.match(certificateBlock, /WORKSPACE_PACKAGE: "@workspace\/certificate-service"/);
  assert.match(certificateBlock, /SERVICE_DIR: services\/certificate-service/);
  assert.match(certificateBlock, /env_file:[\s\S]*\.env\.vps\.certificate-service/);
  assert.match(certificateBlock, /expose:[\s\S]*- "3041"/);
  assert.match(certificateBlock, /fetch\('http:\/\/127\.0\.0\.1:3041\/health'\)/);
  assert.match(
    gatewayBlock,
    /depends_on:[\s\S]*certificate-service:[\s\S]*condition: service_healthy/,
  );
});

test("pessoal-service is part of the default VPS compose stack", async () => {
  const composeContents = await readFile(composeVpsFile, "utf8");
  const pessoalBlock = extractComposeServiceBlock(composeContents, "pessoal-service");
  const gatewayBlock = extractComposeServiceBlock(composeContents, "gateway");

  assert.doesNotMatch(pessoalBlock, /^\s+profiles:/m);
  assert.match(pessoalBlock, /image: workspace-pessoal-service:\$\{WORKSPACE_VPS_IMAGE_TAG:-vps\}/);
  assert.match(pessoalBlock, /WORKSPACE_PACKAGE: "@workspace\/pessoal-service"/);
  assert.match(pessoalBlock, /SERVICE_DIR: services\/pessoal-service/);
  assert.match(pessoalBlock, /env_file:[\s\S]*\.env\.vps\.pessoal-service/);
  assert.match(pessoalBlock, /expose:[\s\S]*- "3042"/);
  assert.match(pessoalBlock, /fetch\('http:\/\/127\.0\.0\.1:3042\/health'\)/);
  assert.match(gatewayBlock, /depends_on:[\s\S]*pessoal-service:[\s\S]*condition: service_healthy/);
});

test("parcelamento-service is part of the default VPS compose stack", async () => {
  const composeContents = await readFile(composeVpsFile, "utf8");
  const parcelamentoBlock = extractComposeServiceBlock(composeContents, "parcelamento-service");
  const gatewayBlock = extractComposeServiceBlock(composeContents, "gateway");

  assert.doesNotMatch(parcelamentoBlock, /^\s+profiles:/m);
  assert.match(
    parcelamentoBlock,
    /image: workspace-parcelamento-service:\$\{WORKSPACE_VPS_IMAGE_TAG:-vps\}/,
  );
  assert.match(parcelamentoBlock, /WORKSPACE_PACKAGE: "@workspace\/parcelamento-service"/);
  assert.match(parcelamentoBlock, /SERVICE_DIR: services\/parcelamento-service/);
  assert.match(parcelamentoBlock, /env_file:[\s\S]*\.env\.vps\.parcelamento-service/);
  assert.match(parcelamentoBlock, /expose:[\s\S]*- "3043"/);
  assert.match(parcelamentoBlock, /fetch\('http:\/\/127\.0\.0\.1:3043\/health'\)/);
  assert.match(
    gatewayBlock,
    /depends_on:[\s\S]*parcelamento-service:[\s\S]*condition: service_healthy/,
  );
});

test("certificate-service is accepted by VPS selective deploy scope", async () => {
  assert.equal(
    await runDeployScopeFunction("vps_validate_service_token", "certificate-service"),
    "",
  );
  assert.equal(
    await runDeployScopeFunction("vps_compose_service_args", "certificate-service"),
    "certificate-service",
  );
});

test("ti-service remains accepted by VPS selective deploy scope", async () => {
  assert.equal(await runDeployScopeFunction("vps_validate_service_token", "ti-service"), "");
  assert.equal(
    await runDeployScopeFunction("vps_compose_service_args", "ti-service"),
    "ti-service",
  );
});

test("parcelamento-service is accepted by VPS selective deploy scope", async () => {
  assert.equal(
    await runDeployScopeFunction("vps_validate_service_token", "parcelamento-service"),
    "",
  );
  assert.equal(
    await runDeployScopeFunction("vps_compose_service_args", "parcelamento-service"),
    "parcelamento-service",
  );
});

test("certificate-service is covered by VPS endpoint wait checks", async () => {
  const script = await readFile(vpsWaitEndpointsScript, "utf8");

  assert.match(
    script,
    /certificate-service\)\s+printf "%s\\n" "http:\/\/certificate-service:3041\/health"/,
  );
  assert.match(script, /ALL_BACKEND_SERVICES=\([\s\S]*certificate-service[\s\S]*\)/);
});

test("parcelamento-service is covered by VPS endpoint wait checks", async () => {
  const script = await readFile(vpsWaitEndpointsScript, "utf8");

  assert.match(
    script,
    /parcelamento-service\)\s+printf "%s\\n" "http:\/\/parcelamento-service:3043\/health"/,
  );
  assert.match(script, /ALL_BACKEND_SERVICES=\([\s\S]*parcelamento-service[\s\S]*\)/);
});

test("certificate-service is covered by VPS runtime override", async () => {
  const runtimeOverrideContents = await readFile(composeVpsRuntimeOverrideFile, "utf8");
  const gatewayBlock = extractComposeServiceBlock(runtimeOverrideContents, "gateway");
  const certificateBlock = extractComposeServiceBlock(
    runtimeOverrideContents,
    "certificate-service",
  );

  assert.match(
    gatewayBlock,
    /depends_on:[\s\S]*certificate-service:[\s\S]*condition: service_started/,
  );
  assert.match(certificateBlock, /healthcheck:[\s\S]*disable: true/);
});

test("parcelamento-service is covered by VPS runtime override", async () => {
  const runtimeOverrideContents = await readFile(composeVpsRuntimeOverrideFile, "utf8");
  const gatewayBlock = extractComposeServiceBlock(runtimeOverrideContents, "gateway");
  const parcelamentoBlock = extractComposeServiceBlock(
    runtimeOverrideContents,
    "parcelamento-service",
  );

  assert.match(
    gatewayBlock,
    /depends_on:[\s\S]*parcelamento-service:[\s\S]*condition: service_started/,
  );
  assert.match(parcelamentoBlock, /healthcheck:[\s\S]*disable: true/);
});

test("VPS env materialization includes audit-service in active workflows", async () => {
  const manifest = await readFile(vpsSecretsManifest, "utf8");
  assert.match(manifest, /^ENV_VPS_AUDIT_SERVICE\|\.env\.vps\.audit-service$/m);

  const workflowsDir = path.join(repoRoot, ".github", "workflows");
  const workflowFiles = (await readdir(workflowsDir))
    .filter((file) => file.endsWith(".yml"))
    .map((file) => path.join(workflowsDir, file));

  for (const workflowFile of workflowFiles) {
    const contents = await readFile(workflowFile, "utf8");
    const lines = contents.split(/\r?\n/);
    for (const [index, line] of lines.entries()) {
      if (!/^\s*run:\s+bash scripts\/ci\/materialize-vps-env\.sh\s*$/.test(line)) {
        continue;
      }

      const envWindow = lines.slice(Math.max(0, index - 30), index).join("\n");
      assert.match(
        envWindow,
        /^\s+ENV_VPS_AUDIT_SERVICE:\s+\$\{\{ secrets\.ENV_VPS_AUDIT_SERVICE \}\}/m,
        `${path.relative(repoRoot, workflowFile)} materialize step at line ${index + 1} should map ENV_VPS_AUDIT_SERVICE`,
      );
    }
  }
});

test("VPS env materialization includes certificate-service in active workflows", async () => {
  const manifest = await readFile(vpsSecretsManifest, "utf8");
  assert.match(manifest, /^ENV_VPS_CERTIFICATE_SERVICE\|\.env\.vps\.certificate-service$/m);

  const workflowsDir = path.join(repoRoot, ".github", "workflows");
  const workflowFiles = (await readdir(workflowsDir))
    .filter((file) => file.endsWith(".yml"))
    .map((file) => path.join(workflowsDir, file));

  for (const workflowFile of workflowFiles) {
    const contents = await readFile(workflowFile, "utf8");
    const lines = contents.split(/\r?\n/);
    for (const [index, line] of lines.entries()) {
      if (!/^\s*run:\s+bash scripts\/ci\/materialize-vps-env\.sh\s*$/.test(line)) {
        continue;
      }

      const envWindow = lines.slice(Math.max(0, index - 30), index).join("\n");
      assert.match(
        envWindow,
        /^\s+ENV_VPS_CERTIFICATE_SERVICE:\s+\$\{\{ secrets\.ENV_VPS_CERTIFICATE_SERVICE \}\}/m,
        `${path.relative(repoRoot, workflowFile)} materialize step at line ${index + 1} should map ENV_VPS_CERTIFICATE_SERVICE`,
      );
    }
  }
});

test("VPS env materialization includes pessoal-service in active workflows", async () => {
  const manifest = await readFile(vpsSecretsManifest, "utf8");
  assert.match(manifest, /^ENV_VPS_PESSOAL_SERVICE\|\.env\.vps\.pessoal-service$/m);
  assert.match(manifest, /^# INTERNAL_SERVICE_TOKEN=<token para rotas internas e scheduler>$/m);

  const workflowsDir = path.join(repoRoot, ".github", "workflows");
  const workflowFiles = (await readdir(workflowsDir))
    .filter((file) => file.endsWith(".yml"))
    .map((file) => path.join(workflowsDir, file));

  for (const workflowFile of workflowFiles) {
    const contents = await readFile(workflowFile, "utf8");
    const lines = contents.split(/\r?\n/);
    for (const [index, line] of lines.entries()) {
      if (!/^\s*run:\s+bash scripts\/ci\/materialize-vps-env\.sh\s*$/.test(line)) {
        continue;
      }

      const envWindow = lines.slice(Math.max(0, index - 30), index).join("\n");
      assert.match(
        envWindow,
        /^\s+ENV_VPS_PESSOAL_SERVICE:\s+\$\{\{ secrets\.ENV_VPS_PESSOAL_SERVICE \}\}/m,
        `${path.relative(repoRoot, workflowFile)} materialize step at line ${index + 1} should map ENV_VPS_PESSOAL_SERVICE`,
      );
    }
  }
});

test("VPS env materialization includes parcelamento-service in manifest", async () => {
  const manifest = await readFile(vpsSecretsManifest, "utf8");
  assert.match(manifest, /^ENV_VPS_PARCELAMENTO_SERVICE\|\.env\.vps\.parcelamento-service$/m);

  const workflowsDir = path.join(repoRoot, ".github", "workflows");
  const workflowFiles = (await readdir(workflowsDir))
    .filter((file) => file.endsWith(".yml"))
    .map((file) => path.join(workflowsDir, file));

  for (const workflowFile of workflowFiles) {
    const contents = await readFile(workflowFile, "utf8");
    const lines = contents.split(/\r?\n/);
    for (const [index, line] of lines.entries()) {
      if (!/^\s*run:\s+bash scripts\/ci\/materialize-vps-env\.sh\s*$/.test(line)) {
        continue;
      }

      const envWindow = lines.slice(Math.max(0, index - 30), index).join("\n");
      assert.match(
        envWindow,
        /^\s+ENV_VPS_PARCELAMENTO_SERVICE:\s+\$\{\{ secrets\.ENV_VPS_PARCELAMENTO_SERVICE \}\}/m,
        `${path.relative(repoRoot, workflowFile)} materialize step at line ${index + 1} should map ENV_VPS_PARCELAMENTO_SERVICE`,
      );
    }
  }
});

test("TI request image storage contract is explicit in docs and deploy manifests", async () => {
  const manifest = await readFile(vpsSecretsManifest, "utf8");
  assert.match(manifest, /^ENV_VPS_TI_SERVICE\|\.env\.vps\.ti-service$/m);
  assert.match(manifest, /^# TI_REQUEST_IMAGE_BUCKET=ti-request-attachments-private$/m);
  assert.match(
    manifest,
    /^# crie\/configure esse bucket como privado no Supabase Storage \(nao existe BUCKET_VISIBILITY no env do servico\)\.$/m,
  );
  assert.doesNotMatch(manifest, /^# BUCKET_VISIBILITY=/m);
  assert.match(
    manifest,
    /^# SUPABASE_SERVICE_ROLE_KEY=<service role key somente no VPS\/servico>$/m,
  );

  const envExample = await readFile(path.join(repoRoot, ".env.example"), "utf8");
  assert.match(envExample, /^TI_REQUEST_IMAGE_BUCKET=ti-request-attachments-private$/m);
  assert.match(
    envExample,
    /^# bucket do Supabase Storage para anexos de TI; crie-o como privado no painel do Supabase\.$/m,
  );
  assert.match(
    envExample,
    /^# uso exclusivo do backend\/servico; nunca exponha a service role em cliente ou codigo frontend\.$/m,
  );

  const tiServiceReadme = await readFile(
    path.join(repoRoot, "services", "ti-service", "README.md"),
    "utf8",
  );
  assert.match(
    tiServiceReadme,
    /`TI_REQUEST_IMAGE_BUCKET` com o valor recomendado `ti-request-attachments-private`/,
  );
  assert.match(
    tiServiceReadme,
    /Crie\/configure esse bucket como privado no Supabase Storage[\s\S]*`BUCKET_VISIBILITY`\)\./i,
  );
  assert.match(
    tiServiceReadme,
    /`SUPABASE_SERVICE_ROLE_KEY` deve permanecer apenas no ambiente do[\s\S]*servico\/VPS/i,
  );
});
