import "dotenv/config";

import { createLogger } from "@workspace/shared/logger";

import { createApp } from "./app.js";
import { getRegularizeServiceEnv } from "./config/env.js";
import { prismaClient } from "./integrations/prisma.js";
import { RegularizeReconciliationService } from "./services/regularizeReconciliationService.js";
import { startReconciliationScheduler } from "./services/reconciliationScheduler.js";

const env = getRegularizeServiceEnv();
const logger = createLogger({
  service: "regularize-service",
  env: env.nodeEnv,
  level: env.logLevel,
  pretty: env.logPretty,
});

const reconciliationService = new RegularizeReconciliationService(prismaClient);
startReconciliationScheduler(env, logger, reconciliationService);

async function runReconciliation(): Promise<Record<string, unknown>> {
  return reconciliationService.runFullReconciliation();
}

const app = createApp({
  env,
  logger,
  prisma: prismaClient,
  reconciliationService,
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
