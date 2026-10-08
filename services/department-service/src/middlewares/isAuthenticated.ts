import {
  extractBearerToken,
  FORWARDED_AUTH_MODULES_HEADER,
  FORWARDED_AUTH_ORGANIZATION_ID_HEADER,
  FORWARDED_AUTH_TYPE_HEADER,
  FORWARDED_AUTH_USER_ID_HEADER,
  INTERNAL_SERVICE_TOKEN_HEADER,
  error as logError,
  normalizeModulePermissions,
  parseModulePermissions,
  ServiceError,
  verifyJwtToken,
} from "@workspace/shared";
import type { NextFunction, Request, Response } from "express";

import { getDepartmentServiceEnv } from "../config/env.js";

export function isAuthenticated(request: Request, _response: Response, next: NextFunction): void {
  const forwardedUserId = request.get(FORWARDED_AUTH_USER_ID_HEADER);
  const forwardedOrgId = request.get(FORWARDED_AUTH_ORGANIZATION_ID_HEADER);
  const forwardedModules = request.get(FORWARDED_AUTH_MODULES_HEADER);
  const forwardedType = request.get(FORWARDED_AUTH_TYPE_HEADER);
  const internalToken = request.get(INTERNAL_SERVICE_TOKEN_HEADER);
  const { auditServiceToken } = getDepartmentServiceEnv();

  const isFromGateway =
    internalToken && internalToken === auditServiceToken && forwardedUserId && forwardedOrgId;

  if (isFromGateway) {
    request.user_id = forwardedUserId;
    request.organization_id = forwardedOrgId;
    request.modules = parseModulePermissions(forwardedModules ?? undefined);
    request.user_type = normalizeUserType(forwardedType ?? undefined);
    next();
    return;
  }

  const authorizationHeader = request.headers.authorization;
  if (!authorizationHeader) {
    next(new ServiceError(401, "Token de autenticação não informado."));
    return;
  }

  try {
    const { jwtSecret } = getDepartmentServiceEnv();
    const token = extractBearerToken(authorizationHeader);
    const claims = verifyJwtToken(token, jwtSecret);

    request.user_id = claims.user_id;
    request.organization_id = claims.organization_id ?? "";
    request.modules = normalizeModulePermissions(claims.modules);
    request.user_type = normalizeUserType(claims.type);
    next();
  } catch (err) {
    logError("Erro ao validar autenticação", { err });
    next(new ServiceError(401, "Não autenticado."));
  }
}

function normalizeUserType(value: string | undefined): "owner" | "admin" | "user" | undefined {
  return value === "owner" || value === "admin" || value === "user" ? value : undefined;
}
