import {
  createSuccessResponse,
  error as logError,
  FORWARDED_AUTH_USER_ID_HEADER,
  parseWithZod,
  ServiceError,
} from "@workspace/shared";
import { Router } from "express";
import type { NextFunction, Request, Response } from "express";

import { AuthService } from "../services/authService.js";
import { UserService } from "../services/userService.js";
import { loginBodySchema } from "../schemas/auth.schemas.js";

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

router.post("/start-config", async (request: Request, response: Response, next: NextFunction) => {
  try {
    const user = await authService.firstCreate();

    response.json(createSuccessResponse({ ...user, service: "user-service" }));
  } catch (err) {
    logError("Erro no firstCreate", { err });
    next(err);
  }
});

router.get("/me", async (request: Request, response: Response, next: NextFunction) => {
  try {
    const userId = request.get(FORWARDED_AUTH_USER_ID_HEADER);

    if (!userId) {
      throw new ServiceError(401, "Não autenticado.");
    }

    const user = await userService.getById(userId);

    response.json(createSuccessResponse({ ...user, service: "user-service" }));
  } catch (err) {
    logError("Erro ao buscar usuário autenticado", { err });
    next(err);
  }
});

export { router as authRoutes };
