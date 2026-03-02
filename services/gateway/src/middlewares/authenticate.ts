import type { NextFunction, Request, Response } from "express";
import { authenticateFromAuthHeader } from "@workspace/shared";

import { isPublicRoute } from "../security/publicRoutes.js";

export function buildAuthenticateMiddleware(jwtSecret: string) {
  return function authenticate(request: Request, response: Response, next: NextFunction): void {
    if (isPublicRoute(request.method, request.path)) {
      return next();
    }

    try {
      request.auth = authenticateFromAuthHeader(request.headers.authorization, jwtSecret);
      next();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Não autenticado.";
      response.status(401).json({ error: message });
    }
  };
}
