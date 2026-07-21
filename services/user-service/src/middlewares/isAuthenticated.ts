import {
  extractBearerToken,
  FORWARDED_AUTH_KIND_HEADER,
  FORWARDED_AUTH_MODULES_HEADER,
  FORWARDED_AUTH_ORGANIZATION_ID_HEADER,
  FORWARDED_AUTH_PERMISSION_HEADER,
  FORWARDED_AUTH_PLATFORM_ROLE_HEADER,
  FORWARDED_AUTH_SUPPORT_MODE_HEADER,
  FORWARDED_AUTH_SUPPORT_ORGANIZATION_ID_HEADER,
  FORWARDED_AUTH_SUPPORT_SESSION_ID_HEADER,
  FORWARDED_AUTH_TYPE_HEADER,
  FORWARDED_AUTH_USER_ID_HEADER,
  INTERNAL_SERVICE_TOKEN_HEADER,
  error as logError,
  ServiceError,
  verifyJwtToken,
} from "@workspace/shared";
import type { NextFunction, Request, Response } from "express";

import { getUserServiceEnv } from "../config/env.js";

function normalizeHeaderValue(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function normalizeUserType(value: string | undefined): "owner" | "admin" | "user" | undefined {
  return value === "owner" || value === "admin" || value === "user" ? value : undefined;
}

function parseForwardedModules(
  value: string | undefined,
): Record<string, number | null> | undefined {
  if (!value) {
    return undefined;
  }

  try {
    const parsed = JSON.parse(value) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return undefined;
    }

    const modules: Record<string, number | null> = {};
    for (const [key, permission] of Object.entries(parsed)) {
      if (typeof permission === "number" || permission === null) {
        modules[key] = permission;
      }
    }

    return modules;
  } catch {
    return undefined;
  }
}

export function isAuthenticated(request: Request, _response: Response, next: NextFunction): void {
  const forwardedUserId = request.get(FORWARDED_AUTH_USER_ID_HEADER);
  const forwardedOrgId = request.get(FORWARDED_AUTH_ORGANIZATION_ID_HEADER);
  const forwardedPermission = request.get(FORWARDED_AUTH_PERMISSION_HEADER);
  const forwardedAuthKind = normalizeHeaderValue(request.get(FORWARDED_AUTH_KIND_HEADER));
  const forwardedPlatformRole = normalizeHeaderValue(
    request.get(FORWARDED_AUTH_PLATFORM_ROLE_HEADER),
  );
  const forwardedSupportMode = normalizeHeaderValue(
    request.get(FORWARDED_AUTH_SUPPORT_MODE_HEADER),
  );
  const forwardedSupportSessionId = normalizeHeaderValue(
    request.get(FORWARDED_AUTH_SUPPORT_SESSION_ID_HEADER),
  );
  const forwardedSupportOrganizationId = normalizeHeaderValue(
    request.get(FORWARDED_AUTH_SUPPORT_ORGANIZATION_ID_HEADER),
  );
  const forwardedType = normalizeHeaderValue(request.get(FORWARDED_AUTH_TYPE_HEADER));
  const forwardedModules = normalizeHeaderValue(request.get(FORWARDED_AUTH_MODULES_HEADER));
  const internalToken = request.get(INTERNAL_SERVICE_TOKEN_HEADER);
  const { auditServiceToken } = getUserServiceEnv();

  const isPlatformForwarded =
    internalToken &&
    internalToken === auditServiceToken &&
    forwardedUserId &&
    forwardedAuthKind === "platform" &&
    forwardedPlatformRole === "super_admin";

  const isOrganizationForwarded =
    internalToken && internalToken === auditServiceToken && forwardedUserId && forwardedOrgId;

  const isFromGateway = isPlatformForwarded || isOrganizationForwarded;

  if (isFromGateway) {
    request.user_id = forwardedUserId;
    request.organization_id = forwardedOrgId ?? forwardedSupportOrganizationId ?? "";
    const parsedPermission =
      forwardedPermission !== undefined ? Number.parseInt(forwardedPermission, 10) : Number.NaN;
    request.permission = Number.isNaN(parsedPermission) ? undefined : parsedPermission;
    request.auth_kind = forwardedAuthKind === "platform" ? "platform" : "organization";
    request.platform_role = forwardedPlatformRole === "super_admin" ? "super_admin" : undefined;
    request.support_mode = forwardedSupportMode === "true";
    request.support_session_id = forwardedSupportSessionId;
    request.support_organization_id = forwardedSupportOrganizationId;
    request.user_type = normalizeUserType(forwardedType);
    request.modules = parseForwardedModules(forwardedModules);
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

    request.user_id = claims.user_id;
    request.organization_id = claims.organization_id ?? "";
    request.permission = claims.permission;
    request.user_type = claims.type;
    request.modules = claims.modules;
    request.auth_kind = claims.auth_kind;
    request.platform_role = claims.platform_role;
    request.support_mode = claims.support_mode;
    request.support_session_id = claims.support_session_id;
    request.support_organization_id = claims.support_organization_id;
    next();
  } catch (err) {
    logError("Erro ao validar autenticação", { err });
    next(new ServiceError(401, "Não autenticado."));
  }
}
