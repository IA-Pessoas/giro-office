import { createSuccessResponse, error as logError, parseWithZod } from "@workspace/shared";
import type { NextFunction, Request, Response } from "express";
import { Router } from "express";

import { isAuthenticated } from "../middlewares/isAuthenticated.js";
import {
  platformLoginBodySchema,
  startSupportSessionBodySchema,
} from "../schemas/platform.schemas.js";
import { requirePlatformSuperAdmin } from "../security/platformAuth.js";
import { PlatformAuthService } from "../services/platformAuthService.js";

const router: ReturnType<typeof Router> = Router();
const platformAuthService = new PlatformAuthService();

router.post("/session", async (request: Request, response: Response, next: NextFunction) => {
  try {
    const body = parseWithZod(platformLoginBodySchema, request.body);
    const session = await platformAuthService.login(body);

    response.json(createSuccessResponse({ ...session, service: "user-service" }));
  } catch (err) {
    logError("Erro no login de plataforma", { err });
    next(err);
  }
});

router.get(
  "/me",
  isAuthenticated,
  async (request: Request, response: Response, next: NextFunction) => {
    try {
      const auth = requirePlatformSuperAdmin(request);
      const platformUser = await platformAuthService.getMe(auth.platformUserId);

      response.json(createSuccessResponse({ ...platformUser, service: "user-service" }));
    } catch (err) {
      logError("Erro ao buscar usuario de plataforma", { err });
      next(err);
    }
  },
);

router.post(
  "/support-sessions",
  isAuthenticated,
  async (request: Request, response: Response, next: NextFunction) => {
    try {
      const auth = requirePlatformSuperAdmin(request);
      const body = parseWithZod(startSupportSessionBodySchema, request.body);
      const supportSession = await platformAuthService.startSupportSession({
        platformUserId: auth.platformUserId,
        organizationId: body.organization_id,
        reason: body.reason,
      });

      response.status(201).json(createSuccessResponse(supportSession));
    } catch (err) {
      logError("Erro ao iniciar sessao de suporte", { err });
      next(err);
    }
  },
);

router.delete(
  "/support-sessions/current",
  isAuthenticated,
  async (request: Request, response: Response, next: NextFunction) => {
    try {
      const auth = requirePlatformSuperAdmin(request);
      if (!request.support_session_id) {
        response.json(createSuccessResponse({ closed: false }));
        return;
      }

      const result = await platformAuthService.endSupportSession(
        auth.platformUserId,
        request.support_session_id,
      );

      response.json(createSuccessResponse({ closed: true, ...result }));
    } catch (err) {
      logError("Erro ao encerrar sessao de suporte", { err });
      next(err);
    }
  },
);

export { router as platformRoutes };
