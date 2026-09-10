import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const {
  fetchReportsCatalog,
  fetchReportsPreview,
  REPORTS_ENDPOINTS,
  buildReportJobListParams,
  normalizeReportsError,
  normalizeReportsPreviewError,
  unwrapReportDownload,
  unwrapReportJobEnvelope,
  unwrapReportJobListEnvelope,
  unwrapReportsCatalogEnvelope,
  unwrapReportsEnvelope,
} = await import("./services/reportsService.contract.ts");
const {
  reportsCatalogQueryKey,
  reportsHistoryQueryKey,
  reportsModelsQueryKey,
  reportsPreviewQueryKey,
  reportsSnapshotQueryKey,
} = await import("./hooks/queryKeys.ts");
const {
  buildReportPreviewPayload,
  getSelectableReportFields,
  getReportFieldOperators,
  isReportFieldSelectable,
  normalizeReportBuilderState,
  sanitizeReportPreviewResult,
} = await import("./utils/reportBuilder.ts");
const appPackage = JSON.parse(await readFile(new URL("../../../package.json", import.meta.url)));
const { buildReportComposition } = await import("./utils/reportCriteria.ts");
const { unwrapReportCompositionPreview } = await import("./services/reportsService.contract.ts");
const reportsPageSource = await readFile(
  new URL("./components/ReportsCatalogPage.tsx", import.meta.url),
  "utf8",
);
const reportsCreateSource = await readFile(
  new URL("./components/ReportsCreatePanel.tsx", import.meta.url),
  "utf8",
);
const reportsModelsSource = await readFile(
  new URL("./components/ReportModelsPanel.tsx", import.meta.url),
  "utf8",
);
const snapshotTableSource = await readFile(
  new URL("./components/ReportSnapshotTable.tsx", import.meta.url),
  "utf8",
);
const createPanelSource = await readFile(
  new URL("./components/ReportsCreatePanel.tsx", import.meta.url),
  "utf8",
);
const resultBlocksSource = await readFile(
  new URL("./components/ReportResultBlocks.tsx", import.meta.url),
  "utf8",
);
const downloadActionsSource = await readFile(
  new URL("./components/ReportDownloadActions.tsx", import.meta.url),
  "utf8",
);

function runTest(name, callback) {
  try {
    callback();
    process.stdout.write(`PASS ${name}\n`);
  } catch (error) {
    process.stderr.write(`FAIL ${name}\n`);
    throw error;
  }
}

runTest("composes typed criteria and parameters independently without requiring preview", () => {
  const source = {
    key: "test.items",
    label: "Itens",
    module: "test",
    parameters: [{ key: "enabled", label: "Ativo", type: "boolean", required: true }],
    fields: [
      { key: "amount", label: "Valor", type: "number", operators: ["between"], selectable: true },
    ],
  };
  assert.throws(
    () => buildReportComposition([{ source: source.key, fields: ["amount"] }], [source]),
    /Preencha Ativo/,
  );
  const definition = buildReportComposition(
    [
      {
        source: source.key,
        fields: ["amount"],
        parameterValues: { enabled: "false" },
        filters: [{ field: "amount", operator: "between", value: "10;20" }],
      },
    ],
    [source],
  );
  assert.equal(definition.areas[0].parameterValues.enabled, false);
  assert.deepEqual(definition.areas[0].filters[0].value, [10, 20]);
  assert.throws(
    () =>
      buildReportComposition(
        [
          {
            ...definition.areas[0],
            filters: [{ field: "amount", operator: "between", value: "10;bad" }],
          },
        ],
        [source],
      ),
    /número válido/,
  );
});

runTest("preserves independent empty blocks and rejects malformed composed preview", () => {
  const block = {
    source: "test.items",
    label: "Itens",
    rows: [],
    presentation: { columns: [{ key: "name", label: "Nome" }] },
    limit: 100,
    hasMore: false,
  };
  const result = unwrapReportCompositionPreview({
    success: true,
    data: { blocks: [block, { ...block, source: "test.other", label: "Outros" }] },
  });
  assert.equal(result.blocks.length, 2);
  assert.deepEqual(result.blocks[0].rows, []);
  assert.throws(() => unwrapReportCompositionPreview({ blocks: [{ ...block, rows: "invalid" }] }));
});

runTest("unwraps the shared success envelope", () => {
  assert.deepEqual(unwrapReportsEnvelope({ success: true, data: { items: [] } }), { items: [] });
});

