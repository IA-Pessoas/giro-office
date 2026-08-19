import { canAccessRoute, type Logger, ServiceError } from "@workspace/shared";
import type { NextFunction, Request, Response } from "express";

import { getRoutePolicy } from "../security/policies.js";
import { isPublicRoute } from "../security/publicRoutes.js";
import { normalizeGatewayPath } from "../security/routeClassification.js";

const selfUserPutPath = /^\/user\/(?!me$|session$|permission\/)([^/]+)$/;
const observedRouteNamespaces = new Set([
  "audit",
  "certificate",
  "client",
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

    const selfUserPutMatch =
      request.method.toUpperCase() === "PUT" ? selfUserPutPath.exec(normalizedPath) : null;
    if (selfUserPutMatch?.[1] === request.auth.userId) {
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
