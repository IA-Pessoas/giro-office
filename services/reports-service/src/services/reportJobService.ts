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

  async getVersion(input: { organizationId: string; modelVersionId: string }) {
    const version = await this.prisma.reportModelVersion.findFirst({
      where: { id: input.modelVersionId, organization_id: input.organizationId },
    });
    if (!version) throw new ServiceError(404, "Versão de modelo de relatório não encontrada.");
    const model = await this.prisma.reportModel.findFirst({
      where: { id: version.report_model_id, organization_id: input.organizationId, active: true },
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

  async cancel(input: { organizationId: string; userId: string; id: string }): Promise<void> {
    const job = await this.get(input);
    if (job.status !== "queued" && job.status !== "processing") {
      throw new ServiceError(409, "O job já está em estado terminal.");
    }
    const updated = await this.prisma.reportJob.updateMany({
      where: { id: job.id, status: job.status },
      data:
        job.status === "queued"
          ? { status: "cancelled", finished_at: new Date() }
          : { cancel_requested_at: new Date() },
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
}
