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

export class ControlService {
  constructor(
    private readonly prisma: ControlServicePrisma = prismaClient,
    private readonly audit: ControlServiceAuditFns = { createLog, logUpdateIfChanged },
  ) {}

  async create(
    data: CreateControlRequest,
  ): Promise<{ control: ControlContabilEntity; created: boolean }> {
    try {
      const existing = await this.prisma.controlContabil.findFirst({
        where: {
          client_id: data.clientId,
          competence: data.competence,
          organization_id: data.organizationId,
        },
      });

      if (existing) {
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
        where: { id, organization_id: auth.organizationId },
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
}
