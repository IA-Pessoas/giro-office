import { error as logError, ServiceError } from "@workspace/shared";

import type { Prisma, PrismaClient } from "../generated/prisma/client.js";
import { getPaginationParams } from "../schemas/pagination.schemas.js";
import type {
  CreateTiStockCategoryBody,
  CreateTiStockEntryBody,
  CreateTiStockExitBody,
  CreateTiStockItemBody,
  CreateTiStockLocationBody,
  ListTiStockItemsQuery,
  UpdateTiStockCategoryBody,
  UpdateTiStockItemBody,
  UpdateTiStockLocationBody,
} from "../schemas/tiStock.schemas.js";
import { TiDepartmentResolverService } from "./tiDepartmentResolverService.js";
import type { TiAuthContext } from "./tiRequestService.js";

type StockDatabaseClient = Pick<
  PrismaClient,
  "categoryStock" | "entryStock" | "exitStock" | "locationStock" | "stock" | "user"
>;

export class TiStockService {
  private readonly departmentResolver: TiDepartmentResolverService;

  constructor(private readonly prisma: PrismaClient) {
    this.departmentResolver = new TiDepartmentResolverService(prisma);
  }

  async listItems(context: TiAuthContext, query: ListTiStockItemsQuery): Promise<unknown[]> {
    const departmentId = await this.resolveDepartment(context.organizationId);
    const { skip, take } = getPaginationParams(query);

    return this.prisma.stock.findMany({
      where: {
        organization_id: context.organizationId,
        department_id: departmentId,
        ...(query.category_id ? { category_id: query.category_id } : {}),
        ...(query.location_id ? { location_id: query.location_id } : {}),
        ...(query.name ? { name: { contains: query.name, mode: "insensitive" } } : {}),
        ...(query.status === undefined ? {} : { status: query.status }),
      },
      include: {
        category: true,
        location: true,
        department: true,
      },
      orderBy: { name: "asc" },
      skip,
      take,
    });
  }

  async getItemById(context: TiAuthContext, id: string): Promise<unknown> {
    const departmentId = await this.resolveDepartment(context.organizationId);
    return this.ensureStock(context, id, departmentId, this.prisma);
  }

  async createItem(context: TiAuthContext, body: CreateTiStockItemBody): Promise<unknown> {
    try {
      const departmentId = await this.resolveDepartment(context.organizationId);
      await this.ensureCategory(
        context.organizationId,
        departmentId,
        body.category_id,
        this.prisma,
      );
      await this.ensureLocation(
        context.organizationId,
        departmentId,
        body.location_id,
        this.prisma,
      );

      const data: Prisma.StockUncheckedCreateInput = {
        department_id: departmentId,
        name: body.name,
        category_id: body.category_id,
        location_id: body.location_id,
        quantity: body.quantity,
        description: body.description,
        status: true,
        organization_id: context.organizationId,
      };

      return this.prisma.stock.create({ data });
    } catch (err: unknown) {
      logError("Erro ao criar item de estoque de TI", { err });
      if (err instanceof ServiceError) throw err;
      throw new ServiceError(500, "Erro ao criar item de estoque de TI.", err);
    }
  }

  async updateItem(
    context: TiAuthContext,
    id: string,
    body: UpdateTiStockItemBody,
  ): Promise<unknown> {
    try {
      const departmentId = await this.resolveDepartment(context.organizationId);
      await this.ensureStock(context, id, departmentId, this.prisma);

      if (body.category_id) {
        await this.ensureCategory(
          context.organizationId,
          departmentId,
          body.category_id,
          this.prisma,
        );
      }
      if (body.location_id) {
        await this.ensureLocation(
          context.organizationId,
          departmentId,
          body.location_id,
          this.prisma,
        );
      }

      return this.prisma.stock.update({
        where: { id },
        data: body,
      });
    } catch (err: unknown) {
      logError("Erro ao atualizar item de estoque de TI", { err });
      if (err instanceof ServiceError) throw err;
      throw new ServiceError(500, "Erro ao atualizar item de estoque de TI.", err);
    }
  }

