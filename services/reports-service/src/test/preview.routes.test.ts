import {
  createExpressErrorHandler,
  FORWARDED_AUTH_ORGANIZATION_ID_HEADER,
  FORWARDED_AUTH_USER_ID_HEADER,
} from "@workspace/shared";
import express from "express";
import "express-async-errors";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";

import { createReportPreviewRouter } from "../routes/preview.routes.js";

const organizationId = "00000000-0000-4000-8000-000000000002";
const userId = "00000000-0000-4000-8000-000000000001";
const definition = {
  sources: ["finance.ledger"],
  columns: [{ source: "finance.ledger", field: "balance", alias: "balance" }],
  joins: [],
  filters: [],
  filter_groups: [],
  parameters: [],
  aggregations: [],
  order_by: [],
};

function createApp() {
  const previewService = { preview: vi.fn().mockResolvedValue({ rows: [], hasMore: false }) };
  const accessContextClient = {
    getAccessContext: vi.fn().mockResolvedValue({
      organization: { id: organizationId },
      modules: { financeiro: 1 },
    }),
  };
  const app = express();
  app.use(express.json());
  app.use(
    createReportPreviewRouter({ previewService: previewService as never, accessContextClient }),
  );
  app.use(createExpressErrorHandler({ logger: { error: vi.fn() } as never, event: "test" }));
  return { app, previewService, accessContextClient };
}

function authenticated(requestBuilder: request.Test) {
  return requestBuilder
    .set(FORWARDED_AUTH_USER_ID_HEADER, userId)
    .set(FORWARDED_AUTH_ORGANIZATION_ID_HEADER, organizationId);
}

describe("report preview routes", () => {
  it("aceita somente definition e parameterValues opcionais", async () => {
    const { app, previewService } = createApp();

    await authenticated(request(app).post("/preview"))
      .send({ definition, parameterValues: { period: "2026-08" } })
      .expect(200);
    await authenticated(request(app).post("/preview")).send({ definition, page: 1 }).expect(400);

    expect(previewService.preview).toHaveBeenCalledTimes(1);
    expect(previewService.preview).toHaveBeenCalledWith(
      definition,
      expect.any(Object),
      "reports-preview",
      { period: "2026-08" },
    );
  });
});
