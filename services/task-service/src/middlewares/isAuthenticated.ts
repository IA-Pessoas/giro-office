import {
  extractBearerToken,
  FORWARDED_AUTH_MODULES_HEADER,
  FORWARDED_AUTH_ORGANIZATION_ID_HEADER,
  FORWARDED_AUTH_PERMISSION_HEADER,
  FORWARDED_AUTH_TYPE_HEADER,
  FORWARDED_AUTH_USER_ID_HEADER,
  INTERNAL_SERVICE_TOKEN_HEADER,
  error as logError,
  parseModulePermissions,
  ServiceError,
  verifyJwtToken,
} from "@workspace/shared";
import type { NextFunction, Request, Response } from "express";

import { getTaskServiceEnv } from "../config/env.js";

export function isAuthenticated(request: Request, _response: Response, next: NextFunction): void {
  const forwardedUserId = request.get(FORWARDED_AUTH_USER_ID_HEADER);
  const forwardedOrgId = request.get(FORWARDED_AUTH_ORGANIZATION_ID_HEADER);
  const forwardedPermission = request.get(FORWARDED_AUTH_PERMISSION_HEADER);
  const forwardedType = request.get(FORWARDED_AUTH_TYPE_HEADER);
  const forwardedModules = request.get(FORWARDED_AUTH_MODULES_HEADER);
  const internalToken = request.get(INTERNAL_SERVICE_TOKEN_HEADER);
  const { auditServiceToken } = getTaskServiceEnv();

  const isFromGateway =
    internalToken && internalToken === auditServiceToken && forwardedUserId && forwardedOrgId;

  if (isFromGateway) {
    request.user_id = forwardedUserId;
    request.organization_id = forwardedOrgId;
    const parsedPermission = Number.parseInt(forwardedPermission ?? "", 10);
    request.permission = Number.isNaN(parsedPermission) ? undefined : parsedPermission;
    request.user_type =
      forwardedType === "owner" || forwardedType === "admin" || forwardedType === "user"
        ? forwardedType
        : undefined;
    request.modules = parseModulePermissions(forwardedModules ?? undefined);
    next();
    return;
  }

  const authorizationHeader = request.headers.authorization;
  if (!authorizationHeader) {
    next(new ServiceError(401, "Token de autenticação não informado."));
    return;
  }

  try {
    const { jwtSecret } = getTaskServiceEnv();
    const token = extractBearerToken(authorizationHeader);
    const claims = verifyJwtToken(token, jwtSecret);

    request.user_id = claims.user_id;
    request.organization_id = claims.organization_id ?? "";
    request.permission = claims.permission;
    request.user_type = claims.type;
    request.modules = claims.modules;
    next();
  } catch (err) {
    logError("Erro ao validar autenticação", { err });
    next(new ServiceError(401, "Não autenticado."));
  }
}
