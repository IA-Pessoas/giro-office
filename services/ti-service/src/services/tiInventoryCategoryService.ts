import { error as logError, ServiceError } from "@workspace/shared";

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
      const existing = await this.prisma.inventoryCategoryTecnologia.findFirst({
        where: {
          organization_id: context.organizationId,
          name: body.name,
          active: true,
        },
      });

      if (existing) {
        throw new ServiceError(
          409,
          "Já existe uma categoria de inventário de TI ativa com este nome.",
        );
      }

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
}
