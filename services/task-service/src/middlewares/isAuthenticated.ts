import {
  FORWARDED_AUTH_ORGANIZATION_ID_HEADER,
  FORWARDED_AUTH_USER_ID_HEADER,
  INTERNAL_SERVICE_TOKEN_HEADER,
  extractBearerToken,
  verifyJwtToken,
} from "@workspace/shared";
import type { NextFunction, Request, Response } from "express";

import { getTaskServiceEnv } from "../config/env.js";

export function isAuthenticated(
  request: Request,
  response: Response,
  next: NextFunction,
): void {
  const forwardedUserId = request.get(FORWARDED_AUTH_USER_ID_HEADER);
  const forwardedOrgId = request.get(FORWARDED_AUTH_ORGANIZATION_ID_HEADER);
  const internalToken = request.get(INTERNAL_SERVICE_TOKEN_HEADER);
  const { auditServiceToken } = getTaskServiceEnv();

  const isFromGateway =
    internalToken &&
    internalToken === auditServiceToken &&
    forwardedUserId &&
    forwardedOrgId;

  if (isFromGateway) {
    request.user_id = forwardedUserId;
    request.organization_id = forwardedOrgId;
    next();
    return;
  }

  const authorizationHeader = request.headers.authorization;
  if (!authorizationHeader) {
    response.status(401).json({ error: "Token de autenticação não informado." });
    return;
  }

  try {
    const { jwtSecret } = getTaskServiceEnv();
    const token = extractBearerToken(authorizationHeader);
    const claims = verifyJwtToken(token, jwtSecret);

    request.user_id = claims.user_id;
    request.organization_id = claims.organization_id ?? "";
    next();
  } catch {
    response.status(401).json({ error: "Não autenticado." });
  }
}
