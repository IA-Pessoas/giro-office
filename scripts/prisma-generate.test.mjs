import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  createPnpmCommand,
  ensureGeneratedClients,
  isLockStale,
  isProcessAlive,
} from "./prisma-generate.mjs";

test("only a pnpm npm_execpath is reused", () => {
  assert.deepEqual(createPnpmCommand(["exec"], { npm_execpath: "/tools/pnpm.cjs" }), {
    command: process.execPath,
    args: ["/tools/pnpm.cjs", "exec"],
  });
  assert.deepEqual(createPnpmCommand([], { npm_execpath: "/usr/bin/npm" }), {
    command: "corepack",
    args: ["pnpm"],
  });
});

test("process liveness distinguishes ESRCH from an inaccessible live process", () => {
  assert.equal(
    isProcessAlive(123, () => {
      throw Object.assign(new Error("gone"), { code: "ESRCH" });
    }),
    false,
  );
  assert.equal(
    isProcessAlive(123, () => {
      throw Object.assign(new Error("denied"), { code: "EPERM" });
    }),
    true,
  );
});

test("a dead lock owner is stale immediately", () => {
  const now = Date.now();
  assert.equal(
    isLockStale({ pid: 123, acquiredAt: now }, { now, staleMs: 60_000, isAlive: () => false }),
    true,
  );
  assert.equal(
    isLockStale(
      { pid: 123, acquiredAt: now - 60_001 },
      { now, staleMs: 60_000, isAlive: () => true },
    ),
    true,
  );
  assert.equal(isLockStale(null, { now, staleMs: 60_000, isAlive: () => true }), true);
});

test("an abandoned lock is recovered and generation runs once", async () => {
  const rootDir = await mkdtemp(join(tmpdir(), "prisma-generate-"));
  const stateDir = join(rootDir, ".state");
  const lockDir = join(stateDir, "generate.lock");
  const inputPath = join(rootDir, "schema.prisma");
  const outputDir = join(rootDir, "generated");
  await mkdir(lockDir, { recursive: true });
  await writeFile(inputPath, "model Example { id String @id }\n");
  await writeFile(
    join(lockDir, "owner.json"),
    JSON.stringify({ pid: 999_999_999, acquiredAt: Date.now() }),
  );
  let generateCalls = 0;

  await ensureGeneratedClients({
    stateDir,
    lockDir,
    stampFile: join(stateDir, "generate.stamp"),
    schemaInputs: [inputPath],
    outputDirs: [outputDir],
    isAlive: () => false,
    runGenerate: async () => {
      generateCalls += 1;
      await mkdir(outputDir, { recursive: true });
      await writeFile(join(outputDir, "client.js"), "// generated\n");
    },
    sleep: async () => {},
  });

  assert.equal(generateCalls, 1);
  assert.match(await readFile(join(stateDir, "generate.stamp"), "utf8"), /^[a-f0-9]{64}$/);
  await assert.rejects(readFile(join(lockDir, "owner.json"), "utf8"), /ENOENT/);
});

test("a warm generated-client cache skips generation", async () => {
  const rootDir = await mkdtemp(join(tmpdir(), "prisma-generate-warm-"));
  const stateDir = join(rootDir, ".state");
  const inputPath = join(rootDir, "schema.prisma");
  const outputDir = join(rootDir, "generated");
  await mkdir(outputDir, { recursive: true });
  await writeFile(inputPath, "schema\n");
  await writeFile(join(outputDir, "client.ts"), "// generated\n");
  let generateCalls = 0;
  const options = {
    stateDir,
    lockDir: join(stateDir, "generate.lock"),
    stampFile: join(stateDir, "generate.stamp"),
    schemaInputs: [inputPath],
    outputDirs: [outputDir],
    runGenerate: async () => {
      generateCalls += 1;
      await mkdir(outputDir, { recursive: true });
      await writeFile(join(outputDir, "client.ts"), "// generated\n");
    },
  };

  await ensureGeneratedClients(options);
  await ensureGeneratedClients(options);

  assert.equal(generateCalls, 1);
});
