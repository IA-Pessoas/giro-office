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

  it("marca modelo temporário de execução avulsa para não exibi-lo na biblioteca", async () => {
    const transaction = {
      reportModel: { create: vi.fn().mockResolvedValue({ id: "model-1" }) },
      reportModelVersion: { create: vi.fn().mockResolvedValue({ id: "version-1" }) },
      reportJob: { create: vi.fn().mockResolvedValue({ id: "job-1", status: "queued" }) },
      reportRetentionPolicy: { findFirst: vi.fn().mockResolvedValue(null) },
    };
    const service = new ReportJobService({
      $transaction: vi.fn(async (callback: (client: typeof transaction) => unknown) =>
        callback(transaction),
      ),
    } as never);

    await service.createFromDefinition({
      organizationId,
      userId,
      definition: {
        sources: [],
        columns: [],
        joins: [],
        parameters: [],
        filters: [],
        aggregations: [],
        order_by: [],
      },
      payload: { format: "json" },
    });

    expect(transaction.reportModel.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        organization_id: organizationId,
        created_by_user_id: userId,
        name: "Execução avulsa",
        is_ephemeral: true,
      }),
    });
  });

  it("remove definição efêmera quando job em fila é cancelado", async () => {
    const reportModelVersion = {
      findFirst: vi.fn().mockResolvedValue({ report_model_id: "model-1" }),
      deleteMany: vi.fn(),
    };
    const reportModel = {
      findFirst: vi.fn().mockResolvedValue({ id: "model-1", is_ephemeral: true }),
      delete: vi.fn(),
    };
    const prisma = {
      reportJob: {
        findFirst: vi.fn().mockResolvedValue({
          id: "job-1",
          status: "queued",
          report_model_version_id: "version-1",
        }),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
      reportModelVersion,
      reportModel,
      $transaction: vi.fn(async (callback: (client: unknown) => unknown) => callback(prisma)),
    };
    const service = new ReportJobService(prisma as never);

    await service.cancel({ organizationId, userId, id: "job-1" });

    expect(reportModelVersion.deleteMany).toHaveBeenCalledWith({
      where: { report_model_id: "model-1" },
    });
    expect(reportModel.delete).toHaveBeenCalledWith({ where: { id: "model-1" } });
  });

  it("não permite reutilizar versão efêmera em novo job", async () => {
    const reportModel = { findFirst: vi.fn().mockResolvedValue(null) };
    const service = new ReportJobService({
      reportModelVersion: {
        findFirst: vi.fn().mockResolvedValue({ report_model_id: "model-1" }),
      },
      reportModel,
    } as never);

    await expect(service.getVersion({ organizationId, modelVersionId })).rejects.toEqual(
      expect.objectContaining<ServiceError>({ statusCode: 404 }),
    );
    expect(reportModel.findFirst).toHaveBeenCalledWith({
      where: {
        id: "model-1",
        organization_id: organizationId,
        active: true,
        is_ephemeral: false,
      },
    });
  });
});
