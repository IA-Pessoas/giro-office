import {
  extractBearerToken,
  FORWARDED_AUTH_MODULES_HEADER,
  FORWARDED_AUTH_ORGANIZATION_ID_HEADER,
  FORWARDED_AUTH_PERMISSION_HEADER,
  FORWARDED_AUTH_TYPE_HEADER,
  FORWARDED_AUTH_USER_ID_HEADER,
  INTERNAL_SERVICE_TOKEN_HEADER,
  normalizeModulePermissions,
  parseModulePermissions,
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
    const forwardedModules = request.get(FORWARDED_AUTH_MODULES_HEADER);

    if (internalToken === env.internalServiceToken && forwardedUserId && forwardedOrganizationId) {
      const modules = parseModulePermissions(forwardedModules ?? undefined);
      request.user_id = forwardedUserId;
      request.organization_id = forwardedOrganizationId;
      request.modules = modules;
      request.user_type = normalizeUserType(request.get(FORWARDED_AUTH_TYPE_HEADER) ?? undefined);
      request.permission = forwardedModules
        ? modules?.marketing
        : parsePermission(request.get(FORWARDED_AUTH_PERMISSION_HEADER) ?? undefined);
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
      request.modules = normalizeModulePermissions(claims.modules);
      request.user_type = normalizeUserType(claims.type);
      request.permission = claims.modules ? request.modules.marketing : claims.permission;
      next();
    } catch (error: unknown) {
      next(new ServiceError(401, "Não autenticado.", error));
    }
  };
}

function parsePermission(value: string | undefined): number | undefined {
  if (value === undefined || value === "") return undefined;
  const permission = Number(value);
  return Number.isInteger(permission) && permission >= 0 ? permission : undefined;
}

function normalizeUserType(value: string | undefined): "owner" | "admin" | "user" | undefined {
  return value === "owner" || value === "admin" || value === "user" ? value : undefined;
}
