import { ServiceError } from "@workspace/shared";
import { describe, expect, it, vi } from "vitest";

import { ReportAuditService } from "../services/reportAuditService.js";
import { ReportLifecycleService } from "../services/reportLifecycleService.js";

const now = new Date("2026-08-24T12:00:00.000Z");

function createPersistence(status = "processing") {
  const transaction = {
    reportJob: {
      update: vi.fn(),
    },
    reportSnapshot: {
      create: vi.fn(async () => ({ id: "snapshot-1" })),
    },
    reportSnapshotRow: {
      createMany: vi.fn(),
      deleteMany: vi.fn(),
    },
    reportAuditEvent: {
      create: vi.fn(),
    },
  };
  const prisma = {
    reportJob: {
      findUnique: vi.fn(async () => ({
        id: "job-1",
        organization_id: "org-1",
        report_model_version_id: "model-version-1",
        status,
      })),
    },
    $transaction: vi.fn(async (callback: (client: typeof transaction) => Promise<unknown>) =>
      callback(transaction),
    ),
  };

  return { prisma, transaction };
}

describe("ReportLifecycleService", () => {
  it("conclui o job e grava snapshot, linhas e auditoria local na mesma transação", async () => {
    const { prisma, transaction } = createPersistence();
    const recorder = vi.fn();
    const audit = new ReportAuditService(prisma as never, recorder);
    const service = new ReportLifecycleService(prisma as never, audit, () => now);

    await service.complete({
      job_id: "job-1",
      organization_id: "org-1",
      actor_id: "user-1",
      department_id: "department-1",
      rows: [{ balance: 42 }],
      counts: { rows: 1, bytes: 14 },
      raw_values: ["não pode auditar"],
      filters: { secret: "não pode auditar" },
      upstream_url: "https://upstream.invalid/private",
    } as never);

    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(transaction.reportJob.update).toHaveBeenCalledWith({
      where: { id: "job-1" },
      data: { status: "completed", finished_at: now },
    });
    expect(transaction.reportSnapshot.create).toHaveBeenCalledWith({
      data: {
        organization_id: "org-1",
        report_model_version_id: "model-version-1",
        report_job_id: "job-1",
      },
    });
    expect(transaction.reportSnapshotRow.createMany).toHaveBeenCalledWith({
      data: [
        {
          organization_id: "org-1",
          snapshot_id: "snapshot-1",
          row_number: 1,
          data_json: { balance: 42 },
        },
      ],
    });
    expect(transaction.reportAuditEvent.create).toHaveBeenCalledWith({
      data: {
        organization_id: "org-1",
        report_job_id: "job-1",
        actor_id: "user-1",
        event_type: "report.completed",
        payload_json: {
          department_id: "department-1",
          report_model_version_id: "model-version-1",
          event_type: "report.completed",
          occurred_at: now.toISOString(),
          counts: { rows: 1, bytes: 14 },
        },
      },
    });
    expect(recorder).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "report.completed",
        metadata: {
          department_id: "department-1",
          report_job_id: "job-1",
          report_model_version_id: "model-version-1",
          event_type: "report.completed",
          occurred_at: now.toISOString(),
          counts: { rows: 1, bytes: 14 },
        },
      }),
    );
    expect(recorder.mock.calls[0]?.[0]).not.toHaveProperty("raw_values");
    expect(recorder.mock.calls[0]?.[0].metadata).not.toHaveProperty("filters");
    expect(recorder.mock.calls[0]?.[0].metadata).not.toHaveProperty("upstream_url");
  });

  it("impede retorno de estado terminal para processing", async () => {
    const { prisma, transaction } = createPersistence("completed");
    const audit = new ReportAuditService(prisma as never, vi.fn());
    const service = new ReportLifecycleService(prisma as never, audit, () => now);

    await expect(
      service.transition({
        job_id: "job-1",
        organization_id: "org-1",
        actor_id: "user-1",
        status: "processing",
      }),
    ).rejects.toBeInstanceOf(ServiceError);

    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(transaction.reportJob.update).not.toHaveBeenCalled();
    expect(transaction.reportSnapshot.create).not.toHaveBeenCalled();
  });

  it.each(["cancelled", "failed"] as const)("não cria conteúdo ao marcar %s", async (status) => {
    const { prisma, transaction } = createPersistence("processing");
    const audit = new ReportAuditService(prisma as never, vi.fn());
    const service = new ReportLifecycleService(prisma as never, audit, () => now);

    await service.transition({
      job_id: "job-1",
      organization_id: "org-1",
      actor_id: "user-1",
      status,
    });

    expect(transaction.reportSnapshot.create).not.toHaveBeenCalled();
    expect(transaction.reportSnapshotRow.createMany).not.toHaveBeenCalled();
  });

  it("expira removendo só as linhas e registra a justificativa no tipo do evento", async () => {
    const { prisma, transaction } = createPersistence("completed");
    const audit = new ReportAuditService(prisma as never, vi.fn());
    const service = new ReportLifecycleService(prisma as never, audit, () => now);

    await service.expire({
      job_id: "job-1",
      organization_id: "org-1",
      actor_id: "user-1",
      reason: "retention",
    });

    expect(transaction.reportSnapshotRow.deleteMany).toHaveBeenCalledWith({
      where: { snapshot: { report_job_id: "job-1" } },
    });
    expect(transaction.reportSnapshot.create).not.toHaveBeenCalled();
    expect(transaction.reportAuditEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ event_type: "report.expired.retention" }),
      }),
    );
  });
});
