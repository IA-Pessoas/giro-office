import {
  authenticateWorkerRequest,
  type WorkerAuthContext,
  WorkerAuthenticationError,
} from "@workspace/runtime";
import {
  createSuccessResponse,
  REQUEST_ID_HEADER,
  ServiceError,
  serializeError,
} from "@workspace/shared";
import type { Context, MiddlewareHandler } from "hono";
import { Hono } from "hono";
import { ZodError } from "zod";
import type { SourceCatalogService } from "../../../services/reports-service/src/catalog/sourceCatalogService.js";
import { validateReportDefinitionBodySchema } from "../../../services/reports-service/src/schemas/reportComposition.schemas.js";
import { ReportDefinitionService } from "../../../services/reports-service/src/services/reportDefinitionService.js";
import { createReportsSourceCatalog } from "./catalog.js";
import type { ReportsWorkerEnv } from "./env.js";
import { checkReportsDatabase, type ReportsPrismaClient } from "./prisma.js";

interface ReportsWorkerOptions {
  env?: ReportsWorkerEnv;
  prisma?: Pick<ReportsPrismaClient, "$queryRaw">;
  sourceCatalog?: SourceCatalogService;
}

type ReportsWorkerVariables = { auth: WorkerAuthContext };
type ReportsContext = Context<{
  Bindings: ReportsWorkerEnv;
  Variables: ReportsWorkerVariables;
}>;

function parse<T>(schema: { parse: (value: unknown) => T }, value: unknown): T {
  try {
    return schema.parse(value);
  } catch (error) {
    if (error instanceof ZodError) {
      throw new ServiceError(400, error.issues[0]?.message ?? "Dados inválidos.");
    }
    throw error;
  }
}

async function jsonBody(c: ReportsContext): Promise<unknown> {
  try {
    return await c.req.json<unknown>();
  } catch {
    throw new ServiceError(400, "JSON inválido.");
  }
}

function jsonError(error: unknown, requestId?: string): Response {
  const serialized = serializeError(error, {
    requestId,
    fallbackMessage: "Erro interno no reports-service.",
  });
  return new Response(JSON.stringify(serialized.body), {
    status: serialized.statusCode,
    headers: { "content-type": "application/json; charset=UTF-8" },
  });
}

function requireOrganizationAuth(options: ReportsWorkerOptions): MiddlewareHandler<{
  Bindings: ReportsWorkerEnv;
  Variables: ReportsWorkerVariables;
}> {
  return async (c, next) => {
    const env = options.env ?? c.env;
    let auth: WorkerAuthContext;
    try {
      auth = await authenticateWorkerRequest(c.req.raw, {
        jwtSecret: env.JWT_SECRET,
        allowBearer: true,
      });
    } catch (error) {
      if (error instanceof WorkerAuthenticationError) {
        throw new ServiceError(401, "Não autenticado.");
      }
      throw error;
    }
    if (auth.actorKind !== "organization" || !auth.organizationId) {
      throw new ServiceError(403, "A organização do relatório não está autorizada.");
    }
    c.set("auth", auth);
    await next();
  };
}

function scopeFor(auth: WorkerAuthContext) {
  return { organization_id: auth.organizationId, modules: auth.claims.modules };
}

export function createReportsWorkerApp(options: ReportsWorkerOptions = {}) {
  const app = new Hono<{
    Bindings: ReportsWorkerEnv;
    Variables: ReportsWorkerVariables;
  }>();
  const sourceCatalog = options.sourceCatalog ?? createReportsSourceCatalog();
  const definitionService = new ReportDefinitionService(sourceCatalog);
  const organizationAuth = requireOrganizationAuth(options);

  app.get("/health", (c) =>
    c.json(
      createSuccessResponse({
        status: "ok",
        service: "reports-service",
        env: (options.env ?? c.env).NODE_ENV ?? "production",
      }),
    ),
  );

  app.get("/ready", async (c) => {
    await checkReportsDatabase(options.env ?? c.env, options.prisma);
    return c.json(createSuccessResponse({ status: "ready", service: "reports-service" }));
  });

  app.use("/reports", organizationAuth);
  app.use("/reports/*", organizationAuth);

  app.get("/reports/catalog", (c) => {
    const catalog = sourceCatalog.getAuthorizedCatalog(scopeFor(c.get("auth")));
    return c.json(createSuccessResponse({ items: catalog.sources }));
  });

  app.post("/reports/definitions/validate", async (c) => {
    const body = parse(validateReportDefinitionBodySchema, await jsonBody(c));
    const scope = scopeFor(c.get("auth"));
    const definition =
      "version" in body.definition
        ? definitionService.validateComposition(body.definition, scope)
        : definitionService.validate(body.definition, scope).definition;
    return c.json(createSuccessResponse({ definition }));
  });

  app.onError((error, c) => jsonError(error, c.req.header(REQUEST_ID_HEADER)));
  app.notFound((c) =>
    jsonError(new ServiceError(404, "Recurso não encontrado."), c.req.header(REQUEST_ID_HEADER)),
  );

  const request = app.request.bind(app);
  app.request = ((input: RequestInfo | URL, init?: RequestInit, requestEnv?: unknown) =>
    request(input, init, requestEnv ?? options.env)) as typeof app.request;
  return app;
}
