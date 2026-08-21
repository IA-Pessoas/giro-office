import {
  createExpiredSessionCookieHeaders,
  createSessionCookieHeaders,
  createSuccessResponse,
  error as logError,
  parseWithZod,
  requireAuthenticatedRequestContext,
  ServiceError,
} from "@workspace/shared";
import type { NextFunction, Request, Response } from "express";
import { Router } from "express";
import type { UserServiceEnv } from "../config/env.js";
import { isAuthenticated } from "../middlewares/isAuthenticated.js";
import { loginBodySchema } from "../schemas/auth.schemas.js";
import { AuthService } from "../services/authService.js";
import { UserService } from "../services/userService.js";

function requireSessionIdentity(request: Request): {
  user_id: string;
  organization_id: string;
  session_version: number;
  session_id: string;
  csrf_hash: string;
} {
  if (
    !request.user_id ||
    !request.organization_id ||
    !Number.isInteger(request.session_version) ||
    (request.session_version ?? -1) < 0 ||
    !request.session_id ||
    !request.csrf_hash
  ) {
    throw new ServiceError(401, "Sessão obsoleta. Faça login novamente.");
  }

  return {
    user_id: request.user_id,
    organization_id: request.organization_id,
    session_version: request.session_version as number,
    session_id: request.session_id,
    csrf_hash: request.csrf_hash,
  };
}

export function createAuthRoutes(
  env: Pick<UserServiceEnv, "authCookieSecure">,
): ReturnType<typeof Router> {
  const router = Router();
  const authService = new AuthService();
  const userService = new UserService();

  router.post("/session", async (request: Request, response: Response, next: NextFunction) => {
    try {
      const { login, password } = parseWithZod(loginBodySchema, request.body);

      const issuedSession = await authService.login({ login, password });
      const { csrfToken, token, ...sessionUser } = issuedSession;

      response.append(
        "Set-Cookie",
        createSessionCookieHeaders(token, csrfToken, { secure: env.authCookieSecure }),
      );
      response.json(createSuccessResponse({ ...sessionUser, service: "user-service" }));
    } catch (err) {
      logError("Erro no login", { err });
      next(err);
    }
  });

  router.post(
    "/session/refresh",
    isAuthenticated,
    async (request: Request, response: Response, next: NextFunction) => {
      try {
        const identity = requireSessionIdentity(request);
        const issuedSession = await authService.refreshSession(identity);
        const { csrfToken, token, ...sessionUser } = issuedSession;

        response.append(
          "Set-Cookie",
          createSessionCookieHeaders(token, csrfToken, { secure: env.authCookieSecure }),
        );
        response.json(createSuccessResponse({ ...sessionUser, service: "user-service" }));
      } catch (err) {
        logError("Erro ao renovar sessão", { err });
        next(err);
      }
    },
  );

  router.delete(
    "/session",
    isAuthenticated,
    async (request: Request, response: Response, next: NextFunction) => {
      try {
        const { session_id, user_id } = requireSessionIdentity(request);
        await authService.revokeSession(user_id, session_id);
        response.append(
          "Set-Cookie",
          createExpiredSessionCookieHeaders({ secure: env.authCookieSecure }),
        );
        response.json(createSuccessResponse({ loggedOut: true }));
      } catch (err) {
        logError("Erro ao encerrar sessão", { err });
        next(err);
      }
    },
  );

  router.post(
    "/start-config",
    async (_request: Request, response: Response, next: NextFunction) => {
      try {
        const user = await authService.firstCreate();

        response.json(createSuccessResponse({ ...user, service: "user-service" }));
      } catch (err) {
        logError("Erro no firstCreate", { err });
        next(err);
      }
    },
  );

  router.get(
    "/session/validate",
    isAuthenticated,
    async (_request: Request, response: Response, next: NextFunction) => {
      try {
        response.json(createSuccessResponse({ valid: true }));
      } catch (err) {
        logError("Erro ao validar sessão", { err });
        next(err);
      }
    },
  );

  router.get(
    "/me",
    isAuthenticated,
    async (request: Request, response: Response, next: NextFunction) => {
      try {
        const { organization_id, user_id } = requireAuthenticatedRequestContext(request, {
          userIdMessage: "Não autenticado.",
          organizationIdMessage: "Não autenticado.",
        });

        const user = await userService.getByIdWithModules(user_id, organization_id);

        response.json(createSuccessResponse({ ...user, service: "user-service" }));
      } catch (err) {
        logError("Erro ao buscar usuário autenticado", { err });
        next(err);
      }
    },
  );

  return router;
}
