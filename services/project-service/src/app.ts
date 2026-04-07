import "dotenv/config";

import { createExpressErrorHandler, createSuccessResponse } from "@workspace/shared";
import { mountOpenApiDocs } from "@workspace/shared/http";
import { createLogger } from "@workspace/shared/logger";
import cors from "cors";
import express, { type Express, type Request } from "express";
import "express-async-errors";

import { getProjectServiceEnv } from "./config/env.js";
import { requestContext } from "./middlewares/requestContext.js";
import {
  createProjectProgressRoutes,
  type ProjectProgressRouteDeps,
} from "./routes/project-progress.routes.js";
import { buildProjectServiceOpenApiSpec } from "./openapi/spec.js";
import { createProjectCrudRoutes, type ProjectCrudRouteDeps } from "./routes/projectcrud.routes.js";
import { ProjectCrudService } from "./services/ProjectCrudService.js";
import { ProjectProgressService } from "./services/ProjectProgressService.js";

function projectServiceErrorLogContext(request: Request): Record<string, unknown> | undefined {
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

export function createProjectApplication(options?: {
  projectCrudService?: ProjectCrudRouteDeps;
  projectProgressService?: ProjectProgressRouteDeps;
}): {
  app: Express;
  logger: ReturnType<typeof createLogger>;
  port: number;
} {
  const env = getProjectServiceEnv();
  const logger = createLogger({
    service: "project-service",
    env: env.nodeEnv,
    level: env.logLevel,
    pretty: env.logPretty,
  });

  const projectCrudService = options?.projectCrudService ?? new ProjectCrudService();
  const projectProgressService = options?.projectProgressService ?? new ProjectProgressService();

  const app = express();

  app.use(cors());
  app.use(express.json());
  app.use(requestContext);

  app.get("/health", (_req, res) => {
    res.status(200).json(createSuccessResponse({ status: "ok", service: "project-service" }));
  });

  if (env.enableApiDocs) {
    mountOpenApiDocs(app, {
      spec: buildProjectServiceOpenApiSpec(env),
      siteTitle: "project-service — OpenAPI",
    });
  }

  app.use(createProjectCrudRoutes(projectCrudService));
  app.use(createProjectProgressRoutes(projectProgressService));

  app.use(
    createExpressErrorHandler({
      logger,
      event: "project-service.error",
      fallbackMessage: "Erro interno no project-service.",
      getContext: projectServiceErrorLogContext,
    }),
  );

  return { app, logger, port: env.port };
}
