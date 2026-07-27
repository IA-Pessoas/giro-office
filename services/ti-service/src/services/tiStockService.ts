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

export type TiStockMovement = {
  id: string;
  type: "entry" | "exit";
  quantity: number;
  created_at: string;
  item_id: string;
  requester_id: string | null;
  requester_name: string | null;
  approver_id: string | null;
  approver_name: string | null;
  operator_id: string | null;
  operator_name: string | null;
  destination: string | null;
  location_destination_id: string | null;
  location_destination_name: string | null;
  balance_before: number | null;
  balance_after: number | null;
};

export type TiStockListResult = {
  data: unknown[];
  total: number;
  page: number;
  limit: number;
  hasMore: boolean;
};

function normalizeStockCategoryName(value: string): string {
  return value.trim().replace(/\s+/g, " ").toLowerCase();
}

function isPrismaUniqueConstraintError(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    "code" in err &&
    (err as { code?: unknown }).code === "P2002"
  );
}

export class TiStockService {
  private readonly departmentResolver: TiDepartmentResolverService;

  constructor(private readonly prisma: PrismaClient) {
    this.departmentResolver = new TiDepartmentResolverService(prisma);
  }

  async listItems(
    context: TiAuthContext,
    query: ListTiStockItemsQuery,
  ): Promise<TiStockListResult> {
    const departmentId = await this.resolveDepartment(context.organizationId);
    const page = query.page ?? 1;
    const { skip, take } = getPaginationParams(query);
    const where = {
      organization_id: context.organizationId,
      department_id: departmentId,
      ...(query.category_id ? { category_id: query.category_id } : {}),
      ...(query.location_id ? { location_id: query.location_id } : {}),
      ...(query.name ? { name: { contains: query.name, mode: "insensitive" as const } } : {}),
      ...(query.status === undefined ? {} : { status: query.status }),
    };
    const [total, data] = await Promise.all([
      this.prisma.stock.count({ where }),
      this.prisma.stock.findMany({
        where,
        include: {
          category: true,
          location: true,
          department: true,
        },
        orderBy: { name: "asc" },
        skip,
        take,
      }),
    ]);

    return {
      data,
      total,
      page,
      limit: take,
      hasMore: page * take < total,
    };
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

  async listItemMovements(context: TiAuthContext, id: string): Promise<TiStockMovement[]> {
    try {
      const departmentId = await this.resolveDepartment(context.organizationId);
      await this.ensureStockExists(context, id, departmentId, this.prisma);

      const [entries, exits] = await Promise.all([
        this.prisma.entryStock.findMany({
          where: { stock_id: id, organization_id: context.organizationId },
          select: {
            id: true,
            stock_id: true,
            quantity: true,
            entry_date: true,
            entry_by_user_id: true,
            entry_by_user: {
              select: {
                name: true,
              },
            },
          },
        }),
        this.prisma.exitStock.findMany({
          where: { stock_id: id, organization_id: context.organizationId },
          select: {
            id: true,
            stock_id: true,
            quantity: true,
            destination: true,
            exit_date: true,
            requester_id: true,
            approver_id: true,
            operator_id: true,
            location_destination_id: true,
            requester: {
              select: {
                name: true,
              },
            },
            approver: {
              select: {
                name: true,
              },
            },
            operator: {
              select: {
                name: true,
              },
            },
            loc_dest: {
              select: {
                name: true,
              },
            },
          },
        }),
      ]);

      const movements: TiStockMovement[] = [
        ...entries.map((entry) => ({
          id: entry.id,
          type: "entry" as const,
          quantity: entry.quantity,
          created_at: entry.entry_date.toISOString(),
          item_id: entry.stock_id,
          requester_id: null,
          requester_name: null,
          approver_id: null,
          approver_name: null,
          operator_id: entry.entry_by_user_id,
          operator_name: entry.entry_by_user.name,
          destination: null,
          location_destination_id: null,
          location_destination_name: null,
          balance_before: null,
          balance_after: null,
        })),
        ...exits.map((exit) => ({
          id: exit.id,
          type: "exit" as const,
          quantity: exit.quantity,
          created_at: exit.exit_date.toISOString(),
          item_id: exit.stock_id,
          requester_id: exit.requester_id,
          requester_name: exit.requester.name,
          approver_id: exit.approver_id,
          approver_name: exit.approver?.name ?? null,
          operator_id: exit.operator_id,
          operator_name: exit.operator?.name ?? null,
          destination: exit.destination,
          location_destination_id: exit.location_destination_id,
          location_destination_name: exit.loc_dest?.name ?? null,
          balance_before: null,
          balance_after: null,
        })),
      ];

      return movements.sort((left, right) => {
        const byDate = Date.parse(right.created_at) - Date.parse(left.created_at);
        if (byDate !== 0) {
          return byDate;
        }

        return left.id.localeCompare(right.id);
      });
    } catch (err: unknown) {
      logError("Erro ao listar movimentacoes de estoque de TI", { err });
      if (err instanceof ServiceError) throw err;
      throw new ServiceError(500, "Erro ao listar movimentacoes de estoque de TI.", err);
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
      const name = body.name.trim().replace(/\s+/g, " ");
      const normalizedName = normalizeStockCategoryName(name);
      const activeCategories = await this.prisma.categoryStock.findMany({
        where: {
          organization_id: context.organizationId,
          department_id: departmentId,
          status: true,
        },
        select: { name: true },
      });
      const existing = activeCategories.some(
        (category) => normalizeStockCategoryName(category.name) === normalizedName,
      );

      if (existing) {
        throw new ServiceError(
          409,
          "Ja existe uma categoria de estoque de TI ativa com este nome.",
        );
      }

      return this.prisma.categoryStock.create({
        data: {
          name,
          department_id: departmentId,
          status: true,
          organization_id: context.organizationId,
        },
      });
    } catch (err: unknown) {
      logError("Erro ao criar categoria de estoque de TI", { err });
      if (err instanceof ServiceError) throw err;
      if (isPrismaUniqueConstraintError(err)) {
        throw new ServiceError(
          409,
          "Ja existe uma categoria de estoque de TI ativa com este nome.",
        );
      }
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
      if (isPrismaUniqueConstraintError(err)) {
        throw new ServiceError(
          409,
          "Ja existe uma categoria de estoque de TI ativa com este nome.",
        );
      }
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

  private async ensureStockExists(
    context: Pick<TiAuthContext, "organizationId">,
    id: string,
    departmentId: string,
    client: Pick<StockDatabaseClient, "stock">,
  ): Promise<void> {
    const stock = await client.stock.findFirst({
      where: {
        id,
        organization_id: context.organizationId,
        department_id: departmentId,
      },
      select: { id: true },
    });

    if (!stock) {
      throw new ServiceError(404, "Item de estoque de TI nao encontrado.");
    }
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
