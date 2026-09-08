import {
  createSuccessResponse,
  FORWARDED_AUTH_ORGANIZATION_ID_HEADER,
  FORWARDED_AUTH_USER_ID_HEADER,
  parseWithZod,
  REQUEST_ID_HEADER,
  requireAuthenticatedRequestContext,
} from "@workspace/shared";
import { Router } from "express";

import type { SourceCatalogService } from "../catalog/sourceCatalogService.js";
import { validateReportDefinitionBodySchema } from "../schemas/reportComposition.schemas.js";
import { ReportDefinitionService } from "../services/reportDefinitionService.js";
import { getReportingCatalogScope, type ReportingAccessContextClient } from "./reportingContext.js";

export function createReportCatalogRouter(options: {
  sourceCatalog: SourceCatalogService;
  accessContextClient: ReportingAccessContextClient;
}): ReturnType<typeof Router> {
  const router = Router();

  router.post("/definitions/validate", async (request, response) => {
    const userId = request.get(FORWARDED_AUTH_USER_ID_HEADER);
    const organizationId = request.get(FORWARDED_AUTH_ORGANIZATION_ID_HEADER);
    requireAuthenticatedRequestContext({ user_id: userId, organization_id: organizationId });
    const { definition } = parseWithZod(validateReportDefinitionBodySchema, request.body);
    const scope = await getReportingCatalogScope(options.accessContextClient, {
      userId: userId ?? "",
      organizationId: organizationId ?? "",
      requestId: request.get(REQUEST_ID_HEADER) ?? "reports-definition",
    });
    const service = new ReportDefinitionService(options.sourceCatalog);
    if ("version" in definition) service.validateComposition(definition, scope);
    else service.validate(definition, scope);
    response.json(createSuccessResponse({ definition }));
  });

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
