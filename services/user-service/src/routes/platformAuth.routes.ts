import {
  createExpiredSessionCookieHeaders,
  createSessionCookieHeaders,
  createSuccessResponse,
  INTERNAL_SERVICE_TOKEN_HEADER,
  error as logError,
  parseWithZod,
  ServiceError,
} from "@workspace/shared";
import type { NextFunction, Request, Response } from "express";
import { Router } from "express";

import type { UserServiceEnv } from "../config/env.js";
import { platformLoginBodySchema } from "../schemas/platformAuth.schemas.js";
import {
  extractPlatformBearerClaims,
  requirePlatformCsrf,
  requirePlatformGatewayAuth,
  requirePlatformSession,
} from "../security/platformAuth.js";
import { PlatformAuthService } from "../services/platformAuthService.js";

function requirePlatformSessionClaims(request: Request) {
  if (!request.platform_session) {
    throw new ServiceError(401, "Não autenticado.");
  }
  return request.platform_session;
}

export function createPlatformAuthRoutes(
  env: Pick<UserServiceEnv, "authCookieSecure" | "auditServiceToken">,
): ReturnType<typeof Router> {
  const router = Router();
  const platformAuthService = new PlatformAuthService();

  router.post("/session", async (request: Request, response: Response, next: NextFunction) => {
    try {
      const issued = await platformAuthService.login(
        parseWithZod(platformLoginBodySchema, request.body),
      );
      response.append(
        "Set-Cookie",
        createSessionCookieHeaders(issued.token, issued.csrfToken, {
          secure: env.authCookieSecure,
        }),
      );
      response.json(createSuccessResponse(issued.identity));
    } catch (err) {
      logError("Erro no login da plataforma", { err });
      next(err);
    }
  });

  router.post(
    "/session/refresh",
    requirePlatformGatewayAuth,
    requirePlatformSession,
    requirePlatformCsrf,
    async (request: Request, response: Response, next: NextFunction) => {
      try {
        const issued = await platformAuthService.refreshSession(
          requirePlatformSessionClaims(request),
        );
        response.append(
          "Set-Cookie",
          createSessionCookieHeaders(issued.token, issued.csrfToken, {
            secure: env.authCookieSecure,
          }),
        );
        response.json(createSuccessResponse(issued.identity));
      } catch (err) {
        logError("Erro ao renovar sessão da plataforma", { err });
        next(err);
      }
    },
  );

  router.delete(
    "/session",
    requirePlatformGatewayAuth,
    requirePlatformSession,
    requirePlatformCsrf,
    async (request: Request, response: Response, next: NextFunction) => {
      try {
        await platformAuthService.revokeSession(requirePlatformSessionClaims(request));
        response.append(
          "Set-Cookie",
          createExpiredSessionCookieHeaders({ secure: env.authCookieSecure }),
        );
        response.json(createSuccessResponse({ loggedOut: true }));
      } catch (err) {
        logError("Erro ao encerrar sessão da plataforma", { err });
        next(err);
      }
    },
  );

  router.get(
    "/me",
    requirePlatformGatewayAuth,
    requirePlatformSession,
    (request: Request, response: Response, next: NextFunction): void => {
      if (!request.platform_identity) {
        next(new ServiceError(401, "Não autenticado."));
        return;
      }
      response.json(createSuccessResponse(request.platform_identity));
    },
  );

  router.post(
    "/session/validate",
    async (request: Request, response: Response, next: NextFunction) => {
      if (request.get(INTERNAL_SERVICE_TOKEN_HEADER) !== env.auditServiceToken) {
        next(new ServiceError(403, "Acesso negado."));
        return;
      }
      try {
        await platformAuthService.validateSession(extractPlatformBearerClaims(request));
        response.json(createSuccessResponse({ valid: true }));
      } catch (err: unknown) {
        logError("Erro ao validar sessão da plataforma", { err });
        next(err instanceof ServiceError ? err : new ServiceError(401, "Não autenticado."));
      }
    },
  );

  return router;
}
