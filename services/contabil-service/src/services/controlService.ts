import { error as logError, ServiceError } from "@workspace/shared";

import {
  type CreateLogParams,
  createLog,
  type LogUpdateParams,
  logUpdateIfChanged,
} from "../integrations/audit.js";
import prismaClient from "../integrations/prisma.js";

export type ControlServicePrisma = typeof prismaClient;

type ControlServiceAuditFns = {
  createLog: (params: CreateLogParams) => Promise<void>;
  logUpdateIfChanged: (params: LogUpdateParams) => Promise<void>;
};

export type ControlContabilEntity = NonNullable<
  Awaited<ReturnType<ControlServicePrisma["controlContabil"]["findFirst"]>>
>;

export interface ControlAuthContext {
  userId: string;
  organizationId: string;
  permission?: number;
}

export interface CreateControlRequest extends ControlAuthContext {
  clientId: string;
  competence: string;
}

export interface CreateYearControlsRequest extends ControlAuthContext {
  clientId: string;
  year: number;
  confirmed: boolean;
}

export interface ControlCompetenceRequest extends ControlAuthContext {
  clientId: string;
  competence: string;
}

export interface ControlPortfolio {
  competence: string;
  items: Array<{
    client_id: string;
    legal_name: string;
    control: ControlContabilEntity | null;
    closing: Record<string, unknown>;
  }>;
}

const UPDATABLE_FIELDS = new Set<string>([
  "regenerate_accounting_entries",
  "check_summary_by_accumulator",
  "post_accounting_transaction",
  "import_bank_statements",
  "reconcile_bank_statements",
  "reconcile_vendors",
  "integrate_taxes",
  "settle_federal_taxes_via_ecac",
  "settle_state_taxes_via_sefaz_ba",
  "integrate_payroll",
  "suspense_accounts",
  "check_overdrawn_accounts",
  "general_account_reconciliation",
  "check_loan_and_interest_accounts",
  "monthly_closing",
  "reconcile_icms_pis_cofins",
  "depreciation",
  "notes",
]);

const DEFAULT_CREATE_DATA = {
  regenerate_accounting_entries: false,
  check_summary_by_accumulator: false,
  post_accounting_transaction: false,
  import_bank_statements: false,
  reconcile_bank_statements: false,
  reconcile_vendors: false,
  integrate_taxes: false,
  settle_federal_taxes_via_ecac: false,
  settle_state_taxes_via_sefaz_ba: false,
  integrate_payroll: false,
  suspense_accounts: false,
  check_overdrawn_accounts: false,
  general_account_reconciliation: false,
  check_loan_and_interest_accounts: false,
  monthly_closing: false,
  reconcile_icms_pis_cofins: false,
  depreciation: false,
  notes: "",
} as const;

const COMPLETED_CHECKLIST_DATA = {
  regenerate_accounting_entries: true,
  check_summary_by_accumulator: true,
  post_accounting_transaction: true,
  import_bank_statements: true,
  reconcile_bank_statements: true,
  reconcile_vendors: true,
  integrate_taxes: true,
  settle_federal_taxes_via_ecac: true,
  settle_state_taxes_via_sefaz_ba: true,
  integrate_payroll: true,
  suspense_accounts: true,
  check_overdrawn_accounts: true,
  general_account_reconciliation: true,
  check_loan_and_interest_accounts: true,
  monthly_closing: true,
  reconcile_icms_pis_cofins: true,
  depreciation: true,
} as const;

