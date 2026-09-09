import {
  extractBearerToken,
  FORWARDED_AUTH_ORGANIZATION_ID_HEADER,
  FORWARDED_AUTH_USER_ID_HEADER,
  INTERNAL_SERVICE_TOKEN_HEADER,
  ServiceError,
  verifyJwtToken,
} from "@workspace/shared";
import type { NextFunction, Request, Response } from "express";

import { getCommercialServiceEnv } from "../config/env.js";

export function isAuthenticated(request: Request, _response: Response, next: NextFunction): void {
  const forwardedUserId = request.get(FORWARDED_AUTH_USER_ID_HEADER);
  const forwardedOrganizationId = request.get(FORWARDED_AUTH_ORGANIZATION_ID_HEADER);
  const internalToken = request.get(INTERNAL_SERVICE_TOKEN_HEADER);
  const env = getCommercialServiceEnv();

  if (internalToken === env.auditServiceToken && forwardedUserId && forwardedOrganizationId) {
    request.user_id = forwardedUserId;
    request.organization_id = forwardedOrganizationId;
    next();
    return;
  }

  if (!request.headers.authorization) {
    next(new ServiceError(401, "Token de autenticação não informado."));
    return;
  }

  try {
    const claims = verifyJwtToken(extractBearerToken(request.headers.authorization), env.jwtSecret);
    request.user_id = claims.user_id;
    request.organization_id = claims.organization_id ?? "";
    next();
  } catch {
    next(new ServiceError(401, "Não autenticado."));
  }
}
