import {
  error as logError,
  warn as logWarn,
  ServiceError,
  TRIAGE_ACCOUNTING_CHECKLIST_FIELDS,
  TRIAGE_DOCUMENT_STATUSES,
  TRIAGE_FISCAL_CHECKLIST_FIELDS,
  type TriageDocumentStatus,
  type TriageFiscalChecklistField,
} from "@workspace/shared";
import { TRIAGE_CATALOG_CODE_MAX_LENGTH } from "../constants/triageDocuments.js";
import { Prisma, type PrismaClient } from "../generated/prisma/client.js";

import { type LogUpdateParams, logUpdateIfChanged } from "../integrations/audit.js";
import prismaClient from "../integrations/prisma.js";
import type {
  TriagemOverviewClient,
  TriagemOverviewSummaryRequest,
} from "../integrations/triagemOverviewClient.js";

export const TRIAGE_DOCUMENT_FIELDS = TRIAGE_ACCOUNTING_CHECKLIST_FIELDS;

// Definidos no shared: o Fiscal lê o mesmo checklist (controle mensal).
export { TRIAGE_DOCUMENT_STATUSES, TRIAGE_FISCAL_CHECKLIST_FIELDS };
export type { TriageDocumentStatus, TriageFiscalChecklistField };

export const TRIAGE_FISCAL_FIELDS = [...TRIAGE_FISCAL_CHECKLIST_FIELDS, "billing_amount"] as const;

export const TRIAGE_ITEM_PRIORITIES = ["LOW", "MEDIUM", "HIGH"] as const;

export const TRIAGE_DOCUMENT_NOTE_MAX_LENGTH = 2_000;
export { TRIAGE_CATALOG_CODE_MAX_LENGTH };

export type TriageDocumentField = (typeof TRIAGE_DOCUMENT_FIELDS)[number];
export type TriageFiscalField = (typeof TRIAGE_FISCAL_FIELDS)[number];
export type TriageRoutineType = "CONTABIL" | "FISCAL";
export type TriageDeliveryMethod = string;
export type TriageItemPriority = (typeof TRIAGE_ITEM_PRIORITIES)[number];
export type TriageDocumentsServicePrisma = typeof prismaClient;
type TriageOverviewSummaryClient = Pick<TriagemOverviewClient, "getSummary">;
type TriageCatalogLookupClient = Pick<
  PrismaClient,
  "$executeRaw" | "triageCatalogItem" | "triageCompetence" | "triageCompetenceCatalogSnapshot"
>;

type TriageDocumentsAudit = {
  logUpdateIfChanged: (params: LogUpdateParams) => Promise<void>;
};

export interface TriageDocumentsAuthContext {
  userId: string;
  organizationId: string;
  permission?: number;
  modules?: Record<string, number>;
}

export interface TriageMonthlyRequest {
  client_id: string;
  competence: string;
  type?: TriageRoutineType;
}

export interface TriageDocumentItemUpdate {
  type?: TriageRoutineType;
  field: TriageDocumentField | TriageFiscalField;
  status?: TriageDocumentStatus;
  value?: string | null;
  note?: string | null;
  justification?: string | null;
  delivery_method?: string | null;
  state_site?: string | null;
}

export interface TriageDocumentsBulkUpdate {
  status: TriageDocumentStatus;
  type?: TriageRoutineType;
}

export interface TriageStatementUpsert {
  client_id: string;
  competence: string;
  bank_id: string;
  status: TriageDocumentStatus;
}

export interface TriageStatementArchive {
  client_id: string;
  competence: string;
  bank_id: string;
}

export interface TriageDocumentSummary {
  applicable: number;
  attention: number;
  completed: number;
  notApplicable: number;
  notPresent: number;
  pending: number;
  percentage: number;
}

export interface TriageDocumentItemNotes {
  note: string | null;
  justification: string | null;
  priority?: TriageItemPriority | null;
  delivery_method?: TriageDeliveryMethod | null;
  state_site?: string | null;
  required?: boolean;
}

export interface FiscalTriagePortfolioItem {
  client_id: string;
  legal_name: string;
  cpf_cnpj: string;
  regime: string | null;
  responsible_id: string | null;
  responsible_name: string | null;
  can_edit: boolean;
  has_competence: boolean;
  planned_checklist: Record<string, TriageDocumentStatus> | null;
  monthly: {
    id: string;
    checklist: Record<string, TriageDocumentStatus>;
    item_notes: Record<string, TriageDocumentItemNotes>;
  } | null;
}

function isTriageDocumentField(value: string): value is TriageDocumentField {
  return TRIAGE_DOCUMENT_FIELDS.includes(value as TriageDocumentField);
}

function isTriageFiscalField(value: string): value is TriageFiscalField {
  return TRIAGE_FISCAL_FIELDS.includes(value as TriageFiscalField);
}

function routineType(requestedType?: TriageRoutineType): TriageRoutineType {
  return requestedType ?? "CONTABIL";
}

