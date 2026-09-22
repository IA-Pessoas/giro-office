import {
  createCategoryBodySchema,
  updateCategoryBodySchema,
} from "@workspace/rh-service/src/schemas/category.schemas.js";
import { type WorkerAuthContext, withWorkerPrisma } from "@workspace/runtime";
import { parseWithZod } from "@workspace/shared";
import {
  createSuccessResponse,
  REQUEST_ID_HEADER,
  ServiceError,
  serializeError,
} from "@workspace/shared/http";
import type { Context } from "hono";
import { Hono } from "hono";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import { authenticateRhRequest, requireRhPermission } from "./auth.js";
import type { RhWorkerEnv } from "./env.js";
import { PrismaClient } from "./prisma.js";

export type RhCategoryPrisma = {
  $queryRaw: (query: TemplateStringsArray, ...values: unknown[]) => Promise<unknown>;
  rhCategory: {
    findMany(args: Record<string, unknown>): Promise<unknown[]>;
    findFirst(args: Record<string, unknown>): Promise<Record<string, unknown> | null>;
    create(args: Record<string, unknown>): Promise<Record<string, unknown>>;
    update(args: Record<string, unknown>): Promise<Record<string, unknown>>;
  };
};
export type RhCategoryService = {
  list(organizationId: string, activeOnly: boolean): Promise<unknown>;
  create(organizationId: string, input: Record<string, unknown>): Promise<unknown>;
  update(organizationId: string, input: Record<string, unknown>): Promise<unknown>;
};
type RhOptions = {
  env?: RhWorkerEnv;
  prisma?: RhCategoryPrisma;
  categoryService?: RhCategoryService;
};
type RhWorkerContext = { Bindings: RhWorkerEnv; Variables: { auth: WorkerAuthContext } };
type RhContext = Context<RhWorkerContext>;

function localService(prisma: RhCategoryPrisma): RhCategoryService {
  return {
    list: (organizationId, activeOnly) =>
      prisma.rhCategory.findMany({
        where: { organization_id: organizationId, ...(activeOnly ? { active: true } : {}) },
        orderBy: { name: "asc" },
      }),
    async create(organizationId, input) {
      const duplicate = await prisma.rhCategory.findFirst({
        where: { organization_id: organizationId, name: input.name },
      });
      if (duplicate) throw new ServiceError(409, "Já existe uma categoria com este nome.");
      return prisma.rhCategory.create({ data: { ...input, organization_id: organizationId } });
    },
    async update(organizationId, input) {
      const existing = await prisma.rhCategory.findFirst({
        where: { id: input.id, organization_id: organizationId },
      });
      if (!existing) throw new ServiceError(404, "Categoria não encontrada.");
      return prisma.rhCategory.update({ where: { id: input.id }, data: input });
    },
  };
}

export function createRhWorkerApp(options: RhOptions = {}) {
  const app = new Hono<RhWorkerContext>();
  app.get("/health", (c) => c.json(createSuccessResponse({ status: "ok", service: "rh-service" })));
  app.get("/ready", async (c) => {
    if (options.prisma) await options.prisma.$queryRaw`SELECT 1`;
    else
      await withWorkerPrisma(
        options.env ?? c.env,
        PrismaClient,
        async (client) => client.$queryRaw`SELECT 1`,
      );
    return c.json(createSuccessResponse({ status: "ready", service: "rh-service" }));
  });
  app.use("/rh/*", async (c, next) => {
    c.set("auth", await authenticateRhRequest(c.req.raw, options.env ?? c.env));
    await next();
  });
  app.use("/rh", async (c, next) => {
    c.set("auth", await authenticateRhRequest(c.req.raw, options.env ?? c.env));
    await next();
  });
  const withService = async <T>(
    c: RhContext,
    callback: (service: RhCategoryService) => Promise<T>,
  ) => {
    if (options.categoryService) return callback(options.categoryService);
    return withWorkerPrisma(options.env ?? c.env, PrismaClient, (client) =>
      callback(localService(client as unknown as RhCategoryPrisma)),
    );
  };
  app.get("/rh/categories", (c) =>
    withService(c, async (service) => {
      requireRhPermission(c.get("auth"), 1);
      const activeOnly = c.req.query("activeOnly") === "true";
      return c.json(
        createSuccessResponse(await service.list(c.get("auth").organizationId, activeOnly)),
      );
    }),
  );
  app.post("/rh/categories", (c) =>
    withService(c, async (service) => {
      requireRhPermission(c.get("auth"), 3);
      const body = parseWithZod(createCategoryBodySchema, await c.req.json());
      return c.json(
        createSuccessResponse(await service.create(c.get("auth").organizationId, body)),
        200,
      );
    }),
  );
  app.put("/rh/categories", (c) =>
    withService(c, async (service) => {
      requireRhPermission(c.get("auth"), 3);
      const body = parseWithZod(updateCategoryBodySchema, await c.req.json());
      return c.json(
        createSuccessResponse(await service.update(c.get("auth").organizationId, body)),
      );
    }),
  );
  app.notFound((c) =>
    c.json({ success: false, error: "Recurso não encontrado.", code: "NOT_FOUND" }, 404),
  );
  app.onError((error, c) => {
    const serialized = serializeError(error, {
      requestId: c.req.header(REQUEST_ID_HEADER),
      fallbackMessage: "Erro interno no rh-service.",
    });
    return c.json(serialized.body, serialized.statusCode as ContentfulStatusCode);
  });
  return app;
}

export type { RhWorkerEnv } from "./env.js";