  async createEntry(
    context: TiAuthContext,
    id: string,
    body: CreateTiStockEntryBody,
  ): Promise<unknown> {
    try {
      const departmentId = await this.resolveDepartment(context.organizationId);

      return this.prisma.$transaction(async (tx) => {
        await this.ensureStock(context, id, departmentId, tx);

        await tx.entryStock.create({
          data: {
            stock_id: id,
            quantity: body.quantity,
            entry_date: body.entry_date ?? new Date(),
            entry_by_user_id: context.userId,
            organization_id: context.organizationId,
          },
        });

        return tx.stock.update({
          where: { id },
          data: { quantity: { increment: body.quantity } },
        });
      });
    } catch (err: unknown) {
      logError("Erro ao registrar entrada de estoque de TI", { err });
      if (err instanceof ServiceError) throw err;
      throw new ServiceError(500, "Erro ao registrar entrada de estoque de TI.", err);
    }
  }

  async createExit(
    context: TiAuthContext,
    id: string,
    body: CreateTiStockExitBody,
  ): Promise<unknown> {
    try {
      const departmentId = await this.resolveDepartment(context.organizationId);

      return this.prisma.$transaction(async (tx) => {
        await this.ensureStock(context, id, departmentId, tx);

        await this.ensureUser(
          context.organizationId,
          body.requester_id,
          "Solicitante nao encontrado.",
          tx,
        );
        if (body.approver_id) {
          await this.ensureUser(
            context.organizationId,
            body.approver_id,
            "Aprovador nao encontrado.",
            tx,
          );
        }
        if (body.operator_id) {
          await this.ensureUser(
            context.organizationId,
            body.operator_id,
            "Operador nao encontrado.",
            tx,
          );
        }
        if (body.location_destination_id) {
          await this.ensureLocation(
            context.organizationId,
            departmentId,
            body.location_destination_id,
            tx,
          );
        }

        const updateResult = await tx.stock.updateMany({
          where: {
            id,
            organization_id: context.organizationId,
            department_id: departmentId,
            quantity: { gte: body.quantity },
          },
          data: { quantity: { decrement: body.quantity } },
        });

        if (updateResult.count === 0) {
          throw new ServiceError(409, "Saldo insuficiente no estoque de TI.");
        }

        await tx.exitStock.create({
          data: {
            stock_id: id,
            quantity: body.quantity,
            destination: body.destination,
            exit_date: body.exit_date ?? new Date(),
            requester_id: body.requester_id,
            approver_id: body.approver_id,
            operator_id: body.operator_id,
            location_destination_id: body.location_destination_id,
            organization_id: context.organizationId,
          },
        });

        return this.ensureStock(context, id, departmentId, tx);
      });
    } catch (err: unknown) {
      logError("Erro ao registrar saida de estoque de TI", { err });
      if (err instanceof ServiceError) throw err;
      throw new ServiceError(500, "Erro ao registrar saida de estoque de TI.", err);
    }
  }

  async listCategories(context: Pick<TiAuthContext, "organizationId">): Promise<unknown[]> {
    const departmentId = await this.resolveDepartment(context.organizationId);

    return this.prisma.categoryStock.findMany({
      where: { organization_id: context.organizationId, department_id: departmentId },
      orderBy: { name: "asc" },
    });
  }

  async createCategory(
    context: Pick<TiAuthContext, "organizationId">,
    body: CreateTiStockCategoryBody,
  ): Promise<unknown> {
    try {
      const departmentId = await this.resolveDepartment(context.organizationId);
      const existing = await this.prisma.categoryStock.findFirst({
        where: {
          organization_id: context.organizationId,
          department_id: departmentId,
          name: body.name,
          status: true,
        },
      });

      if (existing) {
        throw new ServiceError(
          409,
          "Ja existe uma categoria de estoque de TI ativa com este nome.",
        );
      }

      return this.prisma.categoryStock.create({
        data: {
          name: body.name,
          department_id: departmentId,
          status: true,
          organization_id: context.organizationId,
        },
      });
    } catch (err: unknown) {
      logError("Erro ao criar categoria de estoque de TI", { err });
      if (err instanceof ServiceError) throw err;
      throw new ServiceError(500, "Erro ao criar categoria de estoque de TI.", err);
    }
  }

  async updateCategory(
    context: Pick<TiAuthContext, "organizationId">,
    id: string,
    body: UpdateTiStockCategoryBody,
  ): Promise<unknown> {
    try {
      const departmentId = await this.resolveDepartment(context.organizationId);
      const category = await this.prisma.categoryStock.findFirst({
        where: { id, organization_id: context.organizationId, department_id: departmentId },
      });

      if (!category) {
        throw new ServiceError(404, "Categoria de estoque de TI nao encontrada.");
      }

      return this.prisma.categoryStock.update({
        where: { id },
        data: body,
      });
    } catch (err: unknown) {
      logError("Erro ao atualizar categoria de estoque de TI", { err });
      if (err instanceof ServiceError) throw err;
      throw new ServiceError(500, "Erro ao atualizar categoria de estoque de TI.", err);
    }
  }

