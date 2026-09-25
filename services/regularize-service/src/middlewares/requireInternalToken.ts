import { INTERNAL_SERVICE_TOKEN_HEADER, ServiceError } from "@workspace/shared";
import type { NextFunction, Request, Response } from "express";

import type { RegularizeServiceEnv } from "../config/env.js";

export function requireInternalToken(env: RegularizeServiceEnv) {
  return function requireInternalTokenMiddleware(
    request: Request,
    _response: Response,
    next: NextFunction,
  ): void {
    if (!env.internalServiceToken) {
      next(new ServiceError(503, "Endpoint interno não configurado."));
      return;
    }

    const header = request.headers[INTERNAL_SERVICE_TOKEN_HEADER];
    if (typeof header !== "string") {
      next(new ServiceError(401, "Token interno não informado."));
      return;
    }

    const token = header;
    if (token !== env.internalServiceToken) {
      next(new ServiceError(403, "Acesso negado."));
      return;
    }

    next();
  };
}
