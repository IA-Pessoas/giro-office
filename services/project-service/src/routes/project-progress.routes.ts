import {
  createSuccessResponse,
  error as logError,
  parseWithZod,
  ServiceError,
} from "@workspace/shared";
import type { NextFunction, Request, Response } from "express";
import { Router } from "express";

import { isAuthenticated } from "../middlewares/isAuthenticated.js";
import { integracaoProjectProgressBodySchema } from "../schemas/project-progress.schemas.js";
import type { ProjectProgressService } from "../services/ProjectProgressService.js";

export type ProjectProgressRouteDeps = Pick<ProjectProgressService, "recalculateFromTasks">;

function requireAuthContext(req: Request): {
  user_id: string;
  organization_id: string;
  permission?: number;
} {
  const user_id = req.user_id;
  const organization_id = req.organization_id;
  if (!user_id || !organization_id) {
    throw new ServiceError(401, "Usuário ou organização não identificados.");
  }
  return { user_id, organization_id, permission: req.permission };
}

export function createProjectProgressRoutes(
  service: ProjectProgressRouteDeps,
): ReturnType<typeof Router> {
  const router: ReturnType<typeof Router> = Router();

  router.post(
    "/progress",
    isAuthenticated,
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const body = parseWithZod(integracaoProjectProgressBodySchema, req.body);
        const auth = requireAuthContext(req);

        const result = await service.recalculateFromTasks(body.project_id, auth.organization_id);

        res.json(createSuccessResponse(result));
      } catch (err) {
        logError("Erro ao recalcular progresso do projeto", { err });
        next(err);
      }
    },
  );

  return router;
}
