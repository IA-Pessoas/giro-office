import {
  createSuccessResponse,
  FORWARDED_AUTH_ORGANIZATION_ID_HEADER,
  FORWARDED_AUTH_USER_ID_HEADER,
  requireAuthenticatedRequestContext,
} from "@workspace/shared";
import { Router } from "express";

export function createReportCatalogRouter(): ReturnType<typeof Router> {
  const router = Router();

  router.get("/catalog", (request, response) => {
    requireAuthenticatedRequestContext({
      user_id: request.get(FORWARDED_AUTH_USER_ID_HEADER),
      organization_id: request.get(FORWARDED_AUTH_ORGANIZATION_ID_HEADER),
    });

    response.json(createSuccessResponse({ items: [] }));
  });

  return router;
}
