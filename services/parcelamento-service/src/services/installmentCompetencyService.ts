import { error as logError, ServiceError } from "@workspace/shared";

import type { Prisma } from "../generated/prisma/client.js";
import type { ParcelamentoRequestContext } from "../middlewares/requestContext.js";
import type { ParcelamentoPrismaClient } from "../prisma/index.js";
import type {
  CreateInstallmentCompetencyBody,
  ListInstallmentCompetenciesQuery,
  PatchInstallmentCompetencyBody,
} from "../schemas/installmentCompetency.schemas.js";
import { createPage, getPaginationParams } from "../schemas/pagination.schemas.js";
import type { InstallmentService, ParcelamentoPage } from "./installmentService.js";
import {
  createAuditDiff,
  type ParcelamentoAuditAction,
  type RecordParcelamentoChangeInput,
  withoutOrganizationId,
} from "./parcelamentoAuditService.js";

export type InstallmentCompetencyServiceDependencies = {
  prisma: ParcelamentoPrismaClient;
  installmentService: Pick<InstallmentService, "recalculateAggregates">;
  auditService: { recordChange(input: RecordParcelamentoChangeInput): Promise<void> };
};

const competencySelect = {
  id: true,
  installment_id: true,
  competence: true,
  how_many_paid: true,
  how_many_overdue: true,
  download: true,
  download_notes: true,
  upload_file: true,
  is_sent: true,
  submission_type: true,
  notes: true,
  installment_amount: true,
  organization_id: true,
} as const;

type CompetencyRecord = Prisma.InstallmentCompetenciesGetPayload<{
  select: typeof competencySelect;
}>;

export type InstallmentCompetencyDto = Omit<CompetencyRecord, "organization_id">;

function requireContext(context: Pick<ParcelamentoRequestContext, "organizationId" | "userId">): {
  organizationId: string;
  userId: string;
} {
  if (!context.organizationId) {
    throw new ServiceError(400, "Contexto de organização ausente.");
  }

  if (!context.userId) {
    throw new ServiceError(400, "Contexto de usuário ausente.");
  }

  return { organizationId: context.organizationId, userId: context.userId };
}

function omitUndefined<T extends Record<string, unknown>>(input: T): Partial<T> {
  return Object.fromEntries(
    Object.entries(input).filter(([, value]) => value !== undefined),
  ) as Partial<T>;
}

function hasOwn(input: object, key: string): boolean {
  return Object.keys(input).includes(key);
}

function toCompetencyDto(competency: CompetencyRecord): InstallmentCompetencyDto {
  const { organization_id: _organizationId, ...dto } = competency;

  return dto;
}

function isPrismaUniqueError(err: unknown): boolean {
  return typeof err === "object" && err !== null && "code" in err && err.code === "P2002";
}

export class InstallmentCompetencyService {
  private readonly prisma: ParcelamentoPrismaClient;
  private readonly installmentService: Pick<InstallmentService, "recalculateAggregates">;
  private readonly auditService: {
    recordChange(input: RecordParcelamentoChangeInput): Promise<void>;
  };

  constructor({
    prisma,
    installmentService,
    auditService,
  }: InstallmentCompetencyServiceDependencies) {
    this.prisma = prisma;
    this.installmentService = installmentService;
    this.auditService = auditService;
  }

  async list(
    context: Pick<ParcelamentoRequestContext, "organizationId" | "userId">,
    installmentId: string,
    query: ListInstallmentCompetenciesQuery,
  ): Promise<ParcelamentoPage<InstallmentCompetencyDto>> {
    try {
      const { organizationId } = requireContext(context);
      await this.ensureParentInstallment(organizationId, installmentId);
      const { page, pageSize, skip, take } = getPaginationParams(query);
      const where = { installment_id: installmentId, organization_id: organizationId };

      const [total, items] = await Promise.all([
        this.prisma.installmentCompetencies.count({ where }),
        this.prisma.installmentCompetencies.findMany({
          where,
          select: competencySelect,
          orderBy: { competence: "asc" },
          skip,
          take,
        }),
      ]);

      return createPage({ items: items.map(toCompetencyDto), total, page, pageSize });
    } catch (err: unknown) {
      logError("Erro ao listar competencias de parcelamento", { err });
      if (err instanceof ServiceError) throw err;
      throw new ServiceError(500, "Erro ao listar competencias de parcelamento.", err);
    }
  }

