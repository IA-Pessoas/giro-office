import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

async function read(relativePath) {
  return readFile(path.join(repositoryRoot, relativePath), "utf8");
}

test("workflow do gate usa somente leitura e relatório sanitizado", async () => {
  const workflow = await read(".github/workflows/supply-chain-integrity.yml");

  assert.match(workflow, /contents: read/u);
  assert.match(workflow, /persist-credentials: false/u);
  assert.match(workflow, /node scripts\/supply-chain-integrity\.mjs/u);
  assert.match(workflow, /supply-chain-integrity-report\.json/u);
  assert.doesNotMatch(workflow, /secrets\./u);
});

test("test runner raiz inclui o scanner compartilhado", async () => {
  const packageJson = JSON.parse(await read("package.json"));

  assert.match(packageJson.scripts.test, /supply-chain-integrity\.test\.mjs/u);
  assert.equal(
    packageJson.scripts["security:supply-chain"],
    "node scripts/supply-chain-integrity.mjs",
  );
});
