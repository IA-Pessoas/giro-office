import type {
  AuditOutcome,
  AuditQuery,
  AuditRecorder,
  CreateAuditRequestPayload,
  Logger,
} from "@workspace/shared";
import type { ErrorRequestHandler, NextFunction, Request, Response } from "express";

import { describeActivity } from "../audit/activityCatalog.js";
import type { GatewayEnv } from "../config/env.js";
import { resolveGatewayService } from "../config/serviceRegistry.js";

interface BuildAuditLifecycleMiddlewareOptions {
  enabled: boolean;
  env: GatewayEnv;
  logger: Logger;
  recordAuditRequest: AuditRecorder;
}

const TI_PASSWORD_DEACTIVATION_PATH = /^\/ti\/passwords\/[^/]+\/deactivate\/?$/i;
const TI_PASSWORD_DEACTIVATION_SENSITIVE_QUERY_KEYS = new Set(["password", "reason"]);
const AUDIT_EXCLUDED_PATHS = new Set(["/health", "/ready"]);

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

function getDurationMs(startedAt: bigint): number {
  return Math.round(Number(process.hrtime.bigint() - startedAt) / 1_000_000);
}

function normalizeOptionalString(value: string | undefined): string | undefined {
  if (!value) {
    return undefined;
  }

  const normalized = value.trim();
  return normalized.length > 0 ? normalized : undefined;
}

function buildQueryFromUrl(url: string, method: string, path: string): AuditQuery {
  const query: AuditQuery = {};
  const parsedUrl = new URL(url, "http://localhost");
  const isTiPasswordDeactivation = method === "POST" && TI_PASSWORD_DEACTIVATION_PATH.test(path);

  parsedUrl.searchParams.forEach((value, key) => {
    if (
      isTiPasswordDeactivation &&
      TI_PASSWORD_DEACTIVATION_SENSITIVE_QUERY_KEYS.has(key.toLowerCase())
    ) {
      return;
    }

    const current = query[key];

    if (!current) {
      query[key] = value;
      return;
    }

    query[key] = Array.isArray(current) ? [...current, value] : [current, value];
  });

  return query;
}

function getPublicPath(originalUrl: string, fallbackPath: string): string {
  try {
    return new URL(originalUrl, "http://localhost").pathname;
  } catch {
    return fallbackPath;
  }
}

function getOutcome(statusCode: number): AuditOutcome {
  return statusCode >= 400 ? "error" : "success";
}

function getRouteTarget(env: GatewayEnv, request: Request): string {
  const service = resolveGatewayService(env, request.originalUrl, request.method);
  if (service) {
    return service.auditTarget;
  }
  return "unmapped-route";
}

export function buildAuditLifecycleMiddleware({
  enabled,
  env,
  logger,
  recordAuditRequest,
}: BuildAuditLifecycleMiddlewareOptions) {
  return function auditLifecycle(request: Request, response: Response, next: NextFunction): void {
    if (!enabled) {
      next();
      return;
    }

    const startedAt = process.hrtime.bigint();
    const createdAt = new Date();
    const publicPath = getPublicPath(request.originalUrl, request.path);
    if (AUDIT_EXCLUDED_PATHS.has(publicPath)) {
      next();
      return;
    }

    const activity = describeActivity(request.method, publicPath);
    const requestLogger = request.log ?? logger;
    let recorded = false;

    const record = (outcome: AuditOutcome, statusCode: number | null): void => {
      if (recorded) {
        return;
      }

      recorded = true;

      if (!request.requestId) {
        return;
      }

      const isPlatform = request.auth?.actorKind === "platform";

      const payload: CreateAuditRequestPayload = {
        requestId: request.requestId,
        organizationId: isPlatform ? null : normalizeOptionalString(request.auth?.organizationId),
        userId: isPlatform ? null : normalizeOptionalString(request.auth?.userId),
        permission:
          typeof request.auth?.claims.permission === "number"
            ? request.auth.claims.permission
            : undefined,
        method: request.method,
        path: publicPath,
        query: buildQueryFromUrl(request.originalUrl, request.method, publicPath),
        statusCode,
        outcome,
        durationMs: getDurationMs(startedAt),
        ip: normalizeOptionalString(request.ip || undefined),
        userAgent: normalizeOptionalString(request.get("user-agent") ?? undefined),
        origin: normalizeOptionalString(request.get("origin") ?? undefined),
        errorCode: request.auditErrorCode,
        errorMessage: request.auditErrorMessage,
        serviceSource: "gateway",
        createdAt: createdAt.toISOString(),
        finishedAt: new Date().toISOString(),
        metadata: {
          responseSizeBytes: getResponseSizeBytes(response) ?? null,
          routeTarget: getRouteTarget(env, request),
          activityVisible: activity !== null,
          ...(isPlatform
            ? {
                auth_kind: "platform",
                platform_user_id: request.auth?.userId,
              }
            : {}),
        },
        action: activity?.action,
        referring: activity?.item,
      };

      void recordAuditRequest(payload);
      requestLogger.debug({
        event: "audit.record.queued",
        message: "Audit record queued",
        request: {
          id: request.requestId,
        },
      });
    };

    response.once("finish", () => {
      record(getOutcome(response.statusCode), response.statusCode);
    });

    response.once("close", () => {
      if (response.writableEnded) {
        return;
      }

      record("aborted", 499);
    });

    next();
  };
}

export function buildAuditErrorCaptureMiddleware(): ErrorRequestHandler {
  return function auditErrorCapture(error, request, _response, next) {
    request.auditErrorCode =
      error instanceof Error && "code" in error && typeof error.code === "string"
        ? error.code
        : "INTERNAL_ERROR";
    request.auditErrorMessage = error instanceof Error ? error.message : "Internal error";
    next(error);
  };
}
