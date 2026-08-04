import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

import { REMAINING_EVIDENCE } from "../evidence/index.mjs";
import { validateMappingRule } from "../lib/mapping-contract.mjs";
import { loadPrismaCatalog } from "../lib/prisma-catalog.mjs";
import { iterateSqlRows } from "../lib/sql-dump-parser.mjs";
import {
  ADMIN_BUSINESS_RULES,
  buildExtensionNumberSlotContexts,
  buildRemainingReferenceContext,
  buildRuleRegistry,
  buildTriageClientSlotContexts,
  CERTIFICATE_RULES,
  createLegacyReferenceResolver,
  createV2ClientIdentityResolver,
  INTEGRACAO_REGULARIZE_RULES,
  PARCELAMENTO_RULES,
  REMAINING_RULES,
  RH_PESSOAL_RULES,
  TECHNOLOGY_RULES,
  V2_RULES,
} from "../rules/index.mjs";

const DUMP_ROOT = "/home/bruno/Documents/03.08.2026";
let clientResolverPromise;

function rule(sourceTable) {
  const found = REMAINING_RULES.find((item) => item.sourceTable === sourceTable);
  assert.ok(found, sourceTable);
  return found;
}

function one(sourceTable, sourceKey, extra = {}) {
  return { state: "one", sourceTable, sourceKey: String(sourceKey), ...extra };
}

function context(sourceTable, row, resolutions = {}, capabilities = {}) {
  return buildRemainingReferenceContext({ sourceTable, row, resolutions, capabilities });
}

