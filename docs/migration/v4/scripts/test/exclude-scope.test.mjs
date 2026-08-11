import assert from "node:assert/strict";
import test from "node:test";

import { parseExcludedDomains, partitionMappingsByPolicy } from "../lib/exclude-scope.mjs";

test("marketing e triage ficam fora da carga por padrão e são classificados como não migrados", () => {
  assert.deepEqual([...parseExcludedDomains(undefined)], ["marketing", "triage"]);

  const partitioned = partitionMappingsByPolicy({
    tableMappings: [
      { sourceTable: "tb_mkt.senhas", domain: "marketing" },
      { sourceTable: "tb_triagem.campos", domain: "triage" },
      { sourceTable: "tb_rh.pontos", domain: "rh" },
    ],
    destinationMappings: [
      { sourceTable: "tb_mkt.senhas" },
      { sourceTable: "tb_triagem.campos" },
      { sourceTable: "tb_rh.pontos" },
    ],
    executionRegistry: new Map([
      ["mkt", { sourceTable: "tb_mkt.senhas" }],
      ["triage", { sourceTable: "tb_triagem.campos" }],
      ["rh", { sourceTable: "tb_rh.pontos" }],
    ]),
    pendingMappings: [
      { sourceTable: "tb_mkt.eventos", domain: "marketing" },
      { sourceTable: "tb_triagem.prioridade", domain: "triage" },
    ],
    excludedDomains: parseExcludedDomains(undefined),
  });

  assert.deepEqual([...partitioned.excludedSources].sort(), [
    ["tb_mkt.eventos", "DOMAIN_EXCLUDED_BY_POLICY"],
    ["tb_mkt.senhas", "DOMAIN_EXCLUDED_BY_POLICY"],
    ["tb_triagem.campos", "DOMAIN_EXCLUDED_BY_POLICY"],
    ["tb_triagem.prioridade", "DOMAIN_EXCLUDED_BY_POLICY"],
  ]);
  assert.deepEqual(partitioned.tableMappings.map(({ sourceTable }) => sourceTable), ["tb_rh.pontos"]);
  assert.deepEqual(partitioned.destinationMappings.map(({ sourceTable }) => sourceTable), ["tb_rh.pontos"]);
  assert.deepEqual([...partitioned.executionRegistry.values()].map(({ sourceTable }) => sourceTable), [
    "tb_rh.pontos",
  ]);
  assert.deepEqual(partitioned.pendingMappings, []);
});

test("uma lista explícita substitui a exclusão padrão", () => {
  assert.deepEqual([...parseExcludedDomains("rh, regularize")], ["rh", "regularize"]);
});
