import { error as logError, ServiceError } from "@workspace/shared";

import type { PrismaClient } from "../generated/prisma/client.js";
import type {
  CreateTiInventoryLocationBody,
  UpdateTiInventoryLocationBody,
} from "../schemas/tiInventoryLocation.schemas.js";
import type { TiAuthContext } from "./tiRequestService.js";

export class TiInventoryLocationService {
  constructor(private readonly prisma: PrismaClient) {}

  async list(context: Pick<TiAuthContext, "organizationId">): Promise<unknown[]> {
    return this.prisma.inventoryLocationTecnologia.findMany({
      where: { organization_id: context.organizationId },
      orderBy: { name: "asc" },
    });
  }

  async create(
    context: Pick<TiAuthContext, "organizationId">,
    body: CreateTiInventoryLocationBody,
  ): Promise<unknown> {
    try {
      const existing = await this.prisma.inventoryLocationTecnologia.findFirst({
        where: {
          organization_id: context.organizationId,
          name: body.name,
          active: true,
        },
      });

      if (existing) {
        throw new ServiceError(409, "Ja existe um local de inventario de TI ativo com este nome.");
      }

      return this.prisma.inventoryLocationTecnologia.create({
        data: {
          name: body.name,
          active: true,
          organization_id: context.organizationId,
        },
      });
    } catch (err: unknown) {
      logError("Erro ao criar local de inventario de TI", { err });
      if (err instanceof ServiceError) throw err;
      throw new ServiceError(500, "Erro ao criar local de inventario de TI.", err);
    }
  }

  async update(
    context: Pick<TiAuthContext, "organizationId">,
    id: string,
    body: UpdateTiInventoryLocationBody,
  ): Promise<unknown> {
    try {
      const existing = await this.prisma.inventoryLocationTecnologia.findFirst({
        where: { id, organization_id: context.organizationId },
      });

      if (!existing) {
        throw new ServiceError(404, "Local de inventario de TI nao encontrado.");
      }

      return this.prisma.inventoryLocationTecnologia.update({
        where: { id },
        data: body,
      });
    } catch (err: unknown) {
      logError("Erro ao atualizar local de inventario de TI", { err });
      if (err instanceof ServiceError) throw err;
      throw new ServiceError(500, "Erro ao atualizar local de inventario de TI.", err);
    }
  }
}
