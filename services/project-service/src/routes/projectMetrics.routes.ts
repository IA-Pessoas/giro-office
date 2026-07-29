import {
  createSuccessResponse,
  error as logError,
  normalizeModulePermission,
  parseWithZod,
  requireAuthenticatedRequestContext,
} from "@workspace/shared";
import type { NextFunction, Request, Response } from "express";
import { Router } from "express";

import { isAuthenticated } from "../middlewares/isAuthenticated.js";
import { integracaoProjectMetricsQuerySchema } from "../schemas/projectMetrics.schemas.js";
import type { ProjectMetricsService } from "../services/projectMetricsService.js";

export type ProjectMetricsRouteDeps = Pick<ProjectMetricsService, "getGlobalMetrics">;

export function createProjectMetricsRoutes(
  service: ProjectMetricsRouteDeps,
): ReturnType<typeof Router> {
  const router: ReturnType<typeof Router> = Router();

  router.get(
    "/metrics",
    isAuthenticated,
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        parseWithZod(integracaoProjectMetricsQuerySchema, req.query);
        const auth = requireAuthenticatedRequestContext(req);

        const result = await service.getGlobalMetrics(auth.organization_id, {
          userId: auth.user_id,
          integracaoLevel: normalizeModulePermission(req.modules?.integracao),
          isOwner: req.user_type === "owner",
        });

        res.json(createSuccessResponse(result));
      } catch (err) {
        logError("Erro ao buscar métricas globais de projetos da Integração", { err });
        next(err);
      }
    },
  );

  return router;
}
