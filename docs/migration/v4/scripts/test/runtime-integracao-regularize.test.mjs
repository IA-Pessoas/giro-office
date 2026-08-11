import assert from "node:assert/strict";
import test from "node:test";

import {
  assertTransformationCoverage,
  createExecutionRegistry,
  validateExecutionCoverage,
} from "../lib/execution-registry.mjs";
import { CASTELO_ORGANIZATION_ID } from "../lib/mapping-contract.mjs";
import { loadPrismaCatalog } from "../lib/prisma-catalog.mjs";
import { iterateSqlRows } from "../lib/sql-dump-parser.mjs";
import { INTEGRACAO_REGULARIZE_RULES } from "../rules/integracao-regularize.mjs";
import {
  buildIntegracaoRegularizeRuntimeState,
  INTEGRACAO_REGULARIZE_EXECUTION_ENTRIES,
  INTEGRACAO_REGULARIZE_TRANSFORMERS,
} from "../runtime/integracao-regularize.mjs";

const LEGACY_DUMP_ROOT = "/home/bruno/Documents/03.08.2026";

async function loadRows(sourceTable) {
  const rows = [];
  for await (const row of iterateSqlRows(`${LEGACY_DUMP_ROOT}/${sourceTable}.sql`)) rows.push(row);
  return rows;
}

function countModes(entries) {
  return Object.fromEntries(
    [...Map.groupBy(entries, ({ mode }) => mode)].map(([mode, items]) => [mode, items.length]),
  );
}

test("runtime integração/regularize cobre o mapeamento direto completo", () => {
  assert.equal(
    new Set(INTEGRACAO_REGULARIZE_EXECUTION_ENTRIES.map((entry) => entry.sourceTable)).size,
    12,
  );
  assert.equal(INTEGRACAO_REGULARIZE_EXECUTION_ENTRIES.length, 13);
  assert.deepEqual(
    countModes(INTEGRACAO_REGULARIZE_RULES.flatMap(({ destinations }) => destinations)),
    { aggregate: 1, insert: 9, merge: 3 },
  );
  assert.equal(
    assertTransformationCoverage(
      INTEGRACAO_REGULARIZE_RULES,
      INTEGRACAO_REGULARIZE_TRANSFORMERS,
      INTEGRACAO_REGULARIZE_EXECUTION_ENTRIES,
    ),
    true,
  );
});

test("merge de PA usa a identidade física client_id no tenant Castelo", async () => {
  const mappingRule = INTEGRACAO_REGULARIZE_RULES.find(
    ({ sourceTable }) => sourceTable === "tb_integracao.pa",
  );
  const runtimeEntry = INTEGRACAO_REGULARIZE_EXECUTION_ENTRIES.find(
    ({ sourceTable, stepId }) =>
      sourceTable === "tb_integracao.pa" && stepId === "integration-pa-merge",
  );
  assert.ok(mappingRule, "regra de PA ausente");
  assert.ok(runtimeEntry, "entry runtime de PA ausente");

  assert.equal(
    validateExecutionCoverage({
      ruleRegistry: new Map([[mappingRule.sourceTable, mappingRule]]),
      executionRegistry: createExecutionRegistry([[runtimeEntry]]),
      prismaCatalog: await loadPrismaCatalog("infra/prisma/schema.prisma"),
    }),
    true,
  );
  assert.deepEqual(runtimeEntry.contract.tenantScope, {
    kind: "organization_column",
    column: "organization_id",
    organizationId: CASTELO_ORGANIZATION_ID,
  });
  assert.deepEqual(runtimeEntry.contract.write, { kind: "update_exactly_one" });
  assert.deepEqual(runtimeEntry.contract.cleanup.identityColumns, ["client_id"]);
  assert.equal(runtimeEntry.contract.cleanup.ownedColumns.includes("client_id"), false);
  assert.deepEqual(runtimeEntry.contract.contextRequirements, [
    "source:tb_integracao.clientes.id",
    "destination:clients.pa.client_id",
  ]);
});

