import { describe, expect, it, vi } from "vitest";

import { ReportSnapshotService } from "../services/reportSnapshotService.js";

describe("ReportSnapshotService", () => {
  it("retorna somente linhas de snapshot concluído, autorizado e paginado", async () => {
    const prisma = {
      reportJob: { findFirst: vi.fn().mockResolvedValue({ id: "job-1" }) },
      reportModelVersion: {
        findFirst: vi.fn().mockResolvedValue({ report_model_id: "model-1" }),
      },
      reportModel: {
        findFirst: vi.fn().mockResolvedValue({ id: "model-1", department_id: null }),
      },
      reportSnapshot: {
        findFirst: vi.fn().mockResolvedValue({ id: "snapshot-1", created_at: new Date() }),
      },
      reportSnapshotRow: {
        findMany: vi.fn().mockResolvedValue([
          { row_number: 3, data_json: { total: 3 } },
          { row_number: 4, data_json: { total: 4 } },
        ]),
      },
    };
    const service = new ReportSnapshotService(prisma as never);

    await expect(
      service.get({
        organizationId: "org-1",
        userId: "user-1",
        jobId: "job-1",
        cursor: 2,
        limit: 1,
      }),
    ).resolves.toEqual({
      snapshot: { id: "snapshot-1", created_at: expect.any(Date) },
      rows: [{ row_number: 3, values: { total: 3 } }],
      nextCursor: 3,
    });
    expect(prisma.reportJob.findFirst).toHaveBeenCalledWith({
      where: { id: "job-1", organization_id: "org-1", requester_id: "user-1", status: "completed" },
    });
    expect(prisma.reportSnapshot.findFirst).toHaveBeenCalledWith({
      where: expect.objectContaining({
        report_job_id: "job-1",
        organization_id: "org-1",
        OR: [{ expires_at: null }, { expires_at: { gt: expect.any(Date) } }],
      }),
    });
    expect(prisma.reportSnapshotRow.findMany).toHaveBeenCalledWith({
      where: { snapshot_id: "snapshot-1", row_number: { gt: 2 } },
      orderBy: { row_number: "asc" },
      take: 2,
    });
  });

  it("abre snapshot do acervo somente quando o modelo pertence ao departamento atual", async () => {
    const reportJob = {
      findFirst: vi.fn().mockResolvedValue({
        id: "job-1",
        report_model_version_id: "version-1",
      }),
    };
    const reportModelVersion = {
      findFirst: vi.fn().mockResolvedValue({ report_model_id: "model-1" }),
    };
    const reportModel = { findFirst: vi.fn().mockResolvedValue({ id: "model-1" }) };
    const reportSnapshot = {
      findFirst: vi.fn().mockResolvedValue({ id: "snapshot-1", created_at: new Date() }),
    };
    const reportSnapshotRow = { findMany: vi.fn().mockResolvedValue([]) };
    const service = new ReportSnapshotService({
      reportJob,
      reportModelVersion,
      reportModel,
      reportSnapshot,
      reportSnapshotRow,
    } as never);

    await service.get({
      organizationId: "org-1",
      userId: "user-1",
      jobId: "job-1",
      scope: "library",
      departmentId: "department-1",
      limit: 10,
    });

    expect(reportJob.findFirst).toHaveBeenCalledWith({
      where: { id: "job-1", organization_id: "org-1", status: "completed" },
    });
    expect(reportModel.findFirst).toHaveBeenCalledWith({
      where: {
        id: "model-1",
        organization_id: "org-1",
        department_id: "department-1",
        active: true,
        is_ephemeral: false,
      },
    });
  });

  it("não abre snapshot compartilhado quando scope é omitido", async () => {
    const reportJob = {
      findFirst: vi.fn().mockResolvedValue({
        id: "job-1",
        report_model_version_id: "version-1",
      }),
    };
    const reportModelVersion = {
      findFirst: vi.fn().mockResolvedValue({ report_model_id: "model-1" }),
    };
    const reportModel = {
      findFirst: vi.fn().mockResolvedValue({
        id: "model-1",
        department_id: "department-1",
        active: true,
        is_ephemeral: false,
      }),
    };
    const reportSnapshot = {
      findFirst: vi.fn(),
    };
    const service = new ReportSnapshotService({
      reportJob,
      reportModelVersion,
      reportModel,
      reportSnapshot,
      reportSnapshotRow: { findMany: vi.fn() },
    } as never);

    await expect(
      service.get({
        organizationId: "org-1",
        userId: "user-1",
        jobId: "job-1",
        limit: 10,
      }),
    ).rejects.toMatchObject({ statusCode: 403 });

    expect(reportSnapshot.findFirst).not.toHaveBeenCalled();
  });
});
