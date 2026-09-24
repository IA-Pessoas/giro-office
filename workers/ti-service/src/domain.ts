import type { ReportingQuery } from "@workspace/shared";
import {
  EncryptionService,
  executeReportingQuery,
  ServiceError,
  tiExtensionsReportingCatalog,
  tiInventoryReportingCatalog,
  tiRequestsReportingCatalog,
  tiStockReportingCatalog,
  withReportingSnapshot,
} from "@workspace/shared";

export type TiAuthContext = {
  organizationId: string;
  userId: string;
  permission: number;
  isOrganizationOwner?: boolean;
};

type Row = Record<string, unknown>;
type Delegate = {
  findMany(input: Row): Promise<unknown[]>;
  findFirst(input: Row): Promise<Row | null>;
  create(input: Row): Promise<unknown>;
  update(input: Row): Promise<unknown>;
  updateMany(input: Row): Promise<{ count: number }>;
  count(input: Row): Promise<number>;
};

export type TiDatabase = {
  [model: string]: unknown;
  $transaction<T>(
    callback: (database: TiDatabase) => Promise<T>,
    options?: { isolationLevel?: "RepeatableRead"; maxWait?: number; timeout?: number },
  ): Promise<T>;
};

export type TiService = {
  [method: string]: (...args: unknown[]) => Promise<unknown>;
};

export type TiServices = {
  inventory?: TiService;
  inventoryCategories?: TiService;
  inventoryLocations?: TiService;
  extensions?: TiService;
  passwords?: TiService;
  requests?: TiService;
  requestCategories?: TiService;
  robots?: TiService;
  stock?: TiService;
  terms?: TiService;
  dashboard?: TiService;
  reporting?: TiService;
};

function delegate(database: TiDatabase, name: string): Delegate {
  return database[name] as Delegate;
}

function row(value: unknown): Row {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value as Row;
}

function context(value: unknown): TiAuthContext {
  return value as TiAuthContext;
}

function pageQuery(value: unknown): { page: number; take: number; skip: number } {
  const query = row(value);
  const page = typeof query.page === "number" ? query.page : 1;
  const take = typeof query.page_size === "number" ? query.page_size : 50;
  return { page, take, skip: (page - 1) * take };
}

function uniqueError(error: unknown): boolean {
  return row(error).code === "P2002";
}

async function userInOrganization(
  database: TiDatabase,
  organizationId: string,
  userId: string,
  message = "Usuario nao encontrado.",
): Promise<Row> {
  const user = await delegate(database, "user").findFirst({
    where: { id: userId, organization_id: organizationId },
  });
  if (!user) throw new ServiceError(404, message);
  return user;
}

async function activeUserInOrganization(
  database: TiDatabase,
  organizationId: string,
  userId: string,
): Promise<Row> {
  const user = await delegate(database, "user").findFirst({
    where: { id: userId, organization_id: organizationId, status: "active" },
  });
  if (!user) throw new ServiceError(404, "Usuario nao encontrado na organizacao.");
  return user;
}

async function technologyDepartment(database: TiDatabase, organizationId: string): Promise<string> {
  const department = await delegate(database, "department").findFirst({
    where: {
      organization_id: organizationId,
      name: { equals: "Tecnologia", mode: "insensitive" },
    },
    select: { id: true },
  });
  if (!department || typeof department.id !== "string") {
    throw new ServiceError(404, "Departamento Tecnologia nao encontrado.");
  }
  return department.id;
}

function inventoryServices(database: TiDatabase): TiServices {
  const categories = delegate(database, "inventoryCategoryTecnologia");
  const locations = delegate(database, "inventoryLocationTecnologia");
  const inventory = delegate(database, "inventoryTecnologia");
  const inventoryUserSelect = {
    select: { id: true, name: true, full_name: true, department_id: true, organization_id: true },
  };
  // Mesmo include do legado (INVENTORY_INCLUDE) na lista e no detalhe.
  const inventoryInclude = {
    category: true,
    location: true,
    user: inventoryUserSelect,
    responsible_it_staff: inventoryUserSelect,
  };

  return {
    inventoryCategories: {
      list: async (value) =>
        categories.findMany({
          where: { organization_id: context(value).organizationId },
          orderBy: { name: "asc" },
        }),
      create: async (value, body) => {
        const auth = context(value);
        const input = row(body);
        const existing = await categories.findFirst({
          where: { organization_id: auth.organizationId, name: input.name, active: true },
        });
        if (existing) {
          throw new ServiceError(
            409,
            "Ja existe uma categoria de inventario de TI ativa com este nome.",
          );
        }
        return categories.create({
          data: { ...input, active: true, organization_id: auth.organizationId },
        });
      },
      update: async (value, id, body) => {
        const auth = context(value);
        const existing = await categories.findFirst({
          where: { id, organization_id: auth.organizationId },
        });
        if (!existing) throw new ServiceError(404, "Categoria de inventario de TI nao encontrada.");
        return categories.update({ where: { id }, data: row(body) });
      },
    },
    inventoryLocations: {
      list: async (value) =>
        locations.findMany({
          where: { organization_id: context(value).organizationId },
          orderBy: { name: "asc" },
        }),
      create: async (value, body) => {
        const auth = context(value);
        const input = row(body);
        const existing = await locations.findFirst({
          where: { organization_id: auth.organizationId, name: input.name, active: true },
        });
        if (existing)
          throw new ServiceError(
            409,
            "Ja existe um local de inventario de TI ativo com este nome.",
          );
        return locations.create({
          data: { ...input, active: true, organization_id: auth.organizationId },
        });
      },
      update: async (value, id, body) => {
        const auth = context(value);
        const existing = await locations.findFirst({
          where: { id, organization_id: auth.organizationId },
        });
        if (!existing) throw new ServiceError(404, "Local de inventario de TI nao encontrado.");
        return locations.update({ where: { id }, data: row(body) });
      },
    },
    inventory: {
      list: async (value, query) => {
        const auth = context(value);
        const input = row(query);
        const { skip, take } = pageQuery(query);
        const userFilter =
          typeof input.user_id === "string"
            ? { user_id: input.user_id }
            : input.status === "available"
              ? { user_id: null }
              : input.status === "assigned"
                ? { user_id: { not: null } }
                : {};
        return inventory.findMany({
          where: {
            organization_id: auth.organizationId,
            ...(typeof input.category_id === "string" ? { category_id: input.category_id } : {}),
            ...(typeof input.location_id === "string" ? { location_id: input.location_id } : {}),
            ...(typeof input.asset_code === "string"
              ? { asset_code: { contains: input.asset_code } }
              : {}),
            ...userFilter,
          },
          include: inventoryInclude,
          orderBy: { asset_code: "asc" },
          skip,
          take,
        });
      },
      getById: async (value, id) => {
        const auth = context(value);
        const result = await inventory.findFirst({
          where: { id, organization_id: auth.organizationId },
          include: inventoryInclude,
        });
        if (!result) throw new ServiceError(404, "Ativo de TI nao encontrado.");
        return result;
      },
      create: async (value, body) => {
        const auth = context(value);
        const input = row(body);
        await ensureInventoryReferences(database, auth.organizationId, input);
        try {
          return await inventory.create({
            data: { ...input, organization_id: auth.organizationId },
          });
        } catch (error) {
          if (uniqueError(error))
            throw new ServiceError(409, "Ja existe um ativo de TI com este codigo patrimonial.");
          throw new ServiceError(500, "Erro ao criar ativo de inventario de TI.", error);
        }
      },
      update: async (value, id, body) => {
        const auth = context(value);
        const input = row(body);
        await inventory
          .findFirst({ where: { id, organization_id: auth.organizationId } })
          .then((found) => {
            if (!found) throw new ServiceError(404, "Ativo de TI nao encontrado.");
          });
        await ensureInventoryReferences(database, auth.organizationId, input, String(id));
        return inventory.update({ where: { id }, data: input });
      },
      assignUser: async (value, id, body) => {
        const auth = context(value);
        await inventory
          .findFirst({ where: { id, organization_id: auth.organizationId } })
          .then((found) => {
            if (!found) throw new ServiceError(404, "Ativo de TI nao encontrado.");
          });
        const input = row(body);
        await activeUserInOrganization(database, auth.organizationId, String(input.user_id));
        return inventory.update({
          where: { id },
          data: {
            user_id: input.user_id,
            delivery_date: input.delivery_date ?? new Date(),
            return_date: null,
          },
        });
      },
      returnAsset: async (value, id, body) => {
        const auth = context(value);
        await inventory
          .findFirst({ where: { id, organization_id: auth.organizationId } })
          .then((found) => {
            if (!found) throw new ServiceError(404, "Ativo de TI nao encontrado.");
          });
        const input = row(body);
        return inventory.update({
          where: { id },
          data: {
            user_id: null,
            return_date: input.return_date ?? new Date(),
            ...(input.notes === undefined ? {} : { notes: input.notes }),
          },
        });
      },
    },
  };
}

