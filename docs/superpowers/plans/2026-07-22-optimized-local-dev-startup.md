# Optimized Local Development Startup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (- [ ]) syntax for tracking.

**Goal:** Make pnpm dev start the complete local web-and-services stack with bounded startup pressure, verified readiness, direct watcher processes, and leak-free cross-platform shutdown, without invoking Docker.

**Architecture:** A Node.js supervisor composes target/profile configuration, preflight checks, readiness monitoring, and a platform-specific process manager. It starts shared, domain services in adaptive batches, gateway, and app in dependency order; Prisma remains a single cached preparation step with recoverable locking.

**Tech Stack:** Node.js ESM, built-in node:test, child_process, HTTP/TCP probes, pnpm 9, Next.js, TypeScript, tsx, Prisma.

## Global Constraints

- pnpm dev must never invoke Docker, Docker Compose, Swarm, or container tooling.
- Local database URLs and secrets stay in engineer-managed env files and must never be logged.
- The active runtime is app + shared + all entries in scripts/service-registry.mjs; exclude legacy services/src.
- Preserve package-level dev, predev, prebuild, and typecheck behavior.
- Use TDD for every behavior change and keep unrelated gateway changes out of startup commits.
- Format JavaScript/JSON with Biome and preserve current ESM conventions.

---

### Task 1: Target configuration, profiles, and direct binary resolution

**Files:**
- Create: scripts/dev-workspace.config.mjs
- Create: scripts/dev-workspace.config.test.mjs

**Interfaces:**
- Produces: selectDevProfile({ env, cpuCount, totalMemoryBytes }) -> DevProfile
- Produces: readPositiveInteger(name, value) -> number | undefined
- Produces: resolvePackageBin({ packageDir, packageName, binName }) -> string
- Produces: createDevTargets({ rootDir, registry, resolveBin }) -> DevTarget[]
- DevTarget contains name, kind, packageDir, command, args, and readiness metadata.

- [ ] **Step 1: Write failing profile and target tests**

~~~js
test("selectDevProfile chooses low for constrained hosts", () => {
  assert.equal(
    selectDevProfile({ env: {}, cpuCount: 4, totalMemoryBytes: 8 * 1024 ** 3 }).name,
    "low",
  );
});

test("explicit profile and numeric overrides win", () => {
  assert.deepEqual(
    selectDevProfile({
      env: { DEV_PROFILE: "normal", DEV_START_BATCH_SIZE: "3", DEV_START_DELAY_MS: "750" },
      cpuCount: 2,
      totalMemoryBytes: 4 * 1024 ** 3,
    }),
    { name: "normal", batchSize: 3, batchDelayMs: 750 },
  );
});

test("invalid numeric overrides fail", () => {
  assert.throws(() => readPositiveInteger("DEV_START_BATCH_SIZE", "4x"), /positive integer/);
});

test("targets order shared, domain services, gateway, app", () => {
  const targets = createDevTargets({
    rootDir: "/repo",
    registry: [
      { name: "gateway", packagePath: "services/gateway", defaultUrl: "http://localhost:3010" },
      { name: "user-service", packagePath: "services/user-service", defaultUrl: "http://localhost:3030" },
    ],
    resolveBin: ({ packageName }) => "/bin/" + packageName,
  });
  assert.deepEqual(targets.map((target) => target.name), [
    "shared",
    "user-service",
    "gateway",
    "app",
  ]);
  assert.ok(targets.every((target) => target.command === process.execPath));
});
~~~

- [ ] **Step 2: Run node --test scripts/dev-workspace.config.test.mjs**

Expected: FAIL because scripts/dev-workspace.config.mjs does not exist.

- [ ] **Step 3: Implement profile and target configuration**

Implement the approved thresholds, strict integer parsing, package-local createRequire resolution of package.json bin entries, and direct process.execPath commands. Services use the resolved tsx bin with watch and src/server.ts. No target may use pnpm, a shell, or Docker.

- [ ] **Step 4: Run tests and formatting**

Run: node --test scripts/dev-workspace.config.test.mjs

