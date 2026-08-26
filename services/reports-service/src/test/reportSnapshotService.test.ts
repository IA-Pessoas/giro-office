import { describe, expect, it, vi } from "vitest";

import { ReportSnapshotService } from "../services/reportSnapshotService.js";

describe("ReportSnapshotService", () => {
  it("retorna somente linhas de snapshot concluído, autorizado e paginado", async () => {
    const prisma = {
      reportJob: { findFirst: vi.fn().mockResolvedValue({ id: "job-1" }) },
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
});
