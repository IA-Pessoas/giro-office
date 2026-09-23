import type {
  CreateInstallmentBody,
  ListInstallmentsQuery,
  PatchInstallmentBody,
} from "@workspace/parcelamento-service/src/schemas/installment.schemas.js";
import type {
  CreateInstallmentCompetencyBody,
  ListInstallmentCompetenciesQuery,
  PatchInstallmentCompetencyBody,
} from "@workspace/parcelamento-service/src/schemas/installmentCompetency.schemas.js";
import {
  createPage,
  getPaginationParams,
} from "@workspace/parcelamento-service/src/schemas/pagination.schemas.js";
import type {
  CreatePanoramaBody,
  ListPanoramasQuery,
  PatchPanoramaBody,
} from "@workspace/parcelamento-service/src/schemas/panorama.schemas.js";
import {
  executeReportingQuery,
  getParcelamentoReportingFields,
  type ParcelamentoReportingSource,
  type ReportingQuery,
  withReportingSnapshot,
} from "@workspace/shared";
import { ServiceError } from "@workspace/shared/http";
import type {
  ParcelamentoAudit,
  ParcelamentoAuditAction,
  ParcelamentoAuditReferring,
} from "./audit.js";
import type { PrismaClient } from "./prisma.js";

/** Contrato portado de services/parcelamento-service/src/services/*.ts. */

export type ParcelamentoPrisma = PrismaClient;
type InstallmentRepository = Pick<ParcelamentoPrisma, "installment">;
/** Cliente raiz ou de transação interativa: o que o recálculo e as competências usam. */
type ParcelamentoDb = Pick<
  ParcelamentoPrisma,
  "installment" | "installmentCompetencies" | "$queryRaw"
>;
type Row = Record<string, unknown>;

export interface ParcelamentoRequestContext {
  requestId: string;
  userId: string;
  organizationId: string;
  permission?: string;
}

const CLOSED_INSTALLMENT_STATUSES = ["Liquidado", "Cancelado", "Encerrado", "Inativo"];
const ACTIVE_STATUS = "Ativo";
const SETTLED_STATUS = "Liquidado";

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

const panoramaSelect = {
  id: true,
  competence: true,
  cnd_municipal: true,
  cnd_state: true,
  cnd_federal: true,
  cnd_fgts: true,
  cnd_labor: true,
  protests: true,
  state_tax_situation: true,
  federal_tax_situation: true,
  responsavel_id: true,
  client_id: true,
  organization_id: true,
} as const;

const panoramaDefaults = {
  cnd_municipal: false,
  cnd_state: false,
  cnd_federal: false,
  cnd_fgts: false,
  cnd_labor: false,
  protests: false,
  state_tax_situation: false,
  federal_tax_situation: false,
};

function withoutOrganizationId<T extends { organization_id?: unknown }>(
  row: T,
): Omit<T, "organization_id"> {
  const { organization_id: _organizationId, ...data } = row;
  return data;
}

function omitUndefined<T extends Row>(input: T): Partial<T> {
  return Object.fromEntries(
    Object.entries(input).filter(([, value]) => value !== undefined),
  ) as Partial<T>;
}

function hasOwn(input: object, key: string): boolean {
  return Object.hasOwn(input, key);
}

function auditDiff(previous: object, next: Row): Record<string, { from: unknown; to: unknown }> {
  const before = previous as Row;
  const diff: Record<string, { from: unknown; to: unknown }> = {};
  for (const [key, value] of Object.entries(next)) {
    if (before[key] !== value) diff[key] = { from: before[key], to: value };
  }
  return diff;
}

function toDateOrNull(value: Date | string | null | undefined): Date | null {
  if (value === undefined || value === null) return null;
  return value instanceof Date ? value : new Date(value);
}

