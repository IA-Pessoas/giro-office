import {
  createExpressErrorHandler,
  executeReportingQuery,
  FORWARDED_AUTH_ORGANIZATION_ID_HEADER,
  FORWARDED_AUTH_USER_ID_HEADER,
  ServiceError,
} from "@workspace/shared";
import express from "express";
import "express-async-errors";
import request from "supertest";
import { expect, it, vi } from "vitest";
import { SourceCatalogService } from "../catalog/sourceCatalogService.js";
import { reportCriteria } from "../integrations/reportCriteria.js";
import { createReportPreviewRouter } from "../routes/preview.routes.js";
import { ReportDefinitionService } from "../services/reportDefinitionService.js";
import { ReportPreviewService } from "../services/reportPreviewService.js";

const organizationId = "00000000-0000-4000-8000-000000000002";
function setup(parameters = false) {
  const preview = vi.fn(async ({ definition, parameter_values }) => [
    { name: parameter_values?.criterion_1 ?? definition.sources[0], secret: "never render" },
  ]);
  const catalog = new SourceCatalogService([
    {
      sources: ["projects", "clients"].map((key) => ({
        key: `test.${key}`,
        label: key === "projects" ? "Projetos" : "Clientes",
        module: "integracao",
        minimum_permission: 1,
        ...(parameters
          ? {
              parameters: [
                { key: "period", label: "Competência", type: "date" as const, required: true },
              ],
            }
          : {}),
        fields: [
          {
            key: "name",
            label: "Nome",
            value_type: "string" as const,
            filter_operators: ["eq" as const],
            aggregations: ["count" as const],
            sortable: true,
            groupable: true,
          },
          {
            key: "state",
            label: "Estado",
            value_type: "string" as const,
            filter_operators: ["eq" as const],
            aggregations: ["count" as const],
            sortable: true,
            groupable: true,
          },
        ],
      })),
      relations: [],
      isEnabled: () => true,
      preview,
    },
  ]);
  const app = express();
  app.use(express.json());
  app.use(
    createReportPreviewRouter({
      previewService: new ReportPreviewService(catalog, new ReportDefinitionService(catalog), 100),
      accessContextClient: {
        getAccessContext: async () => ({
          organization: { id: organizationId },
          modules: { integracao: 1 },
        }),
      },
    }),
  );
  app.use(createExpressErrorHandler({ logger: { error: vi.fn() } as never, event: "test" }));
  const post = (definition: unknown) =>
    request(app)
      .post("/preview")
      .set(FORWARDED_AUTH_ORGANIZATION_ID_HEADER, organizationId)
      .set(FORWARDED_AUTH_USER_ID_HEADER, "00000000-0000-4000-8000-000000000001")
      .send({ definition });
  return { post, preview };
}

it("returns independent, labeled blocks with each area's criteria and only requested values", async () => {
  const { post } = setup();
  const response = await post({
    version: 2,
    areas: [
      {
        source: "test.projects",
        fields: ["name"],
        filters: [{ field: "name", operator: "eq", value: "Projeto A" }],
      },
      { source: "test.clients", fields: ["name"] },
    ],
  }).expect(200);
  expect(response.body.data.blocks).toEqual([
    {
      source: "test.projects",
      label: "Projetos",
      rows: [{ name: "Projeto A" }],
      presentation: { columns: [{ key: "name", label: "Nome" }] },
      limit: 100,
      hasMore: false,
    },
    {
      source: "test.clients",
      label: "Clientes",
      rows: [{ name: "test.clients" }],
      presentation: { columns: [{ key: "name", label: "Nome" }] },
      limit: 100,
      hasMore: false,
    },
  ]);
});

it("requires typed catalog parameters in their own area", async () => {
  const { post, preview } = setup(true);
  await post({ version: 2, areas: [{ source: "test.projects", fields: ["name"] }] }).expect(400);
  await post({
    version: 2,
    areas: [{ source: "test.projects", fields: ["name"], parameterValues: { period: "invalid" } }],
  }).expect(400);
  expect(preview).not.toHaveBeenCalled();
  await post({
    version: 2,
    areas: [
      { source: "test.projects", fields: ["name"], parameterValues: { period: "2026-09-01" } },
    ],
  }).expect(200);
});

