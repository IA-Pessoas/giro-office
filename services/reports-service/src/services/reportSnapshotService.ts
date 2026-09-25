import { ServiceError } from "@workspace/shared";

import type { ReportsPrismaClient } from "../prisma/index.js";
import type { ReportResultColumn } from "./reportExecutionService.js";

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
    blocks?: Array<{
      source: string;
      label: string;
      columns: ReportResultColumn[];
      rowCount: number;
      rows: Array<{ row_number: number; values: Record<string, unknown> }>;
      nextCursor: number | null;
    }>;
  }> {
    const job = await this.prisma.reportJob.findFirst({
      where: {
        id: input.jobId,
        organization_id: input.organizationId,
        ...(input.scope !== "library" ? { requester_id: input.userId } : {}),
        status: "completed",
      },
    });
    if (!job) throw new ServiceError(404, "Resultado do relatório não encontrado.");

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
      if (!model) throw new ServiceError(404, "Resultado do relatório não encontrado.");
    }

    const snapshot = await this.prisma.reportSnapshot.findFirst({
      where: {
        report_job_id: job.id,
        organization_id: input.organizationId,
        OR: [{ expires_at: null }, { expires_at: { gt: new Date() } }],
      },
    });
    if (!snapshot) throw new ServiceError(404, "Resultado do relatório não encontrado.");

    const blocks = this.prisma.reportSnapshotBlock
      ? await this.prisma.reportSnapshotBlock.findMany({
          where: { snapshot_id: snapshot.id, organization_id: input.organizationId },
          orderBy: { position: "asc" },
        })
      : [];
    if (blocks.length > 0) {
      const blockPages = await Promise.all(
        blocks.map(async (block) => {
          const records = await this.prisma.reportSnapshotRow.findMany({
            where: {
              snapshot_id: snapshot.id,
              block_id: block.id,
              ...(input.cursor === undefined ? {} : { row_number: { gt: input.cursor } }),
            },
            orderBy: { row_number: "asc" },
            take: input.limit + 1,
          });
          const visible = records.slice(0, input.limit);
          return {
            source: block.source,
            label: block.label,
            columns: block.columns_json as ReportResultColumn[],
            rowCount: block.row_count,
            rows: visible.map((row) => ({
              row_number: row.row_number,
              values: row.data_json as Record<string, unknown>,
            })),
            nextCursor:
              records.length > input.limit
                ? (visible[visible.length - 1]?.row_number ?? null)
                : null,
          };
        }),
      );
      const nextCursors = blockPages
        .map((block) => block.nextCursor)
        .filter((cursor): cursor is number => cursor !== null);
      return {
        snapshot: { id: snapshot.id, created_at: snapshot.created_at },
        rows: [],
        nextCursor: nextCursors.length > 0 ? Math.min(...nextCursors) : null,
        blocks: blockPages,
      };
    }

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
    allowSharedLookup?: boolean;
  }): Promise<{
    snapshot: { id: string; created_at: Date };
    job: { id: string; report_model_version_id: string; requester_id: string };
    rows: Array<Record<string, unknown>>;
    blocks?: Array<{
      source: string;
      label: string;
      columns: ReportResultColumn[];
      rows: Array<Record<string, unknown>>;
    }>;
  }> {
    const snapshot = await this.prisma.reportSnapshot.findFirst({
      where: {
        id: input.snapshotId,
        organization_id: input.organizationId,
        OR: [{ expires_at: null }, { expires_at: { gt: new Date() } }],
      },
    });
    if (!snapshot) throw new ServiceError(404, "Resultado do relatório não encontrado.");

    const job = await this.prisma.reportJob.findFirst({
      where: {
        id: snapshot.report_job_id,
        organization_id: input.organizationId,
        ...(input.allowSharedLookup ? {} : { requester_id: input.userId }),
        status: "completed",
      },
    });
    if (!job) throw new ServiceError(404, "Resultado do relatório não encontrado.");

    if (input.allowSharedLookup && job.requester_id !== input.userId) {
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
            },
          })
        : null;
      if (!model || model.created_by_user_id !== null) {
        throw new ServiceError(404, "Resultado do relatório não encontrado.");
      }
    }

    const blocks = this.prisma.reportSnapshotBlock
      ? await this.prisma.reportSnapshotBlock.findMany({
          where: { snapshot_id: snapshot.id, organization_id: input.organizationId },
          orderBy: { position: "asc" },
        })
      : [];
    const records = await this.prisma.reportSnapshotRow.findMany({
      where: { snapshot_id: snapshot.id, organization_id: input.organizationId },
      orderBy: { row_number: "asc" },
      select: { block_id: true, row_number: true, data_json: true },
    });
    if (blocks.length > 0) {
      const rowsByBlock = new Map<string, Array<Record<string, unknown>>>();
      for (const block of blocks) rowsByBlock.set(block.id, []);
      for (const record of records) {
        if (record.block_id && rowsByBlock.has(record.block_id)) {
          rowsByBlock.get(record.block_id)?.push(record.data_json as Record<string, unknown>);
        }
      }
      return {
        snapshot: { id: snapshot.id, created_at: snapshot.created_at },
        job: {
          id: job.id,
          report_model_version_id: job.report_model_version_id,
          requester_id: job.requester_id,
        },
        rows: [],
        blocks: blocks.map((block) => ({
          source: block.source,
          label: block.label,
          columns: block.columns_json as ReportResultColumn[],
          rows: rowsByBlock.get(block.id) ?? [],
        })),
      };
    }
    return {
      snapshot: { id: snapshot.id, created_at: snapshot.created_at },
      job: {
        id: job.id,
        report_model_version_id: job.report_model_version_id,
        requester_id: job.requester_id,
      },
      rows: records.map((record) => record.data_json as Record<string, unknown>),
    };
  }

  async assertExportable(input: {
    organizationId: string;
    userId: string;
    snapshotId: string;
    allowShared?: boolean;
  }): Promise<void> {
    const snapshot = await this.prisma.reportSnapshot.findFirst({
      where: {
        id: input.snapshotId,
        organization_id: input.organizationId,
        OR: [{ expires_at: null }, { expires_at: { gt: new Date() } }],
      },
    });
    if (!snapshot) throw new ServiceError(404, "Resultado do relatório não encontrado.");

    const job = await this.prisma.reportJob.findFirst({
      where: {
        id: snapshot.report_job_id,
        organization_id: input.organizationId,
        ...(input.allowShared ? {} : { requester_id: input.userId }),
        status: "completed",
      },
      select: { id: true },
    });
    if (!job) throw new ServiceError(404, "Resultado do relatório não encontrado.");
  }
}
