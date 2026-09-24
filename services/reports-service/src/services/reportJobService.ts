import { ServiceError } from "@workspace/shared";

import type { Prisma } from "../generated/prisma/client.js";
import type { ReportsPrismaClient } from "../prisma/index.js";
import type { ReportComposition } from "../schemas/reportComposition.schemas.js";
import type { ReportDefinition } from "../schemas/reportDefinition.schemas.js";
import { DEFAULT_REPORT_RETENTION_DAYS } from "../schemas/reportRetention.schemas.js";

function isUniqueConstraintViolation(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: unknown }).code === "P2002"
  );
}

export interface CreateReportJobInput {
  organizationId: string;
  userId: string;
  modelVersionId: string;
  payload: Record<string, unknown>;
  idempotencyKey?: string;
  idempotencyHash?: string;
}

export interface ReportHistoryItem {
  id: string;
  report_model_version_id: string;
  requester_id: string;
  status: string;
  requested_at: Date;
  started_at: Date | null;
  finished_at: Date | null;
  error_message: string | null;
}

export interface ReportJobView {
  id: string;
  status: string;
  error_message: string | null;
}

export class ReportJobService {
  constructor(private readonly prisma: ReportsPrismaClient) {}

  async create(input: CreateReportJobInput): Promise<{ id: string; status: string }> {
    this.validateIdempotency(input.idempotencyKey, input.idempotencyHash);
    const previous = await this.findIdempotentJob(input);
    if (previous) return previous;

    try {
      return await this.prisma.reportJob.create({
        data: {
          organization_id: input.organizationId,
          requester_id: input.userId,
          report_model_version_id: input.modelVersionId,
          status: "queued",
          payload_json: input.payload as Prisma.InputJsonValue,
          ...(input.idempotencyKey
            ? { idempotency_key: input.idempotencyKey, idempotency_hash: input.idempotencyHash }
            : {}),
        },
        select: { id: true, status: true },
      });
    } catch (error) {
      if (!input.idempotencyKey || !isUniqueConstraintViolation(error)) throw error;
      const raced = await this.findIdempotentJob(input);
      if (!raced) throw error;
      return raced;
    }
  }

