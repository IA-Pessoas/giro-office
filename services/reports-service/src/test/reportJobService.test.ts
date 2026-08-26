import { describe, expect, it, vi } from "vitest";

import { ReportJobService } from "../services/reportJobService.js";

const organizationId = "00000000-0000-4000-8000-000000000002";
const userId = "00000000-0000-4000-8000-000000000001";
const modelVersionId = "00000000-0000-4000-8000-000000000003";

describe("ReportJobService", () => {
  it("cria job queued ligado à versão e ao solicitante", async () => {
    const reportJob = { create: vi.fn().mockResolvedValue({ id: "job-1", status: "queued" }) };
    const service = new ReportJobService({ reportJob } as never);

    await expect(
      service.create({ organizationId, userId, modelVersionId, payload: { format: "json" } }),
    ).resolves.toEqual({ id: "job-1", status: "queued" });

    expect(reportJob.create).toHaveBeenCalledWith({
      data: {
        organization_id: organizationId,
        requester_id: userId,
        report_model_version_id: modelVersionId,
        status: "queued",
        payload_json: { format: "json" },
      },
    });
  });

  it("captura a política específica do modelo antes da execução", async () => {
    const reportRetentionPolicy = {
      findFirst: vi.fn().mockResolvedValueOnce({ retention_days: 14 }),
    };
    const service = new ReportJobService({ reportRetentionPolicy } as never);

    await expect(service.getRetentionDays({ organizationId, modelId: "model-1" })).resolves.toBe(
      14,
    );
    expect(reportRetentionPolicy.findFirst).toHaveBeenCalledWith({
      where: { organization_id: organizationId, report_model_id: "model-1" },
      orderBy: { updated_at: "desc" },
    });
  });
});
