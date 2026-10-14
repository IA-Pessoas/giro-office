import {
  COMPUTER_CATEGORY_LOCKED_MESSAGE,
  COMPUTER_CATEGORY_RENAME_CONFLICT_MESSAGE,
  hasTiCatalogNameConflict,
  hasUserWithSeveralActiveAssets,
  isComputerCategoryName,
  error as logError,
  ServiceError,
  tiCatalogNameToCheck,
} from "@workspace/shared";

import type { PrismaClient } from "../generated/prisma/client.js";
import type {
  CreateTiInventoryCategoryBody,
  UpdateTiInventoryCategoryBody,
} from "../schemas/tiInventoryCategory.schemas.js";
import type { TiAuthContext } from "./tiRequestService.js";

export class TiInventoryCategoryService {
  constructor(private readonly prisma: PrismaClient) {}

  async list(context: Pick<TiAuthContext, "organizationId">): Promise<unknown[]> {
    return this.prisma.inventoryCategoryTecnologia.findMany({
      where: { organization_id: context.organizationId },
      orderBy: { name: "asc" },
    });
  }

  async create(
    context: Pick<TiAuthContext, "organizationId">,
    body: CreateTiInventoryCategoryBody,
  ): Promise<unknown> {
    try {
      await this.ensureSingleComputerCategory(context.organizationId, body.name);
      await this.ensureUniqueName(context.organizationId, body.name);

      return this.prisma.inventoryCategoryTecnologia.create({
        data: {
          name: body.name,
          tag: body.tag,
          active: true,
          organization_id: context.organizationId,
        },
      });
    } catch (err: unknown) {
      logError("Erro ao criar categoria de inventario de TI", { err });
      if (err instanceof ServiceError) throw err;
      throw new ServiceError(500, "Erro ao criar categoria de inventario de TI.", err);
    }
  }

  async update(
    context: Pick<TiAuthContext, "organizationId">,
    id: string,
    body: UpdateTiInventoryCategoryBody,
  ): Promise<unknown> {
    try {
      const existing = await this.prisma.inventoryCategoryTecnologia.findFirst({
        where: { id, organization_id: context.organizationId },
      });

      if (!existing) {
        throw new ServiceError(404, "Categoria de inventário de TI não encontrada.");
      }
      if (isComputerCategoryName(existing.name)) {
        const renamed = body.name !== undefined && !isComputerCategoryName(body.name);
        if (renamed || body.active === false) {
          throw new ServiceError(409, COMPUTER_CATEGORY_LOCKED_MESSAGE);
        }
      } else if (body.name !== undefined) {
        await this.ensureSingleComputerCategory(context.organizationId, body.name, id);
      }
      const name = tiCatalogNameToCheck(existing, body);
      if (name !== null) await this.ensureUniqueName(context.organizationId, name, id);

      return this.prisma.inventoryCategoryTecnologia.update({
        where: { id },
        data: body,
      });
    } catch (err: unknown) {
      logError("Erro ao atualizar categoria de inventario de TI", { err });
      if (err instanceof ServiceError) throw err;
      throw new ServiceError(500, "Erro ao atualizar categoria de inventario de TI.", err);
    }
  }

  /** Nome único entre as categorias ativas da organização, sem caixa nem acento (#1937). */
  private async ensureUniqueName(
    organizationId: string,
    name: string,
    exceptId?: string,
  ): Promise<void> {
    const active = await this.prisma.inventoryCategoryTecnologia.findMany({
      where: { organization_id: organizationId, active: true },
      select: { id: true, name: true },
    });
    if (hasTiCatalogNameConflict(active, name, exceptId)) {
      throw new ServiceError(
        409,
        "Já existe uma categoria de inventário de TI ativa com este nome.",
      );
    }
  }

  /** A categoria canônica Computador é única na organização, ativa ou não (#1931). */
  private async ensureSingleComputerCategory(
    organizationId: string,
    name: string,
    renamedCategoryId?: string,
  ): Promise<void> {
    if (!isComputerCategoryName(name)) return;
    const categories = await this.prisma.inventoryCategoryTecnologia.findMany({
      where: { organization_id: organizationId },
      select: { name: true },
    });
    if (categories.some((category) => isComputerCategoryName(category.name))) {
      throw new ServiceError(409, "Já existe a categoria Computador nesta organização.");
    }
    if (!renamedCategoryId) return;
    // Os itens da categoria renomeada passam a ser computadores.
    const activeAssets = await this.prisma.inventoryTecnologia.findMany({
      where: {
        organization_id: organizationId,
        category_id: renamedCategoryId,
        user_id: { not: null },
        return_date: null,
      },
      select: { user_id: true },
    });
    if (hasUserWithSeveralActiveAssets(activeAssets)) {
      throw new ServiceError(409, COMPUTER_CATEGORY_RENAME_CONFLICT_MESSAGE);
    }
  }
}
