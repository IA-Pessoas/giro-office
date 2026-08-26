import { describe, expect, it, vi } from "vitest";

import { ReportJobService } from "../services/reportJobService.js";

describe("ReportJobService histórico", () => {
  it("lista somente o histórico pessoal paginado sem expor o payload do job", async () => {
    const requestedAt = new Date("2026-08-26T12:00:00.000Z");
    const reportJob = {
      findMany: vi.fn().mockResolvedValue([
        {
          id: "job-1",
          report_model_version_id: "version-1",
          status: "completed",
          requested_at: requestedAt,
          started_at: requestedAt,
          finished_at: requestedAt,
        },
        {
          id: "job-2",
          report_model_version_id: "version-2",
          status: "failed",
          requested_at: requestedAt,
          started_at: null,
          finished_at: requestedAt,
        },
        {
          id: "job-3",
          report_model_version_id: "version-3",
          status: "expired",
          requested_at: requestedAt,
          started_at: requestedAt,
          finished_at: requestedAt,
        },
      ]),
    };
    const service = new ReportJobService({ reportJob } as never);

    await expect(
      service.listHistory({
        organizationId: "org-1",
        userId: "user-1",
        cursor: 4,
        limit: 2,
      }),
    ).resolves.toEqual({
      items: [
        expect.objectContaining({ id: "job-1", status: "completed" }),
        expect.objectContaining({ id: "job-2", status: "failed" }),
      ],
      nextCursor: 6,
    });

    expect(reportJob.findMany).toHaveBeenCalledWith({
      where: { organization_id: "org-1", requester_id: "user-1" },
      orderBy: { requested_at: "desc" },
      skip: 4,
      take: 3,
      select: {
        id: true,
        report_model_version_id: true,
        status: true,
        requested_at: true,
        started_at: true,
        finished_at: true,
      },
    });
  });
});
