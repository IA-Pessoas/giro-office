import {
  createExpressErrorHandler,
  createSecurityHeadersMiddleware,
  createServiceCorsOptions,
  createSuccessResponse,
} from "@workspace/shared";
import { mountOpenApiDocs } from "@workspace/shared/http";
import type { Logger } from "@workspace/shared/logger";
import cors from "cors";
import express, { type Express, type Request } from "express";
import "express-async-errors";

import type { CommercialServiceEnv } from "./config/env.js";
import { requestContext } from "./middlewares/requestContext.js";
import { buildCommercialServiceOpenApiSpec } from "./openapi/spec.js";
import {
  type CommercialOutboxRouteDeps,
  createCommercialOutboxRoutes,
} from "./routes/outbox.routes.js";
import {
  type CommercialProposalConfigRouteDeps,
  createProposalConfigRoutes,
} from "./routes/proposalConfig.routes.js";
import {
  type CommercialProspectingRouteDeps,
  createProspectingRoutes,
} from "./routes/prospecting.routes.js";
import {
  type CommercialTaskBillingRouteDeps,
  createTaskBillingRoutes,
} from "./routes/taskBilling.routes.js";
import { CommercialOutboxStatusService } from "./services/commercialOutboxStatusService.js";
import { CommercialProposalConfigService } from "./services/proposalConfigService.js";
import { CommercialProspectingService } from "./services/prospectingService.js";
import { CommercialTaskBillingService } from "./services/taskBillingService.js";

interface CreateCommercialAppOptions {
  env: CommercialServiceEnv;
  logger: Logger;
  proposalConfigService?: CommercialProposalConfigRouteDeps;
  prospectingService?: CommercialProspectingRouteDeps;
  taskBillingService?: CommercialTaskBillingRouteDeps;
  outboxStatusService?: CommercialOutboxRouteDeps;
}

function errorContext(request: Request): Record<string, unknown> | undefined {
  const context = { userId: request.user_id, organizationId: request.organization_id };
  return context.userId || context.organizationId ? context : undefined;
}

export function createCommercialApp(options: CreateCommercialAppOptions): Express {
  const { env, logger } = options;
  const service = options.proposalConfigService ?? new CommercialProposalConfigService();
  const prospectingService = options.prospectingService ?? new CommercialProspectingService();
  const taskBillingService = options.taskBillingService ?? new CommercialTaskBillingService();
  const outboxStatusService = options.outboxStatusService ?? new CommercialOutboxStatusService();
  const app = express();

  app.use(createSecurityHeadersMiddleware({ nodeEnv: env.nodeEnv }));
  app.use(cors(createServiceCorsOptions(env.allowedOrigins, "commercial-service")));
  app.use(express.json());
  app.use(requestContext);

  app.get("/health", (_request, response) => {
    response
      .status(200)
      .json(createSuccessResponse({ status: "ok", service: "commercial-service" }));
  });

  if (env.enableApiDocs) {
    mountOpenApiDocs(app, {
      spec: buildCommercialServiceOpenApiSpec(env),
      siteTitle: "commercial-service - OpenAPI",
    });
  }

  app.use("/commercial/proposal-configs", createProposalConfigRoutes(service));
  app.use("/commercial/prospecting", createProspectingRoutes(prospectingService));
  app.use("/commercial/task-billing", createTaskBillingRoutes(taskBillingService));
  app.use("/commercial/outbox", createCommercialOutboxRoutes(outboxStatusService));
  app.use(
    createExpressErrorHandler({
      logger,
      event: "commercial-service.error",
      fallbackMessage: "Erro interno no commercial-service.",
      getContext: errorContext,
    }),
  );

  return app;
}