function normalizeAgreementNumber(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function isUniqueError(error: unknown): boolean {
  return (
    typeof error === "object" && error !== null && (error as { code?: unknown }).code === "P2002"
  );
}

/** Espelha o try/catch dos services do Node: ServiceError passa, P2002 vira 409, resto 500. */
async function guard<T>(
  message: string,
  run: () => Promise<T>,
  conflictMessage?: string,
): Promise<T> {
  try {
    return await run();
  } catch (error) {
    if (error instanceof ServiceError) throw error;
    if (conflictMessage && isUniqueError(error)) {
      throw new ServiceError(409, conflictMessage, error);
    }
    throw new ServiceError(500, message, error);
  }
}

async function recordAudit(
  audit: ParcelamentoAudit,
  context: ParcelamentoRequestContext,
  referring: ParcelamentoAuditReferring,
  action: ParcelamentoAuditAction,
  referringId: string,
  changes: Row,
): Promise<void> {
  try {
    await audit.recordChange({
      requestId: context.requestId,
      organizationId: context.organizationId,
      userId: context.userId,
      permission: context.permission ?? null,
      action,
      referring,
      referringId,
      changes,
    });
  } catch (error) {
    // Node: auditoria é best-effort após a mutação persistida; falha fica observável no log.
    console.error({
      event: "parcelamento.audit.failed",
      requestId: context.requestId,
      referring,
      referringId,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

/**
 * Recálculo e a escrita que o motivou rodam na mesma transação READ COMMITTED, com lock
 * `FOR NO KEY UPDATE` na linha do parcelamento. O próximo escritor espera o commit e, como
 * em READ COMMITTED cada comando lê um snapshot novo, soma as competências já gravadas.
 * NO KEY (e não FOR UPDATE) para não conflitar com o FOR KEY SHARE de FKs. Diverge do Node,
 * que recalcula fora de transação e pode gravar totais de uma leitura antiga.
 */
const RECALC_TRANSACTION = { isolationLevel: "ReadCommitted" } as const;

async function ensureClient(prisma: ParcelamentoPrisma, organizationId: string, clientId: string) {
  const client = await prisma.client.findFirst({
    where: { id: clientId, organization_id: organizationId },
  });
  if (!client) throw new ServiceError(404, "Cliente nao encontrado para a organizacao.");
}

export function createInstallmentService(
  prisma: ParcelamentoPrisma,
  audit: ParcelamentoAudit,
  clock: () => Date = () => new Date(),
) {
  const findByIdOrThrow = async (
    organizationId: string,
    id: string,
    db: ParcelamentoDb = prisma,
  ) => {
    const installment = await db.installment.findFirst({
      where: { id, organization_id: organizationId },
      select: installmentSelect,
    });
    if (!installment) throw new ServiceError(404, "Parcelamento nao encontrado.");
    return installment;
  };

  const ensureUniqueIdentity = async (
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
  ) => {
    const exclude = input.excludeId ? { NOT: { id: input.excludeId } } : {};
    if (input.agreementNumber) {
      const existing = await db.installment.findFirst({
        where: {
          organization_id: input.organizationId,
          agreement_number: input.agreementNumber,
          ...exclude,
        },
      });
      if (existing) {
        throw new ServiceError(409, "Ja existe parcelamento com este numero de acordo.");
      }
      return;
    }
    const existing = await db.installment.findFirst({
      where: {
        organization_id: input.organizationId,
        client_id: input.clientId,
        type: input.type,
        legal_nature: input.legalNature,
        jurisdiction: input.jurisdiction,
        enrollment_date: input.enrollmentDate,
        status: { notIn: CLOSED_INSTALLMENT_STATUSES },
        ...exclude,
      },
    });
    if (existing) {
      throw new ServiceError(409, "Ja existe parcelamento ativo para este escopo operacional.");
    }
  };

  /** Precisa rodar dentro de `$transaction(..., RECALC_TRANSACTION)`: `db` é o cliente dela. */
  const recalculateAggregates = (
    context: ParcelamentoRequestContext,
    installmentId: string,
    db: ParcelamentoDb,
  ) =>
    guard(
      "Erro ao recalcular agregados do parcelamento.",
      async () => {
        const { organizationId } = context;
        await db.$queryRaw`SELECT "id" FROM "parcelamento.installments" WHERE "id" = ${installmentId} AND "organization_id" = ${organizationId} FOR NO KEY UPDATE`;
        const installment = await findByIdOrThrow(organizationId, installmentId, db);
        const competencies = await db.installmentCompetencies.findMany({
          where: { installment_id: installmentId, organization_id: organizationId },
        });
        const paid = competencies.reduce((sum, item) => sum + item.how_many_paid, 0);
        const overdueRaw = competencies.reduce((sum, item) => sum + item.how_many_overdue, 0);
        const remaining = Math.max(installment.agreed_installments_count - paid, 0);
        const statusData =
          remaining === 0
            ? { status: SETTLED_STATUS, completion_date: installment.completion_date ?? clock() }
            : installment.status === SETTLED_STATUS
              ? { status: ACTIVE_STATUS, completion_date: null }
              : {};

        await db.installment.updateMany({
          where: { id: installmentId, organization_id: organizationId },
          data: {
            paid_installments_count: paid,
            overdue_installments_count: Math.max(overdueRaw - paid, 0),
            remaining_installments_count: remaining,
            outstanding_balance: remaining * installment.current_month_installment_amount,
            ...statusData,
          },
        });
        return withoutOrganizationId(await findByIdOrThrow(organizationId, installmentId, db));
      },
      "Ja existe parcelamento com este numero de acordo.",
    );

  return {
    recalculateAggregates,

    list: (context: ParcelamentoRequestContext, query: ListInstallmentsQuery) =>
      guard("Erro ao listar parcelamentos.", async () => {
        const { page, pageSize, skip, take } = getPaginationParams(query);
        const where = omitUndefined({
          organization_id: context.organizationId,
          client_id: query.client_id,
          status: query.status,
          type: query.type,
          jurisdiction: query.jurisdiction,
          OR: query.search
            ? [
                { type: { contains: query.search } },
                { legal_nature: { contains: query.search } },
                { jurisdiction: { contains: query.search } },
                { status: { contains: query.search } },
              ]
            : undefined,
        });
        const [total, items] = await Promise.all([
          prisma.installment.count({ where }),
          prisma.installment.findMany({
            where,
            select: installmentSelect,
            orderBy: { id: "asc" },
            skip,
            take,
          }),
        ]);
        return createPage({ items: items.map(withoutOrganizationId), total, page, pageSize });
      }),

    getById: (context: ParcelamentoRequestContext, id: string) =>
      guard("Erro ao detalhar parcelamento.", async () =>
        withoutOrganizationId(await findByIdOrThrow(context.organizationId, id)),
      ),

    create: (context: ParcelamentoRequestContext, input: CreateInstallmentBody) =>
      guard(
        "Erro ao criar parcelamento.",
        async () => {
          const { organizationId } = context;
          await ensureClient(prisma, organizationId, input.client_id);
          const agreementNumber = normalizeAgreementNumber(input.agreement_number);
          const enrollmentDate = toDateOrNull(input.enrollment_date);
          const createRecord = async (db: InstallmentRepository) => {
            await ensureUniqueIdentity(db, {
              organizationId,
              agreementNumber,
              clientId: input.client_id,
              type: input.type,
              legalNature: input.legal_nature,
              jurisdiction: input.jurisdiction,
              enrollmentDate,
            });
            return db.installment.create({
              data: {
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
                status: ACTIVE_STATUS,
                completion_date: null,
                down_payment_installments_count: 0,
                legal_nature: input.legal_nature,
                situation_shutdown: null,
                agreement_number: agreementNumber,
                organization_id: organizationId,
              },
              select: installmentSelect,
            });
          };
          // Sem número de acordo não há índice único: a checagem de escopo roda em Serializable.
          const created = agreementNumber
            ? await createRecord(prisma)
            : await prisma.$transaction(createRecord, { isolationLevel: "Serializable" });
          const dto = withoutOrganizationId(created);
          await recordAudit(
            audit,
            context,
            "parcelamento.installments",
            "Cadastro",
            created.id,
            dto,
          );
          return dto;
        },
        "Ja existe parcelamento com este numero de acordo.",
      ),

    patch: (context: ParcelamentoRequestContext, id: string, input: PatchInstallmentBody) =>
      guard(
        "Erro ao atualizar parcelamento.",
        async () => {
          const { organizationId } = context;
          const existing = await findByIdOrThrow(organizationId, id);
          const nextAgreementNumber = hasOwn(input, "agreement_number")
            ? normalizeAgreementNumber(input.agreement_number)
            : existing.agreement_number;
          const nextEnrollmentDate = hasOwn(input, "enrollment_date")
            ? toDateOrNull(input.enrollment_date)
            : existing.enrollment_date;
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
            await ensureUniqueIdentity(db, {
              organizationId,
              agreementNumber: nextAgreementNumber,
              clientId: existing.client_id,
              type: input.type ?? existing.type,
              legalNature: input.legal_nature ?? existing.legal_nature,
              jurisdiction: input.jurisdiction ?? existing.jurisdiction,
              enrollmentDate: nextEnrollmentDate,
              excludeId: id,
            });
            await db.installment.updateMany({
              where: { id, organization_id: organizationId },
              data,
            });
          };
          if (nextAgreementNumber) await updateRecord(prisma);
          else await prisma.$transaction(updateRecord, { isolationLevel: "Serializable" });

          await recordAudit(
            audit,
            context,
            "parcelamento.installments",
            "Atualizacao",
            id,
            auditDiff(existing, data),
          );
          if (
            hasOwn(input, "agreed_installments_count") ||
            hasOwn(input, "consolidated_total_amount") ||
            hasOwn(input, "current_month_installment_amount")
          ) {
            return prisma.$transaction(
              (tx) => recalculateAggregates(context, id, tx),
              RECALC_TRANSACTION,
            );
          }
          return withoutOrganizationId(await findByIdOrThrow(organizationId, id));
        },
        "Ja existe parcelamento com este numero de acordo.",
      ),
  };
}

export type InstallmentService = ReturnType<typeof createInstallmentService>;

export function createInstallmentCompetencyService(
  prisma: ParcelamentoPrisma,
  audit: ParcelamentoAudit,
  installments: Pick<InstallmentService, "recalculateAggregates">,
) {
  const ensureParent = async (
    organizationId: string,
    installmentId: string,
    db: ParcelamentoDb = prisma,
  ) => {
    const installment = await db.installment.findFirst({
      where: { id: installmentId, organization_id: organizationId },
    });
    if (!installment) throw new ServiceError(404, "Parcelamento nao encontrado.");
  };
  const findByIdOrThrow = async (
    organizationId: string,
    id: string,
    db: ParcelamentoDb = prisma,
  ) => {
    const competency = await db.installmentCompetencies.findFirst({
      where: { id, organization_id: organizationId },
      select: competencySelect,
    });
    if (!competency) throw new ServiceError(404, "Competencia de parcelamento nao encontrada.");
    return competency;
  };
  const conflict = "Ja existe competencia para este parcelamento.";

  return {
    list: (
      context: ParcelamentoRequestContext,
      installmentId: string,
      query: ListInstallmentCompetenciesQuery,
    ) =>
      guard("Erro ao listar competencias de parcelamento.", async () => {
        await ensureParent(context.organizationId, installmentId);
        const { page, pageSize, skip, take } = getPaginationParams(query);
        const where = { installment_id: installmentId, organization_id: context.organizationId };
        const [total, items] = await Promise.all([
          prisma.installmentCompetencies.count({ where }),
          prisma.installmentCompetencies.findMany({
            where,
            select: competencySelect,
            orderBy: { competence: "asc" },
            skip,
            take,
          }),
        ]);
        return createPage({ items: items.map(withoutOrganizationId), total, page, pageSize });
      }),

    create: (
      context: ParcelamentoRequestContext,
      installmentId: string,
      input: CreateInstallmentCompetencyBody,
    ) =>
      guard(
        "Erro ao criar competencia de parcelamento.",
        async () => {
          const { organizationId } = context;
          const created = await prisma.$transaction(async (tx) => {
            await ensureParent(organizationId, installmentId, tx);
            const existing = await tx.installmentCompetencies.findFirst({
              where: {
                organization_id: organizationId,
                installment_id: installmentId,
                competence: input.competence,
              },
            });
            if (existing) throw new ServiceError(409, conflict);

            const row = await tx.installmentCompetencies.create({
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
            await installments.recalculateAggregates(context, installmentId, tx);
            return row;
          }, RECALC_TRANSACTION);
          const dto = withoutOrganizationId(created);
          await recordAudit(
            audit,
            context,
            "parcelamento.installmentsCompetencies",
            "Cadastro",
            created.id,
            dto,
          );
          return dto;
        },
        conflict,
      ),

    patch: (
      context: ParcelamentoRequestContext,
      id: string,
      input: PatchInstallmentCompetencyBody,
    ) =>
      guard("Erro ao atualizar competencia de parcelamento.", async () => {
        const { organizationId } = context;
        const existing = await findByIdOrThrow(organizationId, id);
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
        const updated = await prisma.$transaction(async (tx) => {
          await tx.installmentCompetencies.updateMany({
            where: { id, organization_id: organizationId },
            data,
          });
          const row = await findByIdOrThrow(organizationId, id, tx);
          if (
            hasOwn(input, "how_many_paid") ||
            hasOwn(input, "how_many_overdue") ||
            hasOwn(input, "installment_amount")
          ) {
            await installments.recalculateAggregates(context, existing.installment_id, tx);
          }
          return row;
        }, RECALC_TRANSACTION);
        await recordAudit(
          audit,
          context,
          "parcelamento.installmentsCompetencies",
          "Atualizacao",
          id,
          auditDiff(existing, data),
        );
        return withoutOrganizationId(updated);
      }),
  };
}

export function createPanoramaService(prisma: ParcelamentoPrisma, audit: ParcelamentoAudit) {
  const findByIdOrThrow = async (organizationId: string, id: string) => {
    const panorama = await prisma.panoramaParcelameto.findFirst({
      where: { id, organization_id: organizationId },
      select: panoramaSelect,
    });
    if (!panorama) throw new ServiceError(404, "Panorama de parcelamento nao encontrado.");
    return panorama;
  };
  const ensureResponsavel = async (organizationId: string, responsavelId: string) => {
    const user = await prisma.user.findFirst({
      where: { id: responsavelId, organization_id: organizationId },
    });
    if (!user) throw new ServiceError(404, "Responsavel nao encontrado para a organizacao.");
  };
  const conflict = "Ja existe panorama para este cliente e competencia.";

  return {
    list: (context: ParcelamentoRequestContext, query: ListPanoramasQuery) =>
      guard("Erro ao listar panoramas de parcelamento.", async () => {
        const { page, pageSize, skip, take } = getPaginationParams(query);
        const where = omitUndefined({
          organization_id: context.organizationId,
          competence: query.competence,
          client_id: query.client_id,
          responsavel_id: query.responsavel_id,
        });
        const [total, items] = await Promise.all([
          prisma.panoramaParcelameto.count({ where }),
          prisma.panoramaParcelameto.findMany({
            where,
            select: panoramaSelect,
            orderBy: { id: "asc" },
            skip,
            take,
          }),
        ]);
        return createPage({ items: items.map(withoutOrganizationId), total, page, pageSize });
      }),

    getById: (context: ParcelamentoRequestContext, id: string) =>
      guard("Erro ao detalhar panorama de parcelamento.", async () =>
        withoutOrganizationId(await findByIdOrThrow(context.organizationId, id)),
      ),

    create: (context: ParcelamentoRequestContext, input: CreatePanoramaBody) =>
      guard(
        "Erro ao criar panorama de parcelamento.",
        async () => {
          const { organizationId } = context;
          await ensureClient(prisma, organizationId, input.client_id);
          if (input.responsavel_id) await ensureResponsavel(organizationId, input.responsavel_id);
          const existing = await prisma.panoramaParcelameto.findFirst({
            where: {
              organization_id: organizationId,
              client_id: input.client_id,
              competence: input.competence,
            },
          });
          if (existing) throw new ServiceError(409, conflict);

          const created = await prisma.panoramaParcelameto.create({
            data: {
              cnd_municipal: input.cnd_municipal ?? false,
              cnd_state: input.cnd_state ?? false,
              cnd_federal: input.cnd_federal ?? false,
              cnd_fgts: input.cnd_fgts ?? false,
              cnd_labor: input.cnd_labor ?? false,
              protests: input.protests ?? false,
              state_tax_situation: input.state_tax_situation ?? false,
              federal_tax_situation: input.federal_tax_situation ?? false,
              responsavel_id: input.responsavel_id ?? null,
              client_id: input.client_id,
              competence: input.competence,
              organization_id: organizationId,
            },
            select: panoramaSelect,
          });
          const dto = withoutOrganizationId(created);
          await recordAudit(audit, context, "parcelamento.panorama", "Cadastro", created.id, dto);
          return dto;
        },
        conflict,
      ),

    patch: (context: ParcelamentoRequestContext, id: string, input: PatchPanoramaBody) =>
      guard("Erro ao atualizar panorama de parcelamento.", async () => {
        const { organizationId } = context;
        const existing = await findByIdOrThrow(organizationId, id);
        if (input.responsavel_id) await ensureResponsavel(organizationId, input.responsavel_id);
        const data = omitUndefined({
          cnd_municipal: input.cnd_municipal,
          cnd_state: input.cnd_state,
          cnd_federal: input.cnd_federal,
          cnd_fgts: input.cnd_fgts,
          cnd_labor: input.cnd_labor,
          protests: input.protests,
          state_tax_situation: input.state_tax_situation,
          federal_tax_situation: input.federal_tax_situation,
          responsavel_id: hasOwn(input, "responsavel_id") ? input.responsavel_id : undefined,
        });
        await prisma.panoramaParcelameto.updateMany({
          where: { id, organization_id: organizationId },
          data,
        });
        const updated = await findByIdOrThrow(organizationId, id);
        await recordAudit(
          audit,
          context,
          "parcelamento.panorama",
          "Atualizacao",
          id,
          auditDiff(existing, data),
        );
        return withoutOrganizationId(updated);
      }),

    generateForCompetence: (context: ParcelamentoRequestContext, competence: string) =>
      guard("Erro ao gerar panoramas de parcelamento.", async () => {
        const { organizationId } = context;
        const activeClients = await prisma.client.findMany({
          where: { organization_id: organizationId, status: ACTIVE_STATUS },
          select: { id: true },
        });
        let created = 0;
        if (activeClients.length > 0) {
          const existingRows = await prisma.panoramaParcelameto.findMany({
            where: {
              organization_id: organizationId,
              competence,
              client_id: { in: activeClients.map((client) => client.id) },
            },
            select: { client_id: true },
          });
          const existingIds = new Set(existingRows.map((row) => row.client_id));
          const data = activeClients
            .filter((client) => !existingIds.has(client.id))
            .map((client) => ({
              ...panoramaDefaults,
              client_id: client.id,
              competence,
              organization_id: organizationId,
            }));
          // skipDuplicates + unique (org, client, competence) tornam a geração idempotente.
          if (data.length > 0) {
            created = (await prisma.panoramaParcelameto.createMany({ data, skipDuplicates: true }))
              .count;
          }
        }
        const result = {
          created,
          existing: activeClients.length - created,
          totalActiveClients: activeClients.length,
        };
        await recordAudit(audit, context, "parcelamento.panorama", "Geracao", competence, {
          competence,
          ...result,
        });
        return result;
      }),
  };
}

type ReportingDelegate = {
  findMany(input: {
    where: { organization_id: string };
    select: Record<string, true>;
    take: number;
    skip?: number;
    orderBy?: { id: "asc" };
  }): Promise<readonly Row[]>;
};

export type ReportingExtractInput = {
  query?: ReportingQuery;
  offset?: number;
  organizationId: string;
  source: ParcelamentoReportingSource;
  fields: readonly string[];
  limit: number;
};

export type ReportingService = {
  extract(input: ReportingExtractInput): Promise<{ rows: readonly Row[]; reachedLimit: boolean }>;
};

export function createReportingService(
  prisma: ParcelamentoPrisma,
  inSnapshot = false,
): ReportingService {
  const delegates: Record<ParcelamentoReportingSource, ReportingDelegate> = {
    "parcelamento.installments": prisma.installment as unknown as ReportingDelegate,
    "parcelamento.installment_competencies":
      prisma.installmentCompetencies as unknown as ReportingDelegate,
    "parcelamento.panoramas": prisma.panoramaParcelameto as unknown as ReportingDelegate,
  };

  const service: ReportingService = {
    async extract(input) {
      if (input.query && !inSnapshot) {
        return withReportingSnapshot(prisma, (transaction) =>
          createReportingService(transaction, true).extract(input),
        );
      }
      if (input.query) {
        return executeReportingQuery({ ...input, query: input.query }, (fields, limit, offset) =>
          service.extract({ ...input, query: undefined, fields, limit, offset }),
        );
      }
      const allowed = getParcelamentoReportingFields(input.source);
      if (input.fields.some((field) => !allowed.includes(field))) {
        throw new ServiceError(403, "Campo não publicado para relatórios.");
      }
      const rows = await delegates[input.source].findMany({
        where: { organization_id: input.organizationId },
        select: Object.fromEntries(input.fields.map((field) => [field, true])),
        ...(input.offset !== undefined ? { skip: input.offset, orderBy: { id: "asc" } } : {}),
        take: input.limit + 1,
      });
      return { rows: rows.slice(0, input.limit), reachedLimit: rows.length > input.limit };
    },
  };
  return service;
}