function checklistFields(type: TriageRoutineType): readonly string[] {
  return type === "FISCAL" ? TRIAGE_FISCAL_CHECKLIST_FIELDS : TRIAGE_DOCUMENT_FIELDS;
}

function isDeliveryMethod(value: unknown): value is TriageDeliveryMethod {
  return typeof value === "string" && value.trim().length > 0;
}

function isItemPriority(value: unknown): value is TriageItemPriority {
  return typeof value === "string" && TRIAGE_ITEM_PRIORITIES.includes(value as TriageItemPriority);
}

function isTriageDocumentStatus(value: unknown): value is TriageDocumentStatus {
  return (
    typeof value === "string" && TRIAGE_DOCUMENT_STATUSES.includes(value as TriageDocumentStatus)
  );
}

function asChecklist(
  value: unknown,
  fields: readonly string[] = TRIAGE_DOCUMENT_FIELDS,
): Record<string, TriageDocumentStatus> {
  const source = value && typeof value === "object" && !Array.isArray(value) ? value : {};
  const checklist: Record<string, TriageDocumentStatus> = {};

  for (const field of fields) {
    const status = (source as Record<string, unknown>)[field];
    checklist[field] = isTriageDocumentStatus(status) ? status : "NOT_APPLICABLE";
  }

  return checklist;
}

function asItemNotes(
  value: unknown,
  fields: readonly string[] = TRIAGE_DOCUMENT_FIELDS,
): Record<string, TriageDocumentItemNotes> {
  const source = value && typeof value === "object" && !Array.isArray(value) ? value : {};
  return Object.fromEntries(
    fields.map((field) => {
      const raw = (source as Record<string, unknown>)[field];
      const item = raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {};
      const note = (item as Record<string, unknown>).note;
      const justification = (item as Record<string, unknown>).justification;
      const priority = (item as Record<string, unknown>).priority;
      const deliveryMethod = (item as Record<string, unknown>).delivery_method;
      const stateSite = (item as Record<string, unknown>).state_site;
      const required = (item as Record<string, unknown>).required;
      return [
        field,
        {
          note: typeof note === "string" && note.trim() ? note.trim() : null,
          justification:
            typeof justification === "string" && justification.trim() ? justification.trim() : null,
          ...(isItemPriority(priority) ? { priority } : {}),
          ...(isDeliveryMethod(deliveryMethod) ? { delivery_method: deliveryMethod } : {}),
          ...(isDeliveryMethod(stateSite) ? { state_site: stateSite } : {}),
          ...(typeof required === "boolean" ? { required } : {}),
        },
      ];
    }),
  ) as Record<TriageDocumentField, TriageDocumentItemNotes>;
}

function normalizeOptionalNote(value: unknown, label: string): string | null | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (value === null) {
    return null;
  }
  if (typeof value !== "string" || value.trim().length > TRIAGE_DOCUMENT_NOTE_MAX_LENGTH) {
    throw new ServiceError(400, `${label} inválida.`);
  }
  return value.trim() || null;
}

function normalizeOptionalCatalogCode(value: unknown, label: string): string | null | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (value === null) {
    return null;
  }
  if (
    typeof value !== "string" ||
    value.trim().length === 0 ||
    value.trim().length > TRIAGE_CATALOG_CODE_MAX_LENGTH
  ) {
    throw new ServiceError(400, `${label} inválido.`);
  }
  return value.trim();
}

async function ensureCatalogSnapshotForCompetence(
  transaction: TriageCatalogLookupClient,
  organizationId: string,
  competenceId: string,
): Promise<void> {
  await transaction.$executeRaw`
    SELECT pg_advisory_xact_lock(hashtextextended(${`triage.catalog.snapshot:${competenceId}`}, 0))
  `;
  const competence = await transaction.triageCompetence.findFirst({
    where: { id: competenceId, organization_id: organizationId },
    select: { id: true, catalog_snapshot_initialized_at: true },
  });
  if (!competence) {
    return;
  }

  const existingSnapshot = await transaction.triageCompetenceCatalogSnapshot.findFirst({
    where: { organization_id: organizationId, competence_id: competenceId },
    select: { id: true },
  });
  if (existingSnapshot || competence.catalog_snapshot_initialized_at !== null) {
    if (existingSnapshot && competence.catalog_snapshot_initialized_at === null) {
      await transaction.triageCompetence.update({
        where: { id: competenceId },
        data: { catalog_snapshot_initialized_at: new Date() },
        select: { id: true },
      });
    }
    return;
  }

  const items = await transaction.triageCatalogItem.findMany({
    where: { organization_id: organizationId, archived_at: null },
    select: { id: true, kind: true, code: true, label: true, url: true },
  });
  if (items.length > 0) {
    await transaction.triageCompetenceCatalogSnapshot.createMany({
      data: items.map((item) => ({
        organization_id: organizationId,
        competence_id: competenceId,
        catalog_item_id: item.id,
        kind: item.kind,
        code: item.code,
        label: item.label,
        url: item.url,
      })),
      skipDuplicates: true,
    });
  }
  await transaction.triageCompetence.update({
    where: { id: competenceId },
    data: { catalog_snapshot_initialized_at: new Date() },
    select: { id: true },
  });
}

