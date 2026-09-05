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
import { iterateSqlRows } from "../lib/sql-dump-parser.mjs";
import { ADMIN_BUSINESS_RULES } from "../rules/admin-business.mjs";
import {
  ADMIN_BUSINESS_EXECUTION_ENTRIES,
  ADMIN_BUSINESS_TRANSFORMERS,
  buildAdminBusinessRuntimeState,
} from "../runtime/admin-business.mjs";

const LEGACY_DUMP_ROOT = "/home/bruno/Documents/03.08.2026";
const OTHER_ORGANIZATION_ID = "00000000-0000-4000-8000-000000000001";
const USER_7_ID = "ec9045e4-5639-5353-b2a2-7fdae1d67bf3";
const CLIENT_INTEGRATION_897_ID = "8e7fffb6-a589-54c5-91bc-b6ad2f6d1979";
const CLIENT_INTEGRATION_350_ID = "df8001b8-2d4c-528b-a42f-74a7b3d88ac3";
const CLIENT_INTEGRATION_366_ID = "19793857-a5cb-5d62-805d-b63199dd2130";

async function loadRows(sourceTable) {
  const rows = [];
  for await (const row of iterateSqlRows(`${LEGACY_DUMP_ROOT}/${sourceTable}.sql`)) rows.push(row);
  return rows;
}

function runtimeEntry(sourceTable) {
  const entry = ADMIN_BUSINESS_EXECUTION_ENTRIES.find(
    (candidate) => candidate.sourceTable === sourceTable,
  );
  assert.ok(entry, `runtime ausente: ${sourceTable}`);
  return entry;
}

test("entry Administration usa o construtor de contexto quando recebe o estado do engine", () => {
  const state = baseState({
    legacyUsers: [{ id: "7" }],
    destinationUsers: [{ id: USER_7_ID, organization_id: CASTELO_ORGANIZATION_ID }],
  });
  const engineState = Object.freeze({
    ...state,
    lookupSource: () => [],
    lookupDestination: () => [],
  });
  const entry = runtimeEntry("tb_admin.logs");
  const row = {
    id: "1",
    tipo: "UPDATE",
    referente: "cliente",
    referente_id: "9",
    usuario_id: "7",
    data: "2026-08-06 12:00:00",
    local: "",
  };
  const [emission] = entry.emitRows(row, engineState);

  assert.equal(emission.status, "prepared");
  assert.doesNotThrow(() => entry.projector(emission, row, engineState));
});

function baseState(overrides = {}) {
  return buildAdminBusinessRuntimeState({
    organizationId: CASTELO_ORGANIZATION_ID,
    legacyUsers: [],
    destinationUsers: [],
    regularizeClients: [],
    integrationClients: [],
    destinationClients: [],
    permissionRowsBySource: {},
    icmsRows: [],
    ...overrides,
  });
}

async function stateWithClients(destinationClients) {
  const [regularizeClients, integrationClients] = await Promise.all([
    loadRows("tb_regularize.clientes"),
    loadRows("tb_integracao.clientes"),
  ]);
  return baseState({ regularizeClients, integrationClients, destinationClients });
}

test("runtime Administration/Business cobre exatamente 21 origens e 21 passos", async () => {
  assert.equal(
    assertExecutionGroupCoverage(ADMIN_BUSINESS_RULES, ADMIN_BUSINESS_EXECUTION_ENTRIES),
    true,
  );
  assert.equal(
    new Set(ADMIN_BUSINESS_EXECUTION_ENTRIES.map(({ sourceTable }) => sourceTable)).size,
    21,
  );
  assert.equal(ADMIN_BUSINESS_EXECUTION_ENTRIES.length, 21);
  assert.equal(
    assertTransformationCoverage(
      ADMIN_BUSINESS_RULES,
      ADMIN_BUSINESS_TRANSFORMERS,
      ADMIN_BUSINESS_EXECUTION_ENTRIES,
    ),
    true,
  );

  const modeCounts = new Map();
  for (const rule of ADMIN_BUSINESS_RULES) {
    for (const step of rule.destinations) {
      modeCounts.set(step.mode, (modeCounts.get(step.mode) ?? 0) + 1);
    }
  }
  assert.deepEqual(Object.fromEntries(modeCounts), { insert: 8, merge: 13 });

  const prismaCatalog = await loadPrismaCatalog("infra/prisma/schema.prisma");
  assert.equal(
    validateExecutionCoverage({
      ruleRegistry: new Map(ADMIN_BUSINESS_RULES.map((rule) => [rule.sourceTable, rule])),
      executionRegistry: createExecutionRegistry([ADMIN_BUSINESS_EXECUTION_ENTRIES]),
      prismaCatalog,
    }),
    true,
  );
});