Run: corepack pnpm exec biome check scripts/dev-workspace.config.mjs scripts/dev-workspace.config.test.mjs

Expected: both exit 0.

- [ ] **Step 5: Commit**

~~~bash
git add scripts/dev-workspace.config.mjs scripts/dev-workspace.config.test.mjs
git commit -m "feat(dev): configure adaptive local startup targets"
~~~

---

### Task 2: Preflight and readiness primitives

**Files:**
- Create: scripts/dev-preflight.mjs
- Create: scripts/dev-preflight.test.mjs
- Create: scripts/dev-readiness.mjs
- Create: scripts/dev-readiness.test.mjs

**Interfaces:**
- Produces: validateRegistryParity({ workspaceText, registry }) -> void
- Produces: checkPortAvailable({ host, port, timeoutMs }) -> Promise<boolean>
- Produces: runPreflight(options) -> Promise<PreflightResult>
- Produces: waitForHttpHealth(target, options) -> Promise<void>
- Produces: waitForTcp(target, options) -> Promise<void>
- Produces: createHealthMonitor(targets, options) -> { start(), stop() }

- [ ] **Step 1: Write failing tests with temporary local servers**

~~~js
test("HTTP readiness waits for a 2xx response", async () => {
  let healthy = false;
  const server = createServer((_request, response) => {
    response.statusCode = healthy ? 200 : 503;
    response.end();
  });
  const port = await listen(server);
  setTimeout(() => { healthy = true; }, 50);
  await waitForHttpHealth(
    { name: "fixture", healthUrl: "http://127.0.0.1:" + port + "/health" },
    { timeoutMs: 1000, intervalMs: 10 },
  );
  await close(server);
});

test("watcher alive without a server still times out", async () => {
  await assert.rejects(
    waitForHttpHealth(
      { name: "dead-service", healthUrl: "http://127.0.0.1:1/health" },
      { timeoutMs: 50, intervalMs: 10 },
    ),
    /dead-service.*readiness timeout/,
  );
});

test("registry parity rejects an unregistered workspace service", () => {
  assert.throws(
    () => validateRegistryParity({
      workspaceText: 'packages:\n  - "services/gateway"\n  - "services/missing-service"\n',
      registry: [{ packagePath: "services/gateway" }],
    }),
    /missing-service/,
  );
});
~~~

- [ ] **Step 2: Run node --test scripts/dev-preflight.test.mjs scripts/dev-readiness.test.mjs**

Expected: FAIL because both modules are absent.

- [ ] **Step 3: Implement bounded probes and preflight**

Use node:net for port/TCP checks and fetch with AbortSignal.timeout for health checks. Validate target paths/bins, exact workspace registry parity, and port availability. Return memory warnings without reading or printing secret values. Health monitoring polls every two seconds and calls the injected failure callback after five consecutive failures.

- [ ] **Step 4: Run tests and Biome**

Expected: all checks pass.

- [ ] **Step 5: Commit**

~~~bash
git add scripts/dev-preflight.mjs scripts/dev-preflight.test.mjs scripts/dev-readiness.mjs scripts/dev-readiness.test.mjs
git commit -m "feat(dev): add preflight and health readiness"
~~~

---

### Task 3: Cross-platform process-tree manager

**Files:**
- Create: scripts/dev-process-manager.mjs
- Create: scripts/dev-process-manager.test.mjs
- Create: scripts/fixtures/dev-child-tree.mjs

**Interfaces:**
- Produces: createProcessManager({ platform, spawnImpl, killImpl, setTimeoutImpl })
- Manager methods: start(target), stopTarget(name), stopAll(exitCode), waitForShutdown()
- Produces: buildWindowsTaskkillArgs(pid, force) -> string[]

- [ ] **Step 1: Write failing lifecycle tests**

~~~js
test("Windows taskkill arguments target the complete tree", () => {
  assert.deepEqual(buildWindowsTaskkillArgs(123, false), ["/PID", "123", "/T"]);
  assert.deepEqual(buildWindowsTaskkillArgs(123, true), ["/PID", "123", "/T", "/F"]);
});

