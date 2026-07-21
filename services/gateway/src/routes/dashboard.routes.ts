import { createSuccessResponse, error as logError, ServiceError } from "@workspace/shared";
import { type Request, type Response, Router } from "express";

import type { DashboardStatsService } from "../services/dashboardStatsService.js";

export type DashboardStatsProvider = Pick<DashboardStatsService, "getStats">;

export function createDashboardRoutes(dashboardStatsService: DashboardStatsProvider): Router {
  const router = Router();

  router.get("/stats", async (request: Request, response: Response, next) => {
    try {
      const organizationId = request.auth?.organizationId;

      if (!organizationId) {
        throw new ServiceError(401, "Contexto autenticado não informado.");
      }

      const stats = await dashboardStatsService.getStats(organizationId);

      response.status(200).json(createSuccessResponse(stats));
    } catch (err) {
      logError("Erro na rota de dashboard", { err });
      next(err);
    }
  });

  return router;
}
