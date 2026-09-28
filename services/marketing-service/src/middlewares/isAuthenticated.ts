import {
  extractBearerToken,
  FORWARDED_AUTH_ORGANIZATION_ID_HEADER,
  FORWARDED_AUTH_USER_ID_HEADER,
  INTERNAL_SERVICE_TOKEN_HEADER,
  ServiceError,
  verifyJwtToken,
} from "@workspace/shared";
import type { NextFunction, Request, RequestHandler, Response } from "express";

import type { MarketingServiceEnv } from "../config/env.js";

export function createIsAuthenticatedMiddleware(env: MarketingServiceEnv): RequestHandler {
  return function isAuthenticated(request: Request, _response: Response, next: NextFunction): void {
    const internalToken = request.get(INTERNAL_SERVICE_TOKEN_HEADER);
    const forwardedUserId = request.get(FORWARDED_AUTH_USER_ID_HEADER);
    const forwardedOrganizationId = request.get(FORWARDED_AUTH_ORGANIZATION_ID_HEADER);

    if (internalToken === env.internalServiceToken && forwardedUserId && forwardedOrganizationId) {
      request.user_id = forwardedUserId;
      request.organization_id = forwardedOrganizationId;
      next();
      return;
    }

    const authorizationHeader = request.headers.authorization;
    if (!authorizationHeader) {
      next(new ServiceError(401, "Token de autenticação não informado."));
      return;
    }

    try {
      const claims = verifyJwtToken(extractBearerToken(authorizationHeader), env.jwtSecret);
      request.user_id = claims.user_id;
      request.organization_id = claims.organization_id ?? "";
      request.permission = claims.modules?.marketing ?? claims.permission;
      next();
    } catch (error: unknown) {
      next(new ServiceError(401, "Não autenticado.", error));
    }
  };
}