test("POSIX stopAll leaves no descendant alive", async (t) => {
  if (process.platform === "win32") return t.skip();
  const manager = createProcessManager();
  const child = manager.start({
    name: "fixture",
    command: process.execPath,
    args: [fixturePath],
    cwd: rootDir,
  });
  const grandchildPid = await readGrandchildPid(child);
  await manager.stopAll(0);
  assert.equal(isPidAlive(child.pid), false);
  assert.equal(isPidAlive(grandchildPid), false);
});

test("spawn error triggers one non-zero shutdown", async () => {
  const manager = createProcessManager({ spawnImpl: () => throwingChild("ENOENT") });
  manager.start({ name: "missing", command: "missing", args: [], cwd: rootDir });
  assert.equal(await manager.waitForShutdown(), 1);
});
~~~

- [ ] **Step 2: Run node --test scripts/dev-process-manager.test.mjs**

Expected: FAIL because the manager is absent.

- [ ] **Step 3: Implement lifecycle management**

On POSIX spawn with detached true and signal negative PIDs. On Windows invoke taskkill without shell. Prefix line-oriented output, retain a bounded 50-line tail, handle error/exit, make shutdown idempotent, escalate after the grace period, and await every child exit.

- [ ] **Step 4: Run lifecycle tests twice**

Run the file twice sequentially. Expected: both PASS with no fixture descendants.

- [ ] **Step 5: Commit**

~~~bash
git add scripts/dev-process-manager.mjs scripts/dev-process-manager.test.mjs scripts/fixtures/dev-child-tree.mjs
git commit -m "feat(dev): supervise complete process trees"
~~~

---

### Task 4: Recoverable Prisma preparation

**Files:**
- Modify: scripts/prisma-generate.mjs
- Create: scripts/prisma-generate.test.mjs

**Interfaces:**
- Produces: createPnpmCommand(args, env)
- Produces: isProcessAlive(pid, killImpl)
- Produces: isLockStale(metadata, options)
- Produces: ensureGeneratedClients(options) for dependency-injected tests.

- [ ] **Step 1: Write failing resolver and stale-lock tests**

~~~js
test("only a pnpm npm_execpath is reused", () => {
  assert.equal(createPnpmCommand([], { npm_execpath: "/tools/pnpm.cjs" }).command, process.execPath);
  assert.deepEqual(createPnpmCommand([], { npm_execpath: "/usr/bin/npm" }), {
    command: "corepack",
    args: ["pnpm"],
  });
});

test("a dead lock owner is stale immediately", () => {
  assert.equal(
    isLockStale(
      { pid: 123, acquiredAt: Date.now() },
      { now: Date.now(), staleMs: 60_000, isAlive: () => false },
    ),
    true,
  );
});

test("an abandoned lock is recovered and generation runs once", async () => {
  const fixture = await createPrismaFixture({ abandonedLock: true });
  await ensureGeneratedClients(fixture.options);
  assert.equal(fixture.generateCalls(), 1);
});
~~~

- [ ] **Step 2: Run node --test scripts/prisma-generate.test.mjs**

Expected: FAIL because helpers are not exported and lock metadata is absent.

- [ ] **Step 3: Implement guarded exports and lock recovery**

Write owner.json after lock acquisition. Treat malformed metadata, dead owners, or locks older than five minutes as stale. Export helpers and run real generation only from the CLI main guard.

- [ ] **Step 4: Verify tests and two real warm-cache preparations**

Run: node --test scripts/prisma-generate.test.mjs

Run: corepack pnpm run dev:prepare twice.

Expected: all exit 0; second preparation performs no generation.

- [ ] **Step 5: Commit**

~~~bash
git add scripts/prisma-generate.mjs scripts/prisma-generate.test.mjs
git commit -m "fix(dev): recover abandoned Prisma generation locks"
~~~

---

### Task 5: Readiness-driven workspace supervisor

**Files:**
- Replace: scripts/dev-workspace.mjs
- Create: scripts/dev-workspace.test.mjs

**Interfaces:**
- Produces: runWorkspaceDev(options) -> Promise<number>
- Consumes Tasks 1–3 modules through explicit injectable options.

