import {
  createSuccessResponse,
  error as logError,
  parseWithZod,
  requireAuthenticatedRequestContext,
} from "@workspace/shared";
import type { NextFunction, Request, Response } from "express";
import { Router } from "express";

import { isAuthenticated } from "../middlewares/isAuthenticated.js";
import { integracaoProjectProgressBodySchema } from "../schemas/projectProgress.schemas.js";
import type { ProjectProgressService } from "../services/ProjectProgressService.js";

export type ProjectProgressRouteDeps = Pick<ProjectProgressService, "recalculateFromTasks">;

export function createProjectProgressRoutes(
  service: ProjectProgressRouteDeps,
): ReturnType<typeof Router> {
  const router: ReturnType<typeof Router> = Router();

  router.post("/progress", isAuthenticated, async (req: Request, res: Response, next: NextFunction) => {
    try {
      const body = parseWithZod(integracaoProjectProgressBodySchema, req.body);
      const auth = requireAuthenticatedRequestContext(req);

      const result = await service.recalculateFromTasks(body.project_id, auth.organization_id);

      res.json(createSuccessResponse(result));
    } catch (err) {
      logError("Erro ao recalcular progresso do projeto", { err });
      next(err);
    }
  });

  return router;
}
