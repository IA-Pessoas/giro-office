import {
  createExpressErrorHandler,
  createSecurityHeadersMiddleware,
  createServiceCorsOptions,
  createSuccessResponse,
} from "@workspace/shared";
import type { Logger } from "@workspace/shared/logger";
import { mountOpenApiDocs } from "@workspace/shared/openapi";
import cors from "cors";
import express, { type Express, type Request } from "express";
import "express-async-errors";

import type { MarketingServiceEnv } from "./config/env.js";
import type { PrismaClient } from "./generated/prisma/client.js";
import { createIsAuthenticatedMiddleware } from "./middlewares/isAuthenticated.js";
import { requestContext } from "./middlewares/requestContext.js";
import { buildMarketingServiceOpenApiSpec } from "./openapi/spec.js";
import {
  createMarketingDashboardRoutes,
  type MarketingDashboardProvider,
} from "./routes/marketingDashboard.routes.js";
import { MarketingDashboardService } from "./services/marketingDashboardService.js";

interface CreateMarketingAppOptions {
  env: MarketingServiceEnv;
  logger: Logger;
  dashboardService?: MarketingDashboardProvider;
  prisma?: PrismaClient;
}

function errorContext(request: Request): Record<string, unknown> {
  return {
    requestId: request.requestId,
    userId: request.user_id,
    organizationId: request.organization_id,
    method: request.method,
    route: request.originalUrl,
  };
}

export function createMarketingApp({
  env,
  logger,
  dashboardService,
  prisma,
}: CreateMarketingAppOptions): Express {
  const app = express();
  const auth = createIsAuthenticatedMiddleware(env);
  const service = dashboardService ?? (prisma ? new MarketingDashboardService(prisma) : null);

  app.use(createSecurityHeadersMiddleware({ nodeEnv: env.nodeEnv }));
  app.use(cors(createServiceCorsOptions(env.allowedOrigins, "marketing-service")));
  app.use(express.json());
  app.use(requestContext);

  app.get("/health", (_request, response) => {
    response
      .status(200)
      .json(createSuccessResponse({ status: "ok", service: "marketing-service" }));
  });

  if (env.enableApiDocs) {
    mountOpenApiDocs(app, {
      spec: buildMarketingServiceOpenApiSpec(env),
      siteTitle: "marketing-service - OpenAPI",
    });
  }

  if (service) {
    app.use("/marketing", createMarketingDashboardRoutes(service, auth));
  }

  app.use(
    createExpressErrorHandler({
      logger,
      event: "marketing-service.error",
      fallbackMessage: "Erro interno no marketing-service.",
      getContext: errorContext,
    }),
  );

  return app;
}
