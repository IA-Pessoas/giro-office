import { Router } from "express";
import type { NextFunction, Request, Response } from "express";

import { AuthService } from "../services/AuthService.js";

const router: ReturnType<typeof Router> = Router();
const authService = new AuthService();

router.post("/session", async (request: Request, response: Response, next: NextFunction) => {
  try {
    const { login, password } = request.body;

    const session = await authService.login({ login, password });

    response.json(session);
  } catch (err) {
    next(err);
  }
});

router.post("/start-config", async (request: Request, response: Response, next: NextFunction) => {
  try {
    const user = await authService.firstCreate();

    response.json(user);
  } catch (err) {
    next(err);
  }
});

export { router as authRoutes };
