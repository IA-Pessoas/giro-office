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

import type { RegularizeServiceEnv } from "./config/env.js";
import type { PrismaClient } from "./generated/prisma/client.js";
import { requestContext } from "./middlewares/requestContext.js";
import { buildRegularizeServiceOpenApiSpec } from "./openapi/spec.js";
import { createRegularizeRoutes } from "./routes/index.js";
import { createRegularizeInternalRoutes } from "./routes/regularizeInternal.routes.js";
import type { RegularizeReconciliationService } from "./services/regularizeReconciliationService.js";

function regularizeServiceErrorLogContext(request: Request): Record<string, unknown> | undefined {
  const userId = request.user_id;
  const organizationId = request.organization_id;
  const permission = request.permission;
  const out: Record<string, unknown> = {};

  if (userId) {
    out.userId = userId;
  }
  if (organizationId) {
    out.organizationId = organizationId;
  }
  if (typeof permission === "number") {
    out.permission = permission;
  }

  return Object.keys(out).length > 0 ? out : undefined;
}

export interface CreateAppOptions {
  env: RegularizeServiceEnv;
  logger: Logger;
  prisma: PrismaClient;
  reconciliationService: RegularizeReconciliationService;
  runReconciliation: () => Promise<Record<string, unknown>>;
  runLicenseNotificationReconciliation: () => Promise<Record<string, unknown>>;
  runClientPfStatusReconciliation: () => Promise<Record<string, unknown>>;
  runClientPfDocumentsReconciliation: () => Promise<Record<string, unknown>>;
}

export function createApp({
  env,
  logger,
  prisma,
  reconciliationService,
  runReconciliation,
  runLicenseNotificationReconciliation,
  runClientPfStatusReconciliation,
  runClientPfDocumentsReconciliation,
}: CreateAppOptions): express.Express {
  const app = express();

  app.use(createSecurityHeadersMiddleware({ nodeEnv: env.nodeEnv }));
  app.use(cors(createServiceCorsOptions(env.allowedOrigins, "regularize-service")));
  app.use(express.json());
  app.use(requestContext);

  app.get("/health", (_request, response) => {
    response.status(200).json(
      createSuccessResponse({
        status: "ok",
        service: "regularize-service",
        env: env.nodeEnv,
      }),
    );
  });

  if (env.enableApiDocs) {
    mountOpenApiDocs(app, {
      spec: buildRegularizeServiceOpenApiSpec(env),
      siteTitle: "regularize-service - OpenAPI",
    });
  }

  app.use(
    "/internal",
    createRegularizeInternalRoutes({
      env,
      runReconciliation,
      runLicenseNotificationReconciliation,
      runClientPfStatusReconciliation,
      runClientPfDocumentsReconciliation,
    }),
  );

  app.use("/regularize", createRegularizeRoutes({ prisma, env, reconciliationService }));

  app.use(
    createExpressErrorHandler({
      logger,
      event: "regularize-service.error",
      fallbackMessage: "Erro interno no regularize-service.",
      getContext: regularizeServiceErrorLogContext,
    }),
  );

  return app;
}
