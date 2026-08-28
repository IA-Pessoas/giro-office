import { createHash, randomUUID } from "node:crypto";

import type {
  AuditOutcome,
  AuditQuery,
  AuditReservation,
  CreateAuditRequestPayload,
  Logger,
  ReservableAuditRecorder,
} from "@workspace/shared";
import { ServiceError } from "@workspace/shared";
import type { ErrorRequestHandler, NextFunction, Request, Response } from "express";

import { describeActivity } from "../audit/activityCatalog.js";
import type { GatewayEnv } from "../config/env.js";
import { resolveGatewayService } from "../config/serviceRegistry.js";
import { normalizeGatewayPath } from "../security/routeClassification.js";

interface BuildAuditLifecycleMiddlewareOptions {
  enabled: boolean;
  env: GatewayEnv;
  logger: Logger;
  recordAuditRequest: ReservableAuditRecorder;
}

const TI_PASSWORD_DEACTIVATION_PATH = /^\/ti\/passwords\/[^/]+\/deactivate\/?$/i;
const TI_PASSWORD_DEACTIVATION_SENSITIVE_QUERY_KEYS = new Set(["password", "reason"]);
const AUDIT_EXCLUDED_PATHS = new Set(["/health", "/ready"]);
const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);
const RESERVED_AUDIT_REQUESTS = new WeakMap<Request, AuditReservation>();
const PLATFORM_ORGANIZATIONS_PATH = "/platform/organizations";
const PLATFORM_ORGANIZATION_STATUSES = new Set([
  "trial",
  "past_due",
  "active",
  "suspended",
  "cancelled",
]);
const NON_NEGATIVE_INTEGER_QUERY = /^(?:0|[1-9]\d*)$/u;

function isIntegerInRange(value: string, minimum: number, maximum: number): boolean {
  if (!NON_NEGATIVE_INTEGER_QUERY.test(value)) {
    return false;
  }

  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed >= minimum && parsed <= maximum;
}

const PLATFORM_ORGANIZATION_LIST_QUERY_VALIDATORS = {
  page: (value: string) => isIntegerInRange(value, 1, 10_001),
  pageSize: (value: string) => isIntegerInRange(value, 1, 100),
  status: (value: string) => PLATFORM_ORGANIZATION_STATUSES.has(value),
};
const PLATFORM_ORGANIZATION_USERS_QUERY_VALIDATORS = {
  skip: (value: string) => isIntegerInRange(value, 0, 10_000),
  take: (value: string) => isIntegerInRange(value, 1, 100),
};

function requiresOrganizationMutationAudit(request: Request): boolean {
  const path = normalizeGatewayPath(request.originalUrl ?? "");
  if (!path) {
    return false;
  }

  const method = request.method.toUpperCase();
  return (
    (method === "POST" && path.toLowerCase() === "/platform/organizations") ||
    (method === "POST" && /^\/platform\/organizations\/[^/]+\/users$/i.test(path)) ||
    (method === "PATCH" &&
      /^\/platform\/organizations\/[^/]+\/(?:status|subscription-plan|logo-url)$/i.test(path))
  );
}

interface BuildAuditCapacityGuardOptions {
  enabled: boolean;
  recordAuditRequest: ReservableAuditRecorder;
}