- [ ] **Step 1: Write failing orchestration tests**

~~~js
test("starts shared, service batches, gateway, then app", async () => {
  const fixture = createFixtureOptions({ batchSize: 2 });
  const result = await runWorkspaceDev(fixture.options);
  assert.equal(result, 0);
  assert.deepEqual(fixture.events, [
    "preflight",
    "start:shared", "ready:shared",
    "start:a", "start:b", "ready:a", "ready:b",
    "start:c", "ready:c",
    "start:gateway", "ready:gateway",
    "start:app", "ready:app",
    "monitoring",
    "shutdown",
  ]);
});

test("readiness failure stops all started targets", async () => {
  const fixture = createFixtureOptions({ failingTarget: "b" });
  assert.equal(await runWorkspaceDev(fixture.options), 1);
  assert.deepEqual(fixture.stoppedTargets().sort(), ["a", "b", "shared"]);
});

test("dry-run lists 18 targets and contains no Docker command", async () => {
  const fixture = createFixtureOptions({ dryRun: true });
  const result = await runWorkspaceDev(fixture.options);
  assert.equal(result.targets.length, 18);
  assert.doesNotMatch(JSON.stringify(result), /docker/i);
});
~~~

- [ ] **Step 2: Run node --test scripts/dev-workspace.test.mjs**

Expected: FAIL against the existing launcher.

- [ ] **Step 3: Implement the supervisor**

Compose config, preflight, process manager, and readiness. Add --dry-run, signals, ordered stages, batch readiness, continuous monitoring, and a CLI main guard. Library code returns exit codes and never calls process.exit directly.

- [ ] **Step 4: Run every startup unit test together**

~~~bash
node --test scripts/dev-workspace.config.test.mjs scripts/dev-preflight.test.mjs scripts/dev-readiness.test.mjs scripts/dev-process-manager.test.mjs scripts/prisma-generate.test.mjs scripts/dev-workspace.test.mjs
~~~

Expected: PASS.

- [ ] **Step 5: Commit**

~~~bash
git add scripts/dev-workspace.mjs scripts/dev-workspace.test.mjs
git commit -m "feat(dev): orchestrate readiness-driven local startup"
~~~

---

### Task 6: Manifest cleanup and invariant coverage

**Files:**
- Modify: package.json
- Modify: turbo.json
- Modify: app/package.json
- Modify: shared/package.json
- Modify: services/*/package.json
- Create: scripts/dev-scripts.test.mjs

**Interfaces:**
- Root dev is node scripts/prisma-generate.mjs && node scripts/dev-workspace.mjs.
- Root dev:test runs all startup unit tests.
- Package dev scripts remain unchanged; dev:workspace is absent.

- [ ] **Step 1: Write failing manifest invariants**

~~~js
test("root dev contains no reset, Turbo, or Docker", () => {
  const root = readJson("package.json");
  assert.equal(root.scripts.dev, "node scripts/prisma-generate.mjs && node scripts/dev-workspace.mjs");
  assert.doesNotMatch(root.scripts.dev, /docker|turbo|dev-reset/i);
  assert.equal(root.scripts["dev:full"], undefined);
});

test("packages preserve dev and omit dev:workspace", () => {
  for (const manifest of developmentManifests()) {
    assert.ok(manifest.scripts.dev);
    assert.equal(manifest.scripts["dev:workspace"], undefined);
  }
});

test("Turbo omits the unused workspace task", () => {
  assert.equal(readJson("turbo.json").tasks["dev:workspace"], undefined);
});
~~~

- [ ] **Step 2: Run node --test scripts/dev-scripts.test.mjs**

Expected: FAIL against current manifests.

- [ ] **Step 3: Apply the minimal cleanup**

Remove dev-reset from root dev, remove dev:full, add dev:test, remove every dev:workspace package script, and remove the Turbo task. Preserve all package dev and Prisma lifecycle values.

- [ ] **Step 4: Run dev:test and Biome**

Expected: all unit tests and formatting checks pass.

- [ ] **Step 5: Commit only startup manifests**

~~~bash
git add package.json turbo.json app/package.json shared/package.json services/*/package.json scripts/dev-scripts.test.mjs
git commit -m "refactor(dev): remove duplicate workspace scripts"
~~~