  async listLocations(context: Pick<TiAuthContext, "organizationId">): Promise<unknown[]> {
    const departmentId = await this.resolveDepartment(context.organizationId);

    return this.prisma.locationStock.findMany({
      where: { organization_id: context.organizationId, department_id: departmentId },
      orderBy: { name: "asc" },
    });
  }

  async createLocation(
    context: Pick<TiAuthContext, "organizationId">,
    body: CreateTiStockLocationBody,
  ): Promise<unknown> {
    try {
      const departmentId = await this.resolveDepartment(context.organizationId);
      const existing = await this.prisma.locationStock.findFirst({
        where: {
          organization_id: context.organizationId,
          department_id: departmentId,
          name: body.name,
          status: true,
        },
      });

      if (existing) {
        throw new ServiceError(409, "Ja existe um local de estoque de TI ativo com este nome.");
      }

      return this.prisma.locationStock.create({
        data: {
          name: body.name,
          floor: body.floor,
          department_id: departmentId,
          status: true,
          organization_id: context.organizationId,
        },
      });
    } catch (err: unknown) {
      logError("Erro ao criar local de estoque de TI", { err });
      if (err instanceof ServiceError) throw err;
      throw new ServiceError(500, "Erro ao criar local de estoque de TI.", err);
    }
  }

  async updateLocation(
    context: Pick<TiAuthContext, "organizationId">,
    id: string,
    body: UpdateTiStockLocationBody,
  ): Promise<unknown> {
    try {
      const departmentId = await this.resolveDepartment(context.organizationId);
      const location = await this.prisma.locationStock.findFirst({
        where: { id, organization_id: context.organizationId, department_id: departmentId },
      });

      if (!location) {
        throw new ServiceError(404, "Local de estoque de TI nao encontrado.");
      }

      return this.prisma.locationStock.update({
        where: { id },
        data: body,
      });
    } catch (err: unknown) {
      logError("Erro ao atualizar local de estoque de TI", { err });
      if (err instanceof ServiceError) throw err;
      throw new ServiceError(500, "Erro ao atualizar local de estoque de TI.", err);
    }
  }

  private async resolveDepartment(organizationId: string): Promise<string> {
    return this.departmentResolver.resolveTechnologyDepartmentId(organizationId);
  }

  private async ensureStock(
    context: Pick<TiAuthContext, "organizationId">,
    id: string,
    departmentId: string,
    client: StockDatabaseClient,
  ): Promise<{ id: string; quantity: number }> {
    const stock = await client.stock.findFirst({
      where: {
        id,
        organization_id: context.organizationId,
        department_id: departmentId,
      },
      include: {
        category: true,
        location: true,
        department: true,
      },
    });

    if (!stock) {
      throw new ServiceError(404, "Item de estoque de TI nao encontrado.");
    }

    return stock;
  }

  private async ensureCategory(
    organizationId: string,
    departmentId: string,
    categoryId: string,
    client: StockDatabaseClient,
  ): Promise<void> {
    const category = await client.categoryStock.findFirst({
      where: {
        id: categoryId,
        organization_id: organizationId,
        department_id: departmentId,
        status: true,
      },
    });

    if (!category) {
      throw new ServiceError(404, "Categoria de estoque de TI nao encontrada.");
    }
  }

  private async ensureLocation(
    organizationId: string,
    departmentId: string,
    locationId: string,
    client: StockDatabaseClient,
  ): Promise<void> {
    const location = await client.locationStock.findFirst({
      where: {
        id: locationId,
        organization_id: organizationId,
        department_id: departmentId,
        status: true,
      },
    });

    if (!location) {
      throw new ServiceError(404, "Local de estoque de TI nao encontrado.");
    }
  }

  private async ensureUser(
    organizationId: string,
    userId: string,
    message: string,
    client: StockDatabaseClient,
  ): Promise<void> {
    const user = await client.user.findFirst({
      where: { id: userId, organization_id: organizationId },
    });

    if (!user) {
      throw new ServiceError(404, message);
    }
  }
}