runTest("normalizes a durable job without exposing technical failures", () => {
  assert.deepEqual(
    unwrapReportJobEnvelope({
      success: true,
      data: { id: "job-1", status: "failed", error_message: "Tente novamente." },
    }),
    { id: "job-1", status: "failed", error_message: "Tente novamente." },
  );
  assert.throws(() => unwrapReportJobEnvelope({ success: true, data: { id: "job-1" } }));
});

runTest("preserves friendly department and area descriptions from the authorized catalog", () => {
  const catalog = unwrapReportsCatalogEnvelope({
    success: true,
    data: {
      items: [
        {
          key: "internal.projects",
          label: "Projetos",
          module: "internal",
          department_label: "Equipe de projetos",
          description: "Prazos e responsáveis dos projetos.",
          fields: [],
        },
      ],
    },
  });
  assert.equal(catalog.items[0].department_label, "Equipe de projetos");
  assert.equal(catalog.items[0].description, "Prazos e responsáveis dos projetos.");
});

runTest("rejects malformed catalog data", () => {
  assert.throws(
    () => unwrapReportsCatalogEnvelope({ success: true, data: { items: {} } }),
    (error) => {
      assert.deepEqual(error, { message: "Não foi possível carregar relatórios agora." });
      return true;
    },
  );
});

runTest("rejects an error envelope without exposing its message", () => {
  assert.throws(
    () => unwrapReportsEnvelope({ success: false, error: "upstream database is unavailable" }),
    (error) => {
      assert.deepEqual(error, { message: "Não foi possível carregar relatórios agora." });
      return true;
    },
  );
});

runTest("does not expose upstream error details", () => {
  const error = normalizeReportsError({
    response: {
      status: 502,
      data: { error: "postgres://user:secret@upstream.internal/reports" },
    },
  });

  assert.deepEqual(error, {
    message: "Não foi possível carregar relatórios agora.",
    status: 502,
  });
});

runTest("normalizes preview errors without exposing upstream details", () => {
  assert.deepEqual(
    normalizeReportsPreviewError({ response: { status: 422, data: { error: "secret" } } }),
    {
      message: "Não foi possível gerar a prévia agora.",
      status: 422,
    },
  );
});

await (async () => {
  let requestedPath;
  const catalog = await fetchReportsCatalog(async (path) => {
    requestedPath = path;
    return {
      data: {
        success: true,
        data: {
          items: [
            {
              key: "rh.requests",
              label: "Solicitações",
              module: "rh",
              fields: [
                {
                  key: "status",
                  label: "Status",
                  value_type: "string",
                  filter_operators: ["eq"],
                  aggregations: [],
                },
              ],
            },
          ],
        },
      },
    };
  });

  runTest("loads catalog from the public reports endpoint", () => {
    assert.equal(requestedPath, "/reports/catalog");
    assert.deepEqual(catalog, {
      items: [
        {
          key: "rh.requests",
          label: "Solicitações",
          module: "rh",
          fields: [
            {
              key: "status",
              label: "Status",
              type: "string",
              selectable: true,
              sensitive: false,
              filterable: true,
              sortable: false,
              groupable: false,
              aggregatable: false,
              operators: ["eq"],
              aggregationFunctions: [],
            },
          ],
        },
      ],
    });
  });
})();

await (async () => {
  let requestedPath;
  let requestedPayload;
  const result = await fetchReportsPreview(
    async (path, payload) => {
      requestedPath = path;
      requestedPayload = payload;
      return {
        data: {
          success: true,
          data: { rows: [], presentation: { columns: [] }, limit: 100, hasMore: false },
        },
      };
    },
    {
      definition: {
        sources: ["requests"],
        columns: [{ source: "requests", field: "status", alias: "status" }],
      },
    },
  );

  runTest("loads a valid empty preview from the preview endpoint", () => {
    assert.equal(requestedPath, "/reports/preview");
    assert.deepEqual(requestedPayload, {
      definition: {
        sources: ["requests"],
        columns: [{ source: "requests", field: "status", alias: "status" }],
      },
    });
    assert.deepEqual(result, { columns: [], rows: [], limit: 100, hasMore: false });
  });
})();

runTest("uses one stable catalog query key", () => {
  assert.deepEqual(reportsCatalogQueryKey(), ["reports", "catalog"]);
});