function normalizeOptionalValue(value: unknown, label: string): string | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (typeof value !== "string" || value.trim().length > TRIAGE_DOCUMENT_NOTE_MAX_LENGTH) {
    throw new ServiceError(400, `${label} inválido.`);
  }
  return value.trim() || null;
}

function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: unknown }).code === "P2002"
  );
}

function triageStatementLockKey(identity: Record<string, string>): string {
  return JSON.stringify(identity);
}

export class TriageDocumentsService {
  constructor(
    private readonly prisma: TriageDocumentsServicePrisma = prismaClient,
    private readonly audit: TriageDocumentsAudit = { logUpdateIfChanged },
    private readonly overviewClient?: TriageOverviewSummaryClient,
  ) {}

  async listFiscalPortfolio(
    competence: string,
    auth: TriageDocumentsAuthContext,
  ): Promise<{ competence: string; items: FiscalTriagePortfolioItem[] }> {
    if (!auth.userId || !auth.organizationId) {
      throw new ServiceError(400, "Contexto autenticado incompleto.");
    }
    if (Number(auth.modules?.fiscal ?? auth.permission ?? 0) < 1) {
      throw new ServiceError(403, "Permissão insuficiente para consultar a Triagem Fiscal.");
    }

    const [year, month] = competence.split("-").map(Number);
    const start = new Date(Date.UTC(year, month - 1, 1));
    const end = new Date(Date.UTC(year, month, 0, 23, 59, 59, 999));
    // ponytail: a carteira inteira cabe em centenas de empresas; paginar no servidor se chegar a milhares.
    const clients = await this.prisma.client.findMany({
      where: {
        organization_id: auth.organizationId,
        OR: [
          {
            fiscal: true,
            AND: [
              { OR: [{ competence_entry: null }, { competence_entry: { lte: end } }] },
              { OR: [{ competence_output: null }, { competence_output: { gte: start } }] },
            ],
          },
          {
            triageMonthlys: {
              some: {
                organization_id: auth.organizationId,
                competence,
                type: "FISCAL",
                archived_at: null,
              },
            },
          },
        ],
      },
      select: {
        id: true,
        name: true,
        company_name: true,
        cpf_cnpj: true,
        regime: true,
        triageMonthlys: {
          where: {
            organization_id: auth.organizationId,
            competence,
            type: "FISCAL",
            archived_at: null,
          },
          select: { id: true, checklist: true, item_notes: true },
          take: 1,
        },
        triageCompetences: {
          where: { organization_id: auth.organizationId, competence, archived_at: null },
          select: { id: true, responsible_snapshot: true, configuration_snapshot: true },
          take: 1,
        },
        responsiblesTriage: {
          where: { organization_id: auth.organizationId, type: "FISCAL" },
          select: { user_id: true },
          take: 1,
        },
      },
      orderBy: [{ company_name: "asc" }, { name: "asc" }, { id: "asc" }],
    });

    const snapshotResponsibleIds = clients.map((client) => {
      const snapshot = client.triageCompetences[0]?.responsible_snapshot;
      const source =
        snapshot && typeof snapshot === "object" && !Array.isArray(snapshot)
          ? (snapshot as Record<string, unknown>)
          : {};
      const responsibles = Array.isArray(source.responsibles) ? source.responsibles : [];
      const fiscal = responsibles.find(
        (entry) =>
          entry &&
          typeof entry === "object" &&
          !Array.isArray(entry) &&
          (entry as Record<string, unknown>).type === "FISCAL",
      ) as Record<string, unknown> | undefined;
      return typeof fiscal?.user_id === "string" ? fiscal.user_id : null;
    });
    const responsibleIds = clients.map((client, index) =>
      client.triageCompetences[0]
        ? snapshotResponsibleIds[index]
        : (client.responsiblesTriage[0]?.user_id ?? null),
    );
    const userIds = responsibleIds.flatMap((id) => {
      return id ? [id] : [];
    });
    const users = userIds.length
      ? await this.prisma.user.findMany({
          where: { organization_id: auth.organizationId, id: { in: userIds } },
          select: { id: true, name: true },
        })
      : [];
    const userNames = new Map(users.map((user) => [user.id, user.name]));

    return {
      competence,
      items: clients.map((client, index) => {
        const monthly = client.triageMonthlys[0];
        const competenceSnapshot = client.triageCompetences[0];
        const plannedItems = competenceSnapshot
          ? fiscalSnapshotItems(competenceSnapshot.configuration_snapshot)
          : null;
        const responsibleId = responsibleIds[index];
        return {
          client_id: client.id,
          legal_name: client.company_name?.trim() || client.name,
          cpf_cnpj: client.cpf_cnpj,
          regime: client.regime,
          responsible_id: responsibleId,
          responsible_name: responsibleId ? (userNames.get(responsibleId) ?? null) : null,
          can_edit:
            Number(auth.modules?.fiscal ?? 0) >= 2 ||
            client.responsiblesTriage[0]?.user_id === auth.userId,
          has_competence: Boolean(competenceSnapshot),
          planned_checklist: plannedItems
            ? Object.fromEntries(
                TRIAGE_FISCAL_CHECKLIST_FIELDS.map((field) => [
                  field,
                  plannedItems[field]?.required === true ? "PENDING" : "NOT_APPLICABLE",
                ]),
              )
            : null,
          monthly: monthly
            ? {
                id: monthly.id,
                checklist: asChecklist(monthly.checklist, TRIAGE_FISCAL_CHECKLIST_FIELDS),
                item_notes: asItemNotes(monthly.item_notes, TRIAGE_FISCAL_CHECKLIST_FIELDS),
              }
            : null,
        };
      }),
    };
  }

