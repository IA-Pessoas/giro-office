import { createExpressErrorHandler, createSuccessResponse } from "@workspace/shared";
import { mountOpenApiDocs } from "@workspace/shared/http";
import type { Logger } from "@workspace/shared/logger";
import cors from "cors";
import express, { type Express } from "express";
import "express-async-errors";

import type { TaskServiceEnv } from "./config/env.js";
import { buildTaskServiceOpenApiSpec } from "./openapi/spec.js";
import { taskComercialRoutes } from "./routes/task-comercial.routes.js";
import { taskCrudRoutes } from "./routes/task-crud.routes.js";
import { taskDependentRoutes } from "./routes/task-dependent.routes.js";
import { taskFinanceiroRoutes } from "./routes/task-financeiro.routes.js";
import { taskIntegrationRegularizeRoutes } from "./routes/task-integration-regularize.routes.js";
import { taskLifecycleRoutes } from "./routes/task-lifecycle.routes.js";
import { taskModelRoutes } from "./routes/task-model.routes.js";

export function createTaskApp(env: TaskServiceEnv, logger: Logger): Express {
  const app = express();

  app.use(cors());
  app.use(express.json());

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
    }),
  );

  return app;
}
