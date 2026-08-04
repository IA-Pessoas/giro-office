import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

import { REMAINING_EVIDENCE } from "../evidence/index.mjs";
import { validateMappingRule } from "../lib/mapping-contract.mjs";
import { loadPrismaCatalog } from "../lib/prisma-catalog.mjs";
import { iterateSqlRows } from "../lib/sql-dump-parser.mjs";
import * as ruleExports from "../rules/index.mjs";
import {
  ADMIN_BUSINESS_RULES,
  buildCbsStockCategoryContexts,
  buildCbsStockContexts,
  buildCbsStockEntryContexts,
  buildCbsStockExitContexts,
  buildCbsStockLocationContexts,
  buildMarketingPasswordContexts,
  buildMarketingSocialContexts,
  buildPecNoteContexts,
  buildRemainingReferenceContext,
  buildRuleRegistry,
  buildTriageClientSlotContexts,
  buildWorkspaceCategoryContexts,
  buildWorkspaceMessageContexts,
  buildWorkspaceRequestContexts,
  CERTIFICATE_RULES,
  createV2ClientIdentityResolver,
  INTEGRACAO_REGULARIZE_RULES,
  PARCELAMENTO_RULES,
  REMAINING_RULES,
  RH_PESSOAL_RULES,
  TECHNOLOGY_RULES,
  V2_RULES,
} from "../rules/index.mjs";

const DUMP_ROOT = "/home/bruno/Documents/03.08.2026";
const LEGACY_ROOT = "/home/bruno/Documents/workspace2";
const rowsCache = new Map();
let clientResolverPromise;

function rule(sourceTable) {
  const found = REMAINING_RULES.find((item) => item.sourceTable === sourceTable);
  assert.ok(found, sourceTable);
  return found;
}

