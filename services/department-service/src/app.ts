import { createExpressErrorHandler, createSuccessResponse } from "@workspace/shared";
import { mountOpenApiDocs } from "@workspace/shared/http";
import type { Logger } from "@workspace/shared/logger";
import cors from "cors";
import express, { type Express, type Request } from "express";
import "express-async-errors";

import type { DepartmentServiceEnv } from "./config/env.js";
import { requestContext } from "./middlewares/requestContext.js";
import { buildDepartmentServiceOpenApiSpec } from "./openapi/spec.js";
import { departmentRoutes } from "./routes/department.routes.js";

function departmentServiceErrorLogContext(request: Request): Record<string, unknown> | undefined {
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

export function createDepartmentApp(env: DepartmentServiceEnv, logger: Logger): Express {
  const app = express();

  app.use(cors());
  app.use(express.json());
  app.use(requestContext);

  app.get("/health", (_req, res) => {
    res.status(200).json(createSuccessResponse({ status: "ok", service: "department-service" }));
  });

  if (env.enableApiDocs) {
    mountOpenApiDocs(app, {
      spec: buildDepartmentServiceOpenApiSpec(env),
      siteTitle: "department-service - OpenAPI",
    });
  }

  app.use(departmentRoutes);

  app.use(
    createExpressErrorHandler({
      logger,
      event: "department-service.error",
      fallbackMessage: "Erro interno no department-service.",
      getContext: departmentServiceErrorLogContext,
    }),
  );

  return app;
}
