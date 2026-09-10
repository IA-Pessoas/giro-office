import { INTERNAL_SERVICE_TOKEN_HEADER, ServiceError } from "@workspace/shared";
import type { NextFunction, Request, Response } from "express";

import type { TaskServiceEnv } from "../config/env.js";

export function requireCommercialServiceToken(env: TaskServiceEnv) {
  return function commercialServiceTokenMiddleware(
    request: Request,
    _response: Response,
    next: NextFunction,
  ): void {
    if (request.get(INTERNAL_SERVICE_TOKEN_HEADER) !== env.commercialServiceToken) {
      next(new ServiceError(403, "Acesso negado."));
      return;
    }
    next();
  };
}
