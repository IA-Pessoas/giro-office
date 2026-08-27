import { describe, expect, it, vi } from "vitest";

import { ReportJobService } from "../services/reportJobService.js";

describe("ReportJobService histórico", () => {
  it("lista histórico pessoal com filtros sem expor o payload do job", async () => {
    const from = new Date("2026-08-01T00:00:00.000Z");
    const to = new Date("2026-08-31T23:59:59.999Z");
    const requestedAt = new Date("2026-08-26T12:00:00.000Z");
    const reportModel = { findMany: vi.fn().mockResolvedValue([{ id: "model-1" }]) };
    const reportModelVersion = {
      findMany: vi.fn().mockResolvedValue([{ id: "version-1" }]),
    };
    const reportJob = {
      findMany: vi.fn().mockResolvedValue([
        {
          id: "job-1",
          report_model_version_id: "version-1",
          requester_id: "user-1",
          status: "completed",
          requested_at: requestedAt,
          started_at: requestedAt,
          finished_at: requestedAt,
        },
      ]),
    };
    const service = new ReportJobService({ reportModel, reportModelVersion, reportJob } as never);

    await expect(
      service.listHistory({
        organizationId: "org-1",
        userId: "user-1",
        scope: "personal",
        status: "completed",
        from,
        to,
        modelId: "model-1",
        authorId: "user-1",
        cursor: 4,
        limit: 2,
      }),
    ).resolves.toEqual({
      items: [expect.objectContaining({ id: "job-1", status: "completed" })],
      nextCursor: null,
    });

    expect(reportModel.findMany).toHaveBeenCalledWith({
      where: { organization_id: "org-1", id: "model-1" },
      select: { id: true },
    });
    expect(reportModelVersion.findMany).toHaveBeenCalledWith({
      where: { organization_id: "org-1", report_model_id: { in: ["model-1"] } },
      select: { id: true },
    });
    expect(reportJob.findMany).toHaveBeenCalledWith({
      where: {
        organization_id: "org-1",
        requester_id: "user-1",
        status: "completed",
        requested_at: { gte: from, lte: to },
        report_model_version_id: { in: ["version-1"] },
      },
      orderBy: { requested_at: "desc" },
      skip: 4,
      take: 3,
      select: {
        id: true,
        report_model_version_id: true,
        requester_id: true,
        status: true,
        requested_at: true,
        started_at: true,
        finished_at: true,
      },
    });
  });

  it("lista acervo apenas no departamento atual e filtra pelo autor", async () => {
    const reportModel = {
      findMany: vi.fn().mockResolvedValue([{ id: "model-1" }]),
    };
    const reportModelVersion = {
      findMany: vi.fn().mockResolvedValue([{ id: "version-1" }]),
    };
    const reportJob = { findMany: vi.fn().mockResolvedValue([]) };
    const service = new ReportJobService({ reportModel, reportModelVersion, reportJob } as never);

    await service.listHistory({
      organizationId: "org-1",
      userId: "user-1",
      scope: "library",
      departmentId: "department-1",
      authorId: "author-1",
      limit: 50,
    });

    expect(reportModel.findMany).toHaveBeenCalledWith({
      where: {
        organization_id: "org-1",
        department_id: "department-1",
        is_ephemeral: false,
      },
      select: { id: true },
    });
    expect(reportModelVersion.findMany).toHaveBeenCalledWith({
      where: { organization_id: "org-1", report_model_id: { in: ["model-1"] } },
      select: { id: true },
    });
    expect(reportJob.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          organization_id: "org-1",
          requester_id: "author-1",
          report_model_version_id: { in: ["version-1"] },
        },
      }),
    );
  });

  it("mantém histórico pessoal mesmo quando o modelo efêmero já foi removido", async () => {
    const reportJob = { findMany: vi.fn().mockResolvedValue([]) };
    const service = new ReportJobService({ reportJob } as never);

    await service.listHistory({
      organizationId: "org-1",
      userId: "user-1",
      scope: "personal",
      limit: 50,
    });

    expect(reportJob.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { organization_id: "org-1", requester_id: "user-1" },
      }),
    );
  });

  it("retorna o cursor da próxima página quando há mais itens", async () => {
    const reportJob = {
      findMany: vi.fn().mockResolvedValue([{ id: "job-1" }, { id: "job-2" }, { id: "job-3" }]),
    };
    const service = new ReportJobService({ reportJob } as never);

    await expect(
      service.listHistory({
        organizationId: "org-1",
        userId: "user-1",
        scope: "personal",
        cursor: 4,
        limit: 2,
      }),
    ).resolves.toEqual({
      items: [{ id: "job-1" }, { id: "job-2" }],
      nextCursor: 6,
    });

    expect(reportJob.findMany).toHaveBeenCalledWith(expect.objectContaining({ skip: 4, take: 3 }));
  });
});
