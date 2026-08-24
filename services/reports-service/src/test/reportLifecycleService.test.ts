import { readFile } from "node:fs/promises";
import { ServiceError } from "@workspace/shared";
import { describe, expect, it, vi } from "vitest";

import { reportJobStatusSchema } from "../schemas/reportJob.schemas.js";
import { MAX_SNAPSHOT_BYTES, MAX_SNAPSHOT_ROWS } from "../schemas/reportSnapshot.schemas.js";
import { REPORT_AUDIT_EVENT_TYPES, ReportAuditService } from "../services/reportAuditService.js";
import { ReportLifecycleService } from "../services/reportLifecycleService.js";

const now = new Date("2026-08-24T12:00:00.000Z");

function createPersistence(status = "processing") {
  const transaction = {
    reportJob: {
      findUnique: vi.fn(async () => ({
        id: "job-1",
        organization_id: "org-1",
        report_model_version_id: "model-version-1",
        status,
      })),
      updateMany: vi.fn(async () => ({ count: 1 })),
    },
    reportSnapshot: {
      create: vi.fn(async () => ({ id: "snapshot-1" })),
      findMany: vi.fn(async () => [{ id: "snapshot-1" }]),
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
    $transaction: vi.fn(async (callback: (client: typeof transaction) => Promise<unknown>) =>
      callback(transaction),
    ),
  };

  return { prisma, transaction };
}

describe("ReportLifecycleService", () => {
  it("define eventos seguros para modelo, job, abertura, exportação, retenção e exclusão", () => {
    expect(REPORT_AUDIT_EVENT_TYPES).toEqual(
      expect.arrayContaining([
        "report.model",
        "report.job",
        "report.open",
        "report.export",
        "report.retention",
        "report.delete",
      ]),
    );
  });

  it("aceita somente os estados nomeados do lifecycle nos contratos de job", () => {
    expect(reportJobStatusSchema.options).toEqual([
      "queued",
      "processing",
      "completed",
      "cancelled",
      "failed",
      "expired",
      "deleted",
    ]);
  });

  it("conclui o job e grava snapshot, linhas e auditoria local na mesma transação", async () => {
    const { prisma, transaction } = createPersistence();
    const recorder = vi.fn();
    const audit = new ReportAuditService(prisma as never, recorder);
    const service = new ReportLifecycleService(prisma as never, audit, () => now);

    await service.complete({
      job_id: "job-1",
      organization_id: "org-1",
      actor_id: "user-1",
      lease_token: "lease-b",
      department_id: "department-1",
      rows: [{ balance: 42 }],
      counts: { rows: 1, bytes: 14 },
      raw_values: ["não pode auditar"],
      filters: { secret: "não pode auditar" },
      upstream_url: "https://upstream.invalid/private",
    } as never);

    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(transaction.reportJob.updateMany).toHaveBeenCalledWith({
      where: { id: "job-1", status: "processing", lease_token: "lease-b" },
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
          counts: { rows: 1, bytes: 16 },
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
          counts: { rows: 1, bytes: 16 },
        },
      }),
    );
    expect(recorder.mock.calls[0]?.[0]).not.toHaveProperty("raw_values");
    expect(recorder.mock.calls[0]?.[0].metadata).not.toHaveProperty("filters");
    expect(recorder.mock.calls[0]?.[0].metadata).not.toHaveProperty("upstream_url");
  });

  it("deriva as contagens de auditoria do snapshot em vez da entrada", async () => {
    const { prisma, transaction } = createPersistence();
    const audit = new ReportAuditService(prisma as never, vi.fn());
    const service = new ReportLifecycleService(prisma as never, audit, () => now);

    await service.complete({
      job_id: "job-1",
      organization_id: "org-1",
      actor_id: "user-1",
      lease_token: "lease-b",
      rows: [{ balance: 42 }],
      counts: { rows: 999, bytes: 999, matched: 3 },
    });

    expect(transaction.reportAuditEvent.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        payload_json: expect.objectContaining({
          counts: { rows: 1, bytes: 16, matched: 3 },
        }),
      }),
    });
  });

  it.each([
    ["linhas", Array.from({ length: MAX_SNAPSHOT_ROWS + 1 }, () => ({ balance: 1 }))],
    ["bytes", [{ balance: "x".repeat(MAX_SNAPSHOT_BYTES) }]],
  ] as const)("rejeita snapshot acima do limite de %s antes de persistir", async (_limit, rows) => {
    const { prisma, transaction } = createPersistence();
    const audit = new ReportAuditService(prisma as never, vi.fn());
    const service = new ReportLifecycleService(prisma as never, audit, () => now);

    await expect(
      service.complete({
        job_id: "job-1",
        organization_id: "org-1",
        actor_id: "user-1",
        lease_token: "lease-b",
        rows,
      }),
    ).rejects.toBeInstanceOf(ServiceError);

    expect(transaction.reportJob.updateMany).not.toHaveBeenCalled();
    expect(transaction.reportSnapshot.create).not.toHaveBeenCalled();
    expect(transaction.reportSnapshotRow.createMany).not.toHaveBeenCalled();
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
    expect(transaction.reportJob.updateMany).not.toHaveBeenCalled();
    expect(transaction.reportSnapshot.create).not.toHaveBeenCalled();
  });

  it("persiste conteúdo para apenas uma entre duas conclusões concorrentes", async () => {
    const { prisma, transaction } = createPersistence();
    transaction.reportJob.updateMany
      .mockResolvedValueOnce({ count: 1 })
      .mockResolvedValueOnce({ count: 0 });
    const audit = new ReportAuditService(prisma as never, vi.fn());
    const service = new ReportLifecycleService(prisma as never, audit, () => now);
    const input = {
      job_id: "job-1",
      organization_id: "org-1",
      actor_id: "user-1",
      lease_token: "lease-b",
      rows: [{ balance: 42 }],
    };

    const [first, second] = await Promise.allSettled([
      service.complete(input),
      service.complete(input),
    ]);

    expect([first, second].filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect([first, second].filter((result) => result.status === "rejected")).toHaveLength(1);
    expect(transaction.reportSnapshot.create).toHaveBeenCalledTimes(1);
    expect(transaction.reportSnapshotRow.createMany).toHaveBeenCalledTimes(1);
  });

  it("impede worker com lease expirado de concluir após recaptura por outro worker", async () => {
    const { prisma, transaction } = createPersistence();
    transaction.reportJob.updateMany.mockImplementation(async ({ where }) => ({
      count: where.lease_token === "lease-b" ? 1 : 0,
    }));
    const audit = new ReportAuditService(prisma as never, vi.fn());
    const service = new ReportLifecycleService(prisma as never, audit, () => now);
    const baseInput = {
      job_id: "job-1",
      organization_id: "org-1",
      actor_id: "user-1",
      rows: [{ balance: 42 }],
    };

    const [expiredWorker, currentWorker] = await Promise.allSettled([
      service.complete({ ...baseInput, lease_token: "lease-a" }),
      service.complete({ ...baseInput, lease_token: "lease-b" }),
    ]);

    expect(expiredWorker.status).toBe("rejected");
    expect(currentWorker.status).toBe("fulfilled");
    expect(transaction.reportJob.updateMany).toHaveBeenCalledWith({
      where: { id: "job-1", status: "processing", lease_token: "lease-a" },
      data: { status: "completed", finished_at: now },
    });
    expect(transaction.reportJob.updateMany).toHaveBeenCalledWith({
      where: { id: "job-1", status: "processing", lease_token: "lease-b" },
      data: { status: "completed", finished_at: now },
    });
    expect(transaction.reportSnapshot.create).toHaveBeenCalledTimes(1);
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
      lease_token: "lease-b",
    });

    expect(transaction.reportSnapshot.create).not.toHaveBeenCalled();
    expect(transaction.reportSnapshotRow.createMany).not.toHaveBeenCalled();
  });

  it("bloqueia queued → processing fora do claim atômico", async () => {
    const { prisma, transaction } = createPersistence("queued");
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

    expect(transaction.reportJob.updateMany).not.toHaveBeenCalled();
  });

  it("impede worker com lease expirado de cancelar job recapturado", async () => {
    const { prisma, transaction } = createPersistence();
    transaction.reportJob.updateMany.mockImplementation(async ({ where }) => ({
      count: where.lease_token === "lease-b" ? 1 : 0,
    }));
    const audit = new ReportAuditService(prisma as never, vi.fn());
    const service = new ReportLifecycleService(prisma as never, audit, () => now);
    const baseInput = {
      job_id: "job-1",
      organization_id: "org-1",
      actor_id: "user-1",
      status: "cancelled" as const,
    };

    const [expiredWorker, currentWorker] = await Promise.allSettled([
      service.transition({ ...baseInput, lease_token: "lease-a" }),
      service.transition({ ...baseInput, lease_token: "lease-b" }),
    ]);

    expect(expiredWorker.status).toBe("rejected");
    expect(currentWorker.status).toBe("fulfilled");
    expect(transaction.reportJob.updateMany).toHaveBeenCalledWith({
      where: { id: "job-1", status: "processing", lease_token: "lease-a" },
      data: { status: "cancelled", finished_at: now },
    });
    expect(transaction.reportJob.updateMany).toHaveBeenCalledWith({
      where: { id: "job-1", status: "processing", lease_token: "lease-b" },
      data: { status: "cancelled", finished_at: now },
    });
  });

  it("impede worker com lease expirado de falhar job recapturado", async () => {
    const { prisma, transaction } = createPersistence();
    transaction.reportJob.updateMany.mockImplementation(async ({ where }) => ({
      count: where.lease_token === "lease-b" ? 1 : 0,
    }));
    const audit = new ReportAuditService(prisma as never, vi.fn());
    const service = new ReportLifecycleService(prisma as never, audit, () => now);
    const baseInput = {
      job_id: "job-1",
      organization_id: "org-1",
      actor_id: "user-1",
      status: "failed" as const,
    };

    const [expiredWorker, currentWorker] = await Promise.allSettled([
      service.transition({ ...baseInput, lease_token: "lease-a" }),
      service.transition({ ...baseInput, lease_token: "lease-b" }),
    ]);

    expect(expiredWorker.status).toBe("rejected");
    expect(currentWorker.status).toBe("fulfilled");
    expect(transaction.reportJob.updateMany).toHaveBeenCalledWith({
      where: { id: "job-1", status: "processing", lease_token: "lease-a" },
      data: { status: "failed", finished_at: now },
    });
    expect(transaction.reportJob.updateMany).toHaveBeenCalledWith({
      where: { id: "job-1", status: "processing", lease_token: "lease-b" },
      data: { status: "failed", finished_at: now },
    });
    expect(transaction.reportSnapshot.create).not.toHaveBeenCalled();
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

    expect(transaction.reportSnapshot.findMany).toHaveBeenCalledWith({
      where: { report_job_id: "job-1" },
      select: { id: true },
    });
    expect(transaction.reportSnapshotRow.deleteMany).toHaveBeenCalledWith({
      where: { snapshot_id: { in: ["snapshot-1"] } },
    });
    expect(transaction.reportSnapshot.create).not.toHaveBeenCalled();
    expect(transaction.reportAuditEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ event_type: "report.expired.retention" }),
      }),
    );
  });

  it("mantém a migration de lifecycle que atualiza default e estados legados", async () => {
    const migration = await readFile(
      new URL(
        "../../../../infra/prisma/migrations/20260824123000_reports_lifecycle_statuses/migration.sql",
        import.meta.url,
      ),
      "utf8",
    );

    expect(migration).toContain("ALTER COLUMN \"status\" SET DEFAULT 'queued'");
    expect(migration).toContain("WHEN 'pending' THEN 'queued'");
    expect(migration).toContain("WHEN 'running' THEN 'processing'");
  });
});
