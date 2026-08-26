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
      { execute: vi.fn().mockRejectedValue(new Error("permissão negada")) } as never,
      { complete: vi.fn(), transition } as never,
    );

    await expect(worker.processNext()).resolves.toBe(true);
    expect(transition).toHaveBeenCalledWith(
      expect.objectContaining({ job_id: "job-1", status: "failed" }),
    );
  });
});
