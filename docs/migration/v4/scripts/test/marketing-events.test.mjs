import assert from "node:assert/strict";
import test from "node:test";
import { validateMappingRule } from "../lib/mapping-contract.mjs";
import { loadPrismaCatalog } from "../lib/prisma-catalog.mjs";
import {
  buildMarketingEventContexts,
  projectRemainingRow,
  REMAINING_RULES,
} from "../rules/remaining.mjs";
import { buildRemainingRuntimeState } from "../runtime/remaining.mjs";

const sourceTable = "tb_mkt.eventos";

test("eventos com campos válidos recebem vínculo do tenant e preservam a identidade de origem", () => {
  const row = {
    id: 31,
    nome: "Feira Anual",
    logo: "feira.png",
    status: "Em andamento",
    prioridade: "Alta",
    objetivo: "Apresentar produtos",
    publico: "Clientes",
  };
  const [context] = buildMarketingEventContexts({ rows: [row] });
  const projection = projectRemainingRow({ sourceTable, row, context });

  assert.equal(projection.decision.status, "prepared");
  assert.equal(projection.payload.legacy_id, 31);
  assert.equal(projection.payload.organization_id, "e8048d1c-0830-45d7-84de-68e20abd685b");
  assert.equal(projection.payload.name, "Feira Anual");
  assert.equal(projection.payload.name_key, "feira anual");
  assert.equal(projection.payload.logo, "feira.png");
  assert.equal(projection.payload.status, "Em andamento");
  assert.equal(projection.payload.priority, "Alta");
  assert.equal(projection.payload.objective, "Apresentar produtos");
  assert.equal(projection.payload.audience, "Clientes");
  assert.match(
    REMAINING_RULES.find(({ sourceTable: table }) => table === sourceTable).ruleOrigin,
    /tb_mkt\.eventos/,
  );
});

test("nomes ambíguos por capitalização ou acento ficam em quarentena com origem", () => {
  const rows = [
    { id: 41, nome: "Café 2026", logo: "", status: "Novo", prioridade: "Baixa" },
    { id: 42, nome: "CAFE 2026", logo: "", status: "Novo", prioridade: "Baixa" },
  ];
  const contexts = buildMarketingEventContexts({ rows });
  const results = rows.map((row, index) =>
    projectRemainingRow({ sourceTable, row, context: contexts[index] }),
  );

  assert.deepEqual(
    results.map(({ decision }) => decision.status),
    ["quarantine", "quarantine"],
  );
  assert.deepEqual(
    results.map(({ decision }) => decision.reasonCode),
    ["MKT_EVENT_NAME_AMBIGUOUS", "MKT_EVENT_NAME_AMBIGUOUS"],
  );
  assert.ok(results.every(({ decision }) => decision.destinationTable === "mtk.events"));
  assert.ok(results.every(({ decision }) => decision.identityRef.startsWith(`${sourceTable}:`)));
});

test("registros sem identidade ou prioridade legadas válidas ficam em quarentena", () => {
  const rows = [
    { id: 0, nome: "Sem identidade", status: "Novo", prioridade: "Alta" },
    { id: 52, nome: "Prioridade inválida", status: "Novo", prioridade: "Urgente" },
  ];
  const contexts = buildMarketingEventContexts({ rows });
  const results = rows.map((row, index) =>
    projectRemainingRow({ sourceTable, row, context: contexts[index] }),
  );

  assert.deepEqual(
    results.map(({ decision }) => decision.reasonCode),
    ["MKT_EVENT_ID_INVALID", "MKT_EVENT_PRIORITY_INVALID"],
  );
  assert.ok(results.every(({ payload }) => payload === null));
});

test("regra de eventos valida contra o schema e o runtime importa ou preserva ambiguidade", async () => {
  const catalog = await loadPrismaCatalog("infra/prisma/schema.prisma");
  const mappingRule = REMAINING_RULES.find(({ sourceTable: table }) => table === sourceTable);
  assert.equal(validateMappingRule(mappingRule, catalog), true);

  const validRows = [{ id: 60, nome: "Evento importado", status: "Novo", prioridade: "Média" }];
  const validRuntime = buildRemainingRuntimeState({
    sourceRows: { [sourceTable]: validRows },
  });
  const validEmissions = [];
  for await (const emission of validRuntime.iterateRows(sourceTable, validRows)) {
    validEmissions.push(emission);
  }
  const [validEmission] = validEmissions;
  assert.equal(validEmission.status, "prepared");
  assert.equal(validEmission.payload.organization_id, "e8048d1c-0830-45d7-84de-68e20abd685b");
  assert.equal(validEmission.payload.legacy_id, 60);

  const rows = [
    { id: 61, nome: "Encontro Anual", status: "Novo", prioridade: "Média" },
    { id: 62, nome: "Encontro Anual", status: "Novo", prioridade: "Média" },
  ];
  const runtime = buildRemainingRuntimeState({ sourceRows: { [sourceTable]: rows } });
  const emissions = [];
  for await (const emission of runtime.iterateRows(sourceTable, rows)) emissions.push(emission);

  assert.deepEqual(
    emissions.map(({ status }) => status),
    ["quarantine", "quarantine"],
  );
  assert.ok(emissions.every(({ sourceTable: origin }) => origin === sourceTable));
  assert.ok(emissions.every(({ reasonCode }) => reasonCode === "MKT_EVENT_NAME_AMBIGUOUS"));
});
