import { createExpressErrorHandler, createSuccessResponse } from "@workspace/shared";
import { mountOpenApiDocs } from "@workspace/shared/http";
import type { Logger } from "@workspace/shared/logger";
import cors from "cors";
import express, { type Express, type Request } from "express";
import "express-async-errors";

import type { TaskServiceEnv } from "./config/env.js";
import { requestContext } from "./middlewares/requestContext.js";
import { taskComercialRoutes } from "./routes/taskComercial.routes.js";
import { taskCrudRoutes } from "./routes/taskCrud.routes.js";
import { taskDependentRoutes } from "./routes/taskDependent.routes.js";
import { taskFinanceiroRoutes } from "./routes/taskFinanceiro.routes.js";
import { taskIntegrationRegularizeRoutes } from "./routes/taskIntegrationRegularize.routes.js";
import { taskLifecycleRoutes } from "./routes/taskLifecycle.routes.js";
import { taskModelRoutes } from "./routes/taskModel.routes.js";
import { buildTaskServiceOpenApiSpec } from "./openapi/spec.js";

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

export function createTaskApp(env: TaskServiceEnv, logger: Logger): Express {
  const app = express();

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

  app.use("/task", taskModelRoutes);
  app.use("/task", taskDependentRoutes);
  app.use("/task", taskIntegrationRegularizeRoutes);
  app.use("/task", taskLifecycleRoutes);
  app.use("/task", taskComercialRoutes);
  app.use("/task", taskFinanceiroRoutes);
  app.use("/task", taskCrudRoutes);

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
