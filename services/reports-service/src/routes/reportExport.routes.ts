import {
  FORWARDED_AUTH_ORGANIZATION_ID_HEADER,
  FORWARDED_AUTH_USER_ID_HEADER,
  parseWithZod,
  REQUEST_ID_HEADER,
  requireAuthenticatedRequestContext,
} from "@workspace/shared";
import { Router } from "express";
import { z } from "zod";

import { reportJobIdParamsSchema } from "../schemas/reportJob.schemas.js";
import type { ReportExportService } from "../services/reportExportService.js";

const exportQuerySchema = z.object({ format: z.enum(["csv", "xlsx"]) }).strict();

export function createReportExportRouter(options: {
  exportService: ReportExportService;
}): ReturnType<typeof Router> {
  const router = Router();

  router.get("/snapshots/:id/export", async (request, response) => {
    const userId = request.get(FORWARDED_AUTH_USER_ID_HEADER);
    const organizationId = request.get(FORWARDED_AUTH_ORGANIZATION_ID_HEADER);
    requireAuthenticatedRequestContext({ user_id: userId, organization_id: organizationId });
    const { id } = parseWithZod(reportJobIdParamsSchema, request.params);
    const { format } = parseWithZod(exportQuerySchema, request.query);
    const result = await options.exportService.export({
      snapshotId: id,
      userId: userId ?? "",
      organizationId: organizationId ?? "",
      requestId: request.get(REQUEST_ID_HEADER) ?? "reports-export",
      format,
    });
    response.setHeader("Content-Type", result.contentType);
    response.setHeader("Content-Disposition", `attachment; filename="${result.fileName}"`);
    response.setHeader("Cache-Control", "no-store");
    response.status(200).send(result.body);
  });

  return router;
}