async function declaredColumns(sourceTable) {
  const dump = await readFile(path.join(DUMP_ROOT, `${sourceTable}.sql`), "utf8");
  const body = dump.match(/CREATE TABLE[\s\S]*?\(([\s\S]*?)\) ENGINE=/)?.[1] ?? "";
  return [...body.matchAll(/^\s*`([^`]+)`/gm)].map((match) => match[1]);
}

async function loadRows(sourceTable) {
  const rows = [];
  for await (const row of iterateSqlRows(path.join(DUMP_ROOT, `${sourceTable}.sql`)))
    rows.push(row);
  return rows;
}

async function auditedClientResolver() {
  clientResolverPromise ??= Promise.all([
    loadRows("tb_regularize.clientes"),
    loadRows("tb_integracao.clientes"),
  ]).then(([regularizeRows, integrationRows]) =>
    createV2ClientIdentityResolver({ regularizeRows, integrationRows }),
  );
  return clientResolverPromise;
}

test("registry final contém 103 regras confirmadas sem colisão", () => {
  const previous = [
    V2_RULES,
    RH_PESSOAL_RULES,
    TECHNOLOGY_RULES,
    CERTIFICATE_RULES,
    PARCELAMENTO_RULES,
    ADMIN_BUSINESS_RULES,
    INTEGRACAO_REGULARIZE_RULES,
  ];
  const registry = buildRuleRegistry(...previous.slice(1), REMAINING_RULES);
  const confirmed = REMAINING_EVIDENCE.filter(({ finalStatus }) => finalStatus === "confirmed");
  const pending = REMAINING_EVIDENCE.filter(({ finalStatus }) => finalStatus === "pending");

  assert.equal(REMAINING_RULES.length, 15);
  assert.equal(confirmed.length, 15);
  assert.equal(pending.length, 72);
  assert.equal(registry.size, 103);
  assert.deepEqual(
    REMAINING_RULES.map(({ sourceTable }) => sourceTable),
    confirmed.map(({ sourceTable }) => sourceTable),
  );
  for (const decision of pending) assert.equal(registry.has(decision.sourceTable), false);
});

test("as 15 regras e todas as suas colunas são válidas no Prisma atual", async () => {
  const catalog = await loadPrismaCatalog("infra/prisma/schema.prisma");
  for (const mappingRule of REMAINING_RULES) {
    assert.equal(validateMappingRule(mappingRule, catalog), true, mappingRule.sourceTable);
    const expected = await declaredColumns(mappingRule.sourceTable);
    const classified = new Set(
      mappingRule.destinations.flatMap(({ columns }) =>
        columns.flatMap(({ sourceColumn }) => (sourceColumn === null ? [] : [sourceColumn])),
      ),
    );
    assert.deepEqual([...classified].sort(), expected.sort(), mappingRule.sourceTable);
  }
});

test("estoque CBS exige os joins legados de item, categoria, local e departamento", () => {
  const mappingRule = rule("tb_cbs.estoque");
  const row = {
    id: 9,
    departamento_id: 4,
    produto_id: 31,
    quantidade: 7,
    andar: 2,
    localizacao: 5,
  };

  assert.equal(
    mappingRule.emitRows(row, context(mappingRule.sourceTable, row))[0].status,
    "quarantine",
  );
  const prepared = context(mappingRule.sourceTable, row, {
    department: one("tb_admin.departamentos", 4),
    item: one("tb_cbs.estoque_itens", 31),
    category: one("tb_cbs.estoque_categorias", 8, {
      joinSourceTable: "tb_cbs.estoque_categorias_itens",
      itemSourceKey: "31",
      departmentSourceKey: "4",
    }),
    location: one("tb_cbs.estoque_localizacoes", 5, {
      relatedIdentityRef: "floor:2",
      departmentSourceKey: "4",
    }),
  });
  assert.equal(mappingRule.emitRows(row, prepared)[0].status, "prepared");

  const wrongCategoryJoin = context(mappingRule.sourceTable, row, {
    department: one("tb_admin.departamentos", 4),
    item: one("tb_cbs.estoque_itens", 31),
    category: one("tb_cbs.estoque_categorias", 8, {
      joinSourceTable: "tb_cbs.estoque_categorias_itens",
      itemSourceKey: "999",
      departmentSourceKey: "4",
    }),
    location: one("tb_cbs.estoque_localizacoes", 5, {
      relatedIdentityRef: "floor:2",
      departmentSourceKey: "4",
    }),
  });
  assert.equal(
    mappingRule.emitRows(row, wrongCategoryJoin)[0].reasonCode,
    "CBS_STOCK_CATEGORY_ITEM_MISMATCH",
  );

  const wrongCategoryDepartment = context(mappingRule.sourceTable, row, {
    department: one("tb_admin.departamentos", 4),
    item: one("tb_cbs.estoque_itens", 31),
    category: one("tb_cbs.estoque_categorias", 8, {
      joinSourceTable: "tb_cbs.estoque_categorias_itens",
      itemSourceKey: "31",
      departmentSourceKey: "999",
    }),
    location: one("tb_cbs.estoque_localizacoes", 5, {
      relatedIdentityRef: "floor:2",
      departmentSourceKey: "4",
    }),
  });
  assert.equal(
    mappingRule.emitRows(row, wrongCategoryDepartment)[0].reasonCode,
    "CBS_STOCK_CATEGORY_DEPARTMENT_MISMATCH",
  );

  const wrongLocationDepartment = context(mappingRule.sourceTable, row, {
    department: one("tb_admin.departamentos", 4),
    item: one("tb_cbs.estoque_itens", 31),
    category: one("tb_cbs.estoque_categorias", 8, {
      joinSourceTable: "tb_cbs.estoque_categorias_itens",
      itemSourceKey: "31",
      departmentSourceKey: "4",
    }),
    location: one("tb_cbs.estoque_localizacoes", 5, {
      relatedIdentityRef: "floor:2",
      departmentSourceKey: "999",
    }),
  });
  assert.equal(
    mappingRule.emitRows(row, wrongLocationDepartment)[0].reasonCode,
    "CBS_STOCK_LOCATION_DEPARTMENT_MISMATCH",
  );

  const ambiguousCategory = context(mappingRule.sourceTable, row, {
    department: one("tb_admin.departamentos", 4),
    item: one("tb_cbs.estoque_itens", 31),
    category: { state: "many", sourceTable: "tb_cbs.estoque_categorias_itens", sourceKey: "31" },
    location: one("tb_cbs.estoque_localizacoes", 5, { relatedIdentityRef: "floor:2" }),
  });
  assert.equal(
    mappingRule.emitRows(row, ambiguousCategory)[0].reasonCode,
    "CBS_STOCK_CATEGORY_AMBIGUOUS",
  );
});

test("ramais CBS só prepara número único no corpus legado e quarentena grupos ambíguos", async () => {
  const rows = await loadRows("tb_cbs.ramais");
  const byNumber = Map.groupBy(rows, ({ numero }) => numero);
  const duplicateGroups = [...byNumber.values()].filter((group) => group.length > 1);
  const duplicateRows = duplicateGroups.reduce((total, group) => total + group.length, 0);

  assert.equal(rows.length, 194);
  assert.equal(byNumber.size, 67);
  assert.equal(duplicateGroups.length, 34);
  assert.equal(duplicateRows, 161);
  assert.equal(byNumber.get("214")?.length, 17);

  const mappingRule = rule("tb_cbs.ramais");
  const userResolver = createLegacyReferenceResolver({
    sourceTable: "tb_admin.usuarios",
    legacyColumn: "id",
    rows: await loadRows("tb_admin.usuarios"),
  });
  const contexts = buildExtensionNumberSlotContexts({ rows, userResolver });
  const emissions = rows.map((row, index) => mappingRule.emitRows(row, contexts[index])[0]);
  const statuses = Object.fromEntries(
    [...Map.groupBy(emissions, ({ status }) => status)].map(([status, items]) => [
      status,
      items.length,
    ]),
  );
  assert.deepEqual(statuses, { prepared: 32, quarantine: 162 });
  assert.equal(
    emissions.filter(({ reasonCode }) => reasonCode === "EXTENSION_NUMBER_AMBIGUOUS").length,
    161,
  );
  assert.throws(
    () => buildExtensionNumberSlotContexts({ rows: rows.slice(1), userResolver }),
    /corpus.*auditado/i,
  );

  const unique = byNumber.get("262")?.[0];
  assert.ok(unique);
  assert.throws(
    () =>
      context(mappingRule.sourceTable, unique, {
        user: one("tb_admin.usuarios", unique.usuario_id),
        numberSlot: one("tb_cbs.ramais", unique.numero, { ownerSourceKey: unique.id }),
      }),
    /preflight.*ramal/i,
  );
  assert.equal(emissions[rows.indexOf(unique)].status, "prepared");

  const duplicate = byNumber.get("214")?.[0];
  assert.ok(duplicate);
  assert.equal(emissions[rows.indexOf(duplicate)].reasonCode, "EXTENSION_NUMBER_AMBIGUOUS");
});

test("senha de Marketing nunca é emitida sem criptografia nem vaza valor", () => {
  const mappingRule = rule("tb_mkt.senhas");
  const row = { id: 3, local: "Portal", user: "operador", password: "SENTINEL_SECRET", obs: "" };
  const blocked = context(mappingRule.sourceTable, row, {}, { encryption: false });
  const ready = context(mappingRule.sourceTable, row, {}, { encryption: true });

  assert.equal(
    mappingRule.emitRows(row, blocked)[0].reasonCode,
    "ENCRYPTION_CONFIGURATION_MISSING",
  );
  assert.equal(mappingRule.emitRows(row, ready)[0].status, "prepared");
  assert.doesNotMatch(JSON.stringify(mappingRule.emitRows(row, ready)), /SENTINEL_SECRET/);
  assert.equal(
    mappingRule.destinations[0].columns.find(({ sourceColumn }) => sourceColumn === "password")
      .transformation,
    "encrypt_credential",
  );
});

test("rede social resolve codigo Regularize sem colidir com id numérico de Integração", async () => {
  const mappingRule = rule("tb_mkt.redes_sociais");
  const resolver = await auditedClientResolver();
  const collision = { id: 2971, cliente_id: 279, instagram: "SENTINEL_SOCIAL_COLLISION" };
  const collisionResolution = resolver.resolve(collision.cliente_id);
  assert.equal(collisionResolution.identityRef, "tb_integracao.clientes:500");
  assert.throws(
    () =>
      context(mappingRule.sourceTable, collision, {
        client: one("tb_integracao.clientes", 279),
      }),
    /autoritativa/i,
  );
  const resolvedCollision = context(mappingRule.sourceTable, collision, {
    client: collisionResolution,
  });

  assert.equal(mappingRule.destinations[0].mode, "merge");
  assert.deepEqual(mappingRule.destinations[0].identity, {
    kind: "resolve",
    sourceTable: "tb_regularize.clientes",
    sourceColumn: "cliente_id",
    targetLegacyColumn: "codigo",
  });
  const collisionEmissions = mappingRule.emitRows(collision, resolvedCollision);
  assert.equal(collisionEmissions[0].status, "prepared");
  assert.doesNotMatch(JSON.stringify(collisionEmissions), /SENTINEL_SOCIAL_COLLISION/);

  const regularizeOnly = {
    id: 3000,
    cliente_id: 507,
    instagram: "SENTINEL_SOCIAL_REGULARIZE_ONLY",
  };
  const regularizeOnlyResolution = resolver.resolve(regularizeOnly.cliente_id);
  assert.equal(regularizeOnlyResolution.identityRef, "tb_regularize.clientes:507");
  const regularizeOnlyEmissions = mappingRule.emitRows(
    regularizeOnly,
    context(mappingRule.sourceTable, regularizeOnly, { client: regularizeOnlyResolution }),
  );
  assert.equal(regularizeOnlyEmissions[0].status, "prepared");
  assert.doesNotMatch(JSON.stringify(regularizeOnlyEmissions), /SENTINEL_SOCIAL_REGULARIZE_ONLY/);
});

test("nota PEC preserva a continuação semanal e resolve cliente por codigo Regularize", async () => {
  const mappingRule = rule("tb_pec.notas");
  const resolver = await auditedClientResolver();
  const row = {
    id: 10,
    usuario_id: 3,
    numero: 2,
    tarefa: "Retorno",
    cadastro: "2026-08-03 09:00:00",
    previsao: "0000-00-00 00:00:00",
    conclusao: "0000-00-00 00:00:00",
    status: 2,
    inicio_semana: "2026-08-03",
    fim_semana: "2026-08-07",
    cadastro_original: "2026-07-27 09:00:00",
    multa: 0,
    urgente: 1,
    cliente_id: 279,
  };
  const resolved = context(mappingRule.sourceTable, row, {
    user: one("tb_admin.usuarios", 3),
    client: resolver.resolve(row.cliente_id),
  });

  assert.throws(
    () =>
      context(mappingRule.sourceTable, row, {
        user: one("tb_admin.usuarios", 3),
        client: one("tb_integracao.clientes", 279),
      }),
    /autoritativa/i,
  );
  assert.equal(mappingRule.emitRows(row, resolved)[0].status, "prepared");
  assert.deepEqual(mappingRule.dependencies, ["tb_admin.usuarios", "tb_regularize.clientes"]);
  assert.equal("is_internal" in mappingRule.destinations[0].defaults, false);
  assert.equal(
    mappingRule.destinations[0].columns.find(
      ({ destinationColumn }) => destinationColumn === "is_internal",
    ).transformation,
    "derive_internal_from_empty_regularize_client_code",
  );
  const internal = { ...row, id: 11, cliente_id: 0 };
  const internalContext = context(mappingRule.sourceTable, internal, {
    user: one("tb_admin.usuarios", 3),
  });
  assert.equal(mappingRule.emitRows(internal, internalContext)[0].status, "prepared");
  assert.equal(
    mappingRule.destinations[0].columns.find(({ sourceColumn }) => sourceColumn === "status")
      .transformation,
    "legacy_note_continuation_status_to_boolean",
  );
});

test("configuração de Triagem deriva active_items e resolve cliente por codigo Regularize", async () => {
  const mappingRule = rule("tb_triagem.campos");
  const resolver = await auditedClientResolver();
  const rows = await loadRows("tb_triagem.campos");
  const contexts = buildTriageClientSlotContexts({ rows, clientResolver: resolver });
  const emissions = rows.map((row, index) => mappingRule.emitRows(row, contexts[index])[0]);
  const statuses = Object.fromEntries(
    [...Map.groupBy(emissions, ({ status }) => status)].map(([status, items]) => [
      status,
      items.length,
    ]),
  );

  const collision = rows.find(({ cliente_id }) => cliente_id === "279");
  assert.ok(collision);
  assert.throws(
    () =>
      context(mappingRule.sourceTable, collision, {
        client: one("tb_integracao.clientes", 279),
      }),
    /autoritativa/i,
  );
  assert.throws(
    () => buildTriageClientSlotContexts({ rows: rows.slice(1), clientResolver: resolver }),
    /corpus.*auditado/i,
  );
  assert.deepEqual(statuses, { prepared: 546, quarantine: 5, not_emitted: 2 });
  for (const code of ["842", "1194"]) {
    const index = rows.findIndex(({ cliente_id }) => cliente_id === code);
    assert.equal(emissions[index].reasonCode, "TRIAGE_CONFIG_CANONICAL_CLIENT_CONFLICT");
  }
  const duplicateOwnerIndex = rows.findIndex(({ cliente_id }) => cliente_id === "1031");
  const duplicateIndex = rows.findIndex(({ cliente_id }) => cliente_id === "1207");
  assert.equal(emissions[duplicateOwnerIndex].status, "prepared");
  assert.equal(emissions[duplicateIndex].reasonCode, "TRIAGE_CONFIG_CANONICAL_CLIENT_DUPLICATE");

  assert.equal(mappingRule.destinations[0].destinationTable, "triagem.configs");
  assert.equal(mappingRule.destinations[0].constants.type, "FISCAL");
  assert.equal(
    mappingRule.destinations[0].constants.organization_id,
    "e8048d1c-0830-45d7-84de-68e20abd685b",
  );
  assert.deepEqual(mappingRule.dependencies, ["tb_regularize.clientes"]);
  const triageTypes = await readFile("services/src/src/types/TriageTypes.ts", "utf8");
  const currentFiscalFields = new Set(
    [
      ...(triageTypes.match(/FISCAL_FIELDS\s*=\s*\[([\s\S]*?)\]/)?.[1] ?? "").matchAll(
        /"([^"]+)"/g,
      ),
    ].map((match) => match[1]),
  );
  const aggregateColumns = mappingRule.destinations[0].columns.filter(
    ({ status, destinationColumn }) => status === "mapped" && destinationColumn === "active_items",
  );
  for (const column of aggregateColumns) {
    const token = column.transformation.replace("aggregate_enabled_fiscal_field_", "");
    assert.equal(currentFiscalFields.has(token), true, `${column.sourceColumn} -> ${token}`);
  }
  for (const sourceColumn of ["faturamento", "envio"]) {
    assert.equal(
      mappingRule.destinations[0].columns.find((column) => column.sourceColumn === sourceColumn)
        .status,
      "not_preserved",
    );
  }
});

test("solicitação Workspace só vira chamado TI com departamento, categoria e usuários válidos", () => {
  const mappingRule = rule("tb_workspace.solicitacoes");
  const row = {
    id: 12,
    titulo: "Acesso",
    descricao: "Solicitação de acesso",
    status: 1,
    requerente: 3,
    atribuido: 8,
    categoria: 1,
    urgencia: 3,
    data_cadastro: "2026-08-01 09:00:00",
    data_atualizacao: "2026-08-02 10:00:00",
    departamento: 27,
  };
  const resolutions = {
    requester: one("tb_admin.usuarios", 3),
    assignee: one("tb_admin.usuarios", 8, { relatedIdentityRef: "department:27" }),
    category: one("tb_workspace.solicitacoes_categorias", 1),
    department: one("tb_admin.departamentos", 27, { relatedIdentityRef: "technology" }),
  };

  assert.equal(
    mappingRule.emitRows(row, context(mappingRule.sourceTable, row, resolutions))[0].status,
    "prepared",
  );
  const wrongDepartment = context(
    mappingRule.sourceTable,
    { ...row, departamento: 4 },
    {
      ...resolutions,
      department: one("tb_admin.departamentos", 4, { relatedIdentityRef: "service" }),
    },
  );
  assert.equal(
    mappingRule.emitRows({ ...row, departamento: 4 }, wrongDepartment)[0].reasonCode,
    "WORKSPACE_REQUEST_NOT_TECHNOLOGY",
  );
});

test("mensagem com anexo exige capacidade de migrar o arquivo legado", () => {
  const mappingRule = rule("tb_workspace.solicitacoes_mensagens");
  const row = {
    id: 2,
    solicitacao: 12,
    tipo: 6,
    remetente: 3,
    destinatario: 0,
    lida: 0,
    data_envio: "2026-08-02 10:00:00",
    mensagem: "anexo.pdf",
  };
  const resolutions = {
    request: one("tb_workspace.solicitacoes", 12),
    sender: one("tb_admin.usuarios", 3),
  };
  const blocked = context(mappingRule.sourceTable, row, resolutions, { legacyAssets: false });
  const ready = context(mappingRule.sourceTable, row, resolutions, { legacyAssets: true });

  assert.equal(mappingRule.emitRows(row, blocked)[0].reasonCode, "LEGACY_ATTACHMENT_NOT_MIGRATED");
  assert.equal(mappingRule.emitRows(row, ready)[0].status, "prepared");
  assert.doesNotMatch(JSON.stringify(mappingRule.emitRows(row, ready)), /anexo\.pdf/);
});

test("contexto de referência não pode ser trocado entre linhas", async () => {
  const mappingRule = rule("tb_mkt.redes_sociais");
  const resolver = await auditedClientResolver();
  const first = { id: 1, cliente_id: 279, instagram: "@um" };
  const second = { id: 2, cliente_id: 507, instagram: "@dois" };
  const issued = context(mappingRule.sourceTable, first, {
    client: resolver.resolve(first.cliente_id),
  });

  assert.equal(mappingRule.emitRows(second, issued)[0].reasonCode, "REFERENCE_CONTEXT_INVALID");
});
