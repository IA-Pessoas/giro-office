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

import type { DepartmentServiceEnv } from "./config/env.js";
import { requestContext } from "./middlewares/requestContext.js";
import { buildDepartmentServiceOpenApiSpec } from "./openapi/spec.js";
import { createDepartmentRoutes, type DepartmentRouteDeps } from "./routes/department.routes.js";
import { DepartmentService } from "./services/departmentService.js";

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

interface CreateDepartmentAppOptions {
  env: DepartmentServiceEnv;
  logger: Logger;
  departmentService?: DepartmentRouteDeps;
}

export function createDepartmentApp(options: CreateDepartmentAppOptions): Express {
  const { env, logger } = options;
  const departmentService = options.departmentService ?? new DepartmentService();
  const app = express();

  app.use(createSecurityHeadersMiddleware({ nodeEnv: env.nodeEnv }));
  app.use(cors(createServiceCorsOptions(env.allowedOrigins, "department-service")));
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

  app.use("/department", createDepartmentRoutes(departmentService));

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
