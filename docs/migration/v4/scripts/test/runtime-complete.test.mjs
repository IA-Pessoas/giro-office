import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { buildSourceInventory } from "../lib/source-inventory.mjs";
import { iterateSqlRows } from "../lib/sql-dump-parser.mjs";
import {
  ALL_EXECUTION_ENTRIES,
  ALL_MAPPING_RULES,
  ALL_TRANSFORMERS,
  createCompleteExecutionRegistry,
  createCompleteRuntimeStateByStep,
} from "../runtime/index.mjs";

const LEGACY_DUMP_ROOT = "/home/bruno/Documents/03.08.2026";
const pendingMappings = JSON.parse(
  await readFile(new URL("../../pending-mapping/tables.json", import.meta.url), "utf8"),
);

async function loadRows(sourceTable) {
  const rows = [];
  for await (const row of iterateSqlRows(`${LEGACY_DUMP_ROOT}/${sourceTable}.sql`)) rows.push(row);
  return rows;
}

function completeStepDecision(runtimeEntry, row, binding) {
  const runtimeState = binding?.runtimeState ?? binding;
  const runtimeClassification = binding?.classifyExecutionRow?.(row, runtimeState);
  if (runtimeClassification?.status !== undefined && runtimeClassification.status !== "prepared") {
    return runtimeClassification;
  }
  return runtimeEntry
    .emitRows(row, runtimeState)
    .find(({ stepId }) => stepId === runtimeEntry.stepId);
}

function countModes(destinations) {
  return Object.fromEntries(
    [...Map.groupBy(destinations, ({ mode }) => mode)]
      .map(([mode, entries]) => [mode, entries.length])
      .sort(([left], [right]) => left.localeCompare(right, "en-US")),
  );
}

test("complete registry maps the frozen scope once", () => {
  const registry = createCompleteExecutionRegistry();

  assert.equal(new Set([...registry.values()].map((entry) => entry.sourceTable)).size, 103);
  assert.equal(registry.size, 133);
  assert.equal(ALL_MAPPING_RULES.length, 103);
  assert.equal(ALL_EXECUTION_ENTRIES.length, 133);
  assert.deepEqual(countModes(ALL_MAPPING_RULES.flatMap(({ destinations }) => destinations)), {
    aggregate: 4,
    derived: 14,
    insert: 90,
    lookup: 4,
    merge: 21,
  });
  assert.deepEqual(Object.keys(ALL_TRANSFORMERS).sort(), [
    "adminBusiness",
    "integracaoRegularize",
    "remaining",
    "rhPessoal",
    "specialized",
    "v2",
  ]);
  assert.equal(createCompleteRuntimeStateByStep().size, 133);
});

test("composição completa encaminha capacidades reais para o estado de cada domínio", () => {
  const readUserJson = () => ({ state: "empty", value: [] });
  const states = createCompleteRuntimeStateByStep({
    rhPessoal: {
      resolveCollaboratorUser: () => ({ id: "user-7" }),
      readUserJson,
    },
    specialized: {
      candidates: [
        {
          id: "candidate-1",
          legacyId: 1,
          organization_id: "e8048d1c-0830-45d7-84de-68e20abd685b",
        },
      ],
    },
  });
  const rhState = states.get("tb_rh.alergias\0user-allergies-merge");

  assert.deepEqual(rhState.readUserJson("user-7", "allergies"), {
    state: "empty",
    value: [],
  });
});

test("composição completa usa o lookup V2 real para integrante de grupo e falha fechada sem ele", async () => {
  const [regularizeClients, integrationClients, groups] = await Promise.all([
    loadRows("tb_regularize.clientes"),
    loadRows("tb_integracao.clientes"),
    loadRows("tb_regularize.grupos"),
  ]);
  const runtimeEntry = ALL_EXECUTION_ENTRIES.find(
    ({ sourceTable }) => sourceTable === "tb_regularize.grupos_integrantes",
  );
  assert.ok(runtimeEntry);
  const row = { id: "20", codigo_cliente: "507", grupo_id: "7" };
  const key = "tb_regularize.grupos_integrantes\0regularize-group-member-insert";
  const capableStates = createCompleteRuntimeStateByStep({
    integracaoRegularize: {
      regularizeClients,
      integrationClients,
      sourceRows: { "tb_regularize.grupos": groups },
    },
  });

  assert.equal(completeStepDecision(runtimeEntry, row, capableStates.get(key)).status, "prepared");
  assert.deepEqual(
    completeStepDecision(runtimeEntry, row, createCompleteRuntimeStateByStep().get(key)),
    {
      status: "quarantine",
      field: "codigo_cliente",
      reasonCode: "GROUP_MEMBER_CLIENT_LOOKUP_NOT_EXECUTED",
    },
  );
});

