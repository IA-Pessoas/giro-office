import type {
  AuditOutcome,
  AuditQuery,
  AuditRecorder,
  CreateAuditRequestPayload,
  Logger,
} from "@workspace/shared";
import type { ErrorRequestHandler, NextFunction, Request, Response } from "express";

import {
  isProjectServiceRoute,
  isTaskServiceRoute,
  isUserServiceRoute,
} from "../utils/routeUtils.js";

interface BuildAuditLifecycleMiddlewareOptions {
  enabled: boolean;
  logger: Logger;
  recordAuditRequest: AuditRecorder;
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

function buildQueryFromUrl(url: string): AuditQuery {
  const query: AuditQuery = {};
  const parsedUrl = new URL(url, "http://localhost");

  parsedUrl.searchParams.forEach((value, key) => {
    const current = query[key];

    if (!current) {
      query[key] = value;
      return;
    }

    query[key] = Array.isArray(current) ? [...current, value] : [current, value];
  });

  return query;
}

function getOutcome(statusCode: number): AuditOutcome {
  return statusCode >= 400 ? "error" : "success";
}

function getRouteTarget(request: Request): string {
  if (request.originalUrl.startsWith("/audit")) return "audit-service";
  if (isUserServiceRoute(request.path)) return "user-service";
  if (isTaskServiceRoute(request.path)) return "task-service";
  if (isProjectServiceRoute(request.path)) return "project-service";
  return "legacy-api";
}

export function buildAuditLifecycleMiddleware({
  enabled,
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

      const payload: CreateAuditRequestPayload = {
        requestId: request.requestId,
        organizationId: normalizeOptionalString(request.auth?.organizationId),
        userId: normalizeOptionalString(request.auth?.userId),
        permission:
          typeof request.auth?.claims.permission === "number"
            ? request.auth.claims.permission
            : undefined,
        method: request.method,
        path: request.path,
        query: buildQueryFromUrl(request.originalUrl),
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
          routeTarget: getRouteTarget(request),
        },
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
