import { Router } from "express";
import type { Request, Response } from "express";

import { AuthService } from "../services/AuthService.js";

const router = Router();
const authService = new AuthService();

router.post("/session", async (request: Request, response: Response) => {
  const { login, password } = request.body;

  const session = await authService.login({ login, password });

  response.json(session);
});

router.post("/start-config", async (request: Request, response: Response) => {
  const user = await authService.firstCreate();

  response.json(user);
});

export { router as authRoutes };
