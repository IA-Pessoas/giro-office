import {
  createExpressErrorHandler,
  createSecurityHeadersMiddleware,
  createServiceCorsOptions,
  createSuccessResponse,
} from "@workspace/shared";
import { mountOpenApiDocs } from "@workspace/shared/http";
import type { Logger } from "@workspace/shared/logger";
import cors from "cors";
import express, { type Request } from "express";
import "express-async-errors";

import type { TriagemServiceEnv } from "./config/env.js";
import { createTriagemPrismaClient, type TriagemPrismaClient } from "./integrations/prisma.js";
import { requestContext } from "./middlewares/requestContext.js";
import { buildTriagemServiceOpenApiSpec } from "./openapi/spec.js";
import {
  createTriageCatalogRoutes,
  type TriageCatalogRouteDeps,
} from "./routes/triageCatalog.routes.js";
import {
  createTriageCompetenceRoutes,
  type TriageCompetenceRouteDeps,
} from "./routes/triageCompetence.routes.js";
import {
  createTriageExternalLinkRoutes,
  type TriageExternalLinkRouteDeps,
} from "./routes/triageExternalLinks.routes.js";
import {
  createTriageOverviewRoutes,
  type TriageOverviewRouteDeps,
} from "./routes/triageOverview.routes.js";
import {
  createTriageUrgentRequestRoutes,
  type TriageUrgentRequestRouteDeps,
} from "./routes/triageUrgentRequest.routes.js";
import { TriageCatalogService } from "./services/triageCatalogService.js";
import { TriageCompetenceService } from "./services/triageCompetenceService.js";
import { TriageExternalLinkService } from "./services/triageExternalLinkService.js";
import { TriageOverviewService } from "./services/triageOverviewService.js";
import { TriageUrgentRequestService } from "./services/triageUrgentRequestService.js";

function triagemServiceErrorLogContext(request: Request): Record<string, unknown> | undefined {
  const context = request.triagemContext;
  if (!context) {
    return undefined;
  }

  return {
    requestId: context.requestId,
    ...(context.userId ? { userId: context.userId } : {}),
    ...(context.organizationId ? { organizationId: context.organizationId } : {}),
  };
}

export interface CreateTriagemAppOptions {
  env: TriagemServiceEnv;
  logger: Logger;
  prisma?: TriagemPrismaClient;
  triageCompetenceRouteDeps?: TriageCompetenceRouteDeps;
  triageExternalLinkRouteDeps?: TriageExternalLinkRouteDeps;
  triageCatalogRouteDeps?: TriageCatalogRouteDeps;
  triageUrgentRequestRouteDeps?: TriageUrgentRequestRouteDeps;
  triageOverviewRouteDeps?: TriageOverviewRouteDeps;
}

export function createTriagemApp({
  env,
  logger,
  prisma = createTriagemPrismaClient(env.databaseUrl),
  triageCompetenceRouteDeps,
  triageExternalLinkRouteDeps,
  triageCatalogRouteDeps,
  triageUrgentRequestRouteDeps,
  triageOverviewRouteDeps,
}: CreateTriagemAppOptions): express.Express {
  const app = express();
  const catalogService = new TriageCatalogService(prisma);
  const competenceService = new TriageCompetenceService(
    prisma,
    undefined,
    (transaction, organizationId, competenceId) =>
      catalogService.snapshotForCompetence(organizationId, competenceId, transaction),
  );
  const externalLinkService = new TriageExternalLinkService(prisma);
  const urgentRequestService = new TriageUrgentRequestService(prisma);
  const overviewService = new TriageOverviewService(prisma);

  app.set("trust proxy", true);
  app.use(createSecurityHeadersMiddleware({ nodeEnv: env.nodeEnv }));
  app.use(cors(createServiceCorsOptions(env.allowedOrigins, "triagem-service")));
  app.use(express.json({ limit: "1mb" }));
  app.use(requestContext);

  app.get("/health", (_request, response) => {
    response
      .status(200)
      .json(createSuccessResponse({ status: "ok", service: "triagem-service", env: env.nodeEnv }));
  });

  app.get("/ready", async (_request, response) => {
    await prisma.$queryRaw`SELECT 1`;
    response
      .status(200)
      .json(createSuccessResponse({ status: "ready", service: "triagem-service" }));
  });

  if (env.enableApiDocs) {
    mountOpenApiDocs(app, {
      spec: buildTriagemServiceOpenApiSpec(env),
      siteTitle: "triagem-service - OpenAPI",
    });
  }

  app.use("/triagem", createTriageCompetenceRoutes(triageCompetenceRouteDeps ?? competenceService));
  app.use(
    "/triagem",
    createTriageExternalLinkRoutes(triageExternalLinkRouteDeps ?? externalLinkService),
  );
  app.use("/triagem", createTriageCatalogRoutes(triageCatalogRouteDeps ?? catalogService));
  app.use(
    "/triagem",
    createTriageUrgentRequestRoutes(triageUrgentRequestRouteDeps ?? urgentRequestService),
  );
  app.use("/triagem", createTriageOverviewRoutes(triageOverviewRouteDeps ?? overviewService));
  app.use(
    createExpressErrorHandler({
      logger,
      event: "triagem-service.error",
      fallbackMessage: "Erro interno no triagem-service.",
      getContext: triagemServiceErrorLogContext,
    }),
  );

  return app;
}
