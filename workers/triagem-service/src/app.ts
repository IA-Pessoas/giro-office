import { type WorkerAuthContext, withWorkerPrisma } from "@workspace/runtime";
import { parseWithZod } from "@workspace/shared";
import {
  createSuccessResponse,
  REQUEST_ID_HEADER,
  ServiceError,
  serializeError,
} from "@workspace/shared/http";
import {
  listTriageCompetenceHistoryQuerySchema,
  triageCompetenceHistoryParamsSchema,
} from "@workspace/triagem-service/src/schemas/triageAudit.schemas.js";
import {
  createTriageCatalogBodySchema,
  listTriageCatalogQuerySchema,
  triageCatalogIdParamsSchema,
  updateTriageCatalogBodySchema,
} from "@workspace/triagem-service/src/schemas/triageCatalog.schemas.js";
import {
  createTriageCompetenceBodySchema,
  listTriageCompetenceQuerySchema,
  triageCompetenceIdParamsSchema,
} from "@workspace/triagem-service/src/schemas/triageCompetence.schemas.js";
import {
  createTriageExternalLinkBodySchema,
  listTriageExternalLinkQuerySchema,
  triageExternalLinkIdParamsSchema,
  updateTriageExternalLinkBodySchema,
} from "@workspace/triagem-service/src/schemas/triageExternalLinks.schemas.js";
import { listTriageOverviewQuerySchema } from "@workspace/triagem-service/src/schemas/triageOverview.schemas.js";
import {
  closeTriageUrgentRequestBodySchema,
  createTriageUrgentRequestBodySchema,
  listTriageUrgentRequestQuerySchema,
  triageUrgentRequestIdParamsSchema,
  updateTriageUrgentRequestBodySchema,
} from "@workspace/triagem-service/src/schemas/triageUrgentRequest.schemas.js";
import { TriageAuditService } from "@workspace/triagem-service/src/services/triageAuditService.js";
import { TriageCatalogService as TriageCatalogServiceImpl } from "@workspace/triagem-service/src/services/triageCatalogService.js";
import { TriageCompetenceService } from "@workspace/triagem-service/src/services/triageCompetenceService.js";
import { TriageExternalLinkService } from "@workspace/triagem-service/src/services/triageExternalLinkService.js";
import { TriageOverviewService } from "@workspace/triagem-service/src/services/triageOverviewService.js";
import { TriageUrgentRequestService } from "@workspace/triagem-service/src/services/triageUrgentRequestService.js";
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
export type TriagemOverviewService = Pick<TriageOverviewService, "list">;
export type TriagemExternalLinkService = Pick<
  TriageExternalLinkService,
  "list" | "create" | "update" | "archive"
>;
export type TriagemCompetenceService = Pick<TriageCompetenceService, "list" | "create" | "archive">;
export type TriagemUrgentRequestService = Pick<
  TriageUrgentRequestService,
  "list" | "create" | "update" | "close" | "reopen"
