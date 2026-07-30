import { error as logError, ServiceError } from "@workspace/shared";

import type { PrismaClient } from "../generated/prisma/client.js";
import type { CreatePayrollBody, UpdatePayrollBody } from "../schemas/payroll.schemas.js";
import type { PessoalAuditService } from "./pessoalAuditService.js";
import {
  omitUndefined,
  PESSOAL_WRITE_PERMISSION,
  type PessoalAuthContext,
  requireMinimumPermission,
  requireUserId,
} from "./pessoalServiceTypes.js";

const payrollSelect = {
  id: true,
  client_id: true,
  responsible_id: true,
  advance: true,
  advance_type: true,
  advance_amount: true,
  info: true,
  previous: true,
  onvio: true,
  group: true,
  vt: true,
  vt_value: true,
  vt_type: true,
  va: true,
  assistance_fee: true,
  union_id: true,
  bem_mais: true,
  bsf: true,
  reinf: true,
  employees: true,
  contact: true,
  organization_id: true,
} as const;

export type PayrollRecord = {
  id: string;
  client_id: string;
  responsible_id: string | null;
  advance: boolean;
  advance_type: string | null;
  advance_amount: number | null;
  info: string;
  previous: boolean;
  onvio: boolean;
  group: string;
  vt: boolean;
  vt_value: number | null;
  vt_type: string | null;
  va: boolean;
  assistance_fee: boolean;
  union_id: string | null;
  bem_mais: boolean;
  bsf: boolean;
  reinf: boolean;
  employees: number;
  contact: string | null;
  organization_id: string;
};

export class PayrollService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly auditService: PessoalAuditService,
  ) {}

  async create(context: PessoalAuthContext, body: CreatePayrollBody): Promise<PayrollRecord> {
    try {
      requireMinimumPermission(context, PESSOAL_WRITE_PERMISSION);
      const userId = requireUserId(context);
      await this.ensureRelationships(context.organizationId, body);

      const existing = await this.prisma.payroll.findFirst({
        where: { client_id: body.client_id, organization_id: context.organizationId },
        select: { id: true },
      });
      if (existing) {
        throw new ServiceError(409, "Folha de pessoal ja cadastrada para o cliente.");
      }

      const created = await this.prisma.payroll.create({
        data: {
          ...body,
          responsible_id: body.responsible_id ?? null,
          advance_type: body.advance_type ?? null,
          advance_amount: body.advance_amount ?? null,
          vt_value: body.vt_value ?? null,
          vt_type: body.vt_type ?? null,
          union_id: body.union_id ?? null,
          contact: body.contact ?? null,
          organization_id: context.organizationId,
        },
        select: payrollSelect,
      });

      await this.auditService.recordChange({
        requestId: context.requestId,
        organizationId: context.organizationId,
        userId,
        permission: context.permission,
        action: "Cadastro",
        referring: "pessoal.payroll",
        referringId: created.id,
        changes: {},
        path: `/pessoal/payroll/${body.client_id}`,
      });

      return created;
    } catch (err: unknown) {
      logError("Erro ao criar folha de pessoal", { err });
      if (err instanceof ServiceError) throw err;
      throw new ServiceError(500, "Erro ao criar folha de pessoal.", err);
    }
  }

  async detail(
    context: Pick<PessoalAuthContext, "organizationId">,
    clientId: string,
  ): Promise<PayrollRecord | null> {
    return this.prisma.payroll.findFirst({
      where: { client_id: clientId, organization_id: context.organizationId },
      select: payrollSelect,
    });
  }

  async update(
    context: PessoalAuthContext,
    clientId: string,
    body: UpdatePayrollBody,
  ): Promise<PayrollRecord> {
    try {
      requireMinimumPermission(context, PESSOAL_WRITE_PERMISSION);
      const userId = requireUserId(context);
      const existing = await this.prisma.payroll.findFirst({
        where: { client_id: clientId, organization_id: context.organizationId },
        select: payrollSelect,
      });

      if (!existing) {
        throw new ServiceError(404, "Folha de pessoal nao encontrada.");
      }

      await this.ensureRelationships(context.organizationId, { ...body, client_id: clientId });

      const data = omitUndefined({
        responsible_id: body.responsible_id,
        advance: body.advance,
        advance_type: body.advance_type,
        advance_amount: body.advance_amount,
        info: body.info,
        previous: body.previous,
        onvio: body.onvio,
        group: body.group,
        vt: body.vt,
        vt_value: body.vt_value,
        vt_type: body.vt_type,
        va: body.va,
        assistance_fee: body.assistance_fee,
        union_id: body.union_id,
        bem_mais: body.bem_mais,
        bsf: body.bsf,
        reinf: body.reinf,
        employees: body.employees,
        contact: body.contact,
      });
      const updated = await this.prisma.payroll.update({
        where: { client_id: clientId },
        data,
        select: payrollSelect,
      });

      await this.auditService.recordChange({
        requestId: context.requestId,
        organizationId: context.organizationId,
        userId,
        permission: context.permission,
        action: "Atualizacao",
        referring: "pessoal.payroll",
        referringId: existing.id,
        changes: data,
        path: `/pessoal/payroll/${clientId}`,
      });

      return updated;
    } catch (err: unknown) {
      logError("Erro ao atualizar folha de pessoal", { err });
      if (err instanceof ServiceError) throw err;
      throw new ServiceError(500, "Erro ao atualizar folha de pessoal.", err);
    }
  }

  private async ensureRelationships(
    organizationId: string,
    body: Partial<CreatePayrollBody> & { client_id: string },
  ): Promise<void> {
    const client = await this.prisma.client.findFirst({
      where: { id: body.client_id, organization_id: organizationId },
      select: { id: true },
    });
    if (!client) {
      throw new ServiceError(404, "Cliente nao encontrado para a organizacao.");
    }

    if (body.responsible_id) {
      const responsible = await this.prisma.user.findFirst({
        where: { id: body.responsible_id, organization_id: organizationId },
        select: { id: true },
      });
      if (!responsible) {
        throw new ServiceError(404, "Responsavel nao encontrado para a organizacao.");
      }
    }

    if (body.union_id) {
      const union = await this.prisma.unionPessoal.findFirst({
        where: { id: body.union_id, organization_id: organizationId },
        select: { id: true },
      });
      if (!union) {
        throw new ServiceError(404, "Sindicato nao encontrado para a organizacao.");
      }
    }
  }
}