async function ensureInventoryReferences(
  database: TiDatabase,
  organizationId: string,
  input: Row,
  currentId?: string,
): Promise<void> {
  if (typeof input.category_id === "string") {
    const category = await delegate(database, "inventoryCategoryTecnologia").findFirst({
      where: { id: input.category_id, organization_id: organizationId, active: true },
    });
    if (!category) throw new ServiceError(404, "Categoria de inventario nao encontrada.");
  }
  if (typeof input.location_id === "string") {
    const location = await delegate(database, "inventoryLocationTecnologia").findFirst({
      where: { id: input.location_id, organization_id: organizationId, active: true },
    });
    if (!location) throw new ServiceError(404, "Departamento/local de inventario nao encontrado.");
  }
  if (typeof input.user_id === "string")
    await activeUserInOrganization(database, organizationId, input.user_id);
  if (typeof input.responsible_it_staff_id === "string") {
    const departmentId = await technologyDepartment(database, organizationId);
    const staff = await delegate(database, "user").findFirst({
      where: {
        id: input.responsible_it_staff_id,
        organization_id: organizationId,
        status: "active",
        department_id: departmentId,
      },
    });
    if (!staff)
      throw new ServiceError(422, "Responsavel de TI deve pertencer ao departamento Tecnologia.");
  }
  if (typeof input.asset_code === "string") {
    const duplicate = await delegate(database, "inventoryTecnologia").findFirst({
      where: {
        organization_id: organizationId,
        asset_code: input.asset_code,
        ...(currentId ? { NOT: { id: currentId } } : {}),
      },
    });
    if (duplicate)
      throw new ServiceError(409, "Ja existe um ativo de TI com este codigo patrimonial.");
  }
}

function extensionServices(database: TiDatabase): TiServices {
  const extensions = delegate(database, "extensionsTecnologia");
  const safeUser = {
    select: { id: true, name: true, full_name: true, department_id: true, organization_id: true },
  };
  return {
    extensions: {
      list: async (value, query) => {
        const auth = context(value);
        const input = row(query);
        const { skip, take } = pageQuery(query);
        return extensions.findMany({
          where: {
            organization_id: auth.organizationId,
            ...(input.user_id ? { user_id: input.user_id } : {}),
          },
          include: { user: safeUser },
          orderBy: { number: "asc" },
          skip,
          take,
        });
      },
      getById: async (value, id) => {
        const result = await extensions.findFirst({
          where: { id, organization_id: context(value).organizationId },
          include: { user: safeUser },
        });
        if (!result) throw new ServiceError(404, "Ramal de TI nao encontrado.");
        return result;
      },
      create: async (value, body) => {
        const auth = context(value);
        const input = row(body);
        const duplicate = await extensions.findFirst({
          where: { organization_id: auth.organizationId, number: input.number },
        });
        if (duplicate) throw new ServiceError(409, "Ja existe um ramal de TI com este numero.");
        await userInOrganization(database, auth.organizationId, String(input.user_id));
        return extensions.create({ data: { ...input, organization_id: auth.organizationId } });
      },
      update: async (value, id, body) => {
        const auth = context(value);
        const current = await extensions.findFirst({
          where: { id, organization_id: auth.organizationId },
        });
        if (!current) throw new ServiceError(404, "Ramal de TI nao encontrado.");
        const input = row(body);
        if (input.user_id)
          await userInOrganization(database, auth.organizationId, String(input.user_id));
        if (input.number) {
          const duplicate = await extensions.findFirst({
            where: { organization_id: auth.organizationId, number: input.number, NOT: { id } },
          });
          if (duplicate) throw new ServiceError(409, "Ja existe um ramal de TI com este numero.");
        }
        return extensions.update({ where: { id }, data: input });
      },
    },
  };
}