---

### Task 7: Shared-restart evidence, real stack, and performance verification

**Files:**
- Modify only if evidence requires: scripts/dev-workspace.config.mjs
- Modify only if evidence requires: scripts/dev-workspace.mjs
- Modify only if evidence requires: corresponding tests
- Modify: docs/dev-startup-review-handoff.md

- [ ] **Step 1: Observe shared-change behavior**

Run the complete stack with a temporary valid PESSOAL_PASSWORD_ENCRYPTION_KEY, record service PIDs, touch a harmless shared/src file without changing its contents, and observe whether service watcher/server PIDs restart simultaneously.

Expected: evidence establishes whether a restart storm exists. Do not add rolling restart code unless reproduced.

- [ ] **Step 2: If reproduced, write the failing rolling-restart test**

~~~js
test("shared rebuild restarts services in profile batches", async () => {
  const fixture = createFixtureOptions({ sharedRebuilds: 1, batchSize: 2 });
  await runUntilSharedRebuildHandled(fixture);
  assert.deepEqual(fixture.restartBatches(), [["a", "b"], ["c"]]);
});
~~~

Expected: RED, followed by minimal rolling-restart implementation and GREEN. If no storm is reproduced, document the evidence and skip this conditional code.

- [ ] **Step 3: Update the handoff**

Document profiles, env ownership, startup order, health behavior, shutdown guarantees, no-Docker scope, tests, and measured results.

- [ ] **Step 4: Run manual diff and static verification**

~~~bash
git diff --stat
git diff --check
rg -n "docker|dev:workspace|dev-reset" package.json scripts/dev-*.mjs app/package.json shared/package.json services/*/package.json turbo.json
corepack pnpm run dev:test
~~~

Expected: no Docker/dev-reset/dev:workspace startup references and all tests PASS.

- [ ] **Step 5: Run real full-stack measurement**

Start corepack pnpm dev outside the socket sandbox with a temporary valid encryption key. Poll app plus all registry ports, collect process count/RSS at 10 seconds and peak, then test Ctrl+C and targeted supervisor SIGTERM separately.

Acceptance:
- 17/17 network targets reachable.
- At most 2.0 GiB RSS at 10 seconds and at most 5.7 GiB peak under comparable warm-cache conditions.
- Fewer than 74 persistent processes.
- Zero descendants after either shutdown.
- No Docker command observed.

- [ ] **Step 6: Commit final documentation and any evidence-driven code**

~~~bash
git add docs/dev-startup-review-handoff.md scripts/dev-workspace.config.mjs scripts/dev-workspace.mjs scripts/dev-workspace.test.mjs
git commit -m "docs(dev): record optimized startup verification"
~~~

---

### Task 8: Final review and draft pull request

**Files:**
- Review all startup files from Tasks 1–7.
- Exclude unrelated services/gateway/src/app.routes.test.ts and services/gateway/src/middlewares/audit.ts from the PR.

- [ ] **Step 1: Run final verification**

~~~bash
corepack pnpm run dev:test
corepack pnpm exec biome check package.json turbo.json app/package.json shared/package.json services/*/package.json scripts/dev-*.mjs scripts/prisma-generate.mjs scripts/prisma-generate.test.mjs
git diff --check develop...HEAD
git status --short
~~~

Expected: tests and Biome pass; only the two known unrelated gateway files may remain uncommitted.

- [ ] **Step 2: Review commit and file scope**

~~~bash
git log --oneline develop..HEAD
git diff --stat develop...HEAD
git diff --name-only develop...HEAD
~~~

Expected: design/plan docs and local startup files only.

- [ ] **Step 3: Push and open a draft PR**

Push codex/optimize-local-dev-startup and open a draft PR titled “feat(dev): optimize full local workspace startup”. Include measured before/after results, local env requirements, explicit no-Docker behavior, verification commands, and a personal-machine checklist.

- [ ] **Step 4: Return the PR URL and check status**

Report the draft PR URL and any remote checks that are pending or failing.
