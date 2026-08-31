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
import { ACTIVE_MODULE_KEYS } from "@workspace/shared/auth";
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
const PLATFORM_OWNERSHIP_TRANSFER_PATH =
  /^\/platform\/organizations\/[^/]+\/ownership-transfer\/?$/i;
const PLATFORM_ORGANIZATION_SETTINGS_PATH =
  /^\/platform\/organizations\/[^/]+\/(?:status|subscription-plan|logo-url)$/i;
const PLATFORM_ORGANIZATION_USER_PATH = /^\/platform\/organizations\/[^/]+\/users\/[^/]+$/i;
const PLATFORM_ORGANIZATION_USER_PERMISSIONS_PATH =
  /^\/platform\/organizations\/[^/]+\/users\/[^/]+\/permissions$/i;
const PLATFORM_ORGANIZATION_STATUSES = new Set([
  "trial",
  "past_due",
  "active",
  "suspended",
  "cancelled",
]);
const NON_NEGATIVE_INTEGER_QUERY = /^(?:0|[1-9]\d*)$/u;
const ACTIVE_MODULE_KEY_SET = new Set<string>(ACTIVE_MODULE_KEYS);

function getAllowlistedModulePermissions(value: unknown): Record<string, number> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }

  return Object.fromEntries(
    Object.entries(value).filter(
      ([key, level]) =>
        ACTIVE_MODULE_KEY_SET.has(key) &&
        typeof level === "number" &&
        Number.isInteger(level) &&
        level >= 0 &&
        level <= 3,
    ),
  );
}

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

function getPlatformOrganizationAuditTarget(path: string): {
  organizationId: string;
  userId: string | null;
} | null {
  const normalizedPath = path.replace(/\/+$/u, "");
  const organizationMatch = normalizedPath.match(/^\/platform\/organizations\/([^/]+)(?:\/|$)/iu);
  if (!organizationMatch) {
    return null;
  }
  const userMatch = normalizedPath.match(
    /^\/platform\/organizations\/[^/]+\/users\/([^/]+)(?:\/(?:reactivate|permissions))?$/iu,
  );

  return { organizationId: organizationMatch[1], userId: userMatch?.[1] ?? null };
}

function requiresOrganizationMutationAudit(request: Request): boolean {
  const path = normalizeGatewayPath(request.originalUrl ?? "");
  if (!path) {
    return false;
  }

  const method = request.method.toUpperCase();
  return (
    (method === "POST" && path.toLowerCase() === "/platform/organizations") ||
    (method === "POST" && /^\/platform\/organizations\/[^/]+\/users$/i.test(path)) ||
    (method === "POST" && PLATFORM_OWNERSHIP_TRANSFER_PATH.test(path)) ||
    (method === "PATCH" &&
      (PLATFORM_ORGANIZATION_SETTINGS_PATH.test(path) ||
        PLATFORM_ORGANIZATION_USER_PATH.test(path))) ||
    (method === "DELETE" && /^\/platform\/organizations\/[^/]+\/users\/[^/]+$/i.test(path)) ||
    (method === "POST" &&
      /^\/platform\/organizations\/[^/]+\/users\/[^/]+\/reactivate$/i.test(path)) ||
    (method === "PUT" &&
      /^\/platform\/organizations\/[^/]+\/users\/[^/]+\/permissions$/i.test(path))
  );
}

function getSafeAuditText(value: unknown, maximumLength: number): string | undefined {
  if (typeof value !== "string" || value.length > maximumLength) {
    return undefined;
  }

  return value.trim() || undefined;
}

function getOwnershipTransferAuditChanges(
  request: Request,
  ownershipTransferResult: unknown,
): Record<string, unknown> | undefined {
  const body = request.body;
  if (
    body === null ||
    typeof body !== "object" ||
    Array.isArray(body) ||
    ownershipTransferResult === null ||
    typeof ownershipTransferResult !== "object" ||
    Array.isArray(ownershipTransferResult)
  ) {
    return undefined;
  }

  const input = body as Record<string, unknown>;
  const result = ownershipTransferResult as Record<string, unknown>;
  const currentOwner = result.currentOwner;
  const successor = result.successor;
  const justification = getSafeAuditText(input.justification, 500);
  if (
    currentOwner === null ||
    typeof currentOwner !== "object" ||
    Array.isArray(currentOwner) ||
    successor === null ||
    typeof successor !== "object" ||
    Array.isArray(successor) ||
    !justification
  ) {
    return undefined;
  }

  const currentOwnerRecord = currentOwner as Record<string, unknown>;
  const successorRecord = successor as Record<string, unknown>;
  const currentOwnerId = getSafeAuditText(currentOwnerRecord.id, 200);
  const successorUserId = getSafeAuditText(successorRecord.id, 200);
  const currentOwnerStatus = currentOwnerRecord.status;
  if (
    !currentOwnerId ||
    !successorUserId ||
    currentOwnerId === successorUserId ||
    currentOwnerRecord.type !== "admin" ||
    (currentOwnerStatus !== "active" && currentOwnerStatus !== "inactive") ||
    successorRecord.type !== "owner" ||
    successorRecord.status !== "active"
  ) {
    return undefined;
  }
  const previousOwnerAction = currentOwnerStatus === "inactive" ? "deactivate" : "demote";

  return {
    ownership: {
      before: { ownerId: currentOwnerId, type: "owner", status: "active" },
      after: {
        ownerId: successorUserId,
        type: "owner",
        status: "active",
        previousOwner: {
          id: currentOwnerId,
          type: "admin",
          status: previousOwnerAction === "deactivate" ? "inactive" : "active",
        },
      },
      previousOwnerAction,
      justification,
    },
  };
}

