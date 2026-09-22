import { withWorkerPrisma } from "@workspace/runtime";
import {
  createSuccessResponse,
  REQUEST_ID_HEADER,
  ServiceError,
  serializeError,
} from "@workspace/shared/http";
import { Hono, type MiddlewareHandler } from "hono";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import { ZodError } from "zod";
import {
  permissionQuerySchema,
  permissionUserIdParamsSchema,
  updatePermissionBodySchema,
} from "../../../services/user-service/src/schemas/permission.schemas.js";
import {
  listPlatformUsersQuerySchema,
  platformOrganizationUsersParamsSchema,
} from "../../../services/user-service/src/schemas/platformUsers.schemas.js";
import {
  listUsersQuerySchema,
  userIdParamsSchema,
} from "../../../services/user-service/src/schemas/user.schemas.js";
import {
  ACTIVE_MODULE_KEYS,
  authenticatePlatformValidationRequest,
  authenticateUserRequest,
  type PlatformIdentity,
  requireCsrf,
  requireManageUsers,
  requireOrganizationAuth,
  requireOwner,
  type UserAuthContext,
  validatePlatformSession,
  validateUserSession,
} from "./auth.js";
import type { UserWorkerEnv } from "./env.js";
import { errorResponse } from "./errors.js";
import { PrismaClient } from "./generated/prisma/client.js";
import type { Row, UserPrismaClient } from "./types.js";

interface HonoEnv {
  Bindings: UserWorkerEnv;
  Variables: { auth: UserAuthContext; platformIdentity: PlatformIdentity };
}

interface UserWorkerOptions {
  env?: UserWorkerEnv;
  prisma?: UserPrismaClient;
}

function envOf(c: { env: UserWorkerEnv }, options: UserWorkerOptions): UserWorkerEnv {
  return options.env ?? c.env;
}

async function withDb<T>(
  c: { env: UserWorkerEnv },
  options: UserWorkerOptions,
  callback: (db: UserPrismaClient) => Promise<T>,
): Promise<T> {
  if (options.prisma) return callback(options.prisma);
  return withWorkerPrisma(
    envOf(c, options),
    PrismaClient as unknown as new (options: {
      adapter: unknown;
    }) => UserPrismaClient,
    callback,
  );
}

function parse<T>(schema: { parse(value: unknown): T }, value: unknown): T {
  try {
    return schema.parse(value);
  } catch (error) {
    if (error instanceof ZodError) {
      throw new ServiceError(400, error.issues[0]?.message ?? "Dados inválidos.");
    }
    throw error;
  }
}

async function jsonBody(c: { req: { json<T>(): Promise<T> } }): Promise<unknown> {
  try {
    return await c.req.json<unknown>();
  } catch {
    throw new ServiceError(400, "JSON inválido.");
  }
}

function userSelect() {
  return {
    id: true,
    name: true,
    login: true,
    permission: true,
    status: true,
    department_id: true,
    photo_url: true,
    joined_at: true,
    organization_id: true,
    type: true,
    first_owner_flag: true,
    permission_id: true,
    version: true,
  };
}

function modulesFrom(row: Row | null): Record<string, number> {
  return Object.fromEntries(ACTIVE_MODULE_KEYS.map((key) => [key, Number(row?.[key] ?? 0)]));
}

function toUser(row: Row, organizationId: string): Row {
  return { ...row, organization_id: row.organization_id ?? organizationId };
}

async function authFor(
  c: { req: { raw: Request }; env: UserWorkerEnv },
  options: UserWorkerOptions,
) {
  return authenticateUserRequest(c.req.raw, envOf(c, options));
}

async function requireUserDb(
  c: { req: { raw: Request }; env: UserWorkerEnv },
  options: UserWorkerOptions,
): Promise<{ auth: UserAuthContext; db: UserPrismaClient }> {
  const auth = await authFor(c, options);
  requireOrganizationAuth(auth);
  if (options.prisma) {
    await validateUserSession(auth, options.prisma);
    return { auth, db: options.prisma };
  }
  throw new ServiceError(503, "Banco de dados não configurado.");
}