  async createFromDefinition(input: {
    organizationId: string;
    userId: string;
    definition: ReportDefinition | ReportComposition;
    payload: Record<string, unknown>;
    idempotencyKey?: string;
    idempotencyHash?: string;
  }): Promise<{ id: string; status: string }> {
    this.validateIdempotency(input.idempotencyKey, input.idempotencyHash);
    const previous = await this.findIdempotentJob(input);
    if (previous) return previous;

    try {
      return await this.prisma.$transaction(async (transaction) => {
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
            definition_json: input.definition as Prisma.InputJsonValue,
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
            ...(input.idempotencyKey
              ? { idempotency_key: input.idempotencyKey, idempotency_hash: input.idempotencyHash }
              : {}),
          },
          select: { id: true, status: true },
        });
      });
    } catch (error) {
      if (!input.idempotencyKey || !isUniqueConstraintViolation(error)) throw error;
      const raced = await this.findIdempotentJob(input);
      if (!raced) throw error;
      return raced;
    }
  }

  private validateIdempotency(key?: string, hash?: string): void {
    if (Boolean(key) !== Boolean(hash)) {
      throw new ServiceError(
        400,
        "Idempotency-Key e o hash do comando devem ser informados juntos.",
      );
    }
  }

  private async findIdempotentJob(input: {
    organizationId: string;
    userId: string;
    idempotencyKey?: string;
    idempotencyHash?: string;
  }): Promise<{ id: string; status: string } | null> {
    if (!input.idempotencyKey) return null;
    const previous = await this.prisma.reportJob.findFirst({
      where: {
        organization_id: input.organizationId,
        requester_id: input.userId,
        idempotency_key: input.idempotencyKey,
      },
      select: { id: true, status: true, idempotency_hash: true },
    });
    if (!previous) return null;
    if (previous.idempotency_hash !== input.idempotencyHash) {
      throw new ServiceError(409, "Idempotency-Key já utilizada com outro comando.");
    }
    return { id: previous.id, status: previous.status };
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
      select: { id: true, status: true, error_message: true },
    });
    if (!job) throw new ServiceError(404, "Job de relatório não encontrado.");
    return job;
  }

  async getVersionId(input: { organizationId: string; id: string; userId?: string }) {
    const job = await this.prisma.reportJob.findFirst({
      where: {
        id: input.id,
        organization_id: input.organizationId,
        ...(input.userId ? { requester_id: input.userId } : {}),
      },
      select: { id: true, report_model_version_id: true },
    });
    if (!job) throw new ServiceError(404, "Job de relatório não encontrado.");
    return job;
  }

  async listHistory(input: {
    organizationId: string;
    userId: string;
    scope: "personal" | "library";
    departmentId?: string;
    status?: string;
    from?: Date;
    to?: Date;
    modelId?: string;
    authorId?: string;
    cursor?: number;
    limit: number;
  }): Promise<{ items: ReportHistoryItem[]; nextCursor: number | null }> {
    if (input.scope === "library" && !input.departmentId) {
      throw new ServiceError(403, "O acervo compartilhado exige departamento atual.");
    }
    if (input.scope === "personal" && input.authorId && input.authorId !== input.userId) {
      return { items: [], nextCursor: null };
    }

    let versionIds: string[] | undefined;
    if (input.scope === "library" || input.modelId) {
      const models = await this.prisma.reportModel.findMany({
        where: {
          organization_id: input.organizationId,
          ...(input.scope === "library"
            ? { department_id: input.departmentId, is_ephemeral: false }
            : {}),
          ...(input.modelId ? { id: input.modelId } : {}),
        },
        select: { id: true },
      });
      if (models.length === 0) return { items: [], nextCursor: null };

      const versions = await this.prisma.reportModelVersion.findMany({
        where: {
          organization_id: input.organizationId,
          report_model_id: { in: models.map((model) => model.id) },
        },
        select: { id: true },
      });
      if (versions.length === 0) return { items: [], nextCursor: null };
      versionIds = versions.map((version) => version.id);
    }

    const cursor = input.cursor ?? 0;
    const requestedAt = {
      ...(input.from ? { gte: input.from } : {}),
      ...(input.to ? { lte: input.to } : {}),
    };
    const jobs = await this.prisma.reportJob.findMany({
      where: {
        organization_id: input.organizationId,
        ...(input.scope === "personal"
          ? { requester_id: input.userId }
          : input.authorId
            ? { requester_id: input.authorId }
            : {}),
        ...(input.status ? { status: input.status } : {}),
        ...(Object.keys(requestedAt).length > 0 ? { requested_at: requestedAt } : {}),
        ...(versionIds ? { report_model_version_id: { in: versionIds } } : {}),
      },
      orderBy: { requested_at: "desc" },
      skip: cursor,
      take: input.limit + 1,
      select: {
        id: true,
        report_model_version_id: true,
        requester_id: true,
        status: true,
        requested_at: true,
        started_at: true,
        finished_at: true,
        error_message: true,
      },
    });
    const items = jobs.slice(0, input.limit) as ReportHistoryItem[];
    return {
      items,
      nextCursor: jobs.length > input.limit ? cursor + input.limit : null,
    };
  }

  async cancel(input: { organizationId: string; userId: string; id: string }): Promise<void> {
    const job = await this.prisma.reportJob.findFirst({
      where: {
        id: input.id,
        organization_id: input.organizationId,
        requester_id: input.userId,
      },
      select: { id: true, status: true, report_model_version_id: true },
    });
    if (!job) throw new ServiceError(404, "Job de relatório não encontrado.");
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
