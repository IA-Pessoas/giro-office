import assert from "node:assert/strict";
import { dirname } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  createSharedRebuildWatcher,
  restartTargetsInBatches,
  runWorkspaceDev,
} from "./dev-workspace.mjs";
import { serviceRegistry } from "./service-registry.mjs";

const rootDir = dirname(dirname(fileURLToPath(import.meta.url)));

function createFixtureOptions({ batchSize = 2, failingTarget } = {}) {
  const events = [];
  const started = new Set();
  let shutdownCode = 0;
  const targets = [
    {
      name: "shared",
      kind: "shared",
      readiness: { type: "output", successPattern: /ready/ },
    },
    { name: "a", kind: "service", readiness: { type: "http", url: "http://a/health" } },
    { name: "b", kind: "service", readiness: { type: "http", url: "http://b/health" } },
    { name: "c", kind: "service", readiness: { type: "http", url: "http://c/health" } },
    {
      name: "gateway",
      kind: "gateway",
      readiness: { type: "http", url: "http://gateway/health" },
    },
    { name: "app", kind: "app", readiness: { type: "tcp", host: "127.0.0.1", port: 3000 } },
  ];
  const manager = {
    start(target) {
      events.push(`start:${target.name}`);
      started.add(target.name);
      return {
        name: target.name,
        exitPromise: new Promise(() => {}),
        onOutput: () => () => {},
        waitForOutput: async () => {
          if (target.name === failingTarget) throw new Error(`${target.name} failed`);
          events.push(`ready:${target.name}`);
        },
      };
    },
    async stopAll(code) {
      shutdownCode = code;
      events.push("shutdown");
      return code;
    },
    async waitForShutdown() {
      return shutdownCode;
    },
  };

  const ready = async (target) => {
    if (target.name === failingTarget) throw new Error(`${target.name} failed`);
    events.push(`ready:${target.name}`);
  };

  return {
    events,
    started,
    options: {
      env: {},
      rootDir,
      registry: [],
      targets,
      profile: { name: "test", batchSize, batchDelayMs: 1 },
      workspaceText: "packages:\n",
      manager,
      runPreflightImpl: async () => {
        events.push("preflight");
        return { warnings: [] };
      },
      waitForHttpHealthImpl: ready,
      waitForTcpImpl: ready,
      createHealthMonitorImpl: () => ({
        start() {
          events.push("monitoring");
        },
        stop() {},
      }),
      sleep: async () => {},
      signalSource: { on() {}, off() {} },
      logger: { log() {}, warn() {}, error() {} },
    },
  };
}

test("starts shared, service batches, gateway, then app", async () => {
  const fixture = createFixtureOptions({ batchSize: 2 });

  assert.equal(await runWorkspaceDev(fixture.options), 0);
  assert.deepEqual(fixture.events, [
    "preflight",
    "start:shared",
    "ready:shared",
    "start:a",
    "start:b",
    "ready:a",
    "ready:b",
    "start:c",
    "ready:c",
    "start:gateway",
    "ready:gateway",
    "start:app",
    "ready:app",
    "monitoring",
  ]);
});

test("readiness failure stops every started target", async () => {
  const fixture = createFixtureOptions({ failingTarget: "b" });

  assert.equal(await runWorkspaceDev(fixture.options), 1);
  assert.deepEqual([...fixture.started].sort(), ["a", "b", "shared"]);
  assert.equal(fixture.events.at(-1), "shutdown");
});

test("dry-run lists the complete stack and contains no Docker command", async () => {
  const result = await runWorkspaceDev({
    dryRun: true,
    rootDir,
    registry: serviceRegistry,
    env: { DEV_PROFILE: "normal" },
  });

  assert.equal(result.targets.length, 18);
  assert.equal(result.profile.name, "normal");
  assert.doesNotMatch(JSON.stringify(result), /docker/i);
  assert.ok(result.targets.every((target) => target.command === process.execPath));
});

test("shared rebuild restarts services in profile batches", async () => {
  const events = [];

  await restartTargetsInBatches({
    targets: [{ name: "a" }, { name: "b" }, { name: "c" }],
    profile: { batchSize: 2, batchDelayMs: 1500 },
    restartTarget: async (target) => events.push(`restart:${target.name}`),
    sleep: async (milliseconds) => events.push(`delay:${milliseconds}`),
  });

  assert.deepEqual(events, ["restart:a", "restart:b", "delay:1500", "restart:c"]);
});

test("shared rebuild watcher reacts only after a successful incremental compilation", () => {
  const listeners = new Set();
  const handle = {
    onOutput(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
  let successfulRebuilds = 0;
  const stop = createSharedRebuildWatcher(handle, {
    onSuccessfulRebuild: () => {
      successfulRebuilds += 1;
    },
  });
  const emit = (line) => {
    for (const listener of listeners) listener(line);
  };

  emit("Found 0 errors. Watching for file changes.");
  emit("File change detected. Starting incremental compilation...");
  emit("Found 2 errors. Watching for file changes.");
  emit("Found 0 errors. Watching for file changes.");
  assert.equal(successfulRebuilds, 0);

  emit("File change detected. Starting incremental compilation...");
  emit("Found 0 errors. Watching for file changes.");
  assert.equal(successfulRebuilds, 1);

  stop();
  emit("File change detected. Starting incremental compilation...");
  emit("Found 0 errors. Watching for file changes.");
  assert.equal(successfulRebuilds, 1);
});
