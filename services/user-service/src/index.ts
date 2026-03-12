import "dotenv/config";

import { createExpressErrorHandler, createSuccessResponse } from "@workspace/shared";
import { createLogger } from "@workspace/shared/logger";
import cors from "cors";
import express from "express";
import "express-async-errors";

import { getUserServiceEnv } from "./config/env.js";
import { authRoutes } from "./routes/auth.routes.js";
import { userRoutes } from "./routes/user.routes.js";

const env = getUserServiceEnv();
const logger = createLogger({
  service: "user-service",
  env: env.nodeEnv,
  level: env.logLevel,
  pretty: env.logPretty,
});

const app = express();

app.use(cors());
app.use(express.json());

app.get("/health", (_req, res) => {
  res.status(200).json(createSuccessResponse({ status: "ok", service: "user-service" }));
});

app.use(authRoutes);
app.use("/users", userRoutes);

app.use(
  createExpressErrorHandler({
    logger,
    event: "user-service.error",
    fallbackMessage: "Erro interno no user-service.",
  }),
);

app.listen(env.port, () => {
  logger.info({ event: "server.start", data: { port: env.port } }, "user-service rodando");
});