test("frozen backup inventory has no unclassified source", async () => {
  const inventory = await buildSourceInventory({
    sourceDir: LEGACY_DUMP_ROOT,
    expectedTables: 312,
  });
  assert.equal(
    inventory.tables.reduce((total, table) => total + table.rowCount, 0),
    1_374_880,
  );
  const known = new Set([
    ...[...createCompleteExecutionRegistry().values()].map(({ sourceTable }) => sourceTable),
    ...pendingMappings.map(({ sourceTable }) => sourceTable),
  ]);
  assert.deepEqual(
    inventory.tables.filter(({ sourceTable }) => !known.has(sourceTable)),
    [],
  );
});

test("V2 partner runtime emits the canonical parent orientation identity", () => {
  const entry = ALL_EXECUTION_ENTRIES.find(
    ({ stepId }) => stepId === "guidance-partners-aggregate",
  );
  assert.ok(entry);

  const emissions = entry.emitRows(
    [
      { id: 9, op_id: 21, nome: "Segundo" },
      { id: 3, op_id: 21, nome: "Primeiro" },
    ],
    {},
  );

  assert.deepEqual(
    emissions.map(({ identityRef }) => identityRef),
    ["tb_regularize.orientaoes_processual:21", "tb_regularize.orientaoes_processual:21"],
  );
});

test("V2 partner runtime quarantines an invalid aggregate share before projection", () => {
  const entry = ALL_EXECUTION_ENTRIES.find(
    ({ stepId }) => stepId === "guidance-partners-aggregate",
  );
  assert.ok(entry);

  const [decision] = entry.emitRows(
    { id: 9, op_id: 21, nome: "Sócio", porcent: "valor-inválido" },
    {},
  );

  assert.deepEqual(
    {
      status: decision.status,
      field: decision.field,
      reasonCode: decision.reasonCode,
    },
    {
      status: "quarantine",
      field: "porcent",
      reasonCode: "V2_PARTNER_SHARE_INVALID",
    },
  );
});

test("V2 user plaintext password is quarantined when dry-run has no verified hasher", () => {
  const entry = ALL_EXECUTION_ENTRIES.find(
    ({ sourceTable, stepId }) => sourceTable === "tb_admin.usuarios" && stepId === "user-insert",
  );
  assert.ok(entry);

  const [decision] = entry.emitRows(
    { id: 1, password: "SENTINEL_PASSWORD", departamento_id: 7 },
    {},
  );

  assert.deepEqual(
    {
      status: decision.status,
      field: decision.field,
      reasonCode: decision.reasonCode,
    },
    {
      status: "quarantine",
      field: "password",
      reasonCode: "USER_PASSWORD_HASHER_NOT_CONFIGURED",
    },
  );
  assert.doesNotMatch(JSON.stringify(decision), /SENTINEL_PASSWORD/);
});

test("V2 credential runtime accounts an inactive slot explicitly", () => {
  const entry = ALL_EXECUTION_ENTRIES.find(({ stepId }) => stepId === "credential-site-gov-br");
  assert.ok(entry);

  const decision = entry.emitRows({ id: 1 }, {}).find(({ stepId }) => stepId === entry.stepId);

  assert.deepEqual(
    {
      status: decision?.status,
      field: decision?.field,
      reasonCode: decision?.reasonCode,
    },
    {
      status: "not_emitted",
      field: null,
      reasonCode: "V2_CREDENTIAL_SITE_INACTIVE",
    },
  );
});

test("V2 merge with an authenticated missing target is classified before projection", () => {
  const entry = ALL_EXECUTION_ENTRIES.find(({ stepId }) => stepId === "collaborator-user-merge");
  assert.ok(entry);

  const [decision] = entry.emitRows(
    { id: 2, user_id: 9, nome: "Bruna" },
    { lookupDestination: () => [] },
  );

  assert.deepEqual(
    {
      status: decision.status,
      field: decision.field,
      reasonCode: decision.reasonCode,
    },
    {
      status: "quarantine",
      field: "user_id",
      reasonCode: "V2_MERGE_TARGET_NOT_FOUND",
    },
  );
});

test("RH aggregate projection can exclude current destination JSON", () => {
  const entry = ALL_EXECUTION_ENTRIES.find(({ sourceTable }) => sourceTable === "tb_rh.alergias");
  assert.ok(entry);
  const row = {
    id: 1,
    colaborador_id: 7,
    nome: "Abelha",
    fontes: "Picada",
    tratativo: "Antialérgico",
  };
  const state = {
    resolveReference: () => ({ state: "one", id: "user-7", value: null }),
    resolveUnique: () => ({ state: "zero", id: null, value: null }),
    readUserJson: () => ({ state: "empty", value: [] }),
  };
  const [decision] = entry.emitRows(row, state);

  assert.equal(decision.status, "prepared");
  assert.deepEqual(entry.projector(decision, [row], state), {
    id: "user-7",
    allergies: [{ name: "Abelha", sources: "Picada", treatment: "Antialérgico" }],
  });
});
