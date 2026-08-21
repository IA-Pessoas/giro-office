import "dotenv/config";

import { createLogger } from "@workspace/shared/logger";

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

const timer = setInterval(() => {
  void prisma;
  logger.debug({ event: "worker.idle" }, "reports-service worker sem jobs pendentes");
}, env.workerPollIntervalMs);

timer.unref();
