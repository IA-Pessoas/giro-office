import {
  createSuccessResponse,
  FORWARDED_AUTH_USER_ID_HEADER,
  ServiceError,
} from "@workspace/shared";
import { Router } from "express";
import type { NextFunction, Request, Response } from "express";

import { AuthService } from "../services/AuthService.js";
import { UserService } from "../services/UserService.js";

const router: ReturnType<typeof Router> = Router();
const authService = new AuthService();
const userService = new UserService();

router.post("/session", async (request: Request, response: Response, next: NextFunction) => {
  try {
    const { login, password } = request.body;

    const session = await authService.login({ login, password });

    response.json(createSuccessResponse(session));
  } catch (err) {
    next(err);
  }
});

router.post("/start-config", async (request: Request, response: Response, next: NextFunction) => {
  try {
    const user = await authService.firstCreate();

    response.json(createSuccessResponse(user));
  } catch (err) {
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

    response.json(createSuccessResponse(user));
  } catch (err) {
    next(err);
  }
});

export { router as authRoutes };