it("validates every area before extracting and rejects invalid criteria values", async () => {
  const { post, preview } = setup();
  await post({
    version: 2,
    areas: [
      { source: "test.projects", fields: ["name"] },
      { source: "test.clients", fields: ["secret"] },
    ],
  }).expect(403);
  expect(preview).not.toHaveBeenCalled();
  await post({
    version: 2,
    areas: [
      {
        source: "test.projects",
        fields: ["name"],
        filters: [{ field: "name", operator: "eq", value: [] }],
      },
    ],
  }).expect(400);
  expect(preview).not.toHaveBeenCalled();
});

it("forwards summaries and ordering per area and fails without partial blocks", async () => {
  const { post, preview } = setup();
  preview.mockResolvedValueOnce([{ name: "A", name_count: 12 }]);
  const result = await post({
    version: 2,
    areas: [
      {
        source: "test.projects",
        fields: ["name"],
        groupBy: ["name"],
        aggregations: [{ field: "name", function: "count" }],
        orderBy: [{ field: "name", direction: "desc" }],
      },
    ],
  }).expect(200);
  expect(result.body.data.blocks[0].presentation.columns).toEqual([
    { key: "name", label: "Nome" },
    { key: "name_count", label: "Contagem de Nome" },
  ]);
  expect(result.body.data.blocks[0].rows).toEqual([{ name: "A", name_count: 12 }]);
  preview
    .mockResolvedValueOnce([{ name: "A" }])
    .mockRejectedValueOnce(new ServiceError(422, "Capacidade excedida"));
  const failure = await post({
    version: 2,
    areas: [
      { source: "test.projects", fields: ["name"] },
      { source: "test.clients", fields: ["name"] },
    ],
  }).expect(422);
  expect(failure.body.data).toBeUndefined();
  expect(failure.body.success).toBe(false);
});

it("returns a grouped list with a hidden organizing dimension", async () => {
  const { post, preview } = setup();
  preview.mockResolvedValueOnce([
    { name: "Ana", state: "SP" },
    { name: "Bia", state: "SP" },
  ]);
  const response = await post({
    version: 3,
    areas: [
      {
        source: "test.projects",
        layout: "grouped_list",
        dimensions: ["state"],
        details: ["name"],
        measures: [],
        display: { columns: ["name"], groupHeadings: true },
      },
    ],
  }).expect(200);
  expect(response.body.data.blocks[0]).toMatchObject({
    layout: "grouped_list",
    dimensions: ["state"],
    presentation: { columns: [{ key: "name", label: "Nome" }] },
    rows: [
      { name: "Ana", state: "SP" },
      { name: "Bia", state: "SP" },
    ],
  });
  expect(preview).toHaveBeenCalledWith(expect.objectContaining({ limit: 101 }));
});

it("mantém a dimensão antes da ordem explícita de detalhes na lista agrupada", async () => {
  const { post, preview } = setup();
  await post({
    version: 3,
    areas: [
      {
        source: "test.projects",
        layout: "grouped_list",
        dimensions: ["state"],
        details: ["name"],
        measures: [],
        orderBy: [{ field: "name", direction: "desc" }],
        display: { columns: ["name"], groupHeadings: true },
      },
    ],
  }).expect(200);
  expect(preview).toHaveBeenCalledWith(
    expect.objectContaining({
      definition: expect.objectContaining({
        order_by: [
          { source: "test.projects", field: "state", direction: "asc" },
          { source: "test.projects", field: "name", direction: "desc" },
        ],
      }),
    }),
  );
});

