import { describe, expect, it, vi } from "vitest";

import { ReportRetentionService } from "../services/reportRetentionService.js";

describe("ReportRetentionService", () => {
  it("usa a política organizacional mais recente ou o default", async () => {
    const reportRetentionPolicy = {
      findFirst: vi.fn().mockResolvedValue(null),
    };
    const service = new ReportRetentionService(
      { reportRetentionPolicy } as never,
      { recordRetentionChangeLocal: vi.fn() } as never,
    );

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
    const transaction = { reportRetentionPolicy };
    const prisma = {
      $transaction: vi.fn(async (callback: (client: typeof transaction) => Promise<unknown>) =>
        callback(transaction),
      ),
    };
    const service = new ReportRetentionService(
      prisma as never,
      { recordRetentionChangeLocal: vi.fn() } as never,
    );

    await expect(
      service.updateOrganizationPolicy({
        organizationId: "org-1",
        retentionDays: 45,
        actorId: "owner-1",
      }),
    ).resolves.toEqual({ retention_days: 45 });

    expect(prisma.$transaction).toHaveBeenCalledOnce();
    expect(reportRetentionPolicy.findFirst).toHaveBeenCalledWith({
      where: { organization_id: "org-1", report_model_id: null },
      orderBy: { updated_at: "desc" },
    });
    expect(reportRetentionPolicy.create).toHaveBeenCalledWith({
      data: { organization_id: "org-1", report_model_id: null, retention_days: 45 },
    });
  });

  it("não confirma a retenção quando a auditoria local falha", async () => {
    const transaction = {
      reportRetentionPolicy: {
        findFirst: vi.fn().mockResolvedValue(null),
        create: vi.fn().mockResolvedValue({ retention_days: 45 }),
      },
    };
    const prisma = {
      $transaction: vi.fn(async (callback: (client: typeof transaction) => Promise<unknown>) =>
        callback(transaction),
      ),
    };
    const recordRetentionChangeLocal = vi.fn().mockRejectedValue(new Error("audit unavailable"));
    const service = new ReportRetentionService(
      prisma as never,
      { recordRetentionChangeLocal } as never,
    );

    await expect(
      service.updateOrganizationPolicy({
        organizationId: "org-1",
        retentionDays: 45,
        actorId: "owner-1",
      }),
    ).rejects.toThrow("audit unavailable");

    expect(prisma.$transaction).toHaveBeenCalledOnce();
    expect(recordRetentionChangeLocal).toHaveBeenCalledWith(
      transaction,
      expect.objectContaining({
        actor_id: "owner-1",
        organization_id: "org-1",
        previous_retention_days: 30,
        next_retention_days: 45,
      }),
    );
  });
});