export function buildAuditCapacityGuard({
  enabled,
  recordAuditRequest,
}: BuildAuditCapacityGuardOptions) {
  return async function auditCapacityGuard(
    request: Request,
    response: Response,
    next: NextFunction,
  ): Promise<void> {
    const requiresAudit = requiresOrganizationMutationAudit(request);
    const mustReserve =
      requiresAudit ||
      request.auth !== undefined ||
      !SAFE_METHODS.has(request.method.toUpperCase());

    if (requiresAudit && (!enabled || !request.requestId)) {
      next(new ServiceError(503, "Auditoria indisponível; operação não iniciada."));
      return;
    }

    if (!enabled || !mustReserve || !request.requestId) {
      next();
      return;
    }

    const reservation = recordAuditRequest.reserve("protected");
    if (!reservation) {
      next(new ServiceError(503, "Auditoria indisponível; operação não iniciada."));
      return;
    }

    if (requiresAudit) {
      const controller = new AbortController();
      const abort = () => controller.abort();
      response.once("close", abort);
      if (request.aborted || response.destroyed) abort();
      try {
        await recordAuditRequest.recordRequired(
          {
            requestId: randomUUID(),
            organizationId:
              /^\/platform\/organizations\/([^/]+)/i.exec(
                getPublicPath(request.originalUrl, request.path),
              )?.[1] ?? null,
            userId: null,
            method: request.method,
            path: getPublicPath(request.originalUrl, request.path),
            query: {},
            statusCode: null,
            // Success means the attempt was recorded, not that the business mutation succeeded.
            outcome: "success",
            serviceSource: "gateway",
            createdAt: new Date().toISOString(),
            action:
              method === "POST" &&
              /\/users$/i.test(getPublicPath(request.originalUrl, request.path))
                ? "platform.user.create.attempt"
                : "organization.mutation.attempt",
            referring:
              method === "POST" &&
              /\/users$/i.test(getPublicPath(request.originalUrl, request.path))
                ? "user"
                : "organization",
            referringId:
              method === "POST" &&
              /\/users$/i.test(getPublicPath(request.originalUrl, request.path))
                ? String(request.body?.login ?? "new-user")
                : undefined,
            changes:
              method === "POST" &&
              /\/users$/i.test(getPublicPath(request.originalUrl, request.path))
                ? {
                    before: null,
                    after: {
                      name: request.body?.name,
                      login: request.body?.login,
                      department_id: request.body?.department_id,
                      permission: request.body?.permission,
                      status: request.body?.status,
                      type: request.body?.type,
                      modules: request.body?.modules,
                    },
                  }
                : undefined,
            metadata: {
              auth_kind: "platform",
              platform_user_id: request.auth?.userId,
              business_outcome: "unknown",
              source_request_id_sha256: createHash("sha256")
                .update(request.requestId)
                .digest("hex"),
            },
          },
          reservation,
          controller.signal,
        );
      } catch {
        request.log?.error({
          event: "audit.required.failed",
          message: "Required audit persistence unavailable",
        });
        if (!controller.signal.aborted && !response.destroyed) {
          next(new ServiceError(503, "Auditoria indisponível; operação não iniciada."));
        }
        return;
      } finally {
        response.off("close", abort);
      }
      if (controller.signal.aborted || request.aborted || response.destroyed) return;
    } else {
      RESERVED_AUDIT_REQUESTS.set(request, reservation);
    }
    next();
  };
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

function buildValidatedQuery(
  searchParams: URLSearchParams,
  validators: Record<string, (value: string) => boolean>,
): AuditQuery {
  const query: AuditQuery = {};
  for (const [key, isValid] of Object.entries(validators)) {
    const values = searchParams.getAll(key);
    if (values.length === 1 && isValid(values[0] ?? "")) {
      query[key] = values[0];
    }
  }
  return query;
}

function buildPlatformOrganizationQuery(
  searchParams: URLSearchParams,
  method: string,
  path: string,
): AuditQuery | null {
  const normalizedPath = path.replace(/\/+$/u, "").toLowerCase();
  if (
    normalizedPath !== PLATFORM_ORGANIZATIONS_PATH &&
    !normalizedPath.startsWith(`${PLATFORM_ORGANIZATIONS_PATH}/`)
  ) {
    return null;
  }

  if (method === "GET" && normalizedPath === PLATFORM_ORGANIZATIONS_PATH) {
    const query = buildValidatedQuery(searchParams, PLATFORM_ORGANIZATION_LIST_QUERY_VALIDATORS);
    const page = typeof query.page === "string" ? Number(query.page) : 1;
    const pageSize = typeof query.pageSize === "string" ? Number(query.pageSize) : 20;
    if ((page - 1) * pageSize > 10_000) {
      delete query.page;
      delete query.pageSize;
    }
    return query;
  }

  if (method === "GET" && /^\/platform\/organizations\/[^/]+\/users$/u.test(normalizedPath)) {
    return buildValidatedQuery(searchParams, PLATFORM_ORGANIZATION_USERS_QUERY_VALIDATORS);
  }

  return {};
}

function buildQueryFromUrl(url: string, method: string, path: string): AuditQuery {
  const parsedUrl = new URL(url, "http://localhost");
  const platformOrganizationQuery = buildPlatformOrganizationQuery(
    parsedUrl.searchParams,
    method,
    path,
  );
  if (platformOrganizationQuery) {
    return platformOrganizationQuery;
  }

  const query: AuditQuery = {};
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

      const reservation =
        RESERVED_AUDIT_REQUESTS.get(request) ??
        (isPlatform && requiresOrganizationMutationAudit(request)
          ? recordAuditRequest.reserve("protected")
          : undefined);
      RESERVED_AUDIT_REQUESTS.delete(request);
      void recordAuditRequest(payload, reservation);
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
