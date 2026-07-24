import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  acquireLockMutationMutex,
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

test("Linux advisory mutex belongs to its caller process", {
  skip: process.platform !== "linux",
}, async () => {
  const rootDir = await mkdtemp(join(tmpdir(), "prisma-generate-flock-crash-"));
  const mutationLockFile = join(rootDir, "mutation.lock");
  const callerSource = `
const { acquireLockMutationMutex } = await import(${JSON.stringify(
    new URL("./prisma-generate.mjs", import.meta.url).href,
  )});
const mutex = await acquireLockMutationMutex(process.argv[1]);
process.stdout.write(JSON.stringify({
  acquired: Boolean(mutex),
  holderPid: mutex?.holder?.pid ?? null,
}) + "\\n");
if (mutex) setInterval(() => {}, 1_000);
`;
  const startCaller = () =>
    spawn(process.execPath, ["--input-type=module", "-e", callerSource, mutationLockFile], {
      stdio: ["ignore", "pipe", "pipe"],
    });
  const readCallerStatus = (caller) =>
    new Promise((resolve, reject) => {
      let output = "";
      let errorOutput = "";
      let settled = false;
      const fail = (error) => {
        if (settled) return;
        settled = true;
        reject(error);
      };

      caller.stdout.setEncoding("utf8");
      caller.stdout.on("data", (chunk) => {
        output += chunk;
        const newlineIndex = output.indexOf("\n");
        if (settled || newlineIndex === -1) return;
        settled = true;
        try {
          resolve(JSON.parse(output.slice(0, newlineIndex)));
        } catch (error) {
          reject(error);
        }
      });
      caller.stderr.setEncoding("utf8");
      caller.stderr.on("data", (chunk) => {
        errorOutput += chunk;
      });
      caller.once("error", fail);
      caller.once("exit", (code, signal) => {
        fail(
          new Error(
            `mutex caller exited before reporting (code ${code ?? "null"}, signal ${signal ?? "none"}): ${errorOutput.trim() || "no stderr"}`,
          ),
        );
      });
    });
  const stopCaller = async (caller) => {
    if (!caller) return;
    if (caller.exitCode !== null || caller.signalCode !== null) return;
    const exited = new Promise((resolve) => caller.once("exit", resolve));
    caller.kill("SIGKILL");
    await exited;
  };
  let firstCaller;
  let secondCaller;
  let replacementCaller;

  try {
    firstCaller = startCaller();
    assert.deepEqual(await readCallerStatus(firstCaller), { acquired: true, holderPid: null });

    secondCaller = startCaller();
    assert.deepEqual(await readCallerStatus(secondCaller), { acquired: false, holderPid: null });
    await new Promise((resolve) => secondCaller.once("exit", resolve));
    secondCaller = null;

    await stopCaller(firstCaller);
    firstCaller = null;

    replacementCaller = startCaller();
    assert.deepEqual(await readCallerStatus(replacementCaller), {
      acquired: true,
      holderPid: null,
    });
  } finally {
    await stopCaller(firstCaller);
    await stopCaller(secondCaller);
    await stopCaller(replacementCaller);
  }
});

test("a dead lock owner is stale immediately", () => {
  const now = Date.now();
  assert.equal(
    isLockStale(
      { pid: 123, acquiredAt: now, token: "owner" },
      { now, staleMs: 60_000, isAlive: () => false },
    ),
    true,
  );
  assert.equal(isLockStale(null, { now, staleMs: 60_000, isAlive: () => true }), true);
});

