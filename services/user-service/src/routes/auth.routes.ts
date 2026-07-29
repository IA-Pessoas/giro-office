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
import { switchOrganizationBodySchema } from "../schemas/userOrganization.schemas.js";
import { AuthService } from "../services/authService.js";
import { UserService } from "../services/userService.js";
import { UserOrganizationService } from "../services/userOrganizationService.js";

const router: ReturnType<typeof Router> = Router();
const authService = new AuthService();
const userService = new UserService();
const userOrganizationService = new UserOrganizationService();

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

router.post("/start-config", async (_request: Request, response: Response, next: NextFunction) => {
  try {
    const user = await authService.firstCreate();

    response.json(createSuccessResponse({ ...user, service: "user-service" }));
  } catch (err) {
    logError("Erro no firstCreate", { err });
    next(err);
  }
});

router.get(
  "/organizations",
  isAuthenticated,
  async (request: Request, response: Response, next: NextFunction) => {
    try {
      const { user_id } = requireAuthenticatedRequestContext(request, {
        userIdMessage: "Não autenticado.",
      });

      const organizations = await userOrganizationService.listForUser(user_id);

      response.json(createSuccessResponse(organizations));
    } catch (err) {
      logError("Erro ao listar organizações do usuário", { err });
      next(err);
    }
  },
);

router.post(
  "/organization/switch",
  isAuthenticated,
  async (request: Request, response: Response, next: NextFunction) => {
    try {
      const { user_id } = requireAuthenticatedRequestContext(request, {
        userIdMessage: "Não autenticado.",
      });
      const { organization_id } = parseWithZod(switchOrganizationBodySchema, request.body);
      const session = await userOrganizationService.switchOrganization(user_id, organization_id);

      response.json(createSuccessResponse({ ...session, service: "user-service" }));
    } catch (err) {
      logError("Erro ao trocar organização ativa", { err });
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

      const user = await userService.getById(user_id, organization_id);

      response.json(createSuccessResponse({ ...user, service: "user-service" }));
    } catch (err) {
      logError("Erro ao buscar usuário autenticado", { err });
      next(err);
    }
  },
);

export { router as authRoutes };
