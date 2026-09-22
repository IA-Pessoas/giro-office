import { type WorkerAuthContext, withWorkerPrisma } from "@workspace/runtime";
import { parseWithZod } from "@workspace/shared";
import {
  createSuccessResponse,
  INTERNAL_SERVICE_TOKEN_HEADER,
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
import { TriageCatalogService } from "@workspace/triagem-service/src/services/triageCatalogService.js";
import { TriageCompetenceService } from "@workspace/triagem-service/src/services/triageCompetenceService.js";
import { TriageExternalLinkService } from "@workspace/triagem-service/src/services/triageExternalLinkService.js";
import { TriageOverviewService } from "@workspace/triagem-service/src/services/triageOverviewService.js";
import { TriageUrgentRequestService } from "@workspace/triagem-service/src/services/triageUrgentRequestService.js";
import type { Context } from "hono";
import { Hono } from "hono";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import { createTriageAuditDispatcher } from "./audit.js";
import { authenticateTriagemRequest, triagemAuthContext } from "./auth.js";
import type { TriagemWorkerEnv } from "./env.js";
import { PrismaClient } from "./prisma.js";

/** Cliente Prisma injetável nos testes; em runtime vem de HYPERDRIVE/DATABASE_URL. */
export type TriagemPrisma = {
  $queryRaw: (query: TemplateStringsArray, ...values: unknown[]) => Promise<unknown>;
};
export type TriagemCatalogService = Pick<
  TriageCatalogService,
  "list" | "create" | "update" | "archive"
>;
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
  prisma?: TriagemPrisma;
  catalogService?: TriagemCatalogService;
  overviewService?: TriagemOverviewService;
  externalLinkService?: TriagemExternalLinkService;
  competenceService?: TriagemCompetenceService;
  urgentRequestService?: TriagemUrgentRequestService;
  auditService?: TriagemAuditService;
};
type TriagemWorkerContext = {
  Bindings: TriagemWorkerEnv;
  Variables: { auth: WorkerAuthContext; requestId: string };
};
type TriagemContext = Context<TriagemWorkerContext>;

function requireDatabase(env: TriagemWorkerEnv): void {
  if (!env.HYPERDRIVE?.connectionString && !env.DATABASE_URL) {
    throw new ServiceError(
      503,
      "Banco de dados indisponível: configure o binding HYPERDRIVE ou o secret DATABASE_URL.",
    );
  }
}

async function jsonBody(c: TriagemContext): Promise<unknown> {
  try {
    return await c.req.json();
  } catch {
    throw new ServiceError(400, "JSON inválido.");
  }
}

const newCatalog = (prisma: never) => new TriageCatalogService(prisma);
const newOverview = (prisma: never) => new TriageOverviewService(prisma);
const newExternalLink = (prisma: never) => new TriageExternalLinkService(prisma);
const newUrgentRequest = (prisma: never) => new TriageUrgentRequestService(prisma);
const newAuditTimeline = (prisma: never) => new TriageAuditService(prisma);
const newAuditReconcile = (prisma: never, env: TriagemWorkerEnv) =>
  new TriageAuditService(prisma, createTriageAuditDispatcher(env));
const newCompetence = (prisma: never) => {
  const catalog = new TriageCatalogService(prisma);
  return new TriageCompetenceService(
    prisma,
    undefined,
    (transaction, organizationId, competenceId) =>
      catalog.snapshotForCompetence(organizationId, competenceId, transaction),
  );
};

