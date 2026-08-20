import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

test("reports smoke atravessa o gateway sem cabeçalhos de identidade forjados", async () => {
  const smoke = await readFile(path.join(repoRoot, "scripts", "all-services-smoke.mjs"), "utf8");
  const handler = smoke.match(/async reportsCatalog\(op\) \{([\s\S]*?)\n {2}\},/);

  assert.ok(handler);
  assert.doesNotMatch(handler[1], /x-auth-(?:user|organization)-id/);
});