test("projeção inclui somente mapped, defaults e Castelo; cleanup de merge possui só a coluna legada", async () => {
  const state = baseState();
  const row = {
    id: "1",
    ncm: " 01012100 ",
    ex: "",
    descricao: "  Reprodutores  ",
    aliquota: "NT",
    sentinela: "não pode vazar",
  };
  const [result] = await Array.fromAsync(state.iterateRows("tb_fiscal.ipi", [row]));

  assert.equal(result.status, "prepared");
  assert.deepEqual(result.payload, {
    id: "1e5e9074-630a-5e8c-b2c1-f86ce394e47d",
    ncm: "01012100",
    ex: "",
    description: "Reprodutores",
    aliquot: "NT",
    organization_id: CASTELO_ORGANIZATION_ID,
  });
  assert.equal("sentinela" in result.payload, false);

  for (const entry of ADMIN_BUSINESS_EXECUTION_ENTRIES) {
    if (entry.contract.write.kind === "insert") {
      assert.deepEqual(entry.contract.cleanup, {
        kind: "delete_by_identity",
        identityColumns: ["id"],
        ownedColumns: [],
        resetValues: {},
      });
      continue;
    }
    const module = entry.stepId.match(/^permission-(.+)-merge$/)?.[1];
    assert.ok(module, entry.stepId);
    assert.deepEqual(entry.contract.cleanup, {
      kind: "reset_owned_columns",
      identityColumns: ["user_id", "organization_id"],
      ownedColumns:
        entry.destinationTable === "permissions.specific" ? ["task_completion"] : [module],
      resetValues:
        entry.destinationTable === "permissions.specific"
          ? { task_completion: null }
          : { [module]: 0 },
    });
  }
});

test("campo Prisma obrigatório: competência -2025-01 do corpus vai para quarentena", async () => {
  const row = {
    id: "1425",
    cliente_id: "775",
    competencia: "-2025-01",
    lancamentos_contabil: "0",
    resumo_acumulador: "0",
    movimento_contabil: "0",
    importacao_extratos: "0",
    conciliar_extratos: "0",
    fornecedores: "0",
    integracao_impostos: "0",
    impostos_federais: "0",
    impostos_estaduais: "0",
    pagamento: "0",
    inss: "0",
    contas_estouradas: "0",
    conciliacao_geral: "0",
    emprestimos_juros: "0",
    apuracao: "0",
    icms_pis_cofins: "0",
    depreciacao: "0",
    obs: "",
  };
  const state = await stateWithClients([
    { id: CLIENT_INTEGRATION_350_ID, organization_id: CASTELO_ORGANIZATION_ID },
  ]);

  const [result] = await Array.fromAsync(state.iterateRows("tb_contabil.controle", [row]));

  assert.equal(result.status, "quarantine");
  assert.equal(result.field, "competencia");
  assert.equal(result.reasonCode, "REQUIRED_DESTINATION_TRANSFORMATION_NULL");
  assert.equal("payload" in result, false);
});

test("campo Prisma obrigatório: licitação 2 do corpus vai para quarentena", async () => {
  const row = {
    id: "111",
    cliente_id: "350",
    licitacao: "2",
    plano_de_contas: "0",
    ferramenta: "",
    obs: "",
    sistema: "",
  };
  const state = await stateWithClients([
    { id: CLIENT_INTEGRATION_366_ID, organization_id: CASTELO_ORGANIZATION_ID },
  ]);

  const [result] = await Array.fromAsync(state.iterateRows("tb_contabil.relacoes", [row]));

  assert.equal(result.status, "quarantine");
  assert.equal(result.field, "licitacao");
  assert.equal(result.reasonCode, "REQUIRED_DESTINATION_TRANSFORMATION_NULL");
  assert.equal("payload" in result, false);
});

test("campo Prisma obrigatório: IPI com NCM em branco usa marcador textual", async () => {
  const row = { id: "99", ncm: " ", ex: "", descricao: "Item", aliquota: "NT" };

  const [result] = await Array.fromAsync(baseState().iterateRows("tb_fiscal.ipi", [row]));

  assert.equal(result.status, "prepared");
  assert.equal(result.payload.ncm, "******");
});