function passwordServices(database: TiDatabase, encryptionKey: string | undefined): TiServices {
  const passwords = delegate(database, "passwordTecnologia");
  const safeUser = {
    user: {
      select: { id: true, name: true, full_name: true, department_id: true, organization_id: true },
    },
  };
  function encryption(): EncryptionService {
    if (!encryptionKey)
      throw new ServiceError(500, "Criptografia de senhas de TI não configurada.");
    return new EncryptionService(encryptionKey);
  }
  function withoutPassword(value: unknown): Row {
    const result = row(value);
    const { password: _password, ...safe } = result;
    if (safe.user && typeof safe.user === "object") {
      const { password: _userPassword, ...user } = row(safe.user);
      safe.user = user;
    }
    return safe;
  }
  return {
    passwords: {
      list: async (value, query) => {
        const auth = context(value);
        const input = row(query);
        const { page, skip, take } = pageQuery(query);
        const search = (
          typeof input.search === "string"
            ? input.search
            : typeof input.local === "string"
              ? input.local
              : ""
        ).trim();
        const where = {
          organization_id: auth.organizationId,
          ...(input.status === "all" ? {} : { active: input.status !== "inactive" }),
          ...(input.user_id ? { user_id: input.user_id } : {}),
          ...(search
            ? {
                OR: [
                  { local: { contains: search, mode: "insensitive" } },
                  { notes: { contains: search, mode: "insensitive" } },
                  {
                    user: {
                      is: {
                        OR: [
                          { name: { contains: search, mode: "insensitive" } },
                          { full_name: { contains: search, mode: "insensitive" } },
                        ],
                      },
                    },
                  },
                ],
              }
            : {}),
        };
        const [total, rows] = await Promise.all([
          passwords.count({ where }),
          passwords.findMany({ where, include: safeUser, orderBy: { local: "asc" }, skip, take }),
        ]);
        return {
          items: rows.map(withoutPassword),
          total,
          page,
          page_size: take,
          hasMore: skip + rows.length < total,
        };
      },
      getById: async (value, id) => {
        const auth = context(value);
        const found = await passwords.findFirst({
          where: { id, organization_id: auth.organizationId },
          include: safeUser,
        });
        if (!found) throw new ServiceError(404, "Senha de TI nao encontrada.");
        if (row(found).active === false) throw new ServiceError(409, "Senha de TI inativa.");
        const result = withoutPassword(found);
        if (typeof row(found).password === "string") {
          try {
            result.password = encryption().decrypt(row(found).password as string);
          } catch (error) {
            throw new ServiceError(500, "Erro ao descriptografar senha de TI.", error);
          }
        }
        return result;
      },
      create: async (value, body) => {
        const auth = context(value);
        const input = row(body);
        await userInOrganization(database, auth.organizationId, String(input.user_id));
        return withoutPassword(
          await passwords.create({
            data: {
              ...input,
              password: encryption().encrypt(String(input.password)),
              organization_id: auth.organizationId,
            },
          }),
        );
      },
      update: async (value, id, body) => {
        const auth = context(value);
        const current = await passwords.findFirst({
          where: { id, organization_id: auth.organizationId },
          include: safeUser,
        });
        if (!current) throw new ServiceError(404, "Senha de TI nao encontrada.");
        if (row(current).active === false) throw new ServiceError(409, "Senha de TI inativa.");
        const input = row(body);
        if (input.user_id)
          await userInOrganization(database, auth.organizationId, String(input.user_id));
        const data = {
          ...input,
          ...(input.password ? { password: encryption().encrypt(String(input.password)) } : {}),
        };
        const result = await passwords.updateMany({
          where: { id, organization_id: auth.organizationId, active: true },
          data,
        });
        if (result.count === 0) throw new ServiceError(409, "Senha de TI inativa.");
        const updated = await passwords.findFirst({
          where: { id, organization_id: auth.organizationId },
          include: safeUser,
        });
        return withoutPassword(updated);
      },
      deactivate: async (value, id, body) => {
        const auth = context(value);
        const current = await passwords.findFirst({
          where: { id, organization_id: auth.organizationId },
        });
        if (!current) throw new ServiceError(404, "Senha de TI nao encontrada.");
        if (row(current).active === false)
          throw new ServiceError(409, "Senha de TI ja esta inativa.");
        const result = await passwords.updateMany({
          where: { id, organization_id: auth.organizationId, active: true },
          data: {
            active: false,
            deactivated_at: new Date(),
            deactivated_by_user_id: auth.userId,
            deactivation_reason: row(body).reason,
          },
        });
        if (result.count === 0) throw new ServiceError(409, "Senha de TI ja esta inativa.");
        return withoutPassword(
          await passwords.findFirst({
            where: { id, organization_id: auth.organizationId },
            include: safeUser,
          }),
        );
      },
    },
  };
}

