import {
  createSuccessResponse,
  error as logError,
  parseWithZod,
  requireAuthenticatedRequestContext,
  ServiceError,
} from "@workspace/shared";
import type { NextFunction, Request, Response } from "express";
import { Router } from "express";

import { isAuthenticated } from "../middlewares/isAuthenticated.js";
import {
  permissionQuerySchema,
  permissionUserIdParamsSchema,
  updatePermissionBodySchema,
} from "../schemas/permission.schemas.js";
import { PermissionService } from "../services/permissionService.js";

const router: ReturnType<typeof Router> = Router();
const permissionService = new PermissionService();
const ADMIN_PERMISSION = 2;

function requirePermissionAuth(request: Request) {
  return requireAuthenticatedRequestContext(request, {
    userIdMessage: "Não autenticado.",
    organizationIdMessage: "Não autenticado.",
  });
}

function requireAdminPermissionAuth(request: Request) {
  const auth = requirePermissionAuth(request);
  if (typeof auth.permission !== "number" || auth.permission < ADMIN_PERMISSION) {
    throw new ServiceError(403, "Usuário não tem permissão.");
  }
  return auth;
}

router.get(
  "/:userId",
  isAuthenticated,
  async (request: Request, response: Response, next: NextFunction) => {
    try {
      const auth = requireAdminPermissionAuth(request);
      const { userId } = parseWithZod(permissionUserIdParamsSchema, request.params);
      const { modulo } = parseWithZod(permissionQuerySchema, request.query);

      const permission = await permissionService.getByUserId(userId, modulo, auth.organization_id);

      response.json(createSuccessResponse(permission));
    } catch (err) {
      logError("Erro ao buscar permissao", { err });
      next(err);
    }
  },
);

router.put(
  "/:userId",
  isAuthenticated,
  async (request: Request, response: Response, next: NextFunction) => {
    try {
      const auth = requireAdminPermissionAuth(request);
      const { userId } = parseWithZod(permissionUserIdParamsSchema, request.params);
      const modules = parseWithZod(updatePermissionBodySchema, request.body) as Record<
        string,
        number | null
      >;

      const permission = await permissionService.update(userId, modules, auth.organization_id);

      response.json(createSuccessResponse(permission));
    } catch (err) {
      logError("Erro ao atualizar permissao", { err });
      next(err);
    }
  },
);

export { router as permissionRoutes };
