import {
  extractBearerToken,
  FORWARDED_AUTH_ORGANIZATION_ID_HEADER,
  FORWARDED_AUTH_PERMISSION_HEADER,
  FORWARDED_AUTH_USER_ID_HEADER,
  INTERNAL_SERVICE_TOKEN_HEADER,
  error as logError,
  ServiceError,
  verifyJwtToken,
} from "@workspace/shared";
import type { NextFunction, Request, Response } from "express";

import { getRegularizeServiceEnv } from "../config/env.js";

function parseForwardedPermission(headerValue: string | undefined): number | undefined {
  const normalized = headerValue?.trim();
  if (normalized === undefined || normalized === "") {
    return undefined;
  }

  const parsed = Number(normalized);
  return Number.isInteger(parsed) ? parsed : undefined;
}

export function isAuthenticated(request: Request, _response: Response, next: NextFunction): void {
  const forwardedUserId = request.get(FORWARDED_AUTH_USER_ID_HEADER);
  const forwardedOrgId = request.get(FORWARDED_AUTH_ORGANIZATION_ID_HEADER);
  const forwardedPermission = parseForwardedPermission(
    request.get(FORWARDED_AUTH_PERMISSION_HEADER) ?? undefined,
  );
  const internalToken = request.get(INTERNAL_SERVICE_TOKEN_HEADER);
  const { internalServiceToken } = getRegularizeServiceEnv();

  const isFromGateway =
    internalToken && internalToken === internalServiceToken && forwardedUserId && forwardedOrgId;

  if (isFromGateway) {
    request.user_id = forwardedUserId;
    request.organization_id = forwardedOrgId;
    request.permission = forwardedPermission;
    next();
    return;
  }

  const authorizationHeader = request.headers.authorization;
  if (!authorizationHeader) {
    next(new ServiceError(401, "Token de autenticacao nao informado."));
    return;
  }

  try {
    const { jwtSecret } = getRegularizeServiceEnv();
    const token = extractBearerToken(authorizationHeader);
    const claims = verifyJwtToken(token, jwtSecret);

    if (!claims.organization_id) {
      throw new ServiceError(401, "Organizacao autenticada nao informada.");
    }

    request.user_id = claims.user_id;
    request.organization_id = claims.organization_id;
    request.permission =
      claims.type === "owner"
        ? 3
        : claims.modulePermissionsPresent
          ? (claims.modules?.regularize ?? 0)
          : 0;
    next();
  } catch (err) {
    logError("Erro ao validar autenticacao do regularize-service", { err });
    next(new ServiceError(401, "Nao autenticado."));
  }
}