export function createUserWorkerApp(options: UserWorkerOptions = {}) {
  const app = new Hono<HonoEnv>();

  app.get("/health", () =>
    Response.json(createSuccessResponse({ status: "ok", service: "user-service" })),
  );
  app.get("/ready", () =>
    Response.json(createSuccessResponse({ status: "ready", service: "user-service" })),
  );

  app.get("/user/session/validate", async (c) => {
    const auth = await authFor(c, options);
    if (c.req.header("x-internal-service-token") !== envOf(c, options).INTERNAL_SERVICE_TOKEN) {
      throw new ServiceError(403, "Acesso negado.");
    }
    return withDb(c, options, async (db) => {
      await validateUserSession(auth, db);
      return c.json(createSuccessResponse({ valid: true }));
    });
  });

  app.get("/user/me", async (c) =>
    withDb(c, options, async (db) => {
      const { auth } = await requireUserDb(c, { ...options, prisma: db });
      const row = await db.user.findFirst({
        where: { id: auth.userId, organization_id: auth.organizationId },
        select: userSelect(),
      });
      if (!row) throw new ServiceError(404, "Usuário não encontrado.");
      const permission = await db.permission.findFirst({
        where: { user_id: auth.userId, organization_id: auth.organizationId },
        select: Object.fromEntries(ACTIVE_MODULE_KEYS.map((key) => [key, true])),
      });
      const specific = await db.permissionSpecific.findFirst({
        where: { user_id: auth.userId, organization_id: auth.organizationId },
        select: { task_completion: true },
      });
      return c.json(
        createSuccessResponse({
          ...toUser(row, auth.organizationId),
          modules: modulesFrom(permission),
          task_completion: specific?.task_completion === true,
          service: "user-service",
        }),
      );
    }),
  );

  app.get("/user", async (c) =>
    withDb(c, options, async (db) => {
      const { auth } = await requireUserDb(c, { ...options, prisma: db });
      requireManageUsers(auth);
      const { skip, take } = parse(listUsersQuerySchema, c.req.query());
      const where = { organization_id: auth.organizationId };
      const [users, total] = await Promise.all([
        db.user.findMany({ where, select: userSelect(), skip, take, orderBy: { name: "asc" } }),
        db.user.count({ where }),
      ]);
      return c.json(createSuccessResponse({ users, total, skip, take }));
    }),
  );

  app.get("/user/:id", async (c) =>
    withDb(c, options, async (db) => {
      const { auth } = await requireUserDb(c, { ...options, prisma: db });
      requireManageUsers(auth);
      const { id } = parse(userIdParamsSchema, c.req.param());
      const row = await db.user.findFirst({
        where: { id, organization_id: auth.organizationId },
        select: userSelect(),
      });
      if (!row) throw new ServiceError(404, "Usuário não encontrado.");
      return c.json(createSuccessResponse(toUser(row, auth.organizationId)));
    }),
  );

  app.get("/user/permission/:userId", async (c) =>
    withDb(c, options, async (db) => {
      const { auth } = await requireUserDb(c, { ...options, prisma: db });
      requireManageUsers(auth);
      const { userId } = parse(permissionUserIdParamsSchema, c.req.param());
      const { modulo } = parse(permissionQuerySchema, c.req.query());
      const permission = await db.permission.findFirst({
        where: { user_id: userId, organization_id: auth.organizationId },
        select: Object.fromEntries(ACTIVE_MODULE_KEYS.map((key) => [key, true])),
      });
      if (!permission) throw new ServiceError(404, "Permissão não encontrada.");
      if (modulo && Number(permission[modulo] ?? 0) === 0) {
        throw new ServiceError(403, `Usuário sem acesso ao módulo '${modulo}'.`);
      }
      return c.json(createSuccessResponse(permission));
    }),
  );

  app.put("/user/permission/:userId", async (c) =>
    withDb(c, options, async (db) => {
      const { auth } = await requireUserDb(c, { ...options, prisma: db });
      requireOwner(auth);
      await requireCsrf(c.req.raw, auth);
      const { userId } = parse(permissionUserIdParamsSchema, c.req.param());
      const modules = parse(updatePermissionBodySchema, await jsonBody(c));
      const updated = await db.permission.updateMany({
        where: { user_id: userId, organization_id: auth.organizationId },
        data: modules,
      });
      if (updated.count !== 1) throw new ServiceError(404, "Permissão não encontrada.");
      await db.user.updateMany?.({
        where: { id: userId, organization_id: auth.organizationId },
        data: { session_version: { increment: 1 } },
      });
      const permission = await db.permission.findFirst({
        where: { user_id: userId, organization_id: auth.organizationId },
        select: Object.fromEntries(ACTIVE_MODULE_KEYS.map((key) => [key, true])),
      });
      return c.json(createSuccessResponse(permission));
    }),
  );

  app.get("/platform/me", async (c) =>
    withDb(c, options, async (db) => {
      const auth = await authFor(c, options);
      const identity = await validatePlatformSession(auth, db);
      return c.json(createSuccessResponse(identity));
    }),
  );

  const platformRead: MiddlewareHandler<HonoEnv> = async (c, next) => {
    const auth = await authFor(c, options);
    return withDb(c, options, async (db) => {
      const identity = await validatePlatformSession(auth, db);
      c.set("auth", auth);
      c.set("platformIdentity", identity);
      await next();
    });
  };
  app.get("/platform/organizations/:organizationId/departments", platformRead, async (c) =>
    withDb(c, options, async (db) => {
      const { organizationId } = parse(platformOrganizationUsersParamsSchema, c.req.param());
      const departments = await db.department.findMany({
        where: { organization_id: organizationId },
        select: { id: true, name: true },
        orderBy: { name: "asc" },
      });
      return c.json(createSuccessResponse(departments));
    }),
  );
  app.get("/platform/organizations/:organizationId/users", platformRead, async (c) =>
    withDb(c, options, async (db) => {
      const { organizationId } = parse(platformOrganizationUsersParamsSchema, c.req.param());
      const query = parse(listPlatformUsersQuerySchema, c.req.query());
      const search = query.search.trim();
      const where = {
        organization_id: organizationId,
        ...(search
          ? {
              OR: [
                { name: { contains: search, mode: "insensitive" } },
                { login: { contains: search, mode: "insensitive" } },
              ],
            }
          : {}),
      };
      const [users, total] = await Promise.all([
        db.user.findMany({
          where,
          select: userSelect(),
          skip: query.skip,
          take: query.take,
          orderBy: [{ name: "asc" }, { id: "asc" }],
        }),
        db.user.count({ where }),
      ]);
      return c.json(
        createSuccessResponse({ users, total, hasMore: query.skip + users.length < total }),
      );
    }),
  );

  app.post("/platform/session/validate", async (c) =>
    withDb(c, options, async (db) => {
      const auth = await authenticatePlatformValidationRequest(c.req.raw, envOf(c, options));
      await validatePlatformSession(auth, db);
      return c.json(createSuccessResponse({ valid: true }));
    }),
  );

  app.notFound(() => errorResponse(new ServiceError(404, "Recurso não encontrado.")));
  app.onError((error, c) => {
    const serialized = serializeError(error, {
      requestId: c.req.header(REQUEST_ID_HEADER),
      fallbackMessage: "Erro interno no user-service.",
    });
    return c.json(serialized.body, serialized.statusCode as ContentfulStatusCode);
  });
  return app;
}
