import assert from "node:assert/strict";
import test from "node:test";

import {
  assertExecutionGroupCoverage,
  assertTransformationCoverage,
  createExecutionRegistry,
  validateExecutionCoverage,
} from "../lib/execution-registry.mjs";
import { CASTELO_ORGANIZATION_ID } from "../lib/mapping-contract.mjs";
import { loadPrismaCatalog } from "../lib/prisma-catalog.mjs";
import { REMAINING_RULES } from "../rules/remaining.mjs";
import {
  buildRemainingRuntimeState,
  REMAINING_EXECUTION_ENTRIES,
  REMAINING_TRANSFORMERS,
} from "../runtime/remaining.mjs";

function countModes(entries) {
  return Object.fromEntries(
    [...Map.groupBy(entries, ({ mode }) => mode)].map(([mode, items]) => [mode, items.length]),
  );
}

test("runtime remaining cobre todas as origens e passos", async () => {
  assert.equal(assertExecutionGroupCoverage(REMAINING_RULES, REMAINING_EXECUTION_ENTRIES), true);
  assert.equal(new Set(REMAINING_EXECUTION_ENTRIES.map((entry) => entry.sourceTable)).size, 14);
  assert.equal(REMAINING_EXECUTION_ENTRIES.length, 14);
  assert.equal(
    assertTransformationCoverage(
      REMAINING_RULES,
      REMAINING_TRANSFORMERS,
      REMAINING_EXECUTION_ENTRIES,
    ),
    true,
  );
  assert.deepEqual(countModes(REMAINING_RULES.flatMap(({ destinations }) => destinations)), {
    insert: 13,
    merge: 1,
  });

  const prismaCatalog = await loadPrismaCatalog("infra/prisma/schema.prisma");
  assert.equal(
    validateExecutionCoverage({
      ruleRegistry: new Map(REMAINING_RULES.map((rule) => [rule.sourceTable, rule])),
      executionRegistry: createExecutionRegistry([REMAINING_EXECUTION_ENTRIES]),
      prismaCatalog,
    }),
    true,
  );
});

test("referências obrigatórias não resolvidas são colocadas em quarentena", () => {
  const state = buildRemainingRuntimeState({
    organizationId: CASTELO_ORGANIZATION_ID,
    users: [],
    clients: [],
  });
  const entry = REMAINING_EXECUTION_ENTRIES.find(
    ({ sourceTable }) => sourceTable === "tb_workspace.solicitacoes",
  );
  assert.ok(entry, "entrada de solicitações Workspace ausente");

  const [decision] = entry.emitRows(
    { id: 1, titulo: "Solicitação", descricao: "Descrição", usuario_id: 9, cliente_id: 7 },
    state,
  );
  assert.equal(decision.status, "quarantine");
});

test("estado remaining preserva validade estrutural ao receber o contexto do engine", () => {
  const state = buildRemainingRuntimeState({
    organizationId: CASTELO_ORGANIZATION_ID,
    users: [],
    clients: [],
  });
  const engineContext = Object.freeze({
    ...state,
    lookupSource: () => [],
    lookupDestination: () => [],
  });
  const entry = REMAINING_EXECUTION_ENTRIES.find(
    ({ sourceTable }) => sourceTable === "tb_workspace.solicitacoes",
  );
  const [emission] = entry.emitRows(
    { id: 1, titulo: "Solicitação", descricao: "Descrição", usuario_id: 9, cliente_id: 7 },
    engineContext,
  );

  assert.notEqual(emission.reasonCode, "REMAINING_RUNTIME_STATE_INVALID");
});
