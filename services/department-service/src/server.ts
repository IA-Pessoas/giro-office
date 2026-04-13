import "dotenv/config";

import http from "node:http";
import { serverError, serviceStart } from "@workspace/shared";
import { createLogger } from "@workspace/shared/logger";

import { createDepartmentApp } from "./app.js";
import { getDepartmentServiceEnv } from "./config/env.js";

const env = getDepartmentServiceEnv();
const logger = createLogger({
  service: "department-service",
  env: env.nodeEnv,
  level: env.logLevel,
  pretty: env.logPretty,
});

const app = createDepartmentApp(env, logger);
const server = http.createServer(app);

server.listen(env.port, () => {
  serviceStart({ service: "department-service", port: env.port });
});

server.on("error", (err) => {
  serverError("Erro no servidor department-service", err);
});
