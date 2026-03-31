import "dotenv/config";

import { createExpressErrorHandler, createSuccessResponse } from "@workspace/shared";
import { createLogger } from "@workspace/shared/logger";
import cors from "cors";
import express, { type Express } from "express";
import "express-async-errors";

import { getProjectServiceEnv } from "./config/env.js";
import { createProjectCrudRoutes, type ProjectCrudRouteDeps } from "./routes/projectcrud.routes.js";
import { ProjectCrudService } from "./services/ProjectCrudService.js";

export function createProjectApplication(options?: { projectCrudService?: ProjectCrudRouteDeps }): {
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

  const app = express();

  app.use(cors());
  app.use(express.json());

  app.get("/health", (_req, res) => {
    res.status(200).json(createSuccessResponse({ status: "ok", service: "project-service" }));
  });

  app.use(createProjectCrudRoutes(projectCrudService));

  app.use(
    createExpressErrorHandler({
      logger,
      event: "project-service.error",
      fallbackMessage: "Erro interno no project-service.",
    }),
  );

  return { app, logger, port: env.port };
}