async function declaredColumns(sourceTable) {
  const dump = await readFile(path.join(DUMP_ROOT, `${sourceTable}.sql`), "utf8");
  const body = dump.match(/CREATE TABLE[\s\S]*?\(([\s\S]*?)\) ENGINE=/)?.[1] ?? "";
  return [...body.matchAll(/^\s*`([^`]+)`/gm)].map((match) => match[1]);
}

async function loadRows(sourceTable) {
  if (!rowsCache.has(sourceTable)) {
    const rows = [];
    for await (const row of iterateSqlRows(path.join(DUMP_ROOT, `${sourceTable}.sql`))) {
      rows.push(row);
    }
    rowsCache.set(sourceTable, rows);
  }
  return rowsCache.get(sourceTable);
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

function summary(emissions) {
  return Object.fromEntries(
    [...Map.groupBy(emissions, ({ status }) => status)].map(([status, items]) => [
      status,
      items.length,
    ]),
  );
}

function reasonCount(emissions, reasonCode) {
  return emissions.filter((emission) => emission.reasonCode === reasonCode).length;
}

async function stockContexts() {
  const [rows, departmentRows, itemRows, categoryRows, categoryItemRows, locationRows, floorRows] =
    await Promise.all(
      [
        "tb_cbs.estoque",
        "tb_admin.departamentos",
        "tb_cbs.estoque_itens",
        "tb_cbs.estoque_categorias",
        "tb_cbs.estoque_categorias_itens",
        "tb_cbs.estoque_localizacoes",
        "tb_cbs.estoque_andares",
      ].map(loadRows),
    );
  const categoryContexts = buildCbsStockCategoryContexts({
    rows: categoryRows,
    departmentRows,
  });
  const locationContexts = buildCbsStockLocationContexts({
    rows: locationRows,
    floorRows,
    departmentRows,
  });
  return {
    rows,
    categoryRows,
    categoryContexts,
    locationRows,
    locationContexts,
    contexts: buildCbsStockContexts({
      rows,
      departmentRows,
      itemRows,
      categoryRows,
      categoryContexts,
      categoryItemRows,
      locationRows,
      locationContexts,
      floorRows,
    }),
  };
}

async function workspaceContexts() {
  const [categoryRows, requestRows, messageRows, departmentRows, userRows] = await Promise.all(
    [
      "tb_workspace.solicitacoes_categorias",
      "tb_workspace.solicitacoes",
      "tb_workspace.solicitacoes_mensagens",
      "tb_admin.departamentos",
      "tb_admin.usuarios",
    ].map(loadRows),
  );
  const categoryContexts = buildWorkspaceCategoryContexts({ rows: categoryRows, departmentRows });
  const requestContexts = buildWorkspaceRequestContexts({
    rows: requestRows,
    userRows,
    departmentRows,
    categoryRows,
    categoryContexts,
  });
  const messageContexts = buildWorkspaceMessageContexts({
    rows: messageRows,
    requestRows,
    requestContexts,
    userRows,
  });
  return {
    categoryRows,
    categoryContexts,
    requestRows,
    requestContexts,
    messageRows,
    messageContexts,
    departmentRows,
    userRows,
  };
}

test("registry final contém 102 regras; ramais reclassificados não possuem emissor", () => {
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

  assert.equal(REMAINING_RULES.length, 14);
  assert.equal(confirmed.length, 14);
  assert.equal(pending.length, 73);
  assert.equal(registry.size, 102);
  assert.equal(registry.has("tb_cbs.ramais"), false);
  assert.deepEqual(
    REMAINING_RULES.map(({ sourceTable }) => sourceTable),
    confirmed.map(({ sourceTable }) => sourceTable),
  );
});

test("as 14 regras e todas as colunas reais são válidas no Prisma atual", async () => {
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

test("proveniência opaca rejeita fabricação, spread, clone, mistura, mutação e subset", async () => {
  const mappingRule = rule("tb_cbs.estoque");
  const { rows, contexts } = await stockContexts();
  const preparedIndex = contexts.findIndex(
    (context, index) => mappingRule.emitRows(rows[index], context)[0].status === "prepared",
  );
  assert.notEqual(preparedIndex, -1);
  const row = rows[preparedIndex];
  const context = contexts[preparedIndex];
  const otherContext = contexts[preparedIndex + 1];

  const fabricated = buildRemainingReferenceContext({
    sourceTable: mappingRule.sourceTable,
    row,
    resolutions: context.resolutions,
  });
  assert.equal(mappingRule.emitRows(row, fabricated)[0].reasonCode, "REFERENCE_CONTEXT_INVALID");
  assert.equal(
    mappingRule.emitRows(row, { ...context })[0].reasonCode,
    "REFERENCE_CONTEXT_INVALID",
  );
  assert.equal(
    mappingRule.emitRows(row, structuredClone(context))[0].reasonCode,
    "REFERENCE_CONTEXT_INVALID",
  );
  const mixed = buildRemainingReferenceContext({
    sourceTable: mappingRule.sourceTable,
    row,
    resolutions: { ...context.resolutions, item: otherContext.resolutions.item },
  });
  assert.equal(mappingRule.emitRows(row, mixed)[0].reasonCode, "REFERENCE_CONTEXT_INVALID");
  assert.equal(Object.isFrozen(context), true);
  assert.equal(Object.isFrozen(context.resolutions.item), true);
  assert.throws(() => {
    context.resolutions.item.sourceKey = "430";
  }, TypeError);

  const args = await Promise.all(
    [
      "tb_admin.departamentos",
      "tb_cbs.estoque_itens",
      "tb_cbs.estoque_categorias",
      "tb_cbs.estoque_categorias_itens",
      "tb_cbs.estoque_localizacoes",
      "tb_cbs.estoque_andares",
    ].map(loadRows),
  );
  assert.throws(
    () =>
      buildCbsStockContexts({
        rows: rows.slice(1),
        departmentRows: args[0],
        itemRows: args[1],
        categoryRows: args[2],
        categoryItemRows: args[3],
        locationRows: args[4],
        floorRows: args[5],
      }),
    /corpus completo auditado.*tb_cbs\.estoque/i,
  );
  assert.equal(mappingRule.emitRows(row, context)[0].status, "prepared");
});

test("estoque CBS preserva descrição/status do item e aplica escopo Tecnologia e joins reais", async () => {
  const mappingRule = rule("tb_cbs.estoque");
  const { rows, contexts } = await stockContexts();
  const emissions = rows.map((row, index) => mappingRule.emitRows(row, contexts[index])[0]);
  const step = mappingRule.destinations[0];
  const itemRows = await loadRows("tb_cbs.estoque_itens");
  const item430 = itemRows.find(({ id }) => id === "430");
  const item433 = itemRows.find(({ id }) => id === "433");

  assert.deepEqual(summary(emissions), { prepared: 21, quarantine: 412 });
  assert.equal(reasonCount(emissions, "CBS_STOCK_NOT_TECHNOLOGY"), 228);
  assert.deepEqual([item430?.status, item433?.status], ["0", "0"]);
  assert.equal("description" in step.defaults, false);
  assert.equal("status" in step.defaults, false);
  assert.equal(
    step.columns.find(({ destinationColumn }) => destinationColumn === "description")
      ?.transformation,
    "resolve_stock_item_description",
  );
  assert.equal(
    step.columns.find(({ destinationColumn }) => destinationColumn === "status")?.transformation,
    "map_legacy_stock_item_zero_active_status",
  );
  for (const productId of ["430", "433"]) {
    const index = rows.findIndex(({ produto_id }) => produto_id === productId);
    assert.notEqual(index, -1);
    assert.equal(contexts[index].resolutions.item.itemActive, true);
    assert.equal(contexts[index].resolutions.item.itemDescription, null);
    assert.equal(emissions[index].reasonCode, "CBS_STOCK_CATEGORY_NOT_FOUND");
  }
});

test("pais transversais de estoque exigem decisões opacas prepared de categoria e localização", async () => {
  const { rows, contexts, categoryRows, categoryContexts, locationRows, locationContexts } =
    await stockContexts();
  const mappingRule = rule("tb_cbs.estoque");
  const preparedIndexes = rows.flatMap((row, index) =>
    mappingRule.emitRows(row, contexts[index])[0].status === "prepared" ? [index] : [],
  );
  assert.equal(preparedIndexes.length, 21);
  assert.equal(
    preparedIndexes.every(
      (index) =>
        contexts[index].resolutions.category.migrationState === "prepared" &&
        contexts[index].resolutions.location.migrationState === "prepared",
    ),
    true,
  );
  const quarantinedParentIndexes = rows.flatMap((_row, index) =>
    contexts[index].resolutions.category.migrationState !== "prepared" ||
    contexts[index].resolutions.location.migrationState !== "prepared"
      ? [index]
      : [],
  );
  assert.ok(quarantinedParentIndexes.length > 0);
  assert.equal(
    quarantinedParentIndexes.every(
      (index) => mappingRule.emitRows(rows[index], contexts[index])[0].status !== "prepared",
    ),
    true,
  );
  const [departmentRows, itemRows, categoryItemRows, floorRows] = await Promise.all(
    [
      "tb_admin.departamentos",
      "tb_cbs.estoque_itens",
      "tb_cbs.estoque_categorias_itens",
      "tb_cbs.estoque_andares",
    ].map(loadRows),
  );
  const args = {
    rows,
    departmentRows,
    itemRows,
    categoryRows,
    categoryItemRows,
    locationRows,
    locationContexts,
    floorRows,
  };
  assert.throws(
    () =>
      buildCbsStockContexts({
        ...args,
        categoryContexts: categoryContexts.map((context) => ({ ...context })),
      }),
    /preflight opaco/i,
  );
  assert.throws(
    () => buildCbsStockContexts({ ...args, categoryContexts: categoryContexts.slice(1) }),
    /preflight opaco completo/i,
  );
  assert.throws(
    () => buildCbsStockContexts({ ...args, locationContexts: locationContexts.slice(1) }),
    /preflight opaco completo/i,
  );
});

test("entrada e saída só preparam quando estoque e usuários-pai também preparam", async () => {
  const { rows: stockRows, contexts: stockRuleContexts } = await stockContexts();
  const stockRule = rule("tb_cbs.estoque");
  const preparedStockIds = new Set(
    stockRows.flatMap((row, index) =>
      stockRule.emitRows(row, stockRuleContexts[index])[0].status === "prepared" ? [row.id] : [],
    ),
  );
  const userRows = await loadRows("tb_admin.usuarios");
  const userRule = V2_RULES.find(({ sourceTable }) => sourceTable === "tb_admin.usuarios");
  const preparedUserIds = new Set(
    userRows.flatMap((row) => (userRule.emitRows(row)[0].status === "prepared" ? [row.id] : [])),
  );
  assert.equal(preparedUserIds.size, 305);
  assert.equal(preparedUserIds.has("102"), false);
  const entryRows = await loadRows("tb_cbs.estoque_entradas");
  const entryContexts = buildCbsStockEntryContexts({
    rows: entryRows,
    stockRows,
    stockContexts: stockRuleContexts,
    userRows,
  });
  const exitRows = await loadRows("tb_cbs.estoque_saidas");
  const exitContexts = buildCbsStockExitContexts({
    rows: exitRows,
    stockRows,
    stockContexts: stockRuleContexts,
    userRows,
  });
  const preparedEntries = entryRows.filter(
    (row, index) =>
      rule("tb_cbs.estoque_entradas").emitRows(row, entryContexts[index])[0].status === "prepared",
  );
  const preparedExits = exitRows.filter(
    (row, index) =>
      rule("tb_cbs.estoque_saidas").emitRows(row, exitContexts[index])[0].status === "prepared",
  );

  assert.equal(
    preparedEntries.every(({ produto_id }) => preparedStockIds.has(produto_id)),
    true,
  );
  assert.equal(
    preparedExits.every(({ produto_id }) => preparedStockIds.has(produto_id)),
    true,
  );
  assert.equal(
    preparedEntries.every(({ repositor }) => preparedUserIds.has(repositor)),
    true,
  );
  assert.equal(
    preparedExits.every((row) =>
      [row.solicitante, row.autorizador, row.operador]
        .filter((sourceKey) => !["", "0"].includes(String(sourceKey).trim()))
        .every((sourceKey) => preparedUserIds.has(sourceKey)),
    ),
    true,
  );

  const entryWithQuarantinedUser = entryRows.findIndex(({ repositor }) => repositor === "102");
  assert.notEqual(entryWithQuarantinedUser, -1);
  assert.equal(
    entryContexts[entryWithQuarantinedUser].resolutions.user.migrationState,
    "quarantine",
  );
  const exitWithQuarantinedUser = exitRows.findIndex(
    ({ solicitante, autorizador, operador }) =>
      solicitante === "102" || autorizador === "102" || operador === "102",
  );
  assert.notEqual(exitWithQuarantinedUser, -1);
  assert.equal(
    ["requester", "approver", "operator"]
      .map((name) => exitContexts[exitWithQuarantinedUser].resolutions[name])
      .filter((resolution) => resolution?.sourceKey === "102")
      .every(({ migrationState }) => migrationState === "quarantine"),
    true,
  );
});

test("localização CBS resolve o rótulo real do andar e não converte ID externo em floor", async () => {
  const [rows, floorRows, departmentRows] = await Promise.all(
    ["tb_cbs.estoque_localizacoes", "tb_cbs.estoque_andares", "tb_admin.departamentos"].map(
      loadRows,
    ),
  );
  const contexts = buildCbsStockLocationContexts({ rows, floorRows, departmentRows });
  const emissions = rows.map(
    (row, index) => rule("tb_cbs.estoque_localizacoes").emitRows(row, contexts[index])[0],
  );
  assert.deepEqual(summary(emissions), { quarantine: 25, prepared: 2 });
  const serverIndex = rows.findIndex(({ id }) => id === "20");
  const depositIndex = rows.findIndex(({ id }) => id === "22");
  assert.equal(contexts[serverIndex].resolutions.floor.floorLabel, "Térreo");
  assert.equal(contexts[serverIndex].resolutions.floor.floor, 0);
  assert.equal(emissions[serverIndex].status, "prepared");
  assert.equal(contexts[depositIndex].resolutions.floor.floorLabel, "Capuchino");
  assert.equal(emissions[depositIndex].reasonCode, "CBS_STOCK_FLOOR_LABEL_UNMAPPABLE");
});

test("saídas com observação funcional nunca são emitidas parcialmente", async () => {
  const [rows, userRows, { rows: stockRows, contexts: stockRuleContexts }] = await Promise.all([
    loadRows("tb_cbs.estoque_saidas"),
    loadRows("tb_admin.usuarios"),
    stockContexts(),
  ]);
  const contexts = buildCbsStockExitContexts({
    rows,
    stockRows,
    stockContexts: stockRuleContexts,
    userRows,
  });
  const mappingRule = rule("tb_cbs.estoque_saidas");
  const emissions = rows.map((row, index) => mappingRule.emitRows(row, contexts[index])[0]);
  const withObservation = rows
    .map((row, index) => ({ row, emission: emissions[index] }))
    .filter(({ row }) => String(row.obs).trim().length > 0);

  assert.equal(withObservation.length, 1807);
  assert.equal(
    withObservation.every(({ emission }) => emission.status === "quarantine"),
    true,
  );
  assert.deepEqual(summary(emissions), { quarantine: 2993, prepared: 7 });
  assert.equal(
    mappingRule.destinations[0].columns.find(({ sourceColumn }) => sourceColumn === "obs")?.status,
    "not_preserved",
  );
});

test("Triagem usa NFSE e quarentena faturamento/envio antes da consolidação", async () => {
  const rows = await loadRows("tb_triagem.campos");
  const contexts = buildTriageClientSlotContexts({
    rows,
    clientResolver: await auditedClientResolver(),
  });
  const mappingRule = rule("tb_triagem.campos");
  const reversedRows = [...rows].reverse();
  const reversedContexts = buildTriageClientSlotContexts({
    rows: reversedRows,
    clientResolver: await auditedClientResolver(),
  });
  const emissions = rows.map((row, index) => mappingRule.emitRows(row, contexts[index])[0]);
  const functionalIndexes = rows.flatMap((row, index) =>
    !["", "0"].includes(String(row.faturamento).trim()) || String(row.envio).trim().length > 0
      ? [index]
      : [],
  );

  assert.equal(functionalIndexes.length, 307);
  assert.equal(
    functionalIndexes.every(
      (index) => emissions[index].reasonCode === "TRIAGE_FUNCTIONAL_FIELD_UNMAPPABLE",
    ),
    true,
  );
  assert.deepEqual(summary(emissions), { prepared: 243, quarantine: 309, not_emitted: 1 });
  const deliveryOnlyIndex = rows.findIndex(
    (row, index) =>
      ["", "0"].includes(String(row.faturamento).trim()) &&
      String(row.envio).trim().length > 0 &&
      emissions[index].reasonCode === "TRIAGE_FUNCTIONAL_FIELD_UNMAPPABLE",
  );
  assert.notEqual(deliveryOnlyIndex, -1);
  assert.equal(emissions[deliveryOnlyIndex].field, "envio");
  const multiCauseIndexes = functionalIndexes.filter(
    (index) => contexts[index].resolutions.clientSlot.state === "conflict",
  );
  assert.equal(multiCauseIndexes.length, 5);
  for (const index of multiCauseIndexes) {
    const reverseIndex = reversedRows.findIndex(({ id }) => id === rows[index].id);
    assert.deepEqual(
      contexts[index].resolutions.clientSlot,
      reversedContexts[reverseIndex].resolutions.clientSlot,
    );
    const audit = ruleExports.projectRemainingRow({
      sourceTable: "tb_triagem.campos",
      row: rows[index],
      context: contexts[index],
    });
    assert.deepEqual(
      audit.blockers.map(({ reasonCode }) => reasonCode),
      ["TRIAGE_FUNCTIONAL_FIELD_UNMAPPABLE", "TRIAGE_CONFIG_CANONICAL_CLIENT_CONFLICT"],
    );
  }
  assert.equal(
    mappingRule.destinations[0].columns.find(({ sourceColumn }) => sourceColumn === "nfce_tomados")
      ?.transformation,
    "aggregate_enabled_fiscal_field_nfse_received",
  );
  const triageTypes = await readFile("services/src/src/types/TriageTypes.ts", "utf8");
  assert.match(triageTypes, /"nfse_received"/);
  const legacyReport = await readFile(
    path.join(LEGACY_ROOT, "triagem/pages/relatorios/relatorios.php"),
    "utf8",
  );
  assert.match(legacyReport, /value="nfce_tomados">NFSE Tomados de Fora/);
});

test("rede social consolida N:1 de modo determinístico no Client canônico", async () => {
  const rows = await loadRows("tb_mkt.redes_sociais");
  const clientResolver = await auditedClientResolver();
  const contexts = buildMarketingSocialContexts({ rows, clientResolver });
  const reversedRows = [...rows].reverse();
  const reversedContexts = buildMarketingSocialContexts({ rows: reversedRows, clientResolver });
  const mappingRule = rule("tb_mkt.redes_sociais");
  const emissions = rows.map((row, index) => mappingRule.emitRows(row, contexts[index])[0]);

  assert.equal(mappingRule.cardinality, "N:1");
  assert.deepEqual(summary(emissions), { prepared: 203, not_emitted: 1, quarantine: 1 });
  for (const id of ["3121", "3122"]) {
    const index = rows.findIndex((row) => row.id === id);
    const reverseIndex = reversedRows.findIndex((row) => row.id === id);
    assert.deepEqual(
      contexts[index].resolutions.clientSlot,
      reversedContexts[reverseIndex].resolutions.clientSlot,
    );
  }
  assert.equal(emissions[rows.findIndex(({ id }) => id === "3121")].status, "prepared");
  assert.equal(
    emissions[rows.findIndex(({ id }) => id === "3122")].reasonCode,
    "MKT_SOCIAL_CANONICAL_CLIENT_DUPLICATE",
  );
  assert.throws(
    () => buildMarketingSocialContexts({ rows: rows.slice(1), clientResolver }),
    /corpus completo auditado.*tb_mkt\.redes_sociais/i,
  );
});

test("mensagens Workspace usam tipo executável e cadeia parental opaca", async () => {
  const {
    categoryRows,
    categoryContexts,
    requestRows,
    requestContexts,
    messageRows: rows,
    messageContexts: contexts,
    departmentRows,
    userRows,
  } = await workspaceContexts();
  const mappingRule = rule("tb_workspace.solicitacoes_mensagens");
  const emissions = rows.map((row, index) => mappingRule.emitRows(row, contexts[index])[0]);
  const normalIndex = rows.findIndex(({ tipo }) => tipo === "0");
  const attachmentIndex = rows.findIndex(({ tipo }) => tipo === "6");

  assert.deepEqual(ruleExports.mapWorkspaceMessageType(rows[normalIndex].tipo), {
    status: "mapped",
    value: "Message",
    attachment: false,
  });
  assert.deepEqual(
    ruleExports.mapWorkspaceMessageType(rows[attachmentIndex].tipo, {
      correlated: false,
      mediaType: "application/pdf",
      storageSupported: false,
    }),
    {
      status: "quarantine",
      field: "mensagem",
      reasonCode: "WORKSPACE_ATTACHMENT_CORRELATION_UNRESOLVED",
    },
  );
  assert.deepEqual(
    ruleExports.mapWorkspaceMessageType("6", {
      correlated: true,
      mediaType: "image/png",
      storageSupported: true,
    }),
    { status: "mapped", value: "Message", attachment: true },
  );
  assert.deepEqual(ruleExports.mapWorkspaceMessageType("7"), {
    status: "quarantine",
    field: "tipo",
    reasonCode: "WORKSPACE_MESSAGE_TYPE_INVALID",
  });
  assert.deepEqual(ruleExports.mapWorkspaceMessageType(""), {
    status: "quarantine",
    field: "tipo",
    reasonCode: "WORKSPACE_MESSAGE_TYPE_INVALID",
  });
  assert.equal(rows[attachmentIndex].mensagem, "");
  assert.equal(emissions[normalIndex].reasonCode, "WORKSPACE_MESSAGE_READ_STATE_UNMAPPABLE");
  assert.equal(
    emissions[attachmentIndex].reasonCode,
    "WORKSPACE_ATTACHMENT_CORRELATION_UNRESOLVED",
  );
  assert.deepEqual(summary(emissions), { quarantine: 2 });
  assert.equal(
    requestRows
      .flatMap((row, index) =>
        rule("tb_workspace.solicitacoes").emitRows(row, requestContexts[index])[0].status ===
        "prepared"
          ? [index]
          : [],
      )
      .every((index) => requestContexts[index].resolutions.category.migrationState === "prepared"),
    true,
  );
  assert.equal(
    contexts.every(({ resolutions }) => resolutions.request.migrationState === "prepared"),
    true,
  );
  assert.throws(
    () =>
      buildWorkspaceRequestContexts({
        rows: requestRows,
        userRows,
        departmentRows,
        categoryRows,
        categoryContexts: categoryContexts.map((context) => ({ ...context })),
      }),
    /preflight opaco/i,
  );
  assert.throws(
    () =>
      buildWorkspaceMessageContexts({
        rows,
        requestRows,
        requestContexts: [...requestContexts].reverse(),
        userRows,
      }),
    /preflight opaco/i,
  );
  assert.throws(
    () =>
      buildWorkspaceRequestContexts({
        rows: requestRows,
        userRows,
        departmentRows,
        categoryRows,
        categoryContexts: categoryContexts.slice(1),
      }),
    /preflight opaco completo/i,
  );
  assert.throws(
    () =>
      buildWorkspaceMessageContexts({
        rows,
        requestRows,
        requestContexts: requestContexts.slice(1),
        userRows,
      }),
    /preflight opaco completo/i,
  );
  await assert.doesNotReject(
    access(path.join(LEGACY_ROOT, "uploads/Workspace/solicitacoes/67ea8f65eca6d.pdf")),
  );
  const storage = await readFile(
    "services/ti-service/src/services/tiRequestImageStorage.ts",
    "utf8",
  );
  assert.match(storage, /image\/jpeg/);
  assert.match(storage, /image\/png/);
  assert.match(storage, /image\/webp/);
  assert.doesNotMatch(storage, /application\/pdf/);
});

test("senha Marketing exige builder opaco com criptografia e nunca vaza o segredo", async () => {
  const rows = await loadRows("tb_mkt.senhas");
  const mappingRule = rule("tb_mkt.senhas");
  const blocked = buildMarketingPasswordContexts({ rows, encryptionConfigured: false });
  const ready = buildMarketingPasswordContexts({ rows, encryptionConfigured: true });
  assert.deepEqual(
    summary(rows.map((row, index) => mappingRule.emitRows(row, blocked[index])[0])),
    { quarantine: 54 },
  );
  assert.deepEqual(summary(rows.map((row, index) => mappingRule.emitRows(row, ready[index])[0])), {
    prepared: 52,
    quarantine: 2,
  });
  const audits = rows.map((row, index) =>
    ruleExports.projectRemainingRow({
      sourceTable: "tb_mkt.senhas",
      row,
      context: ready[index],
    }),
  );
  const audit = audits[0];
  assert.deepEqual(audit.payload.credential, {
    sourcePresent: true,
    encryptionRequired: true,
    plaintextIncluded: false,
  });
  const secretObservationIndexes = rows.flatMap((row, index) => {
    const password = String(row.password).trim();
    const observation = String(row.obs).trim();
    return password.length > 0 && observation.includes(password) ? [index] : [];
  });
  assert.equal(secretObservationIndexes.length, 2);
  assert.equal(
    secretObservationIndexes.every(
      (index) =>
        audits[index].payload === null &&
        audits[index].decision.reasonCode === "MKT_PASSWORD_OBSERVATION_CONTAINS_SECRET",
    ),
    true,
  );
  assert.equal(
    audits
      .map((rowAudit) => JSON.stringify(rowAudit))
      .every((serializedAudit) =>
        rows.every((row) => !serializedAudit.includes(String(row.password))),
      ),
    true,
  );
});

test("payloads reais das 14 regras materializam valores significativos sem ampliar emissão", async () => {
  const organizationId = "e8048d1c-0830-45d7-84de-68e20abd685b";
  const stockBundle = await stockContexts();
  const workspaceBundle = await workspaceContexts();
  const [users, entries, inventory, exits, emails, socialRows, passwordRows, pecRows, triageRows] =
    await Promise.all(
      [
        "tb_admin.usuarios",
        "tb_cbs.estoque_entradas",
        "tb_cbs.estoque_inventario",
        "tb_cbs.estoque_saidas",
        "tb_cbc.emails",
        "tb_mkt.redes_sociais",
        "tb_mkt.senhas",
        "tb_pec.notas",
        "tb_triagem.campos",
      ].map(loadRows),
    );
  const entryContexts = buildCbsStockEntryContexts({
    rows: entries,
    stockRows: stockBundle.rows,
    stockContexts: stockBundle.contexts,
    userRows: users,
  });
  const exitContexts = buildCbsStockExitContexts({
    rows: exits,
    stockRows: stockBundle.rows,
    stockContexts: stockBundle.contexts,
    userRows: users,
  });
  const clientResolver = await auditedClientResolver();
  const socialContexts = buildMarketingSocialContexts({ rows: socialRows, clientResolver });
  const passwordContexts = buildMarketingPasswordContexts({
    rows: passwordRows,
    encryptionConfigured: true,
  });
  const pecContexts = buildPecNoteContexts({ rows: pecRows, userRows: users, clientResolver });
  const triageContexts = buildTriageClientSlotContexts({ rows: triageRows, clientResolver });
  const projectById = (sourceTable, rows, contexts, id) => {
    const index = rows.findIndex((row) => row.id === id);
    assert.notEqual(index, -1, `${sourceTable}:${id}`);
    return ruleExports.projectRemainingRow({
      sourceTable,
      row: rows[index],
      context: contexts[index],
    });
  };

  assert.deepEqual(
    projectById(
      "tb_cbc.emails",
      emails,
      emails.map(() => ({})),
      "3",
    ).payload,
    {
      id: "7a9ed02f-ecba-5def-9339-da1535648910",
      email: "castelo.infoproduto@gmail.com",
      responsible: "Alef",
      new_client_sending: true,
      task_stalled_sending: true,
      organization_id: organizationId,
    },
  );
  assert.deepEqual(
    projectById(
      "tb_cbs.estoque_categorias",
      stockBundle.categoryRows,
      stockBundle.categoryContexts,
      "11",
    ).payload,
    {
      id: "ee027dc5-f6d8-55dc-b75f-18d5d91a9923",
      name: "CABOS",
      department_id: "b439168d-8152-5b57-bd9c-440773d07d5b",
      status: true,
      organization_id: organizationId,
    },
  );
  assert.deepEqual(
    projectById("tb_cbs.estoque", stockBundle.rows, stockBundle.contexts, "413").payload,
    {
      id: "18c1460c-ce60-53d0-8939-a6a3d98c29c7",
      department_id: "b439168d-8152-5b57-bd9c-440773d07d5b",
      name: "Fonte para Notebook N11CASTELO",
      description: "Defeituosa",
      status: false,
      category_id: "f1a7aae0-9d8d-5c75-a2e3-bb30a4de6f8e",
      quantity: 1,
      location_id: "31f592ca-e7f3-5840-950d-c449f2860d26",
      organization_id: organizationId,
    },
  );
  assert.deepEqual(projectById("tb_cbs.estoque_entradas", entries, entryContexts, "315").payload, {
    id: "d3e53e20-0ab9-5ce3-9616-a7aca8ecf212",
    stock_id: "18c1460c-ce60-53d0-8939-a6a3d98c29c7",
    quantity: 11,
    entry_date: "2023-08-31 14:55:00",
    entry_by_user_id: "65c120df-02f4-51ac-8541-0e69e3ce5214",
    organization_id: organizationId,
  });
  assert.deepEqual(
    projectById(
      "tb_cbs.estoque_inventario",
      inventory,
      inventory.map(() => ({})),
      "1",
    ).payload,
    {
      id: "7ed37dc7-498c-5cbd-9c46-47aab2f53d75",
      name: "Carrinho",
      tag: null,
      active: true,
      organization_id: organizationId,
    },
  );
  assert.deepEqual(
    projectById(
      "tb_cbs.estoque_localizacoes",
      stockBundle.locationRows,
      stockBundle.locationContexts,
      "21",
    ).payload,
    {
      id: "31f592ca-e7f3-5840-950d-c449f2860d26",
      name: "Armários",
      floor: 2,
      department_id: "b439168d-8152-5b57-bd9c-440773d07d5b",
      status: true,
      organization_id: organizationId,
    },
  );
  assert.deepEqual(projectById("tb_cbs.estoque_saidas", exits, exitContexts, "1185").payload, {
    id: "9067f7f9-4b29-5ca8-8fed-1903f8ca40b2",
    stock_id: "e079d279-1d93-5eb5-8db0-011167300e67",
    quantity: 1,
    exit_date: "2023-11-16 11:31:00",
    destination: "11",
    requester_id: "7b41c726-8f87-581e-a0f8-18adb1fccfaf",
    approver_id: "43b3a318-4ed8-58f1-ac3b-9cd44d0fb9d2",
    operator_id: "126778dc-0e9e-52b8-b541-8d9cb0a29874",
    location_destination_id: null,
    organization_id: organizationId,
  });
  assert.deepEqual(
    projectById("tb_mkt.redes_sociais", socialRows, socialContexts, "3121").payload,
    { id: "c54d2373-4929-5377-92b2-078ec84a584d", instagram: "cantor.roby" },
  );
  assert.deepEqual(projectById("tb_mkt.senhas", passwordRows, passwordContexts, "23").payload, {
    id: "fbfb5fee-356b-599f-9dc4-7b1178b7d3be",
    local: "CANVA",
    userPresent: true,
    notes: null,
    organization_id: organizationId,
    credential: {
      sourcePresent: true,
      encryptionRequired: true,
      plaintextIncluded: false,
    },
  });
  assert.deepEqual(projectById("tb_pec.notas", pecRows, pecContexts, "2").payload, {
    id: "4536afc7-eddd-50bb-9705-d47538636135",
    user_id: "48ca6e10-17c0-56aa-bcf5-e27013261b71",
    number: 1,
    note: "Verificar proposta assinada do projeto Matheus - Alice Embalagens, mudar de MEI para ME e enviar mudança para o financeiro;",
    created_at: "2024-03-04 08:45:58",
    due_date: null,
    completion_date: "2024-03-05 18:04:52",
    status: true,
    week_start_date: "2024-03-04",
    week_end_date: "2024-03-08",
    original_creation_date: "2024-03-04 08:45:58",
    has_penalty: false,
    is_urgent: false,
    is_internal: true,
    client_id: null,
    organization_id: organizationId,
  });
  assert.deepEqual(projectById("tb_triagem.campos", triageRows, triageContexts, "4").payload, {
    id: "417c8249-e23f-567a-8740-582af574c40e",
    client_id: "a8203615-6f07-526c-ba24-5a158ed0b53f",
    type: "FISCAL",
    active_items: ["nfce_documents"],
    organization_id: organizationId,
  });
  assert.deepEqual(
    projectById(
      "tb_workspace.solicitacoes_categorias",
      workspaceBundle.categoryRows,
      workspaceBundle.categoryContexts,
      "1",
    ).payload,
    {
      id: "eb70dfea-f4fc-5b97-a19e-f976b45e8e95",
      name: "Troca de Equipamento",
      active: true,
      organization_id: organizationId,
    },
  );
  assert.deepEqual(
    projectById(
      "tb_workspace.solicitacoes",
      workspaceBundle.requestRows,
      workspaceBundle.requestContexts,
      "26",
    ).payload,
    {
      id: "fb7a6a07-92ee-57b1-a024-88813734f32e",
      title: "TESTE",
      description: "MEU PC PEGOU FOGO",
      status: "In_Progress",
      requester_id: "34f9ea61-838f-5d32-9004-6b1c6ecf7b21",
      assigned_to_id: "126778dc-0e9e-52b8-b541-8d9cb0a29874",
      category_id: "eb70dfea-f4fc-5b97-a19e-f976b45e8e95",
      urgency: "High",
      attachment: null,
      created_at: "2025-03-31 16:41:51",
      updated_at: "2025-09-01 13:21:31",
      organization_id: organizationId,
    },
  );
  const quarantinedMessage = projectById(
    "tb_workspace.solicitacoes_mensagens",
    workspaceBundle.messageRows,
    workspaceBundle.messageContexts,
    "1",
  );
  assert.equal(quarantinedMessage.payload, null);
  assert.deepEqual(quarantinedMessage.candidate, {
    type: "Message",
    content: { present: true, length: 39 },
    attachment: false,
  });
});

test("comportamento real cobre as 15 origens originalmente confirmadas após downgrade", async () => {
  const [departments, users, stocks, categories, entries, inventory, locations, floors, exits] =
    await Promise.all(
      [
        "tb_admin.departamentos",
        "tb_admin.usuarios",
        "tb_cbs.estoque",
        "tb_cbs.estoque_categorias",
        "tb_cbs.estoque_entradas",
        "tb_cbs.estoque_inventario",
        "tb_cbs.estoque_localizacoes",
        "tb_cbs.estoque_andares",
        "tb_cbs.estoque_saidas",
      ].map(loadRows),
    );
  const categoryContexts = buildCbsStockCategoryContexts({
    rows: categories,
    departmentRows: departments,
  });
  const { rows: stockRows, contexts: stockRuleContexts } = await stockContexts();
  const entryContexts = buildCbsStockEntryContexts({
    rows: entries,
    stockRows: stocks,
    stockContexts: stockRuleContexts,
    userRows: users,
  });
  const locationContexts = buildCbsStockLocationContexts({
    rows: locations,
    floorRows: floors,
    departmentRows: departments,
  });
  const exitContexts = buildCbsStockExitContexts({
    rows: exits,
    stockRows: stocks,
    stockContexts: stockRuleContexts,
    userRows: users,
  });
  const socialRows = await loadRows("tb_mkt.redes_sociais");
  const pecRows = await loadRows("tb_pec.notas");
  const triageRows = await loadRows("tb_triagem.campos");
  const workspaceCategories = await loadRows("tb_workspace.solicitacoes_categorias");
  const workspaceRequests = await loadRows("tb_workspace.solicitacoes");
  const workspaceMessages = await loadRows("tb_workspace.solicitacoes_mensagens");
  const clientResolver = await auditedClientResolver();
  const socialContexts = buildMarketingSocialContexts({ rows: socialRows, clientResolver });
  const pecContexts = buildPecNoteContexts({ rows: pecRows, userRows: users, clientResolver });
  const triageContexts = buildTriageClientSlotContexts({ rows: triageRows, clientResolver });
  const workspaceCategoryContexts = buildWorkspaceCategoryContexts({
    rows: workspaceCategories,
    departmentRows: departments,
  });
  const workspaceRequestContexts = buildWorkspaceRequestContexts({
    rows: workspaceRequests,
    userRows: users,
    departmentRows: departments,
    categoryRows: workspaceCategories,
    categoryContexts: workspaceCategoryContexts,
  });
  const workspaceMessageContexts = buildWorkspaceMessageContexts({
    rows: workspaceMessages,
    requestRows: workspaceRequests,
    requestContexts: workspaceRequestContexts,
    userRows: users,
  });
  const emailRows = await loadRows("tb_cbc.emails");
  const passwordRows = await loadRows("tb_mkt.senhas");
  const passwordContexts = buildMarketingPasswordContexts({
    rows: passwordRows,
    encryptionConfigured: true,
  });

  const cases = [
    ["tb_cbc.emails", emailRows, emailRows.map(() => ({})), { prepared: 22 }],
    ["tb_cbs.estoque", stockRows, stockRuleContexts, { prepared: 21, quarantine: 412 }],
    ["tb_cbs.estoque_categorias", categories, categoryContexts, { prepared: 28, quarantine: 37 }],
    ["tb_cbs.estoque_entradas", entries, entryContexts, { prepared: 7, quarantine: 2208 }],
    ["tb_cbs.estoque_inventario", inventory, inventory.map(() => ({})), { prepared: 26 }],
    ["tb_cbs.estoque_localizacoes", locations, locationContexts, { prepared: 2, quarantine: 25 }],
    ["tb_cbs.estoque_saidas", exits, exitContexts, { prepared: 7, quarantine: 2993 }],
    [
      "tb_mkt.redes_sociais",
      socialRows,
      socialContexts,
      { prepared: 203, not_emitted: 1, quarantine: 1 },
    ],
    ["tb_mkt.senhas", passwordRows, passwordContexts, { prepared: 52, quarantine: 2 }],
    ["tb_pec.notas", pecRows, pecContexts, { prepared: 41612, quarantine: 16 }],
    [
      "tb_triagem.campos",
      triageRows,
      triageContexts,
      { prepared: 243, quarantine: 309, not_emitted: 1 },
    ],
    [
      "tb_workspace.solicitacoes",
      workspaceRequests,
      workspaceRequestContexts,
      { prepared: 4, quarantine: 1 },
    ],
    [
      "tb_workspace.solicitacoes_categorias",
      workspaceCategories,
      workspaceCategoryContexts,
      { prepared: 1 },
    ],
    [
      "tb_workspace.solicitacoes_mensagens",
      workspaceMessages,
      workspaceMessageContexts,
      { quarantine: 2 },
    ],
  ];

  for (const [sourceTable, rows, contexts, expected] of cases) {
    const emissions = rows.map((row, index) => rule(sourceTable).emitRows(row, contexts[index])[0]);
    assert.deepEqual(summary(emissions), expected, sourceTable);
    assert.equal(
      emissions.every(
        ({ identityRef }) => typeof identityRef === "string" && identityRef.length > 0,
      ),
      true,
      sourceTable,
    );
  }
  assert.equal(
    REMAINING_RULES.find(({ sourceTable }) => sourceTable === "tb_cbs.ramais"),
    undefined,
    "ramais deve ser post-downgrade pending",
  );
});

test("cada regra declara os campos efetivamente emitidos pelo contrato atual", () => {
  const expectedFields = {
    "tb_cbc.emails": ["id", "email", "responsible", "new_client_sending", "task_stalled_sending"],
    "tb_cbs.estoque": [
      "id",
      "department_id",
      "name",
      "description",
      "status",
      "category_id",
      "quantity",
      "location_id",
    ],
    "tb_cbs.estoque_categorias": ["id", "name", "department_id"],
    "tb_cbs.estoque_entradas": ["id", "stock_id", "quantity", "entry_date", "entry_by_user_id"],
    "tb_cbs.estoque_inventario": ["id", "name", "tag", "active"],
    "tb_cbs.estoque_localizacoes": ["id", "name", "floor", "department_id"],
    "tb_cbs.estoque_saidas": [
      "id",
      "stock_id",
      "quantity",
      "exit_date",
      "destination",
      "requester_id",
      "approver_id",
      "operator_id",
    ],
    "tb_mkt.redes_sociais": ["id", "instagram"],
    "tb_mkt.senhas": ["id", "local", "user", "password", "notes"],
    "tb_pec.notas": [
      "id",
      "user_id",
      "number",
      "note",
      "created_at",
      "due_date",
      "completion_date",
      "status",
      "week_start_date",
      "week_end_date",
      "original_creation_date",
      "has_penalty",
      "is_urgent",
      "client_id",
      "is_internal",
    ],
    "tb_triagem.campos": ["id", "client_id", "active_items"],
    "tb_workspace.solicitacoes": [
      "id",
      "title",
      "description",
      "status",
      "requester_id",
      "assigned_to_id",
      "category_id",
      "urgency",
      "created_at",
      "updated_at",
    ],
    "tb_workspace.solicitacoes_categorias": ["id", "name", "active"],
    "tb_workspace.solicitacoes_mensagens": [
      "id",
      "request_id",
      "type",
      "sender_id",
      "created_at",
      "message",
    ],
  };

  for (const mappingRule of REMAINING_RULES) {
    const actual = [
      ...new Set(
        mappingRule.destinations[0].columns
          .filter(({ status }) => status === "mapped")
          .map(({ destinationColumn }) => destinationColumn),
      ),
    ];
    assert.deepEqual(actual, expectedFields[mappingRule.sourceTable], mappingRule.sourceTable);
  }
});
