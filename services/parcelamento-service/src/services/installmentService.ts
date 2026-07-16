import { error as logError, ServiceError } from "@workspace/shared";

import type { Prisma } from "../generated/prisma/client.js";
import type { ParcelamentoRequestContext } from "../middlewares/requestContext.js";
import type { ParcelamentoPrismaClient } from "../prisma/index.js";
import type {
  CreateInstallmentBody,
  ListInstallmentsQuery,
  PatchInstallmentBody,
} from "../schemas/installment.schemas.js";
import { createPage, getPaginationParams } from "../schemas/pagination.schemas.js";
import {
  createAuditDiff,
  type ParcelamentoAuditAction,
  type RecordParcelamentoChangeInput,
  withoutOrganizationId,
} from "./parcelamentoAuditService.js";

const CLOSED_INSTALLMENT_STATUSES = new Set(["Liquidado", "Cancelado", "Encerrado", "Inativo"]);
const ACTIVE_INSTALLMENT_STATUS = "Ativo";
const SETTLED_INSTALLMENT_STATUS = "Liquidado";

type InstallmentDateInput = Date | string | null | undefined;

export type CreateInstallmentInput = Omit<CreateInstallmentBody, "enrollment_date"> & {
  enrollment_date?: InstallmentDateInput;
};

export type PatchInstallmentInput = Omit<
  PatchInstallmentBody,
  "enrollment_date" | "completion_date"
> & {
  enrollment_date?: InstallmentDateInput;
  completion_date?: InstallmentDateInput;
};

export type ParcelamentoPage<T> = {
  items: T[];
  total: number;
  page: number;
  page_size: number;
  has_more: boolean;
};

export type InstallmentServiceDependencies = {
  prisma: ParcelamentoPrismaClient;
  auditService: { recordChange(input: RecordParcelamentoChangeInput): Promise<void> };
  clock?: () => Date;
};

const installmentSelect = {
  id: true,
  client_id: true,
  type: true,
  jurisdiction: true,
  is_automatic_debit: true,
  consolidated_total_amount: true,
  first_installment_amount: true,
  current_month_installment_amount: true,
  outstanding_balance: true,
  paid_installments_count: true,
  agreed_installments_count: true,
  remaining_installments_count: true,
  overdue_installments_count: true,
  enrollment_date: true,
  document_url: true,
  status: true,
  completion_date: true,
  down_payment_installments_count: true,
  legal_nature: true,
  situation_shutdown: true,
  agreement_number: true,
  organization_id: true,
} as const;

type InstallmentRecord = Prisma.InstallmentGetPayload<{ select: typeof installmentSelect }>;
type InstallmentRepository = Pick<ParcelamentoPrismaClient, "installment">;

export type InstallmentDto = Omit<InstallmentRecord, "organization_id">;

