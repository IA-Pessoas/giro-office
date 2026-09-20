import { describe, expect, it, vi } from "vitest";

import { ReportWorkerService } from "../services/reportWorkerService.js";

describe("ReportWorkerService", () => {
  it("não materializa conteúdo quando não há job a reclamar", async () => {
    const claimNext = vi.fn().mockResolvedValue(null);
    const worker = new ReportWorkerService(
      { claimNext } as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    );

    await expect(worker.processNext()).resolves.toBe(false);
    expect(claimNext).toHaveBeenCalledOnce();
  });

  it("falha sem materializar quando a permissão pessoal é perdida antes da execução", async () => {
    const transition = vi.fn().mockResolvedValue(undefined);
    const worker = new ReportWorkerService(
      {
        claimNext: vi.fn().mockResolvedValue({
          id: "job-1",
          organization_id: "org-1",
          requester_id: "user-1",
          report_model_version_id: "version-1",
          lease_token: "lease-1",
          payload_json: {},
        }),
      } as never,
      {
        reportModelVersion: {
          findFirst: vi.fn().mockResolvedValue({
            report_model_id: "model-1",
            definition_json: {
              sources: ["source"],
              columns: [],
              filters: [],
              parameters: [],
              aggregations: [],
              order_by: [],
              joins: [],
            },
          }),
        },
        reportModel: {
          findFirst: vi.fn().mockResolvedValue({ created_by_user_id: "user-1", active: true }),
        },
      } as never,
      {
        getAccessContext: vi.fn().mockResolvedValue({ organization: { id: "org-1" }, modules: {} }),
      } as never,
      {
        execute: vi.fn().mockRejectedValue(new Error("permissão negada")),
        assertAuthorizedDefinition: vi.fn(),
      } as never,
      { complete: vi.fn(), transition } as never,
    );

    await expect(worker.processNext()).resolves.toBe(true);
    expect(transition).toHaveBeenCalledWith(
      expect.objectContaining({
        job_id: "job-1",
        status: "failed",
        error_message:
          "Não foi possível gerar o relatório. Confira o acesso e os critérios e tente novamente.",
      }),
    );
  });

  it("materializa blocos compostos em um único snapshot", async () => {
    const complete = vi.fn().mockResolvedValue(undefined);
    const composition = {
      version: 2,
      areas: [{ source: "regularize.licenses", fields: ["protocol"] }],
    };
    const worker = new ReportWorkerService(
      {
        claimNext: vi.fn().mockResolvedValue({
          id: "job-1",
          organization_id: "org-1",
          requester_id: "user-1",
          report_model_version_id: "version-1",
          lease_token: "lease-1",
          payload_json: {},
        }),
      } as never,
      {
        reportModelVersion: {
          findFirst: vi.fn().mockResolvedValue({
            report_model_id: "model-1",
            definition_json: composition,
          }),
        },
        reportModel: {
          findFirst: vi.fn().mockResolvedValue({ created_by_user_id: "user-1", active: true }),
        },
        reportJob: { findFirst: vi.fn().mockResolvedValue({ id: "job-1" }) },
      } as never,
      {
        getAccessContext: vi.fn().mockResolvedValue({ organization: { id: "org-1" }, modules: {} }),
      } as never,
      {
        executeComposition: vi.fn().mockResolvedValue({
          blocks: [
            {
              source: "regularize.licenses",
              label: "Licenças do Regularize",
              columns: [{ key: "protocol", label: "Protocolo" }],
              rows: [{ protocol: "P-1" }],
            },
          ],
        }),
        assertAuthorizedDefinition: vi.fn(),
      } as never,
      { complete, transition: vi.fn() } as never,
    );

    await expect(worker.processNext()).resolves.toBe(true);

    expect(complete).toHaveBeenCalledWith(
      expect.objectContaining({
        job_id: "job-1",
        blocks: [
          expect.objectContaining({
            label: "Licenças do Regularize",
            rows: [{ protocol: "P-1" }],
          }),
        ],
      }),
    );
    expect(complete.mock.calls[0]?.[0]).not.toHaveProperty("rows");
  });

  it("continua expirando os demais snapshots quando uma expiração falha", async () => {
    const expire = vi
      .fn()
      .mockRejectedValueOnce(new Error("conflito"))
      .mockResolvedValue(undefined);
    const worker = new ReportWorkerService(
      {} as never,
      {
        reportSnapshot: {
          findMany: vi.fn().mockResolvedValue([
            { organization_id: "org-1", report_job_id: "job-1" },
            { organization_id: "org-1", report_job_id: "job-2" },
          ]),
        },
      } as never,
      {} as never,
      {} as never,
      { expire } as never,
    );

    await expect(worker.expireDue()).resolves.toBeUndefined();
    expect(expire).toHaveBeenCalledTimes(2);
  });

  it("calcula o prazo do snapshot com a retenção capturada no job", async () => {
    const now = new Date("2026-08-27T12:00:00.000Z");
    vi.useFakeTimers({ now });
    try {
      const complete = vi.fn().mockResolvedValue(undefined);
      const worker = new ReportWorkerService(
        {
          claimNext: vi.fn().mockResolvedValue({
            id: "job-1",
            organization_id: "org-1",
            requester_id: "user-1",
            report_model_version_id: "version-1",
            lease_token: "lease-1",
            payload_json: { retentionDays: 14 },
          }),
          renewLease: vi.fn().mockResolvedValue(true),
        } as never,
        {
          reportModelVersion: {
            findFirst: vi.fn().mockResolvedValue({
              report_model_id: "model-1",
              definition_json: { sources: [] },
            }),
          },
          reportModel: {
            findFirst: vi.fn().mockResolvedValue({
              created_by_user_id: "user-1",
              active: true,
            }),
          },
          reportJob: { findFirst: vi.fn().mockResolvedValue({ id: "job-1" }) },
        } as never,
        {
          getAccessContext: vi
            .fn()
            .mockResolvedValue({ organization: { id: "org-1" }, modules: {} }),
        } as never,
        { execute: vi.fn().mockResolvedValue([]), assertAuthorizedDefinition: vi.fn() } as never,
        { complete, transition: vi.fn() } as never,
      );

      await worker.processNext();

      expect(complete).toHaveBeenCalledWith(
        expect.objectContaining({
          expires_at: new Date("2026-09-10T12:00:00.000Z"),
        }),
      );
    } finally {
      vi.useRealTimers();
    }
  });
});
