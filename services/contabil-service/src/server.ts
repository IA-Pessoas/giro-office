import "dotenv/config";

import { createLogger } from "@workspace/shared/logger";

import { createContabilApp } from "./app.js";
import { getContabilServiceEnv } from "./config/env.js";

const env = getContabilServiceEnv();
const logger = createLogger({
  service: "contabil-service",
  env: env.nodeEnv,
  level: env.logLevel,
  pretty: env.logPretty,
});

const app = createContabilApp({ env, logger });

app.listen(env.port, () => {
  logger.info({ event: "server.start", data: { port: env.port } }, "contabil-service rodando");
});
