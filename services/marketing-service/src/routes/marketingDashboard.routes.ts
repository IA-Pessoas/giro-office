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
  type MarketingDashboardResponse,
  type MarketingMonthlyBirthdaysResponse,
  type MarketingStockResponse,
  marketingMonthlyBirthdaysQuerySchema,
} from "../schemas/marketingDashboard.schemas.js";

export interface MarketingDashboardProvider {
  getDashboard(organizationId: string): Promise<MarketingDashboardResponse>;
  getMonthlyBirthdays(
    organizationId: string,
    month: number,
  ): Promise<MarketingMonthlyBirthdaysResponse>;
  getMarketingStock(organizationId: string): Promise<MarketingStockResponse>;
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
        const dashboard = await dashboardService.getDashboard(organizationId);
        response.json(createSuccessResponse(dashboard));
      } catch (error: unknown) {
        logError("Falha ao carregar dashboard do Marketing.", { err: error });
        next(
          error instanceof Error ? error : new ServiceError(500, "Falha ao carregar o dashboard."),
        );
      }
    },
  );

  router.get(
    "/birthdays",
    authenticate,
    requireMarketingPermission(MarketingPermissionLevel.Viewer),
    async (request: Request, response: Response, next: NextFunction) => {
      try {
        const { organization_id: organizationId } = requireAuthenticatedRequestContext(request, {
          statusCode: 400,
        });
        const { month } = parseWithZod(marketingMonthlyBirthdaysQuerySchema, request.query);
        const report = await dashboardService.getMonthlyBirthdays(organizationId, month);
        response.json(createSuccessResponse(report));
      } catch (error: unknown) {
        logError("Falha ao carregar aniversariantes do Marketing.", { err: error });
        next(
          error instanceof Error
            ? error
            : new ServiceError(500, "Falha ao carregar os aniversariantes."),
        );
      }
    },
  );

  router.get(
    "/stock",
    authenticate,
    requireMarketingPermission(MarketingPermissionLevel.Viewer),
    async (request: Request, response: Response, next: NextFunction) => {
      try {
        const { organization_id: organizationId } = requireAuthenticatedRequestContext(request, {
          statusCode: 400,
        });
        response.json(
          createSuccessResponse(await dashboardService.getMarketingStock(organizationId)),
        );
      } catch (error: unknown) {
        logError("Falha ao carregar o estoque do Marketing.", { err: error });
        next(
          error instanceof Error ? error : new ServiceError(500, "Falha ao carregar o estoque."),
        );
      }
    },
  );

  return router;
}
