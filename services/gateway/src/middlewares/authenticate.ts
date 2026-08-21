import {
  AUTH_SESSION_COOKIE_NAME,
  AUTH_SESSION_TRANSPORT_HEADER,
  authenticateFromAuthHeader,
  authenticateFromToken,
  INTERNAL_SERVICE_TOKEN_HEADER,
  readCookie,
  ServiceError,
} from "@workspace/shared";
import type { Logger } from "@workspace/shared/logger";
import type { NextFunction, Request, RequestHandler, Response } from "express";

import { isPublicRoute } from "../security/publicRoutes.js";

export type SessionValidator = (token: string, transport: "cookie" | "bearer") => Promise<void>;

export function createUserServiceSessionValidator(
  userServiceUrl: string,
  internalServiceToken: string,
): SessionValidator {
  const validationUrl = new URL("/user/session/validate", userServiceUrl);

  return async (token: string, transport: "cookie" | "bearer"): Promise<void> => {
    let response: globalThis.Response;

    try {
      response = await fetch(validationUrl, {
        headers: {
          authorization: `Bearer ${token}`,
          [AUTH_SESSION_TRANSPORT_HEADER]: transport,
          [INTERNAL_SERVICE_TOKEN_HEADER]: internalServiceToken,
        },
      });
    } catch (error) {
      throw new ServiceError(503, "Não foi possível validar a sessão.", error);
    }

    if (!response.ok) {
      const statusCode = response.status === 401 || response.status === 409 ? response.status : 503;
      throw new ServiceError(statusCode, "Sessão inválida.");
    }
  };
}

export interface AuthenticateMiddlewareOptions {
  jwtSecret: string;
  sessionValidator?: SessionValidator;
  bearerAuthCompatibility: boolean;
  authCookieSecure: boolean;
  logger: Logger;
}

export function buildAuthenticateMiddleware(
  options: AuthenticateMiddlewareOptions,
): RequestHandler {
  return async function authenticate(
    request: Request,
    response: Response,
    next: NextFunction,
  ): Promise<void> {
    if (isPublicRoute(request.method, request.path)) {
      next();
      return;
    }

    const cookieToken = readCookie(request.headers.cookie, AUTH_SESSION_COOKIE_NAME);
    const usingCookie = cookieToken !== undefined;
    let failureReason = "invalid_token";

    try {
      if (usingCookie) {
        request.auth = authenticateFromToken(cookieToken, options.jwtSecret);
        request.authTransport = "cookie";
      } else {
        if (!options.bearerAuthCompatibility) {
          throw new ServiceError(401, "Sessão de autenticação não informada.");
        }
        request.auth = authenticateFromAuthHeader(request.headers.authorization, options.jwtSecret);
        request.authTransport = "bearer";
      }

      if (options.sessionValidator) {
        failureReason = "session_validation";
        await options.sessionValidator(request.auth.token, request.authTransport);
      }

      if (!usingCookie) {
        options.logger.info({
          event: "auth.bearer_compat.accepted",
          message: "Bearer compatibility accepted",
        });
      }
      next();
    } catch (error) {
      if (usingCookie) {
        options.logger.warn({
          event: "auth.session.validation.failed",
          reason: failureReason,
          message: "Cookie session validation failed",
        });
      }
      const serviceStatus = error instanceof ServiceError ? error.statusCode : undefined;
      if (
        serviceStatus === 409 &&
        usingCookie &&
        request.method === "DELETE" &&
        request.path === "/user/session"
      ) {
        next();
        return;
      }

      const statusCode = serviceStatus === 409 || serviceStatus === 503 ? serviceStatus : 401;
      if (statusCode === 409) {
        response.setHeader("x-auth-session-state", "superseded");
      }
      next(
        new ServiceError(
          statusCode,
          statusCode === 409
            ? "Sessão substituída."
            : statusCode === 503
              ? "Não foi possível validar a sessão."
              : "Não autenticado.",
          error,
        ),
      );
    }
  };
}
