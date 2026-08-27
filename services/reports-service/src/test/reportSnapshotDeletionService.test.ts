import { ServiceError } from "@workspace/shared";
import { describe, expect, it, vi } from "vitest";

import { ReportAuditService } from "../services/reportAuditService.js";
import { ReportLifecycleService } from "../services/reportLifecycleService.js";

describe("ReportLifecycleService.deleteSnapshot", () => {
  it("exclui somente o snapshot do departamento informado sem auditar a justificativa", async () => {
    const transaction = {
      reportJob: {
        findUnique: vi.fn().mockResolvedValue({
          id: "job-1",
          organization_id: "org-1",
          report_model_version_id: "version-1",
          status: "completed",
        }),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
      reportSnapshot: {
        findFirst: vi.fn().mockResolvedValue({ id: "snapshot-1", report_job_id: "job-1" }),
        findMany: vi.fn().mockResolvedValue([{ id: "snapshot-1" }]),
        deleteMany: vi.fn(),
      },
      reportSnapshotRow: { deleteMany: vi.fn() },
      reportModelVersion: {
        findFirst: vi.fn().mockResolvedValue({ report_model_id: "model-1" }),
        deleteMany: vi.fn(),
      },
      reportModel: {
        findFirst: vi
          .fn()
          .mockResolvedValueOnce({ id: "model-1", department_id: "department-1" })
          .mockResolvedValueOnce(null),
        delete: vi.fn(),
      },
      reportAuditEvent: { create: vi.fn() },
    };
    const prisma = {
      $transaction: vi.fn(async (callback: (client: typeof transaction) => Promise<unknown>) =>
        callback(transaction),
      ),
    };
    const audit = new ReportAuditService(prisma as never, vi.fn());
    const service = new ReportLifecycleService(
      prisma as never,
      audit,
      () => new Date("2026-08-26"),
    );

    await service.deleteSnapshot({
      snapshot_id: "snapshot-1",
      organization_id: "org-1",
      actor_id: "admin-1",
      department_id: "department-1",
      reason: "requested",
      justification: "Solicitação formal com fundamento.",
    });

    expect(transaction.reportSnapshotRow.deleteMany).toHaveBeenCalledWith({
      where: { snapshot_id: { in: ["snapshot-1"] } },
    });
    expect(transaction.reportAuditEvent.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        payload_json: expect.objectContaining({ justification_provided: true }),
      }),
    });
    expect(
      transaction.reportAuditEvent.create.mock.calls[0]?.[0].data.payload_json,
    ).not.toHaveProperty("justification");
  });

  it("impede Admin 3 de outro departamento de excluir o snapshot", async () => {
    const transaction = {
      reportJob: {
        findUnique: vi.fn().mockResolvedValue({
          id: "job-1",
          organization_id: "org-1",
          report_model_version_id: "version-1",
          status: "completed",
        }),
        updateMany: vi.fn(),
      },
      reportSnapshot: {
        findFirst: vi.fn().mockResolvedValue({ id: "snapshot-1", report_job_id: "job-1" }),
        findMany: vi.fn(),
        deleteMany: vi.fn(),
      },
      reportSnapshotRow: { deleteMany: vi.fn() },
      reportModelVersion: { findFirst: vi.fn().mockResolvedValue({ report_model_id: "model-1" }) },
      reportModel: {
        findFirst: vi.fn().mockResolvedValue({ id: "model-1", department_id: "other-department" }),
        delete: vi.fn(),
      },
      reportAuditEvent: { create: vi.fn() },
    };
    const prisma = {
      $transaction: vi.fn(async (callback: (client: typeof transaction) => Promise<unknown>) =>
        callback(transaction),
      ),
    };
    const service = new ReportLifecycleService(
      prisma as never,
      new ReportAuditService(prisma as never, vi.fn()),
    );

    await expect(
      service.deleteSnapshot({
        snapshot_id: "snapshot-1",
        organization_id: "org-1",
        actor_id: "admin-1",
        department_id: "department-1",
        reason: "requested",
        justification: "Solicitação formal com fundamento.",
      }),
    ).rejects.toMatchObject(
      new ServiceError(403, "O snapshot não pertence ao departamento atual."),
    );
    expect(transaction.reportJob.updateMany).not.toHaveBeenCalled();
  });
});
