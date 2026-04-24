import {
  createSuccessResponse,
  error as logError,
  parseWithZod,
  requireAuthenticatedRequestContext,
} from "@workspace/shared";
import { Router } from "express";
import type { NextFunction, Request, Response } from "express";

import { isAuthenticated } from "../middlewares/isAuthenticated.js";
import {
  permissionQuerySchema,
  permissionUserIdParamsSchema,
  updatePermissionBodySchema,
} from "../schemas/permission.schemas.js";
import { PermissionService } from "../services/permissionService.js";

const router: ReturnType<typeof Router> = Router();
const permissionService = new PermissionService();

function requirePermissionAuth(request: Request) {
  return requireAuthenticatedRequestContext(request, {
    userIdMessage: "Não autenticado.",
    organizationIdMessage: "Não autenticado.",
  });
}

router.get(
  "/:userId",
  isAuthenticated,
  async (request: Request, response: Response, next: NextFunction) => {
    try {
      requirePermissionAuth(request);
      const { userId } = parseWithZod(permissionUserIdParamsSchema, request.params);
      const { modulo } = parseWithZod(permissionQuerySchema, request.query);

      const permission = await permissionService.getByUserId(userId, modulo);

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
      requirePermissionAuth(request);
      const { userId } = parseWithZod(permissionUserIdParamsSchema, request.params);
      const modules = parseWithZod(updatePermissionBodySchema, request.body) as Record<
        string,
        number | null
      >;

      const permission = await permissionService.update(userId, modules);

      response.json(createSuccessResponse(permission));
    } catch (err) {
      logError("Erro ao atualizar permissao", { err });
      next(err);
    }
  },
);

export { router as permissionRoutes };
