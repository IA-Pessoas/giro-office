import type { WorkerAuthContext } from "@workspace/runtime";
import { zodIssueMessage } from "@workspace/shared/schemas";
import type { MiddlewareHandler } from "hono";
import { Hono } from "hono";
import { ZodError } from "zod";
import { buildOrganizationServiceOpenApiSpec } from "../../../services/organization-service/src/openapi/spec.js";
import type { PlatformIdentity } from "./auth.js";
import {
  AUTH_CONTEXT,
  requireOrganizationAuth,
  requirePlatformCsrf,
  requirePlatformSession,
} from "./auth.js";
import { errorResponse, OrganizationWorkerError, successResponse } from "./errors.js";
import { OrganizationService } from "./organizationService.js";
import { createOrganizationPrisma } from "./prisma.js";
import {
  createOrganizationBodySchema,
  createPlatformOrganizationBodySchema,
  listOrganizationsQuerySchema,
  listPlatformOrganizationsQuerySchema,
  organizationIdParamsSchema,
  platformOrganizationIdParamsSchema,
  updateOrganizationLogoUrlBodySchema,
  updateOrganizationStatusBodySchema,
  updateOrganizationSubscriptionPlanBodySchema,
  updatePlatformOrganizationLogoUrlBodySchema,
  updatePlatformOrganizationStatusBodySchema,
  updatePlatformOrganizationSubscriptionPlanBodySchema,
} from "./schemas.js";
import type {
  OrganizationAuditEvent,
  OrganizationAuditRecorder,
  OrganizationPrismaClient,
  OrganizationWorkerEnv,
} from "./types.js";

interface ServiceContext {
  service: OrganizationService;
  prisma: OrganizationPrismaClient;
  disconnect: boolean;
}

interface OrganizationWorkerOptions {
  env: OrganizationWorkerEnv;
  service?: OrganizationService;
  prisma?: OrganizationPrismaClient;
}

interface HonoEnv {
  Bindings: OrganizationWorkerEnv;
  Variables: Record<string, unknown> & {
    auth: WorkerAuthContext;
    platformIdentity: PlatformIdentity;
    serviceContext: ServiceContext;
  };
}

/**
 * As rotas /organizations recebem o id pela URL; sem esta checagem qualquer usuário
 * autenticado lia e alterava outra organização. Id alheio responde 404 (não revela se existe).
 */
function ownOrganizationAuth(c: { get(key: string): unknown }, id: string): WorkerAuthContext {
  const auth = c.get(AUTH_CONTEXT) as WorkerAuthContext | undefined;
  if (!auth || id !== auth.organizationId) {
    throw new OrganizationWorkerError(404, "Organização não encontrada.");
  }
  return auth;
}

/** Suspender a organização ou trocar o plano (cobrança) é decisão do owner. */
function requireOwner(auth: WorkerAuthContext): void {
  if (auth.claims.type !== "owner") {
    throw new OrganizationWorkerError(
      403,
      "Apenas o owner da organização pode fazer esta alteração.",
    );
  }
}

function parse<T>(schema: { parse: (value: unknown) => T }, value: unknown): T {
  try {
    return schema.parse(value);
  } catch (error) {
    if (error instanceof ZodError) {
      throw new OrganizationWorkerError(400, zodIssueMessage(error));
    }
    throw error;
  }
}

async function jsonBody(c: { req: { json: <T>() => Promise<T> } }): Promise<unknown> {
  try {
    return await c.req.json();
  } catch {
    throw new OrganizationWorkerError(400, "JSON inválido.");
  }
}

function queryRecord(c: { req: { query: () => Record<string, string> } }): Record<string, string> {
  return c.req.query();
}

function isEnabled(value: string | undefined): boolean {
  return value !== "false" && value !== "0";
}

