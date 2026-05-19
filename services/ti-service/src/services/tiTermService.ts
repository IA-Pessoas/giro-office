import { error as logError, ServiceError } from "@workspace/shared";

import type { PrismaClient } from "../generated/prisma/client.js";
import type {
  CreateTiTermBody,
  ListTiTermsQuery,
  SignTiTermBody,
  UpdateTiTermBody,
} from "../schemas/tiTerm.schemas.js";
import type { TiAuthContext } from "./tiRequestService.js";

type TermRecord = Record<string, unknown>;

const SAFE_USER_INCLUDE = {
  user: {
    select: {
      id: true,
      name: true,
      full_name: true,
      department_id: true,
      organization_id: true,
    },
  },
} as const;

function withoutNestedUserPassword(record: unknown): unknown {
  if (!record || typeof record !== "object" || Array.isArray(record)) {
    return record;
  }

  const typedRecord = record as TermRecord;
  const user = typedRecord.user;

  if (!user || typeof user !== "object" || Array.isArray(user)) {
    return record;
  }

  const { password: _password, ...safeUser } = user as Record<string, unknown>;

  return {
    ...typedRecord,
    user: safeUser,
  };
}

export class TiTermService {
  constructor(private readonly prisma: PrismaClient) {}

  async list(context: TiAuthContext, query: ListTiTermsQuery): Promise<unknown[]> {
    const terms = await this.prisma.termTecnologia.findMany({
      where: {
        organization_id: context.organizationId,
        ...(query.user_id ? { user_id: query.user_id } : {}),
      },
      include: SAFE_USER_INCLUDE,
      orderBy: { date: "desc" },
    });

    return terms.map((term) => withoutNestedUserPassword(term));
  }

  async getById(context: TiAuthContext, id: string): Promise<unknown> {
    const term = await this.prisma.termTecnologia.findFirst({
      where: { id, organization_id: context.organizationId },
      include: SAFE_USER_INCLUDE,
    });

    if (!term) {
      throw new ServiceError(404, "Termo de TI nao encontrado.");
    }

    return withoutNestedUserPassword(term);
  }

  async create(context: TiAuthContext, body: CreateTiTermBody): Promise<unknown> {
    try {
      if (body.user_id) {
        await this.ensureUser(context.organizationId, body.user_id);
      }
      if (body.department_id) {
        await this.ensureDepartment(context.organizationId, body.department_id);
      }

      return this.prisma.termTecnologia.create({
        data: {
          ...body,
          organization_id: context.organizationId,
        },
      });
    } catch (err: unknown) {
      logError("Erro ao criar termo de TI", { err });
      if (err instanceof ServiceError) throw err;
      throw new ServiceError(500, "Erro ao criar termo de TI.", err);
    }
  }

  async update(context: TiAuthContext, id: string, body: UpdateTiTermBody): Promise<unknown> {
    try {
      await this.getById(context, id);

      if (body.user_id) {
        await this.ensureUser(context.organizationId, body.user_id);
      }
      if (body.department_id) {
        await this.ensureDepartment(context.organizationId, body.department_id);
      }

      return this.prisma.termTecnologia.update({
        where: { id },
        data: body,
      });
    } catch (err: unknown) {
      logError("Erro ao atualizar termo de TI", { err });
      if (err instanceof ServiceError) throw err;
      throw new ServiceError(500, "Erro ao atualizar termo de TI.", err);
    }
  }

  async sign(context: TiAuthContext, id: string, body: SignTiTermBody): Promise<unknown> {
    try {
      const term = (await this.getById(context, id)) as TermRecord;

      if (context.permission < 3 && term.user_id !== context.userId) {
        throw new ServiceError(403, "Permissao insuficiente para assinar termo de outro usuario.");
      }

      return this.prisma.termTecnologia.update({
        where: { id },
        data: {
          reason: body.reason ?? "Termo assinado pelo usuario.",
        },
      });
    } catch (err: unknown) {
      logError("Erro ao assinar termo de TI", { err });
      if (err instanceof ServiceError) throw err;
      throw new ServiceError(500, "Erro ao assinar termo de TI.", err);
    }
  }

  private async ensureUser(organizationId: string, userId: string): Promise<void> {
    const user = await this.prisma.user.findFirst({
      where: { id: userId, organization_id: organizationId },
    });

    if (!user) {
      throw new ServiceError(404, "Usuario nao encontrado.");
    }
  }

  private async ensureDepartment(organizationId: string, departmentId: string): Promise<void> {
    const department = await this.prisma.department.findFirst({
      where: { id: departmentId, organization_id: organizationId },
    });

    if (!department) {
      throw new ServiceError(404, "Departamento nao encontrado.");
    }
  }
}