test("a live complete lock owner is not stale due to age", () => {
  const now = Date.now();
  assert.equal(
    isLockStale(
      { pid: 123, acquiredAt: now - 60_001, token: "owner" },
      { now, staleMs: 60_000, isAlive: () => true },
    ),
    false,
  );
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
    JSON.stringify({ pid: 999_999_999, acquiredAt: Date.now(), token: "abandoned-owner" }),
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

test("stale lock recovery does not remove a replaced live owner", async () => {
  const rootDir = await mkdtemp(join(tmpdir(), "prisma-generate-recovery-race-"));
  const stateDir = join(rootDir, ".state");
  const lockDir = join(stateDir, "generate.lock");
  const ownerFile = join(lockDir, "owner.json");
  const inputPath = join(rootDir, "schema.prisma");
  const currentTime = 100_000;
  const staleOwner = { pid: 111, acquiredAt: currentTime, token: "stale-owner" };
  const replacementOwner = { pid: 222, acquiredAt: currentTime, token: "live-owner" };
  const waitError = new Error("replacement owner still holds the lock");
  await mkdir(lockDir, { recursive: true });
  await writeFile(inputPath, "model Example { id String @id }\n");
  await writeFile(ownerFile, JSON.stringify(staleOwner));
  let ownerReadCalls = 0;
  let lockRemovalCalls = 0;
  let generateCalls = 0;

  await assert.rejects(
    ensureGeneratedClients({
      stateDir,
      lockDir,
      stampFile: join(stateDir, "generate.stamp"),
      schemaInputs: [inputPath],
      outputDirs: [join(rootDir, "generated")],
      now: () => currentTime,
      staleMs: 60_000,
      isAlive: (pid) => pid === replacementOwner.pid,
      readFileImpl: async (path, ...args) => {
        const contents = await readFile(path, ...args);
        if (path === ownerFile) {
          ownerReadCalls += 1;
          if (ownerReadCalls === 1) {
            await writeFile(ownerFile, JSON.stringify(replacementOwner));
          }
        }
        return contents;
      },
      rmImpl: async (path, options) => {
        if (path === lockDir) {
          lockRemovalCalls += 1;
          throw new Error("stale recovery removed the replacement owner");
        }
        return rm(path, options);
      },
      runGenerate: async () => {
        generateCalls += 1;
      },
      sleep: async () => {
        throw waitError;
      },
    }),
    (error) => error === waitError,
  );

  assert.equal(ownerReadCalls, 2);
  assert.equal(lockRemovalCalls, 0);
  assert.equal(generateCalls, 0);
  assert.deepEqual(JSON.parse(await readFile(ownerFile, "utf8")), replacementOwner);
});

test("concurrent stale recoverers serialize removal, publication, and generation", {
  skip: process.platform !== "linux",
}, async () => {
  const rootDir = await mkdtemp(join(tmpdir(), "prisma-generate-serialized-recovery-"));
  const stateDir = join(rootDir, ".state");
  const lockDir = join(stateDir, "generate.lock");
  const mutationLockFile = join(stateDir, "generate.mutation.lock");
  const ownerFile = join(lockDir, "owner.json");
  const stampFile = join(stateDir, "generate.stamp");
  const inputPath = join(rootDir, "schema.prisma");
  const outputDir = join(rootDir, "generated");
  const staleOwner = { pid: 111, acquiredAt: 100_000, token: "stale-owner" };
  await mkdir(lockDir, { recursive: true });
  await writeFile(inputPath, "model Example { id String @id }\n");
  await writeFile(ownerFile, JSON.stringify(staleOwner));

  let advisoryAttempts = 0;
  let notifyBothAdvisoryAttempts;
  const bothAdvisoryAttempts = new Promise((resolve) => {
    notifyBothAdvisoryAttempts = resolve;
  });
  let notifyLockDirAccessed;
  const lockDirAccessed = new Promise((resolve) => {
    notifyLockDirAccessed = resolve;
  });
  let externalAdvisoryHeld = true;
  const lockDirAccessesWhileAdvisoryHeld = [];
  const recordLockDirAccess = (operation) => {
    if (!externalAdvisoryHeld) return;
    lockDirAccessesWhileAdvisoryHeld.push(operation);
    notifyLockDirAccessed();
  };
  let releaseBlockedSleep;
  const blockedSleep = new Promise((resolve) => {
    releaseBlockedSleep = resolve;
  });
  let recoveryRemovalCalls = 0;
  let ownerPublicationCalls = 0;
  let generateCalls = 0;

  const acquireMutationMutex = async (...args) => {
    const mutex = await acquireLockMutationMutex(...args);
    advisoryAttempts += 1;
    if (advisoryAttempts === 2) notifyBothAdvisoryAttempts();
    return mutex;
  };
  const sharedOptions = {
    stateDir,
    lockDir,
    mutationLockFile,
    stampFile,
    schemaInputs: [inputPath],
    outputDirs: [outputDir],
    acquireMutationMutex,
    isAlive: (pid) => pid === process.pid,
    mkdirImpl: async (path, options) => {
      if (path === lockDir) recordLockDirAccess("mkdir");
      return mkdir(path, options);
    },
    readFileImpl: async (path, ...args) => {
      const contents = await readFile(path, ...args);
      if (path === ownerFile) recordLockDirAccess("read-owner");
      return contents;
    },
    statImpl: async (path) => {
      if (path === lockDir) recordLockDirAccess("stat");
      return stat(path);
    },
    writeFileImpl: async (path, contents, ...args) => {
      if (path === ownerFile) recordLockDirAccess("write-owner");
      const result = await writeFile(path, contents, ...args);
      if (path === ownerFile && JSON.parse(contents).token !== staleOwner.token) {
        ownerPublicationCalls += 1;
      }
      return result;
    },
    rmImpl: async (path, options) => {
      if (path === lockDir) recordLockDirAccess("remove");
      if (path === lockDir && ownerPublicationCalls === 0) recoveryRemovalCalls += 1;
      return rm(path, options);
    },
    runGenerate: async () => {
      generateCalls += 1;
      await mkdir(outputDir, { recursive: true });
      await writeFile(join(outputDir, "client.js"), "// generated\n");
    },
    sleep: async () => {
      await blockedSleep;
    },
  };

  let externalHolder;
  const callers = [];
  try {
    externalHolder = await acquireLockMutationMutex(mutationLockFile);
    assert.ok(externalHolder);
    callers.push(ensureGeneratedClients(sharedOptions), ensureGeneratedClients(sharedOptions));

    const preReleaseOutcome = await Promise.race([
      bothAdvisoryAttempts.then(() => "advisory-attempts"),
      lockDirAccessed.then(() => "lock-dir-access"),
    ]);
    assert.equal(preReleaseOutcome, "advisory-attempts");
    assert.deepEqual(lockDirAccessesWhileAdvisoryHeld, []);
    assert.equal(recoveryRemovalCalls, 0);
    assert.equal(ownerPublicationCalls, 0);
    assert.equal(generateCalls, 0);

    externalAdvisoryHeld = false;
    await externalHolder.release();
    externalHolder = null;
    releaseBlockedSleep();
    await Promise.all(callers);

    assert.equal(recoveryRemovalCalls, 1);
    assert.equal(ownerPublicationCalls, 1);
    assert.equal(generateCalls, 1);
  } finally {
    releaseBlockedSleep();
    await externalHolder?.release();
    await Promise.allSettled(callers);
  }
});

test("missing or incomplete metadata uses the lock directory age", async (context) => {
  const cases = [
    { name: "missing fresh", metadata: null, ageMs: 60_000, shouldRecover: false },
    { name: "missing expired", metadata: null, ageMs: 60_001, shouldRecover: true },
    {
      name: "incomplete fresh",
      metadata: { pid: 123, acquiredAt: 1 },
      ageMs: 60_000,
      shouldRecover: false,
    },
    {
      name: "incomplete expired",
      metadata: { pid: 123, acquiredAt: 1 },
      ageMs: 60_001,
      shouldRecover: true,
    },
  ];

  for (const testCase of cases) {
    await context.test(testCase.name, async () => {
      const rootDir = await mkdtemp(join(tmpdir(), "prisma-generate-lock-age-"));
      const stateDir = join(rootDir, ".state");
      const lockDir = join(stateDir, "generate.lock");
      const inputPath = join(rootDir, "schema.prisma");
      const outputDir = join(rootDir, "generated");
      const currentTime = 100_000;
      const waitError = new Error("lock is still initializing");
      await mkdir(lockDir, { recursive: true });
      await writeFile(inputPath, "model Example { id String @id }\n");
      if (testCase.metadata) {
        await writeFile(join(lockDir, "owner.json"), JSON.stringify(testCase.metadata));
      }
      let lockStatCalls = 0;
      let lockRemovalCalls = 0;
      let generateCalls = 0;

      const operation = ensureGeneratedClients({
        stateDir,
        lockDir,
        stampFile: join(stateDir, "generate.stamp"),
        schemaInputs: [inputPath],
        outputDirs: [outputDir],
        now: () => currentTime,
        staleMs: 60_000,
        isAlive: () => false,
        statImpl: async (path) => {
          if (path === lockDir) {
            lockStatCalls += 1;
            return { mtimeMs: currentTime - testCase.ageMs };
          }
          return stat(path);
        },
        rmImpl: async (path, options) => {
          if (path === lockDir) lockRemovalCalls += 1;
          return rm(path, options);
        },
        runGenerate: async () => {
          generateCalls += 1;
          await mkdir(outputDir, { recursive: true });
          await writeFile(join(outputDir, "client.js"), "// generated\n");
        },
        sleep: async () => {
          throw waitError;
        },
      });

      if (testCase.shouldRecover) {
        await operation;
        assert.equal(lockRemovalCalls, 2);
        assert.equal(generateCalls, 1);
      } else {
        await assert.rejects(operation, (error) => error === waitError);
        assert.equal(lockRemovalCalls, 0);
        assert.equal(generateCalls, 0);
      }
      assert.equal(lockStatCalls, testCase.shouldRecover ? 2 : 1);
    });
  }
});

test("a failed owner metadata publication cleans up the acquired lock", async () => {
  const rootDir = await mkdtemp(join(tmpdir(), "prisma-generate-publication-failure-"));
  const stateDir = join(rootDir, ".state");
  const lockDir = join(stateDir, "generate.lock");
  const ownerFile = join(lockDir, "owner.json");
  const inputPath = join(rootDir, "schema.prisma");
  const publicationError = new Error("owner metadata publication failed");
  await writeFile(inputPath, "model Example { id String @id }\n");
  let generateCalls = 0;

  await assert.rejects(
    ensureGeneratedClients({
      stateDir,
      lockDir,
      stampFile: join(stateDir, "generate.stamp"),
      schemaInputs: [inputPath],
      outputDirs: [join(rootDir, "generated")],
      writeFileImpl: async (path, ...args) => {
        if (path === ownerFile) throw publicationError;
        return writeFile(path, ...args);
      },
      runGenerate: async () => {
        generateCalls += 1;
      },
    }),
    (error) => error === publicationError,
  );

  assert.equal(generateCalls, 0);
  await assert.rejects(stat(lockDir), /ENOENT/);
});

test("an owner does not remove a lock whose published token was replaced", async () => {
  const rootDir = await mkdtemp(join(tmpdir(), "prisma-generate-replaced-owner-"));
  const stateDir = join(rootDir, ".state");
  const lockDir = join(stateDir, "generate.lock");
  const ownerFile = join(lockDir, "owner.json");
  const inputPath = join(rootDir, "schema.prisma");
  const outputDir = join(rootDir, "generated");
  const replacementToken = "replacement-owner";
  await writeFile(inputPath, "model Example { id String @id }\n");
  let lockRemovalCalls = 0;

  await ensureGeneratedClients({
    stateDir,
    lockDir,
    stampFile: join(stateDir, "generate.stamp"),
    schemaInputs: [inputPath],
    outputDirs: [outputDir],
    rmImpl: async (path, options) => {
      if (path === lockDir) lockRemovalCalls += 1;
      return rm(path, options);
    },
    runGenerate: async () => {
      const publishedMetadata = JSON.parse(await readFile(ownerFile, "utf8"));
      assert.equal(typeof publishedMetadata.token, "string");
      assert.notEqual(publishedMetadata.token, replacementToken);
      await writeFile(
        ownerFile,
        JSON.stringify({ ...publishedMetadata, token: replacementToken }),
        "utf8",
      );
      await mkdir(outputDir, { recursive: true });
      await writeFile(join(outputDir, "client.js"), "// generated\n");
    },
  });

  assert.equal(lockRemovalCalls, 0);
  assert.equal(JSON.parse(await readFile(ownerFile, "utf8")).token, replacementToken);
});

test("a concurrent caller waits while lock owner metadata is being published", async () => {
  const rootDir = await mkdtemp(join(tmpdir(), "prisma-generate-initializing-"));
  const stateDir = join(rootDir, ".state");
  const lockDir = join(stateDir, "generate.lock");
  const ownerFile = join(lockDir, "owner.json");
  const stampFile = join(stateDir, "generate.stamp");
  const inputPath = join(rootDir, "schema.prisma");
  const outputDir = join(rootDir, "generated");
  await writeFile(inputPath, "model Example { id String @id }\n");

  let notifyOwnerWriteStarted;
  const ownerWriteStarted = new Promise((resolvePromise) => {
    notifyOwnerWriteStarted = resolvePromise;
  });
  let releaseOwnerWrite;
  const ownerWritePaused = new Promise((resolvePromise) => {
    releaseOwnerWrite = resolvePromise;
  });
  let notifySecondObservation;
  const secondObservation = new Promise((resolvePromise) => {
    notifySecondObservation = resolvePromise;
  });
  let releaseSecondSleep;
  const secondSleepPaused = new Promise((resolvePromise) => {
    releaseSecondSleep = resolvePromise;
  });
  let secondLockRemovalCalls = 0;
  let secondGenerateCalls = 0;

  const sharedOptions = {
    stateDir,
    lockDir,
    stampFile,
    schemaInputs: [inputPath],
    outputDirs: [outputDir],
    staleMs: 60_000,
    isAlive: () => true,
  };
  const firstCaller = ensureGeneratedClients({
    ...sharedOptions,
    writeFileImpl: async (path, ...args) => {
      if (path === ownerFile) {
        notifyOwnerWriteStarted();
        await ownerWritePaused;
      }
      return writeFile(path, ...args);
    },
    runGenerate: async () => {
      await mkdir(outputDir, { recursive: true });
      await writeFile(join(outputDir, "client.js"), "// generated\n");
    },
  });
  let secondCaller;

  try {
    await ownerWriteStarted;
    secondCaller = ensureGeneratedClients({
      ...sharedOptions,
      rmImpl: async (path, options) => {
        if (path === lockDir) {
          secondLockRemovalCalls += 1;
          notifySecondObservation("removed-lock");
          throw new Error("concurrent caller tried to remove the initializing lock");
        }
        return rm(path, options);
      },
      runGenerate: async () => {
        secondGenerateCalls += 1;
        notifySecondObservation("ran-generation");
      },
      sleep: async () => {
        notifySecondObservation("waited");
        await secondSleepPaused;
      },
    });

    assert.equal(await secondObservation, "waited");
    assert.equal(secondLockRemovalCalls, 0);
    assert.equal(secondGenerateCalls, 0);

    releaseOwnerWrite();
    await firstCaller;
    releaseSecondSleep();
    await secondCaller;
  } finally {
    releaseOwnerWrite();
    releaseSecondSleep();
    await Promise.allSettled([firstCaller, secondCaller]);
  }
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