function requestServices(database: TiDatabase): TiServices {
  const requests = delegate(database, "tIRequest");
  const messages = delegate(database, "tIMessage");
  const categories = delegate(database, "tICategoryRequest");
  const userSelect = {
    select: { id: true, name: true, full_name: true, department_id: true, organization_id: true },
  };
  const include = { category: true, requester: userSelect, assigned_to: userSelect };
  async function requestAccess(auth: TiAuthContext, id: string): Promise<Row> {
    const found = await requests.findFirst({
      where: { id, organization_id: auth.organizationId },
      include,
    });
    if (!found || (auth.permission < 2 && row(found).requester_id !== auth.userId))
      throw new ServiceError(404, "Chamado de TI nao encontrado.");
    return found;
  }
  return {
    requests: {
      list: async (value, query) => {
        const auth = context(value);
        const input = row(query);
        const { skip, take } = pageQuery(query);
        const requester = auth.permission < 2 ? auth.userId : input.requester_id;
        return requests.findMany({
          where: {
            organization_id: auth.organizationId,
            ...(input.status ? { status: input.status } : {}),
            ...(input.urgency ? { urgency: input.urgency } : {}),
            ...(input.category_id ? { category_id: input.category_id } : {}),
            ...(requester ? { requester_id: requester } : {}),
            ...(input.assigned_to_id ? { assigned_to_id: input.assigned_to_id } : {}),
            ...(input.created_from || input.created_to
              ? {
                  created_at: {
                    ...(input.created_from ? { gte: input.created_from } : {}),
                    ...(input.created_to ? { lte: input.created_to } : {}),
                  },
                }
              : {}),
          },
          include,
          orderBy: { created_at: "desc" },
          skip,
          take,
        });
      },
      getById: async (value, id) => requestAccess(context(value), String(id)),
      create: async (value, body) => {
        const auth = context(value);
        const input = row(body);
        const requesterId = String(input.requester_id ?? auth.userId);
        if (requesterId !== auth.userId && auth.permission < 2)
          throw new ServiceError(
            403,
            "Permissao insuficiente para criar chamado para outro usuario.",
          );
        if (input.assigned_to_id && auth.permission < 3)
          throw new ServiceError(403, "Permissao insuficiente para atribuir chamado.");
        const category = await categories.findFirst({
          where: { id: input.category_id, organization_id: auth.organizationId, active: true },
        });
        if (!category) throw new ServiceError(404, "Categoria de TI nao encontrada.");
        await userInOrganization(
          database,
          auth.organizationId,
          requesterId,
          "Solicitante nao encontrado.",
        );
        if (input.assigned_to_id)
          await userInOrganization(
            database,
            auth.organizationId,
            String(input.assigned_to_id),
            "Responsavel nao encontrado.",
          );
        return requests.create({
          data: {
            ...input,
            requester_id: requesterId,
            status: "New",
            organization_id: auth.organizationId,
          },
        });
      },
      update: async (value, id, body) => {
        const auth = context(value);
        await requestAccess(auth, String(id));
        const input = row(body);
        if (
          input.category_id &&
          !(await categories.findFirst({
            where: { id: input.category_id, organization_id: auth.organizationId, active: true },
          }))
        )
          throw new ServiceError(404, "Categoria de TI nao encontrada.");
        return requests.update({ where: { id }, data: input });
      },
      assign: async (value, id, body) => {
        const auth = context(value);
        const current = await requests.findFirst({
          where: { id, organization_id: auth.organizationId },
          select: { assigned_to_id: true },
        });
        if (!current) throw new ServiceError(404, "Chamado de TI nao encontrado.");
        if (
          row(current).assigned_to_id !== auth.userId &&
          auth.permission < 3 &&
          !auth.isOrganizationOwner
        )
          throw new ServiceError(403, "Permissao insuficiente para transferir chamado.");
        const destination = await userInOrganization(
          database,
          auth.organizationId,
          String(row(body).assigned_to_id),
          "Responsavel nao encontrado.",
        );
        const departmentId = await technologyDepartment(database, auth.organizationId);
        if (destination.status !== "active" || destination.department_id !== departmentId)
          throw new ServiceError(400, "Responsavel deve pertencer ao departamento Tecnologia.");
        const changed = await requests.updateMany({
          where: {
            id,
            organization_id: auth.organizationId,
            ...(row(current).assigned_to_id === auth.userId &&
            auth.permission < 3 &&
            !auth.isOrganizationOwner
              ? { assigned_to_id: row(current).assigned_to_id }
              : {}),
          },
          data: { assigned_to_id: row(body).assigned_to_id },
        });
        if (changed.count === 0)
          throw new ServiceError(409, "Chamado de TI foi transferido por outro usuario.");
        return { id, assigned_to_id: row(body).assigned_to_id };
      },
      listTransferCandidates: async (value, id) => {
        const auth = context(value);
        const current = await requests.findFirst({
          where: { id, organization_id: auth.organizationId },
          select: { assigned_to_id: true },
        });
        if (!current) throw new ServiceError(404, "Chamado de TI nao encontrado.");
        if (
          row(current).assigned_to_id !== auth.userId &&
          auth.permission < 3 &&
          !auth.isOrganizationOwner
        )
          throw new ServiceError(403, "Permissao insuficiente para transferir chamado.");
        const departmentId = await technologyDepartment(database, auth.organizationId);
        return delegate(database, "user").findMany({
          where: {
            organization_id: auth.organizationId,
            department_id: departmentId,
            status: "active",
            permissions: {
              some: {
                organization_id: auth.organizationId,
                ti: { gte: 2 },
              },
            },
          },
          select: { id: true, name: true, full_name: true, department_id: true },
          orderBy: { full_name: "asc" },
        });
      },
      updateStatus: async (value, id, body) => {
        const auth = context(value);
        const current = await requestAccess(auth, String(id));
        const next = row(body).status;
        const allowed: Record<string, string[]> = {
          New: ["In_Progress", "Waiting", "Resolved", "Closed"],
          In_Progress: ["Waiting", "Resolved", "Closed"],
          Waiting: ["In_Progress", "Resolved", "Closed"],
          Resolved: ["Closed"],
          Closed: [],
        };
        if (
          row(current).status !== next &&
          auth.permission < 3 &&
          !allowed[String(row(current).status)]?.includes(String(next))
        )
          throw new ServiceError(403, "Permissao insuficiente para esta transicao.");
        return requests.update({ where: { id }, data: { status: next } });
      },
      listMessages: async (value, id, query) => {
        const auth = context(value);
        await requestAccess(auth, String(id));
        const input = row(query);
        const { skip, take } = pageQuery(query);
        return messages.findMany({
          where: {
            request_id: id,
            organization_id: auth.organizationId,
            ...(input.created_from || input.created_to
              ? {
                  created_at: {
                    ...(input.created_from ? { gte: input.created_from } : {}),
                    ...(input.created_to ? { lte: input.created_to } : {}),
                  },
                }
              : {}),
          },
          orderBy: { created_at: "asc" },
          skip,
          take,
        });
      },
      createMessage: async (value, id, body) => {
        const auth = context(value);
        await requestAccess(auth, String(id));
        return messages.create({
          data: {
            request_id: id,
            sender_id: auth.userId,
            organization_id: auth.organizationId,
            ...row(body),
          },
        });
      },
    },
    requestCategories: {
      list: async (value, query) => {
        const input = row(query);
        return categories.findMany({
          where: {
            organization_id: context(value).organizationId,
            ...(input.active === undefined ? {} : { active: input.active }),
          },
          orderBy: { name: "asc" },
        });
      },
      create: async (value, body) => {
        const auth = context(value);
        const input = row(body);
        if (
          await categories.findFirst({
            where: { organization_id: auth.organizationId, name: input.name, active: true },
          })
        )
          throw new ServiceError(409, "Ja existe uma categoria de TI ativa com este nome.");
        return categories.create({
          data: { ...input, active: true, organization_id: auth.organizationId },
        });
      },
      update: async (value, id, body) => {
        const auth = context(value);
        if (!(await categories.findFirst({ where: { id, organization_id: auth.organizationId } })))
          throw new ServiceError(404, "Categoria de TI nao encontrada.");
        return categories.update({ where: { id }, data: row(body) });
      },
    },
  };
}

