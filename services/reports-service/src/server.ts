import "dotenv/config";

import { createLogger } from "@workspace/shared/logger";

import { createReportsApp } from "./app.js";
import { getReportsServiceEnv } from "./config/env.js";
import { createReportsPrismaClient } from "./prisma/index.js";

const env = getReportsServiceEnv();
const logger = createLogger({
  service: "reports-service",
  env: env.nodeEnv,
  level: env.logLevel,
  pretty: env.logPretty,
});
const prisma = createReportsPrismaClient(env.databaseUrl);
const app = createReportsApp({ env, logger, prisma });

app.listen(env.port, () => {
  logger.info({ event: "server.start", data: { port: env.port } }, "reports-service rodando");
});