function usesExplicitPlatformActor(method: string, path: string): boolean {
  const normalizedPath = path.replace(/\/+$/u, "");
  const normalizedMethod = method.toUpperCase();
  return (
    (normalizedMethod === "PATCH" && PLATFORM_ORGANIZATION_USER_PATH.test(normalizedPath)) ||
    (normalizedMethod === "PUT" && PLATFORM_ORGANIZATION_USER_PERMISSIONS_PATH.test(normalizedPath))
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
    const method = request.method.toUpperCase();
    const mustReserve = requiresAudit || request.auth !== undefined || !SAFE_METHODS.has(method);

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
      const publicPath = getPublicPath(request.originalUrl, request.path);
      const auditTarget = getPlatformOrganizationAuditTarget(publicPath);
      const isOwnershipTransfer = PLATFORM_OWNERSHIP_TRANSFER_PATH.test(publicPath);
      const explicitPlatformActor = usesExplicitPlatformActor(request.method, publicPath);
      const controller = new AbortController();
      const abort = () => controller.abort();
      response.once("close", abort);
      if (request.aborted || response.destroyed) abort();
      try {
        await recordAuditRequest.recordRequired(
          {
            requestId: randomUUID(),
            organizationId: auditTarget?.organizationId ?? null,
            userId: auditTarget?.userId ?? null,
            method: request.method,
            path: publicPath,
            query: {},
            statusCode: null,
            // Success means the attempt was recorded, not that the business mutation succeeded.
            outcome: "success",
            serviceSource: "gateway",
            createdAt: new Date().toISOString(),
            action:
              method === "PUT" && /\/users\/[^/]+\/permissions$/i.test(publicPath)
                ? "platform.user.permissions.update.attempt"
                : isOwnershipTransfer
                  ? "platform.organization.ownership.transfer.attempt"
                  : method === "POST" &&
                      /\/users$/i.test(getPublicPath(request.originalUrl, request.path))
                    ? "platform.user.create.attempt"
                    : "organization.mutation.attempt",
            referring:
              method === "PUT" && /\/users\/[^/]+\/permissions$/i.test(publicPath)
                ? "user"
                : method === "POST" &&
                    /\/users$/i.test(getPublicPath(request.originalUrl, request.path))
                  ? "user"
                  : "organization",
            referringId:
              method === "PUT" && /\/users\/[^/]+\/permissions$/i.test(publicPath)
                ? (auditTarget?.userId ?? undefined)
                : method === "POST" &&
                    /\/users$/i.test(getPublicPath(request.originalUrl, request.path))
                  ? String(request.body?.login ?? "new-user")
                  : auditTarget?.organizationId,
            changes:
              method === "PUT" && /\/users\/[^/]+\/permissions$/i.test(publicPath)
                ? {
                    before: null,
                    after: { modules: getAllowlistedModulePermissions(request.body) },
                  }
                : method === "POST" &&
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
              ...(explicitPlatformActor
                ? { actorKind: "platform", actorPlatformUserId: request.auth?.userId }
                : isOwnershipTransfer
                  ? {
                      auth_kind: "platform",
                      platform_user_id: request.auth?.userId,
                      actorPlatformUserId: request.auth?.userId,
                    }
                  : { auth_kind: "platform", platform_user_id: request.auth?.userId }),
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
      const auditTarget = isPlatform ? getPlatformOrganizationAuditTarget(publicPath) : null;
      const isOwnershipTransfer = isPlatform && PLATFORM_OWNERSHIP_TRANSFER_PATH.test(publicPath);
      const ownershipChanges =
        isOwnershipTransfer && statusCode !== null && statusCode < 400
          ? getOwnershipTransferAuditChanges(request, response.locals.ownershipTransferAuditResult)
          : undefined;
      const explicitPlatformActor =
        isPlatform && usesExplicitPlatformActor(request.method, publicPath);

      const payload: CreateAuditRequestPayload = {
        requestId: request.requestId,
        organizationId: isPlatform
          ? (auditTarget?.organizationId ?? null)
          : normalizeOptionalString(request.auth?.organizationId),
        userId: isPlatform
          ? (auditTarget?.userId ?? null)
          : normalizeOptionalString(request.auth?.userId),
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
            ? explicitPlatformActor
              ? { actorKind: "platform", actorPlatformUserId: request.auth?.userId }
              : isOwnershipTransfer
                ? {
                    auth_kind: "platform",
                    platform_user_id: request.auth?.userId,
                    actorPlatformUserId: request.auth?.userId,
                  }
                : { auth_kind: "platform", platform_user_id: request.auth?.userId }
            : {}),
        },
        action: ownershipChanges
          ? "platform.organization.ownership.transfer.completed"
          : activity?.action,
        referring: ownershipChanges ? "organization" : activity?.item,
        referringId: ownershipChanges ? auditTarget?.organizationId : undefined,
        changes: ownershipChanges,
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
