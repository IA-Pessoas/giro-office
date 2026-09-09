import {
  createExpressErrorHandler,
  FORWARDED_AUTH_ORGANIZATION_ID_HEADER,
  FORWARDED_AUTH_USER_ID_HEADER,
  ServiceError,
} from "@workspace/shared";
import express from "express";
import "express-async-errors";
import request from "supertest";
import { expect, it, vi } from "vitest";
import { SourceCatalogService } from "../catalog/sourceCatalogService.js";
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
