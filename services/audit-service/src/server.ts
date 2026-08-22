import { createServer } from "node:http";

import { createLogger } from "@workspace/shared";

import { createApp } from "./app.js";
import { getAuditServiceEnv } from "./config/env.js";
import { disconnectPrismaClient } from "./integrations/prisma/prismaClient.js";

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

let shuttingDown = false;

async function shutdown(signal: NodeJS.Signals): Promise<void> {
  if (shuttingDown) {
    return;
  }
  shuttingDown = true;
  logger.info({ event: "server.shutdown", message: "Audit service stopping", signal });

  server.close(async (error) => {
    try {
      await disconnectPrismaClient();
    } catch (disconnectError) {
      logger.error({
        event: "database.disconnect.failed",
        message: "Audit database disconnect failed",
        err: disconnectError,
      });
      process.exitCode = 1;
    }

    if (error) {
      logger.error({ event: "server.close.failed", message: "Audit server close failed", error });
      process.exitCode = 1;
    }
  });
}

process.once("SIGTERM", () => void shutdown("SIGTERM"));
process.once("SIGINT", () => void shutdown("SIGINT"));
