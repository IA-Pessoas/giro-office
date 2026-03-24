import "dotenv/config";

import { createExpressErrorHandler, createSuccessResponse } from "@workspace/shared";
import { createLogger } from "@workspace/shared/logger";
import cors from "cors";
import express from "express";
import "express-async-errors";

import { getTaskServiceEnv } from "./config/env.js";
import { taskDependentRoutes } from "./routes/task-dependent.routes.js";
import { taskModelRoutes } from "./routes/task-model.routes.js";

const env = getTaskServiceEnv();
const logger = createLogger({
  service: "task-service",
  env: env.nodeEnv,
  level: env.logLevel,
  pretty: env.logPretty,
});

const app = express();

app.use(cors());
app.use(express.json());

app.get("/health", (_req, res) => {
  res.status(200).json(createSuccessResponse({ status: "ok", service: "task-service" }));
});

app.use(taskModelRoutes);
app.use(taskDependentRoutes);

app.use(
  createExpressErrorHandler({
    logger,
    event: "task-service.error",
    fallbackMessage: "Erro interno no task-service.",
  }),
);

app.listen(env.port, () => {
  logger.info({ event: "server.start", data: { port: env.port } }, "task-service rodando");
});