const descriptor = {
  key: "requests",
  label: "Solicitações",
  module: "rh",
  fields: [
    {
      key: "status",
      label: "Status",
      type: "string",
      selectable: true,
      filterable: true,
      sortable: true,
      groupable: true,
      operators: ["eq", "in"],
    },
    {
      key: "internal_note",
      label: "Nota interna",
      type: "string",
      selectable: false,
      filterable: true,
      operators: ["eq"],
    },
    {
      key: "amount",
      label: "Valor",
      type: "number",
      selectable: true,
      filterable: true,
      sortable: true,
      aggregatable: true,
      aggregationFunctions: ["sum", "count"],
      operators: ["gt"],
    },
    {
      key: "unmarked",
      label: "Sem publicação explícita",
      type: "string",
      operators: ["eq"],
    },
  ],
  relations: [
    {
      key: "department",
      label: "Departamento",
      targetSourceKey: "org.departments",
      joinTypes: ["inner"],
    },
  ],
  parameters: [{ key: "period", label: "Período", type: "text" }],
};

const builderState = {
  sourceKey: "requests",
  relation: { key: "department", joinType: "left" },
  fieldKeys: ["status", "internal_note", "unknown", "amount"],
  filterLogic: "and",
  filters: [
    { id: "one", fieldKey: "status", operator: "eq", value: "open" },
    { id: "two", fieldKey: "internal_note", operator: "eq", value: "secret" },
    { id: "three", fieldKey: "status", operator: "like", value: "open" },
  ],
  parameters: { period: "2026" },
  groupBy: ["status", "internal_note"],
  aggregations: [
    { fieldKey: "amount", function: "sum" },
    { fieldKey: "amount", function: "avg" },
  ],
  orderBy: [
    { fieldKey: "status", direction: "asc" },
    { fieldKey: "internal_note", direction: "desc" },
  ],
  limit: 250,
};

runTest("exposes only selectable catalog fields", () => {
  assert.deepEqual(
    getSelectableReportFields(descriptor).map((field) => field.key),
    ["status", "amount"],
  );
  assert.deepEqual(getReportFieldOperators(descriptor.fields[1]), []);
  assert.equal(isReportFieldSelectable(descriptor.fields[3]), false);
});

runTest("builds a governed preview payload from catalog capabilities", () => {
  assert.deepEqual(buildReportPreviewPayload(builderState, descriptor), {
    definition: {
      sources: ["requests", "org.departments"],
      columns: [
        { source: "requests", field: "status", alias: "status" },
        { source: "requests", field: "amount", alias: "amount" },
      ],
      joins: [{ relation: "department", type: "inner" }],
      filters: [
        { source: "requests", field: "status", operator: "eq", parameter: "filter_value_1" },
      ],
      filter_groups: [{ operator: "and", filters: ["filter_value_1"] }],
      parameters: [
        { name: "period", type: "string" },
        { name: "filter_value_1", type: "string" },
      ],
      aggregations: [{ source: "requests", field: "amount", function: "sum" }],
      order_by: [{ source: "requests", field: "status", direction: "asc" }],
    },
    parameterValues: { period: "2026", filter_value_1: "open" },
  });
});

runTest("keeps empty preview results valid and exposes the backend limit", () => {
  const payload = buildReportPreviewPayload(
    {
      ...builderState,
      fieldKeys: [],
      filters: [],
      groupBy: [],
      aggregations: [],
      orderBy: [],
      limit: 0,
    },
    descriptor,
  );
  assert.equal(payload, undefined);
});

runTest("normalizes builder state without leaking unknown catalog keys", () => {
  assert.deepEqual(normalizeReportBuilderState(builderState, descriptor).fieldKeys, [
    "status",
    "amount",
  ]);
});

runTest("uses one stable preview query key", () => {
  assert.deepEqual(reportsPreviewQueryKey("requests"), ["reports", "preview", "requests"]);
});

