import { createSuccessResponse, parseWithZod } from "@workspace/shared";
import type { RequestHandler } from "express";
import { Router } from "express";

import { commercialTaskBillingEventSchema } from "../schemas/commercialTaskBilling.schemas.js";
import type { CommercialTaskBillingProjectionService } from "../services/commercialTaskBillingProjectionService.js";

export type InternalCommercialTaskBillingRouteDeps = Pick<
  CommercialTaskBillingProjectionService,
  "apply"
>;

export function createInternalCommercialTaskBillingRouter(
  deps: InternalCommercialTaskBillingRouteDeps,
  requireInternalToken: RequestHandler,
): Router {
  const router = Router();

  router.post("/commercial/task-billing", requireInternalToken, async (request, response, next) => {
    try {
      const event = parseWithZod(commercialTaskBillingEventSchema, request.body);
      response.json(createSuccessResponse(await deps.apply(event)));
    } catch (error) {
      next(error);
    }
  });

  return router;
}
