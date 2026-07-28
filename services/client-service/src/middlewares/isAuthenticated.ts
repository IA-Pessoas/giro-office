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

import { getClientServiceEnv } from "../config/env.js";

type JwtClaims = {
  user_id: string;
  organization_id?: string;
  permission?: number;
  type?: "owner" | "admin" | "user";
  modules?: Record<string, number>;
};

function parseForwardedPermission(headerValue: string | undefined): number | undefined {
  if (headerValue === undefined || headerValue === "") {
    return undefined;
  }

  const parsed = Number.parseInt(headerValue, 10);
  return Number.isNaN(parsed) ? undefined : parsed;
}

function isValidClaims(claims: unknown): claims is JwtClaims {
  if (!claims || typeof claims !== "object") {
    return false;
  }

  const value = claims as Record<string, unknown>;

  if (typeof value.user_id !== "string" || value.user_id.length === 0) {
    return false;
  }

  if (value.organization_id !== undefined && typeof value.organization_id !== "string") {
    return false;
  }

  return true;
}

export async function isAuthenticated(
  request: Request,
  response: Response,
  next: NextFunction,
): Promise<void> {
  const forwardedUserId = request.get(FORWARDED_AUTH_USER_ID_HEADER);
  const forwardedOrganizationId = request.get(FORWARDED_AUTH_ORGANIZATION_ID_HEADER);
  const internalServiceToken = request.get(INTERNAL_SERVICE_TOKEN_HEADER);
  const { internalServiceToken: expectedInternalServiceToken } = getClientServiceEnv();

  if (
    internalServiceToken &&
    internalServiceToken === expectedInternalServiceToken &&
    forwardedUserId &&
    forwardedOrganizationId
  ) {
    request.user_id = forwardedUserId;
    request.organization_id = forwardedOrganizationId;
    request.permission = parseForwardedPermission(
      request.get(FORWARDED_AUTH_PERMISSION_HEADER) ?? undefined,
    );
    request.user_type = request.get(FORWARDED_AUTH_TYPE_HEADER) as
      | "owner"
      | "admin"
      | "user"
      | undefined;
    request.modules = parseModulePermissions(
      request.get(FORWARDED_AUTH_MODULES_HEADER) ?? undefined,
    );
    next();
    return;
  }

  const authorizationHeader = request.headers.authorization;

  if (!authorizationHeader) {
    next(new ServiceError(401, "Token de autenticação não informado."));
    return;
  }

  try {
    const { jwtSecret } = getClientServiceEnv();
    const token = extractBearerToken(authorizationHeader);
    const claims = verifyJwtToken(token, jwtSecret);

    if (!isValidClaims(claims)) {
      response.status(401).json({ error: "Token inválido." });
      return;
    }

    const headerUserId = request.headers.user_id;
    const headerOrganizationId = request.headers.organization_id;

    if (headerUserId && headerUserId !== claims.user_id) {
      response.status(400).json({
        error: "Cabeçalho user_id não corresponde ao token.",
      });
      return;
    }

    if (headerOrganizationId && headerOrganizationId !== claims.organization_id) {
      response.status(400).json({
        error: "Cabeçalho organization_id não corresponde ao token.",
      });
      return;
    }

    request.user_id = claims.user_id;
    request.organization_id = claims.organization_id ?? "";
    request.permission = typeof claims.permission === "number" ? claims.permission : undefined;
    request.user_type = claims.type;
    request.modules = claims.modules;

    next();
  } catch (err) {
    logError("Erro ao validar autenticação", { err });
    next(new ServiceError(401, "Não autenticado."));
  }
}
