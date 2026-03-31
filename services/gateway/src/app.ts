import {
  createAuditRecorder,
  createExpressErrorHandler,
  createSuccessResponse,
  getServiceUrls,
  gatewayError,
  INTERNAL_SERVICE_TOKEN_HEADER,
  ServiceError,
  type AuthLogContext,
  type Logger,
  type LogLevel,
} from "@workspace/shared";
import cors from "cors";
import express, { type NextFunction, type Request, type Response } from "express";

import type { GatewayEnv } from "./config/env.js";
import {
  buildAuditErrorCaptureMiddleware,
  buildAuditLifecycleMiddleware,
} from "./middlewares/audit.js";
import { buildAuthenticateMiddleware } from "./middlewares/authenticate.js";
import { authorizeRequest } from "./middlewares/authorize.js";
import { buildRequestContextMiddleware } from "./middlewares/requestContext.js";
import { buildHttpProxyMiddleware } from "./proxy/httpProxy.js";
import { isUserServiceRoute } from "./utils/routeUtils.js";

function createCorsOptions(env: GatewayEnv): cors.CorsOptions {
  return {
    origin(origin, callback) {
      if (!origin) {
        callback(null, true);
        return;
      }

      if (env.allowedOrigins.includes("*") || env.allowedOrigins.includes(origin)) {
        callback(null, origin);
        return;
      }

      callback(new ServiceError(403, "Origin não permitida pelo gateway."));
    },
    methods: "GET,HEAD,PUT,PATCH,POST,DELETE",
    allowedHeaders: ["Content-Type", "Authorization", "x-request-id"],
    credentials: true,
  };
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

/** URL do upstream HTTP ou `null` se o path não estiver mapeado no gateway (sem fallback legado). */
function getProxyTargetUrl(env: GatewayEnv, request: Request): string | null {
  if (isUserServiceRoute(request.path)) {
    return env.userServiceUrl;
  }

  return null;
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

export function createApp(env: GatewayEnv, logger: Logger): express.Express {
  const app = express();
  const recordAuditRequest = createAuditRecorder({
    enabled: env.auditEnabled,
    serviceUrl: env.auditServiceUrl,
    serviceToken: env.auditServiceToken,
    logger,
  });

  app.set("trust proxy", true);
  app.use(buildRequestContextMiddleware(logger));
  app.use(
    buildAuditLifecycleMiddleware({
      enabled: env.auditEnabled,
      logger,
      recordAuditRequest,
    }),
  );
  app.use(buildRequestLifecycleMiddleware(logger));
  app.use(cors(createCorsOptions(env)));
  app.options("*", cors(createCorsOptions(env)));
  app.use(express.json());

  if (!env.auditEnabled) {
    app.use("/audit", (_request, _response, next) => {
      next(new ServiceError(404, "Recurso não encontrado."));
    });
  }

  app.use(buildAuthenticateMiddleware(env.jwtSecret));
  app.use(authorizeRequest);

  app.get("/health", (_request, response) => {
    response.status(200).json(
      createSuccessResponse({
        status: "ok",
        service: "gateway",
      }),
    );
  });

  app.get("/ready", (_request, response) => {
    response.status(200).json(
      createSuccessResponse({
        status: "ready",
        service: "gateway",
      }),
    );
  });

  app.use("/organizations", buildHttpProxyMiddleware(getServiceUrls().organizationServiceUrl));
  app.use("/rh", buildHttpProxyMiddleware(getServiceUrls().rhServiceUrl));
  if (env.auditEnabled) {
    app.use(
      "/audit",
      (request, _response, next) => {
        request.headers[INTERNAL_SERVICE_TOKEN_HEADER] = env.auditServiceToken;
        next();
      },
      buildHttpProxyMiddleware(env.auditServiceUrl),
    );
  }

  app.use((request, response, next) => {
    const targetUrl = getProxyTargetUrl(env, request);
    if (targetUrl === null) {
      next(new ServiceError(404, "Rota não mapeada no gateway."));
      return;
    }
    return buildHttpProxyMiddleware(targetUrl)(request, response, next);
  });
  app.use(buildAuditErrorCaptureMiddleware());
  app.use(
    createExpressErrorHandler({
      logger,
      event: "gateway.error",
      fallbackMessage: "Erro interno no gateway.",
      getContext: (request) => {
        const targetUrl = getProxyTargetUrl(env, request);
        return {
          auth: getAuthLogContext(request),
          upstream: targetUrl ? getUpstreamContext(targetUrl, request) : undefined,
        };
      },
    }),
  );
  app.use((error: Error, request: Request, response: Response, _next: NextFunction) => {
    gatewayError({
      requestId: request.requestId ?? "",
      message: error.message,
    });

    response.status(500).json({ error: "Erro interno no gateway." });
  });

  return app;
}