function robotServices(database: TiDatabase): TiServices {
  const robots = delegate(database, "tIRobot");
  const runs = delegate(database, "tIRobotRun");
  const latestRunInclude = {
    runs: {
      orderBy: { started_at: "desc" },
      take: 1,
      select: { status: true, started_at: true, finished_at: true },
    },
  };
  const robotResponse = (value: unknown): Row => {
    const result = row(value);
    const latest = Array.isArray(result.runs) ? row(result.runs[0]) : {};
    const { runs: _runs, ...withoutRuns } = result;
    const finishedAt = latest.finished_at ?? latest.started_at;
    return {
      ...withoutRuns,
      last_status: latest.status ?? null,
      last_run_at:
        finishedAt instanceof Date
          ? finishedAt.toISOString()
          : typeof finishedAt === "string"
            ? finishedAt
            : null,
    };
  };
  return {
    robots: {
      list: async (value, query) => {
        const auth = context(value);
        const input = row(query);
        const { skip, take } = pageQuery(query);
        const results = await robots.findMany({
          where: {
            organization_id: auth.organizationId,
            ...(input.type ? { type: input.type } : {}),
            ...(input.status ? { status: input.status } : {}),
            ...(input.active === undefined ? {} : { active: input.active }),
          },
          include: latestRunInclude,
          orderBy: { name: "asc" },
          skip,
          take,
        });
        return results.map(robotResponse);
      },
      getById: async (value, id) => {
        const result = await robots.findFirst({
          where: { id, organization_id: context(value).organizationId },
          include: latestRunInclude,
        });
        if (!result) throw new ServiceError(404, "Robo de TI nao encontrado.");
        return robotResponse(result);
      },
      create: async (value, body) =>
        robots.create({ data: { ...row(body), organization_id: context(value).organizationId } }),
      update: async (value, id, body) => {
        const auth = context(value);
        if (!(await robots.findFirst({ where: { id, organization_id: auth.organizationId } })))
          throw new ServiceError(404, "Robo de TI nao encontrado.");
        return robots.update({ where: { id }, data: row(body) });
      },
      createRun: async (value, id, body) => {
        const auth = context(value);
        if (!(await robots.findFirst({ where: { id, organization_id: auth.organizationId } })))
          throw new ServiceError(404, "Robo de TI nao encontrado.");
        return runs.create({
          data: { robot_id: id, organization_id: auth.organizationId, ...row(body) },
        });
      },
      listRuns: async (value, id, query) => {
        const auth = context(value);
        if (!(await robots.findFirst({ where: { id, organization_id: auth.organizationId } })))
          throw new ServiceError(404, "Robo de TI nao encontrado.");
        const input = row(query);
        const { skip, take } = pageQuery(query);
        return runs.findMany({
          where: {
            robot_id: id,
            organization_id: auth.organizationId,
            ...(input.status ? { status: input.status } : {}),
          },
          orderBy: { started_at: "desc" },
          skip,
          take,
        });
      },
    },
  };
}

function termServices(database: TiDatabase): TiServices {
  const terms = delegate(database, "termTecnologia");
  const userInclude = {
    user: {
      select: { id: true, name: true, full_name: true, department_id: true, organization_id: true },
    },
  };
  const termResponse = (value: unknown): unknown => {
    const result = row(value);
    const user = row(result.user);
    const safeUser = result.user && typeof result.user === "object" ? { ...user } : undefined;
    if (safeUser) delete safeUser.password;
    return {
      ...result,
      ...(safeUser ? { user: safeUser } : {}),
      status: result.signed_at == null ? "pending" : "signed",
    };
  };
  return {
    terms: {
      list: async (value, query) => {
        const auth = context(value);
        const input = row(query);
        const { skip, take } = pageQuery(query);
        const userId = auth.permission < 3 ? auth.userId : input.user_id;
        const results = await terms.findMany({
          where: {
            organization_id: auth.organizationId,
            ...(userId ? { user_id: userId } : {}),
            ...(input.status === "pending"
              ? { signed_at: null }
              : input.status === "signed"
                ? { signed_at: { not: null } }
                : {}),
          },
          include: userInclude,
          orderBy: { date: "desc" },
          skip,
          take,
        });
        return results.map(termResponse);
      },
      getById: async (value, id) => {
        const auth = context(value);
        const result = await terms.findFirst({
          where: { id, organization_id: context(value).organizationId },
          include: userInclude,
        });
        if (!result) throw new ServiceError(404, "Termo de TI nao encontrado.");
        if (auth.permission < 3 && row(result).user_id !== auth.userId)
          throw new ServiceError(404, "Termo de TI nao encontrado.");
        return termResponse(result);
      },
      create: async (value, body) => {
        const auth = context(value);
        const input = row(body);
        const userId = String(input.user_id);
        const user = await userInOrganization(database, auth.organizationId, userId);
        if (input.department_id) {
          const department = await delegate(database, "department").findFirst({
            where: { id: input.department_id, organization_id: auth.organizationId },
          });
          if (!department) throw new ServiceError(404, "Departamento nao encontrado.");
        }
        return termResponse(
          await terms.create({
            data: {
              ...input,
              user_id: userId,
              signed_at: null,
              user_name: String(user.full_name ?? user.name ?? "").trim(),
              user_cpf: String(user.cpf ?? "").trim(),
              organization_id: auth.organizationId,
            },
          }),
        );
      },
      update: async (value, id, body) => {
        const auth = context(value);
        await thisTermGet(terms, auth, id, userInclude);
        const input = row(body);
        if (input.department_id) {
          const department = await delegate(database, "department").findFirst({
            where: { id: input.department_id, organization_id: auth.organizationId },
          });
          if (!department) throw new ServiceError(404, "Departamento nao encontrado.");
        }
        return termResponse(await terms.update({ where: { id }, data: input }));
      },
      sign: async (value, id, body) => {
        const auth = context(value);
        const term = await thisTermGet(terms, auth, id, userInclude);
        if (auth.permission < 3 && row(term).user_id !== auth.userId)
          throw new ServiceError(
            403,
            "Permissao insuficiente para assinar termo de outro usuario.",
          );
        return termResponse(
          await terms.update({
            where: { id },
            data: {
              reason: row(body).reason ?? "Termo assinado pelo usuario.",
              signed_at: new Date(),
            },
          }),
        );
      },
    },
  };
}

async function thisTermGet(
  terms: Delegate,
  auth: TiAuthContext,
  id: unknown,
  include: Row,
): Promise<Row> {
  const result = await terms.findFirst({
    where: { id, organization_id: auth.organizationId },
    include,
  });
  if (!result || (auth.permission < 3 && result.user_id !== auth.userId))
    throw new ServiceError(404, "Termo de TI nao encontrado.");
  return result;
}