function normalizeAgreementNumber(value: string | null | undefined): string | null {
  if (value === undefined || value === null) return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function toDateOrNull(value: InstallmentDateInput): Date | null {
  if (value === undefined || value === null) {
    return null;
  }

  return value instanceof Date ? value : new Date(value);
}

function omitUndefined<T extends Record<string, unknown>>(input: T): Partial<T> {
  return Object.fromEntries(
    Object.entries(input).filter(([, value]) => value !== undefined),
  ) as Partial<T>;
}

function hasOwn(input: object, key: string): boolean {
  return Object.keys(input).includes(key);
}

function toInstallmentDto(installment: InstallmentRecord): InstallmentDto {
  const { organization_id: _organizationId, ...dto } = installment;

  return dto;
}

function isPrismaUniqueError(err: unknown): boolean {
  return typeof err === "object" && err !== null && "code" in err && err.code === "P2002";
}

function requireContext(context: Pick<ParcelamentoRequestContext, "organizationId" | "userId">): {
  organizationId: string;
  userId: string;
} {
  if (!context.organizationId) {
    throw new ServiceError(400, "Contexto de organizacao ausente.");
  }

  if (!context.userId) {
    throw new ServiceError(400, "Contexto de usuario ausente.");
  }

  return { organizationId: context.organizationId, userId: context.userId };
}

export class InstallmentService {
  private readonly prisma: ParcelamentoPrismaClient;
  private readonly auditService: {
    recordChange(input: RecordParcelamentoChangeInput): Promise<void>;
  };
  private readonly clock: () => Date;

  constructor({ prisma, auditService, clock }: InstallmentServiceDependencies) {
    this.prisma = prisma;
    this.auditService = auditService;
    this.clock = clock ?? (() => new Date());
  }

  async list(
    context: Pick<ParcelamentoRequestContext, "organizationId" | "userId">,
    query: ListInstallmentsQuery,
  ): Promise<ParcelamentoPage<InstallmentDto>> {
    try {
      const { organizationId } = requireContext(context);
      const { page, pageSize, skip, take } = getPaginationParams(query);
      const where = omitUndefined({
        organization_id: organizationId,
        client_id: query.client_id,
        status: query.status,
        type: query.type,
        jurisdiction: query.jurisdiction,
        ...(query.search
          ? {
              OR: [
                { type: { contains: query.search } },
                { legal_nature: { contains: query.search } },
                { jurisdiction: { contains: query.search } },
                { status: { contains: query.search } },
              ],
            }
          : {}),
      });

      const [total, items] = await Promise.all([
        this.prisma.installment.count({ where }),
        this.prisma.installment.findMany({
          where,
          select: installmentSelect,
          orderBy: { id: "asc" },
          skip,
          take,
        }),
      ]);

      return createPage({ items: items.map(toInstallmentDto), total, page, pageSize });
    } catch (err: unknown) {
      logError("Erro ao listar parcelamentos", { err });
      if (err instanceof ServiceError) throw err;
      throw new ServiceError(500, "Erro ao listar parcelamentos.", err);
    }
  }

  async create(
    context: ParcelamentoRequestContext,
    input: CreateInstallmentInput,
  ): Promise<InstallmentDto> {
    try {
      const { organizationId } = requireContext(context);
      await this.ensureClient(organizationId, input.client_id);

      const agreementNumber = normalizeAgreementNumber(input.agreement_number);
      const enrollmentDate = toDateOrNull(input.enrollment_date);

      const identityInput = {
        organizationId,
        agreementNumber,
        clientId: input.client_id,
        type: input.type,
        legalNature: input.legal_nature,
        jurisdiction: input.jurisdiction,
        enrollmentDate,
      };

      const data = {
        client_id: input.client_id,
        type: input.type,
        jurisdiction: input.jurisdiction,
        is_automatic_debit: input.is_automatic_debit,
        consolidated_total_amount: 0,
        first_installment_amount: input.first_installment_amount,
        current_month_installment_amount: input.current_month_installment_amount,
        outstanding_balance: 0,
        paid_installments_count: 0,
        agreed_installments_count: input.agreed_installments_count,
        remaining_installments_count: input.agreed_installments_count,
        overdue_installments_count: 0,
        enrollment_date: enrollmentDate,
        document_url: "",
        status: ACTIVE_INSTALLMENT_STATUS,
        completion_date: null,
        down_payment_installments_count: 0,
        legal_nature: input.legal_nature,
        situation_shutdown: null,
        agreement_number: agreementNumber,
        organization_id: organizationId,
      };

      const createRecord = async (db: InstallmentRepository) => {
        await this.ensureUniqueIdentity(db, identityInput);

        return db.installment.create({
          data,
          select: installmentSelect,
        });
      };

      const created = agreementNumber
        ? await createRecord(this.prisma)
        : await this.prisma.$transaction(createRecord, { isolationLevel: "Serializable" });

      await this.recordAudit({
        context,
        action: "Cadastro",
        referringId: created.id,
        changes: withoutOrganizationId(created),
      });

      return toInstallmentDto(created);
    } catch (err: unknown) {
      logError("Erro ao criar parcelamento", { err });
      if (err instanceof ServiceError) throw err;
      if (isPrismaUniqueError(err)) {
        throw new ServiceError(409, "Ja existe parcelamento com este numero de acordo.", err);
      }
      throw new ServiceError(500, "Erro ao criar parcelamento.", err);
    }
  }

  async getById(
    context: Pick<ParcelamentoRequestContext, "organizationId" | "userId">,
    id: string,
  ): Promise<InstallmentDto> {
    try {
      const { organizationId } = requireContext(context);
      const installment = await this.findByIdOrThrow(organizationId, id);

      return toInstallmentDto(installment);
    } catch (err: unknown) {
      logError("Erro ao detalhar parcelamento", { err });
      if (err instanceof ServiceError) throw err;
      throw new ServiceError(500, "Erro ao detalhar parcelamento.", err);
    }
  }

  async patch(
    context: ParcelamentoRequestContext,
    id: string,
    input: PatchInstallmentInput,
  ): Promise<InstallmentDto> {
    try {
      const { organizationId } = requireContext(context);
      if (Object.keys(input).length === 0) {
        throw new ServiceError(400, "Informe ao menos um campo para atualizar.");
      }

      const existing = await this.findByIdOrThrow(organizationId, id);
      const nextAgreementNumber = hasOwn(input, "agreement_number")
        ? normalizeAgreementNumber(input.agreement_number)
        : existing.agreement_number;
      const nextEnrollmentDate = hasOwn(input, "enrollment_date")
        ? toDateOrNull(input.enrollment_date)
        : existing.enrollment_date;

      const identityInput = {
        organizationId,
        agreementNumber: nextAgreementNumber,
        clientId: existing.client_id,
        type: input.type ?? existing.type,
        legalNature: input.legal_nature ?? existing.legal_nature,
        jurisdiction: input.jurisdiction ?? existing.jurisdiction,
        enrollmentDate: nextEnrollmentDate,
        excludeId: id,
      };

      const data = omitUndefined({
        agreement_number: hasOwn(input, "agreement_number") ? nextAgreementNumber : undefined,
        type: input.type,
        legal_nature: input.legal_nature,
        jurisdiction: input.jurisdiction,
        is_automatic_debit: input.is_automatic_debit,
        consolidated_total_amount: input.consolidated_total_amount,
        first_installment_amount: input.first_installment_amount,
        current_month_installment_amount: input.current_month_installment_amount,
        agreed_installments_count: input.agreed_installments_count,
        enrollment_date: hasOwn(input, "enrollment_date") ? nextEnrollmentDate : undefined,
        document_url: input.document_url,
        situation_shutdown: hasOwn(input, "situation_shutdown")
          ? input.situation_shutdown
          : undefined,
        status: input.status,
        completion_date: hasOwn(input, "completion_date")
          ? toDateOrNull(input.completion_date)
          : undefined,
      });

      const updateRecord = async (db: InstallmentRepository) => {
        await this.ensureUniqueIdentity(db, identityInput);

        await db.installment.updateMany({
          where: { id, organization_id: organizationId },
          data,
        });
      };

      if (nextAgreementNumber) {
        await updateRecord(this.prisma);
      } else {
        await this.prisma.$transaction(updateRecord, { isolationLevel: "Serializable" });
      }

      await this.recordAudit({
        context,
        action: "Atualizacao",
        referringId: id,
        changes: createAuditDiff(existing, data as Record<string, unknown>),
      });

      if (this.shouldRecalculateAfterPatch(input)) {
        return this.recalculateAggregates(context, id);
      }

      const updated = await this.findByIdOrThrow(organizationId, id);

      return toInstallmentDto(updated);
    } catch (err: unknown) {
      logError("Erro ao atualizar parcelamento", { err });
      if (err instanceof ServiceError) throw err;
      if (isPrismaUniqueError(err)) {
        throw new ServiceError(409, "Ja existe parcelamento com este numero de acordo.", err);
      }
      throw new ServiceError(500, "Erro ao atualizar parcelamento.", err);
    }
  }

  async recalculateAggregates(
    context: ParcelamentoRequestContext,
    installmentId: string,
  ): Promise<InstallmentDto> {
    try {
      const { organizationId } = requireContext(context);
      const installment = await this.findByIdOrThrow(organizationId, installmentId);
      const competencies = await this.prisma.installmentCompetencies.findMany({
        where: { installment_id: installmentId, organization_id: organizationId },
      });

      const paidInstallmentsCount = competencies.reduce((sum, item) => sum + item.how_many_paid, 0);
      const overdueRaw = competencies.reduce((sum, item) => sum + item.how_many_overdue, 0);
      const overdueInstallmentsCount = Math.max(overdueRaw - paidInstallmentsCount, 0);
      const remainingInstallmentsCount = Math.max(
        installment.agreed_installments_count - paidInstallmentsCount,
        0,
      );
      const outstandingBalance =
        remainingInstallmentsCount * installment.current_month_installment_amount;

      const statusData =
        remainingInstallmentsCount === 0
          ? {
              status: SETTLED_INSTALLMENT_STATUS,
              completion_date: installment.completion_date ?? this.clock(),
            }
          : installment.status === SETTLED_INSTALLMENT_STATUS
            ? {
                status: ACTIVE_INSTALLMENT_STATUS,
                completion_date: null,
              }
            : {};

      await this.prisma.installment.updateMany({
        where: { id: installmentId, organization_id: organizationId },
        data: {
          paid_installments_count: paidInstallmentsCount,
          overdue_installments_count: overdueInstallmentsCount,
          remaining_installments_count: remainingInstallmentsCount,
          outstanding_balance: outstandingBalance,
          ...statusData,
        },
      });
      const updated = await this.findByIdOrThrow(organizationId, installmentId);

      return toInstallmentDto(updated);
    } catch (err: unknown) {
      logError("Erro ao recalcular agregados do parcelamento", { err });
      if (err instanceof ServiceError) throw err;
      if (isPrismaUniqueError(err)) {
        throw new ServiceError(409, "Ja existe parcelamento com este numero de acordo.", err);
      }
      throw new ServiceError(500, "Erro ao recalcular agregados do parcelamento.", err);
    }
  }

  private async ensureClient(organizationId: string, clientId: string): Promise<void> {
    const client = await this.prisma.client.findFirst({
      where: { id: clientId, organization_id: organizationId },
    });

    if (!client) {
      throw new ServiceError(404, "Cliente nao encontrado para a organizacao.");
    }
  }

  private async findByIdOrThrow(organizationId: string, id: string): Promise<InstallmentRecord> {
    const installment = await this.prisma.installment.findFirst({
      where: { id, organization_id: organizationId },
      select: installmentSelect,
    });

    if (!installment) {
      throw new ServiceError(404, "Parcelamento nao encontrado.");
    }

    return installment;
  }

  private async ensureUniqueIdentity(
    db: InstallmentRepository,
    input: {
      organizationId: string;
      agreementNumber: string | null;
      clientId: string;
      type: string;
      legalNature: string;
      jurisdiction: string;
      enrollmentDate: Date | null;
      excludeId?: string;
    },
  ): Promise<void> {
    if (input.agreementNumber) {
      const existingAgreement = await db.installment.findFirst({
        where: {
          organization_id: input.organizationId,
          agreement_number: input.agreementNumber,
          ...(input.excludeId ? { NOT: { id: input.excludeId } } : {}),
        },
      });

      if (existingAgreement) {
        throw new ServiceError(409, "Ja existe parcelamento com este numero de acordo.");
      }

      return;
    }

    const existingFallback = await db.installment.findFirst({
      where: {
        organization_id: input.organizationId,
        client_id: input.clientId,
        type: input.type,
        legal_nature: input.legalNature,
        jurisdiction: input.jurisdiction,
        enrollment_date: input.enrollmentDate,
        status: { notIn: Array.from(CLOSED_INSTALLMENT_STATUSES) },
        ...(input.excludeId ? { NOT: { id: input.excludeId } } : {}),
      },
    });

    if (existingFallback) {
      throw new ServiceError(409, "Ja existe parcelamento ativo para este escopo operacional.");
    }
  }

  private shouldRecalculateAfterPatch(input: PatchInstallmentInput): boolean {
    return (
      hasOwn(input, "agreed_installments_count") ||
      hasOwn(input, "consolidated_total_amount") ||
      hasOwn(input, "current_month_installment_amount")
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
        referring: "parcelamento.installments",
        referringId: input.referringId,
        changes: input.changes,
      });
    } catch (err: unknown) {
      logError("Falha ao auditar parcelamento", { err });
    }
  }
}