  getSummary(
    checklist: Record<string, unknown>,
    fields: readonly string[] = TRIAGE_DOCUMENT_FIELDS,
  ): TriageDocumentSummary {
    const normalized = asChecklist(checklist, fields);
    const statuses = Object.values(normalized);
    const completed = statuses.filter((status) => status === "COMPLETED").length;
    const notApplicable = statuses.filter((status) => status === "NOT_APPLICABLE").length;
    const notPresent = statuses.filter((status) => status === "NOT_PRESENT").length;
    const applicable = statuses.length - notApplicable - notPresent;

    return {
      applicable,
      attention: statuses.filter((status) => status === "ATTENTION" || status === "UNDER_REVIEW")
        .length,
      completed,
      notApplicable,
      notPresent,
      pending: statuses.filter((status) => status === "PENDING").length,
      percentage: applicable === 0 ? 0 : Math.round((completed / applicable) * 100),
    };
  }

  async getMonthly(
    request: TriageMonthlyRequest,
    organizationIdOrAuth: string | TriageDocumentsAuthContext,
  ): Promise<Record<string, unknown> | null> {
    const auth = typeof organizationIdOrAuth === "string" ? undefined : organizationIdOrAuth;
    const organizationId =
      typeof organizationIdOrAuth === "string"
        ? organizationIdOrAuth
        : organizationIdOrAuth.organizationId;
    const type = routineType(request.type);
    const monthly = await this.prisma.triageMonthly.findFirst({
      where: {
        client_id: request.client_id,
        competence: request.competence,
        organization_id: organizationId,
        type,
        archived_at: null,
      },
    });

    // Estado vazio é 200 com null: a tela oferece "Iniciar pendências".
    if (!monthly) return null;

    const result = this.toMonthlyResponse(monthly, type);
    if (auth && this.overviewClient) {
      const summaryRequest: TriagemOverviewSummaryRequest = {
        organizationId: auth.organizationId,
        userId: auth.userId,
        permission: auth.permission,
        modules: auth.modules,
        clientId: request.client_id,
        competence: request.competence,
      };
      try {
        return {
          ...result,
          triagem_summary: await this.overviewClient.getSummary(summaryRequest),
        };
      } catch (error: unknown) {
        if (!(error instanceof ServiceError) || ![403, 404, 503, 504].includes(error.statusCode)) {
          throw error;
        }
        logWarn("Resumo da Triagem indisponível; mantendo resposta mensal local", {
          err: error,
          clientId: request.client_id,
          competence: request.competence,
        });
        return { ...result, triagem_summary: null };
      }
    }
    return result;
  }

  async getEditability(
    clientId: string,
    auth: TriageDocumentsAuthContext,
    type: TriageRoutineType = "CONTABIL",
  ): Promise<{ can_edit: boolean }> {
    try {
      await this.assertCanEdit(clientId, auth, type);
      return { can_edit: true };
    } catch (error: unknown) {
      if (error instanceof ServiceError && error.statusCode === 403) {
        return { can_edit: false };
      }
      throw error;
    }
  }

