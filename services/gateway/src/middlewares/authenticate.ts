import {
  authenticateFromAuthHeader,
  INTERNAL_SERVICE_TOKEN_HEADER,
  ServiceError,
} from "@workspace/shared";
import type { NextFunction, Request, Response } from "express";

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

export function buildAuthenticateMiddleware(
  jwtSecret: string,
  sessionValidator?: SessionValidator,
) {
  return async function authenticate(
    request: Request,
    _response: Response,
    next: NextFunction,
  ): Promise<void> {
    if (isPublicRoute(request.method, request.path)) {
      next();
      return;
    }

    try {
      request.auth = authenticateFromAuthHeader(request.headers.authorization, jwtSecret);
      if (sessionValidator) {
        await sessionValidator(request.auth.token);
      }
      next();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Não autenticado.";
      next(new ServiceError(401, message, error));
    }
  };
}