function createAuditRecorder(env: OrganizationWorkerEnv): OrganizationAuditRecorder | undefined {
  const auditService = env.AUDIT_SERVICE;
  if (!isEnabled(env.ORGANIZATION_DOMAIN_AUDIT_ENABLED) || !auditService) return undefined;

  return async (event: OrganizationAuditEvent) => {
    const now = new Date().toISOString();
    const response = await auditService.fetch(
      new Request("https://audit-service/internal/audit/requests", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-internal-service-token": env.INTERNAL_SERVICE_TOKEN,
        },
        body: JSON.stringify({
          requestId: crypto.randomUUID(),
          organizationId: event.organizationId,
          userId: null,
          method: "ENTITY_CHANGE",
          path: `/platform/organizations/${event.organizationId}`,
          outcome: "success",
          serviceSource: "organization-service",
          createdAt: now,
          finishedAt: now,
          metadata: { actorPlatformUserId: event.actorPlatformUserId },
          action: event.action,
          referring: "organization",
          referringId: event.organizationId,
          changes: event.changes,
        }),
      }),
    );
    if (!response.ok) throw new Error("Audit persistence unavailable");
  };
}

async function resolveService(
  c: {
    env: OrganizationWorkerEnv;
    get: (key: "serviceContext") => ServiceContext | undefined;
    set: (key: "serviceContext", value: ServiceContext) => void;
  },
  options: OrganizationWorkerOptions,
): Promise<ServiceContext> {
  const current = c.get("serviceContext");
  if (current) return current;

  if (options.service && options.prisma) {
    const context = { service: options.service, prisma: options.prisma, disconnect: false };
    c.set("serviceContext", context);
    return context;
  }

  const prisma = options.prisma ?? createOrganizationPrisma(c.env);
  const service = new OrganizationService(prisma, {
    prisma,
    recordAudit: createAuditRecorder(c.env),
  });
  const context = { service, prisma, disconnect: !options.prisma };
  c.set("serviceContext", context);
  return context;
}

