import {
  type AuthLogContext,
  createAuditRecorder,
  createAuthenticationRateLimitMiddleware,
  createExpressErrorHandler,
  createPostgresRateLimitStore,
  createRateLimitMiddleware,
  createSecurityHeadersMiddleware,
  createServiceCorsOptions,
  createSuccessResponse,
  type Logger,
  type LogLevel,
  type RateLimitStore,
  ServiceError,
} from "@workspace/shared";
import { mountOpenApiDocs } from "@workspace/shared/http";
import cors from "cors";
import express, { type NextFunction, type Request, type Response } from "express";
import pg from "pg";
import { isGatewayRouteDisabled } from "./config/disabledRoutes.js";
import type { GatewayEnv } from "./config/env.js";
import { getGatewayServiceDefinitions, resolveGatewayService } from "./config/serviceRegistry.js";
import {
  buildAuditErrorCaptureMiddleware,
  buildAuditLifecycleMiddleware,
} from "./middlewares/audit.js";
import {
  buildAuthenticateMiddleware,
  createUserServiceSessionValidator,
  type SessionValidator,
} from "./middlewares/authenticate.js";
import { buildAuthorizeMiddleware } from "./middlewares/authorize.js";
import { buildRequestContextMiddleware } from "./middlewares/requestContext.js";
import { buildGatewayOpenApiSpec } from "./openapi/gatewaySpec.js";
import { buildHttpProxyMiddleware } from "./proxy/httpProxy.js";
import { createDashboardRoutes, type DashboardStatsProvider } from "./routes/dashboard.routes.js";
import { DashboardStatsService } from "./services/dashboardStatsService.js";

type GatewayOpenApiSpec = ReturnType<typeof buildGatewayOpenApiSpec>;
type AuditRecorder = ReturnType<typeof createAuditRecorder>;
type GatewayProxy = ReturnType<typeof buildHttpProxyMiddleware>;
const { Pool } = pg;

export interface GatewayAppDeps {
  dashboardStatsService?: DashboardStatsProvider;
  sessionValidator?: SessionValidator;
  rateLimitStore?: RateLimitStore;
}

function getRequestLogger(request: Request, logger: Logger): Logger {
  return (
    request.log ??
    logger.child({
      request: {
        id: request.requestId,
        method: request.method,
        path: request.path,
        ip: request.ip || undefined,
      },
    })
  );
}

function getAuthLogContext(request: Request): AuthLogContext | undefined {
  if (!request.auth) {
    return undefined;
  }

  return {
    userId: request.auth.userId,
    organizationId: request.auth.organizationId,
    permission:
      typeof request.auth.claims.permission === "number"
        ? request.auth.claims.permission
        : undefined,
  };
}

function getUpstreamContext(url: string, request: Request) {
  try {
    const upstreamUrl = new URL(request.originalUrl, url);

    return {
      host: upstreamUrl.host,
      method: request.method,
      path: upstreamUrl.pathname,
    };
  } catch {
    return undefined;
  }
}

function getResponseSizeBytes(response: Response): number | undefined {
  const header = response.getHeader("content-length");

  if (typeof header === "number") {
    return header;
  }

  if (typeof header === "string") {
    const parsed = Number.parseInt(header, 10);
    return Number.isNaN(parsed) ? undefined : parsed;
  }

  return undefined;
}

function getLevelForStatusCode(statusCode: number): LogLevel {
  if (statusCode >= 500) {
    return "error";
  }

  if (statusCode >= 400) {
    return "warn";
  }

  return "info";
}

function getDurationMs(startedAt: bigint): number {
  return Number(process.hrtime.bigint() - startedAt) / 1_000_000;
}

function buildRequestLifecycleMiddleware(logger: Logger) {
  return function requestLifecycle(request: Request, response: Response, next: NextFunction): void {
    const startedAt = process.hrtime.bigint();
    let logged = false;

    const requestLogger = getRequestLogger(request, logger);

    response.once("finish", () => {
      if (logged) {
        return;
      }

      logged = true;

      requestLogger[getLevelForStatusCode(response.statusCode)]({
        event: "http.request.completed",
        message: "HTTP request completed",
        auth: getAuthLogContext(request),
        http: {
          statusCode: response.statusCode,
          durationMs: getDurationMs(startedAt),
          responseSizeBytes: getResponseSizeBytes(response),
        },
      });
    });

    response.once("close", () => {
      if (logged || response.writableEnded) {
        return;
      }

      logged = true;

      requestLogger.warn({
        event: "http.request.aborted",
        message: "HTTP request aborted by client",
        auth: getAuthLogContext(request),
        http: {
          durationMs: getDurationMs(startedAt),
        },
      });
    });

    next();
  };
}

function getPublicServerUrl(env: GatewayEnv, request: Request): string {
  return env.publicGatewayUrl ?? `${request.protocol}://${request.get("host")}`;
}

