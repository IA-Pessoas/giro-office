import "dotenv/config";

import { createLogger } from "@workspace/shared/logger";

import { createUserApp } from "./app.js";
import { getUserServiceEnv } from "./config/env.js";

const env = getUserServiceEnv();
const logger = createLogger({
  service: "user-service",
  env: env.nodeEnv,
  level: env.logLevel,
  pretty: env.logPretty,
});

const app = createUserApp(env, logger);

app.listen(env.port, () => {
  logger.info({ event: "server.start", data: { port: env.port } }, "user-service rodando");
});
