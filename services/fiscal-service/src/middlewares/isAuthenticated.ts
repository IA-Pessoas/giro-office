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

import { getFiscalServiceEnv } from "../config/env.js";

const FISCAL_WRITE_PERMISSION = 1;
const FISCAL_ADMIN_PERMISSION = 3;

function parseForwardedPermission(headerValue: string | undefined): number | undefined {
  if (headerValue === undefined || headerValue === "") {
    return undefined;
  }
  const n = Number.parseInt(headerValue, 10);
  return Number.isNaN(n) ? undefined : n;
}

export function isAuthenticated(request: Request, _response: Response, next: NextFunction): void {
  const forwardedUserId = request.get(FORWARDED_AUTH_USER_ID_HEADER);
  const forwardedOrgId = request.get(FORWARDED_AUTH_ORGANIZATION_ID_HEADER);
  const forwardedPermission = parseForwardedPermission(
    request.get(FORWARDED_AUTH_PERMISSION_HEADER) ?? undefined,
  );
  const internalToken = request.get(INTERNAL_SERVICE_TOKEN_HEADER);
  const { auditServiceToken } = getFiscalServiceEnv();

  const isFromGateway =
    internalToken && internalToken === auditServiceToken && forwardedUserId && forwardedOrgId;

  if (isFromGateway) {
    request.user_id = forwardedUserId;
    request.organization_id = forwardedOrgId;
    request.permission = forwardedPermission;
    next();
    return;
  }

  const authorizationHeader = request.headers.authorization;
  if (!authorizationHeader) {
    next(new ServiceError(401, "Token de autenticação não informado."));
    return;
  }

  try {
    const { jwtSecret } = getFiscalServiceEnv();
    const token = extractBearerToken(authorizationHeader);
    const claims = verifyJwtToken(token, jwtSecret);

    request.user_id = claims.user_id;
    request.organization_id = claims.organization_id ?? "";
    request.permission = claims.permission;
    next();
  } catch (err) {
    logError("Erro ao validar autenticação", { err });
    next(new ServiceError(401, "Não autenticado."));
  }
}

export function requireFiscalWritePermission(
  request: Request,
  _response: Response,
  next: NextFunction,
): void {
  if (Number(request.permission ?? 0) < FISCAL_WRITE_PERMISSION) {
    next(new ServiceError(403, "Permissao insuficiente para alterar dados fiscais."));
    return;
  }

  next();
}

export function requireFiscalAdminPermission(
  request: Request,
  _response: Response,
  next: NextFunction,
): void {
  if (Number(request.permission ?? 0) < FISCAL_ADMIN_PERMISSION) {
    next(new ServiceError(403, "Permissao insuficiente para excluir dados fiscais."));
    return;
  }

  next();
}
