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
    assert.equal(rule.destinations.length, 1);
    assert.equal(rule.destinations[0]?.stepId, "v2-insert");
    assert.equal(rule.destinations[0]?.mode, "insert");
    assert.match(rule.ruleOrigin, /draft.*Task 3/i);
    assert.ok(rule.evidence.legacy.every((item) => /Task 3/i.test(item)));
    assert.ok(rule.evidence.current.every((item) => /Task 3/i.test(item)));
    for (const field of [
      "destinationTable",
      "identity",
      "columns",
      "classifyRow",
      "dependencies",
    ]) {
      assert.equal(field in rule, false, `${rule.sourceTable}.${field}`);
    }
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
    assert.ok(
      Object.keys(emissions[0]).every((key) =>
        ["stepId", "status", "field", "reasonCode"].includes(key),
      ),
      rule.sourceTable,
    );
    assert.equal(emissions[0].stepId, "v2-insert");
    assert.ok(["prepared", "quarantine"].includes(emissions[0].status), rule.sourceTable);
    assert.doesNotMatch(JSON.stringify(emissions), /payload|value/i);
  }
});
