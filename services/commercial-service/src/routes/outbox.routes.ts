import { createSuccessResponse, requireAuthenticatedRequestContext } from "@workspace/shared";
import type { Request } from "express";
import { Router } from "express";

import { isAuthenticated } from "../middlewares/isAuthenticated.js";
import type { CommercialOutboxStatusService } from "../services/commercialOutboxStatusService.js";

export type CommercialOutboxRouteDeps = Pick<CommercialOutboxStatusService, "status">;

export function createCommercialOutboxRoutes(
  service: CommercialOutboxRouteDeps,
): ReturnType<typeof Router> {
  const router = Router();
  router.get("/status", isAuthenticated, async (request: Request, response, next) => {
    try {
      const { organization_id } = requireAuthenticatedRequestContext(request, {
        statusCode: 401,
        userIdMessage: "Contexto de autenticação inválido.",
        organizationIdMessage: "Contexto de autenticação inválido.",
      });
      response.json(createSuccessResponse(await service.status(organization_id)));
    } catch (error) {
      next(error);
    }
  });
  return router;
}
