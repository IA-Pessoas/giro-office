import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { scanBlob, scanRepository } from "./supply-chain-integrity.mjs";

const decode = (value) => Buffer.from(value, "base64").toString("utf8");

test("scans a detached executable-config blob without returning its source", () => {
  const report = scanBlob(
    "postcss.config.js",
    Buffer.from("For only test\nglobal.o='abc'"),
  );

  assert.deepEqual(report.map(({ ruleId }) => ruleId), [
    "ioc.incident-marker",
    "ioc.global-assignment",
  ]);
  assert.doesNotMatch(JSON.stringify(report), /For only test|global\.o=/u);
});

async function withFixture(files, callback) {
  const root = await mkdtemp(path.join(os.tmpdir(), "giro-supply-chain-"));
  try {
    for (const [relativePath, content] of Object.entries(files)) {
      const target = path.join(root, relativePath);
      await mkdir(path.dirname(target), { recursive: true });
      await writeFile(target, content);
    }
    return await callback(root);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

test("detects incident IOC families without returning source content", async () => {
  await withFixture(
    {
      "postcss.config.js": decode("Rm9yIG9ubHkgdGVzdApnbG9iYWwubz0nYWJjJzsgZ2xvYmFsLmk9J2RlZic7"),
      "vite.config.ts": decode("Z2xvYmFsWydfViddPSdhYmMnOw=="),
    },
    async (root) => {
      const report = await scanRepository(root);

      assert.equal(report.ok, false);
      assert.deepEqual(
        report.findings.map(({ ruleId, path: findingPath }) => ({ ruleId, path: findingPath })),
        [
          { ruleId: "ioc.incident-marker", path: "postcss.config.js" },
          { ruleId: "ioc.global-assignment", path: "postcss.config.js" },
          { ruleId: "ioc.bracketed-global-assignment", path: "vite.config.ts" },
        ],
      );
      assert.doesNotMatch(JSON.stringify(report), /For only test|global\.o=|global\.i=/u);
    },
  );
});

test("detects executable config lines and dangerous editor commands", async () => {
  const dangerousCommand = decode(
    "bm9kZSAtZSBCdWZmZXIuZnJvbSgnWTI5d2MyOXNaUzVzYjJjb01Taz0nLCdiYXNlNjQnKQ==",
  );
  await withFixture(
    {
      "next.config.mjs": `const generated = "${"x".repeat(2_001)}";\n`,
      ".vscode/tasks.json": JSON.stringify({
        version: "2.0.0",
        tasks: [{ runOn: "folderOpen", command: dangerousCommand }],
      }),
      "public/minified.js": "x".repeat(2_500),
    },
    async (root) => {
      const report = await scanRepository(root);
      const ruleIds = report.findings.map(({ ruleId }) => ruleId);

      assert.equal(report.ok, false);
      assert.ok(ruleIds.includes("config.long-line"));
      assert.ok(ruleIds.includes("config.folder-open"));
      assert.ok(ruleIds.includes("command.encoded-node-eval"));
      assert.ok(
        !report.findings.some(({ path: findingPath }) => findingPath === "public/minified.js"),
      );
    },
  );
});

test("validates font magic bytes and rejects masqueraded fonts", async () => {
  await withFixture(
    {
      "public/valid.woff": Buffer.from([0x77, 0x4f, 0x46, 0x46, 0, 0, 0, 0]),
      "public/valid.woff2": Buffer.from([0x77, 0x4f, 0x46, 0x32, 0, 0, 0, 0]),
      "public/fake.woff2": Buffer.from("not a font"),
    },
    async (root) => {
      const report = await scanRepository(root);

      assert.deepEqual(
        report.findings.map(({ ruleId, path: findingPath }) => ({ ruleId, path: findingPath })),
        [{ ruleId: "font.invalid-magic", path: "public/fake.woff2" }],
      );
    },
  );
});

test("fails closed for malformed and expired allowlist entries", async () => {
  await withFixture(
    { "eslint.config.mjs": decode("Y29uc3QgeD0nZ2xvYmFsLm89Jzs="), "allowlist.json": "[]" },
    async (root) => {
      const malformed = await scanRepository(root, {
        allowlist: [{ path: "eslint.config.mjs", ruleId: "ioc.global-assignment" }],
      });
      assert.equal(malformed.ok, false);
      assert.ok(malformed.findings.some(({ ruleId }) => ruleId === "allowlist.invalid-entry"));

      const expired = await scanRepository(root, {
        allowlist: [
          {
            path: "eslint.config.mjs",
            ruleId: "ioc.global-assignment",
            owner: "security",
            reason: "approved fixture",
            issue: "https://github.com/IA-Pessoas/giro-office/issues/771",
            expires: "2020-01-01",
          },
        ],
      });
      assert.equal(expired.ok, false);
      assert.ok(expired.findings.some(({ ruleId }) => ruleId === "allowlist.invalid-entry"));
    },
  );
});
