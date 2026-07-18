import { createSuccessResponse, error as logError, ServiceError } from "@workspace/shared";
import type { NextFunction, Request, Response } from "express";
import { Router } from "express";

import type { GatewayEnv } from "../config/env.js";
import { DashboardStatsService } from "../services/dashboardStatsService.js";

export function createDashboardStatsRoutes(env: GatewayEnv): ReturnType<typeof Router> {
  const router: ReturnType<typeof Router> = Router();
  const dashboardStatsService = new DashboardStatsService(env);

  router.get("/stats", async (request: Request, response: Response, next: NextFunction) => {
    try {
      const authorization = request.headers.authorization;

      if (!authorization) {
        throw new ServiceError(401, "Não autenticado.");
      }

      const result = await dashboardStatsService.getStats(authorization);
      response.json(createSuccessResponse(result));
    } catch (err) {
      logError("Erro ao buscar dashboard consolidado", { err });
      next(err);
    }
  });

  return router;
}
