import { createSuccessResponse, parseWithZod } from "@workspace/shared";
import type { RequestHandler } from "express";
import { Router } from "express";

import { commercialProspectingCloseEventSchema } from "../schemas/commercialProspectingClose.schemas.js";
import type { CommercialProspectingCloseService } from "../services/commercialProspectingCloseService.js";

export type InternalCommercialProspectingRouteDeps = Pick<
  CommercialProspectingCloseService,
  "apply"
>;

export function createInternalCommercialProspectingRouter(
  deps: InternalCommercialProspectingRouteDeps,
  requireInternalToken: RequestHandler,
): Router {
  const router = Router();

  router.post(
    "/commercial/prospecting-close",
    requireInternalToken,
    async (request, response, next) => {
      try {
        const event = parseWithZod(commercialProspectingCloseEventSchema, request.body);
        response.json(createSuccessResponse(await deps.apply(event)));
      } catch (error) {
        next(error);
      }
    },
  );

  return router;
}
