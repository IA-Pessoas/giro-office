import { createServer } from "node:http";

import { createLogger } from "@workspace/shared/logger";

import { createApp } from "./app.js";
import { getAuditServiceEnv } from "./config/env.js";

const env = getAuditServiceEnv();
const logger = createLogger({
  service: "audit-service",
  env: env.nodeEnv,
  level: env.logLevel,
  pretty: env.logPretty,
});
const app = createApp({ env, logger });
const server = createServer(app);

server.listen(env.auditServicePort, () => {
  logger.info({
    event: "server.start",
    message: "Audit service started",
    data: {
      port: env.auditServicePort,
      auditEnabled: env.auditEnabled,
    },
  });
});

server.on("error", (err) => {
  logger.error({
    event: "server.error",
    message: "Audit service server error",
    err,
  });
});
