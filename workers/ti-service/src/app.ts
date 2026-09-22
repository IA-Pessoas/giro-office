import { type WorkerAuthContext, withWorkerPrisma } from "@workspace/runtime";
import { parseWithZod } from "@workspace/shared";
import {
  createSuccessResponse,
  REQUEST_ID_HEADER,
  ServiceError,
  serializeError,
} from "@workspace/shared/http";
import {
  createTiInventoryCategoryBodySchema,
  tiInventoryCategoryIdParamsSchema,
  updateTiInventoryCategoryBodySchema,
} from "@workspace/ti-service/src/schemas/tiInventoryCategory.schemas.js";
import type { Context } from "hono";
import { Hono } from "hono";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import { authenticateTiRequest, requireTiPermission } from "./auth.js";
import type { TiWorkerEnv } from "./env.js";
import { PrismaClient } from "./prisma.js";

type CategoryRow = Record<string, unknown> & { organization_id: string };
export type CategoryPrisma = {
  $queryRaw: (query: TemplateStringsArray, ...values: unknown[]) => Promise<unknown>;
  inventoryCategoryTecnologia: {
    findMany(args: Record<string, unknown>): Promise<CategoryRow[]>;
    findFirst(args: Record<string, unknown>): Promise<CategoryRow | null>;
    create(args: Record<string, unknown>): Promise<CategoryRow>;
    update(args: Record<string, unknown>): Promise<CategoryRow>;
  };
};

export type TiCategoryService = {
  list(organizationId: string): Promise<unknown>;
  create(organizationId: string, input: Record<string, unknown>): Promise<unknown>;
  update(organizationId: string, id: string, input: Record<string, unknown>): Promise<unknown>;
};

type TiOptions = {
  env?: TiWorkerEnv;
  prisma?: CategoryPrisma;
  categoryService?: TiCategoryService;
};
type TiWorkerContext = {
  Bindings: TiWorkerEnv;
  Variables: { auth: WorkerAuthContext };
};
type TiContext = Context<TiWorkerContext>;

function localService(prisma: CategoryPrisma): TiCategoryService {
  return {
    list: (organizationId) =>
      prisma.inventoryCategoryTecnologia.findMany({
        where: { organization_id: organizationId },
        orderBy: { name: "asc" },
      }),
    create: (organizationId, input) =>
      prisma.inventoryCategoryTecnologia.create({
        data: { ...input, organization_id: organizationId, active: true },
      }),
    async update(organizationId, id, input) {
      const existing = await prisma.inventoryCategoryTecnologia.findFirst({
        where: { id, organization_id: organizationId },
      });
      if (!existing) throw new ServiceError(404, "Categoria de inventário de TI não encontrada.");
      return prisma.inventoryCategoryTecnologia.update({ where: { id }, data: input });
    },
  };
}

export function createTiWorkerApp(options: TiOptions = {}) {
  const app = new Hono<TiWorkerContext>();
  app.get("/health", (c) => c.json(createSuccessResponse({ status: "ok", service: "ti-service" })));
  app.get("/ready", async (c) => {
    if (options.prisma) await options.prisma.$queryRaw`SELECT 1`;
    else
      await withWorkerPrisma(
        options.env ?? c.env,
        PrismaClient,
        async (client) => client.$queryRaw`SELECT 1`,
      );
    return c.json(createSuccessResponse({ status: "ready", service: "ti-service" }));
  });

  app.use("/ti/*", async (c, next) => {
    c.set("auth", await authenticateTiRequest(c.req.raw, options.env ?? c.env));
    await next();
  });
  app.use("/ti", async (c, next) => {
    c.set("auth", await authenticateTiRequest(c.req.raw, options.env ?? c.env));
    await next();
  });

  const withService = async <T>(
    c: TiContext,
    callback: (service: TiCategoryService) => Promise<T>,
  ) => {
    if (options.categoryService) return callback(options.categoryService);
    return withWorkerPrisma(options.env ?? c.env, PrismaClient, (client) =>
      callback(localService(client as unknown as CategoryPrisma)),
    );
  };

  app.get("/ti/inventory-categories/list", (c) =>
    withService(c, async (service) => {
      requireTiPermission(c.get("auth"), 2);
      return c.json(createSuccessResponse(await service.list(c.get("auth").organizationId)));
    }),
  );
  app.post("/ti/inventory-categories", async (c) =>
    withService(c, async (service) => {
      requireTiPermission(c.get("auth"), 3);
      const body = parseWithZod(createTiInventoryCategoryBodySchema, await c.req.json());
      return c.json(
        createSuccessResponse(await service.create(c.get("auth").organizationId, body)),
        201,
      );
    }),
  );
  app.patch("/ti/inventory-categories/:id", async (c) =>
    withService(c, async (service) => {
      requireTiPermission(c.get("auth"), 3);
      const params = parseWithZod(tiInventoryCategoryIdParamsSchema, { id: c.req.param("id") });
      const body = parseWithZod(updateTiInventoryCategoryBodySchema, await c.req.json());
      return c.json(
        createSuccessResponse(await service.update(c.get("auth").organizationId, params.id, body)),
      );
    }),
  );

  app.notFound((c) =>
    c.json({ success: false, error: "Recurso não encontrado.", code: "NOT_FOUND" }, 404),
  );
  app.onError((error, c) => {
    const serialized = serializeError(error, {
      requestId: c.req.header(REQUEST_ID_HEADER),
      fallbackMessage: "Erro interno no ti-service.",
    });
    return c.json(serialized.body, serialized.statusCode as ContentfulStatusCode);
  });
  return app;
}

export type { TiWorkerEnv } from "./env.js";
