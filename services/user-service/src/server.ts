import "dotenv/config";

import { createLogger } from "@workspace/shared/logger";

import { createUserApp } from "./app.js";
import { getUserServiceEnv } from "./config/env.js";
import { createUserAudit } from "./integrations/audit.js";

const env = getUserServiceEnv();
const logger = createLogger({
  service: "user-service",
  env: env.nodeEnv,
  level: env.logLevel,
  pretty: env.logPretty,
});

const audit = createUserAudit({
  enabled: env.auditEnabled,
  serviceUrl: env.auditServiceUrl,
  serviceToken: env.auditServiceToken,
  logger,
});

const app = createUserApp(env, logger, { audit });

app.listen(env.port, () => {
  logger.info({ event: "server.start", data: { port: env.port } }, "user-service rodando");
});
