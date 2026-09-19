import {
  extractBearerToken,
  INTERNAL_SERVICE_TOKEN_HEADER,
  normalizeModulePermissions,
  ServiceError,
  verifyJwtToken,
} from "@workspace/shared";
import type { NextFunction, Request, Response } from "express";

import { getTriagemServiceEnv } from "../config/env.js";

export function isAuthenticated(request: Request, _response: Response, next: NextFunction): void {
  const env = getTriagemServiceEnv();
  const context = request.triagemContext;
  const forwardedUserId = context?.userId;
  const forwardedOrganizationId = context?.organizationId;
  const internalToken = request.get(INTERNAL_SERVICE_TOKEN_HEADER);

  if (internalToken === env.internalServiceToken && forwardedUserId && forwardedOrganizationId) {
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
    request.triagemContext = {
      requestId: context?.requestId ?? "missing",
      userId: claims.user_id,
      organizationId: claims.organization_id ?? undefined,
      permission: claims.permission,
      modules: normalizeModulePermissions(claims.modules),
    };
    next();
  } catch (error: unknown) {
    next(new ServiceError(401, "Não autenticado.", error));
  }
}
