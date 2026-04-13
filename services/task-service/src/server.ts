import "dotenv/config";

import { createLogger } from "@workspace/shared/logger";

import { createTaskApp } from "./app.js";
import { getTaskServiceEnv } from "./config/env.js";

const env = getTaskServiceEnv();
const logger = createLogger({
  service: "task-service",
  env: env.nodeEnv,
  level: env.logLevel,
  pretty: env.logPretty,
});

const app = createTaskApp(env, logger);

app.listen(env.port, () => {
  logger.info({ event: "server.start", data: { port: env.port } }, "task-service rodando");
});
