import {
  createExpressErrorHandler,
  FORWARDED_AUTH_ORGANIZATION_ID_HEADER,
  FORWARDED_AUTH_USER_ID_HEADER,
} from "@workspace/shared";
import express from "express";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";

import { createReportExportRouter } from "../routes/reportExport.routes.js";

describe("report export route regressions", () => {
  it("continua aceitando XLSX", async () => {
    const exportService = {
      export: vi.fn().mockResolvedValue({
        body: Buffer.from("xlsx"),
        contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        filename: "relatorio.xlsx",
      }),
    };
    const app = express();
    app.use("/reports", createReportExportRouter({ exportService: exportService as never }));
    app.use(createExpressErrorHandler({ logger: { error: vi.fn() } as never, event: "test" }));

    const response = await request(app)
      .get("/reports/snapshots/00000000-0000-4000-8000-000000000003/export?format=xlsx")
      .set(FORWARDED_AUTH_USER_ID_HEADER, "00000000-0000-4000-8000-000000000001")
      .set(FORWARDED_AUTH_ORGANIZATION_ID_HEADER, "00000000-0000-4000-8000-000000000002");

    expect(response.status).toBe(200);
    expect(response.headers["content-type"]).toContain(
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    );
    expect(exportService.export).toHaveBeenCalledWith(expect.objectContaining({ format: "xlsx" }));
  });
});
