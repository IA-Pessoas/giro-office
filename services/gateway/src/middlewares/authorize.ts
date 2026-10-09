import { canAccessRoute, type Logger, ServiceError } from "@workspace/shared";
import type { NextFunction, Request, Response } from "express";

import { getRoutePolicy } from "../security/policies.js";
import { isPublicRoute } from "../security/publicRoutes.js";
import { normalizeGatewayPath } from "../security/routeClassification.js";

const selfUserPutPath = /^\/user\/(?!me$|session$|start-config$|permission\/)([^/]+)$/;
const observedRouteNamespaces = new Set([
  "audit",
  "certificate",
  "client",
  "commercial",
  "contabil",
  "dashboard",
  "department",
  "fiscal",
  "organizations",
  "parcelamento",
  "pessoal",
  "project",
  "regularize",
  "rh",
  "task",
  "ti",
  "user",
]);

export type GatewayAuthorizationMode = "enforce" | "observe";

function getObservedRouteNamespace(normalizedPath: string): string {
  const namespace = normalizedPath.split("/")[1];

  return namespace && observedRouteNamespaces.has(namespace) ? namespace : "unknown";
}

function deny(next: NextFunction): void {
  next(new ServiceError(403, "Acesso negado para esta rota."));
}

function isInstagramOnlyUpdate(body: unknown): boolean {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return false;
  }

  const fields = Object.keys(body);
  return fields.length === 1 && fields[0] === "instagram";
}

export function buildAuthorizeMiddleware(
  mode: GatewayAuthorizationMode,
  logger?: Pick<Logger, "warn">,
) {
  return function authorizeRequest(
    request: Request,
    _response: Response,
    next: NextFunction,
  ): void {
    const normalizedPath = normalizeGatewayPath(request.originalUrl);
    if (!normalizedPath) {
      deny(next);
      return;
    }

    if (isPublicRoute(request.method, normalizedPath)) {
      next();
      return;
    }

    if (!request.auth) {
      next(new ServiceError(401, "Não autenticado."));
      return;
    }

    const routePolicy = getRoutePolicy(request.method, normalizedPath);
    if (!routePolicy) {
      if (mode === "observe") {
        logger?.warn({
          event: "authorization.unclassified_route",
          message: "Unclassified gateway route allowed in observation mode",
          authorization: {
            method: request.method.toUpperCase(),
            routeNamespace: getObservedRouteNamespace(normalizedPath),
          },
        });
        next();
        return;
      }

      deny(next);
      return;
    }

    const isClientIntegrationUpdate =
      request.method.toUpperCase() === "PATCH" &&
      /^\/client\/[^/]+\/integration\/?$/.test(normalizedPath);
    const hasIntegrationEditAccess = canAccessRoute(request.auth, {
      modulePermission: { module: "integracao", minPermission: 2 },
    });
    if (
      isClientIntegrationUpdate &&
      !hasIntegrationEditAccess &&
      !isInstagramOnlyUpdate(request.body)
    ) {
      deny(next);
      return;
    }

    const selfUserPutMatch =
      request.method.toUpperCase() === "PUT" ? selfUserPutPath.exec(normalizedPath) : null;
    if (
      request.auth.actorKind === "organization" &&
      request.auth.organizationId.length > 0 &&
      selfUserPutMatch?.[1] === request.auth.userId
    ) {
      next();
      return;
    }

    if (!canAccessRoute(request.auth, routePolicy)) {
      deny(next);
      return;
    }

    next();
  };
}

const enforceAuthorization = buildAuthorizeMiddleware("enforce");

export function authorizeRequest(request: Request, _response: Response, next: NextFunction): void {
  enforceAuthorization(request, _response, next);
}
