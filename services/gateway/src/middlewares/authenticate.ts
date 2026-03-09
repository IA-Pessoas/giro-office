import { authenticateFromAuthHeader, ServiceError } from "@workspace/shared";
import type { NextFunction, Request, Response } from "express";

import { isPublicRoute } from "../security/publicRoutes.js";

export function buildAuthenticateMiddleware(jwtSecret: string) {
  return function authenticate(request: Request, response: Response, next: NextFunction): void {
    if (isPublicRoute(request.method, request.path)) {
      next();
      return;
    }

    try {
      request.auth = authenticateFromAuthHeader(request.headers.authorization, jwtSecret);
      next();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Não autenticado.";
      next(new ServiceError(401, message, error));
    }
  };
}
