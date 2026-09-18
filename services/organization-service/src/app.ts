import "dotenv/config";
import {
  createExpressErrorHandler,
  createSecurityHeadersMiddleware,
  createServiceCorsOptions,
  createSuccessResponse,
} from "@workspace/shared";
import type { Logger } from "@workspace/shared/logger";
import { mountOpenApiDocs } from "@workspace/shared/openapi";
import cors from "cors";
import express, { type Request, type Response } from "express";
import "express-async-errors";

import type { OrganizationEnv } from "./config/env.js";
import { createOrganizationAudit } from "./integrations/audit.js";
import { requestContext } from "./middlewares/requestContext.js";
import { buildOrganizationServiceOpenApiSpec } from "./openapi/spec.js";
import organizationRoutes from "./routes/organization.routes.js";
import { createPlatformOrganizationRoutes } from "./routes/platformOrganization.routes.js";
import { OrganizationService } from "./services/organizationService.js";

function organizationErrorLogContext(request: Request): Record<string, unknown> | undefined {
  const userId = request.user_id;
  const organizationId = request.organization_id;
  const out: Record<string, unknown> = {};
  if (userId) {
    out.userId = userId;
  }
  if (organizationId) {
    out.organizationId = organizationId;
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

export function createOrganizationApp(env: OrganizationEnv, logger: Logger): express.Express {
  const app = express();
  const organizationAudit = createOrganizationAudit({
    enabled: env.organizationDomainAuditEnabled,
    serviceUrl: env.auditServiceUrl,
    serviceToken: env.auditServiceToken,
    logger,
  });
  const platformOrganizationService = new OrganizationService(organizationAudit);

  app.use(createSecurityHeadersMiddleware({ nodeEnv: env.nodeEnv }));
  app.use(cors(createServiceCorsOptions(env.allowedOrigins, "organization-service")));
  app.use(express.json());
  app.use(requestContext);

  app.get("/health", (_request: Request, response: Response) => {
    response
      .status(200)
      .json(createSuccessResponse({ status: "ok", service: "organization-service" }));
  });

  if (env.enableApiDocs) {
    mountOpenApiDocs(app, {
      spec: buildOrganizationServiceOpenApiSpec(env),
      siteTitle: "organization-service - OpenAPI",
    });
  }

  app.use("/organizations", organizationRoutes);
  app.use("/platform", createPlatformOrganizationRoutes(platformOrganizationService));

  app.use(
    createExpressErrorHandler({
      logger,
      event: "organization-service.error",
      fallbackMessage: "Erro interno no organization-service.",
      getContext: organizationErrorLogContext,
    }),
  );

  return app;
}
