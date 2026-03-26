import "dotenv/config";
import { createLogger } from "@workspace/shared/logger";
import http from "node:http";

import { createApp } from "./app.js";
import { getRhEnv } from "./config/env.js";

const env = getRhEnv();
const logger = createLogger({
  service: "rh-service",
  env: env.nodeEnv,
  level: env.logLevel,
  pretty: env.logPretty,
});

const app = createApp(logger);
const server = http.createServer(app);

server.listen(env.port, () => {
  logger.info({
    event: "server.start",
    message: "rh-service rodando",
    data: { port: env.port },
  });
});

server.on("error", (err) => {
  logger.error({
    event: "server.error",
    message: "Erro no servidor rh-service",
    err,
  });
});
