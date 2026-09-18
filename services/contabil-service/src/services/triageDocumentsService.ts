import { error as logError, ServiceError } from "@workspace/shared";

import { type LogUpdateParams, logUpdateIfChanged } from "../integrations/audit.js";
import prismaClient from "../integrations/prisma.js";

export const TRIAGE_DOCUMENT_FIELDS = [
  "financial_transactions",
  "inventory_control",
  "accounts_payable_report",
  "accounts_receivable_report",
  "card_statements",
  "loan_agreements",
  "bank_reconciliation",
  "bank_investments",
  "card_sales_report",
] as const;

export const TRIAGE_DOCUMENT_STATUSES = [
  "PENDING",
  "COMPLETED",
  "ATTENTION",
  "NOT_PRESENT",
  "NOT_APPLICABLE",
] as const;

export type TriageDocumentField = (typeof TRIAGE_DOCUMENT_FIELDS)[number];
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
}

export interface TriageDocumentItemUpdate {
  field: TriageDocumentField;
  status: TriageDocumentStatus;
}

export interface TriageDocumentsBulkUpdate {
  status: TriageDocumentStatus;
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

function isTriageDocumentField(value: string): value is TriageDocumentField {
  return TRIAGE_DOCUMENT_FIELDS.includes(value as TriageDocumentField);
}

function isTriageDocumentStatus(value: unknown): value is TriageDocumentStatus {
  return (
    typeof value === "string" && TRIAGE_DOCUMENT_STATUSES.includes(value as TriageDocumentStatus)
  );
}

function asChecklist(value: unknown): Record<TriageDocumentField, TriageDocumentStatus> {
  const source = value && typeof value === "object" && !Array.isArray(value) ? value : {};
  const checklist = {} as Record<TriageDocumentField, TriageDocumentStatus>;

  for (const field of TRIAGE_DOCUMENT_FIELDS) {
    const status = (source as Record<string, unknown>)[field];
    checklist[field] = isTriageDocumentStatus(status) ? status : "NOT_APPLICABLE";
  }

  return checklist;
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

  getSummary(checklist: Record<string, unknown>): TriageDocumentSummary {
    const normalized = asChecklist(checklist);
    const statuses = Object.values(normalized);
    const completed = statuses.filter((status) => status === "COMPLETED").length;
    const notApplicable = statuses.filter((status) => status === "NOT_APPLICABLE").length;
    const notPresent = statuses.filter((status) => status === "NOT_PRESENT").length;
    const applicable = statuses.length - notApplicable - notPresent;

    return {
      applicable,
      attention: statuses.filter((status) => status === "ATTENTION").length,
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
    const monthly = await this.prisma.triageMonthly.findFirst({
      where: {
        client_id: request.client_id,
        competence: request.competence,
        organization_id: organizationId,
        type: "CONTABIL",
        archived_at: null,
      },
    });

    if (!monthly) {
      throw new ServiceError(404, "Pendência documental mensal não encontrada.");
    }

    return this.toMonthlyResponse(monthly);
  }

  async getEditability(
    clientId: string,
    auth: TriageDocumentsAuthContext,
  ): Promise<{ can_edit: boolean }> {
    try {
      await this.assertCanEdit(clientId, auth);
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
    const existing = await this.prisma.triageMonthly.findFirst({
      where: {
        client_id: request.client_id,
        competence: request.competence,
        organization_id: auth.organizationId,
        type: "CONTABIL",
        archived_at: null,
      },
    });

    if (existing) {
      return this.toMonthlyResponse(existing);
    }

    await this.assertCanEdit(request.client_id, auth);

    const config = await this.prisma.triageConfig.findFirst({
      where: {
        client_id: request.client_id,
        organization_id: auth.organizationId,
        type: "CONTABIL",
      },
      select: { active_items: true },
    });
    const activeItems = new Set(
      Array.isArray(config?.active_items)
        ? config.active_items.filter((item): item is string => typeof item === "string")
        : [],
    );
    const checklist = Object.fromEntries(
      TRIAGE_DOCUMENT_FIELDS.map((field) => [
        field,
        activeItems.has(field) ? "PENDING" : "NOT_APPLICABLE",
      ]),
    );

    try {
      const created = await this.prisma.triageMonthly.create({
        data: {
          client_id: request.client_id,
          competence: request.competence,
          organization_id: auth.organizationId,
          type: "CONTABIL",
          archived_at: null,
          checklist,
        },
      });

      return this.toMonthlyResponse(created);
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
          type: "CONTABIL",
        },
      });
      if (concurrent) {
        return this.toMonthlyResponse(concurrent);
      }

      throw new ServiceError(409, "Não foi possível criar a pendência documental mensal.", error);
    }
  }

