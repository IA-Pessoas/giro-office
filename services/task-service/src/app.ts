import { createExpressErrorHandler, createSuccessResponse } from "@workspace/shared";
import { mountOpenApiDocs } from "@workspace/shared/http";
import type { Logger } from "@workspace/shared/logger";
import cors from "cors";
import express, { type Express, type Request } from "express";
import "express-async-errors";

import type { TaskServiceEnv } from "./config/env.js";
import { requestContext } from "./middlewares/requestContext.js";
import {
  createProjectPlanRoutes,
  type ProjectPlanRouteDeps,
} from "./routes/project-plan.routes.js";
import { taskComercialRoutes } from "./routes/task-comercial.routes.js";
import { taskCrudRoutes } from "./routes/task-crud.routes.js";
import { taskDependentRoutes } from "./routes/task-dependent.routes.js";
import { taskFinanceiroRoutes } from "./routes/task-financeiro.routes.js";
import { taskIntegrationRegularizeRoutes } from "./routes/task-integration-regularize.routes.js";
import { taskLifecycleRoutes } from "./routes/task-lifecycle.routes.js";
import { taskModelRoutes } from "./routes/task-model.routes.js";
import { buildTaskServiceOpenApiSpec } from "./openapi/spec.js";
import { ProjectPlanService } from "./services/ProjectPlanService.js";

function taskServiceErrorLogContext(request: Request): Record<string, unknown> | undefined {
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

export function createTaskApp(
  env: TaskServiceEnv,
  logger: Logger,
  options?: {
    projectPlanService?: ProjectPlanRouteDeps;
  },
): Express {
  const app = express();
  const projectPlanService = options?.projectPlanService ?? new ProjectPlanService();

  app.use(cors());
  app.use(express.json());
  app.use(requestContext);

  app.get("/health", (_req, res) => {
    res.status(200).json(createSuccessResponse({ status: "ok", service: "task-service" }));
  });

  if (env.enableApiDocs) {
    mountOpenApiDocs(app, {
      spec: buildTaskServiceOpenApiSpec(env),
      siteTitle: "task-service — OpenAPI",
    });
  }

  app.use(taskModelRoutes);
  app.use(createProjectPlanRoutes(projectPlanService));
  app.use(taskDependentRoutes);
  app.use(taskIntegrationRegularizeRoutes);
  app.use(taskLifecycleRoutes);
  app.use(taskComercialRoutes);
  app.use(taskFinanceiroRoutes);
  app.use(taskCrudRoutes);

  app.use(
    createExpressErrorHandler({
      logger,
      event: "task-service.error",
      fallbackMessage: "Erro interno no task-service.",
      getContext: taskServiceErrorLogContext,
    }),
  );

  return app;
}
