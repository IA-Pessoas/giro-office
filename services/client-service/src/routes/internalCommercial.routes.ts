import { createSuccessResponse, parseWithZod } from "@workspace/shared";
import type { RequestHandler } from "express";
import { Router } from "express";

import { commercialProspectingTransitionEventSchema } from "../schemas/commercialProjection.schemas.js";
import type { ClientCommercialProjectionService } from "../services/clientCommercialProjectionService.js";

export type InternalCommercialRouteDeps = Pick<ClientCommercialProjectionService, "apply">;

export function createInternalCommercialRouter(
  deps: InternalCommercialRouteDeps,
  requireInternalToken: RequestHandler,
): Router {
  const router = Router();

  router.post(
    "/commercial/prospecting-transition",
    requireInternalToken,
    async (request, response, next) => {
      try {
        const event = parseWithZod(commercialProspectingTransitionEventSchema, request.body);
        response.json(createSuccessResponse(await deps.apply(event)));
      } catch (error) {
        next(error);
      }
    },
  );

  return router;
}
