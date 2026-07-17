import { canAccessRoute, ServiceError } from "@workspace/shared";
import type { NextFunction, Request, Response } from "express";

import { getRoutePolicy } from "../security/policies.js";
import { isPublicRoute } from "../security/publicRoutes.js";

function isPlatformRoute(path: string): boolean {
  return path === "/platform" || path.startsWith("/platform/");
}

export function authorizeRequest(request: Request, _response: Response, next: NextFunction): void {
  if (isPublicRoute(request.method, request.path)) {
    next();
    return;
  }

  if (!request.auth) {
    next(new ServiceError(401, "Não autenticado."));
    return;
  }

  if (
    request.auth.isPlatformAdmin &&
    !request.auth.isSupportMode &&
    !isPlatformRoute(request.path)
  ) {
    next(new ServiceError(403, "Selecione uma organizacao em modo suporte."));
    return;
  }

  const routePolicy = getRoutePolicy(request.method, request.path);
  if (!routePolicy) {
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
