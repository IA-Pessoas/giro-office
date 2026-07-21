import { createSuccessResponse, error as logError, parseWithZod } from "@workspace/shared";
import type { NextFunction, Request, Response } from "express";
import { Router } from "express";

import { isAuthenticated } from "../middlewares/isAuthenticated.js";
import {
  platformLoginBodySchema,
  platformOrganizationParamsSchema,
  platformOrganizationUserParamsSchema,
  startSupportSessionBodySchema,
} from "../schemas/platform.schemas.js";
import {
  createUserBodySchema,
  listUsersQuerySchema,
  updateUserBodySchema,
} from "../schemas/user.schemas.js";
import { requirePlatformSuperAdmin } from "../security/platformAuth.js";
import { PlatformAuthService } from "../services/platformAuthService.js";
import { UserService } from "../services/userService.js";

const router: ReturnType<typeof Router> = Router();
const platformAuthService = new PlatformAuthService();
const userService = new UserService();

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

router.get(
  "/organizations/:organizationId/users",
  isAuthenticated,
  async (request: Request, response: Response, next: NextFunction) => {
    try {
      requirePlatformSuperAdmin(request);
      const params = parseWithZod(platformOrganizationParamsSchema, request.params);
      const { skip, take } = parseWithZod(listUsersQuerySchema, request.query);
      const result = await userService.list({
        skip,
        take,
        organizationId: params.organizationId,
      });

      response.json(createSuccessResponse(result));
    } catch (err) {
      logError("Erro ao listar usuarios via plataforma", { err });
      next(err);
    }
  },
);

router.post(
  "/organizations/:organizationId/users",
  isAuthenticated,
  async (request: Request, response: Response, next: NextFunction) => {
    try {
      requirePlatformSuperAdmin(request);
      const params = parseWithZod(platformOrganizationParamsSchema, request.params);
      const body = parseWithZod(createUserBodySchema, request.body);
      const user = await userService.create({
        ...body,
        organization_id: params.organizationId,
        first_owner_flag: false,
      });

      response.status(201).json(createSuccessResponse(user));
    } catch (err) {
      logError("Erro ao criar usuario via plataforma", { err });
      next(err);
    }
  },
);

router.patch(
  "/organizations/:organizationId/users/:userId",
  isAuthenticated,
  async (request: Request, response: Response, next: NextFunction) => {
    try {
      requirePlatformSuperAdmin(request);
      const params = parseWithZod(platformOrganizationUserParamsSchema, request.params);
      const body = parseWithZod(updateUserBodySchema, request.body);
      const user = await userService.update(params.userId, body, params.organizationId);

      response.json(createSuccessResponse(user));
    } catch (err) {
      logError("Erro ao atualizar usuario via plataforma", { err });
      next(err);
    }
  },
);

router.delete(
  "/organizations/:organizationId/users/:userId",
  isAuthenticated,
  async (request: Request, response: Response, next: NextFunction) => {
    try {
      requirePlatformSuperAdmin(request);
      const params = parseWithZod(platformOrganizationUserParamsSchema, request.params);
      await userService.delete(params.userId, params.organizationId);

      response.json(createSuccessResponse({ message: "Usuario desativado com sucesso." }));
    } catch (err) {
      logError("Erro ao desativar usuario via plataforma", { err });
      next(err);
    }
  },
);

export { router as platformRoutes };
