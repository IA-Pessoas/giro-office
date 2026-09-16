import {
  extractBearerToken,
  FORWARDED_AUTH_MODULES_HEADER,
  FORWARDED_AUTH_ORGANIZATION_ID_HEADER,
  FORWARDED_AUTH_PERMISSION_HEADER,
  FORWARDED_AUTH_USER_ID_HEADER,
  INTERNAL_SERVICE_TOKEN_HEADER,
  error as logError,
  normalizeModulePermissions,
  parseModulePermissions,
  ServiceError,
  verifyJwtToken,
} from "@workspace/shared";
import type { NextFunction, Request, Response } from "express";

import { getContabilServiceEnv } from "../config/env.js";

const CONTABIL_WRITE_PERMISSION = 2;

function parseForwardedPermission(headerValue: string | undefined): number | undefined {
  if (headerValue === undefined || headerValue === "") {
    return undefined;
  }
  const n = Number.parseInt(headerValue, 10);
  return Number.isNaN(n) ? undefined : n;
}

function getContabilPermission(claims: {
  modules?: { contabil?: number };
  modulePermissionsPresent?: boolean;
  permission?: number;
}): number | undefined {
  return claims.modulePermissionsPresent ? (claims.modules?.contabil ?? 0) : claims.permission;
}

export function requireContabilWritePermission(
  request: Request,
  _response: Response,
  next: NextFunction,
): void {
  if (Number(request.permission ?? 0) < CONTABIL_WRITE_PERMISSION) {
    next(new ServiceError(403, "Permissao insuficiente para alterar dados contabeis."));
    return;
  }

  next();
}

export function isAuthenticated(request: Request, _response: Response, next: NextFunction): void {
  const env = getContabilServiceEnv();
  const forwardedUserId = request.get(FORWARDED_AUTH_USER_ID_HEADER);
  const forwardedOrgId = request.get(FORWARDED_AUTH_ORGANIZATION_ID_HEADER);
  const forwardedPermission = parseForwardedPermission(
    request.get(FORWARDED_AUTH_PERMISSION_HEADER) ?? undefined,
  );
  const internalToken = request.get(INTERNAL_SERVICE_TOKEN_HEADER);
  const forwardedModules = request.get(FORWARDED_AUTH_MODULES_HEADER);

  const isFromGateway =
    internalToken &&
    internalToken === env.internalServiceToken &&
    forwardedUserId &&
    forwardedOrgId;

  if (isFromGateway) {
    request.user_id = forwardedUserId;
    request.organization_id = forwardedOrgId;
    request.permission = forwardedPermission;
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
    const token = extractBearerToken(authorizationHeader);
    const claims = verifyJwtToken(token, env.jwtSecret);

    request.user_id = claims.user_id;
    request.organization_id = claims.organization_id ?? "";
    request.permission = getContabilPermission(claims);
    request.modules = normalizeModulePermissions(claims.modules);
    next();
  } catch (err) {
    logError("Erro ao validar autenticação", { err });
    next(new ServiceError(401, "Não autenticado."));
  }
}