  async updateItem(
    monthlyId: string,
    update: TriageDocumentItemUpdate,
    auth: TriageDocumentsAuthContext,
  ): Promise<Record<string, unknown>> {
    if (!isTriageDocumentField(update.field) || !isTriageDocumentStatus(update.status)) {
      throw new ServiceError(400, "Item ou status documental inválido.");
    }

    const monthly = await this.findMonthlyForUpdate(monthlyId, auth.organizationId);
    await this.assertCanEdit(monthly.client_id, auth);
    const checklist = asChecklist(monthly.checklist);
    const updated = await this.prisma.triageMonthly.update({
      where: { id: monthly.id },
      data: { checklist: { ...checklist, [update.field]: update.status } },
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

    return this.toMonthlyResponse(updated);
  }

  async updateAll(
    monthlyId: string,
    update: TriageDocumentsBulkUpdate,
    auth: TriageDocumentsAuthContext,
  ): Promise<Record<string, unknown>> {
    if (!isTriageDocumentStatus(update.status)) {
      throw new ServiceError(400, "Status documental inválido.");
    }
    const monthly = await this.findMonthlyForUpdate(monthlyId, auth.organizationId);
    await this.assertCanEdit(monthly.client_id, auth);
    const checklist = asChecklist(monthly.checklist);
    const nextChecklist = Object.fromEntries(
      Object.entries(checklist).map(([field, status]) => [
        field,
        status === "NOT_APPLICABLE" ? status : update.status,
      ]),
    );
    const updated = await this.prisma.triageMonthly.update({
      where: { id: monthly.id },
      data: { checklist: nextChecklist },
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

    return this.toMonthlyResponse(updated);
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
    await this.assertCanEdit(request.client_id, auth);
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
    monthlyId: string,
    organizationId: string,
  ): Promise<
    NonNullable<Awaited<ReturnType<TriageDocumentsServicePrisma["triageMonthly"]["findFirst"]>>>
  > {
    const monthly = await this.prisma.triageMonthly.findFirst({
      where: {
        id: monthlyId,
        organization_id: organizationId,
        type: "CONTABIL",
        archived_at: null,
      },
    });
    if (!monthly) {
      throw new ServiceError(404, "Pendência documental mensal não encontrada.");
    }
    return monthly;
  }

  private async assertCanEdit(clientId: string, auth: TriageDocumentsAuthContext): Promise<void> {
    if (Number(auth.modules?.contabil ?? 0) >= 2) {
      return;
    }

    const assignment = await this.prisma.triageResponsible.findFirst({
      where: {
        client_id: clientId,
        organization_id: auth.organizationId,
        type: "CONTABIL",
        user_id: auth.userId,
      },
    });
    if (!assignment) {
      throw new ServiceError(403, "Permissão insuficiente para alterar pendências documentais.");
    }
  }

  private toMonthlyResponse(monthly: {
    checklist: unknown;
    [key: string]: unknown;
  }): Record<string, unknown> {
    const checklist = asChecklist(monthly.checklist);
    return { ...monthly, checklist, summary: this.getSummary(checklist) };
  }
}
