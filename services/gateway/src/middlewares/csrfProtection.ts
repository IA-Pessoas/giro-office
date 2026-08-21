import {
  CSRF_COOKIE_NAME,
  CSRF_HEADER_NAME,
  hashCsrfToken,
  readCookie,
  ServiceError,
  verifyCsrfToken,
} from "@workspace/shared";
import type { Logger } from "@workspace/shared/logger";
import type { NextFunction, Request, RequestHandler, Response } from "express";

import { isPublicRoute } from "../security/publicRoutes.js";

const UNSAFE_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);
const CSRF_TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/u;

export interface CsrfProtectionOptions {
  allowedOrigins: string[];
  logger: Logger;
}

type CsrfRejectionReason =
  | "missing"
  | "mismatch"
  | "wrong_session"
  | "invalid_origin"
  | "oversized";

function originIsAllowed(request: Request, allowedOrigins: string[]): boolean {
  const origin = request.get("origin");
  if (origin) {
    return origin !== "null" && (allowedOrigins.includes("*") || allowedOrigins.includes(origin));
  }

  const referer = request.get("referer");
  if (!referer) {
    return true;
  }

  try {
    const refererOrigin = new URL(referer).origin;
    return allowedOrigins.includes("*") || allowedOrigins.includes(refererOrigin);
  } catch {
    return false;
  }
}

export function buildCsrfProtectionMiddleware({
  allowedOrigins,
  logger,
}: CsrfProtectionOptions): RequestHandler {
  return function csrfProtection(request: Request, _response: Response, next: NextFunction): void {
    if (
      isPublicRoute(request.method, request.path) ||
      !UNSAFE_METHODS.has(request.method.toUpperCase()) ||
      request.authTransport === "bearer"
    ) {
      next();
      return;
    }

    const reject = (reason: CsrfRejectionReason): void => {
      logger.warn({
        event: "auth.csrf.rejected",
        reason,
        message: "Session-bound CSRF validation rejected",
      });
      next(new ServiceError(403, "Requisição não autorizada."));
    };

    if (!originIsAllowed(request, allowedOrigins)) {
      reject("invalid_origin");
      return;
    }

    const cookieToken = readCookie(request.headers.cookie, CSRF_COOKIE_NAME);
    const submittedToken = request.get(CSRF_HEADER_NAME);
    const expectedHash = request.auth?.claims.csrf_hash;

    if (!cookieToken || !submittedToken || !expectedHash) {
      reject("missing");
      return;
    }

    if (cookieToken.length > 43 || submittedToken.length > 43) {
      reject("oversized");
      return;
    }

    if (!CSRF_TOKEN_PATTERN.test(cookieToken) || !CSRF_TOKEN_PATTERN.test(submittedToken)) {
      reject("mismatch");
      return;
    }

    if (!verifyCsrfToken(submittedToken, hashCsrfToken(cookieToken))) {
      reject("mismatch");
      return;
    }

    if (!verifyCsrfToken(submittedToken, expectedHash)) {
      reject("wrong_session");
      return;
    }

    next();
  };
}
