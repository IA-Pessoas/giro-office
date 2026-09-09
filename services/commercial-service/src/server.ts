import "dotenv/config";

import http from "node:http";
import { serverError, serviceStart } from "@workspace/shared";
import { createLogger } from "@workspace/shared/logger";

import { createCommercialApp } from "./app.js";
import { getCommercialServiceEnv } from "./config/env.js";

const env = getCommercialServiceEnv();
const logger = createLogger({
  service: "commercial-service",
  env: env.nodeEnv,
  level: env.logLevel,
  pretty: env.logPretty,
});
const server = http.createServer(createCommercialApp({ env, logger }));

server.listen(env.port, () => serviceStart({ service: "commercial-service", port: env.port }));
server.on("error", (error) => serverError("Erro no servidor commercial-service", error));