function dashboardServices(database: TiDatabase): TiServices {
  return {
    dashboard: {
      getSummary: async (value) => {
        const auth = context(value);
        const request = delegate(database, "tIRequest");
        const where = {
          organization_id: auth.organizationId,
          ...(auth.permission < 2 ? { requester_id: auth.userId } : {}),
        };
        const [openRequests, criticalRequests, resolvedLastSevenDays, closedRequests] =
          await Promise.all([
            request.count({ where: { ...where, status: { notIn: ["Resolved", "Closed"] } } }),
            request.count({
              where: {
                ...where,
                urgency: { in: ["High", "Critical"] },
                status: { notIn: ["Resolved", "Closed"] },
              },
            }),
            request.count({
              where: {
                ...where,
                status: "Resolved",
                updated_at: { gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) },
              },
            }),
            request.count({ where: { ...where, status: "Closed" } }),
          ]);
        const base = { openRequests, criticalRequests, resolvedLastSevenDays, closedRequests };
        if (auth.permission < 2) return { scope: "self", ...base };
        const inventory = delegate(database, "inventoryTecnologia");
        const terms = delegate(database, "termTecnologia");
        const robots = delegate(database, "tIRobot");
        const stocks = delegate(database, "stock");
        const department = await technologyDepartment(database, auth.organizationId).catch(
          () => undefined,
        );
        const [
          inventoryAssets,
          assignedInventoryAssets,
          pendingTerms,
          activeRobots,
          lowStockItems,
        ] = await Promise.all([
          inventory.count({ where: { organization_id: auth.organizationId } }),
          inventory.count({
            where: { organization_id: auth.organizationId, user_id: { not: null } },
          }),
          terms.count({ where: { organization_id: auth.organizationId, signed_at: null } }),
          robots.count({ where: { organization_id: auth.organizationId, active: true } }),
          department
            ? stocks.count({
                where: {
                  organization_id: auth.organizationId,
                  department_id: department,
                  status: true,
                  quantity: { lte: 0 },
                },
              })
            : 0,
        ]);
        return {
          scope: "organization",
          ...base,
          inventoryAssets,
          assignedInventoryAssets,
          pendingTerms,
          lowStockItems,
          activeRobots,
        };
      },
    },
  };
}

