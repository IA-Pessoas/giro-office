import type { NextFunction, Request, Response } from "express";
import { authenticateTaskRequest } from "../auth.js";
import { currentTaskContext } from "../context.js";

/**
 * Substitui `services/task-service/src/middlewares/isAuthenticated.ts` no bundle pela
 * auth dos Workers: contexto encaminhado pelo gateway com INTERNAL_SERVICE_TOKEN
 * (o Node comparava com o AUDIT_SERVICE_TOKEN), Bearer JWT, e cookie de sessão com
 * CSRF em mutações e validação da sessão no user-service.
 */
export function isAuthenticated(request: Request, _response: Response, next: NextFunction): void {
  const headers = new Headers();
  for (const [name, value] of Object.entries(request.headers)) {
    if (value !== undefined) headers.set(name, Array.isArray(value) ? value.join(", ") : value);
  }
  const fetchRequest = new Request(`https://task-service${request.originalUrl}`, {
    method: request.method,
    headers,
  });

  authenticateTaskRequest(fetchRequest, currentTaskContext().env).then((auth) => {
    const { claims } = auth;
    request.user_id = auth.userId;
    request.organization_id = auth.organizationId ?? "";
    request.permission = claims.permission;
    request.user_type = claims.type;
    request.modules = claims.modules as Record<string, number> | undefined;
    next();
  }, next);
}