test("campo Prisma opcional: IPI preserva null sem quarentena", async () => {
  const row = { id: "99", ncm: "01012100", ex: null, descricao: null, aliquota: null };

  const [result] = await Array.fromAsync(baseState().iterateRows("tb_fiscal.ipi", [row]));

  assert.equal(result.status, "prepared");
  assert.equal(result.payload.ncm, "01012100");
  assert.equal(result.payload.ex, null);
  assert.equal(result.payload.description, null);
  assert.equal(result.payload.aliquot, null);
});

test("permissão só resolve User candidato do tenant Castelo e põe zero/muitos em quarentena", async () => {
  const permissionRow = { id: "10", user_id: "7", permissao: "2" };
  const options = {
    legacyUsers: [{ id: "7" }],
    permissionRowsBySource: { "tb_admin.permissoes_comercial": [permissionRow] },
  };
  const wrongTenant = { id: USER_7_ID, organization_id: OTHER_ORGANIZATION_ID };
  const castelo = { id: USER_7_ID, organization_id: CASTELO_ORGANIZATION_ID };
  const entry = runtimeEntry("tb_admin.permissoes_comercial");

  const one = baseState({ ...options, destinationUsers: [wrongTenant, castelo] });
  const oneContext = one.contextFor("tb_admin.permissoes_comercial", permissionRow);
  const oneEmission = entry.emitRows(permissionRow, oneContext)[0];
  assert.equal(oneEmission.status, "prepared");
  assert.equal(oneEmission.identityRef, `permissions:${USER_7_ID}:${CASTELO_ORGANIZATION_ID}`);
  assert.deepEqual(entry.projector(oneEmission, permissionRow, oneContext), {
    user_id: USER_7_ID,
    comercial: 3,
    organization_id: CASTELO_ORGANIZATION_ID,
  });

  const zero = baseState({ ...options, destinationUsers: [wrongTenant] });
  const zeroEmission = entry.emitRows(
    permissionRow,
    zero.contextFor("tb_admin.permissoes_comercial", permissionRow),
  )[0];
  assert.equal(zeroEmission.status, "quarantine");
  assert.equal(zeroEmission.reasonCode, "USER_DESTINATION_NOT_FOUND_IN_CASTELO");

  const many = baseState({ ...options, destinationUsers: [castelo, { ...castelo }] });
  const manyEmission = entry.emitRows(
    permissionRow,
    many.contextFor("tb_admin.permissoes_comercial", permissionRow),
  )[0];
  assert.equal(manyEmission.status, "quarantine");
  assert.equal(manyEmission.reasonCode, "USER_DESTINATION_AMBIGUOUS_IN_CASTELO");
});

test("permissão dinâmica preserva apenas conclusão de tarefas e não amplia Fiscal/Workspace", async () => {
  const rows = [
    { id: "18", modulo: "integracao", referencia: "0", user_id: "7", nivel: "1" },
    { id: "7", modulo: "fiscal", referencia: "0", user_id: "7", nivel: "1" },
    { id: "13", modulo: "workspace", referencia: "0", user_id: "7", nivel: "1" },
  ];
  const state = baseState({
    legacyUsers: [{ id: "7" }],
    destinationUsers: [{ id: USER_7_ID, organization_id: CASTELO_ORGANIZATION_ID }],
    permissionRowsBySource: { "tb_admin.permissoes": rows },
  });
  const entry = runtimeEntry("tb_admin.permissoes");

  const results = await Array.fromAsync(state.iterateRows("tb_admin.permissoes", rows));
  assert.deepEqual(
    results.map(({ status, reasonCode }) => [status, reasonCode]),
    [
      ["prepared", undefined],
      ["quarantine", "DYNAMIC_PERMISSION_NO_CURRENT_CONTRACT"],
      ["quarantine", "DYNAMIC_PERMISSION_NO_CURRENT_CONTRACT"],
    ],
  );
  const context = state.contextFor("tb_admin.permissoes", rows[0]);
  const [emission] = entry.emitRows(rows[0], context);
  assert.deepEqual(entry.projector(emission, rows[0], context), {
    user_id: USER_7_ID,
    task_completion: true,
    organization_id: CASTELO_ORGANIZATION_ID,
  });
});

