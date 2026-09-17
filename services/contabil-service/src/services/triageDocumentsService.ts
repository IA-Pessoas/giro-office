import { error as logError, ServiceError } from "@workspace/shared";
import type { Prisma } from "../generated/prisma/client.js";

import { type LogUpdateParams, logUpdateIfChanged } from "../integrations/audit.js";
import prismaClient from "../integrations/prisma.js";

export const TRIAGE_DOCUMENT_FIELDS = [
  "financial_transactions",
  "triaged_transactions",
  "inventory_control",
  "accounts_payable_report",
  "accounts_receivable_report",
  "card_statements",
  "loan_agreements",
  "bank_reconciliation",
  "bank_investments",
  "card_sales_report",
] as const;

export const TRIAGE_FISCAL_CHECKLIST_FIELDS = [
  "inbound_report",
  "outbound_report",
  "nfse_provided",
  "nfse_received",
  "cte_documents",
  "mei_documents",
  "nfce_documents",
  "sped_fiscal",
  "sped_contributions",
  "nfce_received",
  "model_21_invoice",
  "cte_as_issuer",
  "services_provided_as_mei",
] as const;

export const TRIAGE_FISCAL_FIELDS = [...TRIAGE_FISCAL_CHECKLIST_FIELDS, "billing_amount"] as const;

export const TRIAGE_DELIVERY_METHODS = ["EMAIL", "PORTAL", "WHATSAPP"] as const;

export const TRIAGE_ITEM_PRIORITIES = ["LOW", "MEDIUM", "HIGH"] as const;

export const TRIAGE_DOCUMENT_STATUSES = [
  "PENDING",
  "COMPLETED",
  "ATTENTION",
  "UNDER_REVIEW",
  "NOT_PRESENT",
  "NOT_APPLICABLE",
] as const;
export const TRIAGE_DOCUMENT_NOTE_MAX_LENGTH = 2_000;

export type TriageDocumentField = (typeof TRIAGE_DOCUMENT_FIELDS)[number];
export type TriageFiscalChecklistField = (typeof TRIAGE_FISCAL_CHECKLIST_FIELDS)[number];
export type TriageFiscalField = (typeof TRIAGE_FISCAL_FIELDS)[number];
export type TriageRoutineType = "CONTABIL" | "FISCAL";
export type TriageDeliveryMethod = (typeof TRIAGE_DELIVERY_METHODS)[number];
export type TriageItemPriority = (typeof TRIAGE_ITEM_PRIORITIES)[number];
export type TriageDocumentStatus = (typeof TRIAGE_DOCUMENT_STATUSES)[number];
export type TriageDocumentsServicePrisma = typeof prismaClient;

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
  required?: boolean;
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
  return (
    typeof value === "string" && TRIAGE_DELIVERY_METHODS.includes(value as TriageDeliveryMethod)
  );
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
      const required = (item as Record<string, unknown>).required;
      return [
        field,
        {
          note: typeof note === "string" && note.trim() ? note.trim() : null,
          justification:
            typeof justification === "string" && justification.trim() ? justification.trim() : null,
          ...(isItemPriority(priority) ? { priority } : {}),
          ...(isDeliveryMethod(deliveryMethod) ? { delivery_method: deliveryMethod } : {}),
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

export class TriageDocumentsService {
  constructor(
    private readonly prisma: TriageDocumentsServicePrisma = prismaClient,
    private readonly audit: TriageDocumentsAudit = { logUpdateIfChanged },
  ) {}

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
    organizationId: string,
  ): Promise<Record<string, unknown>> {
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

    if (!monthly) {
      throw new ServiceError(404, "Pendência documental mensal não encontrada.");
    }

    return this.toMonthlyResponse(monthly, type);
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
    const justification = normalizeOptionalNote(update.justification, "Justificativa documental");
    const value = isBillingAmount
      ? normalizeOptionalValue(update.value, "Valor de faturamento")
      : undefined;
    const deliveryMethod = update.delivery_method;
    if (
      deliveryMethod !== undefined &&
      deliveryMethod !== null &&
      !isDeliveryMethod(deliveryMethod)
    ) {
      throw new ServiceError(400, "Método de entrega fiscal inválido.");
    }

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
      const fields = checklistFields(type);
      const checklist = asChecklist(monthly.checklist, fields);
      const itemNotes = asItemNotes(
        monthly.item_notes,
        type === "FISCAL" ? TRIAGE_FISCAL_FIELDS : fields,
      );
      const currentNotes = itemNotes[update.field] ?? { note: null, justification: null };
      const nextItemNotes =
        isBillingAmount ||
        (note === undefined && justification === undefined && deliveryMethod === undefined)
          ? undefined
          : {
              ...itemNotes,
              [update.field]: {
                ...currentNotes,
                note: note === undefined ? currentNotes.note : note,
                justification:
                  justification === undefined ? currentNotes.justification : justification,
                ...(deliveryMethod !== undefined ? { delivery_method: deliveryMethod } : {}),
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
    });

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
    await this.assertCanEdit(request.client_id, auth, "CONTABIL");
    const identity = {
      organization_id: auth.organizationId,
      client_id: request.client_id,
      competence: request.competence,
      bank_id: request.bank_id,
    };
    const existing = await this.prisma.triageBankStatement.findFirst({
      where: { ...identity, archived_at: null },
    });
    const statement = await this.prisma.triageBankStatement.upsert({
      where: { organization_id_client_id_competence_bank_id: identity },
      create: { ...identity, status: request.status },
      update: { status: request.status },
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

    return { checklist, itemNotes };
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
          },
        ],
      ];
    }),
  );
}
