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
  createTriageCompetenceRoutes,
  type TriageCompetenceRouteDeps,
} from "./routes/triageCompetence.routes.js";
import { TriageCompetenceService } from "./services/triageCompetenceService.js";

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
}

export function createTriagemApp({
  env,
  logger,
  prisma = createTriagemPrismaClient(env.databaseUrl),
  triageCompetenceRouteDeps,
}: CreateTriagemAppOptions): express.Express {
  const app = express();
  const competenceService = new TriageCompetenceService(prisma);

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
    createExpressErrorHandler({
      logger,
      event: "triagem-service.error",
      fallbackMessage: "Erro interno no triagem-service.",
      getContext: triagemServiceErrorLogContext,
    }),
  );

  return app;
}