function getCompetenceInterval(competence: string): { start: Date; end: Date } {
  const match = /^(\d{4})-(0[1-9]|1[0-2])$/.exec(competence);
  if (!match) {
    throw new ServiceError(400, "competence deve estar no formato YYYY-MM.");
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  return {
    start: new Date(Date.UTC(year, month - 1, 1)),
    end: new Date(Date.UTC(year, month, 0, 23, 59, 59, 999)),
  };
}

function getYearCompetences(year: number): string[] {
  if (!Number.isInteger(year) || year < 2000 || year > 2100) {
    throw new ServiceError(400, "year deve estar entre 2000 e 2100.");
  }

  return Array.from({ length: 12 }, (_, index) => `${year}-${String(index + 1).padStart(2, "0")}`);
}

export class ControlService {
  constructor(
    private readonly prisma: ControlServicePrisma = prismaClient,
    private readonly audit: ControlServiceAuditFns = { createLog, logUpdateIfChanged },
  ) {}

  async list(competence: string, organizationId: string): Promise<ControlPortfolio> {
    const { start, end } = getCompetenceInterval(competence);

    try {
      const clients = await this.prisma.client.findMany({
        where: {
          organization_id: organizationId,
          contabil: true,
          AND: [
            {
              OR: [{ competence_entry: null }, { competence_entry: { lte: end } }],
            },
            {
              OR: [{ competence_output: null }, { competence_output: { gte: start } }],
            },
          ],
        },
        select: {
          id: true,
          name: true,
          company_name: true,
          controlContabil: {
            where: { competence, organization_id: organizationId, archived_at: null },
            orderBy: { id: "asc" },
            take: 1,
          },
          triageClosings: {
            where: { competence, organization_id: organizationId, archived_at: null },
            orderBy: { id: "asc" },
            take: 1,
          },
        },
      });

      const items = clients
        .map((client) => ({
          client_id: client.id,
          legal_name: client.company_name?.trim() || client.name,
          control: client.controlContabil[0] ?? null,
          closing: client.triageClosings?.[0] ?? {
            client_id: client.id,
            competence,
            status: "NOT_RECEIVED",
            archived_at: null,
          },
        }))
        .sort((a, b) => a.legal_name.localeCompare(b.legal_name, "pt-BR", { sensitivity: "base" }));

      return { competence, items };
    } catch (err: unknown) {
      logError("Erro ao listar carteira operacional contábil", { err });
      if (err instanceof ServiceError) {
        throw err;
      }
      throw new ServiceError(500, "Erro ao listar carteira operacional contábil.", err);
    }
  }

  // Mesma regra da tela (clients/[id]/contabil): só `contabil === false` bloqueia; nulo é elegível.
  private async assertContabilEligible(clientId: string, organizationId: string): Promise<void> {
    const client = await this.prisma.client.findFirst({
      where: { id: clientId, organization_id: organizationId },
      select: { contabil: true },
    });
    if (!client) {
      throw new ServiceError(404, "Cliente não encontrado.");
    }
    if (client.contabil === false) {
      throw new ServiceError(400, "Serviço contábil não contratado para este cliente.");
    }
  }

  async create(
    data: CreateControlRequest,
  ): Promise<{ control: ControlContabilEntity; created: boolean }> {
    try {
      await this.assertContabilEligible(data.clientId, data.organizationId);
      const existing = await this.prisma.controlContabil.findFirst({
        where: {
          client_id: data.clientId,
          competence: data.competence,
          organization_id: data.organizationId,
        },
      });

      if (existing) {
        if (existing.archived_at !== null) {
          await this.restoreCompetence(data);
          const restored = await this.prisma.controlContabil.findFirst({
            where: {
              client_id: data.clientId,
              competence: data.competence,
              organization_id: data.organizationId,
              archived_at: null,
            },
          });
          if (!restored) {
            throw new ServiceError(
              409,
              "Não foi possível restaurar o controle contábil arquivado.",
            );
          }
          return { control: restored, created: false };
        }
        return { control: existing, created: false };
      }

      const control = await this.prisma.controlContabil.create({
        data: {
          client_id: data.clientId,
          competence: data.competence,
          organization_id: data.organizationId,
          ...DEFAULT_CREATE_DATA,
        },
      });

      await this.audit.createLog({
        userId: data.userId,
        organizationId: data.organizationId,
        permission: data.permission ?? null,
        action: "Cadastro",
        referring: "contabil.control",
        referringId: control.id,
        changes: "{}",
      });

      return { control, created: true };
    } catch (err: unknown) {
      logError("Erro ao criar ou obter controle contábil", { err });
      if (err instanceof ServiceError) {
        throw err;
      }
      throw new ServiceError(500, "Erro ao criar controle contábil.", err);
    }
  }

  async createYear(
    data: CreateYearControlsRequest,
  ): Promise<{ competences: string[]; created: number; existing: number }> {
    if (!data.confirmed) {
      throw new ServiceError(400, "Confirmação explícita é obrigatória para criar o ano.");
    }
    if (Number(data.permission ?? 0) < 2) {
      throw new ServiceError(403, "Permissão insuficiente para criar controles contábeis.");
    }

    const competences = getYearCompetences(data.year);
    try {
      await this.assertContabilEligible(data.clientId, data.organizationId);

      const existing = await this.prisma.controlContabil.findMany({
        where: {
          client_id: data.clientId,
          organization_id: data.organizationId,
          competence: { in: competences },
        },
        select: { competence: true },
      });
      const existingCompetences = new Set(existing.map((control) => control.competence));
      const missing = competences.filter((competence) => !existingCompetences.has(competence));
      const created = missing.length
        ? await this.prisma.controlContabil.createMany({
            data: missing.map((competence) => ({
              client_id: data.clientId,
              competence,
              organization_id: data.organizationId,
              ...DEFAULT_CREATE_DATA,
            })),
            skipDuplicates: true,
          })
        : { count: 0 };

      await this.audit.createLog({
        userId: data.userId,
        organizationId: data.organizationId,
        permission: data.permission ?? null,
        action: "Criar controles contábeis anuais",
        referring: "contabil.control.batch",
        referringId: data.clientId,
        changes: JSON.stringify({ year: data.year, competences, created: created.count }),
      });

      return { competences, created: created.count, existing: competences.length - created.count };
    } catch (err: unknown) {
      logError("Erro ao criar controles contábeis anuais", { err });
      if (err instanceof ServiceError) {
        throw err;
      }
      throw new ServiceError(500, "Erro ao criar controles contábeis anuais.", err);
    }
  }

  async detail(
    clientId: string,
    competence: string,
    organizationId: string,
  ): Promise<ControlContabilEntity> {
    const control = await this.prisma.controlContabil.findFirst({
      where: {
        client_id: clientId,
        competence,
        organization_id: organizationId,
        archived_at: null,
      },
    });

    if (!control) {
      throw new ServiceError(404, "Controle contábil não encontrado.");
    }

    return control;
  }

  async updateField(
    id: string,
    field: string,
    value: boolean | string,
    auth: ControlAuthContext,
  ): Promise<ControlContabilEntity> {
    if (!UPDATABLE_FIELDS.has(field)) {
      throw new ServiceError(400, `Campo '${field}' é inválido ou não pode ser atualizado.`);
    }

    if (field !== "notes" && typeof value !== "boolean") {
      throw new ServiceError(400, `O valor para '${field}' deve ser um booleano (true/false).`);
    }

    if (field === "notes" && typeof value !== "string") {
      throw new ServiceError(400, "O valor para 'notes' deve ser um texto.");
    }

    try {
      const exists = await this.prisma.controlContabil.findFirst({
        where: { id, organization_id: auth.organizationId, archived_at: null },
      });

      if (!exists) {
        throw new ServiceError(404, "Controle contábil não encontrado.");
      }

      const updated = await this.prisma.controlContabil.update({
        where: { id },
        data: {
          [field]: value,
        },
      });

      await this.audit.logUpdateIfChanged({
        userId: auth.userId,
        organizationId: auth.organizationId,
        permission: auth.permission ?? null,
        action: "Atualização",
        referring: "contabil.control",
        referringId: id,
        oldData: exists as unknown as Record<string, unknown>,
        updatedData: updated as unknown as Record<string, unknown>,
      });

      return updated;
    } catch (err: unknown) {
      logError("Erro ao atualizar campo do controle contábil", { err });
      if (err instanceof ServiceError) {
        throw err;
      }
      throw new ServiceError(500, "Erro ao atualizar controle contábil.", err);
    }
  }

  async completeAll(id: string, auth: ControlAuthContext): Promise<ControlContabilEntity> {
    if (Number(auth.permission ?? 0) < 2) {
      throw new ServiceError(403, "Permissão insuficiente para atualizar controles contábeis.");
    }
    const current = await this.prisma.controlContabil.findFirst({
      where: { id, organization_id: auth.organizationId, archived_at: null },
    });
    if (!current) {
      throw new ServiceError(404, "Controle contábil não encontrado.");
    }
    const updated = await this.prisma.controlContabil.update({
      where: { id },
      data: COMPLETED_CHECKLIST_DATA,
    });
    await this.audit.logUpdateIfChanged({
      userId: auth.userId,
      organizationId: auth.organizationId,
      permission: auth.permission ?? null,
      action: "Concluir todos os itens do controle contábil",
      referring: "contabil.control",
      referringId: id,
      oldData: current as unknown as Record<string, unknown>,
      updatedData: updated as unknown as Record<string, unknown>,
    });
    return updated;
  }

  async archiveCompetence(data: ControlCompetenceRequest): Promise<Record<string, number>> {
    if (Number(data.permission ?? 0) < 2) {
      throw new ServiceError(403, "Permissão insuficiente para arquivar controles contábeis.");
    }

    const identity = {
      client_id: data.clientId,
      competence: data.competence,
      organization_id: data.organizationId,
    };
    const current = await this.prisma.controlContabil.findFirst({
      where: { ...identity, archived_at: null },
    });
    if (!current) {
      throw new ServiceError(404, "Competência contábil ativa não encontrada.");
    }

    const archivedAt = new Date();
    const [controls, monthly, statements, closings] = await this.prisma.$transaction([
      this.prisma.controlContabil.updateMany({
        where: { ...identity, archived_at: null },
        data: { archived_at: archivedAt },
      }),
      this.prisma.triageMonthly.updateMany({
        where: { ...identity, type: "CONTABIL", archived_at: null },
        data: { archived_at: archivedAt },
      }),
      this.prisma.triageBankStatement.updateMany({
        where: { ...identity, archived_at: null },
        data: { archived_at: archivedAt },
      }),
      this.prisma.triageClosing.updateMany({
        where: { ...identity, archived_at: null },
        data: { archived_at: archivedAt },
      }),
    ]);
    const result = {
      controls: controls.count,
      monthly: monthly.count,
      statements: statements.count,
      closings: closings.count,
    };
    await this.audit.logUpdateIfChanged({
      userId: data.userId,
      organizationId: data.organizationId,
      permission: data.permission ?? null,
      action: "Arquivar competência contábil",
      referring: "contabil.control",
      referringId: current.id,
      oldData: current as unknown as Record<string, unknown>,
      updatedData: { ...result, archived_at: archivedAt.toISOString() },
    });
    return result;
  }

  async restoreCompetence(data: ControlCompetenceRequest): Promise<Record<string, number>> {
    if (Number(data.permission ?? 0) < 2) {
      throw new ServiceError(403, "Permissão insuficiente para restaurar controles contábeis.");
    }

    const identity = {
      client_id: data.clientId,
      competence: data.competence,
      organization_id: data.organizationId,
    };
    const [controls, monthly, statements, closings] = await this.prisma.$transaction([
      this.prisma.controlContabil.updateMany({
        where: { ...identity, archived_at: { not: null } },
        data: { archived_at: null },
      }),
      this.prisma.triageMonthly.updateMany({
        where: { ...identity, type: "CONTABIL", archived_at: { not: null } },
        data: { archived_at: null },
      }),
      this.prisma.triageBankStatement.updateMany({
        where: { ...identity, archived_at: { not: null } },
        data: { archived_at: null },
      }),
      this.prisma.triageClosing.updateMany({
        where: { ...identity, archived_at: { not: null } },
        data: { archived_at: null },
      }),
    ]);
    if (controls.count === 0) {
      throw new ServiceError(404, "Competência contábil arquivada não encontrada.");
    }
    const result = {
      controls: controls.count,
      monthly: monthly.count,
      statements: statements.count,
      closings: closings.count,
    };
    await this.audit.createLog({
      userId: data.userId,
      organizationId: data.organizationId,
      permission: data.permission ?? null,
      action: "Restaurar competência contábil",
      referring: "contabil.control",
      referringId: data.clientId,
      changes: JSON.stringify({ competence: data.competence, ...result }),
    });
    return result;
  }
}
