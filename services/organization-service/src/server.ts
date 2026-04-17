import "dotenv/config";
import { createLogger } from "@workspace/shared/logger";
import http from "node:http";

import { createOrganizationApp } from "./app.js";
import { getOrganizationEnv } from "./config/env.js";

const env = getOrganizationEnv();
const logger = createLogger({
  service: "organization-service",
  env: env.nodeEnv,
  level: env.logLevel,
  pretty: env.logPretty,
});

const app = createOrganizationApp(env, logger);
const server = http.createServer(app);

server.listen(env.port, () => {
  logger.info({
    event: "server.start",
    message: "organization-service rodando",
    data: { port: env.port },
  });
});

server.on("error", (err) => {
  logger.error({
    event: "server.error",
    message: "Erro no servidor organization-service",
    err,
  });
});
