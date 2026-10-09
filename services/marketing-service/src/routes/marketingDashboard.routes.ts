import {
  createSuccessResponse,
  error as logError,
  parseWithZod,
  requireAuthenticatedRequestContext,
  ServiceError,
} from "@workspace/shared";
import type { NextFunction, Request, Response } from "express";
import { Router } from "express";
import {
  MarketingPermissionLevel,
  requireMarketingPermission,
} from "../middlewares/requireMarketingPermission.js";
import {
  type MarketingDashboardQuery,
  type MarketingDashboardResponse,
  marketingDashboardQuerySchema,
} from "../schemas/marketingDashboard.schemas.js";

export interface MarketingDashboardProvider {
  getDashboard(organizationId: string, month?: string): Promise<MarketingDashboardResponse>;
}

export function createMarketingDashboardRoutes(
  dashboardService: MarketingDashboardProvider,
  authenticate: import("express").RequestHandler,
): Router {
  const router = Router();

  router.get(
    "/dashboard",
    authenticate,
    requireMarketingPermission(MarketingPermissionLevel.Viewer),
    async (request: Request, response: Response, next: NextFunction) => {
      try {
        const { organization_id: organizationId } = requireAuthenticatedRequestContext(request, {
          statusCode: 400,
        });
        const query: MarketingDashboardQuery = parseWithZod(
          marketingDashboardQuerySchema,
          request.query,
        );
        const dashboard = await dashboardService.getDashboard(organizationId, query.month);
        response.setHeader("Cache-Control", "no-store");
        response.json(createSuccessResponse(dashboard));
      } catch (error: unknown) {
        logError("Falha ao carregar dashboard do Marketing.", { err: error });
        next(
          error instanceof Error ? error : new ServiceError(500, "Falha ao carregar o dashboard."),
        );
      }
    },
  );

  return router;
}
