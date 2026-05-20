import { error as logError, ServiceError } from "@workspace/shared";

import type { PrismaClient } from "../generated/prisma/client.js";
import { getPaginationParams } from "../schemas/pagination.schemas.js";
import type {
  AssignTiInventoryUserBody,
  CreateTiInventoryBody,
  ListTiInventoryQuery,
  ReturnTiInventoryBody,
  UpdateTiInventoryBody,
} from "../schemas/tiInventory.schemas.js";
import type { TiAuthContext } from "./tiRequestService.js";

export class TiInventoryService {
  constructor(private readonly prisma: PrismaClient) {}

  async list(context: TiAuthContext, query: ListTiInventoryQuery): Promise<unknown[]> {
    const { skip, take } = getPaginationParams(query);

    return this.prisma.inventoryTecnologia.findMany({
      where: {
        organization_id: context.organizationId,
        ...(query.category_id ? { category_id: query.category_id } : {}),
        ...(query.location_id ? { location_id: query.location_id } : {}),
        ...(query.user_id ? { user_id: query.user_id } : {}),
        ...(query.asset_code ? { asset_code: { contains: query.asset_code } } : {}),
      },
      include: {
        category: true,
        location: true,
        user: true,
        responsible_it_staff: true,
      },
      orderBy: { asset_code: "asc" },
      skip,
      take,
    });
  }

  async getById(context: TiAuthContext, id: string): Promise<unknown> {
    const asset = await this.prisma.inventoryTecnologia.findFirst({
      where: { id, organization_id: context.organizationId },
      include: {
        category: true,
        location: true,
        user: true,
        responsible_it_staff: true,
      },
    });

    if (!asset) {
      throw new ServiceError(404, "Ativo de TI nao encontrado.");
    }

    return asset;
  }

  async create(context: TiAuthContext, body: CreateTiInventoryBody): Promise<unknown> {
    try {
      const duplicated = await this.prisma.inventoryTecnologia.findFirst({
        where: { organization_id: context.organizationId, asset_code: body.asset_code },
      });

      if (duplicated) {
        throw new ServiceError(409, "Ja existe um ativo de TI com este codigo patrimonial.");
      }

      await this.ensureCategory(context.organizationId, body.category_id);

      if (body.location_id) {
        await this.ensureLocation(context.organizationId, body.location_id);
      }
      if (body.user_id) {
        await this.ensureUser(context.organizationId, body.user_id, "Usuario nao encontrado.");
      }
      if (body.responsible_it_staff_id) {
        await this.ensureUser(
          context.organizationId,
          body.responsible_it_staff_id,
          "Responsavel de TI nao encontrado.",
        );
      }

      return this.prisma.inventoryTecnologia.create({
        data: {
          asset_code: body.asset_code,
          category_id: body.category_id,
          location_id: body.location_id,
          user_id: body.user_id,
          responsible_it_staff_id: body.responsible_it_staff_id,
          notes: body.notes,
          delivery_date: body.delivery_date,
          organization_id: context.organizationId,
        },
      });
    } catch (err: unknown) {
      logError("Erro ao criar ativo de inventario de TI", { err });
      if (err instanceof ServiceError) throw err;
      if (isUniqueConstraintError(err)) {
        throw new ServiceError(409, "Ja existe um ativo de TI com este codigo patrimonial.", err);
      }
      throw new ServiceError(500, "Erro ao criar ativo de inventario de TI.", err);
    }
  }

  async update(context: TiAuthContext, id: string, body: UpdateTiInventoryBody): Promise<unknown> {
    try {
      await this.getById(context, id);

      if (body.asset_code) {
        const duplicated = await this.prisma.inventoryTecnologia.findFirst({
          where: {
            organization_id: context.organizationId,
            asset_code: body.asset_code,
            NOT: { id },
          },
        });

        if (duplicated) {
          throw new ServiceError(409, "Ja existe um ativo de TI com este codigo patrimonial.");
        }
      }
      if (body.category_id) {
        await this.ensureCategory(context.organizationId, body.category_id);
      }
      if (body.location_id) {
        await this.ensureLocation(context.organizationId, body.location_id);
      }
      if (body.user_id) {
        await this.ensureUser(context.organizationId, body.user_id, "Usuario nao encontrado.");
      }
      if (body.responsible_it_staff_id) {
        await this.ensureUser(
          context.organizationId,
          body.responsible_it_staff_id,
          "Responsavel de TI nao encontrado.",
        );
      }

      return this.prisma.inventoryTecnologia.update({
        where: { id },
        data: body,
      });
    } catch (err: unknown) {
      logError("Erro ao atualizar ativo de inventario de TI", { err });
      if (err instanceof ServiceError) throw err;
      if (isUniqueConstraintError(err)) {
        throw new ServiceError(409, "Ja existe um ativo de TI com este codigo patrimonial.", err);
      }
      throw new ServiceError(500, "Erro ao atualizar ativo de inventario de TI.", err);
    }
  }

  async assignUser(
    context: TiAuthContext,
    id: string,
    body: AssignTiInventoryUserBody,
  ): Promise<unknown> {
    await this.getById(context, id);
    await this.ensureUser(context.organizationId, body.user_id, "Usuario nao encontrado.");

    return this.prisma.inventoryTecnologia.update({
      where: { id },
      data: {
        user_id: body.user_id,
        delivery_date: body.delivery_date ?? new Date(),
        return_date: null,
      },
    });
  }

  async returnAsset(
    context: TiAuthContext,
    id: string,
    body: ReturnTiInventoryBody,
  ): Promise<unknown> {
    await this.getById(context, id);

    return this.prisma.inventoryTecnologia.update({
      where: { id },
      data: {
        user_id: null,
        return_date: body.return_date ?? new Date(),
        ...(body.notes === undefined ? {} : { notes: body.notes }),
      },
    });
  }

  private async ensureCategory(organizationId: string, categoryId: string): Promise<void> {
    const category = await this.prisma.inventoryCategoryTecnologia.findFirst({
      where: { id: categoryId, organization_id: organizationId, active: true },
    });

    if (!category) {
      throw new ServiceError(404, "Categoria de inventario de TI nao encontrada.");
    }
  }

  private async ensureLocation(organizationId: string, locationId: string): Promise<void> {
    const location = await this.prisma.inventoryLocationTecnologia.findFirst({
      where: { id: locationId, organization_id: organizationId, active: true },
    });

    if (!location) {
      throw new ServiceError(404, "Local de inventario de TI nao encontrado.");
    }
  }

  private async ensureUser(organizationId: string, userId: string, message: string): Promise<void> {
    const user = await this.prisma.user.findFirst({
      where: { id: userId, organization_id: organizationId },
    });

    if (!user) {
      throw new ServiceError(404, message);
    }
  }
}

function isUniqueConstraintError(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    "code" in err &&
    (err as { code?: unknown }).code === "P2002"
  );
}