function secureHeaders(env: OrganizationWorkerEnv): MiddlewareHandler<HonoEnv> {
  return async (c, next) => {
    c.header("Cross-Origin-Opener-Policy", "same-origin");
    c.header("Cross-Origin-Resource-Policy", "same-origin");
    c.header("Origin-Agent-Cluster", "?1");
    c.header("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
    c.header("Referrer-Policy", "no-referrer");
    c.header("X-Content-Type-Options", "nosniff");
    c.header("X-DNS-Prefetch-Control", "off");
    c.header("X-Frame-Options", "DENY");
    if (env.NODE_ENV === "production") {
      c.header("Strict-Transport-Security", "max-age=15552000; includeSubDomains");
    }
    await next();
  };
}

function cors(env: OrganizationWorkerEnv): MiddlewareHandler<HonoEnv> {
  const allowed = (env.SERVICE_ALLOWED_ORIGINS ?? "*").split(",").map((value) => value.trim());
  return async (c, next) => {
    const origin = c.req.header("origin");
    if (origin && !allowed.includes("*") && !allowed.includes(origin)) {
      throw new OrganizationWorkerError(403, "Origin não permitida pelo organization-service.");
    }
    if (origin) {
      c.header("access-control-allow-origin", allowed.includes("*") ? "*" : origin);
      c.header("access-control-allow-credentials", "true");
      c.header("access-control-allow-methods", "GET,HEAD,PUT,PATCH,POST,DELETE");
      c.header(
        "access-control-allow-headers",
        "Content-Type, Authorization, Idempotency-Key, x-request-id, x-csrf-token",
      );
    }
    if (c.req.method === "OPTIONS") return c.body(null, 204);
    await next();
  };
}

export function createOrganizationWorkerApp(options: OrganizationWorkerOptions) {
  const app = new Hono<HonoEnv>();
  app.use("*", secureHeaders(options.env));
  app.use("*", cors(options.env));
  const organizationAuth: MiddlewareHandler<HonoEnv> = async (c, next) => {
    await requireOrganizationAuth(c, next);
  };
  app.use("/organizations", organizationAuth);
  app.use("/organizations/*", organizationAuth);
  app.use("/organizations", async (c, next) => {
    await resolveService(c, options);
    await next();
  });
  app.use("/organizations/*", async (c, next) => {
    await resolveService(c, options);
    await next();
  });
  app.use("/platform/*", async (c, next) => {
    await resolveService(c, options);
    await next();
  });

  app.get("/health", (_c) => successResponse({ status: "ok", service: "organization-service" }));
  app.get("/ready", (_c) => successResponse({ status: "ready", service: "organization-service" }));

  const platformAuth: MiddlewareHandler<HonoEnv> = async (c, next) => {
    const context = c.get("serviceContext");
    if (!context) throw new OrganizationWorkerError(503, "Banco de dados não configurado.");
    await requirePlatformSession(c, context.prisma, next);
  };
  app.use("/platform/organizations", platformAuth);
  app.use("/platform/organizations/*", platformAuth);

  const platformMutationAuth: MiddlewareHandler<HonoEnv> = async (c, next) => {
    await requirePlatformCsrf(c, next);
  };
  app.use("/platform/organizations", async (c, next) => {
    if (c.req.method === "POST") return platformMutationAuth(c, next);
    return next();
  });
  app.use("/platform/organizations/*", async (c, next) => {
    if (c.req.method === "PATCH") return platformMutationAuth(c, next);
    return next();
  });

  const service = (c: HonoEnv["Variables"]["serviceContext"]) => c.service;
  const organizationRoutes = (path: string) => {
    app.get(path, async (c) => {
      const query = parse(listOrganizationsQuerySchema, queryRecord(c));
      const auth = c.get(AUTH_CONTEXT) as WorkerAuthContext;
      return successResponse(
        await service(c.get("serviceContext")).list(query, auth.organizationId),
      );
    });
    app.post(path, async (c) => {
      const body = parse(createOrganizationBodySchema, await jsonBody(c));
      return successResponse(await service(c.get("serviceContext")).create(body), 201);
    });
  };
  organizationRoutes("/organizations");
  organizationRoutes("/organizations/");

  app.get("/organizations/:id", async (c) => {
    const params = parse(organizationIdParamsSchema, c.req.param());
    ownOrganizationAuth(c, params.id);
    return successResponse(await service(c.get("serviceContext")).findById(params.id));
  });
  app.patch("/organizations/:id/status", async (c) => {
    const params = parse(organizationIdParamsSchema, c.req.param());
    requireOwner(ownOrganizationAuth(c, params.id));
    const body = parse(updateOrganizationStatusBodySchema, await jsonBody(c));
    return successResponse(
      await service(c.get("serviceContext")).updateStatus(params.id, body.status),
    );
  });
  app.patch("/organizations/:id/subscription-plan", async (c) => {
    const params = parse(organizationIdParamsSchema, c.req.param());
    requireOwner(ownOrganizationAuth(c, params.id));
    const body = parse(updateOrganizationSubscriptionPlanBodySchema, await jsonBody(c));
    return successResponse(
      await service(c.get("serviceContext")).updateSubscriptionPlan(
        params.id,
        body.subscription_plan,
      ),
    );
  });
  app.patch("/organizations/:id/logo-url", async (c) => {
    const params = parse(organizationIdParamsSchema, c.req.param());
    ownOrganizationAuth(c, params.id);
    const body = parse(updateOrganizationLogoUrlBodySchema, await jsonBody(c));
    return successResponse(
      await service(c.get("serviceContext")).updateLogoUrl(params.id, body.logo_url),
    );
  });

  app.get("/platform/organizations", async (c) => {
    const query = parse(listPlatformOrganizationsQuerySchema, queryRecord(c));
    return successResponse(await service(c.get("serviceContext")).listPlatform(query));
  });
  app.post("/platform/organizations", async (c) => {
    const body = parse(createPlatformOrganizationBodySchema, await jsonBody(c));
    const identity = c.get("platformIdentity");
    if (!identity) throw new OrganizationWorkerError(401, "Não autenticado.");
    return successResponse(
      await service(c.get("serviceContext")).createPlatform({
        name: body.name,
        cnpj: body.cnpj,
        emailCreatedBy: identity.email,
        actorPlatformUserId: identity.id,
      }),
      201,
    );
  });
  app.get("/platform/organizations/:id", async (c) => {
    const params = parse(platformOrganizationIdParamsSchema, c.req.param());
    return successResponse(await service(c.get("serviceContext")).findPlatformById(params.id));
  });
  app.patch("/platform/organizations/:id/status", async (c) => {
    const params = parse(platformOrganizationIdParamsSchema, c.req.param());
    const body = parse(updatePlatformOrganizationStatusBodySchema, await jsonBody(c));
    const identity = c.get("platformIdentity");
    if (!identity) throw new OrganizationWorkerError(401, "Não autenticado.");
    return successResponse(
      await service(c.get("serviceContext")).updatePlatformStatus({
        id: params.id,
        status: body.status,
        expectedUpdatedAt: body.expected_updated_at,
        actorPlatformUserId: identity.id,
      }),
    );
  });
  app.patch("/platform/organizations/:id/subscription-plan", async (c) => {
    const params = parse(platformOrganizationIdParamsSchema, c.req.param());
    const body = parse(updatePlatformOrganizationSubscriptionPlanBodySchema, await jsonBody(c));
    const identity = c.get("platformIdentity");
    if (!identity) throw new OrganizationWorkerError(401, "Não autenticado.");
    return successResponse(
      await service(c.get("serviceContext")).updatePlatformSubscriptionPlan({
        id: params.id,
        subscriptionPlan: body.subscription_plan,
        expectedUpdatedAt: body.expected_updated_at,
        actorPlatformUserId: identity.id,
      }),
    );
  });
  app.patch("/platform/organizations/:id/logo-url", async (c) => {
    const params = parse(platformOrganizationIdParamsSchema, c.req.param());
    const body = parse(updatePlatformOrganizationLogoUrlBodySchema, await jsonBody(c));
    const identity = c.get("platformIdentity");
    if (!identity) throw new OrganizationWorkerError(401, "Não autenticado.");
    return successResponse(
      await service(c.get("serviceContext")).updatePlatformLogoUrl({
        id: params.id,
        logoUrl: body.logo_url,
        expectedUpdatedAt: body.expected_updated_at,
        actorPlatformUserId: identity.id,
      }),
    );
  });

  if (isEnabled(options.env.ENABLE_API_DOCS) && options.env.NODE_ENV !== "production") {
    app.get("/openapi.json", (c) =>
      c.json(
        buildOrganizationServiceOpenApiSpec({
          port: 8787,
          databaseUrl: "worker",
          jwtSecret: options.env.JWT_SECRET,
          auditServiceToken: options.env.INTERNAL_SERVICE_TOKEN,
          auditServiceUrl: "https://audit-service.internal",
          organizationDomainAuditEnabled: isEnabled(options.env.ORGANIZATION_DOMAIN_AUDIT_ENABLED),
          nodeEnv: options.env.NODE_ENV ?? "development",
          logLevel: "info",
          logPretty: false,
          enableApiDocs: true,
          allowedOrigins: [options.env.SERVICE_ALLOWED_ORIGINS ?? "*"],
        }),
      ),
    );
  }

  app.onError((error, c) => errorResponse(error, c.req.header("x-request-id")));
  app.notFound((c) =>
    errorResponse(new OrganizationWorkerError(404, "Not Found"), c.req.header("x-request-id")),
  );
  const request = app.request.bind(app);
  app.request = ((input: RequestInfo | URL, init?: RequestInit, requestEnv?: unknown) =>
    request(input, init, requestEnv ?? options.env)) as typeof app.request;
  return app;
}
