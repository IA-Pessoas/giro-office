import {
  ACTIVE_COMPUTER_CONFLICT_MESSAGE,
  activeComputerLockKey,
  isComputerCategoryName,
  error as logError,
  ServiceError,
} from "@workspace/shared";

import type { Prisma, PrismaClient } from "../generated/prisma/client.js";
import { getPaginationParams } from "../schemas/pagination.schemas.js";
import type {
  AssignTiInventoryUserBody,
  CreateTiInventoryBody,
  ListTiInventoryQuery,
  ReturnTiInventoryBody,
  UpdateTiInventoryBody,
} from "../schemas/tiInventory.schemas.js";
import { TiDepartmentResolverService } from "./tiDepartmentResolverService.js";
import type { TiAuthContext } from "./tiRequestService.js";

const SAFE_USER_SELECT = {
  id: true,
  name: true,
  full_name: true,
  department_id: true,
  organization_id: true,
} as const;

type InventoryWriter = Pick<Prisma.TransactionClient, "inventoryTecnologia">;

/** Estado em que o ativo termina depois da escrita. */
type AssetAssignment = {
  id?: string;
  category_id: string;
  user_id?: string | null;
  return_date?: Date | null;
};

const INVENTORY_INCLUDE = {
  category: true,
  location: true,
  user: {
    select: SAFE_USER_SELECT,
  },
  responsible_it_staff: {
    select: SAFE_USER_SELECT,
  },
} as const;

export class TiInventoryService {
  private readonly departmentResolver: TiDepartmentResolverService;

  constructor(private readonly prisma: PrismaClient) {
    this.departmentResolver = new TiDepartmentResolverService(prisma);
  }

  async list(context: TiAuthContext, query: ListTiInventoryQuery): Promise<unknown[]> {
    const { skip, take } = getPaginationParams(query);
    const userFilter = query.user_id
      ? { user_id: query.user_id }
      : query.status === "available"
        ? { user_id: null }
        : query.status === "assigned"
          ? { user_id: { not: null } }
          : {};

    return this.prisma.inventoryTecnologia.findMany({
      where: {
        organization_id: context.organizationId,
        ...(query.category_id ? { category_id: query.category_id } : {}),
        ...(query.location_id ? { location_id: query.location_id } : {}),
        ...userFilter,
        ...(query.asset_code ? { asset_code: { contains: query.asset_code } } : {}),
      },
      include: INVENTORY_INCLUDE,
      orderBy: { asset_code: "asc" },
      skip,
      take,
    });
  }

  async getById(context: TiAuthContext, id: string): Promise<unknown> {
    const asset = await this.prisma.inventoryTecnologia.findFirst({
      where: { id, organization_id: context.organizationId },
      include: INVENTORY_INCLUDE,
    });

    if (!asset) {
      throw new ServiceError(404, "Ativo de TI não encontrado.");
    }

    return asset;
  }

  async create(context: TiAuthContext, body: CreateTiInventoryBody): Promise<unknown> {
    try {
      const duplicated = await this.prisma.inventoryTecnologia.findFirst({
        where: { organization_id: context.organizationId, asset_code: body.asset_code },
      });

      if (duplicated) {
        throw new ServiceError(409, "Já existe um ativo de TI com este código patrimonial.");
      }

      await this.ensureCategory(context.organizationId, body.category_id);

      if (body.location_id) {
        await this.ensureLocation(context.organizationId, body.location_id);
      }
      if (body.user_id) {
        await this.ensureActiveOrganizationUser(context.organizationId, body.user_id);
      }
      if (body.responsible_it_staff_id) {
        await this.ensureTechnologyResponsible(
          context.organizationId,
          body.responsible_it_staff_id,
        );
      }

      return await this.writeWithComputerRule(
        context.organizationId,
        { category_id: body.category_id, user_id: body.user_id },
        (writer) =>
          writer.inventoryTecnologia.create({
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
          }),
      );
    } catch (err: unknown) {
      logError("Erro ao criar ativo de inventario de TI", { err });
      if (err instanceof ServiceError) throw err;
      if (isUniqueConstraintError(err)) {
        throw new ServiceError(409, "Já existe um ativo de TI com este código patrimonial.", err);
      }
      throw new ServiceError(500, "Erro ao criar ativo de inventario de TI.", err);
    }
  }

