import "dotenv/config";

import { createLogger } from "@workspace/shared/logger";

import { createProjectApplication } from "./app.js";
import { getProjectServiceEnv } from "./config/env.js";

const env = getProjectServiceEnv();
const logger = createLogger({
  service: "project-service",
  env: env.nodeEnv,
  level: env.logLevel,
  pretty: env.logPretty,
});

const app = createProjectApplication({
  env,
  logger,
});

app.listen(env.port, () => {
  logger.info({ event: "server.start", data: { port: env.port } }, "project-service rodando");
});
