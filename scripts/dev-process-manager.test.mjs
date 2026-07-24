import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { dirname, resolve } from "node:path";
import { PassThrough } from "node:stream";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { buildWindowsTaskkillArgs, createProcessManager } from "./dev-process-manager.mjs";

const rootDir = dirname(dirname(fileURLToPath(import.meta.url)));
const fixturePath = resolve(rootDir, "scripts/fixtures/dev-child-tree.mjs");

function isPidAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    if (error.code === "ESRCH") return false;
    throw error;
  }
}

function erroringChild(code) {
  const child = new EventEmitter();
  child.stdout = new PassThrough();
  child.stderr = new PassThrough();
  child.pid = undefined;
  process.nextTick(() => child.emit("error", Object.assign(new Error(code), { code })));
  return child;
}

test("Windows taskkill arguments target the complete tree", () => {
  assert.deepEqual(buildWindowsTaskkillArgs(123, false), ["/PID", "123", "/T"]);
  assert.deepEqual(buildWindowsTaskkillArgs(123, true), ["/PID", "123", "/T", "/F"]);
});

test("POSIX stopAll leaves no descendant alive", async (t) => {
  if (process.platform === "win32") return t.skip("POSIX-only process group assertion");

  const manager = createProcessManager({ gracePeriodMs: 250 });
  const child = manager.start({
    name: "fixture",
    command: process.execPath,
    args: [fixturePath],
    packageDir: rootDir,
  });
  const line = await child.waitForOutput({
    successPattern: /GRANDCHILD_PID:(\d+)/,
    timeoutMs: 2000,
  });
  const grandchildPid = Number(line.match(/GRANDCHILD_PID:(\d+)/)[1]);

  await manager.stopAll(0);

  assert.equal(isPidAlive(child.pid), false);
  assert.equal(isPidAlive(grandchildPid), false);
  assert.equal(await manager.waitForShutdown(), 0);
});

test("spawn error triggers one non-zero shutdown", async () => {
  let spawns = 0;
  const manager = createProcessManager({
    spawnImpl: () => {
      spawns += 1;
      return erroringChild("ENOENT");
    },
  });

  manager.start({ name: "missing", command: "missing", args: [], packageDir: rootDir });

  assert.equal(await manager.waitForShutdown(), 1);
  assert.equal(spawns, 1);
});

test("output readiness surfaces watcher compilation failures", async () => {
  const child = new EventEmitter();
  child.stdout = new PassThrough();
  child.stderr = new PassThrough();
  child.pid = 123;
  const manager = createProcessManager({
    spawnImpl: () => child,
    platform: "win32",
  });
  const handle = manager.start({
    name: "shared",
    command: process.execPath,
    args: [],
    packageDir: rootDir,
  });
  const readiness = handle.waitForOutput({
    successPattern: /Found 0 errors/,
    failurePattern: /Found [1-9]\d* errors/,
    timeoutMs: 500,
  });
  child.stdout.write("Found 2 errors. Watching for file changes.\n");

  await assert.rejects(readiness, /shared.*Found 2 errors/);
  child.emit("exit", 0, null);
});
