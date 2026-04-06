import "dotenv/config";
import { createExpressErrorHandler, createSuccessResponse } from "@workspace/shared";
import { mountOpenApiDocs } from "@workspace/shared/http";
import type { Logger } from "@workspace/shared/logger";
import cors from "cors";
import express, { type Request, type Response } from "express";
import "express-async-errors";

import type { OrganizationEnv } from "./config/env.js";
import { requestContext } from "./middlewares/requestContext.js";
import { buildOrganizationServiceOpenApiSpec } from "./openapi/spec.js";
import organizationRoutes from "./routes/organization.routes.js";

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

  app.use(cors());
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

  app.use(organizationRoutes);

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
