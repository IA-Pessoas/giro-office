import { createExpressErrorHandler, createSuccessResponse } from "@workspace/shared";
import { mountOpenApiDocs } from "@workspace/shared/http";
import type { Logger } from "@workspace/shared/logger";
import cors from "cors";
import express, { type Request } from "express";
import "express-async-errors";

import type { RegularizeServiceEnv } from "./config/env.js";
import { requestContext } from "./middlewares/requestContext.js";
import { requireInternalToken } from "./middlewares/requireInternalToken.js";
import { buildRegularizeServiceOpenApiSpec } from "./openapi/spec.js";
import { createRegularizeRoutes } from "./routes/index.js";
import type { PrismaClient } from "./generated/prisma/client.js";
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

  app.use(cors());
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

  app.post(
    "/internal/reconciliation/run",
    requireInternalToken(env),
    async (_request, response, next) => {
      try {
        const result = await runReconciliation();
        response.json(createSuccessResponse(result));
      } catch (error) {
        next(error);
      }
    },
  );

  app.post(
    "/internal/reconciliation/license-notifications/run",
    requireInternalToken(env),
    async (_request, response, next) => {
      try {
        const result = await runLicenseNotificationReconciliation();
        response.json(createSuccessResponse(result));
      } catch (error) {
        next(error);
      }
    },
  );

  app.post(
    "/internal/reconciliation/client-pf-status/run",
    requireInternalToken(env),
    async (_request, response, next) => {
      try {
        const result = await runClientPfStatusReconciliation();
        response.json(createSuccessResponse(result));
      } catch (error) {
        next(error);
      }
    },
  );

  app.post(
    "/internal/reconciliation/client-pf-documents/run",
    requireInternalToken(env),
    async (_request, response, next) => {
      try {
        const result = await runClientPfDocumentsReconciliation();
        response.json(createSuccessResponse(result));
      } catch (error) {
        next(error);
      }
    },
  );

  app.use(createRegularizeRoutes({ prisma, env, reconciliationService }));

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
