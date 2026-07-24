import assert from "node:assert/strict";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { checkPortAvailable, runPreflight, validateRegistryParity } from "./dev-preflight.mjs";

test("registry parity rejects an unregistered workspace service", () => {
  assert.throws(
    () =>
      validateRegistryParity({
        workspaceText:
          'packages:\n  - "app"\n  - "services/gateway"\n  - "services/missing-service"\n',
        registry: [{ packagePath: "services/gateway" }],
      }),
    /missing-service/,
  );
});

test("registry parity accepts the exact workspace service set", () => {
  assert.doesNotThrow(() =>
    validateRegistryParity({
      workspaceText:
        'packages:\n  - "app"\n  - "shared"\n  - "services/gateway"\n  - "services/user-service"\n',
      registry: [{ packagePath: "services/gateway" }, { packagePath: "services/user-service" }],
    }),
  );
});

test("checkPortAvailable distinguishes a free port from a listening port", async (t) => {
  const { createServer } = await import("node:net");
  const server = createServer();
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const port = server.address().port;

  assert.equal(await checkPortAvailable({ host: "127.0.0.1", port, timeoutMs: 100 }), false);
  await new Promise((resolve) => server.close(resolve));
  assert.equal(await checkPortAvailable({ host: "127.0.0.1", port, timeoutMs: 100 }), true);
});

test("preflight validates target paths and reports constrained memory", async () => {
  const rootDir = await mkdtemp(join(tmpdir(), "dev-preflight-"));
  const packageDir = join(rootDir, "services", "gateway");
  const binPath = join(rootDir, "tsx.js");
  await mkdir(packageDir, { recursive: true });
  await writeFile(binPath, "// fixture\n");

  const result = await runPreflight({
    rootDir,
    workspaceText: 'packages:\n  - "services/gateway"\n',
    registry: [{ packagePath: "services/gateway" }],
    targets: [
      {
        name: "gateway",
        packageDir,
        command: process.execPath,
        args: [binPath],
        port: 3010,
      },
    ],
    totalMemoryBytes: 7 * 1024 ** 3,
    checkPortAvailableImpl: async () => true,
  });

  assert.match(result.warnings.join("\n"), /memory/i);
});

test("preflight rejects occupied ports and missing target files", async () => {
  await assert.rejects(
    runPreflight({
      rootDir: "/repo",
      workspaceText: 'packages:\n  - "services/gateway"\n',
      registry: [{ packagePath: "services/gateway" }],
      targets: [
        {
          name: "gateway",
          packageDir: "/repo/services/gateway",
          command: process.execPath,
          args: ["/repo/tsx.js"],
          port: 3010,
        },
      ],
      totalMemoryBytes: 32 * 1024 ** 3,
      accessImpl: async () => {},
      checkPortAvailableImpl: async () => false,
    }),
    /3010.*already in use/,
  );

  await assert.rejects(
    runPreflight({
      rootDir: "/repo",
      workspaceText: 'packages:\n  - "services/gateway"\n',
      registry: [{ packagePath: "services/gateway" }],
      targets: [
        {
          name: "gateway",
          packageDir: "/repo/services/gateway",
          command: process.execPath,
          args: ["/repo/tsx.js"],
        },
      ],
      totalMemoryBytes: 32 * 1024 ** 3,
      accessImpl: async (path) => {
        if (path.includes("gateway")) throw new Error("ENOENT");
      },
    }),
    /gateway.*missing/,
  );
});