test("cliente contábil usa a identidade V2 autoritativa e quarentena candidatos Castelo zero/muitos", async () => {
  const [regularizeClients, integrationClients] = await Promise.all([
    loadRows("tb_regularize.clientes"),
    loadRows("tb_integracao.clientes"),
  ]);
  const row = { id: "1", cliente_id: "1", mov: "1" };
  const candidate = {
    id: CLIENT_INTEGRATION_897_ID,
    organization_id: CASTELO_ORGANIZATION_ID,
  };
  const common = { regularizeClients, integrationClients };
  const entry = runtimeEntry("tb_contabil.clientes_mov");

  const one = baseState({ ...common, destinationClients: [candidate] });
  const oneContext = one.contextFor("tb_contabil.clientes_mov", row);
  const oneEmission = entry.emitRows(row, oneContext)[0];
  assert.equal(oneEmission.status, "prepared");
  assert.equal(oneContext.clientIdentityRef, "tb_integracao.clientes:897");
  assert.deepEqual(entry.projector(oneEmission, row, oneContext), {
    id: "0c1b4db1-93b1-57e3-ac38-8f3f7639b594",
    client_id: CLIENT_INTEGRATION_897_ID,
    customer_with_movement: true,
    person_responsible_id: null,
    posted_by_id: null,
    organization_id: CASTELO_ORGANIZATION_ID,
  });

  const nonAuthoritative = baseState({
    regularizeClients: regularizeClients.slice(0, -1),
    integrationClients,
    destinationClients: [candidate],
  });
  const nonAuthoritativeEmission = entry.emitRows(
    row,
    nonAuthoritative.contextFor("tb_contabil.clientes_mov", row),
  )[0];
  assert.equal(nonAuthoritativeEmission.status, "quarantine");
  assert.equal(nonAuthoritativeEmission.reasonCode, "CLIENT_IDENTITY_NOT_AUTHORITATIVE");

  const zero = baseState({ ...common, destinationClients: [] });
  const zeroEmission = entry.emitRows(row, zero.contextFor("tb_contabil.clientes_mov", row))[0];
  assert.equal(zeroEmission.status, "quarantine");
  assert.equal(zeroEmission.reasonCode, "CLIENT_DESTINATION_NOT_FOUND_IN_CASTELO");

  const many = baseState({ ...common, destinationClients: [candidate, { ...candidate }] });
  const manyEmission = entry.emitRows(row, many.contextFor("tb_contabil.clientes_mov", row))[0];
  assert.equal(manyEmission.status, "quarantine");
  assert.equal(manyEmission.reasonCode, "CLIENT_DESTINATION_AMBIGUOUS_IN_CASTELO");
});

test("ICMS exige proprietário único da chave natural e não emite duplicata/conflito", () => {
  const owner = {
    id: "1",
    estado: "BA",
    item: "3.3",
    cest: "03.003.00",
    descricao: "Água",
    acordo: "A",
    mva_original_aplicada: "1",
    mva_ajustado: "2",
    mva_original: "3",
  };
  const duplicate = { ...owner, id: "2" };
  const conflictA = { ...owner, id: "3", item: "4.4" };
  const conflictB = { ...conflictA, id: "4", acordo: "B" };
  const rows = [duplicate, conflictB, owner, conflictA];
  const state = baseState({ icmsRows: rows });
  const entry = runtimeEntry("tb_fiscal.icms");
  const decisions = rows.map(
    (row) => entry.emitRows(row, state.contextFor("tb_fiscal.icms", row))[0],
  );

  assert.deepEqual(
    decisions.map(({ status, reasonCode }) => [status, reasonCode]),
    [
      ["not_emitted", "ICMS_NATURAL_DUPLICATE"],
      ["quarantine", "ICMS_NATURAL_KEY_CONFLICT"],
      ["prepared", null],
      ["quarantine", "ICMS_NATURAL_KEY_CONFLICT"],
    ],
  );
});

test("as 517.394 linhas do domínio cabem em gerador sob demanda sem reter payloads", async () => {
  const total = 517_394;
  let produced = 0;
  function* rows() {
    for (let id = 1; id <= total; id += 1) {
      produced += 1;
      yield { id: String(id), ncm: String(id), ex: "", descricao: "Item", aliquota: "NT" };
    }
  }

  const iterator = baseState().iterateRows("tb_fiscal.ipi", rows());
  assert.equal(produced, 0);
  const first = await iterator.next();
  assert.equal(produced, 1);
  assert.equal(first.value.payload.ncm, "1");

  let consumed = 1;
  let last = first.value;
  for await (const result of iterator) {
    consumed += 1;
    last = result;
  }
  assert.equal(consumed, total);
  assert.equal(produced, total);
  assert.equal(last.payload.ncm, "517394");
});

test("estado runtime rejeita qualquer tenant diferente da Castelo", () => {
  assert.throws(() => baseState({ organizationId: OTHER_ORGANIZATION_ID }), /tenant Castelo/i);
});
