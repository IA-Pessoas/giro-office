import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { validateMappingRule } from "../lib/mapping-contract.mjs";
import { loadPrismaCatalog } from "../lib/prisma-catalog.mjs";
import { buildRuleRegistry, v2Rules } from "../rules/index.mjs";

function parseConfirmedDestinations(csv) {
  return csv
    .trim()
    .split("\n")
    .slice(1)
    .map((line) => {
      const match = line.match(/^"([^"]+)","([^"]+)"$/);
      assert.ok(match, `linha CSV inválida: ${line}`);
      return [match[1], match[2]];
    });
}

test("registro V2 porta mecanicamente as 16 origens em um passo insert draft", async () => {
  const csv = await readFile("docs/migration/v2/confirmed-table-destinations.csv", "utf8");
  const expectedDestinations = parseConfirmedDestinations(csv);
  const registry = buildRuleRegistry();

  assert.equal(registry.size, 16);
  assert.deepEqual(
    [...registry.values()].map(({ sourceTable, destinations }) => [
      sourceTable,
      destinations[0]?.destinationTable,
    ]),
    expectedDestinations,
  );

  for (const rule of registry.values()) {
    assert.equal(rule.status, "confirmed");
    assert.equal(rule.cardinality, "1:1");
    assert.equal(Array.isArray(rule.dependencies), true);
    assert.equal(rule.destinations.length, 1);
    assert.equal(rule.destinations[0]?.stepId, "v2-insert");
    assert.equal(rule.destinations[0]?.mode, "insert");
    assert.equal(rule.destinations[0]?.identity.kind, "generate");
    assert.deepEqual(rule.destinations[0]?.constants, {});
    assert.deepEqual(rule.destinations[0]?.defaults, {});
    assert.deepEqual(rule.destinations[0]?.precedence, ["source"]);
    assert.match(rule.ruleOrigin, /draft.*Task 3/i);
    assert.ok(rule.evidence.legacy.every((item) => /Task 3/i.test(item)));
    assert.ok(rule.evidence.current.every((item) => /Task 3/i.test(item)));
    for (const field of ["destinationTable", "identity", "columns", "classifyRow", "reason"]) {
      assert.equal(field in rule, false, `${rule.sourceTable}.${field}`);
    }
    assert.equal(typeof rule.classifySourceRow, "function");
  }
});

test("todas as regras V2 portadas continuam estruturalmente válidas contra o catálogo Prisma", async () => {
  const catalog = await loadPrismaCatalog("infra/prisma/schema.prisma");

  for (const rule of v2Rules) {
    assert.equal(validateMappingRule(rule, catalog), true, rule.sourceTable);
  }
});

test("emitRows V2 retorna apenas decisões sanitizadas por passo", () => {
  for (const rule of v2Rules) {
    const emissions = rule.emitRows(Object.freeze({}), Object.freeze({}));

    assert.equal(Array.isArray(emissions), true, rule.sourceTable);
    assert.equal(emissions.length, 1, rule.sourceTable);
    assert.deepEqual(Object.keys(emissions[0]).sort(), [
      "destinationTable",
      "field",
      "identityRef",
      "reasonCode",
      "status",
      "stepId",
    ]);
    assert.equal(emissions[0].stepId, "v2-insert");
    assert.equal(emissions[0].destinationTable, rule.destinations[0]?.destinationTable);
    assert.equal(typeof emissions[0].identityRef, "string");
    assert.ok(["prepared", "quarantine"].includes(emissions[0].status), rule.sourceTable);
    assert.doesNotMatch(JSON.stringify(emissions), /payload|value/i);
  }
});
