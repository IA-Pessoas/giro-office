import { INTERNAL_SERVICE_TOKEN_HEADER, ServiceError } from "@workspace/shared/http";
import type { RequestHandler } from "express";

export function createInternalServiceTokenMiddleware(expectedToken: string): RequestHandler {
  return (request, _response, next) => {
    if (request.get(INTERNAL_SERVICE_TOKEN_HEADER) !== expectedToken) {
      next(new ServiceError(401, "Não autenticado."));
      return;
    }

    next();
  };
}
