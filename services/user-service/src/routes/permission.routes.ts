import { createSuccessResponse, error as logError, parseWithZod } from "@workspace/shared";
import { Router } from "express";
import type { NextFunction, Request, Response } from "express";

import {
  permissionQuerySchema,
  permissionUserIdParamsSchema,
  updatePermissionBodySchema,
} from "../schemas/permission.schemas.js";
import { PermissionService } from "../services/permissionService.js";

const router: ReturnType<typeof Router> = Router();
const permissionService = new PermissionService();

router.get("/:userId", async (request: Request, response: Response, next: NextFunction) => {
  try {
    const { userId } = parseWithZod(permissionUserIdParamsSchema, request.params);
    const { modulo } = parseWithZod(permissionQuerySchema, request.query);

    const permission = await permissionService.getByUserId(userId, modulo);

    response.json(createSuccessResponse(permission));
  } catch (err) {
    logError("Erro ao buscar permissao", { err });
    next(err);
  }
});

router.put("/:userId", async (request: Request, response: Response, next: NextFunction) => {
  try {
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
});

export { router as permissionRoutes };
