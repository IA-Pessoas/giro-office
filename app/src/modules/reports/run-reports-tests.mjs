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
  reportJobPollInterval,
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
const { buildReportComposition, buildReportCompositionV3 } = await import("./utils/reportCriteria.ts");
const { getPessoalReportPresets } = await import("./utils/pessoalReportPresets.ts");
const { getTaskDepartmentReportPreset } = await import("./utils/taskDepartmentReportPreset.ts");
const { unwrapReportCompositionPreview } = await import("./services/reportsService.contract.ts");
const { getReportAuthorLabel, getReportForbiddenMessage, isReportCsrfError } = await import(
  "./components/reportUi.ts"
);
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

runTest("rejects fields that disappeared from the authorized catalog", () => {
  const source = {
    key: "test.items",
    label: "Itens",
    module: "test",
    fields: [{ key: "amount", label: "Valor", type: "number", selectable: true }],
  };

  assert.throws(
    () => buildReportComposition([{ source: source.key, fields: ["removed_field"] }], [source]),
    /não está mais disponível/,
  );
});

runTest("builds grouped summaries with hidden authorized dimensions and row counts", () => {
  const source = {
    key: "test.items", label: "Itens", module: "test",
    fields: [
      { key: "status", label: "Situação", type: "string", selectable: true, groupable: true },
      { key: "amount", label: "Valor", type: "number", selectable: true, aggregatable: true, aggregationFunctions: ["sum"] },
    ],
  };
  const result = buildReportCompositionV3([{ source: source.key, fields: ["status", "amount"],
    relationship: { layout: "summary", dimensions: ["status"],
      measures: [{ key: "report_total", function: "count_rows" }, { key: "report_sum", function: "sum", field: "amount" }],
      visibleColumns: ["report_total", "report_sum"], order: { key: "report_total", direction: "desc" } } }], [source]);
  assert.equal(result.version, 3);
  assert.deepEqual(result.areas[0].display.columns, ["report_total", "report_sum"]);
  assert.deepEqual(result.areas[0].orderBy, [{ measure: "report_total", direction: "desc" }]);
});

runTest("removes v3 measures when their source field is no longer selected", () => {
  const source = { key: "test.items", label: "Itens", module: "test", fields: [
    { key: "status", label: "Situação", type: "string", selectable: true, groupable: true },
    { key: "amount", label: "Valor", type: "number", selectable: true, aggregatable: true, aggregationFunctions: ["sum"] },
  ] };
  const result = buildReportCompositionV3([{ source: source.key, fields: ["status"], relationship: {
    layout: "summary", dimensions: ["status"],
    measures: [{ key: "report_total", function: "count_rows" }, { key: "report_sum", function: "sum", field: "amount" }],
    visibleColumns: ["status", "report_sum"], order: { key: "report_sum", direction: "desc" },
  } }], [source]);
  assert.deepEqual(result.areas[0].measures, [{ key: "report_total", function: "count_rows" }]);
  assert.deepEqual(result.areas[0].display.columns, ["status"]);
  assert.equal(result.areas[0].orderBy, undefined);
});

runTest("keeps authorized letterhead options in the catalog contract", () => {
  const option = { id: "approved", label: "Timbrado aprovado", kind: "organization", sha256: "a".repeat(64) };
  const parsed = unwrapReportsCatalogEnvelope({ success: true, data: { items: [], letterheads: { personal: [option], shared: [] } } });
  assert.deepEqual(parsed.letterheads?.personal, [option]);
});

