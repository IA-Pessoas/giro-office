import {
  createSuccessResponse,
  FORWARDED_AUTH_ORGANIZATION_ID_HEADER,
  FORWARDED_AUTH_USER_ID_HEADER,
  REQUEST_ID_HEADER,
  requireAuthenticatedRequestContext,
} from "@workspace/shared";
import { Router } from "express";

import type { SourceCatalogService } from "../catalog/sourceCatalogService.js";
import { getReportingCatalogScope, type ReportingAccessContextClient } from "./reportingContext.js";

export function createReportCatalogRouter(options: {
  sourceCatalog: SourceCatalogService;
  accessContextClient: ReportingAccessContextClient;
}): ReturnType<typeof Router> {
  const router = Router();

  router.get("/catalog", async (request, response) => {
    const userId = request.get(FORWARDED_AUTH_USER_ID_HEADER);
    const organizationId = request.get(FORWARDED_AUTH_ORGANIZATION_ID_HEADER);
    requireAuthenticatedRequestContext({
      user_id: userId,
      organization_id: organizationId,
    });
    const scope = await getReportingCatalogScope(options.accessContextClient, {
      userId: userId ?? "",
      organizationId: organizationId ?? "",
      requestId: request.get(REQUEST_ID_HEADER) ?? "reports-catalog",
    });

    response.json(
      createSuccessResponse({ items: options.sourceCatalog.getAuthorizedCatalog(scope).sources }),
    );
  });

  return router;
}
