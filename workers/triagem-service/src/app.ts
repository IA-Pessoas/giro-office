import { type WorkerAuthContext, withWorkerPrisma } from "@workspace/runtime";
import { parseWithZod } from "@workspace/shared";
import {
  createSuccessResponse,
  REQUEST_ID_HEADER,
  ServiceError,
  serializeError,
} from "@workspace/shared/http";
import {
  createTriageCatalogBodySchema,
  listTriageCatalogQuerySchema,
  triageCatalogIdParamsSchema,
  updateTriageCatalogBodySchema,
} from "@workspace/triagem-service/src/schemas/triageCatalog.schemas.js";
import type { Context } from "hono";
import { Hono } from "hono";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import { authenticateTriagemRequest, requireTriagemPermission } from "./auth.js";
import type { TriagemWorkerEnv } from "./env.js";
import { PrismaClient } from "./prisma.js";

type CatalogRow = Record<string, unknown> & { organization_id: string };
export type TriagemCatalogPrisma = {
  $queryRaw: (query: TemplateStringsArray, ...values: unknown[]) => Promise<unknown>;
  triageCatalogItem: {
    findMany(args: Record<string, unknown>): Promise<CatalogRow[]>;
    findFirst(args: Record<string, unknown>): Promise<CatalogRow | null>;
    create(args: Record<string, unknown>): Promise<CatalogRow>;
    update(args: Record<string, unknown>): Promise<CatalogRow>;
  };
};
export type TriagemCatalogService = {
  list(organizationId: string, input: Record<string, unknown>): Promise<unknown>;
  create(organizationId: string, input: Record<string, unknown>): Promise<unknown>;
  update(organizationId: string, id: string, input: Record<string, unknown>): Promise<unknown>;
  archive(organizationId: string, id: string): Promise<unknown>;
};
type TriagemOptions = {
  env?: TriagemWorkerEnv;
  prisma?: TriagemCatalogPrisma;
  catalogService?: TriagemCatalogService;
};
type TriagemWorkerContext = { Bindings: TriagemWorkerEnv; Variables: { auth: WorkerAuthContext } };
type TriagemContext = Context<TriagemWorkerContext>;

function dto(row: CatalogRow): Record<string, unknown> {
  const { organization_id: _organizationId, ...data } = row;
  return data;
}

function localService(prisma: TriagemCatalogPrisma): TriagemCatalogService {
  return {
    list: async (organizationId, input) => {
      const where = {
        organization_id: organizationId,
        ...(input.kind ? { kind: input.kind } : {}),
        ...(input.includeArchived ? {} : { archived_at: null }),
      };
      const rows = await prisma.triageCatalogItem.findMany({
        where,
        orderBy: [{ kind: "asc" }, { label: "asc" }, { code: "asc" }],
      });
      return rows.map(dto);
    },
    async create(organizationId, input) {
      const duplicate = await prisma.triageCatalogItem.findFirst({
        where: { organization_id: organizationId, kind: input.kind, code: input.code },
      });
      if (duplicate) throw new ServiceError(409, "Já existe um item com este código no catálogo.");
      return dto(
        await prisma.triageCatalogItem.create({
          data: { ...input, organization_id: organizationId },
        }),
      );
    },
    async update(organizationId, id, input) {
      const existing = await prisma.triageCatalogItem.findFirst({
        where: { id, organization_id: organizationId },
      });
      if (!existing) throw new ServiceError(404, "Item de catálogo não encontrado.");
      return dto(await prisma.triageCatalogItem.update({ where: { id }, data: input }));
    },
    async archive(organizationId, id) {
      const existing = await prisma.triageCatalogItem.findFirst({
        where: { id, organization_id: organizationId },
      });
      if (!existing) throw new ServiceError(404, "Item de catálogo não encontrado.");
      return dto(
        await prisma.triageCatalogItem.update({
          where: { id },
          data: { archived_at: new Date() },
        }),
      );
    },
  };
}

export function createTriagemWorkerApp(options: TriagemOptions = {}) {
  const app = new Hono<TriagemWorkerContext>();
  app.get("/health", (c) =>
    c.json(createSuccessResponse({ status: "ok", service: "triagem-service" })),
  );
  app.get("/ready", async (c) => {
    if (options.prisma) await options.prisma.$queryRaw`SELECT 1`;
    else
      await withWorkerPrisma(
        options.env ?? c.env,
        PrismaClient,
        async (client) => client.$queryRaw`SELECT 1`,
      );
    return c.json(createSuccessResponse({ status: "ready", service: "triagem-service" }));
  });
  app.use("/triagem/*", async (c, next) => {
    c.set("auth", await authenticateTriagemRequest(c.req.raw, options.env ?? c.env));
    await next();
  });
  app.use("/triagem", async (c, next) => {
    c.set("auth", await authenticateTriagemRequest(c.req.raw, options.env ?? c.env));
    await next();
  });
  const withService = async <T>(
    c: TriagemContext,
    callback: (service: TriagemCatalogService) => Promise<T>,
  ) => {
    if (options.catalogService) return callback(options.catalogService);
    return withWorkerPrisma(options.env ?? c.env, PrismaClient, (client) =>
      callback(localService(client as unknown as TriagemCatalogPrisma)),
    );
  };
  app.get("/triagem/catalogs", (c) =>
    withService(c, async (service) => {
      requireTriagemPermission(c.get("auth"), 1);
      const query = parseWithZod(listTriageCatalogQuerySchema, c.req.query());
      return c.json(createSuccessResponse(await service.list(c.get("auth").organizationId, query)));
    }),
  );
  app.post("/triagem/catalogs", (c) =>
    withService(c, async (service) => {
      requireTriagemPermission(c.get("auth"), 2);
      const body = parseWithZod(createTriageCatalogBodySchema, await c.req.json());
      return c.json(
        createSuccessResponse(await service.create(c.get("auth").organizationId, body)),
        201,
      );
    }),
  );
  app.patch("/triagem/catalogs/:id", (c) =>
    withService(c, async (service) => {
      requireTriagemPermission(c.get("auth"), 2);
      const { id } = parseWithZod(triageCatalogIdParamsSchema, { id: c.req.param("id") });
      const body = parseWithZod(updateTriageCatalogBodySchema, await c.req.json());
      return c.json(
        createSuccessResponse(await service.update(c.get("auth").organizationId, id, body)),
      );
    }),
  );
  app.patch("/triagem/catalogs/:id/archive", (c) =>
    withService(c, async (service) => {
      requireTriagemPermission(c.get("auth"), 2);
      const { id } = parseWithZod(triageCatalogIdParamsSchema, { id: c.req.param("id") });
      return c.json(createSuccessResponse(await service.archive(c.get("auth").organizationId, id)));
    }),
  );
  app.notFound((c) =>
    c.json({ success: false, error: "Recurso não encontrado.", code: "NOT_FOUND" }, 404),
  );
  app.onError((error, c) => {
    const serialized = serializeError(error, {
      requestId: c.req.header(REQUEST_ID_HEADER),
      fallbackMessage: "Erro interno no triagem-service.",
    });
    return c.json(serialized.body, serialized.statusCode as ContentfulStatusCode);
  });
  return app;
}

export type { TriagemWorkerEnv } from "./env.js";
