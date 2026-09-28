import { requireAuthenticatedRequestContext, ServiceError } from "@workspace/shared";
import type { NextFunction, Request, RequestHandler, Response } from "express";

export enum MarketingPermissionLevel {
  Viewer = 1,
  Editor = 2,
}

export function requireMarketingPermission(minimum: MarketingPermissionLevel): RequestHandler {
  return function marketingPermission(request: Request, _response: Response, next: NextFunction) {
    try {
      const auth = requireAuthenticatedRequestContext(request);
      if (typeof auth.permission !== "number" || auth.permission < minimum) {
        next(new ServiceError(403, "Permissão insuficiente para acessar o Marketing."));
        return;
      }

      next();
    } catch (error: unknown) {
      next(error);
    }
  };
}
