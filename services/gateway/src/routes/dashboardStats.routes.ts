import { createSuccessResponse, error as logError, ServiceError } from "@workspace/shared";
import type { NextFunction, Request, Response } from "express";
import { Router } from "express";

import type { GatewayEnv } from "../config/env.js";
import { CommercialDashboardStatsService } from "../services/commercialDashboardStatsService.js";
import { DashboardStatsService } from "../services/dashboardStatsService.js";
import { MarketingDashboardStatsService } from "../services/marketingDashboardStatsService.js";

export function createDashboardStatsRoutes(env: GatewayEnv): ReturnType<typeof Router> {
  const router: ReturnType<typeof Router> = Router();
  const dashboardStatsService = new DashboardStatsService(env);
  const commercialDashboardStatsService = new CommercialDashboardStatsService(env);
  const marketingDashboardStatsService = new MarketingDashboardStatsService(env);

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

  router.get(
    "/commercial/stats",
    async (request: Request, response: Response, next: NextFunction) => {
      try {
        const authorization = request.headers.authorization;

        if (!authorization) {
          throw new ServiceError(401, "Não autenticado.");
        }

        const result = await commercialDashboardStatsService.getStats(authorization);
        response.json(createSuccessResponse(result));
      } catch (err) {
        logError("Erro ao buscar dashboard comercial consolidado", { err });
        next(err);
      }
    },
  );

  router.get(
    "/marketing/stats",
    async (request: Request, response: Response, next: NextFunction) => {
      try {
        const authorization = request.headers.authorization;

        if (!authorization) {
          throw new ServiceError(401, "Não autenticado.");
        }

        const result = await marketingDashboardStatsService.getStats(authorization);
        response.json(createSuccessResponse(result));
      } catch (err) {
        logError("Erro ao buscar dashboard de Marketing consolidado", { err });
        next(err);
      }
    },
  );

  return router;
}
