import { createSuccessResponse, parseWithZod } from "@workspace/shared";
import { type NextFunction, type Request, type Response, Router } from "express";

import { regularizeDashboardQuerySchema } from "../schemas/dashboard.schemas.js";
import { RegularizeDashboardService } from "../services/regularizeDashboardService.js";
import type { RegularizeRouteDeps } from "./regularizeRouteDeps.js";

export function createDashboardRoutes({ prisma }: RegularizeRouteDeps): Router {
  const router = Router();
  const dashboardService = new RegularizeDashboardService(prisma);

  router.get("/dashboard", async (request: Request, response: Response, next: NextFunction) => {
    try {
      const query = parseWithZod(regularizeDashboardQuerySchema, request.query);
      const dashboard = await dashboardService.getDashboard(request.organization_id, query.year);

      response.json(createSuccessResponse(dashboard));
    } catch (error) {
      next(error);
    }
  });

  return router;
}