runTest("exposes the governed history, snapshot, and download contracts", () => {
  assert.equal(REPORTS_ENDPOINTS.models, "/reports/models/list");
  assert.equal(REPORTS_ENDPOINTS.sharedModels, "/reports/models/shared/list");
  assert.equal(REPORTS_ENDPOINTS.jobs, "/reports/jobs/list");
  assert.equal(REPORTS_ENDPOINTS.createJob, "/reports/jobs");
  assert.equal(REPORTS_ENDPOINTS.createModel, "/reports/models");
  assert.equal(REPORTS_ENDPOINTS.model("model-1"), "/reports/models/model-1");
  assert.equal(REPORTS_ENDPOINTS.sharedModel("model-1"), "/reports/models/shared/model-1");
  assert.equal(REPORTS_ENDPOINTS.snapshot("job-1"), "/reports/jobs/job-1/snapshot");
  assert.equal(REPORTS_ENDPOINTS.download("snapshot-1"), "/reports/snapshots/snapshot-1/export");
  assert.deepEqual(buildReportJobListParams({ scope: "personal", status: "", cursor: undefined }), {
    scope: "personal",
  });
  assert.deepEqual(reportsModelsQueryKey("personal"), ["reports", "models", "personal"]);
  assert.deepEqual(reportsHistoryQueryKey({ scope: "library", status: "completed" }), [
    "reports",
    "history",
    "library",
    "completed",
    "",
    "",
    "",
    "",
    null,
  ]);
  assert.deepEqual(reportsSnapshotQueryKey("snapshot-1", "library"), [
    "reports",
    "snapshot",
    "snapshot-1",
    "library",
    null,
  ]);
});

runTest("salva modelos somente depois do resultado e reabre com nomes amigáveis", () => {
  assert.match(reportsCreateSource, /Salvar para usar novamente/);
  assert.match(reportsCreateSource, /useCreateReportModelMutation/);
  assert.match(reportsCreateSource, /description/);
  assert.match(reportsCreateSource, /modelVersionId/);
  assert.match(reportsModelsSource, /Abrir modelo/);
  assert.match(reportsModelsSource, /getSharedModel|getModel/);
  assert.doesNotMatch(reportsModelsSource, /\{model\.(organization_id|department_id|version_id)\}/);
});

runTest("uses the materialized snapshot id for in-memory downloads", () => {
  assert.match(snapshotTableSource, /snapshotQuery\.data\?\.snapshot\.id/);
  assert.match(snapshotTableSource, /snapshotId \? <ReportDownloadActions id=\{snapshotId\}/);
  assert.match(downloadActionsSource, /URL\.createObjectURL\(result\.blob\)/);
  assert.match(downloadActionsSource, /URL\.revokeObjectURL\(objectUrl\)/);
});

runTest("renders export actions only after a completed snapshot is available", () => {
  assert.match(downloadActionsSource, /disabled=\{disabled \|\| downloadMutation\.isPending\}/);
  assert.match(downloadActionsSource, /aria-busy=\{downloadMutation\.isPending\}/);
  assert.match(downloadActionsSource, /role="status"/);
  assert.match(downloadActionsSource, /Baixar resultado em/);
  assert.match(snapshotTableSource, /snapshotId \? <ReportDownloadActions/);
});

runTest("keeps download actions available for legacy snapshots without blocks", () => {
  assert.match(createPanelSource, /Resultado legado carregado/);
  assert.match(createPanelSource, /snapshot\.data\.blocks/);
  assert.match(createPanelSource, /ReportDownloadActions id=\{snapshot\.data\.snapshot\.id\}/);
});

runTest("keeps repeated report sources distinct in the composed result", () => {
  assert.match(resultBlocksSource, /key=\{`\$\{block\.source\}-\$\{index\}`\}/);
});

runTest("keeps composed snapshots paginable in history", () => {
  assert.match(snapshotTableSource, /snapshotQuery\.data\?\.blocks[\s\S]*PaginationControls/);
});

runTest("keeps reports tabs module-scoped", () => {
  assert.match(reportsPageSource, /Criar/);
  assert.match(reportsPageSource, /Modelos/);
  assert.match(reportsPageSource, /Histórico pessoal/);
  assert.match(reportsPageSource, /Acervo/);
  assert.match(reportsPageSource, /useModuleAccessMap/);
  assert.doesNotMatch(reportsPageSource, /APP_ROUTE_MODULE_MAP/);
});

runTest("does not render preview columns outside the published catalog", () => {
  const safe = sanitizeReportPreviewResult(
    {
      columns: [
        { key: "status", label: "Status" },
        { key: "internal_note", label: "Nota interna" },
      ],
      rows: [{ status: "open", internal_note: "secret" }],
      limit: 100,
      hasMore: false,
    },
    descriptor,
  );
  assert.deepEqual(safe.columns, [{ key: "status", label: "Status" }]);
  assert.deepEqual(safe.rows, [{ status: "open" }]);
});

runTest("includes reports coverage in the app test suite", () => {
  assert.match(appPackage.scripts.test, /test:reports/);
});
