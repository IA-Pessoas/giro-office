import { error as logError, ServiceError } from "@workspace/shared";

import type { PrismaClient } from "../generated/prisma/client.js";
import type {
  CreateTiRequestCategoryBody,
  ListTiRequestCategoriesQuery,
  UpdateTiRequestCategoryBody,
} from "../schemas/tiRequestCategory.schemas.js";

export interface TiOrganizationContext {
  organizationId: string;
}

export class TiRequestCategoryService {
  constructor(private readonly prisma: PrismaClient) {}

  async list(
    context: TiOrganizationContext,
    query: ListTiRequestCategoriesQuery,
  ): Promise<unknown[]> {
    return this.prisma.tICategoryRequest.findMany({
      where: {
        organization_id: context.organizationId,
        ...(query.active === undefined ? {} : { active: query.active }),
      },
      orderBy: { name: "asc" },
    });
  }

  async create(
    context: TiOrganizationContext,
    body: CreateTiRequestCategoryBody,
  ): Promise<unknown> {
    try {
      const existing = await this.prisma.tICategoryRequest.findFirst({
        where: {
          organization_id: context.organizationId,
          name: body.name,
          active: true,
        },
      });

      if (existing) {
        throw new ServiceError(409, "Já existe uma categoria de TI ativa com este nome.");
      }

      return this.prisma.tICategoryRequest.create({
        data: {
          name: body.name,
          active: true,
          organization_id: context.organizationId,
        },
      });
    } catch (err: unknown) {
      logError("Erro ao criar categoria de chamado de TI", { err });
      if (err instanceof ServiceError) throw err;
      throw new ServiceError(500, "Erro ao criar categoria de chamado de TI.", err);
    }
  }

  async update(
    context: TiOrganizationContext,
    id: string,
    body: UpdateTiRequestCategoryBody,
  ): Promise<unknown> {
    try {
      const existing = await this.prisma.tICategoryRequest.findFirst({
        where: { id, organization_id: context.organizationId },
      });

      if (!existing) {
        throw new ServiceError(404, "Categoria de TI não encontrada.");
      }

      return this.prisma.tICategoryRequest.update({
        where: { id },
        data: body,
      });
    } catch (err: unknown) {
      logError("Erro ao atualizar categoria de chamado de TI", { err });
      if (err instanceof ServiceError) throw err;
      throw new ServiceError(500, "Erro ao atualizar categoria de chamado de TI.", err);
    }
  }
}
