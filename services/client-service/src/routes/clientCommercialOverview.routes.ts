import { createSuccessResponse, error as logError } from "@workspace/shared";
import type { NextFunction, Request, Response } from "express";
import { Router } from "express";

import type { PrismaClient } from "../generated/prisma/client.js";
import { isAuthenticated } from "../middlewares/isAuthenticated.js";
import { ClientCommercialOverviewService } from "../services/clientCommercialOverviewService.js";
import { resolveOrganizationId } from "../utils/organizationContext.js";

export function createClientCommercialOverviewRouter(prisma: PrismaClient): Router {
  const router: ReturnType<typeof Router> = Router();
  const service = new ClientCommercialOverviewService(prisma);

  router.get(
    "/commercial/overview",
    isAuthenticated,
    async (request: Request, response: Response, next: NextFunction) => {
      try {
        const organizationId = resolveOrganizationId(request, undefined);
        const overview = await service.getOverview(organizationId);
        response.json(createSuccessResponse(overview));
      } catch (err) {
        logError("Erro ao buscar overview comercial", { err });
        next(err);
      }
    },
  );

  return router;
}