export function createTriagemWorkerApp(options: TriagemOptions = {}) {
  const app = new Hono<TriagemWorkerContext>();
  const envOf = (c: TriagemContext) => options.env ?? c.env;

  // Serviço injetado (testes) > Prisma injetado (testes) > Prisma por HYPERDRIVE/DATABASE_URL.
  const run = <S, T>(
    c: TriagemContext,
    injected: S | undefined,
    make: (prisma: never, env: TriagemWorkerEnv) => S,
    callback: (service: S) => Promise<T>,
  ): Promise<T> => {
    const env = envOf(c);
    if (injected) return callback(injected);
    if (options.prisma) return callback(make(options.prisma as never, env));
    requireDatabase(env);
    return withWorkerPrisma(env, PrismaClient, (client) => callback(make(client as never, env)));
  };
  const auth = (c: TriagemContext) => triagemAuthContext(c.get("auth"));

  app.use("*", async (c, next) => {
    const requestId = c.req.header(REQUEST_ID_HEADER) ?? crypto.randomUUID();
    c.set("requestId", requestId);
    c.header(REQUEST_ID_HEADER, requestId);
    await next();
  });
  app.get("/health", (c) =>
    c.json(createSuccessResponse({ status: "ok", service: "triagem-service" })),
  );
  app.get("/ready", async (c) => {
    if (options.prisma) await options.prisma.$queryRaw`SELECT 1`;
    else {
      requireDatabase(envOf(c));
      await withWorkerPrisma(envOf(c), PrismaClient, (client) => client.$queryRaw`SELECT 1`);
    }
    return c.json(createSuccessResponse({ status: "ready", service: "triagem-service" }));
  });
  for (const path of ["/triagem", "/triagem/*", "/internal/triagem/*"]) {
    app.use(path, async (c, next) => {
      c.set("auth", await authenticateTriagemRequest(c.req.raw, envOf(c)));
      await next();
    });
  }

  app.get("/triagem/catalogs", (c) =>
    run(c, options.catalogService, newCatalog, async (service) => {
      const query = parseWithZod(listTriageCatalogQuerySchema, c.req.query());
      const input = {
        kind: query.kind,
        includeArchived: query.include_archived,
        clientId: query.client_id,
        competence: query.competence,
      };
      return c.json(createSuccessResponse(await service.list(input, auth(c))));
    }),
  );
  app.post("/triagem/catalogs", (c) =>
    run(c, options.catalogService, newCatalog, async (service) => {
      const body = parseWithZod(createTriageCatalogBodySchema, await jsonBody(c));
      return c.json(createSuccessResponse(await service.create(body, auth(c))), 201);
    }),
  );
  app.patch("/triagem/catalogs/:id", (c) =>
    run(c, options.catalogService, newCatalog, async (service) => {
      const { id } = parseWithZod(triageCatalogIdParamsSchema, { id: c.req.param("id") });
      const body = parseWithZod(updateTriageCatalogBodySchema, await jsonBody(c));
      return c.json(createSuccessResponse(await service.update(id, body, auth(c))));
    }),
  );
  app.patch("/triagem/catalogs/:id/archive", (c) =>
    run(c, options.catalogService, newCatalog, async (service) => {
      const { id } = parseWithZod(triageCatalogIdParamsSchema, { id: c.req.param("id") });
      return c.json(createSuccessResponse(await service.archive(id, auth(c))));
    }),
  );
  app.get("/triagem/overview", (c) =>
    run(c, options.overviewService, newOverview, async (service) => {
      const query = parseWithZod(listTriageOverviewQuerySchema, c.req.query());
      const input = {
        page: query.page,
        pageSize: query.page_size,
        clientId: query.client_id,
        competence: query.competence,
        status: query.status,
      };
      return c.json(createSuccessResponse(await service.list(input, auth(c))));
    }),
  );
  app.get("/triagem/external-links", (c) =>
    run(c, options.externalLinkService, newExternalLink, async (service) => {
      const query = parseWithZod(listTriageExternalLinkQuerySchema, c.req.query());
      const input = {
        clientId: query.client_id,
        competence: query.competence,
        includeArchived: query.include_archived,
      };
      return c.json(createSuccessResponse(await service.list(input, auth(c))));
    }),
  );
  app.post("/triagem/external-links", (c) =>
    run(c, options.externalLinkService, newExternalLink, async (service) => {
      const body = parseWithZod(createTriageExternalLinkBodySchema, await jsonBody(c));
      return c.json(createSuccessResponse(await service.create(body, auth(c))), 201);
    }),
  );
  app.put("/triagem/external-links/:id", (c) =>
    run(c, options.externalLinkService, newExternalLink, async (service) => {
      const { id } = parseWithZod(triageExternalLinkIdParamsSchema, { id: c.req.param("id") });
      const body = parseWithZod(updateTriageExternalLinkBodySchema, await jsonBody(c));
      return c.json(createSuccessResponse(await service.update(id, body, auth(c))));
    }),
  );
  app.patch("/triagem/external-links/:id/archive", (c) =>
    run(c, options.externalLinkService, newExternalLink, async (service) => {
      const { id } = parseWithZod(triageExternalLinkIdParamsSchema, { id: c.req.param("id") });
      return c.json(createSuccessResponse(await service.archive(id, auth(c))));
    }),
  );
  app.get("/triagem/competencies", (c) =>
    run(c, options.competenceService, newCompetence, async (service) => {
      const query = parseWithZod(listTriageCompetenceQuerySchema, c.req.query());
      const input = {
        clientId: query.client_id,
        competence: query.competence,
        includeArchived: query.include_archived,
      };
      return c.json(createSuccessResponse(await service.list(input, auth(c))));
    }),
  );
  app.post("/triagem/competencies", (c) =>
    run(c, options.competenceService, newCompetence, async (service) => {
      const body = parseWithZod(createTriageCompetenceBodySchema, await jsonBody(c));
      return c.json(createSuccessResponse(await service.create(body, auth(c))), 201);
    }),
  );
  app.patch("/triagem/competencies/:id/archive", (c) =>
    run(c, options.competenceService, newCompetence, async (service) => {
      const { id } = parseWithZod(triageCompetenceIdParamsSchema, { id: c.req.param("id") });
      return c.json(createSuccessResponse(await service.archive(id, auth(c))));
    }),
  );
  app.get("/triagem/competencies/:id/history", (c) =>
    run(c, options.auditService, newAuditTimeline, async (service) => {
      const { id } = parseWithZod(triageCompetenceHistoryParamsSchema, { id: c.req.param("id") });
      const query = parseWithZod(listTriageCompetenceHistoryQuerySchema, c.req.query());
      const input = { competenceId: id, page: query.page, pageSize: query.page_size };
      return c.json(createSuccessResponse(await service.listTimeline(input, auth(c))));
    }),
  );
  app.get("/triagem/urgent-requests", (c) =>
    run(c, options.urgentRequestService, newUrgentRequest, async (service) => {
      const query = parseWithZod(listTriageUrgentRequestQuerySchema, c.req.query());
      const input = {
        clientId: query.client_id,
        competence: query.competence,
        status: query.status,
      };
      return c.json(createSuccessResponse(await service.list(input, auth(c))));
    }),
  );
  app.post("/triagem/urgent-requests", (c) =>
    run(c, options.urgentRequestService, newUrgentRequest, async (service) => {
      const body = parseWithZod(createTriageUrgentRequestBodySchema, await jsonBody(c));
      return c.json(createSuccessResponse(await service.create(body, auth(c))), 201);
    }),
  );
  app.put("/triagem/urgent-requests/:id", (c) =>
    run(c, options.urgentRequestService, newUrgentRequest, async (service) => {
      const { id } = parseWithZod(triageUrgentRequestIdParamsSchema, { id: c.req.param("id") });
      const body = parseWithZod(updateTriageUrgentRequestBodySchema, await jsonBody(c));
      return c.json(createSuccessResponse(await service.update(id, body, auth(c))));
    }),
  );
  app.patch("/triagem/urgent-requests/:id/close", (c) =>
    run(c, options.urgentRequestService, newUrgentRequest, async (service) => {
      const { id } = parseWithZod(triageUrgentRequestIdParamsSchema, { id: c.req.param("id") });
      const body = parseWithZod(closeTriageUrgentRequestBodySchema, await jsonBody(c));
      return c.json(createSuccessResponse(await service.close(id, body.resolution_note, auth(c))));
    }),
  );
  app.patch("/triagem/urgent-requests/:id/reopen", (c) =>
    run(c, options.urgentRequestService, newUrgentRequest, async (service) => {
      const { id } = parseWithZod(triageUrgentRequestIdParamsSchema, { id: c.req.param("id") });
      return c.json(createSuccessResponse(await service.reopen(id, auth(c))));
    }),
  );
  app.post("/internal/triagem/audit/reconcile", (c) => {
    const token = c.req.header(INTERNAL_SERVICE_TOKEN_HEADER);
    if (!token) throw new ServiceError(401, "Token interno obrigatório.");
    if (token !== envOf(c).INTERNAL_SERVICE_TOKEN) {
      throw new ServiceError(403, "Token interno inválido.");
    }
    return run(c, options.auditService, newAuditReconcile, async (service) =>
      c.json(createSuccessResponse(await service.reconcile(auth(c)))),
    );
  });

  app.notFound((c) =>
    c.json({ success: false, error: "Recurso não encontrado.", code: "NOT_FOUND" }, 404),
  );
  app.onError((error, c) => {
    const serialized = serializeError(error, {
      requestId: c.get("requestId"),
      fallbackMessage: "Erro interno no triagem-service.",
    });
    return c.json(serialized.body, serialized.statusCode as ContentfulStatusCode);
  });
  return app;
}

export type { TriagemWorkerEnv } from "./env.js";
