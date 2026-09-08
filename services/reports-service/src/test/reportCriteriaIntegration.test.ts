import { createExpressErrorHandler } from "@workspace/shared";
import express from "express";
import "express-async-errors";
import request from "supertest";
import { afterEach, expect, it, vi } from "vitest";
import { createInternalReportingRouter } from "../../../project-service/src/routes/internalReporting.routes.js";
import { InternalReportingService } from "../../../project-service/src/services/internalReportingService.js";
import { ProjectAdapter } from "../integrations/projectAdapter.js";
import { reportDefinitionSchema } from "../schemas/reportDefinition.schemas.js";

afterEach(() => vi.unstubAllGlobals());

it("executes signed adapter criteria through the origin router in one consistent snapshot", async () => {
  const organizationId = "00000000-0000-4000-8000-000000000001";
  const records = Array.from({ length: 150 }, (_, index) => ({
    organization_id: organizationId,
    name: `Project ${index}`,
    porcentage: index,
    status: "Open",
  }));
  records.push({ organization_id: "foreign", name: "Foreign", porcentage: 999, status: "Open" });
  const transaction = vi.fn(async (read, options) => {
    expect(options.isolationLevel).toBe("RepeatableRead");
    const snapshot = structuredClone(records);
    return read({
      project: {
        findMany: async ({ where, skip = 0, take }) => {
          // Concurrent deletion changes live data, while subsequent pages retain the snapshot.
          records.shift();
          return snapshot
            .filter((row) => row.organization_id === where.organization_id)
            .slice(skip, skip + take);
        },
      },
    });
  });
  const origin = new InternalReportingService({ $transaction: transaction } as never);
  const env = new Proxy(
    {},
    {
      get: (_target, key) =>
        String(key).endsWith("Url")
          ? "http://origin.test"
          : key === "sourceTimeoutMs"
            ? 5000
            : "fixture-secret",
    },
  );
  const app = express();
  app.use(express.json());
  app.use("/internal", createInternalReportingRouter({ env, reportingService: origin } as never));
  app.use(
    createExpressErrorHandler({
      logger: { error: vi.fn() } as never,
      event: "test",
      fallbackMessage: "Erro",
    }),
  );
  vi.stubGlobal("fetch", async (_url, init) => {
    const response = await request(app)
      .post("/internal/reporting/extract")
      .set(init.headers)
      .send(JSON.parse(init.body));
    return {
      status: response.status,
      ok: response.status === 200,
      json: async () => response.body,
    };
  });
  const adapter = new ProjectAdapter(env as never);
  const definition = reportDefinitionSchema.parse({
    sources: ["integracao.projects"],
    columns: [{ source: "integracao.projects", field: "name", alias: "name" }],
    filters: [
      { source: "integracao.projects", field: "porcentage", operator: "gte", parameter: "minimum" },
    ],
    parameters: [{ name: "minimum", type: "number" }],
    group_by: [{ source: "integracao.projects", field: "status" }],
    aggregations: [
      { source: "integracao.projects", field: "porcentage", function: "sum", alias: "total" },
      { source: "integracao.projects", field: "name", function: "count", alias: "count" },
    ],
  });
  const rows = await adapter.preview({
    definition,
    organization_id: organizationId,
    limit: 1,
    parameter_values: { minimum: 100 },
  });
  expect(rows).toEqual([{ status: "Open", total: 6225, count: 50 }]);
  expect(transaction).toHaveBeenCalledTimes(1);
});