  async create(
    context: ParcelamentoRequestContext,
    installmentId: string,
    input: CreateInstallmentCompetencyBody,
  ): Promise<InstallmentCompetencyDto> {
    try {
      const { organizationId } = requireContext(context);
      await this.ensureParentInstallment(organizationId, installmentId);
      await this.ensureUniqueCompetence(organizationId, installmentId, input.competence);

      const created = await this.prisma.installmentCompetencies.create({
        data: {
          installment_id: installmentId,
          competence: input.competence,
          how_many_paid: input.how_many_paid,
          how_many_overdue: input.how_many_overdue,
          download: input.download,
          download_notes: input.download_notes,
          upload_file: input.upload_file,
          is_sent: input.is_sent,
          submission_type: input.submission_type,
          notes: input.notes,
          installment_amount: input.installment_amount,
          organization_id: organizationId,
        },
        select: competencySelect,
      });

      await this.installmentService.recalculateAggregates(context, installmentId);
      await this.recordAudit({
        context,
        action: "Cadastro",
        referringId: created.id,
        changes: withoutOrganizationId(created),
      });

      return toCompetencyDto(created);
    } catch (err: unknown) {
      logError("Erro ao criar competencia de parcelamento", { err });
      if (err instanceof ServiceError) throw err;
      if (isPrismaUniqueError(err)) {
        throw new ServiceError(409, "Já existe competência para este parcelamento.", err);
      }
      throw new ServiceError(500, "Erro ao criar competencia de parcelamento.", err);
    }
  }

  async patch(
    context: ParcelamentoRequestContext,
    id: string,
    input: PatchInstallmentCompetencyBody,
  ): Promise<InstallmentCompetencyDto> {
    try {
      const { organizationId } = requireContext(context);
      const existing = await this.findByIdOrThrow(organizationId, id);
      const data = omitUndefined({
        how_many_paid: input.how_many_paid,
        how_many_overdue: input.how_many_overdue,
        download: input.download,
        download_notes: hasOwn(input, "download_notes") ? input.download_notes : undefined,
        upload_file: hasOwn(input, "upload_file") ? input.upload_file : undefined,
        is_sent: hasOwn(input, "is_sent") ? input.is_sent : undefined,
        submission_type: hasOwn(input, "submission_type") ? input.submission_type : undefined,
        notes: hasOwn(input, "notes") ? input.notes : undefined,
        installment_amount: input.installment_amount,
      });

      await this.prisma.installmentCompetencies.updateMany({
        where: { id, organization_id: organizationId },
        data,
      });
      const updated = await this.findByIdOrThrow(organizationId, id);

      if (this.shouldRecalculateAfterPatch(input)) {
        await this.installmentService.recalculateAggregates(context, existing.installment_id);
      }

      await this.recordAudit({
        context,
        action: "Atualizacao",
        referringId: id,
        changes: createAuditDiff(existing, data as Record<string, unknown>),
      });

      return toCompetencyDto(updated);
    } catch (err: unknown) {
      logError("Erro ao atualizar competencia de parcelamento", { err });
      if (err instanceof ServiceError) throw err;
      throw new ServiceError(500, "Erro ao atualizar competencia de parcelamento.", err);
    }
  }

  private async ensureParentInstallment(
    organizationId: string,
    installmentId: string,
  ): Promise<void> {
    const installment = await this.prisma.installment.findFirst({
      where: { id: installmentId, organization_id: organizationId },
    });

    if (!installment) {
      throw new ServiceError(404, "Parcelamento não encontrado.");
    }
  }

  private async ensureUniqueCompetence(
    organizationId: string,
    installmentId: string,
    competence: string,
  ): Promise<void> {
    const existing = await this.prisma.installmentCompetencies.findFirst({
      where: {
        organization_id: organizationId,
        installment_id: installmentId,
        competence,
      },
    });

    if (existing) {
      throw new ServiceError(409, "Já existe competência para este parcelamento.");
    }
  }

  private async findByIdOrThrow(organizationId: string, id: string): Promise<CompetencyRecord> {
    const competency = await this.prisma.installmentCompetencies.findFirst({
      where: { id, organization_id: organizationId },
      select: competencySelect,
    });

    if (!competency) {
      throw new ServiceError(404, "Competência de parcelamento não encontrada.");
    }

    return competency;
  }

  private shouldRecalculateAfterPatch(input: PatchInstallmentCompetencyBody): boolean {
    return (
      hasOwn(input, "how_many_paid") ||
      hasOwn(input, "how_many_overdue") ||
      hasOwn(input, "installment_amount")
    );
  }

  private async recordAudit(input: {
    context: ParcelamentoRequestContext;
    action: ParcelamentoAuditAction;
    referringId: string;
    changes: Record<string, unknown>;
  }): Promise<void> {
    const { organizationId, userId } = requireContext(input.context);

    try {
      await this.auditService.recordChange({
        requestId: input.context.requestId,
        organizationId,
        userId,
        permission: input.context.permission ?? null,
        action: input.action,
        referring: "parcelamento.installmentsCompetencies",
        referringId: input.referringId,
        changes: input.changes,
      });
    } catch (err: unknown) {
      logError("Falha ao auditar competencia de parcelamento", { err });
    }
  }
}
