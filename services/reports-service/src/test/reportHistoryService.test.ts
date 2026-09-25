import { describe, expect, it, vi } from "vitest";

import { ReportJobService } from "../services/reportJobService.js";

const emptyDelegate = () => ({ findMany: vi.fn().mockResolvedValue([]) });

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
    const service = new ReportJobService({
      reportModel,
      reportModelVersion,
      reportJob,
      reportSnapshot: emptyDelegate(),
    } as never);

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
        error_message: true,
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
    const service = new ReportJobService({
      reportModel,
      reportModelVersion,
      reportJob,
      reportSnapshot: emptyDelegate(),
    } as never);

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
    const service = new ReportJobService({
      reportJob,
      reportModel: emptyDelegate(),
      reportModelVersion: emptyDelegate(),
      reportSnapshot: emptyDelegate(),
    } as never);

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
    const service = new ReportJobService({
      reportJob,
      reportModel: emptyDelegate(),
      reportModelVersion: emptyDelegate(),
      reportSnapshot: emptyDelegate(),
    } as never);

    await expect(
      service.listHistory({
        organizationId: "org-1",
        userId: "user-1",
        scope: "personal",
        cursor: 4,
        limit: 2,
      }),
    ).resolves.toEqual({
      items: [expect.objectContaining({ id: "job-1" }), expect.objectContaining({ id: "job-2" })],
      nextCursor: 6,
    });

    expect(reportJob.findMany).toHaveBeenCalledWith(expect.objectContaining({ skip: 4, take: 3 }));
  });

  it("descreve cada job com nome, versão, expiração e motivo da falha", async () => {
    const requestedAt = new Date("2026-09-17T12:00:00.000Z");
    const expiresAt = new Date("2026-10-17T12:00:00.000Z");
    const job = (id: string, versionId: string, status = "completed") => ({
      id,
      report_model_version_id: versionId,
      requester_id: "user-1",
      status,
      requested_at: requestedAt,
      started_at: requestedAt,
      finished_at: requestedAt,
      error_message: status === "failed" ? "Fonte indisponível." : null,
    });
    const reportJob = {
      findMany: vi
        .fn()
        .mockResolvedValue([
          job("job-1", "v-adhoc", "failed"),
          job("job-2", "v-saved"),
          job("job-3", "v-old"),
        ]),
    };
    const reportModelVersion = {
      findMany: vi.fn().mockResolvedValue([
        {
          id: "v-adhoc",
          version: 1,
          report_model_id: "m-adhoc",
          definition_json: { areas: [{ source: "rh.requests" }, { source: "fiscal.icms" }] },
        },
        { id: "v-saved", version: 3, report_model_id: "m-saved", definition_json: { areas: [] } },
        {
          id: "v-old",
          version: 1,
          report_model_id: "m-old",
          definition_json: { sources: ["rh.requests", "rh.attendance"] },
        },
      ]),
    };
    const reportModel = {
      findMany: vi.fn().mockResolvedValue([
        { id: "m-adhoc", name: "Execução avulsa", is_ephemeral: true },
        { id: "m-saved", name: "Folha mensal", is_ephemeral: false },
        { id: "m-old", name: "Execução avulsa", is_ephemeral: true },
      ]),
    };
    const reportSnapshot = {
      findMany: vi.fn().mockResolvedValue([{ report_job_id: "job-2", expires_at: expiresAt }]),
    };
    const service = new ReportJobService({
      reportModel,
      reportModelVersion,
      reportJob,
      reportSnapshot,
    } as never);

    const { items } = await service.listHistory({
      organizationId: "org-1",
      userId: "user-1",
      scope: "personal",
      limit: 20,
    });

    expect(items).toEqual([
      expect.objectContaining({
        id: "job-1",
        model_name: "Relatório de Recursos Humanos e Fiscal",
        model_version: null,
        expires_at: null,
        error_message: "Fonte indisponível.",
      }),
      expect.objectContaining({
        id: "job-2",
        model_name: "Folha mensal",
        model_version: 3,
        expires_at: expiresAt,
      }),
      expect.objectContaining({ id: "job-3", model_name: "Relatório de Recursos Humanos" }),
    ]);
    expect(reportSnapshot.findMany).toHaveBeenCalledWith({
      where: { organization_id: "org-1", report_job_id: { in: ["job-1", "job-2", "job-3"] } },
      select: { report_job_id: true, expires_at: true },
    });
  });
});