function stockServices(database: TiDatabase): TiServices {
  const stocks = delegate(database, "stock");
  const categories = delegate(database, "categoryStock");
  const locations = delegate(database, "locationStock");
  const entries = delegate(database, "entryStock");
  const exits = delegate(database, "exitStock");
  return {
    stock: {
      listItems: async (value, query) => {
        const auth = context(value);
        const input = row(query);
        const departmentId = await technologyDepartment(database, auth.organizationId);
        const { page, skip, take } = pageQuery(query);
        const where = {
          organization_id: auth.organizationId,
          department_id: departmentId,
          ...(input.category_id ? { category_id: input.category_id } : {}),
          ...(input.location_id ? { location_id: input.location_id } : {}),
          ...(input.name ? { name: { contains: input.name, mode: "insensitive" } } : {}),
          ...(input.status === undefined ? {} : { status: input.status }),
        };
        const [total, data] = await Promise.all([
          stocks.count({ where }),
          stocks.findMany({
            where,
            include: { category: true, location: true, department: true },
            orderBy: { name: "asc" },
            skip,
            take,
          }),
        ]);
        return { data, total, page, limit: take, hasMore: page * take < total };
      },
      getItemById: async (value, id) => {
        const auth = context(value);
        const departmentId = await technologyDepartment(database, auth.organizationId);
        const result = await stocks.findFirst({
          where: { id, organization_id: auth.organizationId, department_id: departmentId },
          include: { category: true, location: true, department: true },
        });
        if (!result) throw new ServiceError(404, "Item de estoque nao encontrado.");
        return result;
      },
      createItem: async (value, body) => {
        const auth = context(value);
        const departmentId = await technologyDepartment(database, auth.organizationId);
        const input = row(body);
        await ensureStockReference(database, auth.organizationId, departmentId, input);
        return stocks.create({
          data: {
            ...input,
            department_id: departmentId,
            organization_id: auth.organizationId,
            status: true,
          },
        });
      },
      updateItem: async (value, id, body) => {
        const auth = context(value);
        const departmentId = await technologyDepartment(database, auth.organizationId);
        await ensureStock(database, auth.organizationId, departmentId, id);
        const input = row(body);
        await ensureStockReference(database, auth.organizationId, departmentId, input);
        return stocks.update({ where: { id }, data: input });
      },
      createEntry: async (value, id, body) => {
        const auth = context(value);
        const departmentId = await technologyDepartment(database, auth.organizationId);
        return database.$transaction(async (tx) => {
          const transactionEntries = delegate(tx, "entryStock");
          const transactionStocks = delegate(tx, "stock");
          await ensureStock(tx, auth.organizationId, departmentId, id);
          const input = row(body);
          await transactionEntries.create({
            data: {
              stock_id: id,
              quantity: input.quantity,
              entry_date: input.entry_date ?? new Date(),
              entry_by_user_id: auth.userId,
              organization_id: auth.organizationId,
            },
          });
          await transactionStocks.update({
            where: { id },
            data: { quantity: { increment: input.quantity } },
          });
          return ensureStock(tx, auth.organizationId, departmentId, id);
        });
      },
      createExit: async (value, id, body) => {
        const auth = context(value);
        const departmentId = await technologyDepartment(database, auth.organizationId);
        return database.$transaction(async (tx) => {
          const transactionExits = delegate(tx, "exitStock");
          await ensureStock(tx, auth.organizationId, departmentId, id);
          const input = row(body);
          await userInOrganization(
            tx,
            auth.organizationId,
            String(input.requester_id),
            "Solicitante nao encontrado.",
          );
          if (input.approver_id)
            await userInOrganization(
              tx,
              auth.organizationId,
              String(input.approver_id),
              "Aprovador nao encontrado.",
            );
          if (input.operator_id)
            await userInOrganization(
              tx,
              auth.organizationId,
              String(input.operator_id),
              "Operador nao encontrado.",
            );
          if (input.location_destination_id)
            await ensureStockLocation(
              tx,
              auth.organizationId,
              departmentId,
              String(input.location_destination_id),
            );
          const changed = await delegate(tx, "stock").updateMany({
            where: {
              id,
              organization_id: auth.organizationId,
              department_id: departmentId,
              quantity: { gte: input.quantity },
            },
            data: { quantity: { decrement: input.quantity } },
          });
          if (changed.count === 0)
            throw new ServiceError(409, "Saldo insuficiente no estoque de TI.");
          await transactionExits.create({
            data: {
              stock_id: id,
              organization_id: auth.organizationId,
              ...input,
              exit_date: input.exit_date ?? new Date(),
            },
          });
          return ensureStock(tx, auth.organizationId, departmentId, id);
        });
      },
      listItemMovements: async (value, id) => {
        const auth = context(value);
        const departmentId = await technologyDepartment(database, auth.organizationId);
        await ensureStock(database, auth.organizationId, departmentId, id);
        const [inRows, outRows] = await Promise.all([
          entries.findMany({
            where: { stock_id: id, organization_id: auth.organizationId },
            select: {
              id: true,
              stock_id: true,
              quantity: true,
              entry_date: true,
              entry_by_user_id: true,
              entry_by_user: { select: { name: true } },
            },
          }),
          exits.findMany({
            where: { stock_id: id, organization_id: auth.organizationId },
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
              requester: { select: { id: true, name: true, full_name: true } },
              approver: { select: { id: true, name: true, full_name: true } },
              operator: { select: { id: true, name: true, full_name: true } },
              loc_dest: { select: { name: true } },
            },
          }),
        ]);
        const dateString = (value: unknown): string =>
          value instanceof Date ? value.toISOString() : String(value);
        const movements = [
          ...inRows.map((entry) => {
            const item = row(entry);
            return {
              id: item.id,
              type: "entry" as const,
              quantity: item.quantity,
              created_at: dateString(item.entry_date),
              item_id: item.stock_id,
              requester_id: null,
              requester_name: null,
              approver_id: null,
              approver_name: null,
              operator_id: item.entry_by_user_id,
              operator_name: row(item.entry_by_user).name,
              destination: null,
              location_destination_id: null,
              location_destination_name: null,
              balance_before: null,
              balance_after: null,
            };
          }),
          ...outRows.map((exit) => {
            const item = row(exit);
            return {
              id: item.id,
              type: "exit" as const,
              quantity: item.quantity,
              created_at: dateString(item.exit_date),
              item_id: item.stock_id,
              requester_id: item.requester_id,
              requester_name: row(item.requester).name,
              approver_id: item.approver_id,
              approver_name: item.approver ? row(item.approver).name : null,
              operator_id: item.operator_id,
              operator_name: item.operator ? row(item.operator).name : null,
              destination: item.destination,
              location_destination_id: item.location_destination_id,
              location_destination_name: item.loc_dest ? row(item.loc_dest).name : null,
              balance_before: null,
              balance_after: null,
            };
          }),
        ];
        return movements.sort((left, right) => {
          const byDate = Date.parse(right.created_at) - Date.parse(left.created_at);
          return byDate !== 0 ? byDate : String(left.id).localeCompare(String(right.id));
        });
      },
      listCategories: async (value) => {
        const auth = context(value);
        const departmentId = await technologyDepartment(database, auth.organizationId);
        return categories.findMany({
          where: { organization_id: auth.organizationId, department_id: departmentId },
          orderBy: { name: "asc" },
        });
      },
      createCategory: async (value, body) => {
        const auth = context(value);
        const departmentId = await technologyDepartment(database, auth.organizationId);
        const input = row(body);
        const name = String(input.name).trim().replace(/\s+/gu, " ");
        const activeCategories = await categories.findMany({
          where: {
            organization_id: auth.organizationId,
            department_id: departmentId,
            status: true,
          },
          select: { name: true },
        });
        if (
          activeCategories.some(
            (category) =>
              String(row(category).name).trim().replace(/\s+/gu, " ").toLowerCase() ===
              name.toLowerCase(),
          )
        )
          throw new ServiceError(
            409,
            "Ja existe uma categoria de estoque de TI ativa com este nome.",
          );
        try {
          return await categories.create({
            data: {
              ...input,
              name,
              department_id: departmentId,
              organization_id: auth.organizationId,
              status: true,
            },
          });
        } catch (error) {
          if (uniqueError(error))
            throw new ServiceError(
              409,
              "Ja existe uma categoria de estoque de TI ativa com este nome.",
            );
          throw error;
        }
      },
      updateCategory: async (value, id, body) => {
        const auth = context(value);
        const departmentId = await technologyDepartment(database, auth.organizationId);
        if (
          !(await categories.findFirst({
            where: { id, organization_id: auth.organizationId, department_id: departmentId },
          }))
        )
          throw new ServiceError(404, "Categoria de estoque nao encontrada.");
        try {
          return await categories.update({ where: { id }, data: row(body) });
        } catch (error) {
          if (uniqueError(error))
            throw new ServiceError(
              409,
              "Ja existe uma categoria de estoque de TI ativa com este nome.",
            );
          throw error;
        }
      },
      listLocations: async (value) => {
        const auth = context(value);
        const departmentId = await technologyDepartment(database, auth.organizationId);
        return locations.findMany({
          where: { organization_id: auth.organizationId, department_id: departmentId },
          orderBy: { name: "asc" },
        });
      },
      createLocation: async (value, body) => {
        const auth = context(value);
        const departmentId = await technologyDepartment(database, auth.organizationId);
        const input = row(body);
        const activeLocations = await locations.findMany({
          where: {
            organization_id: auth.organizationId,
            department_id: departmentId,
            status: true,
          },
          select: { name: true },
        });
        const normalizeLocation = (name: string) =>
          name
            .normalize("NFD")
            .replace(/[\u0300-\u036f]/gu, "")
            .trim()
            .replace(/\s+/gu, " ")
            .toLowerCase();
        if (
          activeLocations.some(
            (location) =>
              normalizeLocation(String(row(location).name)) ===
              normalizeLocation(String(input.name)),
          )
        )
          throw new ServiceError(409, "Ja existe um local de estoque de TI ativo com este nome.");
        return locations.create({
          data: {
            ...input,
            department_id: departmentId,
            organization_id: auth.organizationId,
            status: true,
          },
        });
      },
      updateLocation: async (value, id, body) => {
        const auth = context(value);
        const departmentId = await technologyDepartment(database, auth.organizationId);
        if (
          !(await locations.findFirst({
            where: { id, organization_id: auth.organizationId, department_id: departmentId },
          }))
        )
          throw new ServiceError(404, "Local de estoque nao encontrado.");
        return locations.update({ where: { id }, data: row(body) });
      },
    },
  };
}

async function ensureStock(
  database: TiDatabase,
  organizationId: string,
  departmentId: string,
  id: unknown,
): Promise<unknown> {
  const result = await delegate(database, "stock").findFirst({
    where: { id, organization_id: organizationId, department_id: departmentId },
  });
  if (!result) throw new ServiceError(404, "Item de estoque nao encontrado.");
  return result;
}

