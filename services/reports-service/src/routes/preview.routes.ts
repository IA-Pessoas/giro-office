import {
  createSuccessResponse,
  FORWARDED_AUTH_ORGANIZATION_ID_HEADER,
  FORWARDED_AUTH_USER_ID_HEADER,
  parseWithZod,
  REQUEST_ID_HEADER,
  requireAuthenticatedRequestContext,
} from "@workspace/shared";
import { Router } from "express";

import { reportPreviewRequestSchema } from "../schemas/reportPreview.schemas.js";
import type { ReportPreviewService } from "../services/reportPreviewService.js";
import { getReportingCatalogScope, type ReportingAccessContextClient } from "./reportingContext.js";

export function createReportPreviewRouter(options: {
  previewService: ReportPreviewService;
  accessContextClient: ReportingAccessContextClient;
}): ReturnType<typeof Router> {
  const router = Router();

  router.post("/preview", async (request, response) => {
    const userId = request.get(FORWARDED_AUTH_USER_ID_HEADER);
    const organizationId = request.get(FORWARDED_AUTH_ORGANIZATION_ID_HEADER);
    requireAuthenticatedRequestContext({
      user_id: userId,
      organization_id: organizationId,
    });
    const body = parseWithZod(reportPreviewRequestSchema, request.body);
    const scope = await getReportingCatalogScope(options.accessContextClient, {
      userId: userId ?? "",
      organizationId: organizationId ?? "",
      requestId: request.get(REQUEST_ID_HEADER) ?? "reports-preview",
    });

    response.json(
      createSuccessResponse(await options.previewService.preview(body.definition, scope)),
    );
  });

  return router;
}
