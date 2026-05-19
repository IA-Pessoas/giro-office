import { requireAuthenticatedRequestContext, ServiceError } from "@workspace/shared";
import type { NextFunction, Request, RequestHandler, Response } from "express";

export function requireTiPermission(minPermission: number): RequestHandler {
  return function requireTiPermissionMiddleware(
    request: Request,
    _response: Response,
    next: NextFunction,
  ): void {
    try {
      const authContext = requireAuthenticatedRequestContext(request);

      if (typeof authContext.permission !== "number" || authContext.permission < minPermission) {
        next(new ServiceError(403, "Permissao insuficiente para acessar o ti-service."));
        return;
      }

      next();
    } catch (error) {
      next(error);
    }
  };
}