function isJsonBodyLimitError(error: Error): boolean {
  const candidate = error as Error & {
    status?: unknown;
    statusCode?: unknown;
    type?: unknown;
  };

  return (
    candidate.type === "entity.too.large" ||
    candidate.status === 413 ||
    candidate.statusCode === 413
  );
}

function isJsonBodyParseError(error: Error): boolean {
  const candidate = error as Error & {
    status?: unknown;
    statusCode?: unknown;
    type?: unknown;
  };

  return (
    candidate.type === "entity.parse.failed" &&
    (candidate.status === 400 || candidate.statusCode === 400)
  );
}

function normalizeJsonBodyError(
  error: Error,
  _request: Request,
  _response: Response,
  next: NextFunction,
): void {
  if (isJsonBodyParseError(error)) {
    next(new ServiceError(400, "JSON malformado.", error));
    return;
  }

  if (isJsonBodyLimitError(error)) {
    next(new ServiceError(413, "Corpo da requisição excede o limite permitido.", error));
    return;
  }

  next(error);
}

function configureExpress(app: express.Express, env: GatewayEnv): void {
  app.set("trust proxy", env.trustedProxyCidrs);
  app.use(createSecurityHeadersMiddleware({ nodeEnv: env.nodeEnv }));
}

function mountObservability(
  app: express.Express,
  env: GatewayEnv,
  logger: Logger,
  recordAuditRequest: AuditRecorder,
): void {
  app.use(buildRequestContextMiddleware(logger));
  app.use(
    buildAuditLifecycleMiddleware({
      enabled: env.auditEnabled,
      env,
      logger,
      recordAuditRequest,
    }),
  );
  app.use(buildRequestLifecycleMiddleware(logger));
}

function mountCorsAndParsing(app: express.Express, env: GatewayEnv): void {
  const corsOptions = createServiceCorsOptions(env.allowedOrigins, "gateway");

  app.use(cors(corsOptions));
  app.options("*", cors(corsOptions));
  app.use(express.json({ limit: env.jsonBodyLimit ?? "1mb" }));
  app.use(normalizeJsonBodyError);
}

function mountPublicRoutes(
  app: express.Express,
  env: GatewayEnv,
  gatewayOpenApiSpec: GatewayOpenApiSpec,
): void {
  if (env.enableApiDocs) {
    app.get("/openapi.json", (request: Request, response: Response) => {
      response.json({
        ...gatewayOpenApiSpec,
        servers: [{ url: getPublicServerUrl(env, request) }],
      });
    });

    mountOpenApiDocs(app, {
      spec: gatewayOpenApiSpec,
      docsPath: "/docs",
      jsonPath: "/__gateway-openapi-static.json",
      specUrl: "/openapi.json",
      siteTitle: "gateway - OpenAPI",
    });
  } else {
    app.use(
      ["/docs", "/openapi.json", "/__gateway-openapi-static.json"],
      (_request, _response, next) => {
        next(new ServiceError(404, "Recurso não encontrado."));
      },
    );
  }

  app.get("/health", (_request, response) => {
    response.status(200).json(
      createSuccessResponse({
        status: "ok",
        service: "gateway",
      }),
    );
  });

  app.get("/ready", (_request, response, next) => {
    const services = getGatewayServiceDefinitions(env);

    if (services.length === 0) {
      next(new ServiceError(503, "Gateway sem serviços configurados."));
      return;
    }

    response.status(200).json(
      createSuccessResponse({
        status: "ready",
        service: "gateway",
        services: services.length,
      }),
    );
  });
}

function mountAuthRateLimits(
  app: express.Express,
  env: GatewayEnv,
  logger: Logger,
  store: RateLimitStore | undefined,
): void {
  const options = {
    store,
    keySecret: env.authRateLimitKeySecret,
    ipMax: env.authRateLimitIpMax,
    accountMax: env.authRateLimitAccountMax,
    ipAccountMax: env.authRateLimitIpAccountMax,
    windowMs: env.authRateLimitWindowMs,
    timeoutMs: env.authRateLimitTimeoutMs,
    degradationMode: env.authRateLimitDegradationMode,
    onDecision: ({ bucket, outcome }: { bucket: string; outcome: "blocked" | "observed" }) =>
      logger.warn({ event: "auth.rate_limit.decision", data: { bucket, outcome } }),
    onDegraded: () => logger.warn({ event: "auth.rate_limit.degraded" }),
  };

  app.use("/user/session", createAuthenticationRateLimitMiddleware(options));
  app.use(
    "/user/start-config",
    createAuthenticationRateLimitMiddleware({ ...options, buckets: ["ip"] }),
  );
}

function mountPublicBlockedRoutes(app: express.Express, env: GatewayEnv): void {
  if (!env.auditEnabled) {
    app.use("/audit", (_request, _response, next) => {
      next(new ServiceError(404, "Recurso não encontrado."));
    });
  }
}

