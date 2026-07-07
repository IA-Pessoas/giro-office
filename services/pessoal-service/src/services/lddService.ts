import { error as logError, ServiceError } from "@workspace/shared";

import type { PrismaClient } from "../generated/prisma/client.js";
import type { CreateLddBody, ListLddQuery, UpdateLddBody } from "../schemas/ldd.schemas.js";
import type { PessoalAuditService } from "./pessoalAuditService.js";
import { omitUndefined, type PessoalAuthContext, requireUserId } from "./pessoalServiceTypes.js";

const lddSelect = {
  id: true,
  client_id: true,
  type: true,
  period: true,
  due_date: true,
  balance_amount: true,
  registration_status: true,
  status: true,
  organization_id: true,
} as const;

export type LddRecord = {
  id: string;
  client_id: string;
  type: string;
  period: string | null;
  due_date: Date | null;
  balance_amount: number | null;
  registration_status: string | null;
  status: string | null;
  organization_id: string;
};

export class LddService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly auditService: PessoalAuditService,
  ) {}

  async create(context: PessoalAuthContext, body: CreateLddBody): Promise<LddRecord> {
    try {
      const userId = requireUserId(context);
      await this.ensureClient(context.organizationId, body.client_id);

      const created = await this.prisma.lddPessoal.create({
        data: {
          client_id: body.client_id,
          type: body.type,
          period: body.period ?? null,
          due_date: body.due_date ?? null,
          balance_amount: body.balance_amount ?? null,
          registration_status: body.registration_status ?? null,
          status: body.status ?? null,
          organization_id: context.organizationId,
        },
        select: lddSelect,
      });

      await this.auditService.recordChange({
        requestId: context.requestId,
        organizationId: context.organizationId,
        userId,
        permission: context.permission,
        action: "Cadastro",
        referring: "pessoal.ldd",
        referringId: created.id,
        changes: {},
        path: `/pessoal/ldd/${created.id}`,
      });

      return created;
    } catch (err: unknown) {
      logError("Erro ao criar LDD de pessoal", { err });
      if (err instanceof ServiceError) throw err;
      throw new ServiceError(500, "Erro ao criar LDD de pessoal.", err);
    }
  }

  async list(
    context: Pick<PessoalAuthContext, "organizationId">,
    query: ListLddQuery,
  ): Promise<LddRecord[]> {
    const where = omitUndefined({
      organization_id: context.organizationId,
      client_id: query.client_id,
    });

    return this.prisma.lddPessoal.findMany({
      where,
      select: lddSelect,
      orderBy: { due_date: "asc" },
    });
  }

  async update(context: PessoalAuthContext, id: string, body: UpdateLddBody): Promise<LddRecord> {
    try {
      const userId = requireUserId(context);
      const existing = await this.prisma.lddPessoal.findFirst({
        where: { id, organization_id: context.organizationId },
        select: lddSelect,
      });

      if (!existing) {
        throw new ServiceError(404, "LDD nao encontrado.");
      }

      const data = omitUndefined({
        type: body.type,
        period: body.period,
        due_date: body.due_date,
        balance_amount: body.balance_amount,
        registration_status: body.registration_status,
        status: body.status,
      });

      const updated = await this.prisma.lddPessoal.update({
        where: { id },
        data,
        select: lddSelect,
      });

      await this.auditService.recordChange({
        requestId: context.requestId,
        organizationId: context.organizationId,
        userId,
        permission: context.permission,
        action: "Atualizacao",
        referring: "pessoal.ldd",
        referringId: id,
        changes: data,
        path: `/pessoal/ldd/${id}`,
      });

      return updated;
    } catch (err: unknown) {
      logError("Erro ao atualizar LDD de pessoal", { err });
      if (err instanceof ServiceError) throw err;
      throw new ServiceError(500, "Erro ao atualizar LDD de pessoal.", err);
    }
  }

  async delete(context: PessoalAuthContext, id: string): Promise<LddRecord> {
    try {
      const userId = requireUserId(context);
      const existing = await this.prisma.lddPessoal.findFirst({
        where: { id, organization_id: context.organizationId },
        select: lddSelect,
      });

      if (!existing) {
        throw new ServiceError(404, "LDD nao encontrado.");
      }

      await this.prisma.lddPessoal.delete({ where: { id } });

      await this.auditService.recordChange({
        requestId: context.requestId,
        organizationId: context.organizationId,
        userId,
        permission: context.permission,
        action: "Exclusao",
        referring: "pessoal.ldd",
        referringId: id,
        changes: existing,
        path: `/pessoal/ldd/${id}`,
      });

      return existing;
    } catch (err: unknown) {
      logError("Erro ao remover LDD de pessoal", { err });
      if (err instanceof ServiceError) throw err;
      throw new ServiceError(500, "Erro ao remover LDD de pessoal.", err);
    }
  }

  private async ensureClient(organizationId: string, clientId: string): Promise<void> {
    const client = await this.prisma.client.findFirst({
      where: { id: clientId, organization_id: organizationId },
      select: { id: true },
    });

    if (!client) {
      throw new ServiceError(404, "Cliente nao encontrado para a organizacao.");
    }
  }
}