runTest("omits summary aggregations for fields that are not selected", () => {
  const source = {
    key: "integracao.clients",
    label: "Clientes",
    module: "integracao",
    fields: [
      {
        key: "name",
        label: "Nome",
        type: "string",
        selectable: true,
        aggregatable: true,
        aggregationFunctions: ["count"],
      },
      {
        key: "state",
        label: "Estado",
        type: "string",
        selectable: true,
        aggregatable: true,
        aggregationFunctions: ["count"],
      },
    ],
  };
  const definition = buildReportComposition(
    [
      {
        source: source.key,
        fields: ["name"],
        aggregations: [
          { field: "name", function: "count" },
          { field: "state", function: "count" },
        ],
      },
    ],
    [source],
  );

  assert.deepEqual(definition.areas[0].aggregations, [{ field: "name", function: "count" }]);
});

runTest("distinguishes a CSRF failure from a report authorization denial", () => {
  const csrfError = {
    response: {
      status: 403,
      data: { success: false, error: "Requisição não autorizada.", code: "FORBIDDEN" },
    },
  };
  const authorizationError = {
    response: { status: 403, data: { success: false, error: "Acesso negado.", code: "FORBIDDEN" } },
  };

  assert.equal(isReportCsrfError(csrfError), true);
  assert.equal(
    getReportForbiddenMessage(csrfError, "Seu acesso mudou."),
    "Sua sessão de segurança expirou. Faça login novamente.",
  );
  assert.equal(isReportCsrfError(authorizationError), false);
  assert.equal(getReportForbiddenMessage(authorizationError, "Seu acesso mudou."), "Seu acesso mudou.");
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

runTest("offers Pessoal presets only when their authorized sources and fields are available", () => {
  const sources = [
    {
      key: "pessoal.payroll",
      label: "Folha",
      module: "pessoal",
      fields: [
        "client_code",
        "client_name",
        "client_document",
        "client_status",
        "responsible_name",
        "union_name",
        "group_name",
        "group_state",
        "previous",
        "info",
        "contact",
        "advance",
        "advance_type",
        "advance_amount",
        "onvio",
        "vt",
        "vt_value",
        "vt_type",
        "va",
        "assistance_fee",
        "bem_mais",
        "bsf",
        "reinf",
        "employees",
      ].map((key) => ({ key, label: key, selectable: true })),
    },
    {
      key: "pessoal.situations",
      label: "Situações",
      module: "pessoal",
      fields: ["status", "title", "registration_date", "completion_date"].map((key) => ({
        key,
        label: key,
        selectable: true,
      })),
    },
    {
      key: "pessoal.obligations",
      label: "Obrigações",
      module: "pessoal",
      fields: [
        "competence",
        "client_name",
        "responsible_name",
        "group_snapshot_name",
        "group_snapshot_policy",
        "group_snapshot_state",
        "advance",
        "payroll",
        "charges",
        "assistance_fee",
        "bem_mais",
        "bsf",
        "va",
        "vt",
      ].map((key) => ({ key, label: key, selectable: true })),
    },
  ];

  const presets = getPessoalReportPresets(sources);
  assert.deepEqual(
    presets.map((preset) => preset.id),
    ["pessoal-ficha-completa", "pessoal-campos-status", "pessoal-obrigacoes-competencia"],
  );
  assert.deepEqual(
    presets[2].areas[0].filters,
    [{ field: "competence", operator: "eq", value: "" }],
  );
  assert.equal(getPessoalReportPresets(sources.slice(0, 2)).length, 2);
  for (const field of ["client_code", "client_document", "client_status", "previous", "info", "contact"]) {
    assert.ok(presets[0].areas[0].fields.includes(field), field);
  }
});

runTest("offers a task count by current department only for an authorized report source", () => {
  const source = {
    key: "integracao.tasks",
    label: "Tarefas de Integração",
    module: "integracao",
    fields: [{
      key: "department", label: "Departamento", type: "string", selectable: true,
      groupable: true, aggregationFunctions: ["count"],
    }],
  };
  const preset = getTaskDepartmentReportPreset([source]);
  assert.equal(preset?.label, "Quantidade de tarefas por departamento");
  assert.deepEqual(buildReportComposition(preset.areas, [source]), {
    version: 2,
    areas: [{
      source: "integracao.tasks",
      fields: ["department"],
      groupBy: ["department"],
      aggregations: [{ field: "department", function: "count" }],
      filters: [],
    }],
  });
  assert.equal(getTaskDepartmentReportPreset([]), null);
  assert.equal(getTaskDepartmentReportPreset([{ ...source, fields: [] }]), null);
  assert.equal(getTaskDepartmentReportPreset([{ ...source, fields: [{ ...source.fields[0], selectable: undefined }] }]), null);
  assert.equal(getTaskDepartmentReportPreset([{ ...source, fields: [{ ...source.fields[0], groupable: false }] }]), null);
  assert.equal(getTaskDepartmentReportPreset([{
    ...source,
    fields: [{
      ...source.fields[0], groupable: undefined, aggregationFunctions: undefined,
      capabilities: { groupable: true, aggregationFunctions: ["count"] },
    }],
  }])?.id, "integracao-tarefas-por-departamento");
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

runTest("separa modelos pessoais do acervo compartilhado sem departamento", () => {
  assert.match(reportsModelsSource, /useModuleAccessMap/);
  assert.match(reportsModelsSource, /useSharedReportModels\(Boolean\(departmentModule\)\)/);
  assert.match(reportsModelsSource, /personalQuery\.isError/);
  assert.match(reportsModelsSource, /sharedQuery\.isError/);
  assert.doesNotMatch(reportsModelsSource, /personalQuery\.isError \|\| sharedQuery\.isError/);
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

runTest("polls an active report job with capped backoff and stops on terminal states", () => {
  assert.equal(reportJobPollInterval("queued", 0), 1000);
  assert.equal(reportJobPollInterval("processing", 1), 1500);
  assert.equal(reportJobPollInterval("processing", 3), 3375);
  assert.equal(reportJobPollInterval("processing", 20), 4000);
  for (const status of ["completed", "failed", "cancelled", "expired", "deleted", undefined]) {
    assert.equal(reportJobPollInterval(status, 0), false);
  }
});

const reportHooks = await readFile(new URL("./hooks/useReports.ts", import.meta.url), "utf8");
runTest("report job keeps polling while the tab is hidden", () => {
  const hooks = reportHooks;
  assert.match(hooks, /reportJobPollInterval\(query\.state\.data\?\.status, query\.state\.dataUpdateCount\)/);
  assert.match(hooks, /refetchIntervalInBackground: true/);
});

runTest("history shows a readable author instead of the requester UUID", () => {
  const names = new Map([["user-2", "Ana"]]);
  const current = { id: "user-1", name: "Eu" };
  assert.equal(getReportAuthorLabel({ requester_id: "user-2" }, names, current), "Ana");
  assert.equal(getReportAuthorLabel({ requester_id: "user-1" }, names, current), "Eu");
  assert.equal(getReportAuthorLabel({ requester_id: "user-3", author_name: "Bia" }, names, current), "Bia");
  assert.equal(getReportAuthorLabel({ requester_id: "user-9" }, names, current), "Usuário não encontrado");
});

const historyPanelSource = await readFile(new URL("./components/ReportHistoryPanel.tsx", import.meta.url), "utf8");
const snapshotSource = await readFile(new URL("./components/ReportSnapshotTable.tsx", import.meta.url), "utf8");
runTest("history shows failure reasons and scrolls to the opened snapshot", () => {
  assert.match(historyPanelSource, /item\.status === "failed" && item\.error_message/);
  assert.match(snapshotSource, /scrollIntoView\(/);
});

runTest("current configuration can be saved as a personal model before generating", () => {
  assert.match(createPanelSource, /onClick=\{\(\) => setSaveDialogOpen\(true\)\}>\s*Salvar como modelo/);
  assert.match(createPanelSource, /builder\.areas\.every\(\(area\) => area\.source\.startsWith\("pessoal\."\)\)/);
});
