import { error as logError, ServiceError } from "@workspace/shared";

import type { PrismaClient } from "../generated/prisma/client.js";
import type { CreateUnionBody, UpdateUnionBody } from "../schemas/union.schemas.js";
import type { PessoalAuditService } from "./pessoalAuditService.js";
import { omitUndefined, type PessoalAuthContext, requireUserId } from "./pessoalServiceTypes.js";

const unionSelect = {
  id: true,
  name: true,
  cnpj: true,
  base_date: true,
  organization_id: true,
} as const;

export type UnionRecord = {
  id: string;
  name: string;
  cnpj: string;
  base_date: Date | null;
  organization_id: string;
};

export class UnionService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly auditService: PessoalAuditService,
  ) {}

  async list(context: Pick<PessoalAuthContext, "organizationId">): Promise<UnionRecord[]> {
    return this.prisma.unionPessoal.findMany({
      where: { organization_id: context.organizationId },
      select: unionSelect,
      orderBy: { name: "asc" },
    });
  }

  async detail(
    context: Pick<PessoalAuthContext, "organizationId">,
    id: string,
  ): Promise<UnionRecord> {
    const detail = await this.prisma.unionPessoal.findFirst({
      where: { id, organization_id: context.organizationId },
      select: unionSelect,
    });

    if (!detail) {
      throw new ServiceError(404, "Sindicato nao encontrado.");
    }

    return detail;
  }

  async create(context: PessoalAuthContext, body: CreateUnionBody): Promise<UnionRecord> {
    try {
      const userId = requireUserId(context);
      const existing = await this.prisma.unionPessoal.findFirst({
        where: {
          organization_id: context.organizationId,
          name: body.name,
          cnpj: body.cnpj,
          base_date: body.base_date ?? null,
        },
        select: { id: true },
      });

      if (existing) {
        throw new ServiceError(409, "Sindicato ja cadastrado.");
      }

      const created = await this.prisma.unionPessoal.create({
        data: {
          name: body.name,
          cnpj: body.cnpj,
          base_date: body.base_date ?? null,
          organization_id: context.organizationId,
        },
        select: unionSelect,
      });

      await this.auditService.recordChange({
        requestId: context.requestId,
        organizationId: context.organizationId,
        userId,
        permission: context.permission,
        action: "Cadastro",
        referring: "pessoal.union",
        referringId: created.id,
        changes: {},
        path: `/pessoal/unions/${created.id}`,
      });

      return created;
    } catch (err: unknown) {
      logError("Erro ao criar sindicato de pessoal", { err });
      if (err instanceof ServiceError) throw err;
      throw new ServiceError(500, "Erro ao criar sindicato de pessoal.", err);
    }
  }

  async update(
    context: PessoalAuthContext,
    id: string,
    body: UpdateUnionBody,
  ): Promise<UnionRecord> {
    try {
      const userId = requireUserId(context);
      const existing = await this.prisma.unionPessoal.findFirst({
        where: { id, organization_id: context.organizationId },
        select: unionSelect,
      });

      if (!existing) {
        throw new ServiceError(404, "Sindicato nao encontrado.");
      }

      const data = omitUndefined({
        name: body.name,
        cnpj: body.cnpj,
        base_date: body.base_date,
      });
      const duplicate = await this.prisma.unionPessoal.findFirst({
        where: {
          organization_id: context.organizationId,
          name: body.name ?? existing.name,
          cnpj: body.cnpj ?? existing.cnpj,
          base_date: body.base_date !== undefined ? body.base_date : existing.base_date,
          id: { not: id },
        },
        select: { id: true },
      });
      if (duplicate) {
        throw new ServiceError(409, "Sindicato ja cadastrado.");
      }

      const updated = await this.prisma.unionPessoal.update({
        where: { id },
        data,
        select: unionSelect,
      });

      await this.auditService.recordChange({
        requestId: context.requestId,
        organizationId: context.organizationId,
        userId,
        permission: context.permission,
        action: "Atualizacao",
        referring: "pessoal.union",
        referringId: id,
        changes: data,
        path: `/pessoal/unions/${id}`,
      });

      return updated;
    } catch (err: unknown) {
      logError("Erro ao atualizar sindicato de pessoal", { err });
      if (err instanceof ServiceError) throw err;
      throw new ServiceError(500, "Erro ao atualizar sindicato de pessoal.", err);
    }
  }
}