  async getOrCreateMonthly(
    request: TriageMonthlyRequest,
    auth: TriageDocumentsAuthContext,
  ): Promise<Record<string, unknown>> {
    const type = routineType(request.type);
    const existing = await this.prisma.triageMonthly.findFirst({
      where: {
        client_id: request.client_id,
        competence: request.competence,
        organization_id: auth.organizationId,
        type,
        archived_at: null,
      },
    });

    if (existing) {
      return this.toMonthlyResponse(existing, type);
    }

    await this.assertCanEdit(request.client_id, auth, type);

    const configuration = await this.getInitialConfiguration(
      request.client_id,
      request.competence,
      auth.organizationId,
      type,
    );

    try {
      const created = await this.prisma.triageMonthly.create({
        data: {
          client_id: request.client_id,
          competence: request.competence,
          organization_id: auth.organizationId,
          type,
          archived_at: null,
          checklist: configuration.checklist,
          item_notes: configuration.itemNotes as unknown as Prisma.InputJsonValue,
        },
      });

      return this.toMonthlyResponse(created, type);
    } catch (error: unknown) {
      logError("Erro ao criar pendência documental mensal", { err: error });
      if (!isUniqueViolation(error)) {
        throw new ServiceError(500, "Erro ao criar pendência documental mensal.", error);
      }

      const concurrent = await this.prisma.triageMonthly.findFirst({
        where: {
          client_id: request.client_id,
          competence: request.competence,
          organization_id: auth.organizationId,
          type,
          archived_at: null,
        },
      });
      if (concurrent) {
        return this.toMonthlyResponse(concurrent, type);
      }

      throw new ServiceError(409, "Não foi possível criar a pendência documental mensal.", error);
    }
  }

