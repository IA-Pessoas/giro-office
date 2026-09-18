import {
  createExpressErrorHandler,
  createRateLimitMiddleware,
  createSecurityHeadersMiddleware,
  createServiceCorsOptions,
  createSuccessResponse,
} from "@workspace/shared";
import type { Logger } from "@workspace/shared/logger";
import { mountOpenApiDocs } from "@workspace/shared/openapi";
import cors from "cors";
import express, { type Request } from "express";
import "express-async-errors";

import type { ClientServiceEnv } from "./config/env.js";
import type { PrismaClient } from "./generated/prisma/client.js";
import { requestContext } from "./middlewares/requestContext.js";
import { requireInternalToken } from "./middlewares/requireInternalToken.js";
import { buildClientServiceOpenApiSpec } from "./openapi/spec.js";
import { createClientRouter } from "./routes/client.routes.js";
import {
  createInternalCommercialRouter,
  type InternalCommercialRouteDeps,
} from "./routes/internalCommercial.routes.js";
import { createInternalReportingRouter } from "./routes/internalReporting.routes.js";
import { ClientCommercialProjectionService } from "./services/clientCommercialProjectionService.js";
import { ClientIntegrationReportingService } from "./services/clientIntegrationReportingService.js";
import type { IClientService } from "./services/clientService.js";
import { runCompetenceOutputUpdate } from "./services/competenceOutputRoutineService.js";
import type { HistoryFileStorage } from "./services/historyStorageService.js";

function clientServiceErrorLogContext(request: Request): Record<string, unknown> | undefined {
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

export interface CreateAppOptions {
  clientService: IClientService;
  prisma: PrismaClient;
  env: ClientServiceEnv;
  logger: Logger;
  historyStorage: HistoryFileStorage;
  commercialProjectionService?: InternalCommercialRouteDeps;
}

export function createApp({
  clientService,
  prisma,
  env,
  logger,
  historyStorage,
  commercialProjectionService,
}: CreateAppOptions): express.Express {
  const app = express();

  app.use(createSecurityHeadersMiddleware({ nodeEnv: env.nodeEnv }));
  app.use(cors(createServiceCorsOptions(env.allowedOrigins, "client-service")));
  app.use(express.json());
  app.use(requestContext);

  app.get("/health", (_request, response) => {
    response.status(200).json(
      createSuccessResponse({
        status: "ok",
        service: "client-service",
        env: env.nodeEnv,
      }),
    );
  });

  app.get("/ready", (_request, response) => {
    response.status(200).json(
      createSuccessResponse({
        status: "ready",
        service: "client-service",
      }),
    );
  });

  if (env.enableApiDocs) {
    mountOpenApiDocs(app, {
      spec: buildClientServiceOpenApiSpec(env),
      siteTitle: "client-service - OpenAPI",
    });
  }

  app.post(
    "/internal/competence-output-update",
    requireInternalToken(env),
    async (_request, response, next) => {
      try {
        const result = await runCompetenceOutputUpdate(prisma);
        response.json(createSuccessResponse(result));
      } catch (err) {
        next(err);
      }
    },
  );

  app.use(
    "/internal",
    createInternalCommercialRouter(
      commercialProjectionService ?? new ClientCommercialProjectionService(prisma),
      requireInternalToken(env),
    ),
  );

  app.use(
    "/internal",
    createInternalReportingRouter({
      env,
      reportingService: new ClientIntegrationReportingService(prisma),
    }),
  );

  app.use(
    "/client",
    createClientRouter({
      clientService,
      prisma,
      historyStorage,
      historyUploadRateLimit: createRateLimitMiddleware({
        key: "client-service:history-upload",
        max: env.uploadRateLimitMax,
        windowMs: env.uploadRateLimitWindowMs,
        methods: ["POST"],
      }),
    }),
  );

  app.use(
    createExpressErrorHandler({
      logger,
      event: "client-service.error",
      fallbackMessage: "Erro interno no client-service.",
      getContext: clientServiceErrorLogContext,
    }),
  );

  return app;
}
