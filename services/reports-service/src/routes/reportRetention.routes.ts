import {
  createSuccessResponse,
  FORWARDED_AUTH_ORGANIZATION_ID_HEADER,
  FORWARDED_AUTH_USER_ID_HEADER,
  parseWithZod,
  requireAuthenticatedRequestContext,
  ServiceError,
} from "@workspace/shared";
import { type Request, Router } from "express";
import { reportRetentionPolicySchema } from "../schemas/reportRetention.schemas.js";
import type { ReportRetentionService } from "../services/reportRetentionService.js";
import {
  getReportingAccessContext,
  type ReportingAccessContextClient,
} from "./reportingContext.js";

function getContext(request: Request): { userId: string; organizationId: string } {
  const userId = request.get(FORWARDED_AUTH_USER_ID_HEADER);
  const organizationId = request.get(FORWARDED_AUTH_ORGANIZATION_ID_HEADER);
  requireAuthenticatedRequestContext({ user_id: userId, organization_id: organizationId });
  return { userId: userId ?? "", organizationId: organizationId ?? "" };
}

async function requireOwner(
  accessContextClient: ReportingAccessContextClient,
  request: Request,
  context: { userId: string; organizationId: string },
): Promise<void> {
  const access = await getReportingAccessContext(accessContextClient, {
    ...context,
    requestId: request.get("x-request-id") ?? "reports-retention",
  });
  if (access.type !== "owner") {
    throw new ServiceError(403, "Somente o owner pode alterar a retenção dos relatórios.");
  }
}

export function createReportRetentionRouter(options: {
  retentionService: ReportRetentionService;
  accessContextClient: ReportingAccessContextClient;
}): ReturnType<typeof Router> {
  const router = Router();

  router.get("/retention", async (request, response) => {
    const context = getContext(request);
    await requireOwner(options.accessContextClient, request, context);
    response.json(
      createSuccessResponse(await options.retentionService.getOrganizationPolicy(context)),
    );
  });

  router.put("/retention", async (request, response) => {
    const context = getContext(request);
    await requireOwner(options.accessContextClient, request, context);
    const body = parseWithZod(
      reportRetentionPolicySchema.omit({ organization_id: true }),
      request.body,
    );
    response.json(
      createSuccessResponse(
        await options.retentionService.updateOrganizationPolicy({
          organizationId: context.organizationId,
          retentionDays: body.retention_days,
        }),
      ),
    );
  });

  return router;
}
