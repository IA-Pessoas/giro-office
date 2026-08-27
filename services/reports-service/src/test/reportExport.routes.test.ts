import {
  createExpressErrorHandler,
  FORWARDED_AUTH_ORGANIZATION_ID_HEADER,
  FORWARDED_AUTH_USER_ID_HEADER,
} from "@workspace/shared";
import express from "express";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import "express-async-errors";

import { createReportExportRouter } from "../routes/reportExport.routes.js";

const organizationId = "00000000-0000-4000-8000-000000000002";
const userId = "00000000-0000-4000-8000-000000000001";
const snapshotId = "00000000-0000-4000-8000-000000000003";

describe("report export routes", () => {
  it("responde o arquivo CSV com content type e disposition próprios", async () => {
    const exportService = {
      export: vi.fn().mockResolvedValue({
        contentType: "text/csv; charset=utf-8",
        fileName: "report-job.csv",
        body: Buffer.from("Nome\r\nAna\r\n"),
      }),
    };
    const app = express();
    app.use("/reports", createReportExportRouter({ exportService: exportService as never }));
    app.use(createExpressErrorHandler({ logger: { error: vi.fn() } as never, event: "test" }));

    const response = await request(app)
      .get(`/reports/snapshots/${snapshotId}/export?format=csv`)
      .set(FORWARDED_AUTH_USER_ID_HEADER, userId)
      .set(FORWARDED_AUTH_ORGANIZATION_ID_HEADER, organizationId)
      .expect(200);

    expect(response.headers["content-type"]).toMatch(/^text\/csv; charset=utf-8/);
    expect(response.headers["content-disposition"]).toBe('attachment; filename="report-job.csv"');
    expect(response.headers["cache-control"]).toBe("no-store");
    expect(response.text).toBe("Nome\r\nAna\r\n");
    expect(exportService.export).toHaveBeenCalledWith({
      snapshotId,
      userId,
      organizationId,
      requestId: "reports-export",
      format: "csv",
    });
  });

  it("rejeita formato diferente de csv ou xlsx antes de chamar o serviço", async () => {
    const exportService = { export: vi.fn() };
    const app = express();
    app.use("/reports", createReportExportRouter({ exportService: exportService as never }));
    app.use(createExpressErrorHandler({ logger: { error: vi.fn() } as never, event: "test" }));

    await request(app)
      .get(`/reports/snapshots/${snapshotId}/export?format=pdf`)
      .set(FORWARDED_AUTH_USER_ID_HEADER, userId)
      .set(FORWARDED_AUTH_ORGANIZATION_ID_HEADER, organizationId)
      .expect(400);

    expect(exportService.export).not.toHaveBeenCalled();
  });

  it("rejeita requisição sem contexto de autenticação", async () => {
    const exportService = { export: vi.fn() };
    const app = express();
    app.use("/reports", createReportExportRouter({ exportService: exportService as never }));
    app.use(createExpressErrorHandler({ logger: { error: vi.fn() } as never, event: "test" }));

    await request(app).get(`/reports/snapshots/${snapshotId}/export?format=csv`).expect(401);

    expect(exportService.export).not.toHaveBeenCalled();
  });
});
