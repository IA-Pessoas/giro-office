import { createSuccessResponse, parseWithZod } from "@workspace/shared";
import type { RequestHandler } from "express";
import { Router } from "express";

import { commercialProspectingTransitionEventSchema } from "../schemas/commercialProspectingTransition.schemas.js";
import type { CommercialProspectingTransitionService } from "../services/commercialProspectingTransitionService.js";

export type InternalCommercialProspectingTransitionRouteDeps = Pick<
  CommercialProspectingTransitionService,
  "apply"
>;

export function createInternalCommercialProspectingTransitionRouter(
  deps: InternalCommercialProspectingTransitionRouteDeps,
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
