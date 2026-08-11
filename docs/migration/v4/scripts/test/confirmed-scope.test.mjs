import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

import { buildConfirmedScope, validateConfirmedScope } from "../lib/confirmed-scope.mjs";

const PACKAGE_DIRECTORY = path.resolve(import.meta.dirname, "../..");
const [inventory, confirmed, destinations, pending] = await Promise.all([
  readJson("reports/source-inventory.json"),
  readJson("mapping/tables.json"),
  readJson("mapping/destinations.json"),
  readJson("pending-mapping/tables.json"),
]);
const packageFixture = { inventory, tableMappings: confirmed, destinationMappings: destinations };
const pendingNames = new Set(pending.map(({ sourceTable }) => sourceTable));
const scopeFixture = buildConfirmedScope({
  inventory,
  tableMappings: confirmed,
  destinationMappings: destinations,
  sourceDigest: inventory.sourceDigest,
});

test("escopo confirmado fixa 103 origens, 629349 linhas e 133 passos", () => {
  const scope = buildConfirmedScope({
    inventory,
    tableMappings: confirmed,
    destinationMappings: destinations,
    sourceDigest: inventory.sourceDigest,
  });

  assert.deepEqual(scope.counts, { origins: 103, sourceRows: 629349, steps: 133 });
  assert.equal(
    scope.sources.some(({ sourceTable }) => pendingNames.has(sourceTable)),
    false,
  );
  assert.match(scope.scopeDigest, /^[a-f0-9]{64}$/);
});

test("qualquer mudança de membro, hash ou contagem invalida o escopo", () => {
  const changed = structuredClone(scopeFixture);
  changed.sources[0].rowCount += 1;

  assert.throws(() => validateConfirmedScope(changed, packageFixture), /CONFIRMED_SCOPE_DRIFT/);
});

test("escopo canônico serializa somente vínculos auditáveis e rejeita inventário ou passos forjados", () => {
  assert.deepEqual(Object.keys(scopeFixture.sources[0]).sort(), [
    "contractDigest",
    "dependencies",
    "dumpHash",
    "rowCount",
    "sourceTable",
  ]);
  assert.deepEqual(Object.keys(scopeFixture.steps[0]).sort(), [
    "contractDigest",
    "dependencies",
    "destinationTable",
    "sourceTable",
    "stepId",
  ]);
  assert.equal(Object.isFrozen(scopeFixture), true);
  assert.equal(Object.isFrozen(scopeFixture.sources), true);
  assert.equal(Object.isFrozen(scopeFixture.steps), true);

  const forgedInventory = structuredClone(inventory);
  forgedInventory.tables[0].sha256 = "0".repeat(64);
  assert.throws(
    () =>
      buildConfirmedScope({
        inventory: forgedInventory,
        tableMappings: confirmed,
        destinationMappings: destinations,
        sourceDigest: forgedInventory.sourceDigest,
      }),
    /CONFIRMED_SCOPE_INVALID/,
  );

  const forgedDestinations = structuredClone(destinations);
  forgedDestinations[0].contractDigest = "0".repeat(64);
  assert.throws(
    () =>
      buildConfirmedScope({
        inventory,
        tableMappings: confirmed,
        destinationMappings: forgedDestinations,
        sourceDigest: inventory.sourceDigest,
      }),
    /CONFIRMED_SCOPE_INVALID/,
  );
});

test("mudança no contrato de uma origem confirmada invalida o escopo", () => {
  const forgedMappings = structuredClone(confirmed);
  forgedMappings[0].contractDigest = "0".repeat(64);

  assert.throws(
    () =>
      validateConfirmedScope(scopeFixture, { ...packageFixture, tableMappings: forgedMappings }),
    /CONFIRMED_SCOPE_DRIFT/,
  );
});

test("escopo rejeita digests de passos que não correspondem à origem confirmada", () => {
  const forgedMappings = structuredClone(confirmed);
  const mapping = forgedMappings.find(({ destinationStepCount }) => destinationStepCount > 1);
  mapping.destinationContractDigests.push("0".repeat(64));

  assert.throws(
    () =>
      buildConfirmedScope({
        inventory,
        tableMappings: forgedMappings,
        destinationMappings: destinations,
        sourceDigest: inventory.sourceDigest,
      }),
    /CONFIRMED_SCOPE_INVALID/,
  );
});

test("escopo preserva dependências pendentes de passos confirmados", () => {
  const stockStep = scopeFixture.steps.find(({ stepId }) => stepId === "cbs-stock-insert");

  assert.deepEqual(
    stockStep.dependencies.filter((dependency) => pendingNames.has(dependency)),
    ["tb_cbs.estoque_andares", "tb_cbs.estoque_categorias_itens", "tb_cbs.estoque_itens"],
  );
});

async function readJson(relativePath) {
  return JSON.parse(await readFile(path.join(PACKAGE_DIRECTORY, relativePath), "utf8"));
}
