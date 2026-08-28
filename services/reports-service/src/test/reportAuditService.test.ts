import { describe, expect, it, vi } from "vitest";

import { ReportAuditService } from "../services/reportAuditService.js";

describe("ReportAuditService", () => {
  it("registra falha de exportação como erro no auditor externo sem dados sensíveis", async () => {
    const recordAudit = vi.fn().mockResolvedValue(undefined);
    const store = {
      reportAuditEvent: {
        create: vi.fn().mockResolvedValue(undefined),
      },
    };
    const service = new ReportAuditService(store as never, recordAudit);

    await service.record({
      actor_id: "user-1",
      organization_id: "org-1",
      job_id: "job-1",
      report_model_version_id: "version-1",
      event_type: "report.export",
      occurred_at: new Date("2026-08-27T12:00:00.000Z"),
      format: "xlsx",
      result: "failure",
    });

    expect(recordAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        outcome: "error",
        action: "report.export",
        metadata: expect.objectContaining({
          format: "xlsx",
          result: "failure",
        }),
      }),
    );
    expect(recordAudit.mock.calls[0]?.[0]).not.toHaveProperty("query");
    expect(recordAudit.mock.calls[0]?.[0]).not.toHaveProperty("raw_values");
    expect(recordAudit.mock.calls[0]?.[0]).not.toHaveProperty("url");
  });
});
