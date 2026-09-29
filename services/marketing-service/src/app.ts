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

import { EncryptionService } from "@workspace/shared";
import type { MarketingServiceEnv } from "./config/env.js";
import type { PrismaClient } from "./generated/prisma/client.js";
import { createIsAuthenticatedMiddleware } from "./middlewares/isAuthenticated.js";
import { requestContext } from "./middlewares/requestContext.js";
import { buildMarketingServiceOpenApiSpec } from "./openapi/spec.js";
import {
  createMarketingAiUsageControlRoutes,
  type MarketingAiUsageControlProvider,
} from "./routes/marketingAiUsageControl.routes.js";
import {
  createMarketingDashboardRoutes,
  type MarketingDashboardProvider,
} from "./routes/marketingDashboard.routes.js";
import {
  createMarketingEventEditionsRoutes,
  type MarketingEventEditionsProvider,
} from "./routes/marketingEventEditions.routes.js";
import {
  createMarketingEventsRoutes,
  type MarketingEventsProvider,
} from "./routes/marketingEvents.routes.js";
import {
  createMarketingPasswordRoutes,
  type MarketingPasswordProvider,
} from "./routes/marketingPassword.routes.js";
import { MarketingAiUsageControlService } from "./services/marketingAiUsageControlService.js";
import { MarketingDashboardService } from "./services/marketingDashboardService.js";
import { MarketingEventEditionsService } from "./services/marketingEventEditionsService.js";
import { MarketingEventsService } from "./services/marketingEventsService.js";
import { MarketingPasswordService } from "./services/marketingPasswordService.js";

interface CreateMarketingAppOptions {
  env: MarketingServiceEnv;
  logger: Logger;
  dashboardService?: MarketingDashboardProvider;
  controlService?: MarketingAiUsageControlProvider;
  passwordService?: MarketingPasswordProvider;
  eventsService?: MarketingEventsProvider;
  editionsService?: MarketingEventEditionsProvider;
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
  controlService,
  passwordService,
  eventsService,
  editionsService,
  prisma,
}: CreateMarketingAppOptions): Express {
  const app = express();
  const auth = createIsAuthenticatedMiddleware(env);
  const service = dashboardService ?? (prisma ? new MarketingDashboardService(prisma) : null);
  const controls = controlService ?? (prisma ? new MarketingAiUsageControlService(prisma) : null);
  const passwords =
    passwordService ??
    (prisma
      ? new MarketingPasswordService(prisma, new EncryptionService(env.mtkEncryptionKey))
      : null);
  const marketingEvents = eventsService ?? (prisma ? new MarketingEventsService(prisma) : null);
  const marketingEventEditions =
    editionsService ?? (prisma ? new MarketingEventEditionsService(prisma) : null);

  app.use(createSecurityHeadersMiddleware({ nodeEnv: env.nodeEnv }));
  app.use(cors(createServiceCorsOptions(env.allowedOrigins, "marketing-service")));
  app.use(express.json({ limit: "1mb" }));
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
  if (controls) {
    app.use("/marketing", createMarketingAiUsageControlRoutes(controls, auth));
  }
  if (passwords) {
    app.use("/marketing", createMarketingPasswordRoutes(passwords, auth));
  }
  if (marketingEvents) {
    app.use("/marketing", createMarketingEventsRoutes(marketingEvents, auth));
  }
  if (marketingEventEditions) {
    app.use("/marketing", createMarketingEventEditionsRoutes(marketingEventEditions, auth));
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
