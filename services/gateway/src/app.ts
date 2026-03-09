import type { AuthLogContext } from "@workspace/shared";
import type { Logger, LogLevel } from "@workspace/shared/logger";
import cors from "cors";
import express, { type NextFunction, type Request, type Response } from "express";

import type { GatewayEnv } from "./config/env.js";
import { buildAuthenticateMiddleware } from "./middlewares/authenticate.js";
import { authorizeRequest } from "./middlewares/authorize.js";
import { buildRequestContextMiddleware } from "./middlewares/requestContext.js";
import { buildHttpProxyMiddleware } from "./proxy/httpProxy.js";

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

      callback(new Error("Origin não permitida pelo gateway."));
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

  app.set("trust proxy", true);
  app.use(cors(createCorsOptions(env)));
  app.options("*", cors(createCorsOptions(env)));
  app.use(express.json());

  app.use(buildRequestContextMiddleware(logger));
  app.use(buildRequestLifecycleMiddleware(logger));
  app.use(buildAuthenticateMiddleware(env.jwtSecret));
  app.use(authorizeRequest);

  app.get("/health", (_request, response) => {
    response.status(200).json({ status: "ok", service: "gateway" });
  });

  app.get("/ready", (_request, response) => {
    response.status(200).json({ status: "ready", url: env.legacyApiUrl });
  });

  app.use(buildHttpProxyMiddleware(env.legacyApiUrl));

  app.use((error: Error, request: Request, response: Response, _next: NextFunction) => {
    getRequestLogger(request, logger).error({
      event: "gateway.error",
      message: "Gateway request failed",
      auth: getAuthLogContext(request),
      upstream: getUpstreamContext(env.legacyApiUrl, request),
      err: error,
    });

    response.status(500).json({ error: "Erro interno no gateway." });
  });

  return app;
}
