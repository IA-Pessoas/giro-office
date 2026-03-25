import { assertNonEmptyString, error as logError, ServiceError } from "@workspace/shared";

import type { Prisma } from "../generated/prisma/client.js";
import { prismaClient } from "../integrations/prisma.js";

const CATEGORY_SELECT = {
  id: true,
  name: true,
  active: true,
  organization_id: true,
} as const;

export type RhCategorySnapshot = Prisma.RhCategoryGetPayload<{
  select: typeof CATEGORY_SELECT;
}>;

export interface CategoryCreateInput {
  organization_id: string;
  name: string;
  active?: boolean;
}

export interface CategoryUpdateInput {
  id: string;
  organization_id: string;
  name?: string;
  active?: boolean;
}

export interface CategoryDeleteInput {
  id: string;
  organization_id: string;
}

export interface CategoryListOptions {
  activeOnly?: boolean;
}

class CategoryService {
  private async findDuplicateNameInOrg(
    organizationId: string,
    name: string,
    excludeId?: string,
  ): Promise<RhCategorySnapshot | null> {
    return prismaClient.rhCategory.findFirst({
      where: {
        organization_id: organizationId,
        name,
        ...(excludeId ? { id: { not: excludeId } } : {}),
      },
      select: CATEGORY_SELECT,
    });
  }

  async create(input: CategoryCreateInput): Promise<RhCategorySnapshot> {
    try {
      const organizationId = assertNonEmptyString(input.organization_id, "organization_id");
      const name = assertNonEmptyString(input.name, "name");
      const active = input.active ?? true;

      const duplicate = await this.findDuplicateNameInOrg(organizationId, name);
      if (duplicate) {
        throw new ServiceError(409, `Já existe uma categoria com este nome: ${duplicate.name}`);
      }

      const created = await prismaClient.rhCategory.create({
        data: {
          name,
          active,
          organization_id: organizationId,
        },
        select: CATEGORY_SELECT,
      });

      return created;
    } catch (err: unknown) {
      logError("Erro ao criar categoria", { err });
      if (err instanceof ServiceError) throw err;
      const msg = err instanceof Error ? err.message : String(err);
      throw new ServiceError(500, `Erro interno ao criar categoria. ${msg}`, err);
    }
  }

  async update(input: CategoryUpdateInput): Promise<RhCategorySnapshot> {
    try {
      const id = assertNonEmptyString(input.id, "id");
      const organizationId = assertNonEmptyString(input.organization_id, "organization_id");

      if (input.name === undefined && input.active === undefined) {
        throw new ServiceError(400, "Informe name ou active para atualizar.");
      }

      const existing = await prismaClient.rhCategory.findFirst({
        where: { id, organization_id: organizationId },
        select: CATEGORY_SELECT,
      });

      if (!existing) {
        throw new ServiceError(404, "Categoria não encontrada.");
      }

      const data: { name?: string; active?: boolean } = {};

      if (input.name !== undefined) {
        const duplicate = await this.findDuplicateNameInOrg(organizationId, input.name, id);
        if (duplicate) {
          throw new ServiceError(409, `Já existe uma categoria com este nome: ${duplicate.name}`);
        }
        data.name = input.name;
      }

      if (input.active !== undefined) {
        data.active = input.active;
      }

      const updated = await prismaClient.rhCategory.update({
        where: { id },
        data,
        select: CATEGORY_SELECT,
      });

      return updated;
    } catch (err: unknown) {
      logError("Erro ao atualizar categoria", { err });
      if (err instanceof ServiceError) throw err;
      const msg = err instanceof Error ? err.message : String(err);
      throw new ServiceError(500, `Erro interno ao atualizar categoria. ${msg}`, err);
    }
  }

  async list(
    organizationId: string,
    options: CategoryListOptions = {},
  ): Promise<RhCategorySnapshot[]> {
    try {
      const orgId = assertNonEmptyString(organizationId, "organization_id");

      return await prismaClient.rhCategory.findMany({
        where: {
          organization_id: orgId,
          ...(options.activeOnly === true ? { active: true } : {}),
        },
        orderBy: { name: "asc" },
        select: CATEGORY_SELECT,
      });
    } catch (err: unknown) {
      logError("Erro ao listar categorias", { err });
      if (err instanceof ServiceError) throw err;
      const msg = err instanceof Error ? err.message : String(err);
      throw new ServiceError(500, `Erro interno ao listar categorias. ${msg}`, err);
    }
  }

  async delete(input: CategoryDeleteInput): Promise<{ message: string }> {
    try {
      const id = assertNonEmptyString(input.id, "id");
      const organizationId = assertNonEmptyString(input.organization_id, "organization_id");

      const existing = await prismaClient.rhCategory.findFirst({
        where: { id, organization_id: organizationId },
        select: { id: true },
      });

      if (!existing) {
        throw new ServiceError(404, "Categoria não encontrada.");
      }

      const requestCount = await prismaClient.rhRequest.count({
        where: { category_id: id, organization_id: organizationId },
      });

      if (requestCount > 0) {
        throw new ServiceError(
          409,
          "Não é possível remover a categoria: existem solicitações vinculadas a ela.",
        );
      }

      await prismaClient.rhCategory.deleteMany({
        where: { id, organization_id: organizationId },
      });

      return { message: "Categoria removida com sucesso" };
    } catch (err: unknown) {
      logError("Erro ao excluir categoria", { err });
      if (err instanceof ServiceError) throw err;
      const msg = err instanceof Error ? err.message : String(err);
      throw new ServiceError(500, `Erro interno ao excluir categoria. ${msg}`, err);
    }
  }
}

export { CategoryService };
