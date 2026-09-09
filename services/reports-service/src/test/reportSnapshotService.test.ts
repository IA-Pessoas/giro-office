import { describe, expect, it, vi } from "vitest";

import { ReportSnapshotService } from "../services/reportSnapshotService.js";

describe("ReportSnapshotService", () => {
  it("reabre um snapshot composto com blocos, campos, quantidade e valores", async () => {
    const prisma = {
      reportJob: { findFirst: vi.fn().mockResolvedValue({ id: "job-1" }) },
      reportSnapshot: {
        findFirst: vi.fn().mockResolvedValue({ id: "snapshot-1", created_at: new Date() }),
      },
      reportSnapshotBlock: {
        findMany: vi.fn().mockResolvedValue([
          {
            id: "block-1",
            source: "regularize.licenses",
            label: "Licenças do Regularize",
            columns_json: [{ key: "protocol", label: "Protocolo" }],
            row_count: 1,
            position: 0,
          },
          {
            id: "block-2",
            source: "regularize.processes",
            label: "Processos do Regularize",
            columns_json: [{ key: "number", label: "Número" }],
            row_count: 0,
            position: 1,
          },
        ]),
      },
      reportSnapshotRow: {
        findMany: vi
          .fn()
          .mockImplementation(({ where }: { where: { block_id?: string } }) =>
            where.block_id === "block-1" ? [{ row_number: 1, data_json: { protocol: "P-1" } }] : [],
          ),
      },
    };
    const service = new ReportSnapshotService(prisma as never);

    await expect(
      service.get({
        organizationId: "org-1",
        userId: "user-1",
        jobId: "job-1",
        limit: 100,
      }),
    ).resolves.toEqual({
      snapshot: { id: "snapshot-1", created_at: expect.any(Date) },
      rows: [],
      nextCursor: null,
      blocks: [
        {
          source: "regularize.licenses",
          label: "Licenças do Regularize",
          columns: [{ key: "protocol", label: "Protocolo" }],
          rowCount: 1,
          rows: [{ row_number: 1, values: { protocol: "P-1" } }],
          nextCursor: null,
        },
        {
          source: "regularize.processes",
          label: "Processos do Regularize",
          columns: [{ key: "number", label: "Número" }],
          rowCount: 0,
          rows: [],
          nextCursor: null,
        },
      ],
    });
    expect(prisma.reportSnapshotRow.findMany).toHaveBeenCalledWith({
      where: { snapshot_id: "snapshot-1", block_id: "block-1" },
      orderBy: { row_number: "asc" },
      take: 101,
    });
  });

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

  it("expõe o próximo cursor composto quando algum bloco ainda possui linhas", async () => {
    const prisma = {
      reportJob: { findFirst: vi.fn().mockResolvedValue({ id: "job-1" }) },
      reportSnapshot: {
        findFirst: vi.fn().mockResolvedValue({ id: "snapshot-1", created_at: new Date() }),
      },
      reportSnapshotBlock: {
        findMany: vi.fn().mockResolvedValue([
          {
            id: "block-1",
            source: "reports.first",
            label: "Primeiro",
            columns_json: [],
            row_count: 2,
            position: 0,
          },
          {
            id: "block-2",
            source: "reports.second",
            label: "Segundo",
            columns_json: [],
            row_count: 3,
            position: 1,
          },
        ]),
      },
      reportSnapshotRow: {
        findMany: vi
          .fn()
          .mockResolvedValueOnce([
            { row_number: 1, data_json: { value: "a" } },
            { row_number: 2, data_json: { value: "b" } },
          ])
          .mockResolvedValueOnce([
            { row_number: 1, data_json: { value: "c" } },
            { row_number: 2, data_json: { value: "d" } },
            { row_number: 3, data_json: { value: "e" } },
          ]),
      },
    };
    const service = new ReportSnapshotService(prisma as never);

    await expect(
      service.get({
        organizationId: "org-1",
        userId: "user-1",
        jobId: "job-1",
        limit: 2,
      }),
    ).resolves.toMatchObject({
      nextCursor: 2,
      blocks: [
        { rows: [{ row_number: 1 }, { row_number: 2 }], nextCursor: null },
        { rows: [{ row_number: 1 }, { row_number: 2 }], nextCursor: 2 },
      ],
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

  it("mantém acesso pessoal do autor quando scope é omitido", async () => {
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
      findFirst: vi.fn().mockResolvedValue({ id: "snapshot-1", created_at: new Date() }),
    };
    const service = new ReportSnapshotService({
      reportJob,
      reportModelVersion,
      reportModel,
      reportSnapshot,
      reportSnapshotRow: { findMany: vi.fn().mockResolvedValue([]) },
    } as never);

    await expect(
      service.get({
        organizationId: "org-1",
        userId: "user-1",
        jobId: "job-1",
        limit: 10,
      }),
    ).resolves.toEqual({
      snapshot: { id: "snapshot-1", created_at: expect.any(Date) },
      rows: [],
      nextCursor: null,
    });
  });

  it("mantém acesso pessoal do autor mesmo quando o modelo tem departamento", async () => {
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
      }),
    };
    const reportSnapshot = {
      findFirst: vi.fn().mockResolvedValue({ id: "snapshot-1", created_at: new Date() }),
    };
    const service = new ReportSnapshotService({
      reportJob,
      reportModelVersion,
      reportModel,
      reportSnapshot,
      reportSnapshotRow: { findMany: vi.fn().mockResolvedValue([]) },
    } as never);

    await expect(
      service.get({
        organizationId: "org-1",
        userId: "user-1",
        jobId: "job-1",
        scope: "personal",
        limit: 10,
      }),
    ).resolves.toEqual({
      snapshot: { id: "snapshot-1", created_at: expect.any(Date) },
      rows: [],
      nextCursor: null,
    });
  });

  it("lê somente o snapshot concluído, não expirado e pertencente ao solicitante", async () => {
    const prisma = {
      reportSnapshot: {
        findFirst: vi.fn().mockResolvedValue({
          id: "snapshot-1",
          report_job_id: "job-1",
          report_model_version_id: "version-1",
          created_at: new Date(),
        }),
      },
      reportJob: {
        findFirst: vi.fn().mockResolvedValue({
          id: "job-1",
          report_model_version_id: "version-1",
        }),
      },
      reportSnapshotRow: {
        findMany: vi.fn().mockResolvedValue([
          { row_number: 2, data_json: { name: "Ana" } },
          { row_number: 1, data_json: { name: "Bia" } },
        ]),
      },
    };
    const service = new ReportSnapshotService(prisma as never);

    await expect(
      service.getForExport({ organizationId: "org-1", userId: "user-1", snapshotId: "snapshot-1" }),
    ).resolves.toMatchObject({
      snapshot: { id: "snapshot-1" },
      job: { id: "job-1", report_model_version_id: "version-1" },
      rows: [{ name: "Ana" }, { name: "Bia" }],
    });
    expect(prisma.reportSnapshot.findFirst).toHaveBeenCalledWith({
      where: expect.objectContaining({
        id: "snapshot-1",
        organization_id: "org-1",
        OR: [{ expires_at: null }, { expires_at: { gt: expect.any(Date) } }],
      }),
    });
    expect(prisma.reportJob.findFirst).toHaveBeenCalledWith({
      where: {
        id: "job-1",
        organization_id: "org-1",
        requester_id: "user-1",
        status: "completed",
      },
    });
    expect(prisma.reportSnapshotRow.findMany).toHaveBeenCalledWith({
      where: { snapshot_id: "snapshot-1", organization_id: "org-1" },
      orderBy: { row_number: "asc" },
      select: { row_number: true, data_json: true },
    });
  });

  it("revalidates snapshot and requester immediately before export", async () => {
    const prisma = {
      reportSnapshot: {
        findFirst: vi.fn().mockResolvedValue({ report_job_id: "job-1" }),
      },
      reportJob: {
        findFirst: vi.fn().mockResolvedValue({ id: "job-1" }),
      },
    };
    const service = new ReportSnapshotService(prisma as never);

    await expect(
      service.assertExportable({
        organizationId: "org-1",
        userId: "user-1",
        snapshotId: "snapshot-1",
      }),
    ).resolves.toBeUndefined();

    expect(prisma.reportSnapshot.findFirst).toHaveBeenCalledWith({
      where: {
        id: "snapshot-1",
        organization_id: "org-1",
        OR: [{ expires_at: null }, { expires_at: { gt: expect.any(Date) } }],
      },
    });
    expect(prisma.reportJob.findFirst).toHaveBeenCalledWith({
      where: {
        id: "job-1",
        organization_id: "org-1",
        requester_id: "user-1",
        status: "completed",
      },
      select: { id: true },
    });
  });
});