>;
export type TriagemAuditService = Pick<TriageAuditService, "listTimeline" | "reconcile">;
type TriagemOptions = {
  env?: TriagemWorkerEnv;
  prisma?: TriagemCatalogPrisma;
  catalogService?: TriagemCatalogService;
  overviewService?: TriagemOverviewService;
  externalLinkService?: TriagemExternalLinkService;
  competenceService?: TriagemCompetenceService;
  urgentRequestService?: TriagemUrgentRequestService;
  auditService?: TriagemAuditService;
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

function authContext(auth: WorkerAuthContext) {
  return {
    userId: auth.userId,
    organizationId: auth.organizationId,
    permission: auth.claims.permission,
    modules: auth.claims.modules as Record<string, number> | undefined,
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
  const withOverviewService = async <T>(
    c: TriagemContext,
    callback: (service: TriagemOverviewService) => Promise<T>,
  ) => {
    if (options.overviewService) return callback(options.overviewService);
    return withWorkerPrisma(options.env ?? c.env, PrismaClient, (client) =>
      callback(new TriageOverviewService(client as never)),
    );
  };
  const withExternalLinkService = async <T>(
    c: TriagemContext,
    callback: (service: TriagemExternalLinkService) => Promise<T>,
  ) => {
    if (options.externalLinkService) return callback(options.externalLinkService);
    return withWorkerPrisma(options.env ?? c.env, PrismaClient, (client) =>
      callback(new TriageExternalLinkService(client as never)),
    );
  };
  const withCompetenceService = async <T>(
    c: TriagemContext,
    callback: (service: TriagemCompetenceService) => Promise<T>,
  ) => {
    if (options.competenceService) return callback(options.competenceService);
    return withWorkerPrisma(options.env ?? c.env, PrismaClient, (client) => {
      const prisma = client as never;
      const catalogService = new TriageCatalogServiceImpl(prisma);
      return callback(
        new TriageCompetenceService(
          prisma,
          undefined,
          (transaction, organizationId, competenceId) =>
            catalogService.snapshotForCompetence(organizationId, competenceId, transaction),
        ),
      );
    });
  };
  const withUrgentRequestService = async <T>(
    c: TriagemContext,
    callback: (service: TriagemUrgentRequestService) => Promise<T>,
  ) => {
    if (options.urgentRequestService) return callback(options.urgentRequestService);
    return withWorkerPrisma(options.env ?? c.env, PrismaClient, (client) =>
      callback(new TriageUrgentRequestService(client as never)),
    );
  };
  const withAuditService = async <T>(
    c: TriagemContext,
    callback: (service: TriagemAuditService) => Promise<T>,
  ) => {
    if (options.auditService) return callback(options.auditService);
    return withWorkerPrisma(options.env ?? c.env, PrismaClient, (client) =>
      callback(new TriageAuditService(client as never)),
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
  app.get("/triagem/overview", (c) =>
    withOverviewService(c, async (service) => {
      const query = parseWithZod(listTriageOverviewQuerySchema, c.req.query());
      return c.json(
        createSuccessResponse(
          await service.list(
            {
              page: query.page,
              pageSize: query.page_size,
              clientId: query.client_id,
              competence: query.competence,
              status: query.status,
            },
            authContext(c.get("auth")),
          ),
        ),
      );
    }),
  );
  app.get("/triagem/external-links", (c) =>
    withExternalLinkService(c, async (service) => {
      const query = parseWithZod(listTriageExternalLinkQuerySchema, c.req.query());
      return c.json(
        createSuccessResponse(
          await service.list(
            {
              clientId: query.client_id,
              competence: query.competence,
              includeArchived: query.include_archived,
            },
            authContext(c.get("auth")),
          ),
        ),
      );
    }),
  );
  app.post("/triagem/external-links", (c) =>
    withExternalLinkService(c, async (service) => {
      const body = parseWithZod(createTriageExternalLinkBodySchema, await c.req.json());
      return c.json(
        createSuccessResponse(await service.create(body, authContext(c.get("auth")))),
        201,
      );
    }),
  );
  app.put("/triagem/external-links/:id", (c) =>
    withExternalLinkService(c, async (service) => {
      const { id } = parseWithZod(triageExternalLinkIdParamsSchema, { id: c.req.param("id") });
      const body = parseWithZod(updateTriageExternalLinkBodySchema, await c.req.json());
      return c.json(
        createSuccessResponse(await service.update(id, body, authContext(c.get("auth")))),
      );
    }),
  );
  app.patch("/triagem/external-links/:id/archive", (c) =>
    withExternalLinkService(c, async (service) => {
      const { id } = parseWithZod(triageExternalLinkIdParamsSchema, { id: c.req.param("id") });
      return c.json(createSuccessResponse(await service.archive(id, authContext(c.get("auth")))));
    }),
  );
  app.get("/triagem/competencies", (c) =>
    withCompetenceService(c, async (service) => {
      const query = parseWithZod(listTriageCompetenceQuerySchema, c.req.query());
      return c.json(
        createSuccessResponse(
          await service.list(
            {
              clientId: query.client_id,
              competence: query.competence,
              includeArchived: query.include_archived,
            },
            authContext(c.get("auth")),
          ),
        ),
      );
    }),
  );
  app.post("/triagem/competencies", (c) =>
    withCompetenceService(c, async (service) => {
      const body = parseWithZod(createTriageCompetenceBodySchema, await c.req.json());
      return c.json(
        createSuccessResponse(await service.create(body, authContext(c.get("auth")))),
        201,
      );
    }),
  );
  app.patch("/triagem/competencies/:id/archive", (c) =>
    withCompetenceService(c, async (service) => {
      const { id } = parseWithZod(triageCompetenceIdParamsSchema, { id: c.req.param("id") });
      return c.json(createSuccessResponse(await service.archive(id, authContext(c.get("auth")))));
    }),
  );
  app.get("/triagem/urgent-requests", (c) =>
    withUrgentRequestService(c, async (service) => {
      const query = parseWithZod(listTriageUrgentRequestQuerySchema, c.req.query());
      return c.json(
        createSuccessResponse(
          await service.list(
            {
              clientId: query.client_id,
              competence: query.competence,
              status: query.status,
            },
            authContext(c.get("auth")),
          ),
        ),
      );
    }),
  );
  app.post("/triagem/urgent-requests", (c) =>
    withUrgentRequestService(c, async (service) => {
      const body = parseWithZod(createTriageUrgentRequestBodySchema, await c.req.json());
      return c.json(
        createSuccessResponse(await service.create(body, authContext(c.get("auth")))),
        201,
      );
    }),
  );
  app.put("/triagem/urgent-requests/:id", (c) =>
    withUrgentRequestService(c, async (service) => {
      const { id } = parseWithZod(triageUrgentRequestIdParamsSchema, { id: c.req.param("id") });
      const body = parseWithZod(updateTriageUrgentRequestBodySchema, await c.req.json());
      return c.json(
        createSuccessResponse(await service.update(id, body, authContext(c.get("auth")))),
      );
    }),
  );
  app.patch("/triagem/urgent-requests/:id/close", (c) =>
    withUrgentRequestService(c, async (service) => {
      const { id } = parseWithZod(triageUrgentRequestIdParamsSchema, { id: c.req.param("id") });
      const body = parseWithZod(closeTriageUrgentRequestBodySchema, await c.req.json());
      return c.json(
        createSuccessResponse(
          await service.close(id, body.resolution_note, authContext(c.get("auth"))),
        ),
      );
    }),
  );
  app.patch("/triagem/urgent-requests/:id/reopen", (c) =>
    withUrgentRequestService(c, async (service) => {
      const { id } = parseWithZod(triageUrgentRequestIdParamsSchema, { id: c.req.param("id") });
      return c.json(createSuccessResponse(await service.reopen(id, authContext(c.get("auth")))));
    }),
  );
  app.get("/triagem/competencies/:id/history", (c) =>
    withAuditService(c, async (service) => {
      const { id } = parseWithZod(triageCompetenceHistoryParamsSchema, { id: c.req.param("id") });
      const query = parseWithZod(listTriageCompetenceHistoryQuerySchema, c.req.query());
      return c.json(
        createSuccessResponse(
          await service.listTimeline(
            { competenceId: id, page: query.page, pageSize: query.page_size },
            authContext(c.get("auth")),
          ),
        ),
      );
    }),
  );
  app.use("/internal/triagem/*", async (c, next) => {
    c.set("auth", await authenticateTriagemRequest(c.req.raw, options.env ?? c.env));
    await next();
  });
  app.post("/internal/triagem/audit/reconcile", (c) =>
    withAuditService(c, async (service) => {
      const token = c.req.header("x-internal-service-token");
      if (!token) throw new ServiceError(401, "Token interno obrigatório.");
      if (token !== (options.env ?? c.env).INTERNAL_SERVICE_TOKEN) {
        throw new ServiceError(403, "Token interno inválido.");
      }
      return c.json(createSuccessResponse(await service.reconcile(authContext(c.get("auth")))));
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