it("keeps an authorized hidden count for ordering while projecting only the dimension", async () => {
  const { post, preview } = setup();
  preview.mockResolvedValueOnce([
    { name: "SP", total: 2 },
    { name: "RJ", total: 1 },
  ]);
  const response = await post({
    version: 3,
    areas: [
      {
        source: "test.projects",
        layout: "summary",
        dimensions: ["name"],
        details: [],
        measures: [{ key: "total", function: "count_rows" }],
        orderBy: [{ measure: "total", direction: "desc" }],
        display: { columns: ["name"] },
      },
    ],
  }).expect(200);
  expect(response.body.data.blocks[0]).toMatchObject({
    layout: "summary",
    presentation: { columns: [{ key: "name", label: "Nome" }] },
    rows: [
      { name: "SP", total: 2 },
      { name: "RJ", total: 1 },
    ],
  });
  expect(preview).toHaveBeenCalledWith(expect.objectContaining({ limit: 101 }));
});

it("counts filtered source records before the preview limit, including null names", async () => {
  const source = {
    key: "integracao.clients",
    label: "Empresas",
    module: "integracao",
    minimum_permission: 1,
    fields: [
      {
        key: "state",
        label: "Estado",
        value_type: "string" as const,
        filter_operators: ["eq" as const],
        aggregations: [],
        sortable: true,
        groupable: true,
      },
      {
        key: "name",
        label: "Nome",
        value_type: "string" as const,
        filter_operators: ["eq" as const],
        aggregations: ["count" as const],
      },
    ],
  };
  const records = [
    { state: "SP", name: "Ana" },
    { state: "SP", name: null },
    { state: "RJ", name: "Bia" },
  ];
  const catalog = new SourceCatalogService([
    {
      sources: [source],
      relations: [],
      isEnabled: () => true,
      preview: ({ definition, limit }) => {
        const typed = definition as Parameters<typeof reportCriteria>[0];
        return executeReportingQuery(
          {
            source: source.key,
            fields: typed.columns.map((column) => column.field),
            limit,
            query: reportCriteria(typed).query ?? {},
          },
          async () => ({ rows: records, reachedLimit: false }),
        );
      },
    },
  ]);
  const app = express();
  app.use(express.json());
  app.use(
    createReportPreviewRouter({
      previewService: new ReportPreviewService(catalog, new ReportDefinitionService(catalog), 1),
      accessContextClient: {
        getAccessContext: async () => ({
          organization: { id: organizationId },
          modules: { integracao: 1 },
        }),
      },
    }),
  );
  app.use(createExpressErrorHandler({ logger: { error: vi.fn() } as never, event: "test" }));
  const response = await request(app)
    .post("/preview")
    .set(FORWARDED_AUTH_ORGANIZATION_ID_HEADER, organizationId)
    .set(FORWARDED_AUTH_USER_ID_HEADER, "00000000-0000-4000-8000-000000000001")
    .send({
      definition: {
        version: 3,
        areas: [
          {
            source: source.key,
            layout: "summary",
            dimensions: ["state"],
            details: [],
            measures: [{ key: "total", function: "count_rows" }],
            orderBy: [{ measure: "total", direction: "desc" }],
            display: { columns: ["state"] },
          },
        ],
      },
    })
    .expect(200);
  expect(response.body.data.blocks[0]).toMatchObject({
    rows: [{ state: "SP", total: 2 }],
    hasMore: true,
  });
});

it("mantém grupos nulos ao final nas duas direções de ordenação", async () => {
  const records = [{ name: null }, { name: "A" }, { name: "B" }];
  for (const direction of ["asc", "desc"] as const) {
    const result = await executeReportingQuery(
      {
        source: "integracao.clients",
        fields: ["name"],
        limit: 10,
        query: {
          group_by: ["name"],
          aggregations: [{ field: "name", function: "count_rows", alias: "total" }],
          order_by: [{ field: "name", direction }],
        },
      },
      async () => ({ rows: records, reachedLimit: false }),
    );
    expect(result.rows.map((row) => row.name)).toEqual(
      direction === "asc" ? ["A", "B", null] : ["B", "A", null],
    );
  }
});
