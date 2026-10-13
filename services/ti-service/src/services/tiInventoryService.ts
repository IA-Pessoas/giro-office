import {
  ACTIVE_COMPUTER_CONFLICT_MESSAGE,
  activeComputerLockKey,
  buildEquipmentMap,
  isComputerCategoryName,
  error as logError,
  ServiceError,
} from "@workspace/shared";

import type { Prisma, PrismaClient } from "../generated/prisma/client.js";
import { getPaginationParams } from "../schemas/pagination.schemas.js";
import type {
  AssignTiInventoryUserBody,
  CreateTiInventoryBody,
  ListTiInventoryHistoryQuery,
  ListTiInventoryQuery,
  ReturnTiInventoryBody,
  SwapTiInventoryBody,
  TransferTiInventoryBatchBody,
  TransferTiInventoryBody,
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

type InventoryWriter = Pick<
  Prisma.TransactionClient,
  "inventoryTecnologia" | "inventoryEventTecnologia"
>;

/** Estado em que o ativo termina depois da escrita. */
type AssetAssignment = {
  id?: string;
  category_id: string;
  user_id?: string | null;
  location_id?: string | null;
  return_date?: Date | null;
};

/** Tipo de ação do evento patrimonial (#1932). */
type InventoryEventAction = "assign" | "return" | "transfer" | "swap";

type MovableAsset = AssetAssignment & { id: string; asset_code: string };

/** Movimentação planejada de um item dentro de uma troca ou de um lote (#1933). */
type PlannedMove = {
  asset: MovableAsset;
  to: { user_id: string | null; location_id: string | null };
};

const ITEMS_BLOCKED_CODE = "TI_INVENTORY_ITEMS_BLOCKED";

// Um lote de 100 itens faz uma escrita por item: o padrão de 5 s do Prisma não basta.
const BATCH_TRANSACTION_OPTIONS = { maxWait: 5_000, timeout: 30_000 };

/** A operação vale para todos os itens ou para nenhum; a mensagem diz quais impediram. */
function itemsBlockedError(blocked: string[]): ServiceError {
  return new ServiceError(
    409,
    `Nenhum item foi movimentado. Itens impeditivos: ${blocked.join("; ")}.`,
    undefined,
    ITEMS_BLOCKED_CODE,
  );
}

const ASSET_MOVED_MESSAGE =
  "O item foi movimentado por outra operação. Atualize a tela e tente novamente.";

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
        async (writer) => {
          const created = await writer.inventoryTecnologia.create({
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
          // Cadastro já atribuído entra no histórico patrimonial como atribuição.
          if (body.user_id) {
            await writer.inventoryEventTecnologia.create({
              data: this.eventData(context, created.id, "assign", null, {
                user_id: body.user_id,
                location_id: body.location_id ?? null,
              }),
            });
          }
          return created;
        },
        Boolean(body.user_id),
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
      // Trocar a pessoa ou o local pela edição é uma movimentação: entra no histórico.
      const toUserId = body.user_id ?? activeHolderId(existing);
      const toLocationId = body.location_id ?? existing.location_id ?? null;
      const movesAsset =
        toUserId !== activeHolderId(existing) || toLocationId !== (existing.location_id ?? null);
      if (!changesHolder && !movesAsset) {
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
        async (writer) => {
          const updated = await writer.inventoryTecnologia.update({ where: { id }, data });
          if (movesAsset) {
            await writer.inventoryEventTecnologia.create({
              data: this.eventData(context, id, "transfer", existing, {
                user_id: toUserId,
                location_id: toLocationId,
              }),
            });
          }
          return updated;
        },
        movesAsset,
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
    if (body.user_id === activeHolderId(existing)) {
      throw new ServiceError(409, "O item já está com esta pessoa.");
    }
    await this.ensureActiveOrganizationUser(context.organizationId, body.user_id);

    return this.move(context, id, existing, "assign", {
      user_id: body.user_id,
      delivery_date: body.delivery_date ?? new Date(),
      return_date: null,
    });
  }

  /**
   * Transferência nas quatro direções do legado: pessoa→pessoa, pessoa→local, local→pessoa e
   * local→local (#1932). A origem é quem está com o item agora; o destino vem no corpo.
   */
  async transfer(
    context: TiAuthContext,
    id: string,
    body: TransferTiInventoryBody,
  ): Promise<unknown> {
    const existing = await this.getAssignment(context, id);
    const holderId = activeHolderId(existing);

    if (body.user_id !== undefined) {
      if (body.user_id === holderId) {
        throw new ServiceError(409, "O item já está com esta pessoa.");
      }
      await this.ensureActiveOrganizationUser(context.organizationId, body.user_id);
      return this.move(context, id, existing, "transfer", {
        user_id: body.user_id,
        location_id: null,
        delivery_date: new Date(),
        return_date: null,
      });
    }

    const locationId = body.location_id as string;
    if (!holderId && existing.location_id === locationId) {
      throw new ServiceError(409, "O item já está neste local.");
    }
    await this.ensureLocation(context.organizationId, locationId);
    return this.move(context, id, existing, "transfer", {
      user_id: null,
      location_id: locationId,
      delivery_date: new Date(),
      return_date: null,
    });
  }

  /** Vários itens para a mesma pessoa ou o mesmo local, todos ou nenhum (#1933). */
  async transferBatch(
    context: TiAuthContext,
    body: TransferTiInventoryBatchBody,
  ): Promise<unknown[]> {
    const assets = await this.loadMovableAssets(context, body.asset_ids);
    if (body.user_id !== undefined) {
      await this.ensureActiveOrganizationUser(context.organizationId, body.user_id);
    } else {
      await this.ensureLocation(context.organizationId, body.location_id as string);
    }
    const to =
      body.user_id !== undefined
        ? { user_id: body.user_id, location_id: null }
        : { user_id: null, location_id: body.location_id as string };

    return this.moveMany(
      context,
      "transfer",
      assets.map((asset) => ({ asset, to })),
    );
  }

  /** Troca entre duas pessoas: cada item passa para quem está com o outro (#1933). */
  async swap(context: TiAuthContext, body: SwapTiInventoryBody): Promise<unknown[]> {
    const [first, second] = await this.loadMovableAssets(context, [
      body.asset_id,
      body.other_asset_id,
    ]);
    const firstHolder = first ? activeHolderId(first) : null;
    const secondHolder = second ? activeHolderId(second) : null;
    if (!first || !second || !firstHolder || !secondHolder) {
      throw new ServiceError(409, "A troca exige dois itens que estejam com pessoas.");
    }
    if (firstHolder === secondHolder) {
      throw new ServiceError(409, "Os dois itens já estão com a mesma pessoa.");
    }
    // Cada pessoa passa a ser destino de um item: precisa estar ativa, como na transferência.
    await this.ensureActiveOrganizationUser(context.organizationId, firstHolder);
    await this.ensureActiveOrganizationUser(context.organizationId, secondHolder);

    return this.moveMany(context, "swap", [
      { asset: first, to: { user_id: secondHolder, location_id: null } },
      { asset: second, to: { user_id: firstHolder, location_id: null } },
    ]);
  }

  private async loadMovableAssets(context: TiAuthContext, ids: string[]): Promise<MovableAsset[]> {
    const found = await this.prisma.inventoryTecnologia.findMany({
      where: { id: { in: ids }, organization_id: context.organizationId },
      select: {
        id: true,
        asset_code: true,
        category_id: true,
        user_id: true,
        location_id: true,
        return_date: true,
      },
    });
    const byId = new Map(found.map((asset) => [asset.id, asset]));
    const assets = ids.flatMap((id) => byId.get(id) ?? []);
    if (assets.length !== ids.length) {
      throw new ServiceError(404, "Ativo de TI não encontrado.");
    }
    return assets;
  }

  /**
   * Aplica várias movimentações numa só transação. Tudo é conferido antes da primeira
   * escrita — destino igual à origem e regra do computador ativo sobre o estado final —, e a
   * resposta lista os itens que impediram. Os bloqueios das pessoas de destino são tomados
   * em ordem, para duas operações cruzadas não se travarem.
   */
  private async moveMany(
    context: TiAuthContext,
    action: InventoryEventAction,
    moves: PlannedMove[],
  ): Promise<unknown[]> {
    const organizationId = context.organizationId;
    const ids = moves.map((move) => move.asset.id);

    return this.prisma.$transaction(async (transaction) => {
      const destinationUserIds = uniqueIds(moves.map((move) => move.to.user_id)).sort();
      for (const userId of destinationUserIds) {
        await this.lockActiveComputer(transaction, organizationId, userId);
      }

      const computerCategoryIds = await this.computerCategoryIds(transaction, organizationId);
      const isComputer = (move: PlannedMove) =>
        computerCategoryIds.includes(move.asset.category_id);
      // Computadores que cada pessoa de destino terá no fim: os que ficam mais os que chegam.
      const staying =
        destinationUserIds.length === 0
          ? []
          : await transaction.inventoryTecnologia.findMany({
              where: {
                organization_id: organizationId,
                user_id: { in: destinationUserIds },
                return_date: null,
                category_id: { in: computerCategoryIds },
                id: { notIn: ids },
              },
              select: { user_id: true },
            });
      const computersByUser = new Map<string, number>();
      const count = (userId: string | null) => {
        if (userId) computersByUser.set(userId, (computersByUser.get(userId) ?? 0) + 1);
      };
      for (const asset of staying) count(asset.user_id);
      for (const move of moves) if (isComputer(move)) count(move.to.user_id);

      const blocked = moves.flatMap((move) => {
        const holderId = activeHolderId(move.asset);
        const alreadyThere = move.to.user_id
          ? move.to.user_id === holderId
          : !holderId && move.asset.location_id === move.to.location_id;
        if (alreadyThere) return [`${move.asset.asset_code} (já está no destino)`];
        if (
          move.to.user_id &&
          isComputer(move) &&
          (computersByUser.get(move.to.user_id) ?? 0) > 1
        ) {
          return [`${move.asset.asset_code} (o usuário ficaria com mais de um computador ativo)`];
        }
        return [];
      });
      if (blocked.length > 0) throw itemsBlockedError(blocked);

      const deliveryDate = new Date();
      for (const move of moves) {
        const moved = await transaction.inventoryTecnologia.updateMany({
          where: {
            id: move.asset.id,
            organization_id: organizationId,
            category_id: move.asset.category_id,
            user_id: move.asset.user_id ?? null,
            location_id: move.asset.location_id ?? null,
            return_date: move.asset.return_date ?? null,
          },
          data: { ...move.to, delivery_date: deliveryDate, return_date: null },
        });
        if (moved.count !== 1) {
          throw itemsBlockedError([`${move.asset.asset_code} (movimentado por outra operação)`]);
        }
      }
      await transaction.inventoryEventTecnologia.createMany({
        data: moves.map((move) =>
          this.eventData(context, move.asset.id, action, move.asset, move.to),
        ),
      });

      return transaction.inventoryTecnologia.findMany({
        where: { id: { in: ids }, organization_id: organizationId },
        include: INVENTORY_INCLUDE,
        orderBy: { asset_code: "asc" },
      });
    }, BATCH_TRANSACTION_OPTIONS);
  }

  /**
   * Mapa de equipamentos de um usuário (#1934): os itens ativos da pessoa e as conexões entre
   * o computador e os periféricos, derivados só do inventário. Somente leitura.
   */
  async getUserEquipmentMap(context: TiAuthContext, userId: string): Promise<unknown> {
    const user = await this.prisma.user.findFirst({
      where: { id: userId, organization_id: context.organizationId },
      select: SAFE_USER_SELECT,
    });
    if (!user) {
      throw new ServiceError(404, "Usuário não encontrado na organização.");
    }
    const assets = await this.prisma.inventoryTecnologia.findMany({
      where: { organization_id: context.organizationId, user_id: userId, return_date: null },
      select: { id: true, asset_code: true, notes: true, category: { select: { name: true } } },
      orderBy: { asset_code: "asc" },
    });

    return { user, ...buildEquipmentMap(assets) };
  }

  /** Histórico patrimonial do item, do mais recente para o mais antigo. */
  async listHistory(
    context: TiAuthContext,
    id: string,
    query: ListTiInventoryHistoryQuery,
  ): Promise<unknown[]> {
    await this.getById(context, id);
    const { skip, take } = getPaginationParams(query);
    const events = await this.prisma.inventoryEventTecnologia.findMany({
      where: { organization_id: context.organizationId, inventory_id: id },
      orderBy: { created_at: "desc" },
      skip,
      take,
    });

    const userIds = uniqueIds(
      events.flatMap((event) => [event.actor_user_id, event.from_user_id, event.to_user_id]),
    );
    const locationIds = uniqueIds(
      events.flatMap((event) => [event.from_location_id, event.to_location_id]),
    );
    const [users, locations] = await Promise.all([
      userIds.length === 0
        ? []
        : this.prisma.user.findMany({
            where: { id: { in: userIds }, organization_id: context.organizationId },
            select: { id: true, name: true, full_name: true },
          }),
      locationIds.length === 0
        ? []
        : this.prisma.inventoryLocationTecnologia.findMany({
            where: { id: { in: locationIds }, organization_id: context.organizationId },
            select: { id: true, name: true },
          }),
    ]);
    const userById = new Map(users.map((user) => [user.id, user]));
    const locationById = new Map(locations.map((location) => [location.id, location]));
    const userOf = (userId: string | null) => (userId ? (userById.get(userId) ?? null) : null);
    const locationOf = (locationId: string | null) =>
      locationId ? (locationById.get(locationId) ?? null) : null;

    return events.map((event) => ({
      id: event.id,
      inventory_id: event.inventory_id,
      action: event.action,
      created_at: event.created_at,
      actor: userOf(event.actor_user_id),
      from_user: userOf(event.from_user_id),
      to_user: userOf(event.to_user_id),
      from_location: locationOf(event.from_location_id),
      to_location: locationOf(event.to_location_id),
    }));
  }

  async returnAsset(
    context: TiAuthContext,
    id: string,
    body: ReturnTiInventoryBody,
  ): Promise<unknown> {
    const existing = await this.getAssignment(context, id);

    return this.move(context, id, existing, "return", {
      user_id: null,
      return_date: body.return_date ?? new Date(),
      ...(body.notes === undefined ? {} : { notes: body.notes }),
    });
  }

  /**
   * Muda quem está com o item e registra o evento patrimonial na mesma transação: autor,
   * momento, item, origem, destino e tipo de ação. O estado lido antes vira condição da
   * escrita, então duas movimentações simultâneas do mesmo item não se sobrepõem.
   */
  private async move(
    context: TiAuthContext,
    id: string,
    existing: AssetAssignment,
    action: InventoryEventAction,
    data: {
      user_id: string | null;
      location_id?: string | null;
      delivery_date?: Date;
      return_date: Date | null;
      notes?: string;
    },
  ): Promise<unknown> {
    const organizationId = context.organizationId;
    const toLocationId = data.location_id === undefined ? existing.location_id : data.location_id;

    return this.prisma.$transaction(async (transaction) => {
      if (data.user_id) {
        const computerCategoryIds = await this.computerCategoryIds(transaction, organizationId);
        if (computerCategoryIds.includes(existing.category_id)) {
          await this.lockAndCheckActiveComputer(
            transaction,
            organizationId,
            data.user_id,
            computerCategoryIds,
            id,
          );
        }
      }
      const moved = await transaction.inventoryTecnologia.updateMany({
        where: {
          id,
          organization_id: organizationId,
          category_id: existing.category_id,
          user_id: existing.user_id ?? null,
          location_id: existing.location_id ?? null,
          return_date: existing.return_date ?? null,
        },
        data,
      });
      if (moved.count !== 1) {
        throw new ServiceError(409, ASSET_MOVED_MESSAGE);
      }
      await transaction.inventoryEventTecnologia.create({
        data: this.eventData(context, id, action, existing, {
          user_id: data.user_id,
          location_id: toLocationId ?? null,
        }),
      });
      return transaction.inventoryTecnologia.findFirst({
        where: { id, organization_id: organizationId },
        include: INVENTORY_INCLUDE,
      });
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
    // A escrita grava mais de uma linha (item e evento) e precisa de transação mesmo sem a regra.
    transactional = false,
  ): Promise<T> {
    const writeWithoutRule = () =>
      transactional
        ? this.prisma.$transaction((transaction) => write(transaction))
        : write(this.prisma);
    const userId = target.user_id;
    if (!userId || (target.return_date !== null && target.return_date !== undefined)) {
      return writeWithoutRule();
    }

    const computerCategoryIds = await this.computerCategoryIds(this.prisma, organizationId);
    if (!computerCategoryIds.includes(target.category_id)) {
      return writeWithoutRule();
    }

    return this.prisma.$transaction(async (transaction) => {
      await this.lockAndCheckActiveComputer(
        transaction,
        organizationId,
        userId,
        computerCategoryIds,
        target.id,
      );
      return write(transaction);
    });
  }

  /** Evento patrimonial: autor, item, origem, destino e tipo de ação. */
  private eventData(
    context: TiAuthContext,
    inventoryId: string,
    action: InventoryEventAction,
    from: AssetAssignment | null,
    to: { user_id: string | null; location_id: string | null },
  ) {
    return {
      inventory_id: inventoryId,
      action,
      from_user_id: from ? activeHolderId(from) : null,
      from_location_id: from?.location_id ?? null,
      to_user_id: to.user_id,
      to_location_id: to.location_id,
      actor_user_id: context.userId,
      organization_id: context.organizationId,
    };
  }

  private async computerCategoryIds(
    client: Pick<Prisma.TransactionClient, "inventoryCategoryTecnologia">,
    organizationId: string,
  ): Promise<string[]> {
    const categories = await client.inventoryCategoryTecnologia.findMany({
      where: { organization_id: organizationId },
      select: { id: true, name: true },
    });
    return categories
      .filter((category) => isComputerCategoryName(category.name))
      .map((category) => category.id);
  }

  /** Toma o bloqueio da pessoa e recusa se ela já tem outro computador ativo. */
  private async lockAndCheckActiveComputer(
    transaction: Prisma.TransactionClient,
    organizationId: string,
    userId: string,
    computerCategoryIds: string[],
    assetId?: string,
  ): Promise<void> {
    await this.lockActiveComputer(transaction, organizationId, userId);
    const activeComputer = await transaction.inventoryTecnologia.findFirst({
      where: {
        organization_id: organizationId,
        user_id: userId,
        return_date: null,
        category_id: { in: computerCategoryIds },
        ...(assetId ? { NOT: { id: assetId } } : {}),
      },
      select: { id: true },
    });
    if (activeComputer) {
      throw new ServiceError(409, ACTIVE_COMPUTER_CONFLICT_MESSAGE);
    }
  }

  /** Bloqueio transacional que serializa as escritas de computador de uma pessoa. */
  private async lockActiveComputer(
    transaction: Prisma.TransactionClient,
    organizationId: string,
    userId: string,
  ): Promise<void> {
    await transaction.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${activeComputerLockKey(organizationId, userId)}, 0))`;
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

/** Pessoa que está com o item agora; item devolvido não está com ninguém. */
function activeHolderId(asset: AssetAssignment): string | null {
  return asset.user_id && (asset.return_date === null || asset.return_date === undefined)
    ? asset.user_id
    : null;
}

function uniqueIds(ids: Array<string | null>): string[] {
  return [...new Set(ids.filter((id): id is string => typeof id === "string"))];
}

function isUniqueConstraintError(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    "code" in err &&
    (err as { code?: unknown }).code === "P2002"
  );
}
