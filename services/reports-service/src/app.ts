import {
  createExpressErrorHandler,
  createSecurityHeadersMiddleware,
  createServiceCorsOptions,
  createSuccessResponse,
} from "@workspace/shared";
import { mountOpenApiDocs } from "@workspace/shared/http";
import type { Logger } from "@workspace/shared/logger";
import cors from "cors";
import express from "express";
import "express-async-errors";

import type { ReportsServiceEnv } from "./config/env.js";
import { buildReportsServiceOpenApiSpec } from "./openapi/spec.js";
import type { ReportsPrismaClient } from "./prisma/index.js";
import { createReportCatalogRouter } from "./routes/reportCatalog.routes.js";

export interface CreateReportsAppOptions {
  env: ReportsServiceEnv;
  logger: Logger;
  prisma: ReportsPrismaClient;
}

export function createReportsApp({
  env,
  logger,
  prisma,
}: CreateReportsAppOptions): express.Express {
  const app = express();

  app.use(createSecurityHeadersMiddleware({ nodeEnv: env.nodeEnv }));
  app.use(cors(createServiceCorsOptions(env.allowedOrigins, "reports-service")));
  app.use(express.json({ limit: "1mb" }));

  app.get("/health", (_request, response) => {
    response.status(200).json(
      createSuccessResponse({
        status: "ok",
        service: "reports-service",
        env: env.nodeEnv,
      }),
    );
  });

  app.get("/ready", async (_request, response) => {
    await prisma.$queryRaw`SELECT 1`;
    response
      .status(200)
      .json(createSuccessResponse({ status: "ready", service: "reports-service" }));
  });

  if (env.enableApiDocs) {
    mountOpenApiDocs(app, {
      spec: buildReportsServiceOpenApiSpec(env),
      siteTitle: "Reports Service - OpenAPI",
    });
  }

  app.use("/reports", createReportCatalogRouter());
  app.use(
    createExpressErrorHandler({
      logger,
      event: "reports-service.error",
      fallbackMessage: "Erro interno no reports-service.",
    }),
  );

  return app;
}