  async updateItem(
    monthlyId: string,
    update: TriageDocumentItemUpdate,
    auth: TriageDocumentsAuthContext,
  ): Promise<Record<string, unknown>> {
    const type = routineType(update.type);
    const isBillingAmount = type === "FISCAL" && update.field === "billing_amount";
    const isAllowedField =
      (type === "CONTABIL" && isTriageDocumentField(update.field)) ||
      (type === "FISCAL" && isTriageFiscalField(update.field));
    if (!isAllowedField || (!isBillingAmount && !isTriageDocumentStatus(update.status))) {
      throw new ServiceError(400, "Item ou status documental inválido.");
    }
    const note = normalizeOptionalNote(update.note, "Nota documental");
    const justification = normalizeOptionalCatalogCode(
      update.justification,
      "Justificativa documental",
    );
    const value = isBillingAmount
      ? normalizeOptionalValue(update.value, "Valor de faturamento")
      : undefined;
    // Na rotina contábil, chaves fiscais nulas são ignoradas (o front antigo as envia).
    if (type !== "FISCAL" && update.delivery_method != null) {
      throw new ServiceError(400, "método de entrega só é aceito na rotina fiscal.");
    }
    if (type !== "FISCAL" && update.state_site != null) {
      throw new ServiceError(400, "site estadual só é aceito na rotina fiscal.");
    }
    const deliveryMethod =
      type === "FISCAL"
        ? normalizeOptionalCatalogCode(update.delivery_method, "Método de entrega fiscal")
        : undefined;
    const stateSite =
      type === "FISCAL"
        ? normalizeOptionalCatalogCode(update.state_site, "Site estadual")
        : undefined;
    if (
      deliveryMethod !== undefined &&
      deliveryMethod !== null &&
      !isDeliveryMethod(deliveryMethod)
    ) {
      throw new ServiceError(400, "Método de entrega fiscal inválido.");
    }
    const { monthly, updated } = await this.prisma.$transaction(
      async (transaction) => {
        await transaction.$executeRaw`
        SELECT pg_advisory_xact_lock(hashtextextended(${monthlyId}, 0))
      `;

        const monthly = await this.findMonthlyForUpdate(
          transaction,
          monthlyId,
          auth.organizationId,
          type,
        );
        await this.assertCanEdit(monthly.client_id, auth, type);
        await this.assertActiveCatalogItems(
          transaction,
          "JUSTIFICATION",
          justification ? [justification] : [],
          auth.organizationId,
          monthly.client_id,
          monthly.competence,
        );
        await this.assertActiveCatalogItems(
          transaction,
          "DELIVERY_METHOD",
          deliveryMethod ? [deliveryMethod] : [],
          auth.organizationId,
          monthly.client_id,
          monthly.competence,
        );
        await this.assertActiveCatalogItems(
          transaction,
          "STATE_SITE",
          stateSite ? [stateSite] : [],
          auth.organizationId,
          monthly.client_id,
          monthly.competence,
        );
        const fields = checklistFields(type);
        const checklist = asChecklist(monthly.checklist, fields);
        const itemNotes = asItemNotes(
          monthly.item_notes,
          type === "FISCAL" ? TRIAGE_FISCAL_FIELDS : fields,
        );
        const currentNotes = itemNotes[update.field] ?? { note: null, justification: null };
        const nextItemNotes =
          isBillingAmount ||
          (note === undefined &&
            justification === undefined &&
            deliveryMethod === undefined &&
            stateSite === undefined)
            ? undefined
            : {
                ...itemNotes,
                [update.field]: {
                  ...currentNotes,
                  note: note === undefined ? currentNotes.note : note,
                  justification:
                    justification === undefined ? currentNotes.justification : justification,
                  ...(deliveryMethod !== undefined ? { delivery_method: deliveryMethod } : {}),
                  ...(stateSite !== undefined ? { state_site: stateSite } : {}),
                },
              };
        const updated = await transaction.triageMonthly.update({
          where: { id: monthly.id },
          data: {
            ...(isBillingAmount
              ? {}
              : { checklist: { ...checklist, [update.field]: update.status } }),
            ...(isBillingAmount ? { billing_amount: value } : {}),
            ...(nextItemNotes
              ? { item_notes: nextItemNotes as unknown as Prisma.InputJsonValue }
              : {}),
          },
        });

        return { monthly, updated };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );

    await this.audit.logUpdateIfChanged({
      userId: auth.userId,
      organizationId: auth.organizationId,
      permission: auth.permission ?? null,
      action: "Atualizar pendência documental",
      referring: "triagem.monthly",
      referringId: monthly.id,
      oldData: monthly as unknown as Record<string, unknown>,
      updatedData: updated as unknown as Record<string, unknown>,
    });

    return this.toMonthlyResponse(updated, type);
  }

  async updateAll(
    monthlyId: string,
    update: TriageDocumentsBulkUpdate,
    auth: TriageDocumentsAuthContext,
  ): Promise<Record<string, unknown>> {
    if (!isTriageDocumentStatus(update.status)) {
      throw new ServiceError(400, "Status documental inválido.");
    }
    const type = routineType(update.type);
    const { monthly, updated } = await this.prisma.$transaction(async (transaction) => {
      await transaction.$executeRaw`
        SELECT pg_advisory_xact_lock(hashtextextended(${monthlyId}, 0))
      `;

      const monthly = await this.findMonthlyForUpdate(
        transaction,
        monthlyId,
        auth.organizationId,
        type,
      );
      await this.assertCanEdit(monthly.client_id, auth, type);
      const checklist = asChecklist(monthly.checklist, checklistFields(type));
      const nextChecklist = Object.fromEntries(
        Object.entries(checklist).map(([field, status]) => [
          field,
          status === "NOT_APPLICABLE" ? status : update.status,
        ]),
      );
      const updated = await transaction.triageMonthly.update({
        where: { id: monthly.id },
        data: { checklist: nextChecklist },
      });

      return { monthly, updated };
    });

    await this.audit.logUpdateIfChanged({
      userId: auth.userId,
      organizationId: auth.organizationId,
      permission: auth.permission ?? null,
      action: "Atualizar todas as pendências documentais",
      referring: "triagem.monthly",
      referringId: monthly.id,
      oldData: monthly as unknown as Record<string, unknown>,
      updatedData: updated as unknown as Record<string, unknown>,
    });

    return this.toMonthlyResponse(updated, type);
  }

  async listStatements(request: TriageMonthlyRequest, organizationId: string): Promise<unknown[]> {
    return this.prisma.triageBankStatement.findMany({
      where: {
        client_id: request.client_id,
        competence: request.competence,
        organization_id: organizationId,
        archived_at: null,
      },
      orderBy: { bank_id: "asc" },
    });
  }

  async upsertStatement(
    request: TriageStatementUpsert,
    auth: TriageDocumentsAuthContext,
  ): Promise<unknown> {
    if (!isTriageDocumentStatus(request.status) || request.bank_id.trim().length === 0) {
      throw new ServiceError(400, "Marcador de extrato bancário inválido.");
    }
    await this.assertClientInOrganization(request.client_id, auth.organizationId);
    await this.assertCanEdit(request.client_id, auth, "CONTABIL");
    const identity = {
      organization_id: auth.organizationId,
      client_id: request.client_id,
      competence: request.competence,
      bank_id: request.bank_id,
    };
    const { existing, statement } = await this.prisma.$transaction(async (transaction) => {
      await transaction.$executeRaw`
        SELECT pg_advisory_xact_lock(hashtextextended(${triageStatementLockKey(identity)}, 0))
      `;
      const existing = await transaction.triageBankStatement.findFirst({
        where: { ...identity, archived_at: null },
      });
      const statement = await transaction.triageBankStatement.upsert({
        where: { organization_id_client_id_competence_bank_id: identity },
        create: { ...identity, status: request.status },
        update: { status: request.status, archived_at: null },
      });
      return { existing, statement };
    });

    await this.audit.logUpdateIfChanged({
      userId: auth.userId,
      organizationId: auth.organizationId,
      permission: auth.permission ?? null,
      action: "Atualizar marcador de extrato bancário",
      referring: "triagem.bank_statements",
      referringId: statement.id,
      oldData: existing as Record<string, unknown> | null,
      updatedData: statement as Record<string, unknown>,
    });

    return statement;
  }

  async archiveStatement(
    request: TriageStatementArchive,
    auth: TriageDocumentsAuthContext,
  ): Promise<unknown> {
    if (request.bank_id.trim().length === 0) {
      throw new ServiceError(400, "Marcador de extrato bancário inválido.");
    }
    await this.assertClientInOrganization(request.client_id, auth.organizationId);
    await this.assertCanEdit(request.client_id, auth, "CONTABIL");
    const identity = {
      organization_id: auth.organizationId,
      client_id: request.client_id,
      competence: request.competence,
      bank_id: request.bank_id,
    };
    const { statement, archived } = await this.prisma.$transaction(async (transaction) => {
      await transaction.$executeRaw`
        SELECT pg_advisory_xact_lock(hashtextextended(${triageStatementLockKey(identity)}, 0))
      `;
      const statement = await transaction.triageBankStatement.findFirst({
        where: { ...identity, archived_at: null },
      });

      if (!statement) {
        throw new ServiceError(404, "Marcador de extrato bancário não encontrado.");
      }

      const archived = await transaction.triageBankStatement.update({
        where: { id: statement.id },
        data: { archived_at: new Date() },
      });
      return { statement, archived };
    });

    await this.audit.logUpdateIfChanged({
      userId: auth.userId,
      organizationId: auth.organizationId,
      permission: auth.permission ?? null,
      action: "Arquivar marcador de extrato bancário",
      referring: "triagem.bank_statements",
      referringId: archived.id,
      oldData: statement as Record<string, unknown>,
      updatedData: archived as Record<string, unknown>,
    });

    return archived;
  }

  private async findMonthlyForUpdate(
    prisma: Pick<TriageDocumentsServicePrisma, "triageMonthly">,
    monthlyId: string,
    organizationId: string,
    type: TriageRoutineType,
  ): Promise<
    NonNullable<Awaited<ReturnType<TriageDocumentsServicePrisma["triageMonthly"]["findFirst"]>>>
  > {
    const monthly = await prisma.triageMonthly.findFirst({
      where: {
        id: monthlyId,
        organization_id: organizationId,
        type,
        archived_at: null,
      },
    });
    if (!monthly) {
      throw new ServiceError(404, "Pendência documental mensal não encontrada.");
    }
    return monthly;
  }

  private async assertCanEdit(
    clientId: string,
    auth: TriageDocumentsAuthContext,
    type: TriageRoutineType,
  ): Promise<void> {
    const modulePermission = Number(auth.modules?.[type === "FISCAL" ? "fiscal" : "contabil"] ?? 0);
    if (modulePermission >= 2) {
      return;
    }

    const assignment = await this.prisma.triageResponsible.findFirst({
      where: {
        client_id: clientId,
        organization_id: auth.organizationId,
        type,
        user_id: auth.userId,
      },
    });
    if (!assignment) {
      throw new ServiceError(403, "Permissão insuficiente para alterar pendências documentais.");
    }
  }

  private async assertClientInOrganization(
    clientId: string,
    organizationId: string,
  ): Promise<void> {
    const client = await this.prisma.client.findFirst({
      where: { id: clientId, organization_id: organizationId },
      select: { id: true },
    });
    if (!client) {
      throw new ServiceError(404, "Cliente não encontrado.");
    }
  }

  private toMonthlyResponse(
    monthly: {
      checklist: unknown;
      item_notes?: unknown;
      type?: string;
      [key: string]: unknown;
    },
    type: TriageRoutineType,
  ): Record<string, unknown> {
    const fields = checklistFields(type);
    const itemFields = type === "FISCAL" ? TRIAGE_FISCAL_FIELDS : fields;
    const checklist = asChecklist(monthly.checklist, fields);
    return {
      ...monthly,
      checklist,
      item_notes: asItemNotes(monthly.item_notes, itemFields),
      summary: this.getSummary(checklist, fields),
    };
  }

  private async getInitialConfiguration(
    clientId: string,
    competence: string,
    organizationId: string,
    type: TriageRoutineType,
  ): Promise<{
    checklist: Record<string, TriageDocumentStatus>;
    itemNotes: Record<string, TriageDocumentItemNotes>;
  }> {
    const fields = checklistFields(type);
    const itemFields = type === "FISCAL" ? TRIAGE_FISCAL_FIELDS : fields;
    let configuredItems: Record<string, TriageDocumentItemNotes> = {};

    if (type === "FISCAL") {
      const competenceRecord = await this.prisma.triageCompetence.findFirst({
        where: {
          client_id: clientId,
          competence,
          organization_id: organizationId,
          archived_at: null,
        },
        select: { configuration_snapshot: true },
      });
      configuredItems = fiscalSnapshotItems(competenceRecord?.configuration_snapshot);
      if (!competenceRecord) {
        throw new ServiceError(409, "Crie a competência fiscal antes de iniciar a rotina mensal.");
      }
    } else {
      const config = await this.prisma.triageConfig.findFirst({
        where: {
          client_id: clientId,
          organization_id: organizationId,
          type,
        },
        select: { active_items: true },
      });
      configuredItems = legacyActiveItems(config?.active_items);
    }

    const checklist = Object.fromEntries(
      fields.map((field) => [
        field,
        configuredItems[field]?.required === true ? "PENDING" : "NOT_APPLICABLE",
      ]),
    ) as Record<string, TriageDocumentStatus>;
    const itemNotes = Object.fromEntries(
      itemFields.map((field) => [
        field,
        { ...(configuredItems[field] ?? {}), note: null, justification: null },
      ]),
    ) as Record<string, TriageDocumentItemNotes>;

    await this.prisma.$transaction(async (transaction) => {
      await this.assertActiveCatalogItems(
        transaction,
        "JUSTIFICATION",
        Object.values(itemNotes)
          .map((item) => item.justification)
          .filter((value): value is string => typeof value === "string"),
        organizationId,
        clientId,
        competence,
      );
      await this.assertActiveCatalogItems(
        transaction,
        "DELIVERY_METHOD",
        Object.values(itemNotes)
          .map((item) => item.delivery_method)
          .filter((value): value is string => typeof value === "string"),
        organizationId,
        clientId,
        competence,
      );
      await this.assertActiveCatalogItems(
        transaction,
        "STATE_SITE",
        Object.values(itemNotes)
          .map((item) => item.state_site)
          .filter((value): value is string => typeof value === "string"),
        organizationId,
        clientId,
        competence,
      );
    });

    return { checklist, itemNotes };
  }

  private async assertActiveCatalogItems(
    transaction: TriageCatalogLookupClient,
    kind: "JUSTIFICATION" | "DELIVERY_METHOD" | "STATE_SITE",
    codes: readonly string[],
    organizationId: string,
    clientId: string,
    competence: string,
  ): Promise<void> {
    const uniqueCodes = [...new Set(codes.map((code) => code.trim()).filter(Boolean))];
    if (uniqueCodes.length === 0) {
      return;
    }

    await transaction.$executeRaw`SET LOCAL ROLE "giro_user_runtime"`;
    await transaction.$executeRaw`SELECT set_config('app.organization_id', ${organizationId}, true)`;
    for (const code of uniqueCodes.sort()) {
      await transaction.$executeRaw`
        SELECT pg_advisory_xact_lock(
          hashtextextended(${`triage.catalog.item:${organizationId}:${kind}:${code}`}, 0)
        )
      `;
    }
    const competenceRecord = await transaction.triageCompetence.findFirst({
      where: { organization_id: organizationId, client_id: clientId, competence },
      select: { id: true, catalog_snapshot_initialized_at: true },
    });

    if (competenceRecord?.id && competenceRecord.catalog_snapshot_initialized_at === null) {
      await ensureCatalogSnapshotForCompetence(transaction, organizationId, competenceRecord.id);
    }

    const catalogCodes = competenceRecord?.id
      ? await transaction.triageCompetenceCatalogSnapshot.findMany({
          where: {
            organization_id: organizationId,
            competence_id: competenceRecord.id,
            kind,
            code: { in: uniqueCodes },
          },
          select: { code: true },
        })
      : await transaction.triageCatalogItem.findMany({
          where: {
            organization_id: organizationId,
            kind,
            code: { in: uniqueCodes },
            archived_at: null,
          },
          select: { code: true },
        });
    const availableCodes = new Set(catalogCodes.map((item) => item.code));
    const missing = uniqueCodes.find((code) => !availableCodes.has(code));
    if (missing) {
      throw new ServiceError(
        400,
        `Valor ${missing} não está disponível no catálogo da competência.`,
      );
    }
  }
}

function legacyActiveItems(value: unknown): Record<string, TriageDocumentItemNotes> {
  const activeItems = Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
  return Object.fromEntries(
    activeItems.map((field) => [field, { note: null, justification: null, required: true }]),
  );
}

function fiscalSnapshotItems(value: unknown): Record<string, TriageDocumentItemNotes> {
  const source = value && typeof value === "object" && !Array.isArray(value) ? value : {};
  const configs = Array.isArray((source as Record<string, unknown>).configs)
    ? ((source as Record<string, unknown>).configs as unknown[])
    : [];
  const config = configs.find(
    (item) =>
      item &&
      typeof item === "object" &&
      !Array.isArray(item) &&
      (item as Record<string, unknown>).type === "FISCAL",
  );
  const activeItems =
    config && typeof config === "object" && !Array.isArray(config)
      ? (config as Record<string, unknown>).active_items
      : [];
  if (!Array.isArray(activeItems)) return {};

  return Object.fromEntries(
    activeItems.flatMap((item) => {
      if (typeof item === "string" && isTriageFiscalField(item)) {
        return [[item, { note: null, justification: null, required: true }]];
      }
      if (!item || typeof item !== "object" || Array.isArray(item)) return [];
      const record = item as Record<string, unknown>;
      const field = record.field;
      if (typeof field !== "string" || !isTriageFiscalField(field)) return [];
      return [
        [
          field,
          {
            note: null,
            justification: null,
            required: record.required !== false,
            ...(isItemPriority(record.priority) ? { priority: record.priority } : {}),
            ...(isDeliveryMethod(record.delivery_method)
              ? { delivery_method: record.delivery_method }
              : {}),
            ...(isDeliveryMethod(record.state_site) ? { state_site: record.state_site } : {}),
          },
        ],
      ];
    }),
  );
}
