import { error as logError, ServiceError } from "@workspace/shared";

import type { Prisma, PrismaClient } from "../generated/prisma/client.js";
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

const UNION_LINKED_TO_PAYROLL_MESSAGE =
  "Não é possível remover o sindicato porque ele está vinculado a uma ou mais configurações de folha. Altere esses vínculos antes de tentar novamente.";
const UNION_NOT_FOUND_MESSAGE = "Sindicato nao encontrado.";

function isPrismaForeignKeyConstraintError(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    "code" in err &&
    (err as { code?: unknown }).code === "P2003"
  );
}

function isPrismaRecordNotFoundError(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    "code" in err &&
    (err as { code?: unknown }).code === "P2025"
  );
}

export type UnionRecord = {
  id: string;
  name: string;
  cnpj: string;
  base_date: Date | null;
  organization_id: string;
};

export interface UnionListQuery {
  search: string;
  page: number;
  limit: number;
  paginationRequested: boolean;
}

export interface PaginatedUnions {
  data: UnionRecord[];
  total: number;
  page: number;
  limit: number;
  hasMore: boolean;
}

export class UnionService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly auditService: PessoalAuditService,
  ) {}

  async list(
    context: Pick<PessoalAuthContext, "organizationId">,
    query: UnionListQuery,
  ): Promise<UnionRecord[] | PaginatedUnions> {
    const where: Prisma.UnionPessoalWhereInput = {
      organization_id: context.organizationId,
      ...(query.search
        ? {
            OR: [
              { name: { contains: query.search, mode: "insensitive" } },
              { cnpj: { contains: query.search, mode: "insensitive" } },
            ],
          }
        : {}),
    };
    const findManyArgs = {
      where,
      select: unionSelect,
      orderBy: { name: "asc" },
      ...(query.paginationRequested
        ? { skip: (query.page - 1) * query.limit, take: query.limit }
        : {}),
    } as const;

    if (!query.paginationRequested) {
      return this.prisma.unionPessoal.findMany(findManyArgs);
    }

    const [data, total] = await Promise.all([
      this.prisma.unionPessoal.findMany(findManyArgs),
      this.prisma.unionPessoal.count({ where }),
    ]);

    return {
      data,
      total,
      page: query.page,
      limit: query.limit,
      hasMore: query.page * query.limit < total,
    };
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
      throw new ServiceError(404, UNION_NOT_FOUND_MESSAGE);
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
        throw new ServiceError(404, UNION_NOT_FOUND_MESSAGE);
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

  async delete(context: PessoalAuthContext, id: string): Promise<UnionRecord> {
    try {
      const userId = requireUserId(context);
      const existing = await this.prisma.unionPessoal.findFirst({
        where: { id, organization_id: context.organizationId },
        select: unionSelect,
      });

      if (!existing) {
        throw new ServiceError(404, UNION_NOT_FOUND_MESSAGE);
      }

      const payrollCount = await this.prisma.payroll.count({
        where: { organization_id: context.organizationId, union_id: id },
      });
      if (payrollCount > 0) {
        throw new ServiceError(409, UNION_LINKED_TO_PAYROLL_MESSAGE);
      }

      await this.prisma.unionPessoal.delete({ where: { id } });

      await this.auditService.recordChange({
        requestId: context.requestId,
        organizationId: context.organizationId,
        userId,
        permission: context.permission,
        action: "Exclusao",
        referring: "pessoal.union",
        referringId: id,
        changes: existing,
        path: `/pessoal/unions/${id}`,
      });

      return existing;
    } catch (err: unknown) {
      logError("Erro ao remover sindicato de pessoal", { err });
      if (err instanceof ServiceError) throw err;
      if (isPrismaForeignKeyConstraintError(err)) {
        throw new ServiceError(409, UNION_LINKED_TO_PAYROLL_MESSAGE, err);
      }
      if (isPrismaRecordNotFoundError(err)) {
        throw new ServiceError(404, UNION_NOT_FOUND_MESSAGE, err);
      }
      throw new ServiceError(500, "Erro ao remover sindicato de pessoal.", err);
    }
  }
}