async function ensureStockReference(
  database: TiDatabase,
  organizationId: string,
  departmentId: string,
  input: Row,
): Promise<void> {
  if (
    input.category_id &&
    !(await delegate(database, "categoryStock").findFirst({
      where: {
        id: input.category_id,
        organization_id: organizationId,
        department_id: departmentId,
        status: true,
      },
    }))
  )
    throw new ServiceError(404, "Categoria de estoque nao encontrada.");
  if (
    input.location_id &&
    !(await delegate(database, "locationStock").findFirst({
      where: {
        id: input.location_id,
        organization_id: organizationId,
        department_id: departmentId,
        status: true,
      },
    }))
  )
    throw new ServiceError(404, "Local de estoque nao encontrado.");
}

async function ensureStockLocation(
  database: TiDatabase,
  organizationId: string,
  departmentId: string,
  id: string,
): Promise<void> {
  const location = await delegate(database, "locationStock").findFirst({
    where: { id, organization_id: organizationId, department_id: departmentId, status: true },
  });
  if (!location) throw new ServiceError(404, "Local de estoque nao encontrado.");
}

type ReportingInput = {
  query?: ReportingQuery;
  offset?: number;
  organizationId: string;
  source: string;
  fields: readonly string[];
  limit: number;
};

const reportingFieldSelects: Record<string, Record<string, Record<string, unknown>>> = {
  "ti.extensions": {
    number: { number: true },
    created_at: { createdAt: true },
    updated_at: { updatedAt: true },
  },
  "ti.inventory": {
    asset_code: { asset_code: true },
    category: { category: { select: { name: true } } },
    location: { location: { select: { name: true } } },
    delivery_date: { delivery_date: true },
    return_date: { return_date: true },
    notes: { notes: true },
  },
  "ti.requests": {
    title: { title: true },
    category: { category: { select: { name: true } } },
    urgency: { urgency: true },
    status: { status: true },
    created_at: { created_at: true },
    updated_at: { updated_at: true },
  },
  "ti.stock": {
    name: { name: true },
    category: { category: { select: { name: true } } },
    location: { location: { select: { name: true } } },
    quantity: { quantity: true },
    description: { description: true },
    status: { status: true },
  },
};

function projectReportingRows(
  source: string,
  rows: readonly Row[],
  fields: readonly string[],
): readonly Row[] {
  return rows.map((value) =>
    Object.fromEntries(
      fields.map((field) => {
        if (field === "created_at" && source === "ti.extensions") return [field, value.createdAt];
        if (field === "updated_at" && source === "ti.extensions") return [field, value.updatedAt];
        if (["category", "location"].includes(field)) {
          const relation = value[field];
          return [
            field,
            relation && typeof relation === "object" && "name" in relation
              ? (relation as Row).name
              : null,
          ];
        }
        return [field, value[field]];
      }),
    ),
  );
}

function reportingServices(database: TiDatabase, inSnapshot = false): TiServices {
  const catalogs = [
    tiExtensionsReportingCatalog,
    tiInventoryReportingCatalog,
    tiRequestsReportingCatalog,
    tiStockReportingCatalog,
  ];
  const catalog = {
    sources: catalogs.flatMap((value) => value.sources.map(({ keys: _keys, ...source }) => source)),
    relations: [],
  };
  const fieldNames = (source: string) =>
    catalogs
      .find((value) => value.sources.some((candidate) => candidate.key === source))
      ?.sources.find((candidate) => candidate.key === source)
      ?.fields.map((field) => field.key) ?? [];
  const delegates: Record<string, Delegate> = {
    "ti.extensions": delegate(database, "extensionsTecnologia"),
    "ti.inventory": delegate(database, "inventoryTecnologia"),
    "ti.requests": delegate(database, "tIRequest"),
    "ti.stock": delegate(database, "stock"),
  };
  return {
    reporting: {
      catalog: async () => catalog,
      extract: async (value) => {
        const input = row(value) as unknown as ReportingInput;
        const source = input.source;
        const fields = input.fields;
        if (
          !delegates[source] ||
          fields.some((field) => !fieldNames(source).includes(field)) ||
          fields.some((field) => !reportingFieldSelects[source]?.[field])
        ) {
          throw new ServiceError(403, "Campo não publicado para relatórios.");
        }

        if (input.query && !inSnapshot) {
          return withReportingSnapshot(database, (transaction) => {
            const transactionReporting = reportingServices(transaction, true).reporting;
            if (!transactionReporting?.extract) {
              throw new ServiceError(500, "Serviço de relatórios indisponível.");
            }
            return transactionReporting.extract(input);
          });
        }

        if (input.query) {
          const directReporting = reportingServices(database, true).reporting;
          if (!directReporting?.extract) {
            throw new ServiceError(500, "Serviço de relatórios indisponível.");
          }
          return executeReportingQuery(
            { source, fields, limit: input.limit, query: input.query },
            async (queryFields, limit, offset) =>
              (await directReporting.extract({
                ...input,
                query: undefined,
                fields: queryFields,
                limit,
                offset,
              })) as { rows: readonly Row[]; reachedLimit: boolean },
          );
        }

        const select = Object.assign(
          {},
          ...fields.map((field) => reportingFieldSelects[source][field]),
        );
        const where: Row = { organization_id: input.organizationId };
        if (source === "ti.stock") {
          const departmentId = await technologyDepartment(database, input.organizationId);
          where.department_id = departmentId;
          if (fields.includes("category")) {
            where.category = {
              is: { organization_id: input.organizationId, department_id: departmentId },
            };
          }
          if (fields.includes("location")) {
            where.location = {
              is: { organization_id: input.organizationId, department_id: departmentId },
            };
          }
        }
        const rows = (await delegates[source].findMany({
          where,
          select,
          take: input.limit + 1,
          ...(input.offset === undefined ? {} : { skip: input.offset, orderBy: { id: "asc" } }),
        })) as Row[];
        return {
          rows: projectReportingRows(source, rows.slice(0, input.limit), fields),
          reachedLimit: rows.length > input.limit,
        };
      },
    },
  };
}

export function createTiDomainServices(database: TiDatabase, encryptionKey?: string): TiServices {
  return {
    ...inventoryServices(database),
    ...extensionServices(database),
    ...passwordServices(database, encryptionKey),
    ...requestServices(database),
    ...robotServices(database),
    ...termServices(database),
    ...dashboardServices(database),
    ...stockServices(database),
    ...reportingServices(database),
  };
}
