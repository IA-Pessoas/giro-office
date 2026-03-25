import { createSuccessResponse, error as logError, ServiceError } from "@workspace/shared";
import { Router } from "express";
import type { NextFunction, Request, Response } from "express";

import { PermissionService } from "../services/PermissionService.js";

const router: ReturnType<typeof Router> = Router();
const permissionService = new PermissionService();

router.get("/:userId", async (request: Request, response: Response, next: NextFunction) => {
  try {
    const { userId } = request.params;
    const { modulo } = request.query;

    if (!userId?.trim()) {
      throw new ServiceError(400, "userId é obrigatório.");
    }

    const permission = await permissionService.getByUserId(userId, modulo as string | undefined);

    response.json(createSuccessResponse(permission));
  } catch (err) {
    logError("Erro ao buscar permissão", { err });
    next(err);
  }
});

router.put("/:userId", async (request: Request, response: Response, next: NextFunction) => {
  try {
    const { userId } = request.params;
    const modules = request.body as Record<string, number | null>;

    if (!userId?.trim()) {
      throw new ServiceError(400, "userId é obrigatório.");
    }

    if (!modules || typeof modules !== "object" || Object.keys(modules).length === 0) {
      throw new ServiceError(400, "Body deve conter ao menos um módulo para atualizar.");
    }

    const permission = await permissionService.update(userId, modules);

    response.json(createSuccessResponse(permission));
  } catch (err) {
    logError("Erro ao atualizar permissão", { err });
    next(err);
  }
});

export { router as permissionRoutes };
