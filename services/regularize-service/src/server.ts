import "dotenv/config";

import { createLogger } from "@workspace/shared/logger";

import { createApp } from "./app.js";
import { getRegularizeServiceEnv } from "./config/env.js";
import { prismaClient } from "./integrations/prisma.js";

const env = getRegularizeServiceEnv();
const logger = createLogger({
  service: "regularize-service",
  env: env.nodeEnv,
  level: env.logLevel,
  pretty: env.logPretty,
});

async function runReconciliation(): Promise<Record<string, unknown>> {
  return {
    processed: 0,
    message: "Reconciliation runner not wired yet.",
  };
}

const app = createApp({
  env,
  logger,
  prisma: prismaClient,
  runReconciliation,
});

app.listen(env.port, () => {
  logger.info(
    {
      event: "server.start",
      data: { port: env.port },
    },
    "regularize-service em execucao",
  );
});