test("requirements e cleanup usam identidades físicas sem resetar identidade ou tenant", () => {
  const expirationEntries = INTEGRACAO_REGULARIZE_EXECUTION_ENTRIES.filter(
    ({ sourceTable }) => sourceTable === "tb_regularize.vencimento",
  );
  assert.equal(expirationEntries.length, 2);
  for (const runtimeEntry of expirationEntries) {
    assert.equal(
      runtimeEntry.contract.contextRequirements.includes("source:tb_regularize.pf.codigo"),
      true,
    );
  }

  const partner = INTEGRACAO_REGULARIZE_EXECUTION_ENTRIES.find(
    ({ sourceTable }) => sourceTable === "tb_regularize.pf_empresas",
  );
  const groupMember = INTEGRACAO_REGULARIZE_EXECUTION_ENTRIES.find(
    ({ sourceTable }) => sourceTable === "tb_regularize.grupos_integrantes",
  );
  assert.equal(
    partner.contract.contextRequirements.includes("source:tb_regularize.pf.codigo"),
    true,
  );
  assert.equal(
    partner.contract.contextRequirements.includes("source:tb_regularize.clientes.codigo"),
    true,
  );
  assert.equal(
    groupMember.contract.contextRequirements.includes("source:tb_regularize.clientes.codigo"),
    true,
  );

  for (const runtimeEntry of INTEGRACAO_REGULARIZE_EXECUTION_ENTRIES) {
    for (const identityColumn of runtimeEntry.contract.cleanup.identityColumns) {
      assert.equal(runtimeEntry.contract.cleanup.ownedColumns.includes(identityColumn), false);
    }
    assert.equal(runtimeEntry.contract.cleanup.ownedColumns.includes("organization_id"), false);
  }
});

test("runtime resolve integrante de grupo com o corpus V2 autoritativo do tenant Castelo", async () => {
  const [regularizeClients, integrationClients, groups] = await Promise.all([
    loadRows("tb_regularize.clientes"),
    loadRows("tb_integracao.clientes"),
    loadRows("tb_regularize.grupos"),
  ]);
  const state = buildIntegracaoRegularizeRuntimeState({
    organizationId: CASTELO_ORGANIZATION_ID,
    regularizeClients,
    integrationClients,
    sourceRows: { "tb_regularize.grupos": groups },
  });
  const runtimeEntry = INTEGRACAO_REGULARIZE_EXECUTION_ENTRIES.find(
    ({ sourceTable }) => sourceTable === "tb_regularize.grupos_integrantes",
  );
  assert.ok(runtimeEntry);
  const row = { id: "20", codigo_cliente: "507", grupo_id: "7" };
  const [decision] = runtimeEntry.emitRows(row, state);

  assert.equal(decision.status, "prepared");
  assert.deepEqual(runtimeEntry.projector(decision, row, state), {
    id: "774f91ae-69dd-5ca0-a339-620ef55893d6",
    client_id: "e7a4ebcd-8736-5708-98ab-3ffac3b0c261",
    group_id: "cafd4c0b-f9e5-5ae1-a724-bcbdd5d16fd1",
    organization_id: CASTELO_ORGANIZATION_ID,
  });
});

test("runtime inicializa os sócios com resoluções autênticas do corpus completo", async () => {
  const [regularizeClients, integrationClients, clientPfRows, partnerRows] = await Promise.all([
    loadRows("tb_regularize.clientes"),
    loadRows("tb_integracao.clientes"),
    loadRows("tb_regularize.pf"),
    loadRows("tb_regularize.pf_empresas"),
  ]);

  assert.doesNotThrow(() =>
    buildIntegracaoRegularizeRuntimeState({
      organizationId: CASTELO_ORGANIZATION_ID,
      regularizeClients,
      integrationClients,
      clientPfRows,
      partnerRows,
    }),
  );
});

test("CPF ambíguo fica em quarentena", () => {
  const state = buildIntegracaoRegularizeRuntimeState({
    organizationId: CASTELO_ORGANIZATION_ID,
    clientCandidates: [{ id: "a" }, { id: "b" }],
  });
  const entry = INTEGRACAO_REGULARIZE_EXECUTION_ENTRIES.find(
    ({ sourceTable }) => sourceTable === "tb_regularize.pf",
  );
  assert.ok(entry, "entry de ClientPF ausente");

  const [decision] = entry.emitRows(
    { id: 1, codigo: 1, cpf_cnpj: "12345678901" },
    state.contextFor("tb_regularize.pf", { id: 1, codigo: 1, cpf_cnpj: "12345678901" }),
  );
  assert.equal(decision.status, "quarantine");
});
