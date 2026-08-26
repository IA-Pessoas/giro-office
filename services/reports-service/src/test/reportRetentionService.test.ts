import { describe, expect, it, vi } from "vitest";

import { ReportRetentionService } from "../services/reportRetentionService.js";

describe("ReportRetentionService", () => {
  it("usa a política organizacional mais recente ou o default", async () => {
    const reportRetentionPolicy = {
      findFirst: vi.fn().mockResolvedValue(null),
    };
    const service = new ReportRetentionService({ reportRetentionPolicy } as never);

    await expect(service.getOrganizationPolicy({ organizationId: "org-1" })).resolves.toEqual({
      retention_days: 30,
    });
    expect(reportRetentionPolicy.findFirst).toHaveBeenCalledWith({
      where: { organization_id: "org-1", report_model_id: null },
      orderBy: { updated_at: "desc" },
    });
  });

  it("altera somente a política organizacional para futuras execuções do owner", async () => {
    const reportRetentionPolicy = {
      findFirst: vi.fn().mockResolvedValue(null),
      create: vi.fn().mockResolvedValue({ retention_days: 45 }),
    };
    const service = new ReportRetentionService({ reportRetentionPolicy } as never);

    await expect(
      service.updateOrganizationPolicy({
        organizationId: "org-1",
        retentionDays: 45,
      }),
    ).resolves.toEqual({ retention_days: 45 });

    expect(reportRetentionPolicy.findFirst).toHaveBeenCalledWith({
      where: { organization_id: "org-1", report_model_id: null },
      orderBy: { updated_at: "desc" },
    });
    expect(reportRetentionPolicy.create).toHaveBeenCalledWith({
      data: { organization_id: "org-1", report_model_id: null, retention_days: 45 },
    });
  });
});