  async update(context: TiAuthContext, id: string, body: UpdateTiInventoryBody): Promise<unknown> {
    try {
      const existing = await this.getAssignment(context, id);

      if (body.asset_code) {
        const duplicated = await this.prisma.inventoryTecnologia.findFirst({
          where: {
            organization_id: context.organizationId,
            asset_code: body.asset_code,
            NOT: { id },
          },
        });

        if (duplicated) {
          throw new ServiceError(409, "Já existe um ativo de TI com este código patrimonial.");
        }
      }
      if (body.category_id) {
        await this.ensureCategory(context.organizationId, body.category_id);
      }
      if (body.location_id) {
        await this.ensureLocation(context.organizationId, body.location_id);
      }
      if (body.user_id) {
        await this.ensureActiveOrganizationUser(context.organizationId, body.user_id);
      }
      if (body.responsible_it_staff_id) {
        await this.ensureTechnologyResponsible(
          context.organizationId,
          body.responsible_it_staff_id,
        );
      }

      // Informar a pessoa é atribuir: a devolução anterior deixa de valer.
      const data = body.user_id === undefined ? body : { ...body, return_date: null };
      const changesHolder =
        (body.user_id !== undefined && body.user_id !== existing.user_id) ||
        (body.category_id !== undefined && body.category_id !== existing.category_id) ||
        (body.user_id !== undefined && existing.return_date != null);
      // Edição que não troca pessoa nem categoria não reavalia a regra (dado legado).
      if (!changesHolder) {
        return await this.prisma.inventoryTecnologia.update({ where: { id }, data });
      }

      return await this.writeWithComputerRule(
        context.organizationId,
        {
          id,
          category_id: body.category_id ?? existing.category_id,
          user_id: body.user_id ?? existing.user_id,
          return_date: body.user_id === undefined ? existing.return_date : null,
        },
        (writer) => writer.inventoryTecnologia.update({ where: { id }, data }),
      );
    } catch (err: unknown) {
      logError("Erro ao atualizar ativo de inventario de TI", { err });
      if (err instanceof ServiceError) throw err;
      if (isUniqueConstraintError(err)) {
        throw new ServiceError(409, "Já existe um ativo de TI com este código patrimonial.", err);
      }
      throw new ServiceError(500, "Erro ao atualizar ativo de inventario de TI.", err);
    }
  }

  async assignUser(
    context: TiAuthContext,
    id: string,
    body: AssignTiInventoryUserBody,
  ): Promise<unknown> {
    const existing = await this.getAssignment(context, id);
    await this.ensureActiveOrganizationUser(context.organizationId, body.user_id);

    return this.writeWithComputerRule(
      context.organizationId,
      { id, category_id: existing.category_id, user_id: body.user_id, return_date: null },
      (writer) =>
        writer.inventoryTecnologia.update({
          where: { id },
          data: {
            user_id: body.user_id,
            delivery_date: body.delivery_date ?? new Date(),
            return_date: null,
          },
        }),
    );
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

  private async getAssignment(context: TiAuthContext, id: string): Promise<AssetAssignment> {
    return (await this.getById(context, id)) as AssetAssignment;
  }

  /**
   * Uma pessoa não termina com mais de um computador ativo na organização (#1931). Quando a
   * escrita deixa um computador com alguém, ela roda numa transação que primeiro toma o
   * bloqueio dessa pessoa: duas escritas simultâneas se enfileiram e a segunda enxerga a
   * primeira. Vale para cadastro, edição e atribuição; troca e lote reutilizam este caminho.
   */
  private async writeWithComputerRule<T>(
    organizationId: string,
    target: AssetAssignment,
    write: (writer: InventoryWriter) => Promise<T>,
  ): Promise<T> {
    const userId = target.user_id;
    if (!userId || (target.return_date !== null && target.return_date !== undefined)) {
      return write(this.prisma);
    }

    const categories = await this.prisma.inventoryCategoryTecnologia.findMany({
      where: { organization_id: organizationId },
      select: { id: true, name: true },
    });
    const computerCategoryIds = categories
      .filter((category) => isComputerCategoryName(category.name))
      .map((category) => category.id);
    if (!computerCategoryIds.includes(target.category_id)) {
      return write(this.prisma);
    }

    return this.prisma.$transaction(async (transaction) => {
      await transaction.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${activeComputerLockKey(organizationId, userId)}, 0))`;
      const activeComputer = await transaction.inventoryTecnologia.findFirst({
        where: {
          organization_id: organizationId,
          user_id: userId,
          return_date: null,
          category_id: { in: computerCategoryIds },
          ...(target.id ? { NOT: { id: target.id } } : {}),
        },
        select: { id: true },
      });
      if (activeComputer) {
        throw new ServiceError(409, ACTIVE_COMPUTER_CONFLICT_MESSAGE);
      }
      return write(transaction);
    });
  }

  private async ensureCategory(organizationId: string, categoryId: string): Promise<void> {
    const category = await this.prisma.inventoryCategoryTecnologia.findFirst({
      where: { id: categoryId, organization_id: organizationId, active: true },
    });

    if (!category) {
      throw new ServiceError(404, "Categoria de inventário não encontrada.");
    }
  }

  private async ensureLocation(organizationId: string, locationId: string): Promise<void> {
    const location = await this.prisma.inventoryLocationTecnologia.findFirst({
      where: { id: locationId, organization_id: organizationId, active: true },
    });

    if (!location) {
      throw new ServiceError(404, "Departamento/local de inventário não encontrado.");
    }
  }

  private async ensureActiveOrganizationUser(
    organizationId: string,
    userId: string,
  ): Promise<void> {
    const user = await this.prisma.user.findFirst({
      where: { id: userId, organization_id: organizationId, status: "active" },
    });

    if (!user) {
      throw new ServiceError(404, "Usuário não encontrado na organização.");
    }
  }

  private async ensureTechnologyResponsible(organizationId: string, userId: string): Promise<void> {
    const technologyDepartmentId =
      await this.departmentResolver.resolveTechnologyDepartmentId(organizationId);
    const user = await this.prisma.user.findFirst({
      where: {
        id: userId,
        organization_id: organizationId,
        status: "active",
        department_id: technologyDepartmentId,
      },
    });

    if (!user) {
      throw new ServiceError(422, "Responsável de TI deve pertencer ao departamento Tecnologia.");
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
