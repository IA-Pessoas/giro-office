import { createSuccessResponse, error as logError, ServiceError } from "@workspace/shared";
import { type Request, Router } from "express";

import type { PrismaClient } from "../generated/prisma/client.js";
import { requireTiPermission, TiPermissionLevel } from "../middlewares/requireTiPermission.js";
import { TiDashboardService } from "../services/tiDashboardService.js";
import type { TiAuthContext } from "../services/tiRequestService.js";

function getContext(request: Request): TiAuthContext {
  if (!request.user_id || !request.organization_id) {
    throw new ServiceError(401, "Autenticacao obrigatoria.");
  }

  return {
    userId: request.user_id,
    organizationId: request.organization_id,
    permission: Number(request.permission ?? 0),
  };
}

export function createTiDashboardRoutes(prisma: PrismaClient): Router {
  const router = Router();
  const service = new TiDashboardService(prisma);

  router.get(
    "/",
    requireTiPermission(TiPermissionLevel.Technician),
    async (request, response, next) => {
      try {
        const context = getContext(request);
        const result = await service.getSummary(context);

        response.status(200).json(createSuccessResponse(result));
      } catch (err: unknown) {
        logError("Erro ao buscar dashboard de TI", { err });
        next(err);
      }
    },
  );

  return router;
}
