import "dotenv/config";
import { serverError, serviceStart } from "@workspace/shared";
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

const app = createOrganizationApp(logger);
const server = http.createServer(app);

server.listen(env.port, () => {
  serviceStart({ service: "organization-service", port: env.port });
});

server.on("error", (err) => {
  serverError("Erro no servidor organization-service", err);
});
