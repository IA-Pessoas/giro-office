import { ServiceError } from "@workspace/shared";
import type { RequestHandler } from "express";

export function createAuditEnabledMiddleware(auditEnabled: boolean): RequestHandler {
  return (_request, _response, next) => {
    if (!auditEnabled) {
      next(new ServiceError(404, "Recurso não encontrado."));
      return;
    }

    next();
  };
}