function mountAuthenticationBoundary(
  app: express.Express,
  env: GatewayEnv,
  logger: Logger,
  sessionValidator?: SessionValidator,
): void {
  const generalRateLimit = createRateLimitMiddleware({
    key: "gateway:general",
    max: env.rateLimitMax,
    windowMs: env.rateLimitWindowMs,
  });

  app.use(buildAuthenticateMiddleware(env.jwtSecret, sessionValidator));
  app.use(generalRateLimit);
  mountProtectedBlockedRoutes(app);
  app.use(buildAuthorizeMiddleware(env.authorizationMode, logger));
}

function mountProtectedBlockedRoutes(app: express.Express): void {
  app.use((request, _response, next) => {
    if (isGatewayRouteDisabled(request.path)) {
      next(new ServiceError(404, "Recurso não encontrado."));
      return;
    }

    next();
  });

  app.use("/regularize/internal", (_request, _response, next) => {
    next(new ServiceError(404, "Recurso não encontrado."));
  });
}

function mountDashboardRoutes(
  app: express.Express,
  dashboardStatsService: DashboardStatsProvider,
): void {
  app.use("/dashboard", createDashboardRoutes(dashboardStatsService));
}

function buildServiceProxyMap(env: GatewayEnv): Map<string, GatewayProxy> {
  const proxyByServiceKey = new Map<string, GatewayProxy>();

  for (const service of getGatewayServiceDefinitions(env)) {
    proxyByServiceKey.set(
      service.key,
      buildHttpProxyMiddleware(service.targetUrl, {
        internalServiceToken: service.internalServiceToken,
        permissionModule: service.permissionModule,
      }),
    );
  }

  return proxyByServiceKey;
}

function mountServiceRoutes(app: express.Express, env: GatewayEnv): void {
  const proxyByServiceKey = buildServiceProxyMap(env);

  for (const service of getGatewayServiceDefinitions(env)) {
    const proxy = proxyByServiceKey.get(service.key);

    for (const routePrefix of service.routePrefixes) {
      app.use(
        routePrefix,
        proxy ??
          ((_request, _response, next) => {
            next(new ServiceError(502, "Serviço mapeado sem proxy configurado."));
          }),
      );
    }
  }

  if (env.auditEnabled) {
    app.use(
      "/audit",
      buildHttpProxyMiddleware(env.auditServiceUrl, {
        internalServiceToken: env.auditServiceToken,
      }),
    );
  }
}

function mountFallbackRoute(app: express.Express): void {
  app.use((_request, _response, next) => {
    next(new ServiceError(404, "Rota não mapeada no gateway."));
  });
}

function mountErrorHandlers(app: express.Express, env: GatewayEnv, logger: Logger): void {
  app.use(buildAuditErrorCaptureMiddleware());
  app.use(
    createExpressErrorHandler({
      logger,
      event: "gateway.error",
      fallbackMessage: "Erro interno no gateway.",
      getContext: (request) => {
        const service = resolveGatewayService(env, request.originalUrl);
        return {
          auth: getAuthLogContext(request),
          upstream: service ? getUpstreamContext(service.targetUrl, request) : undefined,
        };
      },
    }),
  );
}

export function createApp(
  env: GatewayEnv,
  logger: Logger,
  deps: GatewayAppDeps = {},
): express.Express {
  const app = express();
  const gatewayOpenApiSpec = buildGatewayOpenApiSpec(env);
  const dashboardStatsService =
    deps.dashboardStatsService ?? new DashboardStatsService({ databaseUrl: env.databaseUrl });
  const recordAuditRequest = createAuditRecorder({
    enabled: env.auditEnabled,
    serviceUrl: env.auditServiceUrl,
    serviceToken: env.auditServiceToken,
    logger,
  });
  const rateLimitStore =
    deps.rateLimitStore ??
    (env.nodeEnv === "test" || !env.databaseUrl
      ? undefined
      : createPostgresRateLimitStore(new Pool({ connectionString: env.databaseUrl })));

  configureExpress(app, env);
  mountObservability(app, env, logger, recordAuditRequest);
  mountCorsAndParsing(app, env);
  mountPublicRoutes(app, env, gatewayOpenApiSpec);
  mountAuthRateLimits(app, env, logger, rateLimitStore);
  mountPublicBlockedRoutes(app, env);
  const sessionValidator =
    deps.sessionValidator ??
    (env.nodeEnv === "test"
      ? undefined
      : createUserServiceSessionValidator(env.userServiceUrl, env.auditServiceToken));
  mountAuthenticationBoundary(app, env, logger, sessionValidator);
  mountDashboardRoutes(app, dashboardStatsService);
  mountServiceRoutes(app, env);
  mountFallbackRoute(app);
  mountErrorHandlers(app, env, logger);

  return app;
}
