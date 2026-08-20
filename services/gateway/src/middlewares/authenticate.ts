import {
  AUTH_SESSION_COOKIE_NAME,
  authenticateFromAuthHeader,
  authenticateFromToken,
  createExpiredSessionCookieHeaders,
  INTERNAL_SERVICE_TOKEN_HEADER,
  readCookie,
  ServiceError,
} from "@workspace/shared";
import type { Logger } from "@workspace/shared/logger";
import type { NextFunction, Request, RequestHandler, Response } from "express";

import { isPublicRoute } from "../security/publicRoutes.js";

export type SessionValidator = (token: string) => Promise<void>;

export function createUserServiceSessionValidator(
  userServiceUrl: string,
  internalServiceToken: string,
): SessionValidator {
  const validationUrl = new URL("/user/session/validate", userServiceUrl);

  return async (token: string): Promise<void> => {
    let response: globalThis.Response;

    try {
      response = await fetch(validationUrl, {
        headers: {
          authorization: `Bearer ${token}`,
          [INTERNAL_SERVICE_TOKEN_HEADER]: internalServiceToken,
        },
      });
    } catch (error) {
      throw new ServiceError(503, "Não foi possível validar a sessão.", error);
    }

    if (!response.ok) {
      throw new ServiceError(response.status === 401 ? 401 : 503, "Sessão inválida.");
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
        await options.sessionValidator(request.auth.token);
      }

      options.logger.info({
        event: usingCookie ? "auth.cookie.accepted" : "auth.bearer_compat.accepted",
        message: usingCookie ? "Cookie session accepted" : "Bearer compatibility accepted",
      });
      next();
    } catch (error) {
      if (usingCookie) {
        response.append(
          "Set-Cookie",
          createExpiredSessionCookieHeaders({ secure: options.authCookieSecure }),
        );
        options.logger.warn({
          event: "auth.session.validation.failed",
          reason: failureReason,
          message: "Cookie session validation failed",
        });
      }
      next(new ServiceError(401, "Não autenticado.", error));
    }
  };
}
