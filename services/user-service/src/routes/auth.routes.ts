import {
  createSuccessResponse,
  error as logError,
  parseWithZod,
  requireAuthenticatedRequestContext,
} from "@workspace/shared";
import type { NextFunction, Request, Response } from "express";
import { Router } from "express";
import { isAuthenticated } from "../middlewares/isAuthenticated.js";
import { loginBodySchema } from "../schemas/auth.schemas.js";
import { AuthService } from "../services/authService.js";
import { UserService } from "../services/userService.js";

const router: ReturnType<typeof Router> = Router();
const authService = new AuthService();
const userService = new UserService();

router.post("/session", async (request: Request, response: Response, next: NextFunction) => {
  try {
    const { login, password } = parseWithZod(loginBodySchema, request.body);

    const session = await authService.login({ login, password });

    response.json(createSuccessResponse({ ...session, service: "user-service" }));
  } catch (err) {
    logError("Erro no login", { err });
    next(err);
  }
});

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

export { router as authRoutes };
