import { canAccessRoute, ServiceError } from "@workspace/shared";
import type { NextFunction, Request, Response } from "express";

import { getRoutePolicy } from "../security/policies.js";
import { isPublicRoute } from "../security/publicRoutes.js";

const selfUserPutPath = /^\/user\/(?!me$|session$|start-config$|permission\/)([^/]+)$/;

export function authorizeRequest(request: Request, _response: Response, next: NextFunction): void {
  if (isPublicRoute(request.method, request.path)) {
    next();
    return;
  }

  if (!request.auth) {
    next(new ServiceError(401, "Não autenticado."));
    return;
  }

  const routePolicy = getRoutePolicy(request.method, request.path);
  if (!routePolicy) {
    next();
    return;
  }

  const selfUserPutMatch =
    request.method.toUpperCase() === "PUT" ? selfUserPutPath.exec(request.path) : null;
  if (selfUserPutMatch?.[1] === request.auth.userId) {
    next();
    return;
  }

  const authorized = canAccessRoute(request.auth, routePolicy);
  if (!authorized) {
    next(new ServiceError(403, "Acesso negado para esta rota."));
    return;
  }

  next();
}
