import {
  AUTH_SESSION_COOKIE_NAME,
  CSRF_COOKIE_NAME,
  CSRF_HEADER_NAME,
  extractBearerToken,
  FORWARDED_AUTH_KIND_HEADER,
  FORWARDED_AUTH_PLATFORM_ROLE_HEADER,
  FORWARDED_AUTH_USER_ID_HEADER,
  hashCsrfToken,
  INTERNAL_SERVICE_TOKEN_HEADER,
  readCookie,
  ServiceError,
  verifyCsrfToken,
  verifyJwtToken,
} from "@workspace/shared";
import type { NextFunction, Request, Response } from "express";

import { getUserServiceEnv } from "../config/env.js";
import {
  PlatformAuthService,
  type PlatformSessionClaims,
} from "../services/platformAuthService.js";

function unauthenticated(): ServiceError {
  return new ServiceError(401, "Não autenticado.");
}

export function requirePlatformGatewayAuth(
  request: Request,
  _response: Response,
  next: NextFunction,
): void {
  if (request.get(INTERNAL_SERVICE_TOKEN_HEADER) !== getUserServiceEnv().userServiceInternalToken) {
    next(unauthenticated());
    return;
  }

  if (
    request.get(FORWARDED_AUTH_KIND_HEADER) !== "platform" ||
    request.get(FORWARDED_AUTH_PLATFORM_ROLE_HEADER) !== "super_admin"
  ) {
    next(new ServiceError(403, "Acesso negado."));
    return;
  }

  if (!request.get(FORWARDED_AUTH_USER_ID_HEADER)) {
    next(unauthenticated());
    return;
  }

  next();
}

export function requireUserServiceGatewayToken(
  request: Request,
  _response: Response,
  next: NextFunction,
): void {
  if (request.get(INTERNAL_SERVICE_TOKEN_HEADER) !== getUserServiceEnv().userServiceInternalToken) {
    next(new ServiceError(403, "Acesso negado."));
    return;
  }

  next();
}

function requirePlatformClaims(token: string): PlatformSessionClaims {
  const claims = verifyJwtToken(token, getUserServiceEnv().jwtSecret);
  const sessionVersion = claims.session_version;
  if (claims.auth_kind !== "platform" || claims.platform_role !== "super_admin") {
    throw new ServiceError(403, "Acesso negado.");
  }
  if (
    !claims.user_id ||
    !claims.session_id ||
    typeof sessionVersion !== "number" ||
    !Number.isSafeInteger(sessionVersion) ||
    sessionVersion < 0 ||
    !claims.csrf_hash
  ) {
    throw unauthenticated();
  }

  return {
    user_id: claims.user_id,
    auth_kind: "platform",
    platform_role: "super_admin",
    session_version: sessionVersion,
    session_id: claims.session_id,
    csrf_hash: claims.csrf_hash,
  };
}

export function extractPlatformBearerClaims(request: Request): PlatformSessionClaims {
  return requirePlatformClaims(extractBearerToken(request.headers.authorization));
}

export async function requirePlatformSession(
  request: Request,
  _response: Response,
  next: NextFunction,
): Promise<void> {
  const token = readCookie(request.headers.cookie, AUTH_SESSION_COOKIE_NAME);
  if (!token) {
    next(unauthenticated());
    return;
  }

  try {
    const claims = requirePlatformClaims(token);
    request.platform_identity = await new PlatformAuthService().validateSession(claims);
    request.platform_session = claims;
    next();
  } catch (err: unknown) {
    next(err instanceof ServiceError ? err : unauthenticated());
  }
}

export function requirePlatformCsrf(
  request: Request,
  _response: Response,
  next: NextFunction,
): void {
  requireSessionCsrf(request, request.platform_session?.csrf_hash, next);
}

export function requireImpersonationCsrf(
  request: Request,
  _response: Response,
  next: NextFunction,
): void {
  requireSessionCsrf(request, request.csrf_hash, next);
}

function requireSessionCsrf(
  request: Request,
  expectedHash: string | undefined,
  next: NextFunction,
): void {
  const cookieToken = readCookie(request.headers.cookie, CSRF_COOKIE_NAME);
  const submittedToken = request.get(CSRF_HEADER_NAME);
  if (
    !cookieToken ||
    !submittedToken ||
    !expectedHash ||
    !verifyCsrfToken(submittedToken, hashCsrfToken(cookieToken)) ||
    !verifyCsrfToken(submittedToken, expectedHash)
  ) {
    next(new ServiceError(403, "Requisição não autorizada."));
    return;
  }
  next();
}
