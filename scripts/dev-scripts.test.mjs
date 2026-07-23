import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { serviceRegistry } from "./service-registry.mjs";

const rootDir = dirname(dirname(fileURLToPath(import.meta.url)));

function readJson(relativePath) {
  return JSON.parse(readFileSync(join(rootDir, relativePath), "utf8"));
}

test("root dev contains no reset, Turbo, or Docker", () => {
  const root = readJson("package.json");

  assert.equal(
    root.scripts.dev,
    "node scripts/prisma-generate.mjs && node scripts/dev-workspace.mjs",
  );
  assert.doesNotMatch(root.scripts.dev, /docker|turbo|dev-reset/i);
  assert.equal(root.scripts["dev:full"], undefined);
  assert.match(root.scripts["dev:test"], /dev-workspace\.test\.mjs/);
  assert.match(root.scripts["dev:test"], /prisma-generate\.test\.mjs/);
});

test("development packages preserve dev and omit dev:workspace", () => {
  const expectedDevScripts = new Map([
    ["app/package.json", "next dev --webpack"],
    ["shared/package.json", "tsc --watch --preserveWatchOutput"],
    ...serviceRegistry.map((service) => [
      `${service.packagePath}/package.json`,
      "tsx watch src/server.ts",
    ]),
  ]);

  for (const [manifestPath, expectedDev] of expectedDevScripts) {
    const manifest = readJson(manifestPath);
    assert.equal(manifest.scripts.dev, expectedDev, manifestPath);
    assert.equal(manifest.scripts["dev:workspace"], undefined, manifestPath);
  }
});

test("Turbo omits the unused workspace task", () => {
  assert.equal(readJson("turbo.json").tasks["dev:workspace"], undefined);
});
