import { ServiceError } from "@workspace/shared";

import type { ReportsPrismaClient } from "../prisma/index.js";

export class ReportSnapshotService {
  constructor(private readonly prisma: ReportsPrismaClient) {}

  async get(input: {
    organizationId: string;
    userId: string;
    jobId: string;
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
        requester_id: input.userId,
        status: "completed",
      },
    });
    if (!job) throw new ServiceError(404, "Snapshot de relatório não encontrado.");

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

  async getForExport(input: {
    organizationId: string;
    userId: string;
    snapshotId: string;
  }): Promise<{
    snapshot: { id: string; created_at: Date };
    job: { id: string; report_model_version_id: string };
    rows: Array<Record<string, unknown>>;
  }> {
    const snapshot = await this.prisma.reportSnapshot.findFirst({
      where: {
        id: input.snapshotId,
        organization_id: input.organizationId,
        OR: [{ expires_at: null }, { expires_at: { gt: new Date() } }],
      },
    });
    if (!snapshot) throw new ServiceError(404, "Snapshot de relatório não encontrado.");

    const job = await this.prisma.reportJob.findFirst({
      where: {
        id: snapshot.report_job_id,
        organization_id: input.organizationId,
        requester_id: input.userId,
        status: "completed",
      },
    });
    if (!job) throw new ServiceError(404, "Snapshot de relatório não encontrado.");

    const records = await this.prisma.reportSnapshotRow.findMany({
      where: { snapshot_id: snapshot.id },
      orderBy: { row_number: "asc" },
    });
    return {
      snapshot: { id: snapshot.id, created_at: snapshot.created_at },
      job: { id: job.id, report_model_version_id: job.report_model_version_id },
      rows: records.map((record) => record.data_json as Record<string, unknown>),
    };
  }
}
