import assert from "node:assert/strict";
import { access } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  createDevTargets,
  readPositiveInteger,
  resolvePackageBin,
  selectDevProfile,
} from "./dev-workspace.config.mjs";

const rootDir = dirname(dirname(fileURLToPath(import.meta.url)));

test("selectDevProfile chooses low for constrained hosts", () => {
  assert.deepEqual(selectDevProfile({ env: {}, cpuCount: 4, totalMemoryBytes: 8 * 1024 ** 3 }), {
    name: "low",
    batchSize: 1,
    batchDelayMs: 2500,
  });
});

test("selectDevProfile chooses normal and fast from host capacity", () => {
  assert.equal(
    selectDevProfile({ env: {}, cpuCount: 8, totalMemoryBytes: 16 * 1024 ** 3 }).name,
    "normal",
  );
  assert.equal(
    selectDevProfile({ env: {}, cpuCount: 16, totalMemoryBytes: 32 * 1024 ** 3 }).name,
    "fast",
  );
});

test("explicit profile and numeric overrides win over hardware detection", () => {
  assert.deepEqual(
    selectDevProfile({
      env: {
        DEV_PROFILE: "normal",
        DEV_START_BATCH_SIZE: "3",
        DEV_START_DELAY_MS: "750",
      },
      cpuCount: 2,
      totalMemoryBytes: 4 * 1024 ** 3,
    }),
    { name: "normal", batchSize: 3, batchDelayMs: 750 },
  );
});

test("profile and numeric configuration reject invalid values", () => {
  assert.throws(() => readPositiveInteger("DEV_START_BATCH_SIZE", "4x"), /positive integer/);
  assert.throws(() => readPositiveInteger("DEV_START_DELAY_MS", "0"), /positive integer/);
  assert.throws(
    () =>
      selectDevProfile({
        env: { DEV_PROFILE: "turbo" },
        cpuCount: 8,
        totalMemoryBytes: 16 * 1024 ** 3,
      }),
    /DEV_PROFILE/,
  );
});

test("createDevTargets orders shared, domain services, gateway, then app", () => {
  const targets = createDevTargets({
    rootDir: "/repo",
    registry: [
      {
        name: "gateway",
        packagePath: "services/gateway",
        defaultUrl: "http://localhost:3010",
      },
      {
        name: "user-service",
        packagePath: "services/user-service",
        defaultUrl: "http://localhost:3030",
      },
    ],
    resolveBin: ({ packageName }) => `/bin/${packageName}`,
  });

  assert.deepEqual(
    targets.map((target) => target.name),
    ["shared", "user-service", "gateway", "app"],
  );
  assert.ok(targets.every((target) => target.command === process.execPath));
  assert.deepEqual(targets.find((target) => target.name === "user-service")?.args.slice(1), [
    "watch",
    "--exclude",
    "../../shared/dist/**",
    "src/server.ts",
  ]);
  assert.deepEqual(targets.find((target) => target.name === "user-service")?.readiness, {
    type: "http",
    url: "http://localhost:3030/health",
  });
  assert.deepEqual(targets.find((target) => target.name === "app")?.readiness, {
    type: "tcp",
    host: "127.0.0.1",
    port: 3000,
  });
});

test("resolvePackageBin resolves package-local Next, TypeScript, and tsx binaries", async () => {
  const bins = [
    resolvePackageBin({
      packageDir: resolve(rootDir, "app"),
      packageName: "next",
      binName: "next",
    }),
    resolvePackageBin({
      packageDir: resolve(rootDir, "shared"),
      packageName: "typescript",
      binName: "tsc",
    }),
    resolvePackageBin({
      packageDir: resolve(rootDir, "services/gateway"),
      packageName: "tsx",
      binName: "tsx",
    }),
  ];

  await Promise.all(bins.map((bin) => access(bin)));
  assert.ok(bins.every((bin) => !bin.includes("node_modules/.bin")));
});
