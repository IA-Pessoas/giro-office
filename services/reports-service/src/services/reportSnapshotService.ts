import { ServiceError } from "@workspace/shared";

import type { ReportsPrismaClient } from "../prisma/index.js";

export class ReportSnapshotService {
  constructor(private readonly prisma: ReportsPrismaClient) {}

  async get(input: {
    organizationId: string;
    userId: string;
    jobId: string;
    scope?: "personal" | "library";
    departmentId?: string;
    cursor?: number;
    limit: number;
  }): Promise<{
    snapshot: { id: string; created_at: Date };
    rows: Array<{ row_number: number; values: Record<string, unknown> }>;
    nextCursor: number | null;
  }> {
    const job = await this.prisma.reportJob.findFirst({
      where: {
        id: input.jobId,
        organization_id: input.organizationId,
        ...(input.scope !== "library" ? { requester_id: input.userId } : {}),
        status: "completed",
      },
    });
    if (!job) throw new ServiceError(404, "Snapshot de relatório não encontrado.");

    if (input.scope === "library") {
      if (!input.departmentId) {
        throw new ServiceError(403, "O acervo compartilhado exige departamento atual.");
      }
      const version = await this.prisma.reportModelVersion.findFirst({
        where: {
          id: job.report_model_version_id,
          organization_id: input.organizationId,
        },
      });
      const model = version
        ? await this.prisma.reportModel.findFirst({
            where: {
              id: version.report_model_id,
              organization_id: input.organizationId,
              department_id: input.departmentId,
              active: true,
              is_ephemeral: false,
            },
          })
        : null;
      if (!model) throw new ServiceError(404, "Snapshot de relatório não encontrado.");
    }

    const snapshot = await this.prisma.reportSnapshot.findFirst({
      where: {
        report_job_id: job.id,
        organization_id: input.organizationId,
        OR: [{ expires_at: null }, { expires_at: { gt: new Date() } }],
      },
    });
    if (!snapshot) throw new ServiceError(404, "Snapshot de relatório não encontrado.");

    const records = await this.prisma.reportSnapshotRow.findMany({
      where: {
        snapshot_id: snapshot.id,
        ...(input.cursor === undefined ? {} : { row_number: { gt: input.cursor } }),
      },
      orderBy: { row_number: "asc" },
      take: input.limit + 1,
    });
    const visible = records.slice(0, input.limit);
    return {
      snapshot: { id: snapshot.id, created_at: snapshot.created_at },
      rows: visible.map((row) => ({
        row_number: row.row_number,
        values: row.data_json as Record<string, unknown>,
      })),
      nextCursor:
        records.length > input.limit ? (visible[visible.length - 1]?.row_number ?? null) : null,
    };
  }
}
