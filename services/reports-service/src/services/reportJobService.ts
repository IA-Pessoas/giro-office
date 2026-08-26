import { ServiceError } from "@workspace/shared";

import type { Prisma } from "../generated/prisma/client.js";
import type { ReportsPrismaClient } from "../prisma/index.js";
import type { ReportDefinition } from "../schemas/reportDefinition.schemas.js";
import { DEFAULT_REPORT_RETENTION_DAYS } from "../schemas/reportRetention.schemas.js";

export interface CreateReportJobInput {
  organizationId: string;
  userId: string;
  modelVersionId: string;
  payload: Record<string, unknown>;
}

export interface ReportHistoryItem {
  id: string;
  report_model_version_id: string;
  status: string;
  requested_at: Date;
  started_at: Date | null;
  finished_at: Date | null;
}

export class ReportJobService {
  constructor(private readonly prisma: ReportsPrismaClient) {}

  async create(input: CreateReportJobInput): Promise<{ id: string; status: string }> {
    return this.prisma.reportJob.create({
      data: {
        organization_id: input.organizationId,
        requester_id: input.userId,
        report_model_version_id: input.modelVersionId,
        status: "queued",
        payload_json: input.payload as Prisma.InputJsonValue,
      },
    });
  }

  async createFromDefinition(input: {
    organizationId: string;
    userId: string;
    definition: ReportDefinition;
    payload: Record<string, unknown>;
  }): Promise<{ id: string; status: string }> {
    return this.prisma.$transaction(async (transaction) => {
      const model = await transaction.reportModel.create({
        data: {
          organization_id: input.organizationId,
          created_by_user_id: input.userId,
          department_id: null,
          name: "Execução avulsa",
          is_ephemeral: true,
        },
      });
      const version = await transaction.reportModelVersion.create({
        data: {
          organization_id: input.organizationId,
          report_model_id: model.id,
          version: 1,
          definition_json: input.definition,
        },
      });
      const retentionDays = await this.getRetentionDaysFor(
        transaction as ReportsPrismaClient,
        input.organizationId,
        model.id,
      );
      return transaction.reportJob.create({
        data: {
          organization_id: input.organizationId,
          requester_id: input.userId,
          report_model_version_id: version.id,
          status: "queued",
          payload_json: { ...input.payload, retentionDays } as Prisma.InputJsonValue,
        },
      });
    });
  }

  async getVersion(input: {
    organizationId: string;
    modelVersionId: string;
    includeEphemeral?: boolean;
  }) {
    const version = await this.prisma.reportModelVersion.findFirst({
      where: { id: input.modelVersionId, organization_id: input.organizationId },
    });
    if (!version) throw new ServiceError(404, "Versão de modelo de relatório não encontrada.");
    const model = await this.prisma.reportModel.findFirst({
      where: {
        id: version.report_model_id,
        organization_id: input.organizationId,
        active: true,
        ...(input.includeEphemeral ? {} : { is_ephemeral: false }),
      },
    });
    if (!model) throw new ServiceError(404, "Modelo de relatório não encontrado.");
    return { version, model };
  }

  async getRetentionDays(input: { organizationId: string; modelId: string }): Promise<number> {
    return this.getRetentionDaysFor(this.prisma, input.organizationId, input.modelId);
  }

  async get(input: { organizationId: string; userId: string; id: string }) {
    const job = await this.prisma.reportJob.findFirst({
      where: {
        id: input.id,
        organization_id: input.organizationId,
        requester_id: input.userId,
      },
    });
    if (!job) throw new ServiceError(404, "Job de relatório não encontrado.");
    return job;
  }

  async listHistory(input: {
    organizationId: string;
    userId: string;
    cursor?: number;
    limit: number;
  }): Promise<{ items: ReportHistoryItem[]; nextCursor: number | null }> {
    const cursor = input.cursor ?? 0;
    const jobs = await this.prisma.reportJob.findMany({
      where: { organization_id: input.organizationId, requester_id: input.userId },
      orderBy: { requested_at: "desc" },
      skip: cursor,
      take: input.limit + 1,
      select: {
        id: true,
        report_model_version_id: true,
        status: true,
        requested_at: true,
        started_at: true,
        finished_at: true,
      },
    });
    const items = jobs.slice(0, input.limit) as ReportHistoryItem[];
    return {
      items,
      nextCursor: jobs.length > input.limit ? cursor + input.limit : null,
    };
  }

  async cancel(input: { organizationId: string; userId: string; id: string }): Promise<void> {
    const job = await this.get(input);
    if (job.status !== "queued" && job.status !== "processing") {
      throw new ServiceError(409, "O job já está em estado terminal.");
    }
    const updated = await this.prisma.$transaction(async (transaction) => {
      const updated = await transaction.reportJob.updateMany({
        where: { id: job.id, status: job.status },
        data:
          job.status === "queued"
            ? { status: "cancelled", finished_at: new Date() }
            : { cancel_requested_at: new Date() },
      });
      if (updated.count === 1 && job.status === "queued") {
        await this.removeEphemeralDefinition(
          transaction as ReportsPrismaClient,
          job.report_model_version_id,
        );
      }
      return updated;
    });
    if (updated.count !== 1) {
      throw new ServiceError(409, "O job foi alterado por outra operação.");
    }
  }

  private async getRetentionDaysFor(
    prisma: ReportsPrismaClient,
    organizationId: string,
    modelId: string,
  ): Promise<number> {
    const specific = await prisma.reportRetentionPolicy.findFirst({
      where: { organization_id: organizationId, report_model_id: modelId },
      orderBy: { updated_at: "desc" },
    });
    if (specific) return specific.retention_days;
    const organization = await prisma.reportRetentionPolicy.findFirst({
      where: { organization_id: organizationId, report_model_id: null },
      orderBy: { updated_at: "desc" },
    });
    return organization?.retention_days ?? DEFAULT_REPORT_RETENTION_DAYS;
  }

  private async removeEphemeralDefinition(
    prisma: ReportsPrismaClient,
    reportModelVersionId: string,
  ): Promise<void> {
    const version = await prisma.reportModelVersion.findFirst({
      where: { id: reportModelVersionId },
    });
    if (!version) return;
    const model = await prisma.reportModel.findFirst({
      where: { id: version.report_model_id, is_ephemeral: true },
    });
    if (!model) return;
    await prisma.reportModelVersion.deleteMany({ where: { report_model_id: model.id } });
    await prisma.reportModel.delete({ where: { id: model.id } });
  }
}
