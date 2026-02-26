import type { NextFunction, Request, Response } from "express";
import { canAccessRoute } from "@workspace/shared";

import { getRoutePolicy } from "../security/policies.js";
import { isPublicRoute } from "../security/publicRoutes.js";

export function authorizeRequest(request: Request, response: Response, next: NextFunction): void {
  if (isPublicRoute(request.method, request.path)) {
    next();
    return;
  }

  if (!request.auth) {
    response.status(401).json({ error: "Não autenticado." });
    return;
  }

  const routePolicy = getRoutePolicy(request.method, request.path);
  if (!routePolicy) {
    next();
    return;
  }

  const authorized = canAccessRoute(request.auth, routePolicy);
  if (!authorized) {
    response.status(403).json({ error: "Acesso negado para esta rota." });
    return;
  }

  next();
}
