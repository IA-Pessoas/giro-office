import {
  AUTH_SESSION_TRANSPORT_HEADER,
  extractBearerToken,
  FORWARDED_AUTH_CSRF_HASH_HEADER,
  FORWARDED_AUTH_MODULES_HEADER,
  FORWARDED_AUTH_ORGANIZATION_ID_HEADER,
  FORWARDED_AUTH_PERMISSION_HEADER,
  FORWARDED_AUTH_SESSION_ID_HEADER,
  FORWARDED_AUTH_SESSION_VERSION_HEADER,
  FORWARDED_AUTH_TYPE_HEADER,
  FORWARDED_AUTH_USER_ID_HEADER,
  INTERNAL_SERVICE_TOKEN_HEADER,
  error as logError,
  normalizeModulePermissions,
  ServiceError,
  verifyJwtToken,
} from "@workspace/shared";
import type { NextFunction, Request, Response } from "express";

import { getUserServiceEnv } from "../config/env.js";
import { AuthService } from "../services/authService.js";

function normalizeHeaderValue(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function normalizeUserType(value: string | undefined): "owner" | "admin" | "user" | undefined {
  return value === "owner" || value === "admin" || value === "user" ? value : undefined;
}

function parseForwardedModules(value: string | undefined): Record<string, number> | undefined {
  if (!value) {
    return undefined;
  }

  try {
    const parsed = JSON.parse(value) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return undefined;
    }

    return normalizeModulePermissions(parsed);
  } catch {
    return undefined;
  }
}

export async function isAuthenticated(
  request: Request,
  _response: Response,
  next: NextFunction,
): Promise<void> {
  const forwardedUserId = request.get(FORWARDED_AUTH_USER_ID_HEADER);
  const forwardedOrgId = request.get(FORWARDED_AUTH_ORGANIZATION_ID_HEADER);
  const forwardedPermission = request.get(FORWARDED_AUTH_PERMISSION_HEADER);
  const forwardedType = normalizeHeaderValue(request.get(FORWARDED_AUTH_TYPE_HEADER));
  const forwardedModules = normalizeHeaderValue(request.get(FORWARDED_AUTH_MODULES_HEADER));
  const internalToken = request.get(INTERNAL_SERVICE_TOKEN_HEADER);
  const { userServiceInternalToken } = getUserServiceEnv();

  const isFromGateway =
    internalToken &&
    internalToken === userServiceInternalToken &&
    forwardedUserId &&
    forwardedOrgId;

  if (isFromGateway) {
    request.user_id = forwardedUserId;
    request.organization_id = forwardedOrgId;
    const parsedPermission =
      forwardedPermission !== undefined ? Number.parseInt(forwardedPermission, 10) : Number.NaN;
    request.permission = Number.isNaN(parsedPermission) ? undefined : parsedPermission;
    request.user_type = normalizeUserType(forwardedType);
    request.modules = parseForwardedModules(forwardedModules);
    const forwardedSessionVersion = request.get(FORWARDED_AUTH_SESSION_VERSION_HEADER);
    const parsedSessionVersion = Number.parseInt(forwardedSessionVersion ?? "", 10);
    request.session_version = Number.isNaN(parsedSessionVersion) ? undefined : parsedSessionVersion;
    request.session_id = request.get(FORWARDED_AUTH_SESSION_ID_HEADER);
    request.csrf_hash = request.get(FORWARDED_AUTH_CSRF_HASH_HEADER);
    next();
    return;
  }

  const authorizationHeader = request.headers.authorization;
  if (!authorizationHeader) {
    next(new ServiceError(401, "Token de autenticação não informado."));
    return;
  }

  try {
    const { jwtSecret } = getUserServiceEnv();
    const token = extractBearerToken(authorizationHeader);
    const claims = verifyJwtToken(token, jwtSecret);

    const allowLegacyBearer =
      internalToken === userServiceInternalToken &&
      request.get(AUTH_SESSION_TRANSPORT_HEADER) === "bearer";
    await new AuthService().validateSession(claims, { allowLegacyBearer });

    request.user_id = claims.user_id;
    request.organization_id = claims.organization_id ?? "";
    request.permission = claims.permission;
    request.user_type = claims.type;
    request.modules = claims.modules;
    request.session_version = claims.session_version;
    request.session_id = claims.session_id;
    request.csrf_hash = claims.csrf_hash;
    next();
  } catch (err) {
    logError("Erro ao validar autenticação", { err });
    next(new ServiceError(401, "Não autenticado."));
  }
}
